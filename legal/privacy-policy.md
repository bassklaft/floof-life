# FloofLife — Privacy Policy

**Last updated: May 21, 2026**

FloofLife ("the App") is operated by Maxwell Klafter ("we," "us," or "our"), based in Brooklyn, New York, USA.

This Privacy Policy explains how the App handles your information.

## Summary

FloofLife is local-first: by default, everything you log about your pet stays on your device, and the App does not require an account to use. A small number of features send limited data off your device — anonymous product analytics, purchase processing, feedback you choose to submit, the optional AI Floof Assistant, and an **optional cloud backup of your pet data** that you turn on by creating an account. Each is described below.

## Information stored on your device by default

When you use FloofLife, you may provide:

- Your pet's name, species, breed, age, weight, and photos
- Notes, observations, mood, tummy, and health-record entries you log
- Your interactions with checklists and other features

By default, all of this is stored only on your device. It is not transmitted to us or to any third party. **If you choose to create an account and turn on cloud backup (see below), copies of this data are uploaded to your account — and the copy on your device is always kept.**

## Optional account & cloud backup

Starting in this version, you can create a free FloofLife account to back up your pet data to the cloud. The account is **optional** — the App continues to work fully offline without one, and existing features keep working with no account.

If you create an account, you can sign in with:

- **Sign in with Apple** — handled by Apple through their standard system flow. We receive an opaque identifier (and, if you choose to share it, your email and name) from Apple. We never receive your Apple ID password.
- **Email + password** — managed by our authentication provider (Supabase). Your password is hashed and stored by Supabase; we never see it.

When you tap **Back up my floofs**, the following is uploaded to your account:

- Your pet profiles (name, species, breed, age, weight, photos)
- Health records and any attachments you've added
- Mood logs, stool logs, and diet logs
- Checklist completion state and app preferences scoped to your account

Uploads are encrypted in transit (HTTPS) and stored under your account so that only you, when signed in, can read them. Other FloofLife users cannot access your data. We do not access individual users' pet data except where strictly necessary to operate, secure, or repair the service. **Your copy on your device is kept before, during, and after backup — backing up never removes anything from your phone.**

## Where data is stored when you opt in

Data you choose to send off your device is stored using Supabase (a hosted database, authentication, and serverless-function platform) on infrastructure located in the United States. To protect these services from abuse, requests are rate-limited using Upstash; this briefly processes your device's IP address for that purpose and does not store the content of what you send.

This applies to feedback you submit, the AI Floof Assistant, and any pet data you choose to back up.

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

## AI Floof Assistant

If you use the Floof Assistant chat, the messages you send are transmitted to Anthropic's Claude API through our own server (so your device never holds an AI provider key). Your messages are processed only to generate a response and are not used to train Anthropic's models. We do not retain chat content on our servers beyond what your device stores locally for your own chat history.

## Purchases

In-app purchases and subscriptions are processed by Apple and managed through RevenueCat. RevenueCat identifies your device with an anonymous identifier — not your name or email — unless you provide contact details through a feedback form or create a FloofLife account. If you create an account, RevenueCat associates your existing anonymous purchase record with your account so your subscription carries over. We never receive your full payment-card details.

## Analytics

The App uses PostHog for anonymous product analytics — for example, which screens are opened and which features are used. Analytics events are tied to a random per-installation identifier, never to your name, email, or any information about your pet. We do not use third-party advertising networks, and we do not sell data. We do not track you across other companies' apps or websites.

## Recall data

The App checks pet-food recall information against the U.S. FDA's public openFDA service. These lookups are public queries and do not include your personal information.

## Location

The App may request location permission to display nearby emergency veterinarians and current weather conditions. This information is used in real time and is not retained or transmitted to us.

## Photos and camera

The App may request access to your photo library or camera so you can add photos of your pet. By default, photos remain on your device. If you opt in to cloud backup by creating an account and tapping **Back up my floofs**, copies of your photos are uploaded to your account; the copy on your device is kept.

## Data retention and deletion

**Feedback submissions** are kept only as long as they are useful for improving the App. To request a copy or deletion, contact us at the email below.

**Account data** (pet profiles, photos, and logs you backed up): you can delete your entire cloud copy from inside the App — go to **Settings → Account → Delete account**. This permanently removes your account and all backed-up data and photos from our systems. The copy on your device is intentionally kept so you can keep using the App offline; you can remove that separately with "Reset all data" in Settings.

## Children

FloofLife is not directed to children under 13 and we do not knowingly collect information from children. The optional demographic questions in feedback forms are intended for adults.

## Changes to this policy

If we change how the App handles data in future versions, we will update this policy and disclose changes prominently within the App.

## Contact

For privacy questions, or to request access to or deletion of your data, contact: streetparkinfo@gmail.com
