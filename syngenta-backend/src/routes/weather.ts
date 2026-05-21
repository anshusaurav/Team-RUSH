import { Router, Request, Response } from 'express';
import { getWeatherForDistrict, prefetchAllDistrictWeather } from '../services/weatherService';
import { DISTRICT_COORDS } from '../data/districtCoords';

const router = Router();

/**
 * GET /api/weather?district=Patna
 * Returns 7-day forecast + pest risk + NDVI proxy for the given district.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { district } = req.query as { district?: string };
    if (!district) {
      return res.status(400).json({ success: false, error: 'district query param is required' });
    }

    const summary = await getWeatherForDistrict(district);
    if (!summary) {
      return res.status(404).json({
        success: false,
        error: `No coordinates found for district "${district}". Check /api/weather/districts for valid names.`,
      });
    }

    res.json({ success: true, weather: summary });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/weather/districts
 * Returns all districts with known coordinates.
 */
router.get('/districts', (_req: Request, res: Response) => {
  const districts = Object.entries(DISTRICT_COORDS).map(([name, coords]) => ({
    district: name,
    state: coords.state,
    lat: coords.lat,
    lon: coords.lon,
  }));
  res.json({ success: true, total: districts.length, districts });
});

/**
 * POST /api/weather/prefetch
 * Pre-warm the cache for all districts (useful on deployment).
 */
router.post('/prefetch', async (_req: Request, res: Response) => {
  try {
    const districts = Object.keys(DISTRICT_COORDS);
    await prefetchAllDistrictWeather(districts);
    res.json({ success: true, message: `Pre-fetched weather for ${districts.length} districts` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
