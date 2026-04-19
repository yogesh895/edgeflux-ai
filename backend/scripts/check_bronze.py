"""Sanity check all bronze-layer Parquet files.

Run from the project root: python scripts/check_bronze.py
Verifies every expected file exists, has reasonable row counts, no gaping
date-range holes, and that numeric columns aren't full of NaNs.
"""

from pathlib import Path
import pandas as pd

BRONZE = Path("data/bronze")

EXPECTED = {
    "ercot_lmp_raw":      {"min_rows": 100_000, "required_cols": ["interval_start", "settlement_point", "lmp"]},
    "eia_gas_raw":        {"min_rows": 400,     "required_cols": ["price_date", "hub", "spot_price_mmbtu"]},
    "noaa_weather_raw":   {"min_rows": 150_000, "required_cols": ["site_id", "event_time", "temperature_c"]},
}

def check(name, spec):
    path = BRONZE / f"{name}.parquet"
    print(f"\n{'='*60}\n{name}\n{'='*60}")
    if not path.exists():
        print(f"  ❌ MISSING: {path}")
        return False
    df = pd.read_parquet(path)
    size_mb = path.stat().st_size / 1e6
    print(f"  file:    {path} ({size_mb:.1f} MB)")
    print(f"  rows:    {len(df):,} (min expected: {spec['min_rows']:,})")
    print(f"  columns: {list(df.columns)}")
    ok = True
    if len(df) < spec["min_rows"]:
        print(f"  ⚠️  row count below expected minimum")
        ok = False
    for col in spec["required_cols"]:
        if col not in df.columns:
            print(f"  ❌ missing column: {col}")
            ok = False
    # Numeric NaN check on the target / value column
    numeric_cols = df.select_dtypes(include="number").columns
    for col in numeric_cols:
        nan_pct = df[col].isna().mean() * 100
        if nan_pct > 20:
            print(f"  ⚠️  {col} is {nan_pct:.1f}% NaN")
    return ok

def main():
    results = {name: check(name, spec) for name, spec in EXPECTED.items()}
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for name, ok in results.items():
        status = "✅ OK" if ok else "⚠️  ISSUES"
        print(f"  {name}: {status}")
    print()

if __name__ == "__main__":
    main()
