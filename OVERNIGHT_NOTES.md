# Overnight Run — 2026-05-07 → 2026-05-11 (v1.2.0 cycle, ongoing)

This file is the running log. **Read the v1.3 STATE section directly below first** — it's the current cycle. The v1.2.0 checkpoint + manifest below it are the prior cycle (historical).

---

# 🎨 v1.3 UX PASS — assistant + home IA + vet (2026-05-21, uncommitted→committed, NOT yet built)

Batch after the #49 build. All committed on `v1.2-work`, **not in any build yet** (next build #50). Build #49's icon was still V1 — fixed here too (`3f320bc`, separate).

- **Floof Assistant — featured + persistent + memory.** New always-on FAB (`src/components/FloofAssistantFab.js`) pinned right-edge vertical-center on every screen except the chat + onboarding forms (App.js tracks `currentRoute`; hidden if AI proxy unconfigured). Per-pet chat memory persisted in AsyncStorage (`aiAssistant.js` load/save/clearChatHistory; `FloofAssistantScreen` restores per floof + Clear-chat control). Featured in the post-onboarding GuidedTour (new step).
- **Home IA.** Health/Tummy/Mood consolidated into one **Floof Trackers** card → `TrackersHubScreen` (labeled circular bubbles). Diet & Care folded into Tummy (entry card in `TummyTrackerScreen` → DietScreen). Cards reordered per Max's spec; Trip Planning→**Trip Planner**. **Toxic Foods & Plants was NOT in Max's stated order — kept appended as last card, flagged for his placement decision.**
- **Vet per pet.** `pet.vet = { name, address }` captured on the My Floofs profile (`VetRow` in YourPetsScreen), one-tap opens Apple/Google Maps search (free link, no Places API — `maps.js` `openMapsForVet`). Included in the Floof Assistant pet context. Vet decision: **free Maps link** (Max chose over billable Places API).
- Verified: `expo export -p ios` produces a clean Hermes bundle (all imports resolve).
- **Open items for Max:** (1) Toxic card placement; (2) can't produce live screenshots here — review in Expo Go/sim or on build #50.

---

# 🚀 v1.3 STATE — backend + accounts + privacy (2026-05-21)

**Theme:** soft-prompt cloud accounts + cloud sync (backup) + privacy compliance, shipped to pass Apple review. Core app stays fully local; accounts are optional and benefit-led.

## Backend — DEPLOYED to Supabase (project `gltwbqtdnxnvhrvmrdpk`)
- DB schema live: 8 per-user tables (pets, health_records, mood_logs, stool_logs, diet_logs, checklist_state, app_prefs, observations) + churn_feedback. All RLS-on, policies scoped `auth.uid() = user_id`. Storage bucket `pet-media` private + 4 per-user-prefix policies.
- Migrations applied: `20260518120000_churn_feedback`, `20260519120000_accounts_and_sync`, `20260521120000_storage_policies_fix` (the last repairs a partial-apply — see [[supabase-partial-migration-gotcha]]).
- **Edge Functions NOT yet deployed** (code ready): `ai-floof-assistant`, `churn-feedback`, `account-delete`, `sync-upload-url`. All 4 IP-rate-limited at the edge. Pending: `supabase secrets set …` + `supabase functions deploy ×4`.
- Apple SIWA client-secret JWT generated (`~/Documents/AppleKeys/apple-oauth-secret.txt`, expires 2026-11-17). Dashboard SIWA config still pending (paste secret + Services ID `com.bassklaft.pawrent.signin` + Team `93RYK7P234` + Key `6W8XSWHVBH`).

## Client — built this session (uncommitted on `v1.2-work`)
- **Auth:** `src/lib/supabase.js`, `src/lib/auth.js` (SIWA + email/password, Purchases.logIn aliasing on sign-in so payers keep Premium). `AccountScreen`, mounted in App.js; reachable via Settings → Account.
- **Soft-prompt:** `src/lib/accountPrompt.js` + `src/components/AccountSoftPrompt.js`. Fires only AFTER a value moment (first Tummy entry / Pawgress ring complete / 2nd pet / 3rd session), never first launch. Min 7 days between, max 3 lifetime, stops on sign-in. Value moments wired into tummy.js, pawgress.js, storage.js; session counter in App.js.
- **Migration engine:** `src/lib/cloudSync.js` — read-local → presigned-upload → keep-local. UPLOAD-ONLY (no restore path; restore is phase 2). Never writes/clears local. `CloudSyncStatusScreen` shows progress.
- **Account deletion:** Settings → Account → Delete account (double-confirm, explains local kept) → `auth.deleteAccount` → `account-delete` function. Apple 5.1.1(v) ✓.

## Privacy compliance
- `legal/privacy-policy.{md,html}` finalized + staged (NOT pushed) — covers accounts/cloud/AI/analytics, region US.
- `app.json` privacy manifest extended: Email, Name, UserID, Health, PhotosorVideos, OtherUserContent — all Linked, none Tracking. EAS regenerates `PrivacyInfo.xcprivacy` from this (CNG; ios/ gitignored).
- In-app on-device claims corrected (ExportFloofData, YourPets empty state, LogStool helper).
- ASC privacy-label checklist + reviewer notes drafted (see session deliverables).

## ⚠️ Known gaps / decisions for Max
- **No restore path** (reinstall → sign in → data back) — phase 2. iOS wipes local on uninstall, so until restore ships, a backup can't actually be recovered. Soft-prompt copy softened to "back up … multi-device sync rolling out soon" to avoid over-promising.
- Cross-user JWT pen test written (`supabase/tests/cross_user_isolation_test.sql`) but needs `supabase test db` (Docker, not running here). Live anon-isolation pen test PASSED (anon gets `[]` + INSERT blocked 42501).
- Privacy contact still `streetparkinfo@gmail.com` (leftover). Settings "Contact support" still `hello@stickaround.app`. Swap before/at GA.

## Migration 10-case results (static analysis; ✓=code supports, device-verify where noted)
1 fresh→account ✓ · 2 migrate+local-intact ✓ · 3 resume-no-dupes ✓ (idempotent upsert) · 4 airplane PARTIAL (usable + manual retry; no auto-retry) · 5 payer-no-paywall ✓ (aliasing; sandbox-verify) · 6 reinstall-restore ✗ NOT BUILT (phase 2) · 7 sign-out-local-intact ✓ · 8 delete ✓ (live-verify) · 9 multi-pet ✓ (active-pet id not in cloud snapshot — app_prefs is `{}`) · 10 decline ✓.

## STOP: no EAS build triggered, nothing pushed to origin or bassklaft.github.io.

---

# 🛑 SESSION CHECKPOINT — paused 2026-05-10 PM / 2026-05-11

## What's shipped (committed + pushed, on `origin/v1.2-work`)

| Commit | Subject | In which build |
|---|---|---|
| `9810d4e` | fix(active-pet): every per-pet screen now reacts to active changes, not just on focus | **Build 43 (in TestFlight pipeline)** |
| `2a64be4` | chore(dev): patch @expo/cli devicectl.js to accept Xcode 26's jsonVersion 3 | Build 43 (dev-only, not in bundle) |
| `9a40e96` | docs: refresh OVERNIGHT_NOTES — builds 22→43 + iOS 26.3.x TurboModule saga | Build 43 (docs only) |
| `0b471be` | fix(active-pet): generation-counter race-protection on every per-pet screen's load() | **Build 44 (not yet triggered)** |
| `e4702bd` | fix(visual): ActivePetChip white-crescent + DogAge stuck-shimmer | **Build 44 (not yet triggered)** |

**Build 43 shipped**: artifact at https://expo.dev/artifacts/eas/t2GrCeMNWmW79RkoJTVStA.ipa — also pre-downloaded to `/tmp/floof-build43.ipa`. Max confirmed it landed on TestFlight and immediately found the carousel-wraparound race + visual bugs that drove the next pass.

**Build 44 NOT YET TRIGGERED.** Two commits are queued on top of build 43's HEAD but the build is held intentionally — the comprehensive review pass was paused mid-flight to save context before laptop close. See "What's in progress" below.

## What's in progress (NOT yet committed — to resume)

Max's ask for this pass: a true one-and-done re-engineering so every switching path (Home swipe carousel, fan-out long-press, ActivePetChip top-right, PetSwitcherModal, My Floofs card tap) propagates to every per-pet card and screen, with no visual glitches, no stuck-loading states, no text/card overflow, no crashes from click-throughs. Specifically called out by Max as "ideal one-and-done — don't be lazy."

### Done in this pass (already committed in `0b471be` + `e4702bd`)

- ✅ Race condition: gen-counter discards stale async results on Home / Checklist / Health / Tummy / Pawgress (`0b471be`). Fixes the "hero card on Cricket, Pawgress subtitle 'Today's 5 pads filled · Elliot'" mismatch from fast wraparound swipes.
- ✅ ActivePetChip avatar size 32 inside 28-px ring → switched to render PetAvatar at size 26 directly with no ring wrapper (`e4702bd`). Removes the visible white crescent in the top-right chip on every pet-scoped screen.
- ✅ DogAgeScreen stuck-shimmer when pet changes mid-animation → replaced one-shot `hasAnimatedRef` gate with a `pet.id`-keyed effect that resets + restarts the shimmer for every pet change (`e4702bd`).

### Comprehensive review pass — COMPLETE (2026-05-11 AM, queued for build 44)

