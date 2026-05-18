import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Inventory from '../models/Inventory';
import POS from '../models/POS';
import VisitLog from '../models/VisitLog';
import VisitOutcome from '../models/VisitOutcome';
import AnomalyFlag from '../models/AnomalyFlag';
import Grower from '../models/Grower';
import Retailer from '../models/Retailer';
import WhatsappLog from '../models/WhatsappLog';
import { getWeatherForDistrict } from './weatherService';

export type AIProvider = 'claude' | 'gemini';

// ─── Provider clients (lazy — instantiated on first use so missing keys don't crash startup) ──

let _anthropic: Anthropic | null = null;
let _gemini: GoogleGenerativeAI | null = null;

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY env var is not set');
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY env var is not set');
    _gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _gemini;
}

function getActiveProvider(override?: AIProvider): AIProvider {
  const provider = override || (process.env.AI_PROVIDER as AIProvider) || 'gemini';
  if (provider !== 'claude' && provider !== 'gemini') {
    throw new Error(`Unknown AI_PROVIDER "${provider}". Must be "claude" or "gemini".`);
  }
  return provider;
}

async function callAI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  provider: AIProvider
): Promise<string> {
  if (provider === 'claude') {
    const response = await getAnthropic().messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    return (response.content[0] as { text: string }).text;
  }

  const model = getGemini().getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
    systemInstruction: systemPrompt,
  });
  const result = await model.generateContent(userPrompt);
  return result.response.text();
}

// ─── Context builder (shared by both providers) ──────────────────────────────

