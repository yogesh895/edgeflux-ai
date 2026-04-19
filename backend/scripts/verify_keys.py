# scripts/verify_keys.py
import os, requests
from dotenv import load_dotenv
load_dotenv()

# EIA
r = requests.get("https://api.eia.gov/v2/natural-gas/pri/fut/data",
                 params={"api_key": os.environ["EIA_API_KEY"],
                         "frequency": "daily", "data[0]": "value",
                         "facets[series][0]": "RNGWHHD", "length": 1})
print("EIA:", r.status_code, r.json()["response"]["data"][0] if r.ok else r.text[:200])

# NOAA
r = requests.get("https://api.weather.gov/points/29.76,-95.37",
                 headers={"User-Agent": os.environ["NOAA_USER_AGENT"]})
print("NOAA:", r.status_code, r.json()["properties"]["cwa"] if r.ok else r.text[:200])

# ERCOT (via gridstatus)
from gridstatus import Ercot
ercot = Ercot()
print("ERCOT: library instantiated OK")
