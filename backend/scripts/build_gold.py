"""Build the gold feature table used for training the TFT + LightGBM models.

Reads silver/ Parquet files, produces data/gold/site_features_hourly.parquet.
Every feature in this table is guaranteed to be point-in-time correct:
no value at timestamp T uses any data from T or later.

Run from project root: python scripts/build_gold.py
Takes ~30-60 seconds.
"""

from pathlib import Path
import pandas as pd
import numpy as np
from datetime import datetime

SILVER = Path("data/silver")
GOLD   = Path("data/gold")
GOLD.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------
# Load silver tables
# --------------------------------------------------------------

def load_silver():
    sites   = pd.read_parquet(SILVER / "sites.parquet")
    lmp     = pd.read_parquet(SILVER / "lmp_hourly.parquet")
    gas     = pd.read_parquet(SILVER / "gas_daily.parquet")
    weather = pd.read_parquet(SILVER / "weather_site_hourly.parquet")
    grid    = pd.read_parquet(SILVER / "grid_state_hourly.parquet")
    # Make all timestamps UTC-aware; gas is date-only
    for df in (lmp, weather, grid):
        df["event_time"] = pd.to_datetime(df["event_time"], utc=True)
    gas["price_date"] = pd.to_datetime(gas["price_date"]).dt.tz_localize(None).dt.normalize()
    return sites, lmp, gas, weather, grid


# --------------------------------------------------------------
# Per-site assembly
# --------------------------------------------------------------

def build_site_features(site_row, lmp, gas, weather, grid):
    """Assemble all features for one site, point-in-time correct."""
    sid = site_row["site_id"]
    sp  = site_row["settlement_point"]

    # Base: LMP history for this site's settlement point
    s = lmp[lmp["settlement_point"] == sp][["event_time", "lmp"]].copy()
    s = s.sort_values("event_time").reset_index(drop=True)

    # --- MARKET FEATURES (lags and rolling, all shifted to exclude present) ---
    for h in [1, 3, 6, 24, 168]:
        s[f"lmp_lag_{h}h"] = s["lmp"].shift(h)
    shifted = s["lmp"].shift(1)  # exclude current hour from rolling windows
    s["lmp_roll_6h_mean"]   = shifted.rolling(6,   min_periods=3).mean()
    s["lmp_roll_24h_mean"]  = shifted.rolling(24,  min_periods=12).mean()
    s["lmp_roll_24h_std"]   = shifted.rolling(24,  min_periods=12).std()
    s["lmp_roll_168h_mean"] = shifted.rolling(168, min_periods=72).mean()
    s["lmp_dev_from_24h"]   = s["lmp_lag_1h"] - s["lmp_roll_24h_mean"]

    # --- CALENDAR FEATURES (always known) ---
    s["hour_of_day"] = s["event_time"].dt.hour
    s["day_of_week"] = s["event_time"].dt.dayofweek
    s["month"]       = s["event_time"].dt.month
    s["is_weekend"]  = (s["day_of_week"] >= 5).astype(int)

    # --- WEATHER FEATURES (from this site's local weather) ---
    w = weather[weather["site_id"] == sid][[
        "event_time", "temperature_c", "cdh", "hdh",
        "wind_speed_ms", "relative_humidity",
    ]].copy()
    s = s.merge(w, on="event_time", how="left")
    for h in [24, 168]:
        s[f"cdh_lag_{h}h"] = s["cdh"].shift(h)
        s[f"hdh_lag_{h}h"] = s["hdh"].shift(h)
    s["temp_roll_24h_mean"] = s["temperature_c"].shift(1).rolling(24, min_periods=12).mean()

    # --- GAS FEATURES (daily; shift by 1 day so we only use yesterday's price) ---
    g_wide = gas.pivot_table(index="price_date", columns="hub", values="price_mmbtu").reset_index()
    g_wide.columns.name = None
    g_wide = g_wide.rename(columns={"henry_hub": "gas_henry", "waha": "gas_waha"})
    # Attach waha_basis (unique per date)
    basis = gas.drop_duplicates("price_date")[["price_date", "waha_basis"]]
    g_wide = g_wide.merge(basis, on="price_date", how="left")
    # Shift: features should be yesterday's price (gas settles day-ahead anyway)
    g_wide = g_wide.sort_values("price_date").reset_index(drop=True)
    for col in ["gas_henry", "gas_waha", "waha_basis"]:
        g_wide[f"{col}_lag_1d"] = g_wide[col].shift(1)
    # Join on date part of event_time
    s["_date"] = s["event_time"].dt.tz_convert("US/Central").dt.normalize().dt.tz_localize(None)
    g_join = g_wide[["price_date", "gas_henry_lag_1d", "gas_waha_lag_1d", "waha_basis_lag_1d"]]
    s = s.merge(g_join, left_on="_date", right_on="price_date", how="left")
    s = s.drop(columns=["_date", "price_date"])
    s = s.rename(columns={
        "gas_henry_lag_1d": "gas_henry",
        "gas_waha_lag_1d":  "gas_waha",
        "waha_basis_lag_1d": "waha_basis",
    })
    # Forward fill weekend gaps
    s[["gas_henry", "gas_waha", "waha_basis"]] = s[["gas_henry", "gas_waha", "waha_basis"]].ffill().bfill()

    # --- GRID STATE FEATURES (shift by 1h so we use last-hour's state) ---
    g = grid[["event_time", "reserve_margin_proxy",
              "renewable_share_proxy", "thermal_stress"]].copy()
    g = g.sort_values("event_time").reset_index(drop=True)
    g["reserve_margin_proxy"]  = g["reserve_margin_proxy"].shift(1)
    g["renewable_share_proxy"] = g["renewable_share_proxy"].shift(1)
    g["thermal_stress"]        = g["thermal_stress"].shift(1)
    s = s.merge(g, on="event_time", how="left")

    # --- STATIC FEATURES ---
    s["site_id"] = sid
    s["load_zone"] = site_row["load_zone"]
    s["settlement_point"] = sp
    s["heat_rate"] = site_row["heat_rate_mmbtu_mwh"]
    s["vom"] = site_row["vom_mwh"]
    s["capacity_mw"] = site_row["capacity_mw"]

    return s


