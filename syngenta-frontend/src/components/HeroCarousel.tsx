'use client';

/**
 * Auto-cycling phone-frame carousel for the landing hero.
 *
 * Cross-fades between four product mockups every 3 seconds. Pauses on
 * pointer hover so users can read the current screen. The four slides
 * correspond to the four feature rows below in the landing page so the
 * hero gives a one-screen preview of what's inside.
 */

import { useEffect, useState } from 'react';

const SLIDES = [
  { src: '/screenshot-plan.png',   alt: 'Ranked daily visit plan' },
  { src: '/screenshot-map.png',    alt: 'Map view with TSP-optimised route' },
  { src: '/screenshot-ai.png',     alt: 'Point-of-visit AI briefing' },
  { src: '/screenshot-alerts.png', alt: 'Anomaly feed with severity filter' },
];

const INTERVAL_MS = 3000;

export default function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(
      () => setIndex(i => (i + 1) % SLIDES.length),
      INTERVAL_MS
    );
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <div className="relative flex justify-center md:justify-end">
      {/* Soft glow behind the mockup */}
      <div
        className="absolute inset-0 rounded-[2rem] blur-2xl opacity-60 pointer-events-none"
        style={{ background: 'radial-gradient(closest-side, rgba(22,163,74,0.25), transparent 70%)' }}
      />
      <div
        className="relative rounded-[1.5rem] bg-white border border-gray-200 shadow-2xl shadow-green-900/10 overflow-hidden w-full max-w-[340px]"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        aria-roledescription="carousel"
        aria-label="Disha feature preview"
      >
        {/* Phone-bezel hint */}
        <div className="h-6 bg-gray-50 flex items-center justify-center border-b border-gray-100">
          <span className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Slide stack — all loaded, only the active one is visible.
            Aspect ratio matches the source PNG (390:844) so the frame
            never jumps height as the slide changes. */}
        <div className="relative" style={{ aspectRatio: '390 / 844' }}>
          {SLIDES.map((s, i) => (
            <img
              key={s.src}
              src={s.src}
              alt={s.alt}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
                i === index ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden={i !== index}
              loading={i === 0 ? 'eager' : 'lazy'}
            />
          ))}
        </div>

        {/* Dot indicators */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-white/80 backdrop-blur-sm rounded-full px-2 py-1 shadow-sm">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === index ? 'bg-green-700 w-4' : 'bg-gray-300 hover:bg-gray-400'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
