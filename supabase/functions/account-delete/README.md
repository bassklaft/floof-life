# account-delete — deploy guide

Permanently deletes a signed-in user's cloud copy: every Storage object under their prefix, then their `auth.users` row (which cascades to per-user data tables via `ON DELETE CASCADE`).

Required by **App Store Guideline 5.1.1(v)** — every iOS app that supports account creation must support in-app account deletion.

## Architecture

Client (`src/lib/auth.js` → `deleteAccount()`) calls `supabase.functions.invoke("account-delete")`. The function:

1. Reads the user's JWT from the `Authorization` header.
2. Verifies it with `admin.auth.getUser(jwt)` → gives the `user_id`.
3. Walks `pet-media/<user_id>/...` and deletes every object.
4. Calls `admin.auth.admin.deleteUser(user_id)`. Postgres `ON DELETE CASCADE` removes every row in `pets`, `health_records`, `mood_logs`, `stool_logs`, `diet_logs`, `checklist_state`, `app_prefs`, `observations`.

The service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is **injected automatically** by Supabase — never set it manually, never expose it to the client.

## Local data on the device is intentionally preserved.

Per `docs/security-non-negotiables.md` Rule 8 + the zero-loss migration promise in `docs/features/accounts-and-migration.md`. The client signs out after the cloud copy is removed; the app continues to work fully offline with the local data intact.

## One-time setup

```bash
# Link to your Supabase project (skip if already linked)
supabase link --project-ref <your-project-ref>

# Apply migrations (creates pet-media bucket + tables)
supabase db push
```

No additional secrets needed — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are platform-injected.

## Deploy

```bash
supabase functions deploy account-delete
```

`verify_jwt` is **on by default** for this function (and that's correct — we want the platform to reject anonymous calls before they reach the function code). The function ALSO verifies the JWT itself as a defense-in-depth — both passes must succeed.

## Smoke-test

```bash
# Get a session token by signing in via the app, then in the
# Supabase dashboard → Authentication → Users → Edit → "Sign in as user"
# → copy the access token. (Or use the supabase CLI's `auth` commands.)

curl -X POST 'https://<project-ref>.supabase.co/functions/v1/account-delete' \
  -H 'Authorization: Bearer <user-jwt>' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Expect: `{ "ok": true, "user_id": "..." }`. Verify in Supabase dashboard:

- Authentication → Users — the row is gone.
- Storage → pet-media — the user's prefix is empty.
- Table editor → pets, health_records, etc. — no rows for that user_id (cascade).

## Hard budget caps

Function execution counts toward Supabase Edge Function invocation limits (500K/mo free). Account deletion is a rare event — no special cap needed beyond the project-wide spend cap (`docs/security-non-negotiables.md` Rule 7).
