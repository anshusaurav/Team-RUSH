'use client';

import { useEffect } from 'react';

/**
 * Silently pings the backend health endpoint on mount and then every
 * 4 minutes to prevent Render free-tier cold starts during demo sessions.
 *
 * Only runs in production (skipped on localhost so dev traffic isn't
 * accidentally sent to the live backend).
 */
export default function BackendPing() {
  useEffect(() => {
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    if (isLocalhost) return;

    const apiBase =
      process.env.NEXT_PUBLIC_API_URL || 'https://syngenta-backend.onrender.com';

    const ping = () => {
      fetch(`${apiBase}/api/reps?limit=1`, { method: 'GET' }).catch(() => {});
    };

    ping(); // immediate warm-up on page load
    const id = window.setInterval(ping, 4 * 60 * 1000); // every 4 min
    return () => window.clearInterval(id);
  }, []);

  return null;
}
