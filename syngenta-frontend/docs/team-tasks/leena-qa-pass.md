# QA pass — Disha

**Owner:** Leena Joseph
**Estimated effort:** ~1.5 hours testing + 30 minutes filing
**Goal:** end-to-end exploratory pass, file 5–8 real findings as GitHub issues using the `qa-finding` template, validate the ones that get fixed before cut-off.

## The deployed surface
- Landing: https://disha-ai-copilot.vercel.app
- Dashboard: https://disha-ai-copilot.vercel.app/dashboard
- Alerts: https://disha-ai-copilot.vercel.app/anomalies
- Reps: https://disha-ai-copilot.vercel.app/reps
- A retailer detail: https://disha-ai-copilot.vercel.app/retailer/RTL_00001?repId=REP_0001

## What to look for (test charter, not a script)

### Cross-cutting
- Switch language EN ↔ हिंदी at every page. Anything that doesn't translate? Anything where the Hindi reads awkwardly?
- Switch reps across at least three states (Bihar, Karnataka, Punjab). Does the auto-language switch behave as expected?
- Resize to mobile (DevTools → 375px wide). Anything that overflows, clips, or stacks weirdly?

### Landing page
- Hero mockup renders on mobile + desktop
- All four feature rows alternate correctly on `md+`
- All CTAs lead somewhere real

### Dashboard
- Map view loads (default). All 5–10 pins visible. Polyline connects them. Clicking a pin opens the popup with priority + score + working "Open retailer" link.
- Toggle to List view. Same retailers shown. Toggle back. Selection persists across reload.
- Stats row: every card has a value (not "—" unless intentional). Acceptance rate shows "—" only when no outcomes — for REP_0001 it should show a percentage.
- Anomaly banner shows correct count.
- Weather strip shows the rep's district.

### Retailer detail
- Inventory list loads. Out-of-stock items rendered in red.
- "Get Next Best Action" button works. Markdown renders (no raw `**` or `##` visible).
- ML Recommendation card shows confidence bar.
- Submit an outcome → page should go to "Visit outcome logged successfully" banner. Return to dashboard → that retailer should be gone from the plan.
- Provider toggle (Gemini/Claude) — does it actually switch?

### Anomalies
- RepSelector at top works. Switching rep changes the territory and the alert list.
- Severity filter (All / High / Medium / Low) filters correctly.
- "Re-detect" button shows progress + reloads list.
- Resolving an alert removes it from the list.

### Reps
- Cards grouped by state with avatar circles.
- Clicking a rep navigates to the dashboard with that rep selected.
- Search filters by rep_id, territory, state, district.

### Offline
- DevTools → Network → Offline. Reload `/dashboard`. The cached plan should still render. Other pages should show the offline shell or cached data.

### Install as PWA
- Chrome address bar → install icon. Should install Disha as a standalone app.
- Once installed, open from start menu / launcher. Should run fullscreen without browser chrome.

## How to file each finding
Open each issue at https://github.com/anshusaurav/syngenta-frontend/issues/new?template=qa-finding.md and fill the template. Add `Closes #X` to the linked PR if the dev fixes it.

## In the presentation
You can speak to:
*"I owned the QA pass. Ran exploratory testing across both languages, mobile and desktop, online and offline, and filed [N] issues. Walked through the install-as-PWA flow on a real phone and verified the offline cache. The team triaged severity together; the blockers were closed before cut-off."*
