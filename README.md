# Disha — AI Field Co-Pilot for Agronomists

**IITM BS × Syngenta AgriTech Hackathon 2026 — Track 2 Submission**
**Team RUSH**

---

## i. Project Title & Brief Overview

**Disha** is an AI-powered Progressive Web App that helps Syngenta field sales representatives prioritise retailer visits, surface supply-chain anomalies, and receive crop-stage-aware product advice — all while remaining functional offline in low-connectivity rural areas.

**Core problem solved:** An agronomist managing 50–150 retailers across multiple tehsils has no data-driven way to decide *who to visit today, why, and what to recommend when they get there.* Disha replaces gut-feel routing with a ranked visit plan driven by nine scored signals (stockout risk, biological crop stage, sales trajectory, weather exposure, visit recency, and more), then layers in LLM-generated advice at the point of conversation.

**Key capabilities:**
- **Ranked visit plan** — scored priority queue with explainability bar & factor chips ("Alerts +160", "Crop stage +15")
- **Anomaly detection** — rule-based + Random Forest flags for stockout / price spike / demand surge
- **AI product advice** — Gemini 2.0 Flash generates retailer-specific recommendations; outlet saved via button tap
- **Territory Intelligence** — LLM strategic overview of the whole territory for manager-level planning
- **Route optimisation** — TSP nearest-neighbour routing on the map view (offline GPS handoff)
- **Outcome feedback loop** — visit results feed back into next-day prioritisation
- **Rep leaderboard** — acceptance rate, coverage efficiency, visits/week across all reps
- **Offline-first PWA** — service-worker caching; plan readable without network

Full technical detail: see `Syngenta_FieldCoPilot_Submission.docx[https://www.google.com]`

---

## ii. Team Member Details & Contact Information

| Name | Email | Phone | Role |
|---|---|---|---|
| Anshu Saurabh | 25f1002017@ds.study.iitm.ac.in | +91 96676 94292 | Technical Lead & Architect — full-stack codebase, repository structure, router-controller-service architecture, development pipeline, scalable data flow |
| Himel Sarkar | 25f1002318@ds.study.iitm.ac.in | +91 88268 64161 | Product narrative & positioning, demo script & flow, submission README, Disha brand identity |
| Atharva Kesharwani | 24f2007106@ds.study.iitm.ac.in | +91 92593 91521 | Backend Visit Management Service (architecture & historical rep interaction queries), retailer detail page frontend components & live historical insight integration |
| GuruPriya S | 25f1002652@ds.study.iitm.ac.in | +91 97513 19739 | Domain research & 9-factor priority scoring — clinical-decision-support lens, biological urgency weighting, crop-stage asymmetric risk modelling |
| Leena George | 24f3004057@ds.study.iitm.ac.in | +91 97035 00801 | End-to-end QA (multilingual, mobile/desktop, online/offline), technical & submission documentation, GitHub issue triage & severity prioritisation |

---

## iii. Source Code Repository

| Repo | URL |
|---|---|
| **Monorepo (frontend + backend + dataset)** | https://github.com/anshusaurav/RUSH |
| Frontend (Next.js 16 PWA) — subtree | https://github.com/anshusaurav/syngenta-frontend |
| Backend (Node/Express/TS API) — subtree | https://github.com/anshusaurav/syngenta-backend |

The monorepo is public and contains the full commit history of both services (merged via `git subtree`). The `dataset/` folder (8 synthetic CSVs) is included at the root of the monorepo and is referenced by the backend at startup.

---

## iv. Live Deployment

| Service | URL | Notes |
|---|---|---|
| **Frontend (Vercel)** | https://disha-ai-copilot.vercel.app | Installable PWA — see below |
| **Backend (Render)** | https://syngenta-backend.onrender.com | Free tier — may take ~30 s to wake |
| Health check | https://syngenta-backend.onrender.com/health | Returns `{"status":"ok"}` when live |

> **Demo tip:** open the live app, select any rep from the dropdown, and follow the 5-step walkthrough on the landing page. The backend keep-alive ping fires every 4 minutes, so cold-start delays during the demo session are minimised.

### Installable as a Progressive Web App

Disha ships as a full PWA — agronomists install it once and use it like a native Android/iOS app, including offline. No app-store distribution overhead and no Play/App Store review delay.

