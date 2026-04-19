"""Monte Carlo NPV risk engine v2 — calibrated to real BTM economics.

Features:
  - Residuals from full 2-year gold set (captures volatility structure)
  - Gas simulation with regime-switching (5% of months run at 3x volatility)
  - Per-path baseline drift for LMP and gas (calibrated to historical ranges)
  - Modest LMP compression over project life
  - Capex subtraction at realistic BTM levels ($700/kW)
  - Long-run LMP baseline ($42/MWh) anchored to 10-year ERCOT historical mean,
    not the 2024-2025 low-price training window
  - Volatility floors and realistic price clipping

Produces:
  models/risk/v1/residuals.parquet       - residuals from LightGBM backtest
  models/risk/v1/copula_params.json      - fitted t-copula parameters
  models/risk/v1/site_risk.parquet       - per-site NPV distributions

Run from project root: python ml/risk_engine_v2.py
Takes ~3-5 minutes.
"""

from pathlib import Path
from datetime import datetime
import json
import numpy as np
import pandas as pd
import lightgbm as lgb
from scipy.stats import t as student_t, kendalltau

GOLD = Path("data/gold/site_features_hourly.parquet")
SITES = Path("data/silver/sites.parquet")
GAS = Path("data/silver/gas_daily.parquet")
LGBM_DIR = Path("models/lgbm_lmp/v1")
OUT_DIR = Path("models/risk/v1")
OUT_DIR.mkdir(parents=True, exist_ok=True)

EXCLUDE = {"event_time", "lmp", "site_id", "load_zone", "settlement_point",
           "feature_version"}


# -----------------------------------------------------------
# 1. Residuals from full 2-year dataset
# -----------------------------------------------------------

def compute_residuals_full():
    print("Computing residuals over full 2024-2025 dataset...")
    df = pd.read_parquet(GOLD)
    df["event_time"] = pd.to_datetime(df["event_time"], utc=True)
    df = df.sort_values(["site_id", "event_time"]).reset_index(drop=True)
    for c in ["site_id", "load_zone", "settlement_point"]:
        if c in df.columns:
            df[c] = df[c].astype("category")

    feature_cols = [c for c in df.columns if c not in EXCLUDE]
    for c in ["site_id", "load_zone", "settlement_point"]:
        if c in df.columns and c not in feature_cols:
            feature_cols.append(c)

    booster = lgb.Booster(model_file=str(LGBM_DIR / "lgbm_p50.lgb"))
    df["lmp_pred"] = booster.predict(df[feature_cols])
    df["residual"] = df["lmp"] - df["lmp_pred"]

    gas_daily = pd.read_parquet(GAS)
    gas_daily["price_date"] = pd.to_datetime(gas_daily["price_date"])
    gas_henry = (gas_daily[gas_daily["hub"] == "henry_hub"]
                 .sort_values("price_date")
                 .reset_index(drop=True))
    gas_henry["gas_return"] = np.log(gas_henry["price_mmbtu"]).diff()

    df["date"] = (df["event_time"].dt.tz_convert("US/Central")
                  .dt.normalize().dt.tz_localize(None))
    gas_aligned = gas_henry[["price_date", "gas_return"]].rename(
        columns={"price_date": "date"})
    df = df.merge(gas_aligned, on="date", how="left")
    df["gas_return"] = df["gas_return"].fillna(0)

    keep = ["event_time", "site_id", "lmp", "lmp_pred", "residual", "gas_return"]
    residuals = df[keep].dropna(subset=["residual"]).reset_index(drop=True)
    residuals.to_parquet(OUT_DIR / "residuals.parquet", index=False)

    print(f"  ✅ {len(residuals):,} residual rows")
    print(f"  LMP actual mean:   {residuals['lmp'].mean():.2f}")
    print(f"  LMP predicted mean: {residuals['lmp_pred'].mean():.2f}")
    print(f"  LMP residual std:   {residuals['residual'].std():.2f}")
    print(f"  Gas daily return std: {residuals['gas_return'].std():.4f}")
    return residuals


# -----------------------------------------------------------
# 2. Fit t-copula
# -----------------------------------------------------------

