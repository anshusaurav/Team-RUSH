import { Router, Request, Response } from 'express';
import { getNextBestAction, getTerritoryInsight, AIProvider } from '../services/aiAdvisor';

const router = Router();

/**
 * POST /api/next-best-action
 * Body: { repId, retailerId, provider? }
 * provider: "claude" | "gemini" — overrides AI_PROVIDER env var for this request.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { repId, retailerId, provider } = req.body;
    if (!repId || !retailerId)
      return res.status(400).json({ success: false, error: 'repId and retailerId are required' });

    const result = await getNextBestAction(repId, retailerId, provider as AIProvider | undefined);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/next-best-action/territory-insight?territoryId=T001&provider=gemini
 * provider query param overrides AI_PROVIDER env var for this request.
 */
router.get('/territory-insight', async (req: Request, res: Response) => {
  try {
    const { territoryId, provider } = req.query as { territoryId: string; provider?: string };
    if (!territoryId)
      return res.status(400).json({ success: false, error: 'territoryId is required' });

    const result = await getTerritoryInsight(territoryId, provider as AIProvider | undefined);
    res.json({ success: true, territory_id: territoryId, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/next-best-action/active-provider
 * Returns which provider is currently active (from env).
 */
router.get('/active-provider', (_req: Request, res: Response) => {
  res.json({
    success: true,
    active_provider: process.env.AI_PROVIDER || 'gemini',
    available_providers: ['claude', 'gemini'],
    models: {
      claude: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      gemini: process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite',
    },
  });
});

export default router;
