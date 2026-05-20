# Disha — Backend (Node/Express/TypeScript API)

REST API for the **Disha** Field Co-Pilot. Serves visit plans, anomaly flags, rep stats,
AI-generated advice, and territory intelligence to the Next.js frontend.

**Live:** https://syngenta-backend.onrender.com
**Health:** https://syngenta-backend.onrender.com/health

For full project context, team details, and setup instructions see the root-level `README.md`.

## Quick start

```bash
npm install
cp .env.example .env   # set MONGODB_URI and GEMINI_API_KEY
npm run seed           # load 8 CSVs into MongoDB
npm run dev            # http://localhost:3001
```

## Key endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/api/reps` | List all reps |
| GET | `/api/reps/leaderboard` | Acceptance rate + coverage for all reps |
| GET | `/api/reps/:repId/stats` | KPIs for one rep |
| GET | `/api/visit-plan/:repId` | Scored, ranked visit plan for today |
| GET | `/api/anomalies/:territoryId` | Anomaly flags for territory |
| POST | `/api/ai/advice` | Gemini/Claude LLM product advice |
| GET | `/api/ai/territory-insight/:territoryId` | LLM strategic territory overview |
| POST | `/api/outcomes` | Log visit outcome (feeds next-day plan) |
| GET | `/api/weather/:district` | Open-Meteo weather summary |
| GET | `/api/route/:repId` | TSP-optimised route for today's plan |

Full API contracts in `TRD.md §3` at the project root.

## Tech stack

- **Node.js + Express + TypeScript**
- **MongoDB / Mongoose** — retailers, sales, stock, outcomes
- **Google Gemini 2.0 Flash** — AI advice + territory insight
- **Random Forest (ml-random-forest)** — anomaly scoring
- **Open-Meteo API** — weather signals (no key required)
