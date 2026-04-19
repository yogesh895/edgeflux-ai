"""Look at what the holdout window actually looks like.
If lmp is calm and stable there, a $2.52 MAE is plausible.
If lmp is volatile and we still got $2.52, we have a leak."""
from pathlib import Path
import pandas as pd
import numpy as np

gold = pd.read_parquet("data/gold/site_features_hourly.parquet")
gold["event_time"] = pd.to_datetime(gold["event_time"], utc=True)

split_time = gold["event_time"].max() - pd.Timedelta(days=14)
test = gold[gold["event_time"] >= split_time]

print(f"Holdout window: {test['event_time'].min()} → {test['event_time'].max()}")
print(f"Test rows: {len(test):,}")

print(f"\nLMP statistics in holdout:")
print(test["lmp"].describe().round(2))

print(f"\nLMP statistics in training (full 2024+2025 minus holdout):")
train = gold[gold["event_time"] < split_time]
print(train["lmp"].describe().round(2))

print(f"\nLMP volatility comparison:")
print(f"  train std:    {train['lmp'].std():.2f}")
print(f"  holdout std:  {test['lmp'].std():.2f}")

# Were there any price spikes in the holdout?
spikes = test[test["lmp"] > 100]
print(f"\nPrice spikes (lmp > $100) in holdout: {len(spikes)} out of {len(test)}")
if len(spikes) > 0:
    print(spikes[["event_time", "settlement_point", "lmp"]].head(10).to_string(index=False))

# And in training
train_spikes = train[train["lmp"] > 100]
print(f"\nPrice spikes (lmp > $100) in training: {len(train_spikes)} out of {len(train):,} "
      f"({100*len(train_spikes)/len(train):.2f}%)")

# Per-site MAE in holdout
print("\nPer-site MAE on holdout (using naive lag-24h):")
test_c = test.copy()
test_c["err_naive"] = np.abs(test_c["lmp"] - test_c["lmp_lag_24h"])
per_site = test_c.groupby("site_id")["err_naive"].agg(["mean", "max"]).round(2)
print(per_site)
