# sync-upload-url — deploy guide

Mints **short-lived presigned upload URLs** for the `pet-media` Storage bucket. Per `docs/security-non-negotiables.md` Rule 5, sensitive sync writes go through a server-mediated handshake — this function is that mediator.

## Why this exists

The earlier cloud-sync path uploaded bytes directly to Supabase Storage using the user's JWT. RLS gated it (per-user-prefix policy), but Rule 4 also requires **edge-level IP rate-limiting before any work** — and `https://<project-ref>.supabase.co/storage/v1/object/<bucket>/<path>` isn't behind our Upstash limiter. This function plugs that gap:

1. Client POSTs the desired Storage path
2. Function rate-limits by IP (60/min, 5000/day per IP — generous for legit photo backup, tight enough to block torrenting)
3. Function verifies the user's JWT
4. Function validates the path starts with the user's id (defense in depth — RLS would also reject)
5. Function mints a presigned upload URL via `storage.createSignedUploadUrl(path)`
6. Client PUTs file bytes to that URL directly (URL is single-use and TTL-bound)

The bytes still flow direct to Storage — we're not proxying them through the function (that would kill throughput and blow up Edge CPU bills). The function only mediates the **permission to upload**.

## One-time setup

```bash
# Link to your Supabase project (skip if already linked)
supabase link --project-ref <your-project-ref>

# Apply migrations (creates the pet-media bucket)
supabase db push
```

No additional secrets needed — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the Upstash secrets you already set for `ai-floof-assistant` / `churn-feedback` are all this function needs.

## Deploy

```bash
supabase functions deploy sync-upload-url
```

`verify_jwt = true` is set in `supabase/config.toml` — required, since we need the user's identity to validate the upload path.

## Smoke-test

```bash
# Get an access token by signing in via the app, then in the Supabase
# dashboard → Authentication → Users → Edit user → "Get user JWT"

USER_ID=<the user uuid from the dashboard>
JWT=<the access token>

curl -X POST 'https://<project-ref>.supabase.co/functions/v1/sync-upload-url' \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d "{\"path\":\"$USER_ID/pets/test-pet/test.jpg\"}"
```

Expect: `{ "ok": true, "bucket": "pet-media", "path": "...", "signed_url": "https://...", "token": "..." }`.

Try with a path that doesn't start with your user id — must return `{ "error": "invalid_path" }` (400).

## Hard budget caps

Function execution counts toward Supabase Edge Function invocations (500K/mo free). Storage egress + storage size count toward Supabase Storage limits. Both are covered by the project-wide Supabase **spend cap** — make sure it's **on** in Project settings.

## Tuning the ceilings

```bash
# More photos per minute for big-household users
supabase secrets set SYNC_UPLOAD_MINUTE_LIMIT=120

# Bigger per-file size cap (default 20 MB)
supabase secrets set SYNC_UPLOAD_MAX_BYTES=52428800   # 50 MB
```
