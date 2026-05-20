'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getRetailer, getNextBestAction, logOutcome, getVelocityData, RetailerDetail, NextBestAction, VelocityData } from '@/lib/api';
import { MapPin, Package, TrendingUp, ChevronLeft, Sparkles, CheckCircle, Activity } from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import RFRecommendationCard from '@/components/RFRecommendationCard';
import VelocityChart from '@/components/VelocityChart';
import ProviderToggle from '@/components/ProviderToggle';
import { useLocale } from '@/lib/i18n/LocaleProvider';

export default function RetailerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const repId = searchParams.get('repId') || 'REP_0001';
  const { t, locale } = useLocale();
  const dateLocale = locale === 'hi' ? 'hi-IN' : 'en-IN';

  const [detail, setDetail] = useState<RetailerDetail | null>(null);
  const [advice, setAdvice] = useState<NextBestAction | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [outcome, setOutcome] = useState('');
  const [product, setProduct] = useState('');
  const [notes, setNotes] = useState('');
  const [logged, setLogged] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState('');
  const [detailLoading, setDetailLoading] = useState(true);
  const [velocity, setVelocity] = useState<VelocityData | null>(null);
  const [velocityLoading, setVelocityLoading] = useState(true);
  const [provider, setProvider] = useState<'gemini' | 'claude'>('gemini');

  useEffect(() => {
    getRetailer(id).then(setDetail).finally(() => setDetailLoading(false));
    getVelocityData(id)
      .then(setVelocity)
      .catch(() => {})
      .finally(() => setVelocityLoading(false));
  }, [id]);

  const fetchAdvice = async () => {
    setAiLoading(true);
    setAiError('');
    setAdvice(null);
    try {
      const result = await getNextBestAction(repId, id, provider);
      setAdvice(result);
      if (result.context_snapshot.currentInventory[0]) {
        setProduct(result.context_snapshot.currentInventory[0].sku_name);
      }
    } catch (e: any) {
      setAiError(e?.response?.data?.error || t('retailer.aiAdviceError'));
    } finally {
      setAiLoading(false);
    }
  };

  const submitOutcome = async () => {
    if (!outcome) return;
    setLogLoading(true);
    setLogError('');
    try {
      await logOutcome({ repId, retailerId: id, outcome, productDiscussed: product, notes, aiRecommendationUsed: !!advice });
      setLogged(true);
    } catch (e: any) {
      // Surface the actual reason so the user knows what to retry.
      const msg = e?.response?.data?.error || e?.message || 'Unknown error';
      setLogError(msg);
    } finally {
      setLogLoading(false);
    }
  };

  if (detailLoading) return <div className="page-shell space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-lg animate-pulse" />)}</div>;
  if (!detail) return <div className="page-shell text-center py-10 text-gray-400">{t('retailer.notFound')}</div>;

  const { retailer, inventory, top_products_30d, active_anomalies, recent_visits } = detail;

  return (
    <div className="page-shell space-y-4">
      {/* Back + header */}
      <div>
        <Link href="/dashboard" className="flex items-center gap-1 text-sm text-green-700 mb-2">
          <ChevronLeft size={15} /> {t('retailer.backToPlan')}
        </Link>
        <h1 className="text-xl font-bold text-gray-800">{retailer.retailer_id}</h1>
        <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
          <MapPin size={13} /> {retailer.tehsil}, {retailer.district}, {retailer.state}
        </div>
      </div>

      {/* Active anomalies */}
      {active_anomalies.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="font-semibold text-red-700 text-sm mb-1">{t('retailer.activeAlertsHeader')}</div>
          {active_anomalies.map((a, i) => (
            <div key={i} className="text-xs text-red-600">{a.description}</div>
          ))}
        </div>
      )}

      {/* Inventory snapshot */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 font-semibold text-gray-700 text-sm mb-3">
          <Package size={15} /> {t('retailer.currentInventory')}
        </div>
        {inventory.length === 0 ? (
          <div className="text-xs text-gray-400">{t('retailer.noInventory')}</div>
        ) : (
          <div className="space-y-2">
            {inventory.map((inv, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{inv.sku_name}</span>
                <span className={`text-sm font-semibold ${inv.sku_qty === 0 ? 'text-red-600' : inv.sku_qty <= 5 ? 'text-amber-600' : 'text-green-700'}`}>
                  {inv.sku_qty === 0 ? t('retailer.outOfStockTag') : t('retailer.unitsCount', { n: inv.sku_qty })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top products 30d */}
      {top_products_30d.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 font-semibold text-gray-700 text-sm mb-3">
            <TrendingUp size={15} /> {t('retailer.topSales')}
          </div>
          <div className="space-y-2">
            {top_products_30d.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{p.sku_name}</span>
                <span className="text-gray-500">{t('retailer.salesLine', { units: p.units, revenue: p.revenue.toLocaleString(dateLocale) })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent visits */}
      {recent_visits.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="font-semibold text-gray-700 text-sm mb-2">{t('retailer.recentVisits')}</div>
          <div className="space-y-1.5">
            {recent_visits.map((v, i) => (
              <div key={i} className="text-xs text-gray-500 flex justify-between">
                <span>{new Date(v.visit_date).toLocaleDateString(dateLocale)} · {v.visit_type}</span>
                <span className="text-green-700">{v.product_recommended}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ML Velocity Chart */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 font-semibold text-gray-700 text-sm mb-3">
          <Activity size={15} className="text-purple-600" /> {t('retailer.velocityHeader')}
        </div>
        {velocityLoading ? (
          <div className="h-40 flex items-center justify-center text-xs text-gray-400 animate-pulse">
            {t('retailer.velocityLoading')}
          </div>
        ) : velocity ? (
          <VelocityChart data={velocity} />
        ) : (
          <p className="text-xs text-gray-400">{t('retailer.velocityNoModel')}</p>
        )}
      </div>

      {/* ML Model Recommendation */}
      <RFRecommendationCard retailerId={id} />

      {/* AI Recommendation */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 font-semibold text-green-800 text-sm">
            <Sparkles size={15} /> {t('retailer.aiAdvice')}
          </div>
          <ProviderToggle value={provider} onChange={(p) => { setProvider(p); setAdvice(null); setAiError(''); }} />
        </div>

        {!advice && !aiLoading && (
          <button
            onClick={fetchAdvice}
            className="w-full bg-green-700 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-800 transition-colors"
          >
            {t('retailer.aiAdviceCta')}
          </button>
        )}

        {aiLoading && (
          <div className="flex items-center gap-2 text-green-700 text-sm animate-pulse py-2">
            <Sparkles size={14} className="animate-spin" /> {t('retailer.aiAdviceLoading')}
          </div>
        )}

        {aiError && <div className="text-red-600 text-sm">{aiError}</div>}

        {advice && (
          <div>
            <div className="text-xs text-gray-400 mb-2">
              via {advice.provider_used === 'claude' ? '◆ Claude' : '✦ Gemini'} · just now
            </div>
            <div className="prose prose-sm prose-green max-w-none
              [&>h1]:text-base [&>h1]:font-bold [&>h1]:text-green-900 [&>h1]:mt-3 [&>h1]:mb-1
              [&>h2]:text-sm [&>h2]:font-bold [&>h2]:text-green-900 [&>h2]:mt-3 [&>h2]:mb-1
              [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:text-green-800 [&>h3]:mt-2 [&>h3]:mb-0.5
              [&>p]:text-sm [&>p]:text-gray-800 [&>p]:leading-relaxed [&>p]:mb-2
              [&>ul]:text-sm [&>ul]:text-gray-800 [&>ul]:space-y-1 [&>ul]:mb-2 [&>ul]:ml-4 [&>ul]:list-disc
              [&>ol]:text-sm [&>ol]:text-gray-800 [&>ol]:space-y-1 [&>ol]:mb-2 [&>ol]:ml-4 [&>ol]:list-decimal
              [&_strong]:text-gray-900 [&_strong]:font-semibold
              [&_em]:text-green-700 [&_em]:not-italic [&_em]:font-medium
              [&_hr]:border-green-200 [&_hr]:my-3">
              <ReactMarkdown>{advice.advice}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      {/* Outcome logger */}
      {!logged ? (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="font-semibold text-gray-700 text-sm mb-3">{t('retailer.logOutcome')}</div>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {(['sale_made', 'order_placed', 'no_purchase'] as const).map(o => (
                <button
                  key={o}
                  onClick={() => setOutcome(o)}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                    outcome === o
                      ? o === 'no_purchase' ? 'bg-gray-600 text-white border-gray-600' : 'bg-green-600 text-white border-green-600'
                      : 'border-gray-200 text-gray-600 hover:border-green-400'
                  }`}
                >
                  {o === 'sale_made' ? t('retailer.outcomeSaleMade') : o === 'order_placed' ? t('retailer.outcomeOrderPlaced') : t('retailer.outcomeNoPurchase')}
                </button>
              ))}
            </div>

            <input
              placeholder={t('retailer.productDiscussedPlaceholder')}
              value={product}
              onChange={e => setProduct(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
            />
            <textarea
              placeholder={t('retailer.notesPlaceholder')}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400 resize-none"
            />
            <button
              onClick={submitOutcome}
              disabled={!outcome || logLoading}
              className="w-full bg-green-700 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 hover:bg-green-800 transition-colors"
            >
              {logLoading ? t('retailer.savingOutcome') : t('retailer.submitOutcome')}
            </button>
            {logError && (
              <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {logError}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-green-100 border border-green-300 rounded-lg p-4 text-green-800 font-medium">
          <CheckCircle size={18} /> {t('retailer.outcomeSavedBanner')}
        </div>
      )}
    </div>
  );
}