async function buildRetailerContext(repId: string, retailerId: string) {
  const retailer = await Retailer.findOne({ retailer_id: retailerId }).lean();
  const tehsil = retailer?.tehsil;
  const district = retailer?.district;

  // Fetch weather alongside other data
  const weatherPromise = district
    ? getWeatherForDistrict(district).catch(() => null)
    : Promise.resolve(null);

  const latestWeek = await Inventory.findOne({ retailer_id: retailerId })
    .sort({ week_end_date: -1 })
    .select('week_end_date')
    .lean();

  const [currentInventory, topSelling, recentVisits, pastOutcomes, activeAnomalies, nearbyGrowers, whatsappIntent] =
    await Promise.all([
      latestWeek
        ? Inventory.find({ retailer_id: retailerId, week_end_date: latestWeek.week_end_date })
            .select('sku_name sku_qty -_id')
            .lean()
        : [],

      POS.aggregate([
        {
          $match: {
            retailer_id: retailerId,
            transaction_date: { $gte: new Date(Date.now() - 30 * 86400000) },
          },
        },
        {
          $group: {
            _id: '$sku_name',
            units: { $sum: '$sku_qty' },
            revenue: { $sum: { $multiply: ['$sku_qty', '$sku_price'] } },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
        { $project: { sku_name: '$_id', units: 1, revenue: 1, _id: 0 } },
      ]),

      VisitLog.find({ rep_id: repId })
        .sort({ visit_date: -1 })
        .limit(5)
        .select('visit_date visit_type product_recommended -_id')
        .lean(),

      VisitOutcome.find({ rep_id: repId, retailer_id: retailerId })
        .sort({ visit_date: -1 })
        .limit(5)
        .select('outcome product_discussed -_id')
        .lean(),

      AnomalyFlag.find({ retailer_id: retailerId, resolved: false })
        .select('anomaly_type sku_name severity description -_id')
        .limit(5)
        .lean(),

      // Nearby growers: crop, grower count, and upcoming biological stages (±14 to +30 days)
      tehsil
        ? Grower.aggregate([
            { $match: { tehsil } },
            { $addFields: { stages: { $ifNull: ['$grower_crop_calendar.stages', []] } } },
            { $unwind: { path: '$stages', preserveNullAndEmptyArrays: false } },
            {
              $group: {
                _id: '$grower_crop_calendar.crop',
                count: { $sum: 1 },
                upcoming_stages: {
                  $addToSet: {
                    $cond: [
                      {
                        $and: [
                          { $gte: [{ $toDate: '$stages.approx' }, new Date(Date.now() - 14 * 86400000)] },
                          { $lte: [{ $toDate: '$stages.approx' }, new Date(Date.now() + 30 * 86400000)] },
                        ],
                      },
                      '$stages.stage',
                      '$$REMOVE',
                    ],
                  },
                },
              },
            },
            { $project: { crop: '$_id', count: 1, upcoming_stages: 1, _id: 0 } },
            { $limit: 5 },
          ])
        : [],

      // WhatsApp digital intent: products that growers in this tehsil clicked on recently
      tehsil
        ? WhatsappLog.aggregate([
            { $match: { clicked_status: true, message_sent_date: { $gte: new Date(Date.now() - 30 * 86400000) } } },
            {
              $lookup: {
                from: 'growers',
                localField: 'grower_id',
                foreignField: 'grower_id',
                as: 'grower',
              },
            },
            { $unwind: '$grower' },
            { $match: { 'grower.tehsil': tehsil } },
            { $group: { _id: '$campaign_product', interested_growers: { $sum: 1 } } },
            { $project: { product: '$_id', interested_growers: 1, _id: 0 } },
            { $sort: { interested_growers: -1 } },
            { $limit: 5 },
          ])
        : [],
    ]);

  const weather = await weatherPromise;

  return {
    currentInventory: currentInventory as any[],
    topSellingProducts: topSelling,
    recentVisits: recentVisits as any[],
    pastOutcomes: pastOutcomes as any[],
    activeAnomalies: activeAnomalies as any[],
    nearbyGrowers: (nearbyGrowers as any[]).map((g: any) => ({
      crop: g.crop || 'unknown',
      count: g.count,
      upcoming_stages: (g.upcoming_stages || []).filter(Boolean),
    })),
    whatsappIntent: (whatsappIntent as any[]),
    weather: weather
      ? {
          pest_risk:        weather.pest_risk,
          heavy_rain_days:  weather.heavy_rain_days,
          heat_stress_days: weather.heat_stress_days,
          ndvi_proxy:       weather.ndvi_proxy,
          risk_summary:     weather.risk_summary,
          next3days:        weather.forecast.slice(0, 3),
        }
      : null,
  };
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const FIELD_ADVISOR_SYSTEM =
  'You are a concise agricultural field sales co-pilot for Syngenta India. ' +
  'Ground every recommendation in the data provided. Never invent information.';

function buildNextBestActionPrompt(context: Awaited<ReturnType<typeof buildRetailerContext>>): string {
  const hasDigitalIntent = context.whatsappIntent && context.whatsappIntent.length > 0;
  const hasBioStages = context.nearbyGrowers.some((g: any) => g.upcoming_stages?.length > 0);

  const hasWeather = !!context.weather;
  const weatherRisk = context.weather?.pest_risk;

  return `You are an AI co-pilot for a Syngenta field sales representative visiting an agricultural retailer in India during the Rabi season (Oct 2025 – Apr 2026).

RETAILER DATA:
- Current stock levels: ${JSON.stringify(context.currentInventory)}
- Top-selling products (last 30 days): ${JSON.stringify(context.topSellingProducts)}
- Rep's recent visits: ${JSON.stringify(context.recentVisits)}
- Past visit outcomes at this retailer: ${JSON.stringify(context.pastOutcomes)}
- Active alerts: ${JSON.stringify(context.activeAnomalies)}
- Nearby growers & upcoming crop stages: ${JSON.stringify(context.nearbyGrowers)}${hasDigitalIntent ? `
- Products growers clicked on WhatsApp (high purchase intent): ${JSON.stringify(context.whatsappIntent)}` : ''}${hasWeather ? `
- Local weather forecast (next 3 days): ${JSON.stringify(context.weather?.next3days)}
- Weather risk: ${context.weather?.risk_summary}` : ''}

Based only on this data, give the field rep a concise, practical action plan:

**1. TOP 3 PRODUCTS TO DISCUSS** (one sentence each — tie to specific stock/sales data${hasDigitalIntent ? ' and WhatsApp interest' : ''})
**2. AGRONOMIC TALKING POINT** (one sentence — ${hasBioStages ? 'reference the specific upcoming crop stages listed above' : 'relevant to the crops grown by nearby growers'})
**3. PROMOTIONAL ACTION** (one sentence — specific offer or mechanic to deploy today${hasDigitalIntent ? ', prioritise products with WhatsApp click interest' : ''}${weatherRisk === 'high' ? '; weather risk is high, push fungicides/pesticides before rain arrives' : ''})
**4. RED FLAG** (one sentence — only if there is an active stock-out or critical anomaly; say "None" if not applicable)
**5. WHY THIS VISIT MATTERS** (one sentence — the business rationale so the rep can articulate it to the retailer)

Be direct, field-ready language. No jargon. The rep is standing in the shop right now.`;
}

function buildTerritoryInsightPrompt(topSKUs: any[], anomalyCount: number, visitCount: number, territoryId: string): string {
  return `Syngenta territory ${territoryId} — weekly summary:
- Top selling SKUs (30 days): ${JSON.stringify(topSKUs)}
- Active unresolved alerts: ${anomalyCount}
- Visits this week: ${visitCount}

Write a 3-bullet territory health summary a sales manager can read in 30 seconds. Be specific about risks and opportunities.`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getNextBestAction(repId: string, retailerId: string, providerOverride?: AIProvider) {
  const provider = getActiveProvider(providerOverride);
  const context = await buildRetailerContext(repId, retailerId);

  const advice = await callAI(
    FIELD_ADVISOR_SYSTEM,
    buildNextBestActionPrompt(context),
    700,
    provider
  );

  return { advice, provider_used: provider, context_snapshot: context };
}

export async function getTerritoryInsight(territoryId: string, providerOverride?: AIProvider) {
  const provider = getActiveProvider(providerOverride);

  const [topSKUs, anomalyCount, visitCount] = await Promise.all([
    POS.aggregate([
      {
        $lookup: {
          from: 'retailers',
          localField: 'retailer_id',
          foreignField: 'retailer_id',
          as: 'retailer',
        },
      },
      { $unwind: '$retailer' },
      {
        $match: {
          'retailer.territory_id': territoryId,
          transaction_date: { $gte: new Date(Date.now() - 30 * 86400000) },
        },
      },
      { $group: { _id: '$sku_name', units: { $sum: '$sku_qty' } } },
      { $sort: { units: -1 } },
      { $limit: 5 },
    ]),
    AnomalyFlag.countDocuments({ territory_id: territoryId, resolved: false }),
    VisitLog.countDocuments({
      territory_id: territoryId,
      visit_date: { $gte: new Date(Date.now() - 7 * 86400000) },
    }),
  ]);

  const insight = await callAI(
    FIELD_ADVISOR_SYSTEM,
    buildTerritoryInsightPrompt(topSKUs, anomalyCount, visitCount, territoryId),
    300,
    provider
  );

  return { insight, provider_used: provider };
}

export { getActiveProvider };
