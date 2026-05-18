'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { getRetailer, getNextBestAction, logOutcome, RetailerDetail, NextBestAction, AIProvider } from '@/lib/api';
import { MapPin, Package, TrendingUp, ChevronLeft, Sparkles, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import ProviderToggle from '@/components/ProviderToggle';

export default function RetailerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const repId = searchParams.get('repId') || 'REP_0001';

  const [detail, setDetail] = useState<RetailerDetail | null>(null);
  const [advice, setAdvice] = useState<NextBestAction | null>(null);
  const [provider, setProvider] = useState<AIProvider>('gemini');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [outcome, setOutcome] = useState('');
  const [product, setProduct] = useState('');
  const [notes, setNotes] = useState('');
  const [logged, setLogged] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(true);

  useEffect(() => {
    getRetailer(id).then(setDetail).finally(() => setDetailLoading(false));
  }, [id]);

  const fetchAdvice = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const result = await getNextBestAction(repId, id, provider);
      setAdvice(result);
      if (result.context_snapshot.currentInventory[0]) {
        setProduct(result.context_snapshot.currentInventory[0].sku_name);
      }
    } catch (e: any) {
      setAiError(e?.response?.data?.error || 'AI request failed');
    } finally {
      setAiLoading(false);
    }
  };

  const submitOutcome = async () => {
    if (!outcome) return;
    setLogLoading(true);
    try {
      await logOutcome({ repId, retailerId: id, outcome, productDiscussed: product, notes, aiRecommendationUsed: !!advice });
      setLogged(true);
    } finally {
      setLogLoading(false);
    }
  };

  if (detailLoading) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-lg animate-pulse" />)}</div>;
  if (!detail) return <div className="text-center py-10 text-gray-400">Retailer not found.</div>;

  const { retailer, inventory, top_products_30d, active_anomalies, recent_visits } = detail;

  return (
    <div className="space-y-4">
      {/* Back + header */}
      <div>
        <Link href="/dashboard" className="flex items-center gap-1 text-sm text-green-700 mb-2">
          <ChevronLeft size={15} /> Back to plan
        </Link>
        <h1 className="text-xl font-bold text-gray-800">{retailer.retailer_id}</h1>
        <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
          <MapPin size={13} /> {retailer.tehsil}, {retailer.district}, {retailer.state}
        </div>
      </div>

      {/* Active anomalies */}
      {active_anomalies.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="font-semibold text-red-700 text-sm mb-1">⚠ Active Alerts</div>
          {active_anomalies.map((a, i) => (
            <div key={i} className="text-xs text-red-600">{a.description}</div>
          ))}
        </div>
      )}

      {/* Inventory snapshot */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 font-semibold text-gray-700 text-sm mb-3">
          <Package size={15} /> Current Inventory
        </div>
        {inventory.length === 0 ? (
          <div className="text-xs text-gray-400">No inventory data</div>
        ) : (
          <div className="space-y-2">
            {inventory.map((inv, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{inv.sku_name}</span>
                <span className={`text-sm font-semibold ${inv.sku_qty === 0 ? 'text-red-600' : inv.sku_qty <= 5 ? 'text-amber-600' : 'text-green-700'}`}>
                  {inv.sku_qty === 0 ? 'OUT OF STOCK' : `${inv.sku_qty} units`}
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
            <TrendingUp size={15} /> Top Sales (30 days)
          </div>
          <div className="space-y-2">
            {top_products_30d.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{p.sku_name}</span>
                <span className="text-gray-500">{p.units} units · ₹{p.revenue.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent visits */}
      {recent_visits.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="font-semibold text-gray-700 text-sm mb-2">Recent Visits</div>
          <div className="space-y-1.5">
            {recent_visits.map((v, i) => (
              <div key={i} className="text-xs text-gray-500 flex justify-between">
                <span>{new Date(v.visit_date).toLocaleDateString('en-IN')} · {v.visit_type}</span>
                <span className="text-green-700">{v.product_recommended}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Recommendation */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 font-semibold text-green-800 text-sm">
            <Sparkles size={15} /> AI Recommendation
          </div>
          <ProviderToggle value={provider} onChange={setProvider} />
        </div>

        {!advice && !aiLoading && (
          <button
            onClick={fetchAdvice}
            className="w-full bg-green-700 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-800 transition-colors"
          >
            Get Next Best Action
          </button>
        )}

        {aiLoading && (
          <div className="flex items-center gap-2 text-green-700 text-sm animate-pulse py-2">
            <Sparkles size={14} className="animate-spin" /> Analyzing data with {provider}...
          </div>
        )}

        {aiError && <div className="text-red-600 text-sm">{aiError}</div>}

        {advice && (
          <div>
            <div className="text-xs text-green-600 mb-2 font-medium">via {advice.provider_used}</div>
            <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{advice.advice}</div>
            <button
              onClick={fetchAdvice}
              className="mt-3 text-xs text-green-600 underline"
            >
              Regenerate with {provider}
            </button>
          </div>
        )}
      </div>

      {/* Outcome logger */}
      {!logged ? (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="font-semibold text-gray-700 text-sm mb-3">Log Visit Outcome</div>
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
                  {o === 'sale_made' ? '✓ Sale Made' : o === 'order_placed' ? '📋 Order' : '✗ No Purchase'}
                </button>
              ))}
            </div>

            <input
              placeholder="Product discussed"
              value={product}
              onChange={e => setProduct(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
            />
            <textarea
              placeholder="Notes (optional)"
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
              {logLoading ? 'Saving...' : 'Submit Outcome'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-green-100 border border-green-300 rounded-lg p-4 text-green-800 font-medium">
          <CheckCircle size={18} /> Visit outcome logged successfully
        </div>
      )}
    </div>
  );
}
