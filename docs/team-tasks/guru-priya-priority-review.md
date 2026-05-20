# Domain review — priority-weight calibration

**Owner:** Guru Priya
**Estimated effort:** ~1 hour reading + 30 min writing your recommendation
**Deliverable:** A comment on a GitHub issue (we'll open it together) with one recommended weight change and a one-paragraph rationale. Optionally, your name in the `Co-Authored-By:` trailer on the commit that implements the change.

---

## Context

The `getVisitPlan` function in `src/services/prioritization.ts` gives every retailer in a rep's territory a daily priority score. The score is the sum of nine factor contributions. Each factor has a different cap on how much it can contribute.

These weights were chosen by intuition during the build. We'd like a sanity-check from someone who thinks daily about how to triage cases under uncertainty — same problem, different domain.

## The nine factors

| # | Factor | Max points | What it means |
|---|---|---|---|
| 1 | Days since last visit | 60 | A relationship that has been quiet too long needs an in-person touch. |
| 2 | Stock-out count | 15 / SKU | A SKU at zero is lost revenue every day it stays at zero. |
| 3 | Low-stock count | 5 / SKU | Sales are about to stop unless reorder happens. |
| 4 | 30-day sales velocity | 20 | High-throughput retailers earn priority over low-throughput ones. |
| 5 | Active anomaly count | 20 / anomaly | Open flags need an in-person check. |
| 6 | Past outcome boost | 10 / outcome | Retailers where prior advice converted get a small lift. |
| 7 | Biological urgency | 25 | Growers in this tehsil are approaching a crop stage that needs Syngenta chemistry. |
| 8 | Digital intent | 15 | Growers in this tehsil clicked a recent WhatsApp campaign. |
| 9 | Weather risk | 20 | Forecast favours pest pressure or heavy rain in the area. |

Thresholds:
- Score ≥ 90 → tagged `URGENT`
- Score ≥ 55 → tagged `HIGH`
- Otherwise → `NORMAL`

## The ask

Pick **one** weight you would change. Frame the recommendation through whichever lens feels natural — clinical triage, decision under uncertainty, asymmetric cost of error.

Some example angles (don't have to use these — yours is better):

> **Biological urgency should rank above stock-out**, because missing a 7-day crop-stage window has an asymmetric cost — the season is gone, there's no second chance. A stock-out can be resolved tomorrow.

> **Anomaly count compounds too quickly** — at 20 points per anomaly, a noisy detector with 5 open flags drowns out genuinely high-signal factors. Cap the contribution at, say, 40 total.

> **Past outcome boost is too small** — in clinical practice, prior responder vs. prior non-responder is one of the strongest priors we have. Bumping the outcome weight to 15 / outcome would let us learn faster from each logged visit.

Post your recommendation as a GitHub comment. One paragraph is enough. Anshu will adjust the code and your name will appear in the commit trailer.

---

## In the presentation
You can speak to (adapt to your actual recommendation):

*"I came at the priority scoring from a clinical-decision-support angle. In medicine we triage under uncertainty constantly — false positives on a screening test have to be balanced against the cost of missing a true positive. I argued that **biological urgency** carries the same asymmetry here: missing a 7-day crop window is far worse than visiting a retailer one week early, because there's no second chance until next season. The team adjusted the weight cap accordingly."*

Or whatever your real recommendation ends up being. The framing — uncertainty + asymmetric cost — is the part that's defensible in Q&A.
