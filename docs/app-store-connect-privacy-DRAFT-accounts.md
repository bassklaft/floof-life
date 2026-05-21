# App Store Connect — Privacy Labels [DRAFT for v2.0 accounts + cloud sync]

> **NOT FOR DEPLOY YET.** Draft update to `docs/app-store-connect-privacy.md`
> for the v2.0 accounts + cloud-sync release. Max to review and apply in
> App Store Connect once v2.0 is actually ready to ship.

The labels in App Store Connect today cover the v1.2 churn-feedback feature. v2.0 adds an optional account + cloud backup. Below is the delta — every existing item still applies, plus the new sections.

## New data types collected (v2.0)

Mark each as **Linked to identity** (because they're tied to the account) but **Not used for tracking** (we don't track across third-party apps/sites).

| Data type                                  | Purpose                       | Notes                                                                                          |
| ------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------- |
| **Email address**                          | App functionality, Account    | Only collected when the user creates an account (Sign in with Apple, or email + password)      |
| **Name**                                   | App functionality, Account    | Only if the user grants name when signing in with Apple                                        |
| **User ID**                                | App functionality, Account    | Supabase user UUID — generated for every account holder                                        |
| **Other user content** (pet profiles, logs)| App functionality             | Only uploaded when the user taps "Back up my floofs" — entirely opt-in                          |
| **Photos**                                 | App functionality             | Only uploaded when the user taps "Back up my floofs" — entirely opt-in                          |
| **Customer support** (free-text in chat)   | Customer support, AI features | Floof Assistant sends prompts to Anthropic via our proxy — already in v1.2 if AI assistant ships |

## Existing labels (v1.2) that stay as-is

- Crash data — not collected (no crash reporter in the app)
- Diagnostics — anonymous PostHog events
- Identifiers — random per-install ID for PostHog; anonymous RevenueCat ID
- Purchases — handled by Apple/RevenueCat
- Contact info — only via the optional churn-feedback form (already disclosed)

## Account-related Apple review notes

- **Sign in with Apple** is the primary auth method on iOS — required by Guideline 4.8 once any other login is offered.
- **In-app account deletion** is implemented (Settings → Account → Delete account) — Guideline 5.1.1(v) compliance.
- **Account creation is optional**, soft-prompted — the App continues to work fully offline without an account. This avoids the 5.1.1(v) risk of forcing existing users into account creation for features they previously had.
- Mention in App Review notes: "Account creation is optional. Local-only use continues to work as in v1.2."

## Pre-submission checklist

- [ ] Update App Privacy in ASC with the new data types above
- [ ] Update App Review notes to mention optional account + cloud sync
- [ ] Verify the in-app **Delete account** flow works end-to-end against the production Supabase project
- [ ] Verify Sign in with Apple works end-to-end on a TestFlight build
- [ ] Privacy policy update (see `legal/privacy-policy-DRAFT-accounts.md`) is live on bassklaft.github.io before submission
