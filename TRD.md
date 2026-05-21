# Technical Requirements Document
## AI-Guided Field Force Intelligence — Syngenta IITM Hackathon 2026

**Status:** Deployed (MVP)  
**Frontend:** https://disha-ai-copilot.vercel.app  
**Backend:** https://syngenta-backend.onrender.com  
**Monorepo:** [anshusaurav/RUSH](https://github.com/anshusaurav/RUSH) (frontend + backend + dataset, full history via git subtree)

---

## 1. Problem Statement

Syngenta field sales representatives in India operate across large rural territories with limited time and imperfect information. Today's visit scheduling is instinct-driven — reps pick retailers based on habit or proximity, missing critical signals like imminent stock-outs, demand spikes from seasonal crop events, or growers actively researching products on WhatsApp. The result is wasted visits, missed sales windows, and reactive rather than proactive field operations.

This system replaces intuition with a data-fused intelligence layer that tells each rep exactly where to go, what to say, and why — before they leave for the day.

---

## 2. System Architecture

```
┌────────────────────────────────────────────────┐
│              Next.js 16 PWA                    │  ← Vercel (Edge)
│  Dashboard · Retailer · Alerts · Reps · Map    │
└────────────────────┬───────────────────────────┘
                     │ REST/JSON
┌────────────────────▼───────────────────────────┐
│           Express + TypeScript API             │  ← Render (Node 20)
│  Visit Plan · NBA · Anomalies · Outcomes       │
│  RF Recommendation  ·  Brain.js LSTM           │
│  Route Optimiser    ·  Data Extender CLI       │
└──────┬──────────┬──────────────┬───────────────┘
       │          │              │
  MongoDB     Anthropic /    Open-Meteo +
  Atlas       Gemini API     NASA POWER API

       ┌────────────────────────────────────┐
       │  Python / Node (offline, local)    │
       │  scripts/train_rf.py    → rfModel  │  ← committed
       │  src/scripts/trainBrain → lstm     │  ← committed
       └────────────────────────────────────┘
```

**Data store:** MongoDB Atlas (10 collections covering reps, retailers, growers, POS, inventory, visits, outcomes, anomalies, WhatsApp campaigns, digital funnel)  
**AI layer:** Dual-provider abstraction — Google Gemini 2.5 Flash Lite (default) and Anthropic Claude Sonnet 4.6, switchable per-request via `ProviderToggle`  
**ML layer:** Pre-trained scikit-learn RandomForest + Brain.js LSTM, both serialised to JSON; pure-JS inference at runtime with no Python dependency  
**External APIs:** Open-Meteo (7-day forecast, free), NASA POWER (solar irradiance as crop-stress proxy, free)  
**Local-dev shortcut:** `npm run start-local-mongo` spins up a persistent `mongodb-memory-server` instance on port 27017 so the full stack runs offline against a local DB — useful when the synthetic-data extender would push the Atlas 512 MB free-tier cap

---

## 3. Data Model

| Collection | Description | Key Fields |
|---|---|---|
| `repterritories` | Rep → territory mapping | `rep_id`, `territory_id`, `district`, `tehsil_list` |
| `retailers` | Retailer master | `retailer_id`, `territory_id`, `state`, `district`, `tehsil` |
| `inventories` | Weekly stock snapshots | `retailer_id`, `sku_name`, `sku_qty`, `week_end_date` |
| `pos` | Point-of-sale transactions | `retailer_id`, `sku_name`, `sku_qty`, `sku_price`, `transaction_date` |
| `visitlogs` | Rep visit history | `rep_id`, `retailer_id`, `visit_date`, `visit_type`, `product_recommended` |
| `visitoutcomes` | Rep-logged call outcomes | `rep_id`, `retailer_id`, `outcome`, `product_discussed`, `ai_recommendation_used` |
| `anomalyflags` | Active intelligence alerts | `retailer_id`, `anomaly_type`, `severity`, `description`, `resolved` |
| `growers` | Grower crop calendars | `grower_id`, `tehsil`, `grower_crop_calendar.crop`, `grower_crop_calendar.stages[{stage, approx}]` |
| `whatsapplogs` | WhatsApp campaign click-through | `grower_id`, `campaign_product`, `clicked_status`, `message_sent_date` |
| `digitalfunnels` | Weekly campaign-level marketing telemetry | `campaign_id`, `week_start_date`, `social_post_impression`, `landing_page_visits`, `lead_form_submission`, `campaign_crop`, `campaign_product` |

---

## 4. Implemented Features

### 4.1 Composite Visit Prioritization Engine

**Route:** `GET /api/visit-plan?repId=&date=`

Every retailer in the rep's territory receives a numeric score assembled from **11 independent signals**, computed in a single bulk-aggregation pass (no N+1 queries). The breakdown is returned with every response and rendered on the visit card so the rep can audit the score factor-by-factor.

| Signal | Score contribution | Data Source |
|---|---|---|
| Days since last visit | `min(days, 30) × 2` → max **60** | `visitoutcomes` (retailer-level) with `visitlogs` tehsil-level fallback |
| Stock-out count | `stock_outs × 15` per SKU | `inventories` (qty = 0) at latest week |
| Low-stock count | `low_stock × 5` per SKU | `inventories` (qty ≤ 5) at latest week |
| 30-day sales velocity | `min(units / 5, 20)` → max **20** | `pos` aggregation |
| **Sales trend slope** | `−30% → +15`, `−10% → +8`, `+30% → +5`, else 0 | `pos` split-window: last 15 days vs prior 15 days |
| Active anomaly count | **Type-weighted sum** — see §4.4 weights | `anomalyflags` (resolved: false) |
| Past outcome boost | `outcomes_30d × 10` per accepted/order outcome | `visitoutcomes` for this rep+retailer |
| Proximity index boost | `max(0, 5 − tehsil_position)` → max **5** | Position in rep's `tehsil_list` |
| **Biological urgency** | `min(growers × 5, 25)` → max **25** | `growers` crop calendar — stages within ±7 / +21 day window |
| **Digital intent** | `min(clicks × 3, 15)` → max **15** | `whatsapplogs` click-through joined to grower tehsil |
| **Weather risk** | pest-risk + heavy-rain bonus + **NDVI bonus** → max **25** | Open-Meteo forecast + NASA POWER solar irradiance |
| **Catchment penetration gap** | `growers/sales` ratio: ≥ 3.0 → +10, ≥ 1.5 → +6, else 0 | `growers` density vs 30-day POS velocity |

**Priority thresholds:** ≥ 90 → `urgent` · ≥ 55 → `high` · else → `normal`

**Retailer-level recency** is the most material change since the initial design — `visitlogs` only carries `visit_tehsil`, so the original recency factor was a flat tehsil value applied to every retailer in that tehsil. The current implementation prefers per-retailer `visitoutcomes.visit_date` and falls back to the tehsil value only when no outcome row exists. Synthetic outcomes are backfilled by the data extender (see §4.10) so demo data has meaningful per-retailer variance.

---

### 4.2 AI Next-Best-Action Co-Pilot

**Route:** `POST /api/next-best-action`

When a rep opens a retailer's detail page, the system assembles a rich context snapshot and calls the active AI provider to generate a structured field-ready action plan:

**Context assembled per call:**
- Current inventory (latest weekly snapshot)
- Top 5 selling SKUs by revenue (last 30 days)
- Rep's last 5 visits to any retailer in the territory
- Past outcomes at this specific retailer (win/loss history)
- Active unresolved anomaly flags
- Nearby growers: crop type, count, upcoming biological stages (by name)
- WhatsApp click-through intent: which products growers in this tehsil clicked recently
- Live weather: 3-day forecast + pest risk summary for the district

**Output format (structured 5-section prompt):**
1. Top 3 Products to Discuss — tied to specific stock/sales data and WhatsApp interest
2. Agronomic Talking Point — references actual upcoming crop stage names
3. Promotional Action — today's specific offer; escalates to fungicide/pesticide push when weather pest risk is high
4. Red Flag — stock-out or critical anomaly, or "None"
5. Why This Visit Matters — the business rationale for the rep to articulate to the retailer

**Provider toggle:** Any call can specify `provider: "claude" | "gemini"` to override the system default. A `ProviderToggle` component in the UI lets the rep switch inline.

---

### 4.3 Territory Insight Summary

**Route:** `GET /api/next-best-action/territory-insight?territoryId=`

A manager-level 3-bullet summary generated by the AI, covering top SKU performance, unresolved alert count, and visit cadence for the territory in the last 7 days.

---

### 4.4 Anomaly Detection Engine

**Route:** `POST /api/anomalies/refresh` · `GET /api/anomalies?territoryId=&severity=`

**Six rule-based detectors and two ML detectors** run in parallel (via `Promise.all`) both at server startup and on a daily 6 AM cron:

| Detector | Logic | Severity | Score weight |
|---|---|---|---|
| `stock_out` | Any SKU at qty = 0 in the latest inventory week | high | **25** |
| `brain_stockout_risk` | LSTM forecast → velocity collapse or `days_to_stockout < 7` | high/medium | **20** |
| `demand_spike` | Current week ≥ **2.5× prior-4-week avg** AND ≥ **10 absolute units** | medium | **15** |
| `brain_demand_spike` | LSTM deviation > 2.2× forecast AND `lastWeekActual ≥ 8` | high/medium | **15** |
| `digital_intent` | Growers in a tehsil clicked WhatsApp campaigns but rep hasn't visited the tehsil in 14 days | medium | **12** |
| `weather_alert` | District forecast shows `pest_risk = 'high'` or ≥ 2 heavy-rain days in next 7 days | high/medium | **12** |
| `low_inventory` | Any SKU at qty ≤ 5 with recent sales velocity | medium | **10** |
| `visit_gap` | No rep visit to a retailer's tehsil in > 14 days | low | **8** |

**Idempotent writes.** The detector's write path is `bulkWrite()` with upserts keyed on `(retailer_id, anomaly_type, sku_name)` — re-runs (server restart, cron firing) refresh `detected_at` + severity on the existing row instead of inserting duplicates. A dedupe pass collapses any legacy duplicate rows on every run, and a reconcile pass deletes active rows whose key isn't in the current detection's output (so tightening a threshold cleans up stale false positives immediately, not after the 7-day TTL).

**Detail endpoint** (`GET /api/retailers/:id`) sorts active anomalies by a numeric severity rank (high=0, medium=1, low=2) and returns every distinct `(type, sku)` pair — no hard cap, no alphabetical-severity sort artefact.

Resolved anomalies are soft-deleted (`resolved: true`). The UI lets reps resolve individual alerts and re-run detection on demand.

---

### 4.5 Weather + NDVI Crop Health Integration

**Route:** `GET /api/weather?district=`

Two free external APIs are fused per district:

- **Open-Meteo** — 7-day hourly forecast, aggregated to daily: `rain_mm`, `temp_max_c`, `temp_min_c`, `humidity_max_pct`
- **NASA POWER** — 10-day surface solar irradiance (`ALLSKY_SFC_SW_DWN`) in MJ/m²/day, used as a cloud-cover / crop-stress proxy

**Pest risk classification:**
- `high` — ≥ 4 days with humidity > 75% AND temp 22–35°C, OR ≥ 3 heavy-rain days (> 10 mm)
- `medium` — ≥ 2 heavy-rain days, OR ≥ 2 humid+warm days
- `low` — otherwise

**`weatherRiskScore` (0–25 pts) — three additive components:**
| Component | Contribution |
|---|---|
| Pest risk base | high → 20, medium → 10, low → 0 |
| Heavy rain bonus | `heavy_rain_days × 3`, capped at +6 |
| NDVI / cloud-cover bonus | `ndvi_proxy < 12 MJ/m²/day` → +5 · `< 18` → +2 · else 0 |

Sustained low irradiance signals thick cloud cover, which combined with humid heat accelerates fungal disease pressure and stresses standing crops — i.e. input demand is likely to spike.

Weather is cached in-memory per district for **6 hours**. All 33 districts in the dataset are pre-warmed at server startup (non-blocking).

The `WeatherStrip` component on the dashboard shows: pest risk level (color-coded), rain days, heat stress days, NDVI solar proxy value, and a 3-day mini forecast grid.

---

### 4.6 Outcome Logging & Acceptance Rate Tracking

**Route:** `POST /api/outcomes` · `GET /api/outcomes?repId=`

After each retailer visit, reps log: outcome (sale made / order placed / no purchase), product discussed, notes, and whether they used the AI recommendation. The system tracks a rolling 30-day acceptance rate per rep, surfaced on the dashboard stats row. Past `sale_made` / `order_placed` outcomes feed back into the prioritisation engine via `outcome_boost × 10` per accepted outcome.

---

### 4.7 ML-Powered Product Recommendation Engine (Random Forest)

**Routes:** `POST /api/rf-recommendation` · `GET /api/rf-recommendation/status` · `POST /api/rf-recommendation/reload`

A pre-trained scikit-learn `RandomForestClassifier` is serialized to a flat-array JSON file at training time and loaded into the Node.js process at startup. All inference is pure JavaScript — no Python at runtime, no subprocess overhead.

**Training pipeline** (`scripts/train_rf.py`, run locally):
1. Connects to MongoDB Atlas via pymongo
2. Builds a tehsil → dominant crop + biological stage map from `growers` collection
3. Builds a tehsil → WhatsApp click count map from `whatsapplogs` (last 30 days)
4. Loads all `visitlogs` with a recorded `product_recommended`
5. Engineers 8 features per visit (see table below)
6. Trains `RandomForestClassifier(n_estimators=50, max_depth=8, n_jobs=-1, class_weight='balanced')` on 19,788 samples in **0.2 seconds**
7. Serializes each tree as flat arrays (feature, threshold, children_left, children_right, value) to `src/data/rfModel.json` (733 KB)

**Feature vector (8 dimensions):**

| # | Feature | Range | Source |
|---|---|---|---|
| 0 | Month | 1–12 | Visit date |
| 1 | Day of year | 1–365 | Visit date |
| 2 | Crop encoded | 0–8 | Grower crop calendar (dominant per tehsil) |
| 3 | Stage encoded | 0–3 (pre-season/tillering/flowering/pod formation) | Grower crop calendar |
| 4 | Days since stage | −45 to +45 | Distance from nearest active stage |
| 5 | Days to next stage | 0–90 | Lookahead to upcoming stage |
| 6 | Visit type encoded | 0 = regular, 1 = demo, 2 = training | Visit log |
| 7 | WhatsApp clicks | 0–20 (capped) | WhatsApp log click-through, last 30 days |

**Target classes:** 12 Syngenta products — Actara 25 WG, Alto 5 SC, Amistar 250 SC, Axial 50 EC, Cruiser 350 FS, Kavach 75 WP, Movondo, Score 250 EC, Tilt 250 EC, Topik 15 WP, Vertimec 1.8 EC, Vibrance Integral

**Inference (pure JS):**
- Each tree is traversed via array index lookups: `children_left[node]` / `children_right[node]`
- Leaf class counts are vote-summed across all 50 trees
- Winning product = highest vote count; confidence = winner votes / 50
- Total inference time: **< 1 ms** per prediction

**API response:**
```json
{
  "product_recommended": "Actara 25 WG",
  "confidence": 1.0,
  "reasoning": "Wheat is at tillering during the Rabi season. Actara 25 WG (insecticide) is the top-ranked recommendation at this crop stage across 19,788 historical territory visits. 3 nearby growers recently clicked related WhatsApp campaigns. Model confidence: 100% (50 decision trees).",
  "model_trained_on": 19788,
  "trained_at": "2026-05-19T..."
}
```

**Retraining workflow:** Run `MONGODB_URI=... python3 scripts/train_rf.py` locally whenever new visit data accumulates → commit updated `rfModel.json` → push to GitHub → Render auto-deploys. Hot-reload without restart: `POST /api/rf-recommendation/reload`.

**Frontend:** `RFRecommendationCard` component on the retailer detail page — shows recommended product, confidence percentage bar (green ≥ 70% / amber ≥ 40% / red < 40%), and full reasoning text.

---

### 4.8 LSTM Velocity Forecaster (Brain.js)

**Module:** `src/services/brainAdvisor.ts` · trained offline by `src/scripts/trainBrain.ts`

A `LSTMTimeStep` network trained on **800 weekly sales sequences across 11,925 retailer-SKU series**. Once trained, the network's weights are serialised to JSON and loaded synchronously at startup — no Python or external inference server.

**At runtime, per (retailer, SKU):**

1. Pull the last `window` weeks of POS units
2. Forward-pass through the LSTM → predicted next-week units
3. Compute `deviation = actual_last_week / predicted`
4. Classify:
   - `deviation > 2.2` AND `actual ≥ 8` → `brain_demand_spike`
   - `deviation < 0.4` OR `days_to_stockout < 7` → `brain_stockout_risk`
   - else → no flag

Both anomaly types feed into the same `anomalyflags` collection and contribute to the prioritisation score (see §4.4 weights). The forecaster's per-SKU detail (predicted, actual, deviation, sequence) is also exposed via `GET /api/brain-anomalies/:retailerId` for the retailer detail panel.

---

### 4.9 Route Optimiser

**Route:** `POST /api/route-optimize`

Once the prioritisation engine returns today's stops, the route optimiser sequences them into a drivable order. Algorithm:

1. **Geocode** retailers using the district + tehsil → coordinates lookup (`src/data/districtCoords.ts`)
2. **Alert-weighted edge cost** — base edge weight is the haversine distance between two stops; retailers with active high-severity anomalies get a multiplier that pulls them earlier in the route
3. **Nearest-neighbour TSP heuristic** starting from the rep's home tehsil — fast (O(n²) for n ≤ 15 stops), no external solver
4. **2-opt local improvement** pass to remove obvious edge crossings

The frontend renders the resulting sequence on a Leaflet map (`VisitPlanMap` component) with an OSM tile layer and a coloured polyline showing the day's route. Urgent stops appear earlier in the sequence so the most important conversations happen on the rep's morning energy, not in the late afternoon.

---

### 4.10 Synthetic Data Extender

**Module:** `src/services/dataExtender.ts` · standalone runner `src/scripts/extend-data.ts` (`npm run extend-data`)

The seeded CSVs end in late March 2026; the live dashboard reads 30-day windows in May. Without intervention, "30-day sales velocity" returns zero for every retailer and the system can't be demoed. The extender bootstraps forward to yesterday via **per-entity statistical resampling**:

| Table | Strategy |
|---|---|
| `pos` | Per-retailer trailing-30-day SKU mix + day-of-week multipliers → Poisson-sampled daily transactions with retailer's historical price |
| `visitlogs` | Per-rep Bernoulli draws per day, tehsil sampled by historical visit frequency, with Sunday suppression |
| `inventories` | Per-(retailer, SKU) weekly drawdown ≈ velocity, 18 % chance of a restock event back to "typical" level |
| `whatsapplogs` | Per-grower 1-in-14 daily Bernoulli, with empirical deliver/open/click rates |
| `digitalfunnels` | Per-campaign Poisson around historical means for impressions / visits / leads |
| `visitoutcomes` | Backfilled from every (rep, date) pair with no real outcome — 1–2 retailers sampled from that tehsil weighted by 30-day velocity, with a velocity-aware outcome distribution (sale_made / order_placed / no_purchase) |

**Idempotency.** Every generated row carries a deterministic ID (`EXT_{date}_{entity}_{i}`) or a compound natural key, so re-runs skip duplicates silently via `ordered: false`. Real user-entered outcomes are never overwritten.

**Local-dev workflow.** Combined with `npm run start-local-mongo`, the team can run the entire extended stack against a portable Mongo binary (`mongodb-memory-server` 7.0.14) — no Atlas account, no quota concerns, no admin install. The `.env.atlas.bak` file in `syngenta-backend/` preserves the production Atlas URI for quick swap-back.

---

### 4.11 Progressive Web App (PWA)

- **Service worker** (`/sw.js`): network-first strategy for `/api/*` calls; cache-first for static assets; navigation fallback to `/offline` page
- **Manifest** (`/manifest.json`): installable on Android/iOS home screen, standalone display, Syngenta green theme
- **Offline page**: shown when network is unavailable; today's visit plan is also cached in `localStorage` and served from cache on reload

---

## 5. API Surface

| Method | Route | Description |
|---|---|---|
| GET | `/api/reps` | List all reps |
| GET | `/api/reps/:id` | Single rep detail |
| GET | `/api/reps/:id/stats` | Visits this week, acceptance rate, outcomes by type |
| GET | `/api/visit-plan` | Prioritized retailer list for a rep on a date |
| GET | `/api/retailers/:id` | Retailer detail: inventory, top products, visits, anomalies |
| POST | `/api/next-best-action` | AI action plan for a rep + retailer pair |
| GET | `/api/next-best-action/active-provider` | Active AI provider + available models |
| GET | `/api/next-best-action/territory-insight` | AI territory health summary |
| GET | `/api/anomalies` | List active anomalies (filterable by territory, severity) |
| POST | `/api/anomalies/refresh` | Re-run all 6 detectors |
| PATCH | `/api/anomalies/:id/resolve` | Soft-resolve an anomaly |
| POST | `/api/outcomes` | Log a visit outcome |
| GET | `/api/outcomes` | List outcomes for a rep |
| GET | `/api/weather` | 7-day forecast + pest risk for a district |
| GET | `/api/weather/districts` | All 33 supported districts with coordinates |
| POST | `/api/weather/prefetch` | Pre-warm the weather cache |
| GET | `/health` | Backend health check |
| POST | `/api/rf-recommendation` | ML product recommendation for a retailer (pure-JS RF inference) |
| GET | `/api/rf-recommendation/status` | Model metadata: trained_on, n_estimators, classes, features |
| POST | `/api/rf-recommendation/reload` | Hot-reload rfModel.json without restarting the server |
| GET | `/api/brain-anomalies/:retailerId` | LSTM-driven velocity forecast + anomaly per SKU for a retailer |
| POST | `/api/route-optimize` | TSP-sequenced, alert-weighted driving route for a rep's day |
| GET | `/api/reps/leaderboard` | Acceptance rate + coverage efficiency + visits-per-week across all reps (single-pass aggregation) |

---

## 6. Frontend Pages

| Route | Description |
|---|---|
| `/` | Landing — feature showcase carousel, install-as-PWA CTA, 5-step demo walkthrough, deploy + repo links |
| `/dashboard` | Daily visit plan for selected rep — priority-ordered retailer cards with **score-factor explainability bar + chips** (recency, stock-outs, sales trend, catchment gap, etc.), **list ↔ map view toggle**, **Territory Intelligence panel** (LLM-generated strategic overview), weather strip, anomaly banner, stats |
| `/retailer/[id]` | Retailer detail — ML product recommendation card (RF), AI next-best-action with provider toggle, **outcome logger that auto-refreshes the next day's plan**, inventory table, **type-weighted active anomaly list** (sorted by severity, all distinct (type, sku) pairs surfaced — no hard cap), recent visits, LSTM velocity panel |
| `/anomalies` | Territory alert feed — filterable by severity, resolve + re-detect controls, type labels for all 8 anomaly types (6 rule + 2 ML), card design matches visit cards (top accent + soft ring) |
| `/reps` | Rep directory — territory, state, district, **acceptance rate / coverage efficiency / visits-per-week chips from leaderboard**, **state-filter dropdown** + search box |
| `/offline` | Offline fallback page shown by service worker |

**Internationalisation.** The whole UI ships with EN + HI dictionaries (`src/lib/i18n/dict/{en,hi}.ts`) and auto-detects the rep's preferred language from `repterritories.state` — Hindi-belt states default to Hindi, others to English. Manual override via the language picker in the navbar.

**Backend keep-alive.** A `BackendPing` component pings `/api/reps?limit=1` every 4 minutes in production builds to keep the Render free-tier dyno warm during demo sessions — eliminates the 30 s cold-start surprise on first interaction.

---

## 7. Deployment

| Layer | Platform | Config |
|---|---|---|
| Frontend | **Vercel** | Next.js auto-detected; `NEXT_PUBLIC_API_URL` env var points to Render backend |
| Backend | **Render** (Web Service) | Build: `npm install && npm run build`; Start: `node dist/index.js`; `typescript` in `dependencies` (not devDependencies) so Render's production install includes the compiler |
| Database | **MongoDB Atlas** | `MONGODB_URI` env var; network access set to `0.0.0.0/0` to allow Render's dynamic IPs |
| AI | Anthropic + Google | `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `AI_PROVIDER` env vars; SDK clients lazily initialized on first use to prevent startup crash when a key is absent |
| ML Model | **Committed JSON** | `src/data/rfModel.json` (733 KB) shipped with the backend repo; loaded synchronously at startup via `loadModel()`; retrained offline with `scripts/train_rf.py` |

---

## 8. Planned Next Moves

### 8.1 Outcome Learning Loop (Priority: High)
Outcomes currently feed back via a flat `outcomes × 10` boost. The next step is to feed logged `visitoutcomes` into RF retraining so the model learns which products actually convert at each crop stage and retailer profile — closing the loop beyond the training-set-only supervised signal.

### 8.2 External-Signal Integration (Priority: High)
Three free public datasets that would meaningfully sharpen prioritisation:

| Source | New signal | Score contribution |
|---|---|---|
| Agmarknet / `data.gov.in` mandi prices | Daily crop-price spikes → input-demand follow-on | +5 to +10 pts |
| CWC reservoir storage | Low reservoir + standing crop = imminent stress | +3 to +5 pts |
| NASA SMAP soil moisture | Strengthens crop-stress beyond cloud-cover proxy | +3 to +5 pts |

### 8.3 SKU × Crop-Stage Mismatch Factor
Compare each retailer's inventory mix against the dominant crop stages of growers in their tehsil. If the retailer is stocking the wrong chemistry for the current stage, surface a +8 pts factor and an explicit talking point in the AI briefing.

### 8.4 Grower-Level Demand Forecasting
Aggregate grower crop-calendar data (current crop, sowing date, upcoming stages) across a tehsil to forecast category-level demand 2–4 weeks ahead. Pre-position inventory at retailers before the demand wave hits, rather than reacting to stock-outs after.

### 8.5 Push Notifications for Critical Alerts
When the anomaly detector flags a `high`-severity stock-out or weather alert for a rep's territory, send a Web Push notification (service worker already scaffolded) so the rep can reprioritise the same day without opening the app.

### 8.6 Manager Dashboard (Beyond Leaderboard)
The rep leaderboard endpoint exists (§5) and the chips render on `/reps`. The next step is a dedicated manager view aggregating multiple territories: visit-coverage heatmap by tehsil, anomaly resolution-rate trend, and territory-level NBA insights — all computable from existing data with no new collection.

### 8.7 Automated RF + LSTM Retraining Pipeline
Both models retrain manually today (`scripts/train_rf.py`, `src/scripts/trainBrain.ts`). A GitHub Actions workflow triggered on a weekly schedule or after `visitoutcomes` crosses a threshold would connect to Atlas, retrain both, commit the updated JSON, and push — fully automated.

### 8.8 Historical Analytics Tab
Trend charts (weekly visit count, acceptance rate over time, SKU velocity by season) using the existing `visitoutcomes` and `pos` collections. Frontend-only addition using a charting library.

### 8.9 Two-DB Deployment for Synthetic vs Real
The dataExtender produces a much larger dataset than the original CSVs (~270 MB vs ~125 MB). A two-database deployment — `syngenta-original` (seeded CSVs, untouched) and `syngenta-extended` (seed + extender, refreshed nightly) — would let evaluators compare the system's behaviour on raw vs forward-projected data without bumping the Atlas 512 MB cap.

---

*Document generated from the live codebase — all described features are implemented and deployed unless noted under §8.*