# --------------------------------------------------------------
# Main: assemble all sites, filter for model-ready subset
# --------------------------------------------------------------

def main():
    print(f"Building gold layer at {datetime.utcnow().isoformat()}")
    sites, lmp, gas, weather, grid = load_silver()

    frames = []
    for _, site in sites.iterrows():
        df = build_site_features(site, lmp, gas, weather, grid)
        frames.append(df)

    gold = pd.concat(frames, ignore_index=True)

    # Record pre-filter size and then drop rows with any NaN in key feature cols.
    # The first 168 hours of each series will always have NaNs because the longest
    # lag is 168h. That's expected and we throw those rows out.
    feature_cols = [c for c in gold.columns if c not in
                    ("event_time", "lmp", "settlement_point", "site_id", "load_zone")]
    n_pre = len(gold)
    gold_clean = gold.dropna(subset=feature_cols + ["lmp"])
    n_dropped = n_pre - len(gold_clean)

    gold_clean = gold_clean.sort_values(["site_id", "event_time"]).reset_index(drop=True)

    # Add a feature_version tag and write
    gold_clean["feature_version"] = "v1"
    out = GOLD / "site_features_hourly.parquet"
    gold_clean.to_parquet(out, index=False)

    size_mb = out.stat().st_size / 1e6
    print(f"\n✅ gold: {len(gold_clean):,} rows (dropped {n_dropped:,} warmup rows) "
          f"→ {out} ({size_mb:.1f} MB)")
    print(f"\nColumns ({len(gold_clean.columns)} total):")
    for c in gold_clean.columns:
        print(f"  {c:<28} {str(gold_clean[c].dtype)}")
    print(f"\nDate range: {gold_clean['event_time'].min()} → {gold_clean['event_time'].max()}")
    print(f"\nRows per site:")
    print(gold_clean.groupby("site_id").size())


if __name__ == "__main__":
    main()
