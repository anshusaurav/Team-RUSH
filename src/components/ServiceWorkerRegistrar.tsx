'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker in production, and unregisters any existing
 * SW + clears its caches in development.
 *
 * Why we skip dev: the SW is "network-first with /offline fallback" for
 * navigations. During `next dev`, Turbopack restarts on edits and one
 * failing fetch is enough to make the SW serve cached /offline instead of
 * the live page. The dev loop is much better without it.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]';

    if (isLocalhost) {
      // Dev: tear down any lingering SW so a previously-cached /offline
      // page can't keep showing up after a server restart.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister());
      });
      if ('caches' in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
      return;
    }

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => console.log('[SW] Registered, scope:', reg.scope))
      .catch((err) => console.warn('[SW] Registration failed:', err));
  }, []);

  return null;
}
