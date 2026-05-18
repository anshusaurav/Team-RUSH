import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';

import { connectDB } from './config/db';
import { runAnomalyDetection } from './services/anomalyDetector';

import repsRouter from './routes/reps';
import retailersRouter from './routes/retailers';
import visitPlanRouter from './routes/visitPlan';
import nextBestActionRouter from './routes/nextBestAction';
import anomaliesRouter from './routes/anomalies';
import outcomesRouter from './routes/outcomes';
import weatherRouter from './routes/weather';
import rfRecommendationRouter from './routes/rfRecommendation';
import brainAnomaliesRouter   from './routes/brainAnomalies';
import { prefetchAllDistrictWeather } from './services/weatherService';
import { DISTRICT_COORDS } from './data/districtCoords';
import { loadModel }       from './services/rfAdvisor';
import { loadBrainModel }  from './services/brainAdvisor';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Request logger (simple, dev-friendly)
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api/reps', repsRouter);
app.use('/api/retailers', retailersRouter);
app.use('/api/visit-plan', visitPlanRouter);
app.use('/api/next-best-action', nextBestActionRouter);
app.use('/api/anomalies', anomaliesRouter);
app.use('/api/outcomes', outcomesRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/rf-recommendation', rfRecommendationRouter);
app.use('/api/brain-anomalies',   brainAnomaliesRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

async function start() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`\nSyngenta Field Force Backend running on port ${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health\n`);
  });

  // Run anomaly detection daily at 6 AM (before field reps start their day)
  cron.schedule('0 6 * * *', async () => {
    console.log('[CRON] Running daily anomaly detection...');
    const result = await runAnomalyDetection();
    console.log(`[CRON] Done: ${result.inserted} anomalies flagged, ${result.cleared} old ones cleared`);
  });

  // Pre-warm weather cache for all districts (non-blocking)
  prefetchAllDistrictWeather(Object.keys(DISTRICT_COORDS)).catch(console.error);

  // Run once on startup so anomaly data is always fresh for demo
  console.log('[STARTUP] Running initial anomaly detection...');
  runAnomalyDetection()
    .then((r) => console.log(`[STARTUP] ${r.inserted} anomalies loaded`))
    .catch(console.error);

  // Load pre-trained RF model from JSON (instant — no training at runtime)
  loadModel();

  // Load pre-trained Brain.js LSTM from JSON (instant — no training at runtime)
  loadBrainModel();
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
