"""Verify silver layer tables are well-formed and aligned."""
from pathlib import Path
import pandas as pd

SILVER = Path("data/silver")

def show(name, df):
    print(f"\n{name}: {len(df):,} rows")
    print(f"  columns: {list(df.columns)}")
    if "event_time" in df.columns:
        print(f"  date range: {df['event_time'].min()} → {df['event_time'].max()}")
    if "price_date" in df.columns:
        print(f"  date range: {df['price_date'].min()} → {df['price_date'].max()}")
    print(f"  NaN counts: {df.isna().sum().to_dict()}")

for name in ["sites", "lmp_hourly", "gas_daily", "weather_site_hourly", "grid_state_hourly"]:
    p = SILVER / f"{name}.parquet"
    if not p.exists():
        print(f"❌ {name}: MISSING")
        continue
    df = pd.read_parquet(p)
    show(name, df)
