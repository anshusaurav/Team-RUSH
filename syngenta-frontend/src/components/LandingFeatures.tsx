'use client';

/**
 * Visual "Inside Field Co-Pilot" section for the landing page.
 *
 * Four alternating rows. Each row has:
 *   - A small mockup of the actual feature UI (built in CSS/SVG so it stays
 *     responsive and doesn't go stale like a screenshot would)
 *   - A title, two-line description, and "Open in app" link
 *
 * On `md+` the two halves sit side-by-side and the row direction alternates
 * (text–mock, then mock–text). On mobile they stack with the text first so
 * users get the headline before scrolling past the mock.
 */

import Link from 'next/link';
import {
  ArrowRight,
  MapPin,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  Package,
  Clock,
  BrainCircuit,
  CheckCircle2,
} from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import type { ReactNode } from 'react';

// ─── Feature row layout ────────────────────────────────────────────────

interface FeatureRowProps {
  title: string;
  body: string;
  openLink: string;
  href: string;
  mock: ReactNode;
  reverse: boolean;
}

function FeatureRow({ title, body, openLink, href, mock, reverse }: FeatureRowProps) {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center ${
        reverse ? 'md:[&>div:first-child]:order-2' : ''
      }`}
    >
      {/* Text */}
      <div>
        <h3 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
          {title}
        </h3>
        <p className="mt-3 text-base text-gray-600 leading-relaxed">{body}</p>
        <Link
          href={href}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 hover:text-green-800"
        >
          {openLink} <ArrowRight size={14} />
        </Link>
      </div>

      {/* Mock — sits in a soft frame that hints at a phone/PWA screen */}
      <div className="relative">
        <div
          className="absolute -inset-3 rounded-3xl opacity-60 blur-2xl"
          style={{ background: 'radial-gradient(closest-side, rgba(34,197,94,0.18), transparent 70%)' }}
        />
        <div className="relative rounded-2xl bg-white border border-gray-200 shadow-xl shadow-green-900/5 overflow-hidden">
          {mock}
        </div>
      </div>
    </div>
  );
}

// ─── Mock 1: Ranked daily plan ─────────────────────────────────────────

function RankedPlanMock() {
  const items = [
    { rank: 1, retailer: 'RTL_00009', priority: 'urgent', score: 253, tehsil: 'Patna_T009', stockOut: 1, alerts: 8 },
    { rank: 2, retailer: 'RTL_00006', priority: 'urgent', score: 218, tehsil: 'Patna_T006', stockOut: 2, alerts: 6 },
    { rank: 3, retailer: 'RTL_00003', priority: 'high',   score: 184, tehsil: 'Patna_T003', stockOut: 0, alerts: 3 },
  ];
  const priColors: Record<string, string> = {
    urgent: 'border-l-red-500 bg-red-50',
    high:   'border-l-amber-500 bg-amber-50',
  };
  const badgeColors: Record<string, string> = {
    urgent: 'bg-red-600 text-white',
    high:   'bg-amber-500 text-white',
  };
  return (
    <div className="p-4 space-y-2.5">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-gray-500 px-1">
        Recommended visits
      </div>
      {items.map(i => (
        <div
          key={i.rank}
          className={`border-l-4 rounded-lg p-3 ${priColors[i.priority] || 'bg-white border-l-gray-300'}`}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-300 leading-none w-6 text-center">
              #{i.rank}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-800 text-sm">{i.retailer}</span>
                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${badgeColors[i.priority]}`}>
                  {i.priority}
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-0.5">
                <MapPin size={10} /> {i.tehsil}
              </div>
            </div>
            <div className="text-right">
              <div className="font-display font-bold text-green-700 text-lg leading-none">{i.score}</div>
              <div className="text-[9px] text-gray-400 uppercase tracking-wider">score</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] text-gray-600">
            <div className="flex items-center gap-1">
              <Clock size={9} className="text-gray-400" /> 12d ago
            </div>
            <div className="flex items-center gap-1">
              <Package size={9} className={i.stockOut > 0 ? 'text-red-500' : 'text-gray-400'} />
              {i.stockOut > 0 ? <span className="text-red-600 font-medium">{i.stockOut} out</span> : 'In stock'}
            </div>
            <div className="flex items-center gap-1">
              <AlertTriangle size={9} className="text-red-400" />
              <span className="text-red-600 font-medium">{i.alerts} alerts</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Mock 2: Map view with TSP route ───────────────────────────────────

