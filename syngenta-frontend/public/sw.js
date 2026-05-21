/**
 * Syngenta Field Co-Pilot — Service Worker
 *
 * Strategy:
 *  - API calls (/api/*): Network-first with offline JSON fallback
 *  - Static assets & pages: Cache-first, populate on first fetch
 *  - Offline page shown when navigation fails entirely
 */

// Bumping this string invalidates all previously-cached entries the next
// time the service worker activates. Bump on any meaningful change to
// caching strategy or precached routes.
const CACHE = 'disha-v2';

const PRECACHE = [
  '/',
  '/dashboard',
  '/anomalies',
  '/reps',
  '/offline',
];

// ── Install: precache app shell ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// ── Activate: purge old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API: Network-first — show cached if offline, or a minimal JSON error
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful GET responses for offline fallback
          if (request.method === 'GET' && response.ok) {
            caches.open(CACHE).then((c) => c.put(request, response.clone()));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) =>
              cached ||
              new Response(JSON.stringify({ error: 'offline', cached: false }), {
                headers: { 'Content-Type': 'application/json' },
              })
          )
        )
    );
    return;
  }

  // Navigation: Network-first, fallback to /offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          caches.open(CACHE).then((c) => c.put(request, response.clone()));
          return response;
        })
        .catch(() => caches.match('/offline') || caches.match('/'))
    );
    return;
  }

  // Static assets: Cache-first
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            caches.open(CACHE).then((c) => c.put(request, response.clone()));
          }
          return response;
        })
    )
  );
});
