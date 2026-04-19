"""Fetch 2 years of hourly weather for our 12 candidate sites.

Writes to data/bronze/noaa_weather_raw.parquet.

Uses the Meteostat Python package, which wraps NOAA's ISD (Integrated Surface
Database) and GHCN (Global Historical Climatology Network) feeds. No API key
required. The package finds the nearest weather station to each lat/long and
returns hourly observations.

Run from the project root: python scripts/fetch_weather.py
Takes ~2-5 minutes.
"""

import pandas as pd
from pathlib import Path
from datetime import datetime
from meteostat import Point, Hourly
from tqdm import tqdm

OUT = Path("data/bronze/noaa_weather_raw.parquet")
OUT.parent.mkdir(parents=True, exist_ok=True)

# The 12 candidate sites, matching scripts/fetch_ercot.py and the PRD.
# (site_id, display_name, latitude, longitude, load_zone)
SITES = [
    ("s01", "Permian West A",   31.85, -102.37, "WEST"),
    ("s02", "Permian West B",   32.01, -102.10, "WEST"),
    ("s03", "Midland Ridge",    32.00, -102.08, "WEST"),
    ("s04", "Laredo South",     27.51,  -99.50, "SOUTH"),
    ("s05", "San Antonio East", 29.45,  -98.30, "SOUTH"),
    ("s06", "Houston Energy",   29.76,  -95.37, "HOUSTON"),
    ("s07", "Houston Ship Ch.", 29.72,  -95.02, "HOUSTON"),
    ("s08", "DFW North",        33.20,  -96.50, "NORTH"),
    ("s09", "DFW Industrial",   32.85,  -96.80, "NORTH"),
    ("s10", "Waco Central",     31.55,  -97.13, "NORTH"),
    ("s11", "Corpus Gulf",      27.80,  -97.40, "SOUTH"),
    ("s12", "El Paso Ridge",    31.78, -106.42, "WEST"),
]

START = datetime(2024, 1, 1, 0, 0)
END = datetime(2025, 12, 31, 23, 0)


def fetch_one(site_id, name, lat, lon, load_zone):
    """Fetch hourly weather for one site, return cleaned dataframe."""
    point = Point(lat, lon)
    df = Hourly(point, START, END).fetch()
    if df.empty:
        return None
    df = df.reset_index().rename(columns={
        "time": "event_time",
        "temp": "temperature_c",     # Celsius
        "wspd": "wind_speed_kmh",    # km/h
        "wdir": "wind_direction_deg",
        "prcp": "precipitation_mm",
        "rhum": "relative_humidity",
        "pres": "pressure_hpa",
    })
    df["site_id"] = site_id
    df["display_name"] = name
    df["load_zone"] = load_zone
    df["latitude"] = lat
    df["longitude"] = lon
    # Normalize wind speed to m/s (Meteostat returns km/h)
    df["wind_speed_ms"] = df["wind_speed_kmh"] / 3.6
    keep = [
        "site_id", "display_name", "load_zone", "latitude", "longitude",
        "event_time",
        "temperature_c", "wind_speed_ms", "wind_direction_deg",
        "precipitation_mm", "relative_humidity", "pressure_hpa",
    ]
    # Only keep columns that exist (some stations lack pressure/humidity)
    keep = [c for c in keep if c in df.columns]
    return df[keep]


def main():
    frames = []
    failed = []
    for site_id, name, lat, lon, zone in tqdm(SITES, desc="Fetching weather"):
        try:
            df = fetch_one(site_id, name, lat, lon, zone)
            if df is None or df.empty:
                print(f"WARN {site_id} ({name}): empty dataframe")
                failed.append(site_id)
                continue
            frames.append(df)
        except Exception as e:
            print(f"WARN {site_id} ({name}): {type(e).__name__}: {e}")
            failed.append(site_id)

    if not frames:
        raise RuntimeError("No weather data fetched. Check Meteostat install.")

    out = pd.concat(frames, ignore_index=True)
    out = out.drop_duplicates(subset=["site_id", "event_time"])
    out = out.sort_values(["site_id", "event_time"]).reset_index(drop=True)
    out["ingested_at"] = datetime.utcnow()
    out.to_parquet(OUT, index=False)

    size_mb = OUT.stat().st_size / 1e6
    print(f"\nWrote {len(out):,} rows to {OUT} ({size_mb:.1f} MB)")
    print("\nCoverage per site:")
    cov = out.groupby("site_id").agg(
        rows=("event_time", "size"),
        first=("event_time", "min"),
        last=("event_time", "max"),
    )
    print(cov)
    print("\nTemperature range per site:")
    print(out.groupby("site_id")["temperature_c"].agg(["min", "mean", "max"]).round(1))
    if failed:
        print(f"\nFailed sites ({len(failed)}): {failed}")
        print("Shift lat/long by 0.05 in the SITES list and re-run to retry those.")


if __name__ == "__main__":
    main()