| Platform | How to install |
|---|---|
| **Android Chrome** | Open the URL → tap the three-dot menu → **Install app** → confirm. A Disha icon (green sprout) appears on the home screen. |
| **iOS Safari** | Open the URL → tap the share button (square with arrow) → **Add to Home Screen** → tap Add. |
| **Desktop Chrome / Edge** | Click the install icon in the address bar (looks like a monitor with a down-arrow) → **Install**. Opens in its own window without browser chrome. |

Once installed the app launches full-screen in standalone mode, takes the green Syngenta theme color in the status bar, opens straight to `/dashboard`, and shows the manifest-defined name "Disha by Syngenta" in the app switcher.

### Offline experience

The custom service worker (`public/sw.js`) implements two complementary caching strategies:

- **Network-first for `/api/*` calls**, falling back to the last-known JSON payload from cache when the device drops connectivity
- **Cache-first for static assets and app routes** (`/dashboard`, `/anomalies`, `/reps`, `/offline`) — pages render instantly even on a dead network
- **Dedicated offline page** at `/offline` shown when both the network and the cache fail

| What works offline | What requires connectivity |
|---|---|
| Today's visit plan (last successful sync) | Refreshing the visit plan with new scores |
| Retailer detail (last fetched) | Fetching a retailer not viewed online before |
| Anomaly list and alerts | Marking an anomaly as resolved (will sync when online) |
| AI advice the rep already opened today | Generating new AI advice |
| Rep + territory selection | Live weather updates |

This matters because **rural India is exactly where mobile data drops out for hours at a time** — the rep can plan their route in the village square in the morning, drive into a coverage dead zone, and still see the ranked stops and product recommendations.

### Quick PWA checklist

If you want to verify the PWA wiring yourself:

1. Open Chrome DevTools → **Application** tab → **Manifest** — should show "Disha by Syngenta", icons, standalone display
2. **Application → Service workers** — `sw.js` should be activated and running
3. **Application → Cache Storage** — `disha-v2` cache populated with precached routes
4. **Lighthouse** → run an audit with category "PWA" — installability ✅, manifest ✅, splash screen ✅
5. **Network tab → Throttling: Offline** → reload `/dashboard` — should render the last-known plan, not the offline page

---

## v. Setup & Execution Instructions

### Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- MongoDB (local instance or Atlas free tier)
- Gemini API key ([get one free](https://aistudio.google.com/))

---

### 1 — Backend

```bash
# 1a. Install dependencies
cd syngenta-backend
npm install

# 1b. Configure environment
cp .env.example .env
# Edit .env and set:
#   MONGODB_URI   — your MongoDB connection string
#   GEMINI_API_KEY — your Gemini API key
#   DATASET_PATH  — relative path to the dataset folder (default: ../dataset)

# 1c. Seed the database from the 8 CSVs
npm run seed               # loads all CSVs into MongoDB collections

# 1d. Start the API server (development, with hot-reload)
npm run dev                # listens on http://localhost:3001

# 1e. (Optional) Extend synthetic data forward to yesterday
#   Set EXTEND_DATA_TO_YESTERDAY=true in .env before starting, or:
npm run extend-data
```

Backend API is now available at `http://localhost:3001`.

---

### 2 — Frontend

```bash
# 2a. Install dependencies
cd syngenta-frontend
npm install

# 2b. Configure environment
cp .env.local.example .env.local      # if present, or create manually:
# NEXT_PUBLIC_API_URL=http://localhost:3001

# 2c. Start the development server
npm run dev                            # http://localhost:3000

# 2d. Production build (mirrors Vercel deployment)
npm run build && npm run start
```

The PWA service worker is registered only in production builds (`npm run build`). In dev mode the app works normally but offline caching is inactive.

---

### 4 — Environment Variables Reference

**Backend (`syngenta-backend/.env.example`):**

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `GEMINI_API_KEY` | Yes | Google Gemini API key (Flash model) |
| `ANTHROPIC_API_KEY` | No | Claude API key (toggle visible, disabled by default) |
| `AI_PROVIDER` | No | `gemini` (default) or `claude` |
| `PORT` | No | Server port (default `3001`) |
| `DATASET_PATH` | No | Path to CSV folder (default `../dataset`) |
| `EXTEND_DATA_TO_YESTERDAY` | No | `true` to auto-extend synthetic data on startup |

**Frontend (`syngenta-frontend/.env.local`):**

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Backend base URL (e.g. `http://localhost:3001`) |