All 9 punch-list items cleared. The single deferred item (#10, visual review via Maestro) stays on hold until the iOS Simulator runtime side-quest is unblocked.

1. ✅ **Diet & Care species filter + pet header + show-all toggle** (`fe89567`) — `DietScreen.js` subscribes to `useActivePet()`, filters ITEMS by active species, shows "[Name]'s Diet & Care" header, "Show all species" toggle for reference use.

2. ✅ **Training Exercises active-pet header + cat-banner** (`014a84f`) — `TrainingScreen.js` shows "[Name]'s Training Exercises" header and a polite cat-banner when active pet is a cat (catalog is dog-focused; cat-specific content queued for future). Content still displayed for single-cat households.

3. ✅ **Toxic Foods + Plants species filter + pet header + show-all toggle** (`bb0716f`) — `ToxicScreen.js` filters foods/plants by active species, "[Name]'s Toxic Foods & Plants" header, "Show all species" toggle.

4. ✅ **Trip Planning active-pet header** (`fac4390`) — `TripScreen.js` shows "Planning a trip with [Name]" header. Content is species-universal so no filter needed.

5. ✅ **Recalls active-pet header** (`4fb64a7`) — `RecallsScreen.js` shows "Recalls & Concerns for [Name]" header. Entries don't carry per-species tags by design — Tummy Tracker already does pet-specific recall-match against logged foods.

6. ✅ **Home Pawgress card consistency** (`f20dbfd`) — Title is now "[Name]'s Pawgress" (always present, always correct). Subtitle is progress-only. Eliminates the "Today's 5 pads filled · Elliot" mismatch class entirely by moving pet.name out of the conditional branch.

7. ✅ **YourPets text-overflow fix** (`453c249`) — `cardHeaderSubtitle` bumped to `numberOfLines={2}` on both Health Considerations and Insider Tips so long breed names ("Domestic Shorthair", "Cavalier King Charles Spaniel") aren't truncated mid-word.

8. ✅ **PhotoManagerSheet write-time correctness — AUDITED, no fix needed.** `persist()` / `pickPhotoIntoSlot()` / `handleAddExtra()` all already resolve `await readActivePetId()` at write time per the defensive pattern from commit `ebc591c`. Photo array re-derives via `useMemo([pet])`, broken-slot tracking resets on `pet?.id` change. `onAfterChange(livePetId)` carries the write-time id so parent reloads against the actual write target.

9. ✅ **Monkey-test code pass + overflow polish** (`d1d3f7f`):
   - **Null-pet crash risk** — every screen that uses `pet.name` unguarded (HomeScreen, HealthTrackerScreen, DogAgeScreen, PawgressScreen, AddHealthRecordScreen, TummyTrackerScreen, SettingsScreen) has an early-return `if (!pet) return <View />` guard upstream. ActivePetTitle handles null-pet by rendering the screen name without a possessive prefix. No crash risk found.
   - **Overflow risk** — Home Pawgress title + subtitle now have `numberOfLines={1}` and `{2}` respectively; Quick Access card title + subtitle now have `{1}` and `{2}`. All other pet-name interpolations are either inside `numberOfLines` parents (cards, chips, list rows) or short-headline contexts that don't wrap problematically.
   - **Stale-closure async race risk** — gen-counter (`0b471be`) protects every `load()` on every per-pet screen. Write paths use either `readActivePetId()` at write time (LogStool/LogDiet/PhotoManagerSheet) or route-param-pinned ids inside modals that cover the tab bar (AddHealthRecord). Checklist + Pawgress toggle handlers use tap-time `pet.id` — semantically correct (user tapped that pet's checkbox) and the race window is microseconds (AsyncStorage write completes before any long-press would trigger fan-out).

### Items 1-9 commit chain (on top of build 43's HEAD `2a64be4`)

```
d1d3f7f fix(home): numberOfLines guards on Pawgress + Quick Access cards
453c249 fix(yourpets): bump cardHeaderSubtitle to 2 lines — fixes breed-name truncation
f20dbfd fix(home): Pawgress card title carries pet.name; subtitle is progress-only
4fb64a7 feat(recalls): active-pet header
fac4390 feat(trip): active-pet header
bb0716f feat(toxic): active-pet header + species filter + show-all toggle
014a84f feat(training): active-pet header + cat-banner
fe89567 feat(diet): species filter + active-pet header + show-all toggle
e4702bd fix(visual): ActivePetChip white-crescent + DogAge stuck-shimmer
0b471be fix(active-pet): generation-counter race-protection on every per-pet screen's load()
```

10. ⏸ **Visual review via Maestro / iOS Simulator** — deferred. Still blocked on iOS Simulator runtime download (~7-10 GB, requires user action in Xcode → Settings → Components). When unblocked, run a Maestro flow that exercises the active-pet switching paths across all tabs.

### Triggering build 44

Ready to trigger. EAS build confirmation rule applies. Build budget: pay-as-you-go this cycle (~$2).

### Triggering build 44

DO NOT trigger until items 1-9 are complete (or Max explicitly says "ship what you have"). Build budget reminder: 97% of monthly EAS credits already consumed before build 43; build 44 is pay-as-you-go (~$2). Confirm with Max via the EAS build confirmation rule before triggering.

---

## Build state at-a-glance

| Build | Commit | Status | Headline |
|---|---|---|---|
| **43** | `2a64be4` (HEAD) | **TRIGGERED, in flight** | Active-pet reactivity fix + dev-only `@expo/cli` devicectl patch |
| 42 | `5f992b3` | Finished EAS, TestFlight status unknown to Claude | Fan-out: tap-anywhere-to-dismiss safety net |
| 41 | `eac83ff` | Finished EAS | Haptics re-enabled on iOS 26.3.x (build 40 proved the disable was unneeded) |
| 40 | `3868882` | Finished EAS | Lifestyle questionnaire ground-up rewrite (bare gesture-responder Views) |
| 39 | `88a205d` | Finished EAS | Re-enabled lifestyle questionnaire with 3 defense-in-depth fixes |
| 38 | `d4893fa` | Finished EAS | Skip photobooth animation (second TurboModule crash on Done tap) |
| 37 | `d7144e5` | Finished EAS | Disabled lifestyle questionnaire app-wide to unblock screenshot capture |
| 36 | `836f77f` | Finished EAS | PawgressPaw v2 ellipse geometry + tagline copy |
| 35 | `b7983c4` | Finished EAS | Haptics 1-tick defer (didn't work, hard-disabled in 35.1 = commit `34dc5ac`) |
| 34 | `7c2a9a3` | Finished EAS | Final paw silhouette — direct trace of reference, **LOCKED** |
| 33 | `b5ae03c` | Finished EAS | Suppress autolinked unused permission strings (Apple privacy fix) |
| 32 | `0794095` | Finished EAS | Optimistic-first active-pet sync, route params, MCI paw, chip layout |
| 31 | `a9503c5` | Finished EAS | Active-pet sync race + empty paw matches filled |
| 30 | `05ff8ab` | Finished EAS | Continuous-touch fan-out + paw match logo + delete-floof + Insider Tips polish |
| 29 | `3884abd` | Finished EAS | Harden against unhandled-rejection paths that abort the JS bridge |
| 28 | `2531771` | Finished EAS | Visual guided tour with arrows + spotlights (replaces text-bullet tutorial) |
| 27 | `f415c31` | Finished EAS | Optimistic active-pet update on card-stack swipe / tap |
| 26 | `c58c50b` | Finished EAS | Pawgress paw silhouette matches MCI tab/chip paw exactly |
| 25 | `fc23865` | Finished EAS | Pawgress paw matches FloofLife logo + check gates on full completion |
| 24 | `efaaa31` | Finished EAS | Collapse About-card by default on My Floofs |
| 23 | `c9f0211` | Finished EAS | Smoother heart pad + clarify "all 5 pads" vs daily checklist |
| 22 | `1c8e6f1` | Finished EAS | Universal PetAvatar — never blank, branded fallback |
| 21 | `8aaf2f5` | Last build documented in pre-update OVERNIGHT_NOTES | Build 20 manifest + guardrail verification |

**Build budget**: 97% of monthly EAS-included credits consumed before build 43. Build 43 onward in this cycle is pay-as-you-go (~$2/build). Next monthly cycle restores 12 included + 3 emergency reserve, ~3 weeks out.

## The defining saga of builds 22→43 — iOS 26.3.x TurboModule crash

This dominated the second half of the v1.2.0 cycle. Six builds (35-41) were spent diagnosing and curing a single recurring crash class.

**Symptom**: `objc_exception_rethrow` on `com.meta.react.turbomodulemanager.queue` — SIGABRT in the native bridge that JavaScript's `Promise.catch` cannot intercept. Surfaced on iPhone 16 Pro / iOS 26.3.x during onboarding's lifestyle questionnaire, the photobooth Done tap, the fan-out gesture termination, and haptics calls.

**Cure** (now an active memory rule — see `feedback_ios_26_3_turbomodule_cure.md`): bare-`View` + gesture-responder rewrites, no `<Pressable>`, no `MaterialCommunityIcons`, no `accessibilityRole` / `accessibilityState`, no emoji. Applied to:
- **Lifestyle questionnaire** (build 40, commit `3868882`): full rewrite using the primitives stack.
- **Fan-out overlay** (builds 41-42): close-on-gesture-terminate + 10s auto-close timer + tap-anywhere-to-dismiss on bare-gesture-responder scrim.
- **Haptics** (builds 35→41): defer-by-1-tick (build 35, didn't work) → hard-disable (35.1) → re-enable (build 41) once the actual culprits were neutralized elsewhere.

The 5-failed-bisect lesson from this saga is the reason `feedback_ios_26_3_turbomodule_cure.md` now says "default to this primitives stack instead of bisect-by-disable."

## Other notable themes since build 21

- **Paw silhouette iteration** (builds 25, 26, 33, 34, 36): five rounds before the silhouette **LOCKED** at build 34 (`7c2a9a3`, direct trace of user reference). PawgressPaw geometry caught up in build 36. The "stop iterating on visuals after 3 rounds" memory rule (`feedback_visual_iteration.md`) was authored partly in response to this stretch.
- **Active-pet sync hardening** (builds 27, 31, 32, 43): three prior passes addressed swipe/tap optimism + AsyncStorage race. Build 43 closes the last gap — screens that didn't subscribe to `useActivePet`'s listener stayed stale after fan-out switches when they were already focused.
- **Privacy / App Store readiness** (build 33): suppressed autolinked unused permission strings via plugins config (previous builds had auto-collected entitlements Apple flagged as undeclared).
- **Onboarding stability** (builds 37-40): lifestyle questionnaire bounced from "disable to unblock screenshots" → "re-enable with 3 fixes" → "ground-up primitives rewrite" → re-enabled cleanly.
- **Fan-out UX** (build 30 onward): continuous-touch slide-to-select, name labels only on hovered/active, three-layer dismiss safety net (terminate fallback + 10s timer + scrim-tap).
- **Visual guided tour** (build 28): replaced the text-bullet welcome card with an arrows + spotlights overlay.

## Build 43 contents (this build)

- `9810d4e fix(active-pet): every per-pet screen now reacts to active changes, not just on focus` — adds `useActivePet` subscription + `activePetId` to load-callback deps on every per-pet screen (Home, Checklist, Health, Tummy, Pawgress, DogAge, Risk, Settings, YourPets); `HealthTracker` + `Pawgress` switch from `route.params.petId` primacy to active-pet primacy; `LogStool` + `LogDiet` resolve write target via `readActivePetId()` at save time; `YourPetsScreen` scrolls to the active pet's card on focus.
- `2a64be4 chore(dev): patch @expo/cli devicectl.js to accept Xcode 26's jsonVersion 3` — dev-only, not in the user bundle. Future-proofs `expo run:ios` against Xcode 26's devicectl output format. Applied via `patch-package`; persists across `npm install` via the new `postinstall` script.

## Open items / what's next

1. **Build 43 → TestFlight smoke test** — focus the test on the active-pet fix:
   - Switch floofs via fan-out from each tab (Pawgress / Home / Tummy / Health / My Floofs). Confirm the destination tab and Home itself show the newly-active pet immediately.
   - Multi-pet swipe deck on Home + Quick Access card navigation should always carry the right pet.id.
   - Log a stool entry while mid-switch (open Log Stool, fan-switch, save). Entry should land on the post-switch pet (write-time resolution).
   - YourPets scroll-to-active when entering the tab with a non-eldest pet active.
2. **TestFlight status of builds 22-42** — Claude has no visibility into Transporter delivery / ASC processing / App Store Review state; Max owns that pipeline.
3. **Tosa Inu** — still parked, needs neutral-framing + BSL country list. Out of v1.2.0 scope.
4. **Dev-client path** — partially diagnosed in the 2026-05-10 session. `@expo/cli` patch landed via `patch-package`; the actual blocker for `expo run:ios --device` is the iPhone-side Dev Mode setup, not the cli. Documented in `patches/@expo+cli+54.0.24.patch` + `package.json` postinstall script. Maestro install attempt was abandoned (wrong package installed, permission denials on installers). Tabled until a calmer session.
5. **Jest test infrastructure** — agreed plan: set up `jest` + `jest-expo` + `@testing-library/react-native` during Apple's next review window so future React-level bugs (like the active-pet pattern) are catchable locally without an EAS build. Tabled for the post-43 review window.
6. **My Vet contact integration** — still spec-stub, v1.4+ candidate (see Appendix section).

## What's NOT in v1.2.0 (carry forward)

The 2026-05-08 manifest below is the v1.2.0 spec lock. Nothing has been added to v1.2.0 scope since — every commit between then and now is a fix, polish, or hardening of items already in scope.

---

# 🚀 v1.2.0 FINAL MANIFEST — locked 2026-05-08 (HISTORICAL — preserved for context)

This was the authoritative wrap-up before build 18 trigger. Builds 22-43 are all incremental fixes/polish on top of this manifest. The features list below is still accurate for what shipped.

This is the authoritative wrap-up before build 18 trigger.

## What landed in v1.2.0

| Area | Summary |
|---|---|
| **Breed catalog** | 78 dog entries + 33 cat entries + 12 new in the late manifest (Bull Terrier, Cardigan Welsh Corgi, English Mastiff, Great Pyrenees, Jack Russell Terrier, Pekingese, Rhodesian Ridgeback, Scottish Terrier, Standard Schnauzer, Tibetan Mastiff, Westie, Xoloitzcuintli) + 3 pit-type breeds (APBT, AmStaff, Staffie) + Munchkin cat + American Curl + Savannah + Selkirk Rex = **123 total breeds**, all audit-quality. ~43 breeds added net-new in v1.2. |
| **Brand-name compliance** | Zero brand-name medications across entire breeds.js. All allergy-related bullets use "modern allergy medications — discuss with your vet whether oral medications, injectable options, or allergen-specific immunotherapy fit." Pimobendan kept as generic class name (Vetmedin parenthetical dropped). |
| **Pit-type breeds (3 entries)** | American Pit Bull Terrier, American Staffordshire Terrier, Staffordshire Bull Terrier — all with neutral framing per Apple-rejection-risk guardrails (no aggression/fighting/tough/guard-dog language; BSL implications mentioned only as practical owner considerations re housing + insurance + travel). |
| **Welfare-aware framing** | Munchkin cat added with the Scottish Fold pattern: honest about the chondrodysplasia welfare debate, citing ICatCare + RSPCA + BVA + GCCF + FIFe positions, balanced care guidance for current owners, "if you have one... if you're considering buying one..." closing. |
| **Multi-pet UX refinement** | Pet card name-as-button + EditPet flow (OnboardingScreen with editMode); pet-name nav title on ChecklistScreen + HealthTrackerScreen ("Falafel's Checklist"); active-pet chip in nav-bar top-right; PetSwitcherModal as the single switching mechanism (replaces whole-card tap). Single-pet households get plain title, no chip. |
| **My Floofs empty state** | Welcoming first-time-user UI with 140×140 paw icon, "Welcome to FloofLife" headline, value prop body, "Add your first floof" CTA → AddPet modal, privacy reassurance line. Replaces the prior dev-speak empty state. |
| **Microchip Phase 1** | New onboarding step + edit screen capturing microchipStatus (`confirmed` / `pending` / `none` / `unsure`) + microchipNumber (15-digit ISO 11784/11785). Existing pets soft-migrate to `microchipStatus: 'unsure'` via fallback default in editMode pre-fill. No alert integration in v1.x. |
| **Light gamification polish** | Smooth LayoutAnimation expand/collapse on About / Health / Tips / Sources / Origin Story cards; celebratory animation + notifySuccess haptic when ALL daily checklist items complete (de-duped per pet/date/itemcount); tapLight haptic on every tab switch. Zero new screens, zero new deps. |
| **v1.1.2-work merge** | 16 conflicts hand-resolved (RLS-style 3-way merges on YourPetsScreen, HomeScreen, OnboardingScreen, App.js, V1_REMOVED_FEATURES.md, package files). Caught and fixed a duplicate-toggleAbout-function bug from the auto-merge that would have silently broken mixed-breed sectionId state. |
| **Pawgress Indicator (NEW)** | Daily-care gamification per docs/features/pawgress-indicator.md. Five-segment paw SVG (4 toe pads + main pad), tap-to-toggle in the modal detail screen, streak counter (consecutive all-5 days, today not required to be complete), Home card, animated celebration overlay (12 floating particles + headline pop) when all 5 fill, Premium history-view teaser. Storage shape mirrors future Supabase `pawgress_days` table per security doc + spec. |
| **Tummy Tracker (NEW)** | Per-pet stool + diet log per docs/features/tummy-tracker.md. Stool entry: Bristol Stool Scale 1-7 with abstract line-art icons (NOT photographic per Apple-review guideline; flagged as v1.3 design polish), color enum, volume, modifiers (mucus / blood / foreign material / undigested food), photo via camera or library, free-text note (LOCAL ONLY). Diet entry: meal type + brand + product + amount + note + SavedFoods autocomplete cache. **FDA recall match: ALWAYS FREE** — fetches openFDA food/enforcement + animalandveterinary endpoints, runs LOCAL fuzzy match against logged foods (third party never sees what user logged). **Vet visit suggestion: ALWAYS FREE** — anomaly detection on stool entries (3+ Bristol 1-2 / 3+ Bristol 6-7 in 48h, blood, black, red_tinged, sudden volume change). Premium gates: 90/365/all-time timeline ranges + PDF export with photos embedded + multi-pet comparison (TBD; not in v1.2 MVP). PDF via expo-print HTML→PDF + expo-sharing iOS share sheet. |

## Commit log (v1.2-work since v1.1.2-work merge)

```
ec9ecb9 docs: update OVERNIGHT_NOTES + HANDOFF for Pawgress + Tummy Tracker landing
3e39368 feat: Tummy Tracker — entry screens, timeline, recall + vet banners, PDF export
[Tummy data layer commit] feat: Tummy Tracker data layer + FDA recall match service
7347be6 feat: PawgressScreen + HomeScreen card integration
77dc710 feat: Pawgress visual components — Paw SVG + Checkmark + Celebration
5e1cc09 feat: Pawgress data layer (storage helper + segment defs + streak logic)
df57e90 deps: add expo-print + react-native-svg for Pawgress + Tummy Tracker
a4fd685 docs: HANDOFF.md — cold-start context for new Claude Code conversations
6120fa8 feat: light gamification polish — animations + celebration + tab haptics
8f56861 feat: microchip data capture in onboarding (Phase 1 — no alert integration)
41c7cc2 feat: My Floofs welcoming empty state with CTA
9a586c3 feat: Munchkin cat with welfare-aware framing (modeled on Scottish Fold)
14491bc feat: 3 pit-type breeds — APBT, AmStaff, Staffie (neutral framing)
fc1ff1f feat: 5 new breeds — Westie, Xoloitzcuintli, American Curl, Savannah, Selkirk Rex
d3e6c04 feat: 5 new dog breeds — Pekingese, Rhodesian Ridgeback, Scottish Terrier, Standard Schnauzer, Tibetan Mastiff
0d271fe feat: 5 new dog breeds — Bull Terrier, Cardigan Welsh Corgi, English Mastiff, Great Pyrenees, Jack Russell Terrier
ef09744 docs: update PRE-BUILD-18 checklist for multi-pet UX changes
39e483e feat: pet-name nav title + active-pet chip + switcher modal (multi-pet)
8ed4791 feat: pet card name-as-button affordance on My Floofs
27de1ee feat: add editMode to OnboardingScreen + EditPet route
9665f7d docs: pre-implementation note for multi-pet UX refinement
95f4a05 docs: add Microchip integration roadmap (v1.3 → v2.5+)
acc58c4 audit: brand-name guardrail compliance for 6 out-of-scope breeds
666f60a docs: add PRE-BUILD-18 manual checklist to OVERNIGHT_NOTES
145a2e0 audit: H1-H3 brand-name guardrail compliance + visual-verification static pass
d6a256f docs: update OVERNIGHT_NOTES with merge resolution log
0a7b215 Merge v1.1.2-work into v1.2-work
```

(Also on `main`: `b1b5668 docs: add security non-negotiables for backend work` — reference doc for the post-v1.2.0 backend buildout.)

---

## Build 18 — TRIGGERED 2026-05-08 — REJECTED BY APPLE (Transporter)

**Status**: ✅ Build artifact built successfully on EAS. ❌ Apple rejected the Transporter upload with `Validation failed (409): Invalid Pre-Release Train. The train version '1.1.0' is closed for new build submissions`.

**Root cause**: `app.json` was still on `"version": "1.1.0"` — same marketing version as builds 15/16/17 which already shipped to App Store. Apple closes the marketing-version "train" once that version is released; new builds with the same marketing version are rejected.

**Fix landed**: bumped `app.json` `"version"` from `"1.1.0"` to `"1.2.0"` in commit `[next]`. Re-trigger of EAS build will produce **`1.2.0 (19)`** (auto-increment continues — Apple doesn't require build numbers to reset per train, just monotonic within a train).

**Build budget impact**: the failed build 18 (with version 1.1.0) consumed 1 of 2 EAS credits this cycle. The corrected re-trigger consumes the **emergency credit** — leaving 0 EAS credits this cycle. Per the build budget memory, "emergencies bypass" the 1-build-per-week rule, and a build that's literally rejected by Apple is the canonical emergency case. The next regular cycle (~3 weeks out) restores 12/month + 3 emergency reserves.

**Lesson for future major-version releases**: bump `app.json` `"version"` BEFORE triggering the EAS build, not after. The EAS auto-increment only handles build number, not marketing version. Add a pre-build version check to the manual checklist.

---

## Build 19 — TRIGGERED 2026-05-08 (replaces failed build 18)

**Status**: ✅ Build finished successfully on EAS. Awaiting Transporter upload + ASC processing.

**Marketing version**: `1.2.0` (fresh train, no prior 1.2.0 builds).
**Build number**: `19` (auto-incremented from 18).
**Tag**: `1.2.0 (19)`.

**HEAD at trigger**: `e977d63` (fix: bump app.json version 1.1.0 → 1.2.0 + log Apple rejection)

**EAS build details page**: https://expo.dev/accounts/bassklaft/projects/pawrent/builds/443e44bd-461d-4211-9764-92caaebfe1c8

**iOS .ipa artifact**: https://expo.dev/artifacts/eas/9qLj9nk4Y8nxJ1RDBmMmsL.ipa

**Trigger message**: "v1.2.0 build 19 — fix Apple 1.1.0 train-closed rejection (app.json version 1.1.0 → 1.2.0); same Pawgress + Tummy Tracker + 43 new breeds + multi-pet UX + microchip Phase 1 payload as failed build 18"

**EAS-build confirmation rule applied** (per the new memory rule from this session): user explicitly confirmed the trigger ("i confirm") before the command ran. Pay-as-you-go billing was enabled at this point — ~$2/build.

**Transporter delivery**: ✅ DELIVERED on 2026-05-08 at 2:38 PM via Transporter. ASC processing finished. App ID `6764378399`. No validation errors. The 1.1.0 train-closed rejection from build 18 is fully resolved.

### Build 19 smoke-test feedback (in progress as of 2026-05-08)

User running through the 22-section checklist on TestFlight build 19. Mid-test feedback so far:

**Working** ✓:
- Chip number capture in onboarding + edit
- Haptic feel across the app
- Pet-switcher chip + tappable title at the top of Checklist / Health Tracker (the multi-pet UX refinement landed clean)

**DEFERRED to its own focused session — multi-photo / photobooth onboarding (big scope)**:

User asked: "the app asks you to upload 5 pics of your pet and itll use different ones in different places so its not stale always looking at the same pic of your pet". Each upload prompted with a cute reel-style cue:
1. "the day you met"
2. "them in their happy place"
3. "a silly one"
4. "looking their finest"
5. "latest pic of them"

Plus: at the end, a photobooth-printer animation showing the 5 photos printing onto a reel, the reel spinning, then disappearing — landing user on My Floofs.

Plus: tapping the active-pet banner on Home should let you ADD or REMOVE photos from that 5-photo collection (banner currently has no tap action).

**Why this is its own focused session, not folded into the smoke-test batches**:
- Schema change: `pet.photoUri: string` → `pet.photos: string[]` with `pet.photoUri` retained as a backward-compat mirror of `photos[0]`. Touches storage layer + every read site.
- Onboarding redesign: replace the single photo step with 5 sequential cued steps, each with custom prompt text + skippable per-step.
- Photobooth animation: real motion design — 5 photos emerging from a "printer" stack at the top, joining a reel that scrolls + rotates + fades. Probably 30-60 min of focused animation work.
- Photo manager UI: a new screen / modal where the user can see their 5 photos for a given pet, replace any one, add a new one, remove (with constraints — can't go below 1).
- Banner-tap-to-edit: depends on the photo manager existing.
- Multi-site photo rotation: pick a different photo URI for different display sites (Home hero / My Floofs card avatar / chip avatar / fan-out circle / breed card photo). Needs a deterministic rotation strategy so the same pet doesn't show the same photo in two adjacent places.
- Migration: existing v1.0/v1.1/v1.2 pets get `photos: [photoUri]` on first read. Edit-pet pre-fill needs to handle both shapes.

Estimated 2-3 hours focused work. Worth doing properly as one cohesive feature commit cluster rather than scattered partial work. Will scope when the user asks.

**Asks for the next build** (not in build 19; queued for build 20):

1. **"Add Another Floof" button → top of My Floofs page**, above the "💝 The pets you love, sorted oldest first..." intro line. JSX reorder.
2. **Tap whitespace next to a pet's card on My Floofs → make that pet active.** Restores whole-card-tap-to-select (removed in `8ed4791` when name-tap became the edit path). New rule: tap NAME → edit; tap PHOTO → change photo; tap card body / whitespace → select active.
3. **Home should show a collage of your whole floof family**, not just the active pet's photo. Multi-pet households only — single-pet keeps current single-pet hero.
4. **Long-press on My Floofs tab icon → mini list of floofs popup** (release-finger-on-name to switch). Earlier deferred to v1.3 due to needing `react-native-ios-context-menu` for slide-to-select. v1.2.0 pragmatic take: tap-to-select instead of slide-to-select.
5. **Tosa Inu** still parked — needs neutral framing + BSL country list, separate decision.

---

## Build 21 — TRIGGERED 2026-05-08 — ✅ EAS BUILD FINISHED

**Status**: ✅ Build finished successfully on EAS Production tier. Awaiting Transporter upload + ASC processing.

**Build number landed as 21, not 20** — first eas-build attempt was rejected at the billing stage (free-plan iOS quota exhausted, pay-as-you-go didn't auto-engage), but EAS had already auto-incremented buildNumber 19 → 20 on the remote when the project files were uploaded. After the user upgraded to the Production tier ($19/mo) and the retry succeeded, EAS auto-incremented again 20 → 21. ASC doesn't care about gaps in build numbers — #20 will simply not exist in TestFlight, and the next build will be #22.

**HEAD at trigger**: `8aaf2f5` (docs: log v1.2.0 build 20 manifest + guardrail verification — note the doc was written pre-trigger when we still expected #20)

**Marketing version**: `1.2.0` (same train as build 19).
**Build number**: `21` (auto-increment from 20 → 21 on retry).
**Tag**: `1.2.0 (21)`.

**EAS build details page**: https://expo.dev/accounts/bassklaft/projects/pawrent/builds/414100a5-0b75-46c9-8510-0e75dd627ce6

**iOS .ipa artifact**: https://expo.dev/artifacts/eas/94mxEM5wvQBEnfuRrNboDu.ipa

**Trigger message**: "v1.2.0 build 20 — multi-photo schema (photoUri→photos[]) + 5-photo onboarding reel + photobooth animation + banner photo manager (max 10/pet) + multi-photo rotation across hero/collage/chip/cards + slide-to-select on fan-out (PanResponder, no new native deps). 20/20 migration tests pass. Guardrails A-E verified."

**EAS-build confirmation rule applied**: User explicitly confirmed the retry ("Confirmed yes per the EAS build confirmation rule") after upgrading their plan. ~$2 pay-as-you-go would have applied; with the $19/mo Production tier subscription, additional builds in this cycle are included up to the plan limit.

### What landed in build 20 (commits 45d62c5 → 7195411)

| # | Item | Commit |
|---|---|---|
| 7 | **v1.2 photo schema migration** — `pet.photoUri: string` → `pet.photos: string[]` with `photoUri` retained as a backward-compat mirror of `photos[0]`. Idempotent via `pet.schemaVersion = 2` short-circuit, wrapped in try/catch (guardrail D) so corrupted records are returned unchanged rather than risk losing user data. Pure helpers extracted to `src/lib/petPhotos.js` so the migration logic is unit-testable from plain Node — no AsyncStorage / no React Native runtime in the dependency chain. **20/20 unit tests pass** (`node scripts/testPhotoMigration.mjs`). | `45d62c5` |
| 6 | **5-photo onboarding reel + photobooth strip animation** — replaces the single-photo step with 5 cute reel-style prompts ("The day you met", "Them in their happy place", "A silly one", "Looking their finest", "Latest pic of {pet}"). Each prompt individually skippable; "Skip all photos · add later" one tap away on every prompt (Apple Guideline 4.0 + guardrail B: complete-skip path < 90s). After persistence, photos slide down from the top and settle into a strip with date label, ≤ 3.5s, with a visible "Skip" button at top-right at all times (guardrail C). Edit-mode skips the animation. Photos go to `documentDirectory` only — never to camera roll (guardrail E). | `3ecb5e6` |
| 8 | **Multi-photo rotation across display sites** — `pickPhotoForSlot(pet, slot, opts)` chooses different photos for different surfaces, deterministically per (petId, slot, day-or-session bucket). Slots: `hero` (rotates daily), `collage` (per-tile-index — adjacent tiles never collide), `chip` (rotates daily, independent seed from hero), `card` (rotates per session), `primary` (always `photos[0]` for fan-out + switcher — canonical face). Pets with one photo or legacy `photoUri`-only fall back gracefully. | `92730c2` |
| 9 | **Banner tap-to-edit photo manager** — new `PhotoManagerSheet` with up to `MAX_PHOTOS_PER_PET = 10` per pet. Tap home banner (single-pet hero) to open scoped to active pet; "Manage photos" pill appears below each My Floofs card avatar. Add path uses existing `pickPetPhoto` (sandbox-only — guardrail E preserved). Tap a non-primary photo to "Make primary" (reorders to `photos[0]`); tap any photo to "Remove" with destructive-style confirm. At-cap state hides the Add tile and shows "Max reached · remove one to add more." | `2f5f495` |
| 10 | **Continuous slide-to-select on fan-out** — implemented with **RN's built-in PanResponder, no new native deps** (no `react-native-gesture-handler`, no `expo prebuild` required). Both interactions in one gesture system: TAP a circle picks it (preserved); SLIDE-TO-SELECT means touch anywhere → drag finger across the arc → release on a circle to pick it. Hovered circle scales to 1.18x with active-pet ring + brighter shadow + light haptic on hover transitions. Release outside any circle dismisses without picking. Inner circles use `pointerEvents="none"` so the parent's PanResponder owns the gesture end-to-end. | `7195411` |

### Guardrails verification

- **A. Photo permission strings clear and non-promotional** — `pickPetPhoto` (sandbox library + sandbox-only camera options) uses neutral copy ("Allow photo access in Settings to add a picture of your pet"). No marketing language.
- **B. ALL onboarding skippable, complete-skip path < 90s** — every photo prompt has explicit Skip; "Skip all photos · add later" one tap away. Microchip step accepts "I'm not sure"; age/weight already optional. Tap-tap-tap through the form is < 30s.
- **C. Photobooth animation skippable, ≤ 3-4s** — Skip button visible top-right at all times during animation. Total runtime ≤ 3.5s (1.4s entrance + 0.9s hold + 0.5s exit). Empty-photo case auto-dismisses immediately.
- **D. Schema migration safety** — `normalizePetPhotos` wrapped in try/catch; idempotent via `schemaVersion = 2` short-circuit; persists `schemaVersion` flag once on first migration. 20/20 unit tests pass including null-defensive, multi-photo preservation, idempotency, out-of-sync `photoUri` repair, and full v1.1.x record fidelity (no field loss).
- **E. Photos NEVER to camera roll** — `pickPetPhoto` only calls `launchImageLibraryAsync` (never camera, never `saveToPhotos`). Files copied to `documentDirectory/pets/{petId}/`. `pickTummyPhoto` (separate code path, untouched in build 20) already had explicit camera-roll-disabled comment.

### Pre-trigger checklist before build 20 EAS

- [ ] User confirms via `feedback_eas_build_confirmation.md` prompt (~$2 pay-as-you-go).
- [ ] On confirm: bump `app.json` build number? (autoIncrement should handle, verify EAS config.)
- [ ] Trigger via `eas build --platform ios --profile production` (no `--non-interactive` since auto-increment requires git clean state).
- [ ] After build success: download `.ipa` → Transporter → ASC processing → smoke-test on MaxiTaxi.

### Build budget impact

Per `feedback_build_budget.md`: this cycle had **1 discretionary build + 1 emergency reserve**. Build 18 used 1, build 19 used the emergency replacement (Apple 1.1.0 train rejection ≈ emergency). Build 20 would consume the next discretionary credit. **Confirm budget room before triggering** — or defer the EAS build to next cycle (12/month + 3 emergency reserve, ≈3 weeks out).


- Pawgress (data + visuals + screen + Home card integration)
- Tummy Tracker (entry screens + timeline + recall match service + vet visit suggestion + PDF export + Home card)
- 43 net-new breeds (12 dogs from late manifest + 3 pit-type with neutral framing + Munchkin with welfare-aware framing + 5 cats + earlier batches)
- Multi-pet UX refinement (name-as-button + chip + nav title)
- Microchip Phase 1
- Empty state polish + light gamification polish
- All brand-name medications removed from breeds.js
- v1.1.2-work merge resolution intact (toggleAbout dedup bug fix preserved)





**HEAD at trigger**: `b5ac42b` (chore: gitignore /ios/ and /android/ — generated by expo prebuild)

**EAS build details page**: https://expo.dev/accounts/bassklaft/projects/pawrent/builds/539bac92-89b1-4758-99f3-9e61cb060df4

**iOS .ipa artifact**: https://expo.dev/artifacts/eas/bjNTSuqX33p56MMQpxvXdG.ipa

**Build config**:
- Profile: `production`
- Apple Team: `93RYK7P234` (MAXWELL BERNARD KLAFTER, Individual)
- Distribution Certificate: serial `43D6AAAADAC86205FF383B681EF59E0B`, expires Wed 21 Apr 2027
- Provisioning Profile: Developer Portal ID `D43479MMVA`, expires Wed 21 Apr 2027
- Bundle ID: `com.bassklaft.pawrent`
- Project upload size: 9.2 MB
- Free-tier queue (paid-tier upgrade pending; not blocking)
- Trigger message: "v1.2.0 build 18 — Pawgress + Tummy Tracker + 43 new breeds + multi-pet UX refinement + microchip Phase 1"

**Pre-trigger cleanups landed in commit `b5ac42b`**:
- Reverted `package.json` script changes that local `expo run:ios` had introduced (managed-workflow scripts restored)
- Added `/ios/` and `/android/` to `.gitignore` so future local prebuilds don't pollute the working tree (the existing `ios/build/`, `ios/Pods/`, `android/build/` lines preserved as redundant-but-harmless)

**Build budget update** (per `feedback_build_budget.md` memory):
- **1 of 2 EAS credits consumed** this cycle
- **1 emergency credit remaining** until the next cycle (≈3 weeks out, then 12/month + 3 emergency)

## Path to TestFlight + Review (manual steps)

Per the established Transporter-fallback pattern (per `feedback_transporter_fallback.md` memory — EAS Submit free-tier queue is slow; Transporter is faster):

1. **Download the .ipa** from the artifact URL above.
2. **Open Transporter** (Apple's standalone app — Mac App Store).
3. **Drag the .ipa into Transporter**, sign in with the same Apple ID as App Store Connect, click **Deliver**.
4. **Wait ~5-15 min for ASC processing** — email arrives when build 18 appears in TestFlight.
5. **Add build 18 to TestFlight** on the test iPhone (MaxiTaxi).
6. **Run the PRE-BUILD-18 MANUAL CHECKLIST below** — sections 1-22.
7. **If all 22 pass**: in ASC → My Apps → FloofLife → 1.2.0 → "Add for Review". Submit.
8. **If anything fails**: do NOT submit. Fix, re-build (consumes the emergency credit), re-test.

**Do NOT submit to App Store Review until after the smoke test passes on the TestFlight build.**

## Pre-build context — dev-client detour (skipped)

Before triggering build 18 we briefly attempted a local dev-client smoke test via `npx expo run:ios` against the iPhone (MaxiTaxi, iPhone 16 Pro, iOS 26.3.1). Outcome:
- Prebuild ran cleanly (created `./ios`, ran `pod install` after Homebrew-installed CocoaPods 1.16.2 — system Ruby gem install was blocked by macOS read-only system Ruby, Expo CLI fell back to brew automatically)
- Build then failed at device-detection due to a known incompatibility between **`@expo/cli` 54.0.24** (the version bundled with Expo SDK 54.0.0) and **Xcode 26.3's `xcrun devicectl` JSON output format**. Error: `Unexpected devicectl JSON version output... CommandError: No iOS devices available in Simulator.app`
- Retry with explicit UDID (`00008140-000658A12253001C`) failed identically — the bug is in Expo's pre-xcodebuild device pick step, before any UDID is actually used
- Latest `@expo/cli` line is 55.x but bumping major-version would have introduced peer-dep risk with SDK 54
- Pivoted to opening Xcode workspace GUI directly (`open ios/FloofLife.xcworkspace`) for a manual build path, started Metro on `:8081` separately for dev-client mode
- During this period the Mac's LAN IP shifted from `192.168.12.64` → `192.168.12.65` (DHCP renewal); the Expo Go QR I had generated pointed at the old IP, hence the user's "request timed out" error on iPhone
- Even after correcting the IP, Expo Go would have failed at runtime because the project includes `react-native-purchases` (RevenueCat) which is a native module not in Expo Go
- User decision: skip the local smoke test entirely, trigger production build 18, smoke-test against TestFlight build instead

This experience is captured for future reference: **for any future local dev-client work on this project, the @expo/cli version needs to be at least the patch that ships the Xcode 26+ devicectl fix** (55.x line). Until then, Xcode workspace GUI is the working path. EAS production builds are unaffected — they don't use the local devicectl pipeline.

---

## PRE-BUILD-18 MANUAL CHECKLIST — sections 1-22

Walk through this on the physical device after build 18 lands in TestFlight (or via the Expo dev server for a quick pass), before submitting to App Review. Each item is a 30-60 second smoke test. **Pass criteria: all 22 sections green. If any item fails, do NOT submit build 18 — fix and rebuild first.**

### 1. Onboarding (fresh install — clear app data first or install on a clean test device)
- [ ] App launches without crash
- [ ] Onboarding step 1: Name + species selection works; "Next" enabled when name entered
- [ ] Onboarding step 2: breed picker — single-breed dog selection works; chip toggles selected/unselected; Maximum-of-3-breeds enforced when picking 4th
- [ ] **Cat-coat-pattern hint**: switch species to cat → tap "Tabby, Tortoiseshell, or Calico?" hint → confirm Alert appears with 3 options → "Use Domestic Shorthair" pre-selects domestic shorthair → "Use Mixed Cat" pre-selects mixed cat → both work
- [ ] Onboarding step 3: photo picker opens; "Skip for now" works
- [ ] Onboarding step 5 (final details): age + weight inputs accept decimals; finish creates pet successfully; redirects to Home

### 2. Single-breed dog (Falafel = Chow Chow, your primary test pet)
- [ ] My Floofs tab → Falafel's card renders with photo, name, breed, age
- [ ] **About card defaults expanded** — visible immediately when opening the card
- [ ] **Health Considerations card defaults collapsed** — only the header visible; tap to expand → all 6-7 health bullets render
- [ ] Tap About card header → collapses; tap again → re-expands. State persists when scrolling.
- [ ] Inside About card (when expanded): Origin Story + Sources are collapsible sub-sections; tap each → expands inline; tap again → collapses
- [ ] Tips card: collapsed by default; header reads "💡 Insider Tips · X things only Chow Chow owners know"; tap → expands

### 3. Mixed-breed dog (test by adding a hypothetical Goldendoodle pet via "Add another pet")
- [ ] Add another floof → onboarding → pick "Labrador Retriever" + "Poodle" (or any 2 breeds — "Goldendoodle" itself is a valid single breed in our catalog, so for true mixed-breed testing pick TWO different ones)
- [ ] My Floofs tab → 2 pets visible
- [ ] On the mixed-breed card: TWO separate About cards render (one per breed), TWO separate Health Considerations cards
- [ ] Each About card has its own breed-section header (small label with emoji + breed name)
- [ ] **Independent state**: expand About on breed 1, collapse About on breed 2 → confirm they're independent (toggling breed 1 doesn't toggle breed 2)
- [ ] Same independence on Health Considerations and Tips

### 4. Multi-pet UX refinement (multi-pet only)

The whole-card tap on My Floofs was REMOVED. Active-pet switching now lives on the nav-bar of pet-scoped screens via a chip + tappable title. The pet card name is the dedicated tap target for editing.

- [ ] My Floofs tab with 2+ pets: cards do NOT show a "Tap card to make active" hint anymore (whole-card tap removed)
- [ ] Currently active pet still shows "✓ ACTIVE" badge + green border
- [ ] Eldest pet still shows "👑 ELDEST" badge
- [ ] Tap anywhere on the card body (NOT name, NOT photo) → nothing happens (informational only)
- [ ] **Tap pet NAME** (with pencil icon next to it) → EditPet modal opens pre-filled with the pet's data → change something → "Save changes" → modal closes → My Floofs reflects the change
- [ ] Tap pet PHOTO → photo picker opens (existing single-purpose behavior preserved)
- [ ] Edit modal "Cancel" button → closes without saving
- [ ] **Checklist tab title shows "Falafel's Checklist"** in the nav bar (replaces the Logo on this tab); for multi-pet, title has a chevron-down + is tappable to open the switcher modal
- [ ] **Checklist tab nav-bar top-right**: small avatar + first-name chip (multi-pet only); tap → switcher modal opens
- [ ] **Health Tracker title shows "Falafel's Health Tracker"** in the nav bar; same chevron + chip pattern as Checklist
- [ ] Switcher modal: page-sheet shows all pets with avatars; active pet has accent-colored border + "ACTIVE" pill; tap a non-active pet → modal closes → all pet-scoped screens reflect the new active pet
- [ ] Switching from pet A to pet B updates: ChecklistScreen content (checks, items), HealthTrackerScreen content (records), HomeScreen hero photo, and the chip itself
- [ ] **Single-pet households**: NO chip in nav bar, title is plain text (no chevron, not tappable)
- [ ] Per-pet checklist state: switch from pet A to pet B → confirm pet B's checklist reflects pet B's checks, not pet A's (Falafel's "brushed teeth" check should NOT appear on a different pet's checklist)

### 5. Premium screen + founder override
- [ ] Settings → Premium → Premium screen opens as modal
- [ ] On Max's iPhone (IDFV `981F7B5B-46DF-4B89-AF5D-49B812EB939D`): screen shows premium-active state — annual + monthly cards both render but the purchase CTA is replaced or grayed appropriately (founder override active)
- [ ] On a non-founder device: both annual and monthly cards are tappable; selected card highlighted; purchase button enabled

### 6. Settings — Privacy / Terms / Feedback
- [ ] Settings tab → tap "Privacy policy" → Safari opens to `bassklaft.github.io/floof-life/legal/privacy-policy.html` and the page loads
- [ ] Settings tab → tap "Terms of service" → Safari opens to `bassklaft.github.io/floof-life/legal/terms-of-service.html` and the page loads
- [ ] Settings tab → tap "Send feedback" → iOS Mail composer opens with prefilled subject "FloofLife Feedback" + body containing app version + iOS version + pet count
- [ ] Settings tab → tap "Haptic feedback" row → toggles On / Subtle / Off; subsequent taps in the app use the new haptic preference

### 7. Haptics (physical device only)
- [ ] Setting Haptic feedback to "On" → tapping any About/Health/Tips toggle fires a light tap haptic
- [ ] Setting Haptic feedback to "Subtle" → only light + success haptics fire; medium/heavy collapse to light
- [ ] Setting Haptic feedback to "Off" → no haptics anywhere

### 8. Analytics (verify in PostHog dashboard, not just console)
- [ ] Open PostHog dashboard → Live Events → confirm the test session shows: `app_opened`, `screen_viewed`, `about_breed_expanded`, `health_considerations_expanded`, `origin_story_expanded`, `sources_expanded`, `insider_tips_expanded`, `active_pet_switched`, `pet_photo_picked`, `pet_edit_opened`, `pet_edited` (NEW in v1.2.0)
- [ ] `active_pet_switched` events include a `source` property: `checklist_switcher` or `health_tracker_switcher` (NEW in v1.2.0)
- [ ] No PII leakage: confirm none of the events contain `pet.name`, breed-key strings (only `species: "dog"|"cat"`), or photo URIs

### 9. Health Tracker (v1.2 feature — confirm it landed in the merge)
- [ ] My Floofs → tap a pet → "Health Tracker" row visible
- [ ] Tap → opens Health Tracker screen for that pet
- [ ] "Add health record" works; record persists across app restart

### 10. Critical regression checks (anything that was already working should still work)
- [ ] Toxic Foods & Plants screen renders
- [ ] Recalls screen renders + items link to FDA pages
- [ ] Vets Near Me opens Maps
- [ ] Risk Map renders + location permission handles correctly
- [ ] Emergency Resources screen renders + poison-control hotline numbers tap-to-call
- [ ] Diet & Care screen renders
- [ ] Training Exercises screen renders
- [ ] Trip Planning screen renders
- [ ] Age Calculator (DogAge route) renders + gives a multi-factor result for Falafel

### 11. Microchip step in onboarding (NEW step 4)
- [ ] Onboarding step 4: "Does [name] have a microchip?" appears between photo and details
- [ ] Tapping "Yes — chip number is…" reveals an inline numeric text input
- [ ] All four options select cleanly; only one can be selected at a time
- [ ] Footer hint about shelters/breeders chipping pets shows
- [ ] "Next" advances to step 5 (age + weight)
- [ ] "Back" returns to step 3 (photo)
- [ ] Microchip data persists on the pet record after finish

### 12. Edit pet via name-tap on My Floofs
- [ ] Tap pet's NAME (with pencil icon) on My Floofs → EditPet modal opens
- [ ] All fields pre-filled with existing values, including microchip
- [ ] Microchip status options reflect the saved status
- [ ] "Save changes" updates the pet record (verify by reopening edit)
- [ ] "Cancel" closes without saving

### 13. My Floofs empty state
- [ ] (Best tested on a fresh install) When no pets exist: empty state shows paw icon, "Welcome to FloofLife", value prop, "Add your first floof" CTA, and privacy reassurance
- [ ] Tap CTA → AddPet onboarding modal opens

### 14. Light gamification polish
- [ ] About / Health Considerations / Tips / Sources / Origin Story cards expand and collapse SMOOTHLY (not snap)
- [ ] Tab switches (Checklist / Home / My Floofs) fire a light haptic on physical device
- [ ] Complete ALL items on the Checklist for one pet → celebration overlay appears with 🎉 emoji + "[Name] is set for today" + notifySuccess haptic
- [ ] Re-toggling the last item doesn't re-fire the celebration
- [ ] Switching to a different pet whose checklist isn't complete shows no celebration

### 15. New breed entries
- [ ] In the breed picker, scroll to verify alphabetical order: Akita, Aussiedoodle, Australian Cattle Dog, Australian Shepherd, ... continues alphabetically through the new entries (Bull Terrier, Cardigan Welsh Corgi, English Mastiff, Great Pyrenees, Jack Russell Terrier, Pekingese, Rhodesian Ridgeback, Scottish Terrier, Standard Schnauzer, Tibetan Mastiff, West Highland White Terrier, Xoloitzcuintli) ... up to "Mixed" / "Other dog" pinned at the bottom
- [ ] Pit-type breeds (American Pit Bull Terrier, American Staffordshire Terrier, Staffordshire Bull Terrier) appear in alphabetical order at the start
- [ ] Munchkin cat appears in alphabetical position in the cat picker
- [ ] Sample 3-4 new breed entries on the My Floofs card to confirm About + Health Considerations render correctly

### 16. Pawgress Indicator (NEW in v1.2.0)
- [ ] Home tab: Pawgress card visible above QUICK ACCESS heading; renders a small 56px paw SVG with completion summary
- [ ] Tap card → Pawgress modal opens with 220px paw at top + "TODAY'S PADS" section (5 tappable rows)
- [ ] Daily Special pad shows day-of-week-rotating label (e.g., Monday = "Brush teeth or dental chew")
- [ ] Tap a pad row → segment toggles, AnimatedCheckmark draws in, paw segment animates fill
- [ ] Complete all 5 pads → celebration overlay fires once with floating 🐾 / 💛 / 🎉 / ✨ particles + "[Pet] is set for today" headline + notifySuccess haptic
- [ ] Re-toggling the last pad does NOT re-fire celebration (de-duped per pet+date)
- [ ] Streak counter (🔥 X-day streak) appears when streak > 0
- [ ] Free user: "See [pet]'s history" Premium teaser visible at bottom; tap → Premium screen

### 17. Tummy Tracker — first entry (NEW in v1.2.0)
- [ ] Home tab → tap "Tummy Tracker" card → Tummy Tracker screen opens
- [ ] Empty state: paw emoji + "Log [pet]'s first poop" + value-prop body + "always free" mention of recall + vet suggestions
- [ ] Tap "Log poop" → LogStool modal opens
- [ ] Bristol picker: tap each of 1-7 → BristolIcon highlights + numeric label updates + description text under the row updates
- [ ] Color chips: tap each color → highlights; black + red_tinged have a watch-color border
- [ ] Volume row: small / normal / large select cleanly
- [ ] Modifier toggles: mucus / blood / foreign material / undigested food — toggling blood shows inline "discuss with your vet" hint
- [ ] Photo button: tap → ActionSheet ("Take photo" / "Choose from library" / "Cancel"). On iPhone, both options reach the relevant native picker
- [ ] After photo: small thumbnail in dashed-border box; "Remove photo" removes it
- [ ] Optional note text input
- [ ] "Log this poop" button saves + dismisses modal + returns to Tummy Tracker
- [ ] Photo file persists across app restart (sandbox storage in documentDirectory/pets/[id]/tummy/)

### 18. Tummy Tracker — diet entry (NEW)
- [ ] Tap "Log meal" → LogDiet modal opens
- [ ] Meal-type chips select cleanly (kibble / wet / raw / treat / supplement / scraps / human_food / water_only)
- [ ] After at least one diet entry: QUICK ADD row appears with most-recent foods. Tap a quick-add chip → fills brand + product fields
- [ ] Brand + product + amount + note inputs work
- [ ] "Log this meal" saves + dismisses

### 19. Tummy Tracker — recall match banner (NEW, ALWAYS FREE)
- [ ] Log a diet entry with a brand likely to match an active FDA recall (e.g., search openFDA food/enforcement results manually first to find a current example)
- [ ] Recall banner appears at top of Tummy Tracker screen with red background + alert-octagon icon + recall date + reason + "Last logged" date + "Discuss with your vet"
- [ ] If cache is older than 7 days: stale-data warning appears below the banner
- [ ] Recall match runs OFFLINE if a previous fetch is cached (try airplane mode; banner still shows from cache)

### 20. Tummy Tracker — vet suggestion banner (NEW, ALWAYS FREE)
- [ ] Log 3 stool entries with Bristol 6 or 7 within 48 hours (or 1 entry with blood checked) — banner appears at top of Tummy Tracker
- [ ] Banner has accent background + stethoscope icon + "Pattern detected: ..." + "Discuss with your vet."
- [ ] Banner does NOT appear if criteria not met (1 normal stool entry, e.g., Bristol 4)

### 21. Tummy Tracker — Premium gating (NEW)
- [ ] As a non-Premium user: 30-day range pre-selected; 90 / Year / All-time ranges show lock icon
- [ ] Tap 90 / Year / All-time → Premium upsell Alert appears with "Maybe later" / "See Premium"
- [ ] Tap "Export" → Premium upsell Alert
- [ ] As Premium user (founder override): all four range buttons selectable; Export button generates a PDF + opens iOS share sheet
- [ ] PDF includes pet name header, recall + vet banners (if any), interleaved stool + diet timeline, photos embedded inline at reasonable size, footer disclaimer

### 22. Tummy Tracker — privacy contract (NEW)
- [ ] Verify in PostHog dashboard: stool log events fire `tummy_tracker_stool_log_created` with bristol_scale, color, has_photo, has_blood, pet_species — NEVER notes verbatim, NEVER photo URI, NEVER pet name
- [ ] Diet log events fire `tummy_tracker_diet_log_created` with meal_type, has_brand, pet_species — NEVER brand strings, NEVER product names, NEVER notes verbatim
- [ ] Recall match event fires `tummy_tracker_recall_match_shown` with brand_match (bool) + recall_age_days
- [ ] Vet suggestion event fires `tummy_tracker_vet_suggestion_shown` with trigger_type only (not pet_id, not entry details)
- [ ] Photo capture event fires `tummy_tracker_photo_captured` with source (camera/library) only

---

## App Store Connect privacy disclosure check (BEFORE build 18 submission)

The microchip number is **User Content** under Apple's privacy taxonomy. Verify before submission:

- [ ] **App Store Connect → My Apps → FloofLife → App Privacy** → "User Content" category includes "App Functionality" use case. Microchip number falls under this — same as pet name, breed, photo, notes — already declared for v1.0.
- [ ] **No new privacy categories required** — microchip data does NOT cross any new category boundary (it's not health/fitness, location, contacts, search history, etc.). Tummy Tracker stool/diet entries also User Content under existing categories.
- [ ] **Privacy Policy** at `bassklaft.github.io/floof-life/legal/privacy-policy.html` already covers User Content broadly. **Recommended addition** for clarity (low priority for v1.2.0, can wait for v1.3+ when microchip Phase 2 lost-pet workflow lands): a single line in the User Content section explicitly listing "microchip number" alongside "pet name", "photos", "notes". Doesn't change disclosure scope, just improves transparency.
- [ ] **PrivacyInfo.xcprivacy** manifest: doesn't need updating for v1.2.0 since no new APIs accessed.
- [ ] **Apple's stricter ATT-tracking rules** don't apply — microchip number + tummy logs are user-entered local data, never used for tracking. FDA recall match runs locally; no third party sees what user has logged.

## Apple review risk assessment (v1.2.0)

| Guideline | Assessment | Mitigation |
|---|---|---|
| **1.4.1 (Safety – Medical)** | LOW for v1.2.0. All health content is editorial summary with vet-discussion framing; no diagnosis claims, no drug doses, no brand-name medications. Bristol Stool Scale icons are abstract line-art (NOT photographic). | Existing standard: "may be predisposed", per-bullet "discuss with your vet", ZERO brand-name meds in catalog. Vet visit suggestion banner says "discuss with your vet" — never "your pet has X". |
| **3.1.1 (In-app Purchase)** | LOW. Premium gating via RevenueCat unchanged from v1.1. Tummy Tracker recall match + vet suggestion explicitly NOT paywalled per safety contract. | Existing flow. |
| **4.0 (Design)** | LOW. New UI is consistent with existing patterns; tab haptic + smooth animations + Pawgress paw + Tummy timeline are standard polish. | No new third-party SDK; only added expo-print + react-native-svg (both Expo-native, SDK-54-compatible). |
| **5.1.1 (Privacy)** | LOW. Microchip number is User Content (already declared). All data stays on device for v1.x. Permission strings (camera, photo library, location) unchanged. Photos sandbox-only — never written to camera roll. | Verify App Privacy categories cover microchip number per checklist above. |
| **5.1.2 (Privacy – Tracking)** | LOW. No new tracking. PostHog still anonymous-by-default with the privacy contract enforced. FDA recall match runs LOCALLY (no logged brands sent to FDA). | No change. |
| **Pit-type breed framing rejection risk** | LOW. APBT / AmStaff / Staffie entries use AKC/UKC sourcing, neutral language, no aggression or fighting references, BSL framed as practical owner consideration only. | Reviewed against the user's framing rules at writing time. |
| **Munchkin welfare framing rejection risk** | LOW. Same Scottish Fold pattern that already shipped in v1.1; cites veterinary welfare orgs neutrally. | Reviewed against the existing Scottish Fold framing model. |

**Overall v1.2.0 review risk: LOW.** Largest content additions (43 net-new breeds, microchip step, multi-pet UX refinement, Pawgress, Tummy Tracker) all build on existing patterns that have already passed review. Tummy Tracker is the largest new feature surface; vet-discussion framing + abstract Bristol icons + sandbox-only photos + always-free safety outputs all reduce review risk.

## Marketing content brief for v1.2.0 launch

Pawgress + Tummy Tracker are the headline features; breeds catalog + multi-pet UX + microchip are supporting:

1. **Pawgress** — daily-care gamification. Tap a paw segment as you go through the day; complete all five for the celebration. Streak counter for the consistent humans. Premium unlocks weekly / monthly / yearly history.
2. **Tummy Tracker** — per-pet stool + diet log with Bristol Stool Scale + color + volume + modifiers + photo. **FDA recall match (always free)**: when a brand you've logged appears in an active FDA recall, you see a banner. **Vet visit suggestion (always free)**: anomaly detection flags patterns worth discussing — 3+ days of soft stool, blood, melena, sudden volume change. Premium unlocks 90-day / yearly / lifetime views + a vet-friendly PDF export with photos embedded.
3. 40+ new breeds including the pit-type breeds with neutral framing, Munchkin with welfare-aware copy modeled on Scottish Fold, ancient breeds like Xoloitzcuintli + Tibetan Mastiff, and the long-tail mid-popularity dogs (Bull Terrier, Westie, Scottie, Jack Russell, Pekingese, Cardigan Welsh Corgi, etc.). 123 total breed entries.
4. **Cleaner multi-pet UX** — pet name is the obvious tap target → edit profile. Active-pet chip in nav bar of pet-scoped screens. Pet-name nav titles ("Falafel's Checklist") for context.
5. **Microchip onboarding** — new step in onboarding capturing chip status with four options. Useful for vet visits + future lost-pet recovery.
6. **Polish that adds up** — smooth expand/collapse on every breed card, celebratory haptic when you complete the day's checklist, light tap on every tab switch, welcoming first-time-user empty state.

**App Store "What's New" copy (~150 chars)**:
> v1.2: Pawgress daily tracker, Tummy Tracker (stool + diet log with FDA recall match — always free), 40+ new breeds, smoother multi-pet UX.

**Tone**: confident but not boastful. Specific (numbers, named features). No emoji in the title bar. Saves emoji for the in-app celebration moments.

---

# Appendix: working notes

## v1.1.2-work → v1.2-work merge resolution (commit `0a7b215`)

16 conflicts hand-resolved (14 content + 2 add/add). Higher than the 8 estimated overnight, because App.js, V1_REMOVED_FEATURES.md, V2_CHANGELOG.md, package.json, package-lock.json all conflicted too, plus ChecklistScreen / HomeScreen / OnboardingScreen / PremiumScreen each had their own real conflicts not just YourPetsScreen.

**Take v1.2-work (ours)** — 2 files: `src/data/breeds.js`, `V2_CHANGELOG.md`.

**Take v1.1.2-work (theirs)** — 7 files: `src/screens/SettingsScreen.js`, `EmergencyScreen.js`, `ChecklistScreen.js`, `PremiumScreen.js`, `src/lib/founderOverride.js`, `purchasesContext.js`, `checklist.js`.

**Real 3-way merges** — 7 files. Highlights:
- `App.js` — kept HealthTracker/AddHealthRecord routes + DogAge title rename (ours).
- `package.json` — kept all three new deps (expo-document-picker, expo-file-system, expo-haptics) alphabetically.
- `HomeScreen.js` — load() combines per-pet ChecklistState (theirs) + healthRecords load (ours); breed lookup uses ours' multi-breed-aware helpers; hero wraps in theirs' multi-pet TouchableOpacity switcher but uses ours' breedDisplay.
- `OnboardingScreen.js` — kept theirs' cat-coat-pattern hint Alert but converted `setBreed("...")` → `setSelectedBreeds(["..."])` to fit ours' multi-breed model.
- `YourPetsScreen.js` — most complex. Kept ours' HealthTrackerRow + breedKeys.map per-breed iteration + About/Health Considerations split + sectionId keying. Layered in theirs' active pet switcher + inner collapsibles (Origin Story / Sources / Tips) — all re-keyed from pet.id to sectionId so mixed-breed pets get independent state per breed. **Caught + fixed bug**: auto-merge produced two `toggleAbout` function declarations with the same name (sectionId-keyed from ours, petId-keyed from theirs); the second hoists and silently overrides the first. Consolidated into one sectionId-keyed `toggleAbout` that has both default-expanded behavior (ours) AND analytics + haptics (theirs). Same treatment for `toggleHealth`. Added a generic `toggleSubSection(setter, sectionId, eventName)` helper for the inner collapsibles.

esbuild parse-clean across all 12 affected JS/JSX files. No leftover conflict markers anywhere in the tree.

## H1-H3 + extended brand-name audit findings (now fully resolved)

Per Path C language guardrails, brand-name medications replaced with medication CLASS or treatment APPROACH.

**H1-H3 in scope** — only Bichon Frise had violations (3 occurrences: health bullet, checklist `why`, tips). All fixed.

**Out of scope but flagged + later resolved** — 6 entries in addition: Labrador, French Bulldog, Cavalier KCS (Pimobendan/Vetmedin), Doberman (Pimobendan/Vetmedin), Shih Tzu, Brittany. All fixed in commit `acc58c4`. Pimobendan kept as generic class name; Vetmedin parenthetical dropped.

Result: ZERO brand-name medication references across all breed entries in `src/data/breeds.js`.

## PostHog credential gap (re: pulling multi-pet stat for v1.3 planning)

Only the public-write project key (`phc_kF5d...`) is in `.env`. Querying PostHog for an aggregate stat (e.g., what % of active users have multiple pets) requires a personal API key (`phx_...`) which isn't stored locally. Cannot pull such numbers autonomously.

**Defaulted to <10% multi-pet households** for v1.2.0 design decisions (per US national multi-species rate ~14%, single-species multi-pet much rarer, early TestFlight + App Store users skew single-pet). Active-pet chip ships as a small component (24×24 avatar + first-name pill) only for multi-pet households.

**To pull the actual number once telemetry exists**: in PostHog dashboard run an Insight with breakdown by `pet_count` distinct property. We can fire `pet_count` on `app_opened` events going forward — flagged as a v1.3 analytics enhancement.

## Future feature: My Vet contact integration (NOT in scope for v1.2)

The vet-discussion framing across the app would be more actionable if Settings had a saved "My Vet" profile (name, phone, email) and every "discuss with your vet" prompt had a one-tap "Call your vet" / "Email your vet" button.

- **Settings → My Vet**: form with vet practice name, phone, email, address, after-hours emergency contact.
- **Per vet-discussion prompt**: a small "Call your vet" / "Email your vet" CTA when a saved vet exists; falls back to `Vets Near Me` when none saved.
- **Email pre-fill**: when emailing the vet from a Tummy Tracker / Tick log / Seizure log thread, auto-attach the relevant log export as a vet-friendly summary.
- **Multi-vet support**: a household with a primary vet + an emergency vet + a specialist (cardiologist, ophthalmologist, behaviorist) should be able to save all three.
- **Schedule**: v1.4 or later. Probably groups well with the existing Tummy Tracker spec since both feed the same vet-handoff workflow.
- **Schema**: `pawrent_vets_v1` AsyncStorage key, shape `{ primary: VetContact, emergency?: VetContact, specialists?: VetContact[] }` where `VetContact = { name, phone, email, address, notes }`. Backend table `vets` FK'd to `auth.users`, RLS user-owns-own per security doc.

Just documenting — not building. Could be its own spec doc under `docs/features/my-vet-contact.md` if formally specced.

## Visual verification gap → physical-device smoke test

No iOS simulator runtime is installed on this dev machine (already noted in V1_REMOVED_FEATURES.md). `expo start --web` doesn't work without `react-dom` + `react-native-web` (intentionally not added — not a project target).

**Replacement**: physical-device smoke test via `npx expo start` + Expo Go QR scan. The 22-section PRE-BUILD-18 manual checklist above is the verification gate. If all 22 sections pass on the device, we trigger build 18.

**What was static-verified** (pre-physical-device): esbuild parse-clean across 12+ affected JS/JSX files; zero stale `setBreed` / `pet.breed` / `isMixed` references after merge; mental traces of single-breed, mixed-breed, and pet-switcher scenarios all coherent; founder IDFV present; SettingsScreen URLs wired; haptics + analytics safe-degrade.

**What needs physical-device verification**: pixel-level rendering, active-pet switcher feel, real haptic firing, RevenueCat live offering fetch, real photo capture flow, real Mail composer rendering, FDA recall match against live API, vet-suggestion banner triggering on real entries, PDF export → iOS share sheet round-trip.