def fit_tcopula(residuals):
    print("\nFitting t-copula...")
    pairs = residuals[["residual", "gas_return"]].dropna()
    u1 = pairs["residual"].rank(pct=True).values
    u2 = pairs["gas_return"].rank(pct=True).values
    eps = 1e-4
    u1 = np.clip(u1, eps, 1 - eps)
    u2 = np.clip(u2, eps, 1 - eps)

    tau, _ = kendalltau(u1, u2)
    rho = float(np.clip(np.sin(np.pi * tau / 2), -0.95, 0.95))

    df_candidates = [2.5, 3, 4, 5, 7, 10, 15]
    best_df, best_ll = None, -np.inf
    for df in df_candidates:
        z1 = student_t.ppf(u1, df)
        z2 = student_t.ppf(u2, df)
        det = 1 - rho**2
        q = (z1**2 - 2 * rho * z1 * z2 + z2**2) / det
        ll_copula = (
            -0.5 * np.log(det)
            - ((df + 2) / 2) * np.log(1 + q / df)
            + (df / 2) * np.log(1 + z1**2 / df)
            + (df / 2) * np.log(1 + z2**2 / df)
        ).sum()
        if ll_copula > best_ll:
            best_ll, best_df = ll_copula, df

    params = {
        "rho": rho,
        "df": best_df,
        "kendall_tau": float(tau),
        "n_pairs": int(len(pairs)),
        "lmp_residual_std": float(pairs["residual"].std()),
        "gas_return_std_daily": float(pairs["gas_return"].std()),
    }
    with open(OUT_DIR / "copula_params.json", "w") as f:
        json.dump(params, f, indent=2)
    print(f"  ✅ rho={rho:.3f}, df={best_df}, tau={tau:.3f}")
    return params


# -----------------------------------------------------------
# 3. Simulate NPV (calibrated)
# -----------------------------------------------------------

def simulate_npv(site, copula, residuals,
                 n_paths=10000, horizon_hours=8760 * 10,
                 discount_rate=0.09, capture_factor=0.85,
                 capex_per_kw=700,
                 seed=42):
    rng = np.random.default_rng(seed + hash(site["site_id"]) % 100000)

    # Long-run ERCOT LMP baseline ($/MWh), anchored to 10-year historical mean.
    # 2024-2025 training window averaged $31.75/MWh which is a low-price anomaly.
    # Real BTM pro formas anchor to a 5-10yr historical mean for the planning case.
    LONG_RUN_LMP_BASELINE = 42.0
    baseline_lmp = LONG_RUN_LMP_BASELINE
    baseline_gas = 3.00

    site_res = residuals[residuals["site_id"] == site["site_id"]]
    hour_effect = (site_res.assign(hour=site_res["event_time"].dt.hour)
                   .groupby("hour")["residual"].mean()
                   .reindex(range(24), fill_value=0).values)

    rho = copula["rho"]
    df = max(copula["df"], 3)
    lmp_sigma = max(copula["lmp_residual_std"], 12.0)
    gas_sigma_daily = min(max(copula["gas_return_std_daily"], 0.025), 0.04)

    chol = np.array([[1.0, 0.0], [rho, np.sqrt(1 - rho**2)]])
    npv_paths = np.zeros(n_paths)

    capex = capex_per_kw * site["capacity_mw"] * 1000.0

    n_days = horizon_hours // 24
    n_blocks = (n_days + 29) // 30
    chunk = 100

    for start in range(0, n_paths, chunk):
        end = min(start + chunk, n_paths)
        nc = end - start
        g = rng.chisquare(df, size=(nc, 1)) / df
        z = rng.standard_normal(size=(nc, horizon_hours, 2))
        z = z @ chol.T
        z = z / np.sqrt(g[:, :, None])

        # Calibrated baseline drift
        # LMP: $6/MWh std reflects historical 10-yr mean swings ($30-$50 range)
        # Gas: $0.75/MMBtu std reflects historical ($2-$6 5-yr mean range)
        lmp_baseline_drift = rng.normal(0, 6.0, size=(nc,))
        gas_baseline_drift = rng.normal(0, 0.75, size=(nc,))

        # Modest annual compression — mean 0%, small std
        annual_compression = rng.normal(0.0, 0.010, size=(nc,))

        lmp_noise = z[:, :, 0] * lmp_sigma

        regime_shock = rng.binomial(1, 0.05, size=(nc, n_blocks))
        gas_vol_scale = np.where(regime_shock, 3.0, 1.0)
        gas_vol_scale_daily = np.repeat(gas_vol_scale, 30, axis=1)[:, :n_days]

        gas_daily_noise = z[:, :n_days, 1] * gas_sigma_daily * gas_vol_scale_daily
        gas_baseline_per_path = np.clip(baseline_gas + gas_baseline_drift, 1.5, 8.0)
        gas_path_daily = (gas_baseline_per_path[:, None]
                          * np.exp(np.cumsum(gas_daily_noise, axis=1)))
        gas_path_daily = np.clip(gas_path_daily, 1.0, 25.0)
        gas_path_hourly = np.repeat(gas_path_daily, 24, axis=1)[:, :horizon_hours]

        t_idx = np.arange(horizon_hours)
        hour_of_day = t_idx % 24
        diurnal = hour_effect[hour_of_day]
        years_elapsed = t_idx / 8760.0
        compression_factor = (1 + annual_compression[:, None]) ** years_elapsed
        lmp_base_path = (baseline_lmp + lmp_baseline_drift[:, None]) * compression_factor
        lmp_path = lmp_base_path + diurnal + lmp_noise

        heat_rate = site["heat_rate_mmbtu_mwh"]
        vom = site["vom_mwh"]
        gen_cost = gas_path_hourly * heat_rate + vom
        spread = lmp_path - gen_cost

        cashflow = np.maximum(spread, 0) * capture_factor * site["capacity_mw"]

        hours = np.arange(horizon_hours)
        discount = 1.0 / (1.0 + discount_rate) ** (hours / 8760.0)
        gross_npv = (cashflow * discount).sum(axis=1)
        npv_paths[start:end] = gross_npv - capex

    p5 = float(np.percentile(npv_paths, 5))
    p50 = float(np.percentile(npv_paths, 50))
    p95 = float(np.percentile(npv_paths, 95))
    cvar_95 = float(npv_paths[npv_paths <= p5].mean()) if (npv_paths <= p5).any() else p5
    prob_loss = float((npv_paths < 0).mean())

    return {
        "site_id": site["site_id"],
        "p5_npv": p5,
        "p50_npv": p50,
        "p95_npv": p95,
        "cvar_95_npv": cvar_95,
        "prob_loss": prob_loss,
        "mean_npv": float(npv_paths.mean()),
        "std_npv": float(npv_paths.std()),
        "capex": float(capex),
        "npv_paths_sample": npv_paths[:500].tolist(),
    }