function MapRouteMock() {
  // Stylised pins along a curved route. Coordinates are in a 320x200 viewBox.
  const pins = [
    { x: 60,  y: 150, n: '⌂', color: '#15803d', label: 'Home' },
    { x: 110, y: 90,  n: '1', color: '#dc2626' },
    { x: 165, y: 60,  n: '2', color: '#dc2626' },
    { x: 220, y: 95,  n: '3', color: '#f59e0b' },
    { x: 255, y: 145, n: '4', color: '#f59e0b' },
  ];
  return (
    <div className="relative h-[260px] bg-gradient-to-br from-emerald-50 via-green-50 to-stone-50 overflow-hidden">
      {/* Faint grid suggesting a map surface */}
      <svg className="absolute inset-0 w-full h-full opacity-40" viewBox="0 0 320 260" preserveAspectRatio="none">
        <defs>
          <pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#86efac" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="320" height="260" fill="url(#g)" />
      </svg>
      {/* Dashed route polyline */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 260" preserveAspectRatio="none">
        <polyline
          points={pins.map(p => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#15803d"
          strokeWidth="2.5"
          strokeDasharray="6 6"
          strokeLinecap="round"
          opacity="0.7"
        />
      </svg>
      {/* Pins */}
      {pins.map((p, i) => (
        <div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-full"
          style={{ left: `${(p.x / 320) * 100}%`, top: `${(p.y / 260) * 100}%` }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs text-white shadow-md border-2 border-white"
            style={{ background: p.color, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' }}
          >
            <span style={{ transform: 'rotate(45deg)' }}>{p.n}</span>
          </div>
        </div>
      ))}
      {/* Floating stats badge */}
      <div className="absolute top-3 right-3 bg-white/95 rounded-md shadow-md px-2.5 py-1.5 text-[11px] border border-gray-200">
        <div className="font-display font-bold text-gray-900">11.97 km</div>
        <div className="text-[10px] text-green-700">↓ 17% vs NN</div>
      </div>
      {/* Legend */}
      <div className="absolute bottom-2 left-2 bg-white rounded-md shadow-md px-2 py-1 text-[10px] font-medium text-gray-700 flex items-center gap-2 border border-gray-200">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600" /> Urgent</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> High</span>
      </div>
    </div>
  );
}

// ─── Mock 3: AI next-best-action ───────────────────────────────────────

function AIAdviceMock() {
  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
          <Sparkles size={15} className="text-green-700" />
        </div>
        <div>
          <div className="font-display font-semibold text-gray-900 text-sm">AI Next Best Action</div>
          <div className="text-[10px] text-gray-400">Gemini · Confidence 100%</div>
        </div>
      </div>
      {/* Mock NBA content */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2 text-xs">
        <div>
          <div className="font-bold text-green-900 text-[11px] uppercase tracking-wider">Top 3 Products</div>
          <ul className="mt-1 space-y-1 text-gray-800">
            <li className="flex items-start gap-1.5">
              <CheckCircle2 size={11} className="text-green-700 mt-0.5 shrink-0" />
              <span><strong>Actara 25 WG</strong> — 1 SKU out of stock, growers at tillering stage.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <CheckCircle2 size={11} className="text-green-700 mt-0.5 shrink-0" />
              <span><strong>Score 250 EC</strong> — high humidity forecast next 3 days.</span>
            </li>
          </ul>
        </div>
        <div className="border-t border-green-200 pt-2">
          <div className="font-bold text-green-900 text-[11px] uppercase tracking-wider">Why This Visit</div>
          <p className="mt-1 text-gray-700 leading-relaxed">
            Stock-out + 8 active alerts + 3 nearby growers clicked Score 250 WhatsApp campaign.
          </p>
        </div>
      </div>
      {/* RF strip */}
      <div className="border border-purple-200 rounded-lg overflow-hidden">
        <div className="bg-purple-50 px-3 py-1.5 border-b border-purple-100 flex items-center gap-2">
          <BrainCircuit size={12} className="text-purple-600" />
          <span className="text-[10px] uppercase tracking-wider font-bold text-purple-700">ML Recommendation</span>
        </div>
        <div className="px-3 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-gray-800">Actara 25 WG</span>
            <span className="text-gray-500">100% confidence</span>
          </div>
          <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full w-full bg-green-500 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mock 4: Anomaly alerts ────────────────────────────────────────────

function AnomalyMock() {
  const alerts = [
    { type: 'stock_out',         label: '📦 Stock Out',     sku: 'Actara 25 WG',      sev: 'high'   },
    { type: 'brain_demand_spike',label: '🧠 ML Demand Spike', sku: 'Tilt 250 EC',       sev: 'high'   },
    { type: 'demand_spike',      label: '📈 Demand Spike',  sku: 'Score 250 EC',      sev: 'medium' },
    { type: 'weather_alert',     label: '🌧 Weather Alert', sku: 'Patna · pest risk', sev: 'medium' },
  ];
  const sevStyle: Record<string, string> = {
    high:   'border-l-red-500 bg-red-50',
    medium: 'border-l-amber-500 bg-amber-50',
  };
  const sevBadge: Record<string, string> = {
    high:   'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
  };
  return (
    <div className="p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-red-700 font-display font-semibold text-sm">
          <AlertTriangle size={14} /> 16 active alerts
        </div>
        <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-semibold">
          6 high
        </span>
      </div>
      {alerts.map((a, i) => (
        <div key={i} className={`border-l-4 rounded-lg p-2.5 ${sevStyle[a.sev]} flex items-center gap-2`}>
          <span className="text-[11px] font-medium text-gray-800">{a.label}</span>
          <span className="text-[11px] text-gray-500 font-medium truncate">{a.sku}</span>
          <span className={`ml-auto text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full shrink-0 ${sevBadge[a.sev]}`}>
            {a.sev}
          </span>
        </div>
      ))}
      <div className="text-[10px] text-center text-gray-400 pt-1">+12 more in territory</div>
    </div>
  );
}

// ─── Public component ──────────────────────────────────────────────────

export default function LandingFeatures() {
  const { t } = useLocale();

  const rows = [
    { title: t('landing.cap1Title'), body: t('landing.cap1Body'), href: '/dashboard', mock: <RankedPlanMock /> },
    { title: t('landing.cap2Title'), body: t('landing.cap2Body'), href: '/dashboard', mock: <MapRouteMock /> },
    { title: t('landing.cap3Title'), body: t('landing.cap3Body'), href: '/reps',      mock: <AIAdviceMock /> },
    {
      title: t('landing.cap4Title'),
      body: t('landing.cap4Body'),
      href: '/anomalies',
      mock: <AnomalyMock />,
    },
  ];

  return (
    <section className="bg-stone-50">
      <div className="max-w-5xl mx-auto px-5 py-16 sm:py-20">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            {t('landing.capabilitiesTitle')}
          </h2>
          <p className="mt-3 text-gray-600 leading-relaxed">
            {t('landing.capabilitiesBlurb')}
          </p>
        </div>
        <div className="mt-14 space-y-20 md:space-y-24">
          {rows.map((row, i) => (
            <FeatureRow
              key={i}
              title={row.title}
              body={row.body}
              openLink={t('landing.featureOpenLink')}
              href={row.href}
              mock={row.mock}
              reverse={i % 2 === 1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
