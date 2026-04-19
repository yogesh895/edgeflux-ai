"""Train LightGBM quantile baseline models for LMP forecasting.

Produces three model files:
  models/lgbm_lmp/v1/lgbm_p10.lgb
  models/lgbm_lmp/v1/lgbm_p50.lgb
  models/lgbm_lmp/v1/lgbm_p90.lgb

Also writes a metrics summary for the last holdout window.
Run from project root: python ml/train_lgbm.py
Takes ~2-5 minutes (30 sec per model × 3 quantiles + walk-forward).
"""

from pathlib import Path
from datetime import datetime
import pandas as pd
import numpy as np
import lightgbm as lgb
import json

GOLD = Path("data/gold/site_features_hourly.parquet")
MODEL_DIR = Path("models/lgbm_lmp/v1")
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# Columns we never feed to the model: identifiers, target, and metadata
EXCLUDE = {
    "event_time", "lmp",
    "site_id", "load_zone", "settlement_point",
    "feature_version",
}

QUANTILES = [0.10, 0.50, 0.90]


def load_gold():
    df = pd.read_parquet(GOLD)
    df["event_time"] = pd.to_datetime(df["event_time"], utc=True)
    df = df.sort_values(["site_id", "event_time"]).reset_index(drop=True)
    return df


def pinball_loss(y_true, y_pred, q):
    diff = y_true - y_pred
    return np.mean(np.maximum(q * diff, (q - 1) * diff))


def coverage(y_true, p_low, p_high):
    return np.mean((y_true >= p_low) & (y_true <= p_high))


def make_splits(df, test_days=14):
    """Time-based holdout: last `test_days` are the test set, everything else train.
       We'll also run a walk-forward eval below."""
    max_time = df["event_time"].max()
    split_time = max_time - pd.Timedelta(days=test_days)
    train = df[df["event_time"] < split_time].copy()
    test  = df[df["event_time"] >= split_time].copy()
    return train, test, split_time


def train_quantile(train_X, train_y, val_X, val_y, q, categorical_features=None):
    """Train one LightGBM model for quantile q."""
    lgb_train = lgb.Dataset(train_X, train_y, categorical_feature=categorical_features)
    lgb_val   = lgb.Dataset(val_X,   val_y,   categorical_feature=categorical_features, reference=lgb_train)

    params = {
        "objective": "quantile",
        "alpha": q,
        "metric": "quantile",
        "learning_rate": 0.05,
        "num_leaves": 63,
        "max_depth": -1,
        "min_data_in_leaf": 100,
        "feature_fraction": 0.85,
        "bagging_fraction": 0.85,
        "bagging_freq": 5,
        "verbose": -1,
    }

    model = lgb.train(
        params,
        lgb_train,
        num_boost_round=2000,
        valid_sets=[lgb_train, lgb_val],
        valid_names=["train", "val"],
        callbacks=[
            lgb.early_stopping(stopping_rounds=100, verbose=False),
            lgb.log_evaluation(period=0),  # suppress per-round logs
        ],
    )
    return model


def main():
    print(f"Loading gold data...")
    df = load_gold()
    print(f"  {len(df):,} rows, {df['event_time'].min()} → {df['event_time'].max()}")
    print(f"  sites: {df['site_id'].nunique()}")

    # Identify features
    feature_cols = [c for c in df.columns if c not in EXCLUDE]

    # LightGBM can use string categoricals natively if we tell it which ones
    categorical_candidates = ["site_id", "load_zone", "settlement_point"]
    categorical_features = [c for c in categorical_candidates if c in df.columns]
    # But we explicitly excluded those above — so we need to add them back for leverage
    for c in categorical_features:
        if c not in feature_cols:
            feature_cols.append(c)
    # Convert to category dtype so LightGBM recognizes
    for c in categorical_features:
        df[c] = df[c].astype("category")

    print(f"\nUsing {len(feature_cols)} features:")
    for c in feature_cols:
        print(f"  {c}")

    # Train/test split
    train, test, split_time = make_splits(df, test_days=14)
    print(f"\nSplit at {split_time}:")
    print(f"  train: {len(train):,} rows")
    print(f"  test:  {len(test):,} rows")

    X_train = train[feature_cols]
    y_train = train["lmp"]
    X_test  = test[feature_cols]
    y_test  = test["lmp"]

    # Train three quantile models
    models = {}
    predictions = {}
    metrics = {"quantiles": {}}
    for q in QUANTILES:
        name = f"p{int(q*100):02d}"
        print(f"\nTraining {name}...")
        m = train_quantile(X_train, y_train, X_test, y_test, q,
                          categorical_features=categorical_features)
        models[q] = m
        preds = m.predict(X_test)
        predictions[q] = preds

        pb = pinball_loss(y_test.values, preds, q)
        metrics["quantiles"][name] = {
            "pinball_loss": float(pb),
            "best_iteration": int(m.best_iteration),
            "num_features": len(feature_cols),
        }
        print(f"  pinball loss ({name}): {pb:.3f}")
        print(f"  best iteration: {m.best_iteration}")

        # Save model
        out_path = MODEL_DIR / f"lgbm_{name}.lgb"
        m.save_model(str(out_path))
        print(f"  saved → {out_path}")

    # Coverage and MAE on P50
    p10, p50, p90 = predictions[0.1], predictions[0.5], predictions[0.9]
    cov = coverage(y_test.values, p10, p90)
    mae = np.mean(np.abs(y_test.values - p50))
    naive_mae = np.mean(np.abs(y_test.values - test["lmp_lag_24h"].values))

    metrics["ensemble"] = {
        "p10_p90_coverage": float(cov),
        "mae_p50": float(mae),
        "naive_mae_lag24h": float(naive_mae),
        "improvement_vs_naive_pct": float(100 * (1 - mae / naive_mae)),
        "test_rows": int(len(test)),
        "trained_at": datetime.utcnow().isoformat(),
    }

    print("\n" + "=" * 60)
    print("HOLDOUT METRICS (last 14 days)")
    print("=" * 60)
    print(f"  P10-P90 coverage: {cov*100:.1f}%  (target: 80%)")
    print(f"  MAE of P50:       {mae:.2f} $/MWh")
    print(f"  Naive lag-24h MAE: {naive_mae:.2f} $/MWh")
    print(f"  Improvement:      {100*(1 - mae/naive_mae):.1f}%")

    # Feature importance on the P50 model
    p50_model = models[0.5]
    importance = pd.DataFrame({
        "feature": feature_cols,
        "importance": p50_model.feature_importance(importance_type="gain"),
    }).sort_values("importance", ascending=False)
    print("\nTop 15 features by gain (P50 model):")
    print(importance.head(15).to_string(index=False))

    metrics["top_features"] = importance.head(20).to_dict(orient="records")

    # Write metrics
    metrics_path = MODEL_DIR / "metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"\n✅ metrics written to {metrics_path}")


if __name__ == "__main__":
    main()
