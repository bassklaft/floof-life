# churn-feedback — deploy guide

Receives cancellation / non-conversion feedback from the app and stores it in the `churn_feedback` table. Per `docs/security-non-negotiables.md`: the service-role key lives only in this function (Supabase injects it automatically), the rate limiter runs at the edge before any work (Rule 4), and RLS keeps the table default-deny for every client role (Rule 2).

## What you need

1. **A Supabase project** (free tier is fine). One-time: `npm i -g supabase` and `supabase login`. You can reuse the same project as `ai-floof-assistant`.
2. **An Upstash Redis database** for rate-limiting. Free tier: `console.upstash.com → Create database` (region closest to your Supabase region; eviction enabled). You can reuse the same Redis as `ai-floof-assistant` — the limiter keys are namespaced (`fl:churn_feedback:*`).

Both free tiers comfortably cover expected feedback volume. This function has no per-request dollar cost beyond a database row.

## One-time setup

```bash
# Link to your Supabase project (skip if already linked)
supabase link --project-ref <your-project-ref>

# Apply the database migration — creates the churn_feedback table + RLS
supabase db push

# Set the Upstash secrets the function reads at runtime.
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically
# by the platform — you do NOT set those.
supabase secrets set \
  UPSTASH_REDIS_REST_URL=https://...upstash.io \
  UPSTASH_REDIS_REST_TOKEN=...
```

Optional tuning secrets (defaults shown — change without redeploying code):

```bash
supabase secrets set \
  CHURN_FEEDBACK_HOURLY_LIMIT=10 \
  CHURN_FEEDBACK_DAILY_LIMIT=30
```

## Deploy

```bash
supabase functions deploy churn-feedback
```

`supabase/config.toml` sets `verify_jwt = false` for this function, so the app can call it without an auth header (the function does its own rate-limiting + validation). If your CLI version doesn't read that, add `--no-verify-jwt` to the deploy command.

Note the printed URL — it looks like `https://<project-ref>.supabase.co/functions/v1/churn-feedback`. Set it as `EXPO_PUBLIC_CHURN_FEEDBACK_URL` in `pawrent/.env` and rebuild the client. **Until that env var is set, the in-app churn-feedback prompt stays dormant** (same pattern as `EXPO_PUBLIC_AI_PROXY_URL`).

## Smoke-test

```bash
curl -X POST 'https://<project-ref>.supabase.co/functions/v1/churn-feedback' \
  -H 'Content-Type: application/json' \
  -d '{"variant":"nosub","reasons":["Too expensive"],"message":"smoke test"}'
```

Expect `{ "ok": true }`. Then open the Supabase dashboard → **Table editor → churn_feedback** and confirm the row landed.

## Reading feedback

The table is default-deny under RLS — the app (anon key) can never read it. Read it from the Supabase dashboard (**Table editor** or **SQL editor**), which runs as the service role.

## Hard budget caps

Per `docs/security-non-negotiables.md` Rule 7, set provider-level caps before production traffic:

1. **Supabase** — Project settings → Spend cap → **On** (pauses the project at the cap). _Tier 🟢 (built-in)._
2. **Upstash** — set a usage cap if you exceed the free tier (rate-limit checks count as commands). _Tier 🟢 (built-in via plan ceiling)._

## Policy tests

`supabase/tests/churn_feedback_test.sql` asserts the default-deny RLS posture (RLS enabled, zero policies, anon denied SELECT + INSERT). Run with:

```bash
supabase test db
```
