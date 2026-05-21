# Disha — Frontend (Next.js 16 PWA)

This is the frontend for **Disha**, the AI Field Co-Pilot for Syngenta agronomists.
Built with Next.js 16 App Router, Tailwind CSS, and Leaflet.

**Live:** https://disha-ai-copilot.vercel.app

For full project context, team details, and setup instructions see the root-level `README.md`.

## Quick start

```bash
npm install
# Create .env.local with NEXT_PUBLIC_API_URL=http://localhost:3001
npm run dev       # http://localhost:3000
npm run build     # production build (enables PWA service worker)
```

## Key directories

```
src/
  app/           Next.js App Router pages
  components/    Shared UI components
  lib/           API client, i18n, hooks
public/          Static assets, PWA icons, service worker
```

## Tech stack

- **Next.js 16** — App Router, RSC, `useSearchParams` with Suspense boundary
- **Tailwind CSS** — utility-first styling
- **Leaflet + react-leaflet** — visit plan map with TSP route overlay
- **ReactMarkdown** — renders LLM advice and territory insight
- **Lucide React** — icons
- **next-pwa / custom SW** — offline caching of visit plan
