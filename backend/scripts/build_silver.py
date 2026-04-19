"""Build the silver layer from bronze Parquet files.

Produces five files in data/silver/:
  - sites.parquet               (12-site registry, static)
  - lmp_hourly.parquet          (UTC-normalized, gap-interpolated)
  - gas_daily.parquet           (Henry Hub + synthesized Waha series)
  - weather_site_hourly.parquet (with derived cdh/hdh, gaps imputed)
  - grid_state_hourly.parquet   (regime-classifier inputs from proxies)

Run from project root: python scripts/build_silver.py
Takes ~1-2 minutes.
"""

from pathlib import Path
from datetime import datetime
import pandas as pd
import numpy as np

BRONZE = Path("data/bronze")
SILVER = Path("data/silver")
SILVER.mkdir(parents=True, exist_ok=True)

# -----------------------------------------------------------
# 1. Site registry — static table, assigns each site its LMP settlement point
# -----------------------------------------------------------

SITES = [
    # (id, display_name, load_zone, settlement_point, lat, lon,
    #  capacity_mw, heat_rate_mmbtu_mwh, vom_mwh)
    ("s01", "Permian West A",   "WEST",    "HB_WEST",    31.85, -102.37, 300, 7.1, 3.50),
    ("s02", "Permian West B",   "WEST",    "HB_WEST",    32.01, -102.10, 250, 7.4, 3.80),
    ("s03", "Midland Ridge",    "WEST",    "LZ_WEST",    32.00, -102.08, 400, 6.9, 3.40),
    ("s04", "Laredo South",     "SOUTH",   "LZ_SOUTH",   27.51,  -99.50, 200, 7.6, 3.90),
    ("s05", "San Antonio East", "SOUTH",   "HB_SOUTH",   29.45,  -98.30, 350, 7.2, 3.60),
    ("s06", "Houston Energy",   "HOUSTON", "LZ_HOUSTON", 29.76,  -95.37, 500, 7.0, 3.50),
    ("s07", "Houston Ship Ch.", "HOUSTON", "HB_HOUSTON", 29.72,  -95.02, 450, 6.8, 3.40),
    ("s08", "DFW North",        "NORTH",   "LZ_NORTH",   33.20,  -96.50, 600, 7.3, 3.70),
    ("s09", "DFW Industrial",   "NORTH",   "HB_NORTH",   32.85,  -96.80, 350, 7.5, 3.85),
    ("s10", "Waco Central",     "NORTH",   "LZ_NORTH",   31.55,  -97.13, 300, 7.4, 3.75),
    ("s11", "Corpus Gulf",      "SOUTH",   "LZ_SOUTH",   27.80,  -97.40, 250, 7.2, 3.65),
    ("s12", "El Paso Ridge",    "WEST",    "HB_WEST",    31.78, -106.42, 200, 7.6, 3.95),
]

def build_sites():
    df = pd.DataFrame(SITES, columns=[
        "site_id", "display_name", "load_zone", "settlement_point",
        "latitude", "longitude", "capacity_mw", "heat_rate_mmbtu_mwh", "vom_mwh",
    ])
    out = SILVER / "sites.parquet"
    df.to_parquet(out, index=False)
    print(f"✅ sites: {len(df)} rows → {out}")
    return df


# -----------------------------------------------------------
# 2. LMP hourly — normalize to UTC, enforce full hourly grid, interpolate gaps
# -----------------------------------------------------------

