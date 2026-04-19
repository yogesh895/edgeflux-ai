"""Walk-forward backtest of the LightGBM P50 baseline.

Slides a train/test window across the full dataset monthly and records
MAE, pinball loss, and regime-conditional performance.

Run from project root: python ml/walk_forward.py
Takes ~8-12 minutes (16 windows × ~30s each).
"""

from pathlib import Path
from datetime import datetime
import pandas as pd
import numpy as np
import lightgbm as lgb
import json

GOLD = Path("data/gold/site_features_hourly.parquet")
OUT_DIR = Path("models/lgbm_lmp/v1")
OUT_DIR.mkdir(parents=True, exist_ok=True)

EXCLUDE = {"event_time", "lmp", "site_id", "load_zone", "settlement_point",
           "feature_version"}

CATEGORICAL = ["site_id", "load_zone", "settlement_point"]


def pinball(y_true, y_pred, q):
    diff = y_true - y_pred
    return np.mean(np.maximum(q * diff, (q - 1) * diff))


def train_p50(X_train, y_train, X_val, y_val, cat_features):
    ds_train = lgb.Dataset(X_train, y_train, categorical_feature=cat_features)
    ds_val   = lgb.Dataset(X_val,   y_val,   categorical_feature=cat_features, reference=ds_train)
    params = {
        "objective": "quantile", "alpha": 0.5, "metric": "quantile",
        "learning_rate": 0.05, "num_leaves": 63,
        "min_data_in_leaf": 100,
        "feature_fraction": 0.85, "bagging_fraction": 0.85, "bagging_freq": 5,
        "verbose": -1,
    }
    return lgb.train(
        params, ds_train, num_boost_round=1000,
        valid_sets=[ds_val], valid_names=["val"],
        callbacks=[lgb.early_stopping(stopping_rounds=50, verbose=False),
                   lgb.log_evaluation(period=0)],
    )


def evaluate_window(df, cursor, eval_days, feature_cols, cat_features):
    train = df[df["event_time"] < cursor]
    test_end = cursor + pd.Timedelta(days=eval_days)
    test = df[(df["event_time"] >= cursor) & (df["event_time"] < test_end)]
    if len(test) == 0:
        return None

    X_train = train[feature_cols]
    y_train = train["lmp"]
    X_test  = test[feature_cols]
    y_test  = test["lmp"]

    model = train_p50(X_train, y_train, X_test, y_test, cat_features)
    preds = model.predict(X_test)

    # Metrics
    mae     = float(np.mean(np.abs(y_test.values - preds)))
    rmse    = float(np.sqrt(np.mean((y_test.values - preds) ** 2)))
    pinball_p50 = float(pinball(y_test.values, preds, 0.5))
    naive_mae = float(np.mean(np.abs(y_test.values - test["lmp_lag_24h"].values)))
    test_std = float(y_test.std())
    test_mean = float(y_test.mean())

    # Regime-conditional: volatile = test std > 30 $/MWh
    volatile = test_std > 30.0

    return {
        "cursor": cursor.isoformat(),
        "n_train": int(len(train)),
        "n_test": int(len(test)),
        "best_iter": int(model.best_iteration),
        "mae": mae,
        "rmse": rmse,
        "pinball_p50": pinball_p50,
        "naive_mae_lag24h": naive_mae,
        "improvement_pct": float(100 * (1 - mae / naive_mae)) if naive_mae > 0 else None,
        "test_lmp_mean": test_mean,
        "test_lmp_std": test_std,
        "regime": "volatile" if volatile else "calm",
        "n_spikes_over_100": int((y_test > 100).sum()),
    }


def main():
    print(f"Loading gold at {datetime.utcnow().isoformat()}")
    df = pd.read_parquet(GOLD)
    df["event_time"] = pd.to_datetime(df["event_time"], utc=True)
    df = df.sort_values(["site_id", "event_time"]).reset_index(drop=True)

    feature_cols = [c for c in df.columns if c not in EXCLUDE]
    cat_features = [c for c in CATEGORICAL if c in df.columns]
    for c in cat_features:
        if c not in feature_cols:
            feature_cols.append(c)
        df[c] = df[c].astype("category")

    print(f"  {len(df):,} rows, {df['event_time'].min()} → {df['event_time'].max()}")

    start = pd.Timestamp("2024-09-01", tz="UTC")
    end   = df["event_time"].max() - pd.Timedelta(days=7)
    cursors = pd.date_range(start, end, freq="30D")
    print(f"\nWalk-forward with {len(cursors)} monthly windows (7-day eval each)")

    results = []
    for i, cursor in enumerate(cursors):
        print(f"\nWindow {i+1}/{len(cursors)}: cursor={cursor.date()}")
        r = evaluate_window(df, cursor, eval_days=7,
                            feature_cols=feature_cols, cat_features=cat_features)
        if r:
            print(f"  MAE={r['mae']:.2f}  naive={r['naive_mae_lag24h']:.2f}  "
                  f"improvement={r['improvement_pct']:.1f}%  "
                  f"regime={r['regime']}  n_spikes={r['n_spikes_over_100']}")
            results.append(r)

    # Summary
    all_df = pd.DataFrame(results)
    out_path = OUT_DIR / "walk_forward_results.csv"
    all_df.to_csv(out_path, index=False)

    print("\n" + "=" * 72)
    print("WALK-FORWARD SUMMARY")
    print("=" * 72)
    print(f"Total windows:         {len(all_df)}")
    print(f"Overall MAE:           {all_df['mae'].mean():.2f} $/MWh "
          f"(± {all_df['mae'].std():.2f})")
    print(f"Overall naive MAE:     {all_df['naive_mae_lag24h'].mean():.2f} $/MWh")
    print(f"Overall improvement:   {all_df['improvement_pct'].mean():.1f}% "
          f"(± {all_df['improvement_pct'].std():.1f}%)")
    print(f"Windows beating naive: {(all_df['improvement_pct'] > 0).sum()}/{len(all_df)}")

    print("\nBy regime:")
    regime_agg = all_df.groupby("regime").agg(
        n_windows=("mae", "size"),
        mae_mean=("mae", "mean"),
        naive_mae_mean=("naive_mae_lag24h", "mean"),
        improvement_mean=("improvement_pct", "mean"),
    ).round(2)
    print(regime_agg.to_string())

    summary = {
        "trained_at": datetime.utcnow().isoformat(),
        "n_windows": len(all_df),
        "overall_mae": float(all_df["mae"].mean()),
        "overall_mae_std": float(all_df["mae"].std()),
        "overall_naive_mae": float(all_df["naive_mae_lag24h"].mean()),
        "overall_improvement_pct": float(all_df["improvement_pct"].mean()),
        "windows_beating_naive": int((all_df["improvement_pct"] > 0).sum()),
        "by_regime": regime_agg.to_dict(orient="index"),
    }
    with open(OUT_DIR / "walk_forward_summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    print(f"\n✅ detail saved to {out_path}")
    print(f"✅ summary saved to {OUT_DIR / 'walk_forward_summary.json'}")


if __name__ == "__main__":
    main()
