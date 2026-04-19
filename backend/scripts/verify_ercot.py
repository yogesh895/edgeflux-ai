# scripts/verify_ercot.py
import os
from dotenv import load_dotenv
load_dotenv()

from gridstatus.ercot_api.ercot_api import ErcotAPI

client = ErcotAPI(
    username=os.environ["ERCOT_API_USERNAME"],
    password=os.environ["ERCOT_API_PASSWORD"],
    public_subscription_key=os.environ["ERCOT_API_SUBSCRIPTION_KEY"],
)

df = client.get_spp_day_ahead_hourly(
    date="2025-01-15",
    end="2025-01-16",
    verbose=True,
)
print(f"Got {len(df):,} rows")
print(df.head())
print("Columns:", list(df.columns))
print("Unique locations:", df["Location"].nunique() if "Location" in df.columns else "?")