def build_lmp_hourly():
    df = pd.read_parquet(BRONZE / "ercot_lmp_raw.parquet")
    df["interval_start"] = pd.to_datetime(df["interval_start"], utc=True)
    df = df[["interval_start", "settlement_point", "lmp"]].copy()

    # Enforce full hourly grid per settlement point
    locs = df["settlement_point"].unique()
    full_range = pd.date_range(
        df["interval_start"].min(),
        df["interval_start"].max(),
        freq="h",
        tz="UTC",
    )
    frames = []
    total_gap_hours = 0
    for loc in locs:
        sub = df[df["settlement_point"] == loc].set_index("interval_start").sort_index()
        sub = sub[~sub.index.duplicated(keep="last")]
        reindexed = sub.reindex(full_range)
        n_gaps = reindexed["lmp"].isna().sum()
        total_gap_hours += n_gaps
        # Interpolate gaps up to 3 hours; anything longer we forward-fill
        reindexed["lmp_interpolated"] = reindexed["lmp"].isna()
        reindexed["lmp"] = reindexed["lmp"].interpolate(method="time", limit=3)
        reindexed["lmp"] = reindexed["lmp"].ffill().bfill()
        reindexed["settlement_point"] = loc
        reindexed.index.name = "event_time"
        frames.append(reindexed.reset_index())

    out = pd.concat(frames, ignore_index=True)
    out = out.sort_values(["settlement_point", "event_time"]).reset_index(drop=True)
    out_path = SILVER / "lmp_hourly.parquet"
    out.to_parquet(out_path, index=False)
    print(f"✅ lmp_hourly: {len(out):,} rows, {total_gap_hours:,} interpolated → {out_path}")
    return out


# -----------------------------------------------------------
# 3. Gas daily — Henry Hub + synthesized Waha basis
# -----------------------------------------------------------

def build_gas_daily():
    gas = pd.read_parquet(BRONZE / "eia_gas_raw.parquet")
    gas["price_date"] = pd.to_datetime(gas["price_date"])
    gas = gas.rename(columns={"spot_price_mmbtu": "price"})

    # Pivot to wide: one column per hub
    wide = gas.pivot_table(index="price_date", columns="hub", values="price", aggfunc="first")

    # Enforce full daily date range (forward-fill weekends)
    full = pd.date_range(wide.index.min(), wide.index.max(), freq="D")
    wide = wide.reindex(full).ffill().bfill()
    wide.index.name = "price_date"
    wide = wide.reset_index()

    # Synthesize Waha: Henry Hub minus seasonal basis.
    # Waha trades at a discount because Permian gas is stranded. The discount
    # widens in shoulder months (low demand) and tightens in winter. This is
    # a simple seasonal model; a production system would use a real daily feed.
    doy = wide["price_date"].dt.dayofyear
    base_discount = 0.80
    seasonal_amplitude = 0.60
    # Peak discount around day 120 (late April), smallest around day 15 (mid-Jan)
    wide["waha_basis"] = base_discount + seasonal_amplitude * np.sin(
        2 * np.pi * (doy - 15) / 365
    )
    wide["waha"] = np.maximum(wide["henry_hub"] - wide["waha_basis"], 0.10)

    # Long format for easier downstream use
    out = wide.melt(
        id_vars=["price_date", "waha_basis"],
        value_vars=["henry_hub", "waha"],
        var_name="hub",
        value_name="price_mmbtu",
    ).sort_values(["hub", "price_date"]).reset_index(drop=True)

    out_path = SILVER / "gas_daily.parquet"
    out.to_parquet(out_path, index=False)
    print(f"✅ gas_daily: {len(out):,} rows → {out_path}")
    return out


# -----------------------------------------------------------
# 4. Weather — normalize, interpolate, derive CDH/HDH
# -----------------------------------------------------------

def build_weather_hourly():
    w = pd.read_parquet(BRONZE / "noaa_weather_raw.parquet")
    w["event_time"] = pd.to_datetime(w["event_time"], utc=True)

    # Per-site hourly grid enforcement
    sites = w["site_id"].unique()
    full_range = pd.date_range(
        w["event_time"].min(),
        w["event_time"].max(),
        freq="h",
        tz="UTC",
    )
    frames = []
    for sid in sites:
        sub = w[w["site_id"] == sid].set_index("event_time").sort_index()
        sub = sub[~sub.index.duplicated(keep="last")]
        reindexed = sub.reindex(full_range)
        # Only interpolate the numeric weather columns
        num_cols = ["temperature_c", "wind_speed_ms", "wind_direction_deg",
                    "precipitation_mm", "relative_humidity", "pressure_hpa"]
        num_cols = [c for c in num_cols if c in reindexed.columns]
        reindexed[num_cols] = reindexed[num_cols].interpolate(method="time", limit=6).ffill().bfill()
        reindexed["site_id"] = sid
        reindexed.index.name = "event_time"
        frames.append(reindexed.reset_index())

    w = pd.concat(frames, ignore_index=True)

    # Derived features: cooling and heating degree hours (base 18.3°C ≈ 65°F)
    base = 18.3
    w["cdh"] = np.maximum(w["temperature_c"] - base, 0)
    w["hdh"] = np.maximum(base - w["temperature_c"], 0)

    # Dry out unneeded cols for the silver layer
    keep = ["event_time", "site_id", "temperature_c", "wind_speed_ms",
            "wind_direction_deg", "precipitation_mm", "relative_humidity",
            "pressure_hpa", "cdh", "hdh"]
    keep = [c for c in keep if c in w.columns]
    w = w[keep].sort_values(["site_id", "event_time"]).reset_index(drop=True)

    out_path = SILVER / "weather_site_hourly.parquet"
    w.to_parquet(out_path, index=False)
    print(f"✅ weather_site_hourly: {len(w):,} rows → {out_path}")
    return w


