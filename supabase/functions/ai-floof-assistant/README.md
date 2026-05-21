# ai-floof-assistant — deploy guide

Anthropic proxy for the in-app Floof Assistant chat. Per `docs/security-non-negotiables.md` Rule 5, the Anthropic API key lives **only** in this function — the Expo client calls this endpoint, not Anthropic directly.

## What you need

1. A Supabase project (free tier is fine to start). One-time: `npm i -g supabase` and `supabase login`.
2. An Anthropic API key. Create one at `console.anthropic.com → API keys`.
3. An Upstash Redis database for rate-limiting. Free tier: `console.upstash.com → Create database` (Region: closest to your Supabase region. Eviction: enabled.).

## One-time setup

```bash
# Link to your Supabase project
supabase link --project-ref <your-project-ref>

# Set the secrets the function reads at runtime
supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-...                              \
  UPSTASH_REDIS_REST_URL=https://...upstash.io              \
  UPSTASH_REDIS_REST_TOKEN=...                              \
  FLOOF_ASSISTANT_MODEL=claude-haiku-4-5                    \
  FLOOF_ASSISTANT_MAX_TOKENS=1024                           \
  FLOOF_ASSISTANT_HOURLY_LIMIT=30                           \
  FLOOF_ASSISTANT_DAILY_LIMIT=200
```

Tune the env vars later without redeploying: `supabase secrets set FLOOF_ASSISTANT_DAILY_LIMIT=400` updates the live function.

## Deploy

```bash
supabase functions deploy ai-floof-assistant
```

Note the function URL printed at the end — it'll look like `https://<project-ref>.supabase.co/functions/v1/ai-floof-assistant`. Set this as `EXPO_PUBLIC_AI_PROXY_URL` in `pawrent/.env` and rebuild the client.

## Smoke-test

```bash
curl -X POST 'https://<project-ref>.supabase.co/functions/v1/ai-floof-assistant' \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Quick test"}]}'
```

Expect: `{ "text": "...", "stop_reason": "end_turn", "usage": {...}, "rate_limit": {...} }`.

## Hard budget caps

The function itself enforces only rate limits + max-tokens. For a **dollar ceiling** that auto-shuts-off the spend (the "hard budget cap" the security doc requires), set both:

1. **Anthropic Workspace spend cap** (`console.anthropic.com → Settings → Limits`). Use a dedicated workspace for FloofLife so the cap doesn't choke unrelated traffic.
2. **Upstash usage cap** if you go beyond the free tier (rate-limit denials are billed as commands).

These are external to the code — if you skip them, a runaway client could still rack up bills inside the rate-limit ceilings.

## Tuning the model

Default is `claude-haiku-4-5` — fastest and cheapest competent model. For meaningfully better quality on nuanced questions (breed-specific behavior, multi-symptom translation to vet-question language), switch:

```bash
supabase secrets set FLOOF_ASSISTANT_MODEL=claude-sonnet-4-6   # ~3× input price, materially smarter
# or
supabase secrets set FLOOF_ASSISTANT_MODEL=claude-opus-4-7     # ~5× sonnet, best reasoning
```

Pricing reference (per 1M tokens):

| Model              | Input  | Output |
| ------------------ | ------ | ------ |
| claude-haiku-4-5   | $1.00  | $5.00  |
| claude-sonnet-4-6  | $3.00  | $15.00 |
| claude-opus-4-7    | $5.00  | $25.00 |

Cached input (system prompt re-reads) is ~10× cheaper than the listed input rate.

## Updating the system prompt

Edit BOTH:

- `pawrent/src/data/floofAssistantSystem.js` (client copy — used in any UI that quotes it)
- `pawrent/supabase/functions/ai-floof-assistant/system-prompt.ts` (server copy — used in the actual Anthropic call)

Then `supabase functions deploy ai-floof-assistant` to push the new prompt. The Anthropic prompt cache invalidates the moment the byte content changes — the first request after a deploy pays the cache-write premium, subsequent requests cache-read normally.
