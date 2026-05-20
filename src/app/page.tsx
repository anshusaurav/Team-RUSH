'use client';

import Link from 'next/link';
import {
  Sprout,
  Database,
  BrainCircuit,
  Smartphone,
  ArrowRight,
  MousePointerClick,
} from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import LandingFeatures from '@/components/LandingFeatures';
import HeroCarousel from '@/components/HeroCarousel';

export default function LandingPage() {
  const { t } = useLocale();

  return (
    <div className="font-display">
      {/* ─── HERO ─── split layout: copy left, product mockup right ────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-green-50 via-white to-stone-50">
        {/* Decorative blurred accents */}
        <div
          className="absolute -top-24 -right-24 w-[28rem] h-[28rem] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(closest-side, rgba(249,115,22,0.20), transparent)' }}
        />
        <div
          className="absolute -bottom-32 -left-24 w-[32rem] h-[32rem] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(closest-side, rgba(22,163,74,0.20), transparent)' }}
        />

        <div className="relative max-w-6xl mx-auto px-5 pt-24 pb-20 sm:pt-28 sm:pb-28">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 items-center">
            {/* LEFT: eyebrow + headline + CTAs */}
            <div className="animate-fade-up">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-green-200 text-xs font-semibold text-green-800 shadow-sm">
                <Sprout size={13} /> {t('landing.heroEyebrow')}
              </span>
              <h1 className="mt-5 text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-gray-900 leading-[1.05]">
                {t('landing.heroTitle')}
              </h1>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-green-700 text-white font-semibold shadow-lg shadow-green-700/20 hover:bg-green-800 transition-all hover:-translate-y-0.5"
                >
                  {t('landing.ctaPrimary')} <ArrowRight size={16} />
                </Link>
                <Link
                  href="/reps"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-gray-800 font-semibold border border-gray-200 hover:border-green-400 transition-colors"
                >
                  {t('landing.ctaSecondary')}
                </Link>
              </div>
              <p className="mt-6 text-xs text-gray-400 uppercase tracking-wider">
                {t('landing.tagline')}
              </p>
            </div>

            {/* RIGHT: auto-cycling product mockup carousel (4 slides, 3s each)
                showing each of the four features the rep lives in. */}
            <HeroCarousel />
          </div>
        </div>
      </section>

      {/* ─── WHY THIS MATTERS ─────────────────────────────────────────── */}
      <section className="bg-white border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 py-16 sm:py-20">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              {t('landing.whyTitle')}
            </h2>
            <p className="mt-3 text-gray-600 leading-relaxed">
              {t('landing.whyBlurb')}
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            {[
              { v: t('landing.whyStat1Value'), l: t('landing.whyStat1Label') },
              { v: t('landing.whyStat2Value'), l: t('landing.whyStat2Label') },
              { v: t('landing.whyStat3Value'), l: t('landing.whyStat3Label') },
            ].map((s, i) => (
              <div
                key={i}
                className="rounded-2xl bg-gradient-to-br from-green-50 to-stone-50 border border-green-100 p-6 text-center"
              >
                <div className="text-3xl sm:text-4xl font-bold text-green-700 tracking-tight">
                  {s.v}
                </div>
                <div className="mt-2 text-sm text-gray-600 leading-snug">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── INSIDE FIELD CO-PILOT ─── alternating visual feature rows ── */}
      <LandingFeatures />

      {/* ─── HOW IT WORKS ────────────────────────────────────────────── */}
      <section className="bg-white border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-5 py-16 sm:py-20">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              {t('landing.howTitle')}
            </h2>
            <p className="mt-3 text-gray-600 leading-relaxed">{t('landing.howBlurb')}</p>
          </div>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-5 relative">
            {/* Connecting dashed line on md+ */}
            <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 border-t-2 border-dashed border-green-300 pointer-events-none" />
            {[
              { Icon: Database, n: 1, t: t('landing.howStep1Title'), b: t('landing.howStep1Body') },
              { Icon: BrainCircuit, n: 2, t: t('landing.howStep2Title'), b: t('landing.howStep2Body') },
              { Icon: Smartphone, n: 3, t: t('landing.howStep3Title'), b: t('landing.howStep3Body') },
            ].map(({ Icon, n, t: title, b }, i) => (
              <div key={i} className="relative bg-white">
                <div className="w-12 h-12 mx-auto rounded-full bg-green-700 text-white flex items-center justify-center font-bold shadow-md shadow-green-700/20 relative z-10">
                  {n}
                </div>
                <div className="mt-5 flex items-center justify-center gap-2 text-gray-800">
                  <Icon size={16} className="text-green-700" />
                  <h3 className="font-semibold">{title}</h3>
                </div>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed text-center px-4">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TRY THE DEMO ─────────────────────────────────────────────── */}
      <section className="bg-stone-50 border-y border-gray-100">
        <div className="max-w-4xl mx-auto px-5 py-14 sm:py-16">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-green-200 text-xs font-semibold text-green-800 shadow-sm mb-4">
              <MousePointerClick size={12} /> 5-step demo
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              Walk through in under 3 minutes
            </h2>
            <p className="mt-2 text-gray-500 text-sm">REP_0001 · Bihar territory · pre-loaded with synthetic Rabi 2026 data</p>
          </div>
          <ol className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {[
              { n: '1', title: 'Open Dashboard', body: 'REP_0001 is pre-selected. Switch to List view to see ranked visit cards.', href: '/dashboard' },
              { n: '2', title: 'Inspect the "Why"', body: 'Each card shows the top score drivers — stock-out, anomaly, crop stage — with a factor bar.', href: '/dashboard' },
              { n: '3', title: 'Territory AI', body: 'Expand "Territory Intelligence" for an LLM-generated strategic overview of the territory.', href: '/dashboard' },
              { n: '4', title: 'Visit a retailer', body: 'Click any card. Get an RF product pick + Claude or Gemini visit briefing. Switch providers.', href: '/reps' },
              { n: '5', title: 'Log & watch plan refresh', body: 'Log a sale outcome — the retailer drops from the plan and a confirmation banner appears.', href: '/dashboard' },
            ].map((step) => (
              <li key={step.n} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-8 h-8 rounded-full bg-green-700 text-white font-bold text-sm flex items-center justify-center shadow-sm shadow-green-700/20">
                  {step.n}
                </div>
                <div className="font-semibold text-gray-900 text-sm">{step.title}</div>
                <p className="text-xs text-gray-500 leading-relaxed flex-1">{step.body}</p>
                <Link href={step.href} className="text-xs text-green-700 font-semibold hover:underline mt-1 flex items-center gap-1">
                  Go <ArrowRight size={11} />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ─── FINAL CTA ────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-green-700 via-green-700 to-emerald-700 text-white">
        <div className="max-w-3xl mx-auto px-5 py-16 sm:py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t('landing.finalCtaTitle')}
          </h2>
          <p className="mt-3 text-green-50 leading-relaxed">
            {t('landing.finalCtaSubtitle')}
          </p>
          <Link
            href="/dashboard"
            className="mt-7 inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-green-800 font-semibold shadow-lg hover:bg-stone-50 transition-colors hover:-translate-y-0.5"
          >
            {t('landing.finalCtaButton')} <ArrowRight size={16} />
          </Link>
          <p className="mt-8 text-xs text-green-100/80 tracking-wider uppercase">
            {t('landing.madeFor')}
          </p>
        </div>
      </section>
    </div>
  );
}
