// churn-feedback — receives cancellation / non-conversion feedback
// from the app and stores it in the churn_feedback table.
//
// Per docs/security-non-negotiables.md:
//   Rule 1 — the service-role key lives only here. Supabase injects
//            SUPABASE_SERVICE_ROLE_KEY into every Edge Function; it is
//            never shipped in the client bundle.
//   Rule 4 — the IP rate-limit runs BEFORE any body parsing or DB
//            work, so a flood is rejected at the edge for free.
//            Ceilings are generous for a real user (who submits
//            feedback once or twice ever) but stop row-spam abuse.
//   Rule 8 — the payload is user-supplied personal data; the Privacy
//            Policy discloses this table (see legal/privacy-policy.*).
//
// Pipeline (fail-fast, top → bottom):
//   1. CORS preflight short-circuit
//   2. Method gate (POST only)
//   3. IP rate-limit check (hourly + daily, before any other work)
//   4. Parse + validate the body (bounded, enum-checked)
//   5. Insert one row via the service-role Supabase client
//   6. Return { ok: true }

import { Ratelimit } from "https://esm.sh/@upstash/ratelimit@2.0.3";
import { Redis } from "https://esm.sh/@upstash/redis@1.34.3";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ────────────────────────────────────────────────────────────────────
// Configuration — env-var-driven so ceilings can be tuned without a
// redeploy. Defaults are sized for a feedback endpoint: cheap per
// request (one DB row), so the limit only needs to stop row-spam.
// ────────────────────────────────────────────────────────────────────

const HOURLY_LIMIT = Number(Deno.env.get("CHURN_FEEDBACK_HOURLY_LIMIT") ?? "10");
const DAILY_LIMIT  = Number(Deno.env.get("CHURN_FEEDBACK_DAILY_LIMIT")  ?? "30");

// CORS: the client is an iOS app calling a Supabase URL, so wildcard
// is functionally fine; set it explicitly so a misconfigured caller
// fails loudly. Tighten to a hostname once the app ships a stable one.
const CORS_ORIGIN = Deno.env.get("CHURN_FEEDBACK_CORS_ORIGIN") ?? "*";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ────────────────────────────────────────────────────────────────────
// Clients — module-scoped so they're reused across warm invocations.
// ────────────────────────────────────────────────────────────────────

const redis = Redis.fromEnv();

// Sliding-window per-IP limiters. `prefix` namespaces them so this
// endpoint can share one Redis with ai-floof-assistant without
// collision. Both windows must pass.
const hourlyLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(HOURLY_LIMIT, "1 h"),
  analytics: true,
  prefix: "fl:churn_feedback:hour",
});
const dailyLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(DAILY_LIMIT, "1 d"),
  analytics: true,
  prefix: "fl:churn_feedback:day",
});

// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected into every
// Edge Function by the platform — there is no secret to set by hand.
// The service-role client bypasses RLS, which is how the insert lands
// in a table that is default-deny for every client role.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders },
  });
}

// Pull the caller's IP. Supabase Edge Functions sit behind a proxy
// that sets x-forwarded-for with the original client IP as the
// LEFTMOST entry — only trust the first hop. Falls back to a sentinel
// so a misconfigured request is still rate-limited (bucketed together).
function callerIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("cf-connecting-ip") ?? "unknown";
}

// Trim a string field to a max length; return null for empty/missing
// so the column stores SQL NULL rather than an empty string.
function cleanStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

const VARIANTS = new Set(["cancel", "nosub"]);
const KINDS = new Set(["trial", "subscription"]);

// ────────────────────────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // 1. CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // 2. Method gate.
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // 3. IP rate-limit. Run BEFORE parsing the body so attackers can't
  //    waste CPU on malformed payloads either.
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

  // 4. Parse + validate. The function is the security boundary — we
  //    re-validate everything regardless of what the client sent.
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "invalid_body" }, 400);
  }

  const variant = typeof body.variant === "string" ? body.variant : "";
  if (!VARIANTS.has(variant)) {
    return jsonResponse({ error: "invalid_variant" }, 400);
  }
  const kind =
    typeof body.kind === "string" && KINDS.has(body.kind) ? body.kind : null;

  // reasons — bounded array of short strings.
  let reasons: string[] = [];
  if (Array.isArray(body.reasons)) {
    reasons = body.reasons
      .filter((r): r is string => typeof r === "string")
      .slice(0, 12)
      .map((r) => r.trim().slice(0, 120))
      .filter(Boolean);
  }

  const row = {
    variant,
    kind,
    reasons,
    message:        cleanStr(body.message, 4000),
    contact_name:   cleanStr(body.name, 120),
    contact_email:  cleanStr(body.email, 200),
    contact_phone:  cleanStr(body.phone, 40),
    age_range:      cleanStr(body.ageRange, 40),
    found_via:      cleanStr(body.foundVia, 120),
    rc_app_user_id: cleanStr(body.rcAppUserId, 200),
    app_version:    cleanStr(body.appVersion, 40),
    os:             cleanStr(body.os, 80),
  };

  // 5. Insert. The service-role client bypasses RLS.
  const { error } = await supabase.from("churn_feedback").insert(row);
  if (error) {
    console.error("churn-feedback insert failed:", error.message);
    return jsonResponse({ error: "insert_failed" }, 500);
  }

  // 6. Done.
  return jsonResponse({ ok: true }, 200);
});
