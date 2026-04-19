# EdgeFlux AI

**Behind-the-meter gas generation siting and dispatch for ERCOT data centers.**

EdgeFlux AI ingests ERCOT LMP, Waha gas prices, NOAA weather, and grid-state
signals, trains quantile LightGBM models to forecast 72-hour prices at 12
candidate Texas sites, Monte-Carlos a 10-year NPV distribution for each,
and ranks sites by a composite risk-adjusted score. Every forecast is
logged with a SHA-256 feature hash so decisions can be byte-identically
replayed for audit.

---

## Repo layout

```
edgeflux-ai/
├── backend/        # FastAPI service, ML pipeline, trained artifacts
│   ├── backend/    #   - FastAPI app (main.py)
│   ├── data/       #   - bronze / silver / gold parquet feature store
│   ├── models/     #   - trained LightGBM P10/P50/P90 + risk model
│   ├── ml/         #   - training & risk-engine code
│   └── scripts/    #   - data fetchers and QA utilities
├── frontend/       # React + Vite + TanStack Router + Tailwind + shadcn/ui
└── README.md
```

---

## Quick start

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env           # add your ERCOT / EIA / NOAA credentials
uvicorn backend.main:app --reload --port 8000
```

The backend ships with pre-trained LightGBM and risk-engine artifacts under
`models/`, and a pre-built feature store under `data/`, so the API boots
with no training step.

### Frontend

```bash
cd frontend
bun install                    # or: npm install
cp .env.example .env           # defaults to http://localhost:8000
bun dev                        # or: npm run dev
```

Open http://localhost:3000.

---

## API

All endpoints are served under `/api`. Key routes:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness + model/backtest diagnostics |
| GET | `/api/sites` | 12-site catalog with dispatch constraints |
| GET | `/api/sites/scores` | Composite scores, ranking, P50 NPV, P(loss) |
| GET | `/api/sites/{id}/risk` | Monte-Carlo NPV distribution for one site |
| GET | `/api/sites/{id}/risk-factors` | Per-site risk-factor decomposition |
| GET | `/api/sites/{id}/forecast` | 72h P10 / P50 / P90 LMP forecast |
| GET | `/api/sites/{id}/attribution` | TreeSHAP per-feature contributions |
| GET | `/api/decisions` | Audit trail |
| GET | `/api/decisions/{id}` | Full decision record with features + output |
| POST | `/api/decisions/{id}/replay` | Re-run + byte-identical check |

Every forecast call writes a JSON entry under `backend/data/decisions/` with
the feature hash, model version, and output. The replay endpoint re-runs the
model against the same inputs and flags drift.

---

## Architecture

- **Data layer** — parquet feature store with bronze (raw), silver (cleaned),
  gold (hourly feature-engineered) stages.
- **Models** — three LightGBM boosters for P10 / P50 / P90 quantile forecasts
  of ERCOT LMP, plus a Monte-Carlo risk engine that simulates 10-year NPV
  paths with t-copula LMP/gas joint dependence.
- **Explainability** — pre-computed TreeSHAP values per site; a gain-proxy
  fallback keeps attribution available when SHAP artifacts are missing.
- **Auditability** — every forecast request is hashed and persisted; the
  replay endpoint re-runs the exact same feature vector and reports whether
  the new output is byte-identical to the logged one.

---

## Frontend pages

- **Map** — ERCOT map with the 12 candidate sites, ranked panel on the side,
  tier-colored markers, and aggregate Σ P50 NPV / mean P(loss).
- **Site detail** — composite score, risk stats, 72h P10/P50/P90 forecast
  chart, TreeSHAP attributions, site economics.
- **Risk** — NPV distribution chart (KDE over Monte-Carlo paths), P5 / P50 /
  P95 / CVaR / P(loss) tiles, scenario sliders, per-site risk-factor table.
- **Dispatch** — hour-by-hour generate-vs-import schedule with spread /
  savings / profitable-hours summary; per-site constraint panel.
- **Decisions** — audit log of every forecast and dispatch commit, with
  one-click replay and side-by-side compare.

---

## Notes

- `backend/data/decisions/` is runtime-populated (the server seeds 20 demo
  decisions on first boot and appends one per forecast call). The folder
  itself is tracked via a `.gitkeep`; the JSON files are gitignored.
- `backend/.env` is gitignored. Use `backend/.env.example` as a template.
- The included parquet and `.lgb` artifacts are snapshots; re-generate them
  by running the scripts under `backend/scripts/` and `backend/ml/`.
