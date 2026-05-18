# Checklist Content Freshness (v1.3)

## Goal

The weekly checklist is the daily-engagement workhorse, but its content is — correctly — mostly repetitive: brushing, weigh-ins, ear checks recur because the *care* recurs. The risk is that the whole screen then feels static. Nothing visibly changes week to week, so there's no reason to return, and once the checklist is Premium-gated (see `checklist-weekly-refresh-paywall.md`) there's no reason to keep *paying* — a user could screenshot it once and be "done".

This feature adds a **freshness layer** on top of the stable core checklist. Every week, each pet gets:

- **This week's focus** — a rotated theme (Dental, Paws & nails, Mind & enrichment, …) with a warm, personalized blurb.
- **A "did you know" tip** — rotated from a ~27-entry corpus.
- **Two spotlight tasks** — fresh, genuinely actionable one-offs merged into the checklist as checkable items.

The core checklist ("lots of carry-over is fine") is untouched. The freshness layer is what visibly changes.

## Founder Anchor

Max: *"new info so the user doesn't see identical info and checklists every week … don't want it to feel stale or for people to screenshot it and stop paying."* Repetition in the *care* is honest and correct; the fix is not to churn the core list but to layer genuine, rotating freshness on top of it so the screen rewards coming back.

## User Flow

1. User opens the Checklist (Pawgress) tab.
2. Above the progress bar, a **"This week's focus"** card shows the week's theme + blurb + a "Did you know" tip.
3. The checklist itself leads with **two spotlight tasks** tagged `THIS WEEK`, then the usual recurring core items.
4. Next week (local Monday rollover): the focus card, tip, and spotlight tasks have all rotated to fresh content. The core items carry over as before.

No setting, no opt-in — it's just how the checklist works now.

## Data Model

No storage, no backend. Selection is **deterministic** from `(petId, weekIndex)`:

- `getWeekIndex(date)` — integer that advances once per week at local Monday midnight (Monday's calendar date routed through `Date.UTC` so DST/timezone shifts can't double- or skip-count).
- A djb2 hash of the petId phase-shifts each pet's rotation, so two floofs in one household don't see the same week.
- Rotation is `pool[(weekIndex + offset) % pool.length]` — advances every week, cycles the whole pool before repeating, phase-shifted per pet.

Spotlight tasks are emitted in checklist-item shape with a **week-stamped id** (`wk<index>-<taskId>`) and `cadence: "weekly"`, so each week's tasks are fresh, separately-tracked items and last week's simply fall out of the list.

Content pools live in `src/data/weeklyContent.js`: 12 themes, 18 spotlight tasks, 14 freshness tips — merged with the 13 existing `RULES_OF_THUMB` for the tip corpus. Repeat cadence: themes ~quarterly (feels seasonal), spotlight tasks ~9 weeks, tips ~6 months.

## UI Components

- **New:** `src/components/WeeklyFocusCard.js` — presentational card (focus theme + tip), rendered on `ChecklistScreen` between the Pawgress ring and the progress bar.
- **Modified:** `src/screens/ChecklistScreen.js` — `load()` computes `weeklyContentFor(pet)`, prepends the spotlight tasks to `items`, renders the card.
- **New:** `src/lib/weeklyFreshness.js` — the deterministic engine. **New:** `src/data/weeklyContent.js` — content pools.

## Free vs Premium Gating

**None in this feature.** The freshness engine ships ungated — every user gets fresh content. Gating is a *separate* concern owned by `checklist-weekly-refresh-paywall.md`: that feature decides who sees the personalized checklist vs. a free fallback. This engine is simply the content layer that makes the paywall worth paying for. Built standalone so it can ship before the paywall.

## Sources & Citations

Not a content-heavy clinical feature — themes/tips are general care guidance in the established `RULES_OF_THUMB` voice. No new external sources. Language is care guidance, never diagnosis.

## Language Guardrails

- **Good:** "Give Bella's teeth a little extra attention this week." · "Hands find lumps weeks before eyes do."
- **Bad:** anything diagnostic ("this means your pet has…"), anything urgent/scare-based, anything that positions the app against a vet. The existing checklist disclaimer stays.
- `{pet}` token is substituted with the pet's name (fallback: "your floof").

## Edge Cases & Error States

- **No pet** — `weeklyContentFor(null)` returns empty content; the card renders nothing.
- **Pool empties under a filter** — guarded; `rotate()` returns null, the card hides that zone.
- **Pet ages across a life stage** — the applicable pool changes, so the rotation re-phases once; content stays sensible.
- **Offline** — fully functional; no network involved.
- **Multi-pet** — each pet's rotation is independently phase-shifted.
- **Spotlight checkmark cruft** — week-stamped ids accumulate in `ChecklistState` over time (same as breed/season items already do). Harmless; a one-time cleanup pass is noted out-of-scope.

## Analytics Events to Fire

- `checklist_week_focus` — `{ week_index: int, theme_id: string }`. Fired on checklist load. Privacy: no pet data — `week_index` and `theme_id` are not PII.

## Apple Review Risk Assessment

Negligible. No new permissions, no purchases, no data leaving the device, no backend. Pure on-device content rotation.

## Implementation Estimate

Built. ~2 files new data/lib + 1 new component + ~10 lines into `ChecklistScreen.js`. Status: **code complete on `v1.2-work`** (not yet built into a binary). Verified with a 12-assertion determinism test (rotation stability, weekly advance, per-pet phase shift, species/age gating).

## Open Questions / Decisions Needed

1. Should the **spotlight tasks count toward Pawgress / the "all done" celebration**? Currently they count toward the checklist's "X of N done" but not Pawgress segments. Recommend leaving as-is.
2. Pool sizes — comfortable for ~6 months before any tip repeats. Expand pools before that if desired.
3. When the **Weekly Refresh Paywall** lands, confirm the free fallback checklist also gets *some* freshness (even one rotating tip) so the free tier doesn't feel dead — or deliberately keep freshness as a Premium differentiator.

## Out of Scope

- Premium gating (owned by `checklist-weekly-refresh-paywall.md`).
- Breed-specific freshness content (uses species/age gating only for now).
- A one-time cleanup of stale week-stamped `ChecklistState` keys.
- Server-driven / remotely-updatable content (would require the backend; deliberately kept local).
