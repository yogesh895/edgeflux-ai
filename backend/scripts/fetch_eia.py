"""Fetch 2 years of daily natural gas spot prices from EIA v2 API.

Writes to data/bronze/eia_gas_raw.parquet.

EIA's v2 API does not publish a daily Waha spot series in its public catalog,
so we fetch Henry Hub daily spot as the primary fuel cost input. In the silver
layer we'll synthesize a Waha series by applying a calibrated basis offset
(typically Henry Hub minus $0.50-$1.50/MMBtu depending on Permian congestion).
For the hackathon demo this is documented in the README and is a defensible
modeling choice — a full implementation would subscribe to an S&P Global /
SNL daily Waha feed.

Run from the project root: python scripts/fetch_eia.py
Takes ~30 seconds.
"""

import os
import pandas as pd
import requests
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ["EIA_API_KEY"]
BASE = "https://api.eia.gov/v2"
OUT = Path("data/bronze/eia_gas_raw.parquet")
OUT.parent.mkdir(parents=True, exist_ok=True)

START = "2024-01-01"
END = "2025-12-31"

# EIA series IDs. Confirmed available in v2 catalog as of 2026-04.
# Browse: https://www.eia.gov/opendata/browser/natural-gas/pri/fut
SERIES = {
    "henry_hub": "RNGWHHD",   # Henry Hub Natural Gas Spot Price, daily, $/MMBtu
}


def fetch_series(series_id, start, end):
    """Fetch one EIA series with pagination."""
    url = f"{BASE}/natural-gas/pri/fut/data"
    params = {
        "api_key": API_KEY,
        "frequency": "daily",
        "data[0]": "value",
        "facets[series][]": series_id,
        "start": start,
        "end": end,
        "length": 5000,
        "sort[0][column]": "period",
        "sort[0][direction]": "asc",
    }
    rows = []
    offset = 0
    while True:
        params["offset"] = offset
        r = requests.get(url, params=params, timeout=30)
        r.raise_for_status()
        payload = r.json()
        chunk = payload["response"]["data"]
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < params["length"]:
            break
        offset += len(chunk)
    return pd.DataFrame(rows)


def main():
    frames = []
    for hub, series_id in SERIES.items():
        print(f"Fetching {hub} ({series_id}) from {START} to {END}...")
        df = fetch_series(series_id, START, END)
        if df.empty:
            print(f"  WARN: no data returned for {series_id}")
            continue
        df = df.rename(columns={"period": "price_date", "value": "spot_price_mmbtu"})
        df["price_date"] = pd.to_datetime(df["price_date"]).dt.date
        df["spot_price_mmbtu"] = pd.to_numeric(df["spot_price_mmbtu"], errors="coerce")
        df["hub"] = hub
        df = df[["price_date", "hub", "spot_price_mmbtu"]]
        df = df.dropna(subset=["spot_price_mmbtu"])
        print(f"  got {len(df):,} rows")
        frames.append(df)

    if not frames:
        raise RuntimeError("No EIA data fetched. Check API key and network.")

    out = pd.concat(frames, ignore_index=True)
    out = out.drop_duplicates(subset=["price_date", "hub"])
    out = out.sort_values(["hub", "price_date"]).reset_index(drop=True)
    out["ingested_at"] = datetime.utcnow()
    out.to_parquet(OUT, index=False)

    size_kb = OUT.stat().st_size / 1e3
    print(f"\nWrote {len(out):,} rows to {OUT} ({size_kb:.1f} KB)")
    print("\nCoverage per hub:")
    print(out.groupby("hub")["price_date"].agg(["min", "max", "count"]))
    print("\nSample rows:")
    print(out.head())
    print("\nDescribe:")
    print(out.groupby("hub")["spot_price_mmbtu"].describe()[["min", "mean", "max"]])


if __name__ == "__main__":
    main()
