# User Accounts + Zero-Loss Migration — design (v2.0)

**Status: DESIGN ONLY — not built. Read "Why this is design-only" first.**

## What Max asked for

> "We'll have to ask them all to make accounts (even if they already have the app — include this in the update and make sure they don't lose any of their pics or info or floofs in the process, but yes they should have an account login). If they ARE already paying, they should just get new content without hitting a new paywall."

So: add real user accounts (login), require them for everyone including existing users, migrate every existing user's local data into their account with **zero loss**, and make sure existing paying subscribers are never shown a new paywall.

## Why this is design-only (not built)

This was requested for autonomous, unsupervised work over ~2 hours, with no backend provisioned. I deliberately did **not** build it, because the build is genuinely unsafe to do blind:

1. **It risks irreplaceable data.** A migration moves users' pet photos — including photos of pets who may have passed away — off local storage. A bug means permanent loss. Max's own #1 requirement here is "don't lose their pics or info or floofs." That cannot be *guaranteed* by code written blind and never run against a real Supabase project. Writing an untested destructive-capable migration would be reckless, not productive.
2. **It is the v2.0 "Cloud sync" feature.** `V1_REMOVED_FEATURES.md` and `V2_CHANGELOG.md` already document this exact work — including a required migration approach, explicit anti-patterns, and *"test cases that v2.0 must pass before ship."* It is deliberately deferred and gated behind a careful process. Ad-hoc-building it in 2 hours contradicts Max's own plan for it.
3. **It needs decisions only Max can make** (provider, auth method, hard-require vs. soft-prompt) and **a provisioned Supabase project + Supabase Auth** that doesn't exist yet.
4. **`docs/security-non-negotiables.md`** requires RLS designed before data lands, server-side entitlement checks, and the rest — that's a design pass, then a build, then tests. Not a sprint.

This document is that design pass — done up-front, matching the project's own "write the spec, then implementation sessions just code" philosophy. The build is a follow-up once Max confirms the decisions in **Open Questions**.

## Goal

Add accounts so pet data can live in the cloud (backup, multi-device, and a stable identity for grandfather/paywall rules). Every user gets an account; existing users migrate with zero data loss; existing payers keep Premium seamlessly.

## Recommended provider

**Supabase Auth.** The project already runs on Supabase (Edge Functions for `ai-floof-assistant` and `churn-feedback`). Supabase Auth gives `auth.uid()` for free, which is exactly what the RLS policies in `security-non-negotiables.md` are written against. One platform, one bill, one mental model.

**Auth methods:**
- **Sign in with Apple** — primary. Frictionless on iOS, every user already has an Apple ID, and App Store Guideline 4.8 effectively *requires* it once you offer any other login. Supabase Auth supports it natively.
- **Email magic link** — fallback for users who refuse Apple ID. Magic link over password: no password storage, no "forgot password" flow, lower support burden.

No social logins beyond Apple → keeps the 4.8 surface minimal.

## The migration — the careful part

Approach is the one already committed in `V1_REMOVED_FEATURES.md`: **read local → upload to cloud → keep local as cache → never wipe.**

1. **The app keeps working fully local first.** Accounts are layered *on top of* the existing AsyncStorage + `documentDirectory` store. The local store stays the source of truth until a migration has *verifiably* completed. The app is never gated behind a finished migration.
2. **Prompt, don't wall (initially).** On first launch after the update, show a screen explaining accounts (backup, multi-device, "so your floofs are safe if you lose your phone"). Per Max, everyone is asked. See Open Question 2 on whether it's a hard requirement.
3. **On account creation, migrate:**
   - Snapshot all local data: pets, health records, mood/tummy logs, checklist state, conditions, preferences.
   - Insert rows into per-user Postgres tables (schema below), each stamped with `user_id = auth.uid()`.
   - Upload each pet photo / health-record attachment from `documentDirectory/pets/<id>/` to **Supabase Storage**, via a short-lived presigned URL minted server-side (security Rule 5 — bytes go direct to Storage, not through an Edge Function).
4. **Never delete local data.** Local copies remain as a cache and an undo. If any step fails, nothing is lost — the migration just retries.
5. **Idempotent + resumable.** Each local record carries a `syncedAt` marker. Migration can be killed mid-flight (app backgrounded, network drop) and resumes from where it stopped. Re-running it is a no-op for already-synced records (upsert on a stable id).
6. **Verify before trusting the cloud.** Only after a row + its photo are confirmed present server-side is that record marked synced. The cloud becomes authoritative per-record, not all-or-nothing.

**Anti-patterns (from `V1_REMOVED_FEATURES.md`) — do NOT do these:**
- ❌ A "merge or replace?" prompt. The user shouldn't have to make that call.
- ❌ Gating the app behind a completed migration.
- ❌ Wiping local data on "success."

## RLS schema (per `security-non-negotiables.md` Rule 2)

Every per-user table: `user_id uuid not null references auth.users`, RLS enabled, and policies scoped to `auth.uid()`.

