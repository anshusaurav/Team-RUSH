# Disha — Setup & Evaluation Guide

> **Quickest path:** the app is already live. Skip to [Live Deployment](#live-deployment) to evaluate without any local setup.

**Source code:** https://github.com/anshusaurav/RUSH (monorepo — frontend + backend + dataset)

---

## Live Deployment

| Service | URL |
|---|---|
| **App (Vercel)** | https://disha-ai-copilot.vercel.app |
| **API (Render)** | https://syngenta-backend.onrender.com |
| **Health check** | https://syngenta-backend.onrender.com/health |

> **Cold-start note:** the backend runs on Render's free tier and sleeps after 15 minutes of inactivity. The first request after a sleep takes ~30 s. Open the health check URL first, wait for `{"status":"ok"}`, then open the app.

### How to evaluate

1. Open https://disha-ai-copilot.vercel.app
2. Select any rep from the dropdown (e.g. **REP_0018** for a dense, high-anomaly territory)
3. The dashboard shows today's ranked visit plan — switch between **List** and **Map** views
4. Click any card to open the retailer detail page and tap **Generate AI Advice**
5. Visit the **Alerts** page to see live anomaly flags
6. Visit the **Reps** page for the leaderboard

---

## Local Setup

### Prerequisites

| Tool | Minimum version |
|---|---|
| Node.js | 20 |
| npm | 10 |
| MongoDB | local instance **or** use the Atlas URI below |

---

### 1 — Backend

```bash
cd syngenta-backend
npm install
```

Create `syngenta-backend/.env` with the following content (credentials pre-filled):

```env
# MongoDB — use Atlas (shared, pre-seeded) or a local instance (requires seeding)
MONGODB_URI=mongodb+srv://db_user:asdfgh1234@cluster0.iqbjoic.mongodb.net/?appName=Cluster0

# Gemini API key (Flash model — already provisioned)
GEMINI_API_KEY=AIzaSyBxUsCxbEtFhMftQv1ybAGioO2oIcLid88

# Optional: swap to Claude instead of Gemini
ANTHROPIC_API_KEY=
AI_PROVIDER=gemini

# Server
PORT=3001

# Dataset path (only needed if running `npm run seed`)
DATASET_PATH=../dataset

# Synthetic data extender — leave false unless you want to roll the dataset forward
EXTEND_DATA_TO_YESTERDAY=false
EXTEND_MAX_DAYS=60
EXTEND_SEASONALITY=false
```

**Option A — use the shared Atlas database (recommended, no seeding needed):**

```bash
npm run dev        # starts on http://localhost:3001
```

**Option B — use a local MongoDB instance (requires seeding first):**

```env
# Replace the MONGODB_URI in .env with:
MONGODB_URI=mongodb://127.0.0.1:27017/syngenta-local
```

```bash
npm run seed       # loads all 8 CSVs from ../dataset/ into MongoDB (~589 k documents, takes ~2 min)
npm run dev        # starts on http://localhost:3001
```

Verify the backend is up: http://localhost:3001/health → `{"status":"ok"}`

---

### 2 — Frontend

```bash
cd syngenta-frontend
npm install
```

Create `syngenta-frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

```bash
npm run dev        # http://localhost:3000  (dev mode — hot reload, offline caching inactive)

# OR: production build (enables PWA service worker + offline caching)
npm run build && npm run start
```

---

## Environment Variables Reference

### Backend (`syngenta-backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGODB_URI` | Yes | — | MongoDB connection string |
| `GEMINI_API_KEY` | Yes* | — | Google Gemini API key (Flash model) |
| `ANTHROPIC_API_KEY` | No | — | Claude API key (optional second provider) |
| `AI_PROVIDER` | No | `gemini` | `gemini` or `claude` |
| `GEMINI_MODEL` | No | `gemini-2.5-flash-lite` | Gemini model ID |
| `CLAUDE_MODEL` | No | `claude-sonnet-4-6` | Claude model ID |
| `PORT` | No | `3001` | HTTP port |
| `DATASET_PATH` | No | `../dataset` | Path to CSV folder (seed only) |
| `EXTEND_DATA_TO_YESTERDAY` | No | `false` | Roll dataset forward to yesterday on startup |
| `EXTEND_MAX_DAYS` | No | `60` | Safety cap on days generated at once |
| `EXTEND_SEASONALITY` | No | `false` | Dampen May–Sep sales to Rabi off-season baseline |

*At least one of `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` must be set, matching `AI_PROVIDER`.

### Frontend (`syngenta-frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Backend base URL (`http://localhost:3001` for local, or the Render URL for production) |

---

## Notes

**PWA / offline mode**
The service worker only activates in a production build (`npm run build`). In `npm run dev` the app works normally but offline caching is inactive. To test offline: build, start, open Chrome DevTools → Network → Offline, reload `/dashboard`.

**AI provider toggle**
The retailer detail page has a provider toggle (Gemini / Claude). It defaults to Gemini. To enable Claude, set `ANTHROPIC_API_KEY` and keep `AI_PROVIDER=gemini` — both keys can coexist; the toggle overrides the default per-request.

**Dataset**
8 synthetic CSVs (Rabi season Oct 2025 – Apr 2026) live in `dataset/`. They are seeded into MongoDB once via `npm run seed`. The Atlas database in the credentials above is already seeded and shared — no seed step needed for Option A.

**Extending data to today**
Set `EXTEND_DATA_TO_YESTERDAY=true` in `.env` and restart. The service statistically extends POS, Inventory, VisitLog, and WhatsApp data forward from their last timestamp. The operation is idempotent.