# -----------------------------------------------------------
# Main
# -----------------------------------------------------------

def main():
    print(f"Risk engine v2 starting at {datetime.utcnow().isoformat()}")
    residuals = compute_residuals_full()
    copula = fit_tcopula(residuals)

    sites = pd.read_parquet(SITES)
    print(f"\nSimulating NPV for {len(sites)} sites (10,000 paths × 10 years)...")
    results = []
    for _, site in sites.iterrows():
        print(f"  {site['site_id']} ({site['display_name']})...", flush=True, end=" ")
        r = simulate_npv(site, copula, residuals)
        print(f"P50=${r['p50_npv']/1e6:.0f}M  "
              f"CVaR95=${r['cvar_95_npv']/1e6:.0f}M  "
              f"P(loss)={r['prob_loss']*100:.1f}%")
        results.append(r)

    out = pd.DataFrame(results)
    out_path = OUT_DIR / "site_risk.parquet"
    out.to_parquet(out_path, index=False)
    print(f"\n✅ wrote {out_path}")

    summary = out[["site_id", "p5_npv", "p50_npv", "p95_npv",
                   "cvar_95_npv", "prob_loss", "capex"]].copy()
    for col in ["p5_npv", "p50_npv", "p95_npv", "cvar_95_npv", "capex"]:
        summary[col] = (summary[col] / 1e6).round(1)
    summary["prob_loss"] = (summary["prob_loss"] * 100).round(1).astype(str) + "%"
    summary.columns = ["site", "P5 ($M)", "P50 ($M)", "P95 ($M)",
                       "CVaR95 ($M)", "P(loss)", "Capex ($M)"]
    print("\nSite risk summary:")
    print(summary.to_string(index=False))


if __name__ == "__main__":
    main()
