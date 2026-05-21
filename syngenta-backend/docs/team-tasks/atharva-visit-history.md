# Task — Visit history endpoint + recent-visits UI strip

**Owner:** Atharva Kesharwani
**Estimated effort:** ~2 hours
**Touches:** backend + frontend (one PR per repo is fine, or one combined)

## Why this matters
The retailer detail page already lists "recent visits" — but it shows the rep's visits to *any* retailer in the territory. On a retailer-specific page, what a rep actually wants is the history scoped to *this* retailer's tehsil. A small `RecentVisitsStrip` closes that loop and gives the rep a memory aid before they walk in.

---

## Part 1 — Backend: `GET /api/reps/:repId/visit-history`

**Query params:**
| Name | Type | Default | Notes |
|---|---|---|---|
| `retailerId` | string | — | If supplied, scope the history to that retailer's tehsil. |
| `limit` | number | `20` | Max rows returned. Cap at 100. |

**Response shape:**
```json
{
  "success": true,
  "total": 7,
  "visits": [
    {
      "visit_date": "2026-03-21T00:00:00.000Z",
      "visit_tehsil": "Patna_T009",
      "visit_type": "retailer meeting",
      "product_recommended": "Actara 25 WG"
    }
  ]
}
```

**Implementation sketch** — add this to `src/routes/reps.ts`:

```ts
router.get('/:repId/visit-history', async (req, res) => {
  try {
    const { repId } = req.params;
    const { retailerId, limit } = req.query as { retailerId?: string; limit?: string };
    const cap = Math.min(parseInt(limit || '20', 10) || 20, 100);

    // VisitLog stores visit_tehsil, not retailer_id. If a retailerId is
    // supplied we look up its tehsil and scope by that.
    const filter: Record<string, any> = { rep_id: repId };
    if (retailerId) {
      const retailer = await Retailer.findOne({ retailer_id: retailerId })
        .select('tehsil')
        .lean();
      if (retailer?.tehsil) filter.visit_tehsil = retailer.tehsil;
    }

    const visits = await VisitLog.find(filter)
      .sort({ visit_date: -1 })
      .limit(cap)
      .select('visit_date visit_tehsil visit_type product_recommended')
      .lean();

    res.json({ success: true, total: visits.length, visits });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

**Smoke test:**
```bash
curl 'http://localhost:3001/api/reps/REP_0001/visit-history?retailerId=RTL_00001&limit=5'
```

---

## Part 2 — Frontend client (`src/lib/api.ts`)

Add the type + the call:

```ts
export interface VisitHistoryItem {
  visit_date: string;
  visit_tehsil: string;
  visit_type: string;
  product_recommended: string;
}

export const getVisitHistory = (repId: string, retailerId?: string, limit?: number) =>
  api.get<{ success: boolean; total: number; visits: VisitHistoryItem[] }>(
    `/api/reps/${repId}/visit-history`,
    { params: { retailerId, limit } }
  ).then(r => r.data);
```

---

## Part 3 — Frontend component (`src/components/RecentVisitsStrip.tsx`)

A small vertical timeline showing the last 5 visits. Date should respect the current locale (`useLocale().locale`). Empty state: "No prior visits to this retailer."

Mount it on `src/app/retailer/[id]/page.tsx` *below* the "Recent Visits" section that already exists, or replace that section with this scoped one (cleaner).

---

## Acceptance checklist
- [ ] `GET /api/reps/REP_0001/visit-history?retailerId=RTL_00001&limit=5` returns up to 5 visits, all in the same tehsil as RTL_00001
- [ ] Calling without `retailerId` returns the rep's overall recent visits
- [ ] `RecentVisitsStrip` renders on `/retailer/[id]` with both EN and HI labels
- [ ] `npx tsc --noEmit` is clean in both repos

---

## Suggested commit messages
```
feat(backend): /api/reps/:id/visit-history endpoint scoped by retailer

When the caller passes a retailerId, the history is scoped to that
retailer's tehsil. Without it, returns the rep's recent visits overall.
Default limit 20, hard cap 100.
```

```
feat(frontend): RecentVisitsStrip on retailer detail page

Calls /api/reps/:id/visit-history with the current retailer to show the
rep their last five visits to that tehsil, with date and product
recommended. Bilingual labels via the i18n dict.
```

---

## In the presentation
You can speak to:

*"I owned the visit-history endpoint and the recent-visits strip on the retailer detail page. The interesting part: our `VisitLog` schema records `visit_tehsil`, not `retailer_id` — the seeded dataset is tehsil-level. So scoping a retailer's history needed a small join: look up the retailer's tehsil first, then filter visits by that. It's a small detail but it's the kind of thing that breaks if you assume the data model is what you'd design it to be."*
