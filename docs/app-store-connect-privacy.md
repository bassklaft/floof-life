# App Store Connect — privacy disclosures to update

The churn-feedback backend means FloofLife now **collects personal data**. Before the next build is submitted, the **App Privacy** section in App Store Connect must be updated — the app can no longer be declared "Data Not Collected." Apple rejects or pulls apps whose privacy labels don't match observed behavior.

Set this in **App Store Connect → your app → App Privacy → Edit**.

## Data types to declare

For each type below: **Data Linked to You** is "Yes" when the user also provides contact info in the same feedback form; **Used for Tracking** is **No** for everything (FloofLife does no cross-app/-site tracking and uses no ad networks).

| Data type (App Store Connect category) | Source | Linked to identity | Purpose to select |
|---|---|---|---|
| **Contact Info → Name** | Churn-feedback form (optional field) | Yes | App Functionality, Customer Support |
| **Contact Info → Email Address** | Churn-feedback form (optional field) | Yes | App Functionality, Customer Support |
| **Contact Info → Phone Number** | Churn-feedback form (optional field) | Yes | App Functionality, Customer Support |
| **User Content → Customer Support** | Free-text feedback message + selected reasons | Yes | App Functionality, Customer Support |
| **User Content → Other User Content** | Demographic answers (age range, "how did you find us") | Yes | App Functionality, Product Personalization |
| **Identifiers → User ID** | RevenueCat anonymous app-user ID sent with feedback | Yes | App Functionality, Analytics |
| **Usage Data → Product Interaction** | PostHog analytics (screen/feature events) | No | Analytics |
| **Diagnostics → Other Diagnostic Data** | App version + OS version sent with feedback | No | App Functionality |

Notes:
- **Age range** has no dedicated App Store Connect category — declare it under **User Content → Other User Content** (as above). It is a coarse bucket, never a precise birth date.
- If PostHog is **not** enabled in the production build (no `EXPO_PUBLIC_POSTHOG_KEY`), drop the **Usage Data** row. Confirm which is true for the prod EAS profile.
- The RevenueCat anonymous ID is pseudonymous; it becomes "linked" once a user submits contact info, so declare it linked to be safe.

## Other checklist items

- [ ] Update the **privacy policy URL** in App Store Connect if it changed (currently `https://bassklaft.github.io/floof-life/legal/privacy-policy.html` — the content there is updated in `legal/privacy-policy.html`/`.md`).
- [ ] Confirm the **Account Deletion** / data-deletion path: the privacy policy now points users to the contact email to request deletion of submitted feedback. That is sufficient for the questionnaire (no in-app account exists).
- [ ] The churn-feedback form's **phone number** field draws extra reviewer attention. It is optional and clearly labelled; keep it that way. If review friction appears, dropping the phone field is the low-cost fix.
- [ ] Re-verify these answers whenever a new field is added to the feedback form or a new backed feature ships.

## Why this is required

`docs/security-non-negotiables.md` Rule 8 ("privacy contract") and the App Store Review Guidelines both require the declared privacy labels to match what the app actually does. The previous labels (effectively "no collection") are now inaccurate because user-entered name/email/phone/feedback leave the device for a FloofLife-owned backend.
