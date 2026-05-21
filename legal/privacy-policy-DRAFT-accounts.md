# FloofLife — Privacy Policy [DRAFT — accounts + cloud sync, v2.0]

> **NOT FOR DEPLOY YET.** This is a draft amendment for v2.0 (accounts +
> cloud backup). Max to review, merge into `privacy-policy.md` and
> `privacy-policy.html`, and push to bassklaft.github.io when v2.0 is
> actually ready to ship.
>
> Changes vs the current `privacy-policy.md` (v1.2, dated May 18 2026):
> 1. New section: **Optional account & cloud backup**
> 2. Amended **Information stored only on your device** — notes that
>    opt-in cloud backup uploads it to Supabase
> 3. Amended **Where feedback is stored** → **Where data is stored when
>    you opt in** (generalized)
> 4. Amended **Photos and camera** — clarifies photos sync when you
>    opt-in
> 5. Amended **Data retention and deletion** — describes the in-app
>    Delete Account flow (Apple 5.1.1(v) compliance)
> 6. New disclosure for **Sign in with Apple**

**Last updated: [DATE TBD when v2.0 ships]**

FloofLife ("the App") is operated by Maxwell Klafter ("we," "us," or "our"), based in Brooklyn, New York, USA.

This Privacy Policy explains how the App handles your information.

## Summary

FloofLife is local-first: everything you log about your pet stays on your device by default, and the App does not require an account to use. A small number of features send limited data off your device — anonymous product analytics, purchase processing, feedback you choose to submit, and, in v2.0 and later, an **optional cloud backup of your pet data** that you can turn on by signing in.

## Information stored on your device by default

When you use FloofLife, you may provide:

- Your pet's name, species, breed, age, weight, and photos
- Notes, observations, mood, tummy, and health-record entries you log
- Your interactions with checklists and other features

By default, all of this is stored only on your device. It is not transmitted to us or to any third party.

**Important:** if you choose to create a FloofLife account and turn on cloud backup (see "Optional account & cloud backup" below), copies of this data are uploaded to Supabase so they're safe if you ever lose your phone. Even then, the local copy on your device is kept — we never delete it.

## Optional account & cloud backup

Starting in v2.0, you can create a free FloofLife account to back up your pet data to the cloud. The account is **optional** — the App continues to work fully offline without one.

If you create an account, you can sign in with:

- **Sign in with Apple** — handled by Apple through their standard system flow. We receive an opaque identifier (and, if you choose, your email and name) from Apple. We do not receive your Apple ID or your Apple account password.
- **Email + password** — managed by Supabase Auth. Your password is hashed and stored by Supabase; we never see it.

When you tap **Back up my floofs** on the Account screen, the following information is uploaded to your account on Supabase:

- Your pet profiles (name, species, breed, age, weight, photos)
- Health records and any attachments you've added
- Mood logs, stool logs, diet logs
- Checklist completion state
- App preferences scoped to your account

Uploads are encrypted in transit (HTTPS) and stored under your account so only you (signed in) can read them. Other FloofLife users cannot see your data; we do not access individual users' pet data except where strictly necessary to operate or repair the service.

**Your local copy stays on your device** before, during, and after backup. Backing up is additive — it never removes data from your phone.

## Where data is stored when you opt in

Data you opt in to send off your device is stored using Supabase (a hosted database, authentication, and serverless-function platform) on infrastructure located in [REGION — set to wherever Max provisions the project, e.g. "the European Union" or "the United States"]. To protect this service from abuse, requests are rate-limited using Upstash; this briefly processes your device's IP address for that purpose and does not store the content of what you send.

This applies to:

- Feedback you choose to submit (see "Feedback you choose to send" below)
- Pet data you choose to back up by signing in and tapping **Back up my floofs**

## Feedback you choose to send

The App asks for feedback at a few moments:

- From the "Send Feedback" button in Settings, at any time.
- After you cancel a free trial or subscription, or after you've opened the App a couple of times without subscribing, the App may show a short, optional feedback form.

These forms are always optional — you can dismiss them. If you choose to submit one, the information you enter is sent to our backend and stored so we can read and act on it. Depending on the form, that may include:

- The reasons you select and any message you type
- Optional contact details you choose to provide: your name, email address, and phone number
- Optional details you choose to provide: an age range, and how you found the App
- The App version and your device's operating system version
- An anonymous RevenueCat identifier (see "Purchases" below), so we can connect your feedback to your anonymous purchase record

You decide what to put in these fields; leaving any of them blank is fine. We read this feedback manually, use it to improve the App, and do not sell it or use it for advertising.

If you provide a name, email, or phone number in a feedback form, we also store these with our purchase processor, RevenueCat, as attributes of your anonymous customer record, so we can recognize you if you contact us.

## Purchases

In-app purchases and subscriptions are processed by Apple and managed through RevenueCat. RevenueCat identifies your device with an anonymous identifier — not your name or email — unless you provide contact details through a feedback form or sign in to a FloofLife account.

If you create a FloofLife account, RevenueCat aliases your existing anonymous purchase record to your account so your subscription carries over to any other device you sign in on. We never receive your full payment-card details.

## Analytics

The App uses PostHog for anonymous product analytics — for example, which screens are opened and which features are used. Analytics events are tied to a random per-installation identifier, never to your name, email, or any information about your pet. We do not use third-party advertising networks, and we do not sell data.

## Recall data

The App checks pet-food recall information against the U.S. FDA's public openFDA service. These lookups are public queries and do not include your personal information.

## Floof Assistant (AI)

The Floof Assistant chat sends your messages to Anthropic's Claude API through our own server. Your messages are processed to generate a response and are not used to train Anthropic's models. We do not retain chat content beyond what your device caches locally.

## Location

The App may request location permission to display nearby emergency veterinarians and current weather conditions. This information is used in real time and is not retained or transmitted to us.

## Photos and camera

The App may request access to your photo library or camera so you can add photos of your pet. By default, photos remain on your device.

If you opt in to cloud backup by signing in and tapping **Back up my floofs**, copies of your photos are uploaded to your account on Supabase Storage (see "Optional account & cloud backup"). The local copy on your device is kept.

## Data retention and deletion

**Feedback submissions** are kept only as long as they are useful for improving the App. To request a copy or the deletion of feedback you have submitted, contact us at the email below.

**Account data** (pet profiles, photos, logs you backed up): you can delete your entire cloud copy from inside the App — go to **Settings → Account → Delete account**. This permanently removes your account, all backed-up data, and all backed-up photos from our systems. Your local copy on this device is intentionally kept so you can keep using the App offline; you can delete it from the App's "Reset all data" option in Settings.

## Children

FloofLife is not directed to children under 13 and we do not knowingly collect information from children. The optional demographic questions in feedback forms are intended for adults.

## Changes to this policy

If we change how the App handles data in future versions, we will update this policy and disclose changes prominently within the App.

## Contact

For privacy questions, or to request access to or deletion of your data, contact: streetparkinfo@gmail.com

> [NOTE for Max: still using `streetparkinfo@gmail.com` — flagged previously
> as a leftover from another project. Same flag for the Settings "Contact
> support" address `hello@stickaround.app`. Swap both for a FloofLife
> address before v2.0 ships.]
