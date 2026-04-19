"""Compute per-site SHAP attributions on the LightGBM P50 model.

Writes models/lgbm_lmp/v1/shap_per_site.json with top-10 feature attributions
for each of the 12 sites' most recent forecast hour.

Uses TreeExplainer which is O(TL) where T=trees and L=leaves, meaning it's
fast on our LightGBM (< 1 sec for 12 sites).

Run from project root: python ml/compute_shap.py
"""

from pathlib import Path
from datetime import datetime
import json
import numpy as np
import pandas as pd
import lightgbm as lgb
import shap

GOLD = Path("data/gold/site_features_hourly.parquet")
LGBM_DIR = Path("models/lgbm_lmp/v1")
OUT = LGBM_DIR / "shap_per_site.json"

EXCLUDE = {"event_time", "lmp", "feature_version"}

# Feature family map — groups raw feature names into UI families
FAMILY_MAP = [
    ("lmp", "market"),
    ("gas", "market"),
    ("waha", "market"),
    ("heat_rate", "market"),
    ("vom", "market"),
    ("capacity", "market"),
    ("cdh", "weather"),
    ("hdh", "weather"),
    ("temp", "weather"),
    ("wind", "weather"),
    ("humidity", "weather"),
    ("pressure", "weather"),
    ("precipitation", "weather"),
    ("reserve", "grid"),
    ("renewable", "grid"),
    ("thermal_stress", "grid"),
    ("sys_lmp", "grid"),
    ("hour", "calendar"),
    ("day", "calendar"),
    ("month", "calendar"),
    ("weekend", "calendar"),
    ("site_id", "market"),
    ("load_zone", "market"),
    ("settlement_point", "market"),
]


def feature_family(name: str) -> str:
    for key, fam in FAMILY_MAP:
        if key in name.lower():
            return fam
    return "market"


def pretty_feature(name: str) -> str:
    """Make feature names UI-friendly."""
    replacements = {
        "lmp_lag_1h": "LMP 1h ago",
        "lmp_lag_3h": "LMP 3h ago",
        "lmp_lag_6h": "LMP 6h ago",
        "lmp_lag_24h": "LMP yesterday",
        "lmp_lag_168h": "LMP last week",
        "lmp_roll_6h_mean": "LMP 6h avg",
        "lmp_roll_24h_mean": "LMP 24h avg",
        "lmp_roll_24h_std": "LMP volatility (24h)",
        "lmp_roll_168h_mean": "LMP weekly avg",
        "lmp_dev_from_24h": "LMP vs 24h avg",
        "hour_of_day": "Hour of day",
        "day_of_week": "Day of week",
        "is_weekend": "Weekend",
        "month": "Month",
        "temperature_c": "Temperature",
        "cdh": "Cooling demand",
        "hdh": "Heating demand",
        "cdh_lag_24h": "Cooling demand yesterday",
        "hdh_lag_24h": "Heating demand yesterday",
        "wind_speed_ms": "Wind speed",
        "relative_humidity": "Humidity",
        "gas_henry": "Henry Hub gas",
        "gas_waha": "Waha gas",
        "waha_basis": "Waha basis",
        "reserve_margin_proxy": "Reserve margin",
        "renewable_share_proxy": "Renewable share",
        "thermal_stress": "Thermal stress",
        "heat_rate": "Heat rate",
        "vom": "Variable O&M",
        "capacity_mw": "Capacity",
        "site_id": "Site identity",
        "load_zone": "Load zone",
        "settlement_point": "Settlement point",
    }
    return replacements.get(name, name)


def main():
    print(f"Computing SHAP at {datetime.utcnow().isoformat()}")

    # Load gold data and booster
    df = pd.read_parquet(GOLD)
    df["event_time"] = pd.to_datetime(df["event_time"], utc=True)
    df = df.sort_values(["site_id", "event_time"]).reset_index(drop=True)
    for c in ["site_id", "load_zone", "settlement_point"]:
        if c in df.columns:
            df[c] = df[c].astype("category")

    feature_cols = [c for c in df.columns if c not in EXCLUDE]

    booster = lgb.Booster(model_file=str(LGBM_DIR / "lgbm_p50.lgb"))
    print("  Loaded booster, building TreeExplainer...")
    explainer = shap.TreeExplainer(booster)

    # For each site, pick the most recent row and compute SHAP
    sites = df["site_id"].cat.categories.tolist()
    results = {}

    for sid in sites:
        latest_row = df[df["site_id"] == sid].sort_values("event_time").tail(1)
        if latest_row.empty:
            continue

        X = latest_row[feature_cols]
        shap_values = explainer.shap_values(X)
        if isinstance(shap_values, list):
            shap_values = shap_values[0]

        contributions = shap_values[0]  # single row

        # Rank by absolute contribution, keep top 10
        pairs = []
        for i, feat in enumerate(feature_cols):
            pairs.append({
                "feature_raw": feat,
                "feature": pretty_feature(feat),
                "family": feature_family(feat),
                "contribution": float(contributions[i]),
            })
        pairs.sort(key=lambda p: abs(p["contribution"]), reverse=True)
        top10 = pairs[:10]

        # Record the base value (expected output) and the final prediction
        base_value = float(explainer.expected_value)
        if isinstance(explainer.expected_value, np.ndarray):
            base_value = float(explainer.expected_value[0])
        prediction = float(booster.predict(X)[0])

        results[sid] = {
            "site_id": sid,
            "base_value": base_value,
            "prediction": prediction,
            "forecast_time": latest_row["event_time"].iloc[0].isoformat(),
            "features": top10,
            "explainer": "tree_shap",
            "model_version": "lgbm_v1",
        }
        print(f"  {sid}: top feature = {top10[0]['feature']} "
              f"(contribution {top10[0]['contribution']:+.2f})")

    with open(OUT, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n✅ wrote SHAP values for {len(results)} sites → {OUT}")


if __name__ == "__main__":
    main()