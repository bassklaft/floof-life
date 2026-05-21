// account-delete — Edge Function that permanently deletes a user's
// cloud copy. Required by Apple Guideline 5.1.1(v): every iOS app that
// supports account creation must support in-app account deletion.
//
// Pipeline (fail-fast, top → bottom):
//   1. CORS preflight short-circuit
//   2. Method gate (POST only)
//   3. IP rate-limit check (security-non-negotiables.md Rule 4 — runs
//      BEFORE any other work, deletion is rare so the ceilings are tight)
//   4. Verify the caller's JWT → gives us their user_id
//   5. Delete every Storage object under <user_id>/ in pet-media
//   6. Delete auth.users row → ON DELETE CASCADE removes per-user rows
//   7. Return { ok: true }
//
// The function uses the service-role key (Supabase injects it as
// SUPABASE_SERVICE_ROLE_KEY). It is NEVER exposed to the client — the
// client only forwards its own JWT, which the function verifies before
// doing the privileged work.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { Ratelimit } from "https://esm.sh/@upstash/ratelimit@2.0.3";
import { Redis } from "https://esm.sh/@upstash/redis@1.34.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "pet-media";

// Tight ceilings — account deletion is a once-per-account-lifetime
// action. Anything beyond 3/hour from a single IP is abuse.
const HOURLY_LIMIT = Number(Deno.env.get("ACCOUNT_DELETE_HOURLY_LIMIT") ?? "3");
const DAILY_LIMIT  = Number(Deno.env.get("ACCOUNT_DELETE_DAILY_LIMIT")  ?? "5");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const redis = Redis.fromEnv();
const hourlyLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(HOURLY_LIMIT, "1 h"),
  analytics: true,
  prefix: "fl:account_delete:hour",
});
const dailyLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(DAILY_LIMIT, "1 d"),
  analytics: true,
  prefix: "fl:account_delete:day",
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

serve(async (req) => {
  // 1. CORS preflight.
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // 2. Method gate.
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // 3. IP rate-limit — runs BEFORE the JWT check so attackers can't
  //    burn JWT-verification CPU either.
  const ip = callerIp(req);
  const [hourly, daily] = await Promise.all([
    hourlyLimiter.limit(ip),
    dailyLimiter.limit(ip),
  ]);
  if (!hourly.success || !daily.success) {
    const which = !daily.success ? daily : hourly;
    const retryAfter = Math.max(1, Math.ceil((which.reset - Date.now()) / 1000));
    return jsonResponse(
      {
        error: "rate_limited",
        window: !daily.success ? "daily" : "hourly",
        retry_after_seconds: retryAfter,
      },
      429,
      { "Retry-After": String(retryAfter) },
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

  try {
    // 5. Wipe Storage objects under `<userId>/`. List recursively, then
    //    delete in batches. Storage.list is shallow — walk manually.
    const filesToDelete: string[] = [];
    async function walk(prefix: string) {
      let offset = 0;
      while (true) {
        const { data, error } = await admin.storage.from(BUCKET).list(prefix, {
          limit: 1000,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const item of data) {
          // Folders come back with id === null per Supabase Storage convention.
          if (item.id === null) {
            await walk(`${prefix}/${item.name}`);
          } else {
            filesToDelete.push(`${prefix}/${item.name}`);
          }
        }
        if (data.length < 1000) break;
        offset += data.length;
      }
    }
    await walk(userId);

    while (filesToDelete.length > 0) {
      const batch = filesToDelete.splice(0, 1000);
      const { error: rmErr } = await admin.storage.from(BUCKET).remove(batch);
      if (rmErr) throw rmErr;
    }

    // 6. Delete the auth.users row (cascades to per-user tables).
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) throw delErr;

    return jsonResponse({ ok: true, user_id: userId }, 200);
  } catch (err) {
    return jsonResponse({ error: (err as Error)?.message ?? String(err) }, 500);
  }
});