# -----------------------------------------------------------
# 5. Grid state hourly — synthesized regime-classifier inputs
# -----------------------------------------------------------

def build_grid_state(lmp_df, weather_df):
    """Derive grid-state features without fuel mix.

    reserve_margin_proxy: inverse rank of system-wide LMP dispersion
    renewable_share_proxy: seasonal model + wind proxy
    thermal_stress: load-weighted CDH+HDH across all sites
    """
    # System-wide hourly LMP mean and std across our 8 hubs/zones
    lmp_wide = lmp_df.pivot_table(index="event_time", columns="settlement_point",
                                  values="lmp", aggfunc="mean")
    sys_mean = lmp_wide.mean(axis=1).rename("sys_lmp_mean")
    sys_std  = lmp_wide.std(axis=1).rename("sys_lmp_std")

    grid = pd.concat([sys_mean, sys_std], axis=1).reset_index()

    # reserve_margin_proxy: higher when system LMP is low relative to rolling median.
    # When LMP >> rolling median, reserves are tight.
    roll_median = grid["sys_lmp_mean"].rolling(24*7, min_periods=24).median()
    grid["reserve_margin_proxy"] = 1.0 / (
        1.0 + np.exp((grid["sys_lmp_mean"] - roll_median) / 30.0)
    )
    grid["reserve_margin_proxy"] = grid["reserve_margin_proxy"].clip(0.05, 0.95)

    # renewable_share_proxy: calendar model (wind higher at night and spring, solar midday)
    hour = grid["event_time"].dt.hour
    doy = grid["event_time"].dt.dayofyear
    wind_component = 0.25 + 0.10 * np.sin(2 * np.pi * (hour - 22) / 24) \
                     + 0.08 * np.sin(2 * np.pi * (doy - 90) / 365)
    solar_component = 0.12 * np.maximum(np.sin(np.pi * (hour - 6) / 12), 0)
    grid["renewable_share_proxy"] = (wind_component + solar_component).clip(0.05, 0.80)

    # thermal_stress: weather-driven, averaged across all 12 sites
    w_agg = (weather_df.groupby("event_time")[["cdh", "hdh"]]
             .mean()
             .rename(columns={"cdh": "avg_cdh", "hdh": "avg_hdh"})
             .reset_index())
    grid = grid.merge(w_agg, on="event_time", how="left")
    grid["thermal_stress"] = grid["avg_cdh"] + 0.7 * grid["avg_hdh"]
    grid[["avg_cdh", "avg_hdh", "thermal_stress"]] = (
        grid[["avg_cdh", "avg_hdh", "thermal_stress"]].ffill().bfill()
    )

    out_path = SILVER / "grid_state_hourly.parquet"
    grid.to_parquet(out_path, index=False)
    print(f"✅ grid_state_hourly: {len(grid):,} rows → {out_path}")
    return grid


# -----------------------------------------------------------
# Main
# -----------------------------------------------------------

def main():
    print(f"Building silver layer at {datetime.utcnow().isoformat()}")
    build_sites()
    lmp = build_lmp_hourly()
    build_gas_daily()
    weather = build_weather_hourly()
    build_grid_state(lmp, weather)
    print("\nAll silver tables written.")


if __name__ == "__main__":
    main()
