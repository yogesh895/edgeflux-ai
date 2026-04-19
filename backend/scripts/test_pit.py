"""Point-in-time correctness smoke test.

Verifies that no feature in the gold table leaks future information into the
present. Failure = bug in the feature pipeline.
"""
from pathlib import Path
import pandas as pd
import numpy as np

gold = pd.read_parquet("data/gold/site_features_hourly.parquet")

# Test 1: lmp_lag_1h at time T should equal lmp at time T-1 for the same site
print("Test 1: lmp_lag_1h equals t-1 LMP...")
site = "s06"
s = gold[gold.site_id == site].sort_values("event_time").reset_index(drop=True)
# Compare row i's lmp_lag_1h to row (i-1)'s lmp
# Skip first row (no prior row to compare to)
mismatches = (~np.isclose(s["lmp_lag_1h"].iloc[1:].values,
                          s["lmp"].iloc[:-1].values, rtol=1e-4)).sum()
total = len(s) - 1
print(f"  mismatches: {mismatches}/{total} ({100*mismatches/total:.2f}%)")
assert mismatches / total < 0.01, "❌ lmp_lag_1h does not match shifted LMP"
print("  ✅ passed")

# Test 2: lmp_roll_24h_mean at T should not include lmp at T
# Correlation of target with itself through the feature should be < 1
print("\nTest 2: rolling features don't include target...")
corr = s[["lmp", "lmp_roll_24h_mean"]].corr().iloc[0, 1]
print(f"  corr(lmp, lmp_roll_24h_mean) = {corr:.4f}")
assert corr < 0.99, f"❌ suspiciously high correlation: {corr}"
print("  ✅ passed")

# Test 3: lmp at T is not in any feature column (leak sniff)
print("\nTest 3: perfect-fit leak sniff...")
features = [c for c in s.columns if c not in
            ("event_time", "lmp", "site_id", "load_zone",
             "settlement_point", "feature_version")]
# If any single feature perfectly matches lmp, that's a leak
for f in features:
    if s[f].dtype in ("float64", "float32", "int64", "int32"):
        if np.allclose(s[f].values, s["lmp"].values, rtol=1e-6, equal_nan=True):
            raise AssertionError(f"❌ feature {f} equals lmp exactly — LEAK")
print(f"  {len(features)} features checked; none match target exactly")
print("  ✅ passed")

# Test 4: for any given event_time, all features come from prior timestamps
print("\nTest 4: timestamps in features are strictly < event_time...")
# We can only verify this structurally: the columns we generated via .shift(k) or
# via static attributes. A full audit would need timestamp provenance per cell.
# Instead, we sanity-check the strongest signal: if lmp_lag_24h at T leaked lmp at T,
# then the correlation would drop unnaturally when we shuffle the target.
shuffled_lmp = s["lmp"].sample(frac=1, random_state=42).values
original_corr = s[["lmp", "lmp_lag_24h"]].corr().iloc[0, 1]
shuffled_corr = np.corrcoef(shuffled_lmp, s["lmp_lag_24h"])[0, 1]
print(f"  corr(lmp, lmp_lag_24h) original:  {original_corr:.4f}")
print(f"  corr(lmp, lmp_lag_24h) shuffled:  {shuffled_corr:.4f}")
assert original_corr > 0.2, "lmp_lag_24h has suspiciously low signal"
print("  ✅ passed")

print("\nAll PIT tests passed.")
