// sync-upload-url — mints short-lived presigned upload URLs for the
// pet-media Storage bucket. The client POSTs the desired path; we
// validate, rate-limit, and return a signed URL the client can PUT
// file bytes to directly.
//
// Per docs/security-non-negotiables.md Rule 5: "client calls a
// FloofLife Edge Function which mints a short-lived presigned URL …
// scoped to a single object key the user is authorized to read or
// write." This is that function.
//
// Per Rule 4: IP-based rate limit runs BEFORE any other work. Cloud
// sync upload ceiling from the doc's "Sync write" row: 60/min,
// 5000/day per IP. Generous because legitimate users syncing 50 pet
// photos hit this in a single burst, but tight enough to stop a
// scripted attacker from torrenting bytes into the bucket.
//
// Pipeline (fail-fast, top → bottom):
//   1. CORS preflight short-circuit
//   2. Method gate (POST only)
//   3. IP rate-limit check
//   4. Verify the caller's JWT → gives us user_id
//   5. Validate body: { path: "<user_id>/..." } — path MUST start with
//      user_id (belt-and-suspenders; RLS would reject anyway)
//   6. Mint presigned upload URL via Storage admin SDK
//   7. Return { signed_url, token, path }

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { Ratelimit } from "https://esm.sh/@upstash/ratelimit@2.0.3";
import { Redis } from "https://esm.sh/@upstash/redis@1.34.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "pet-media";

// Per the security doc's Sync-write ceilings — generous for legitimate
// users (50 photos in a burst is fine), tight enough to stop torrenting.
const MINUTE_LIMIT = Number(Deno.env.get("SYNC_UPLOAD_MINUTE_LIMIT") ?? "60");
const DAILY_LIMIT  = Number(Deno.env.get("SYNC_UPLOAD_DAILY_LIMIT")  ?? "5000");

// Bound the per-file size we'll issue an upload URL for. Pet photos
// are tens of KB to ~5 MB; cap at 20 MB to allow some video/large-
// camera-roll outliers while still rejecting "1 GB random blob" abuse.
// (Note: Storage itself also caps based on plan, but rejecting here
// avoids issuing a URL for an upload that will fail server-side later.)
const MAX_OBJECT_BYTES = Number(Deno.env.get("SYNC_UPLOAD_MAX_BYTES") ?? String(20 * 1024 * 1024));

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const redis = Redis.fromEnv();
const minuteLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(MINUTE_LIMIT, "1 m"),
  analytics: true,
  prefix: "fl:sync_upload:minute",
});
const dailyLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(DAILY_LIMIT, "1 d"),
  analytics: true,
  prefix: "fl:sync_upload:day",
});

function callerIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("cf-connecting-ip") ?? "unknown";
}

function jsonResponse(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", ...extraHeaders },
  });
}

// Validate the path is well-formed and belongs to the caller. Paths
// must look like `<userId>/...` with no `..` traversal segments and
// no leading `/`. We accept any depth past the user-id prefix so the
// existing per-pet layout (`<userId>/pets/<petId>/<file>`) and the
// health-attachment layout (`<userId>/healthRecords/<petId>/<file>`)
// both pass.
function validatePath(path: unknown, userId: string): string | null {
  if (typeof path !== "string") return null;
  if (path.length === 0 || path.length > 1024) return null;
  if (path.startsWith("/")) return null;
  if (path.includes("..")) return null;
  // Disallow embedded NUL, control chars, and backslashes
  if (/[\x00-\x1f\\]/.test(path)) return null;
  const segments = path.split("/");
  if (segments[0] !== userId) return null;
  if (segments.length < 2) return null;        // must have something past the prefix
  if (segments.some((s) => s.length === 0)) return null;
  return path;
}

serve(async (req) => {
  // 1. CORS preflight.
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // 2. Method gate.
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // 3. IP rate-limit — runs BEFORE JWT check.
  const ip = callerIp(req);
  const [minute, daily] = await Promise.all([
    minuteLimiter.limit(ip),
    dailyLimiter.limit(ip),
  ]);
  if (!minute.success || !daily.success) {
    const which = !daily.success ? daily : minute;
    const retryAfter = Math.max(1, Math.ceil((which.reset - Date.now()) / 1000));
    return jsonResponse(
      {
        error: "rate_limited",
        window: !daily.success ? "daily" : "minute",
        retry_after_seconds: retryAfter,
      },
      429,
      {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit-Minute": String(MINUTE_LIMIT),
        "X-RateLimit-Limit-Day":    String(DAILY_LIMIT),
        "X-RateLimit-Remaining-Minute": String(Math.max(0, minute.remaining)),
        "X-RateLimit-Remaining-Day":    String(Math.max(0, daily.remaining)),
      },
    );
  }

  // 4. Verify the caller's JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return jsonResponse({ error: "missing_auth" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "invalid_token" }, 401);
  }
  const userId = userData.user.id;

  // 5. Parse + validate body. `expected_bytes` is an optional client
  //    hint — we cap-check it, but the real enforcement happens when
  //    bytes actually land in Storage (Storage rejects oversized).
  let body: { path?: unknown; expected_bytes?: unknown };
  try {
    body = (await req.json()) as { path?: unknown; expected_bytes?: unknown };
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const path = validatePath(body.path, userId);
  if (!path) {
    return jsonResponse({ error: "invalid_path" }, 400);
  }

  if (body.expected_bytes !== undefined) {
    const bytes = Number(body.expected_bytes);
    if (!Number.isFinite(bytes) || bytes < 0 || bytes > MAX_OBJECT_BYTES) {
      return jsonResponse({ error: "object_too_large", max_bytes: MAX_OBJECT_BYTES }, 413);
    }
  }

  // 6. Mint the presigned upload URL. The URL is single-use, valid for
  //    a default of ~2 hours from issuance. Client should use it promptly.
  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (signErr) {
    return jsonResponse({ error: "sign_failed", message: signErr.message }, 500);
  }

  // 7. Return the URL + companion token. The signed_url already
  //    contains the token as a query param; the JS SDK uses `token`
  //    separately. We return both so the client can pick whichever
  //    upload flow it prefers (raw PUT to signed_url vs. SDK's
  //    uploadToSignedUrl(path, token, blob)).
  return jsonResponse(
    {
      ok: true,
      bucket: BUCKET,
      path: signed.path,
      signed_url: signed.signedUrl,
      token: signed.token,
    },
    200,
  );
});