```sql
create table public.pets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  data        jsonb not null,          -- the pet object (name, breed[], photos…)
  updated_at  timestamptz not null default now()
);
alter table public.pets enable row level security;
create policy pets_own on public.pets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Same shape for `health_records`, `mood_logs`, `tummy_logs`, `checklist_state`, `app_prefs`. (Keeping the pet object in a `jsonb` column mirrors the current local schema and avoids a wide migration the first time; columns can be normalized later.) Photos: Supabase Storage bucket, per-user path prefix `pets/<user_id>/…`, Storage RLS scoped to the prefix. Policy unit tests in `supabase/tests/` per the pre-merge gate.

## Existing payers keep Premium (no new paywall)

RevenueCat currently identifies users by an **anonymous** app-user id. On account creation, call `Purchases.logIn(<account-user-id>)` — RevenueCat *aliases* the anonymous id to the account id and the existing entitlement carries over. The active subscription follows the user into their account automatically; they never see a paywall. This is also what makes Premium portable across devices once accounts exist.

## Paywall exemption logic (ties Max's two messages together)

The Weekly Refresh Paywall (`checklist-weekly-refresh-paywall.md`) gates the personalized checklist for **new, non-paying** users only. With accounts, the grandfather flag rides the `user_id` (durable) instead of fragile AsyncStorage — a real improvement. Three cohorts:

| Cohort | Checklist | New paywall? |
|---|---|---|
| Existing **paying** subscriber | Full personalized + freshness | **Never** — entitlement aliased via `Purchases.logIn` |
| Existing **free** user (installed pre-cutoff) | Full personalized (grandfathered) | No — grandfather flag on their account |
| **New** user (post-update) | Week 1 free, week 2+ gated | Yes |

The freshness engine (`checklist-content-freshness.md`) is the *content*; the paywall is the *gate*; accounts provide the *durable identity* the gate keys off.

## Apple review considerations

- **4.8 Sign in with Apple** — satisfied by offering it as the primary method.
- **5.1.1(v) account creation** — apps may require an account when it's tied to a real cloud feature (sync/backup qualifies). But *forcing existing users* to make an account to keep using features they already had is the riskier framing. Recommendation: the app stays usable locally; the account is required to *sync/back up* and for new-user week-2+ content. See Open Question 2.
- **5.1.1(v) account deletion** — once accounts exist, an **in-app account deletion** path is mandatory. Must be designed in from day one (deletes cloud rows + Storage objects; local data may remain).
- **Privacy** — pet data leaving the device for a FloofLife backend is a major privacy-posture change. The Privacy Policy and App Store privacy labels need another update (the churn-feedback update in `legal/privacy-policy.*` is a smaller precedent).

## Edge cases

- Account creation fails / offline → app keeps working locally, retry later. Nothing lost.
- Migration interrupted → resumes from `syncedAt` markers.
- Reinstall + sign in → cloud data restores; local rebuilt as cache.
- Multi-device sign-in → phase 1 is one-way backup + restore; **live two-way sync with conflict resolution is phase 2** (out of scope here).
- User declines the account → see Open Question 2.
- User signs out → local cache remains; app still works.
- A user with a deceased pet's photos → the "never wipe local" rule is exactly what protects this. Emphasized in the test plan.

## Test plan (must pass before ship — per `V2_CHANGELOG.md`)

1. Fresh install → create account → no data, no errors.
2. Existing user, 3 floofs with photos + health records → migrate → every pet, photo, record, checklist tick present in the cloud AND still present locally.
3. Migration killed mid-upload → relaunch → resumes, completes, no duplicates.
4. Airplane mode during/after account creation → app fully usable, migration retries on reconnect.
5. Existing paying subscriber → create account → Premium still active, no paywall shown.
6. Reinstall app → sign in → all floofs + photos restored.
7. Sign out → local data intact, app usable.
8. Account deletion → cloud rows + Storage objects gone; verify.
9. Two pets, multi-pet household → all migrate, active-pet selection preserved.
10. Decline account → defined, non-broken behavior (per Open Question 2).

## Open questions — need Max's decision before build

1. **Provider** — confirm Supabase Auth + Sign in with Apple + email magic link.
2. **Hard requirement vs. soft prompt** — must a user create an account to keep using the app, or is it strongly prompted but skippable (with cloud features (sync, week-2+ content) off until they do)? Soft-prompt is the safer Apple-review and user-trust posture; recommend that.
3. **Migrate everything, or pets+photos first?** Recommend phase 1 = pets + photos + health records; checklist state + logs in a fast follow.
4. **Cutoff date** for the existing-free-user grandfather (same date as the Weekly Refresh Paywall release).
5. **Timeline** — this is the largest single feature in FloofLife's history (auth + per-user RLS schema + Storage + a resumable migration engine + account deletion + extensive testing + two policy/privacy updates). It is realistically **multiple focused sessions**, not one. It should not be rushed into a single build.

## Phasing recommendation

- **Phase 1** — Accounts (Apple + magic link), per-user tables + RLS, one-way migration (read local → cloud, keep local), photo upload to Storage, `Purchases.logIn` aliasing, account deletion, privacy/label updates.
- **Phase 2** — Live two-way multi-device sync with conflict resolution.
- **Phase 3** — Anything that depends on a stable account identity (server-side grandfather flag, cross-device Premium UX).

## Out of scope (for this design)

- Two-way real-time sync / conflict resolution (phase 2).
- Android (not shipped).
- Password auth (magic link instead).
- Social logins beyond Apple.
