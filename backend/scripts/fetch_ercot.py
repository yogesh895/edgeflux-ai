"""Fetch 2 years of ERCOT Day-Ahead Market hourly SPP for hubs + load zones.
Writes to data/bronze/ercot_lmp_raw.parquet.

Uses ErcotAPI (authenticated historical archive). Takes ~25-40 min total.
Run from the project root: python scripts/fetch_ercot.py
"""

import os
import pandas as pd
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv()
from gridstatus.ercot_api.ercot_api import ErcotAPI

OUT = Path("data/bronze/ercot_lmp_raw.parquet")
OUT.parent.mkdir(parents=True, exist_ok=True)

START = "2024-01-01"
END   = "2025-12-31"

HUBS_AND_ZONES = [
    "HB_HOUSTON", "HB_NORTH", "HB_SOUTH", "HB_WEST",
    "LZ_HOUSTON", "LZ_NORTH", "LZ_SOUTH", "LZ_WEST",
]


def fetch_month(client, month_start_str):
    """Fetch one calendar month of DAM hourly SPP, filter to our 8 locations."""
    month_start = pd.Timestamp(month_start_str)
    month_end = (month_start + pd.offsets.MonthEnd(0)).strftime("%Y-%m-%d")
    df = client.get_spp_day_ahead_hourly(
        date=month_start_str,
        end=month_end,
        verbose=False,
    )
    df = df[df["Location"].isin(HUBS_AND_ZONES)].copy()
    df = df.rename(columns={
        "Interval Start": "interval_start",
        "Interval End": "interval_end",
        "Location": "settlement_point",
        "Location Type": "location_type",
        "Market": "market",
        "SPP": "lmp",
    })
    df["ingested_at"] = datetime.utcnow()
    # Drop the redundant Time column if present
    df = df[["interval_start", "interval_end", "settlement_point",
             "location_type", "market", "lmp", "ingested_at"]]
    return df


def main():
    client = ErcotAPI(
        username=os.environ["ERCOT_API_USERNAME"],
        password=os.environ["ERCOT_API_PASSWORD"],
        public_subscription_key=os.environ["ERCOT_API_SUBSCRIPTION_KEY"],
    )

    months = pd.date_range(START, END, freq="MS")
    frames = []
    failed = []

    for m in tqdm(months, desc="Fetching ERCOT DAM SPP by month"):
        month_str = m.strftime("%Y-%m-%d")
        try:
            df = fetch_month(client, month_str)
            if len(df) == 0:
                print(f"WARN: {month_str} returned 0 rows after filtering")
                failed.append(month_str)
            else:
                frames.append(df)
        except Exception as e:
            print(f"WARN: {month_str} failed: {type(e).__name__}: {e}")
            failed.append(month_str)

    if not frames:
        raise RuntimeError("No data fetched. Check credentials and network.")

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.drop_duplicates(subset=["interval_start", "settlement_point"])
    combined = combined.sort_values(["settlement_point", "interval_start"]).reset_index(drop=True)
    combined.to_parquet(OUT, index=False)

    size_mb = OUT.stat().st_size / 1e6
    print(f"\nWrote {len(combined):,} rows to {OUT} ({size_mb:.1f} MB)")
    print("\nCoverage per location:")
    print(combined.groupby("settlement_point").size())
    print(f"\nDate range: {combined['interval_start'].min()} to {combined['interval_start'].max()}")

    if failed:
        print(f"\nFailed months ({len(failed)}): {failed}")
        print("Re-run the script to retry — it will overwrite with the combined result.")


if __name__ == "__main__":
    main()
