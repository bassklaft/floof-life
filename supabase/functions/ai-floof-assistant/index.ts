// AI Floof Assistant — Anthropic proxy with IP rate-limit + prompt-cache.
//
// THIS FUNCTION IS THE ONLY PLACE THAT HOLDS THE ANTHROPIC KEY.
// The Expo client never sees it. Per docs/security-non-negotiables.md
// Rule 5: sensitive API calls (LLM providers especially) are always
// proxied through our backend.
//
// Pipeline (top → bottom, fail-fast):
//   1. CORS preflight short-circuit
//   2. Method gate (POST only)
//   3. IP rate-limit check (hourly + daily windows, before any work)
//   4. Request shape validation
//   5. Token-budget guard (max_tokens cap)
//   6. Anthropic call with prompt-caching on the static system prompt
//   7. Return the assistant message + usage metadata to the client
//
// Per the security doc's "reject first, work second" rule, the rate
// limiter runs BEFORE we touch Anthropic — otherwise an attacker can
// burn budget while still getting 429s. Limit ceilings come from the
// doc's recommended AI/LLM ceilings: 30/hour + 200/day per IP.
//
// Prompt caching: the system prompt is ~800 tokens of static persona
// + safety content. We mark it with cache_control so Anthropic caches
// it across calls — first request pays the ~1.25× write premium,
// every subsequent request pays ~0.1× of the input rate for the
// cached portion. This is the single biggest cost lever the function
// has.

import { Ratelimit } from "https://esm.sh/@upstash/ratelimit@2.0.3";
import { Redis } from "https://esm.sh/@upstash/redis@1.34.3";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.65.0";
import { FLOOF_ASSISTANT_SYSTEM_PROMPT } from "./system-prompt.ts";

// ────────────────────────────────────────────────────────────────────
// Configuration — env-var-driven so the values can be tuned without
// redeploying code, and so the model can be cheaper for cost-sensitive
// rollouts. Defaults match the security doc's recommended ceilings.
// ────────────────────────────────────────────────────────────────────

// Model. Default chosen for vet-safety-critical chat: Haiku 4.5 is
// fast + cheap + accurate enough for translating observations into
// vet-question language, the dominant use case here. Set to
// claude-sonnet-4-6 or claude-opus-4-7 if quality regresses.
const MODEL = Deno.env.get("FLOOF_ASSISTANT_MODEL") ?? "claude-haiku-4-5";

// Hard ceiling on output tokens per turn. Combined with rate limits,
// this caps blast-radius if someone tries to drain the budget by
// asking for very long responses. Chat-shaped use case → 1024 is
// generous for a 2-4 paragraph reply.
const MAX_TOKENS = Number(Deno.env.get("FLOOF_ASSISTANT_MAX_TOKENS") ?? "1024");

// Per-IP rate-limit ceilings. Two-window: hourly catches bursts,
// daily catches slow drains. Both must pass.
const HOURLY_LIMIT = Number(Deno.env.get("FLOOF_ASSISTANT_HOURLY_LIMIT") ?? "30");
const DAILY_LIMIT  = Number(Deno.env.get("FLOOF_ASSISTANT_DAILY_LIMIT")  ?? "200");

// CORS: tighten to the production hostname(s) once the app ships under
// a stable domain. Today the client is an iOS app fetching from a
// Supabase URL, so wildcard is functionally fine, but we still set the
// header explicitly so a misconfigured caller fails loudly.
const CORS_ORIGIN = Deno.env.get("FLOOF_ASSISTANT_CORS_ORIGIN") ?? "*";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ────────────────────────────────────────────────────────────────────
// Clients — module-scoped so they're shared across cold-start
// invocations within the same Edge runtime instance.
// ────────────────────────────────────────────────────────────────────

const redis = Redis.fromEnv();

// Sliding-window per-IP limiters. `prefix` namespaces them so other
// FloofLife endpoints can share the same Redis without collision.
const hourlyLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(HOURLY_LIMIT, "1 h"),
  analytics: true,
  prefix: "fl:ai_assistant:hour",
});
const dailyLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(DAILY_LIMIT, "1 d"),
  analytics: true,
  prefix: "fl:ai_assistant:day",
});

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

// ────────────────────────────────────────────────────────────────────
// Types — shape the client sends. Kept loose because the function is
// the security boundary; we re-validate here regardless of what the
// client thinks it's sending.
// ────────────────────────────────────────────────────────────────────

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

type IncomingBody = {
  messages?: IncomingMessage[];
  // First-turn pet context block — see src/lib/aiAssistant.js. We
  // accept it as a separate field so it can't be confused with the
  // conversation; we splice it into the first user turn server-side.
  petContext?: string;
};

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

// Pull the caller's IP. Supabase Edge Functions sit behind their own
// proxy, which sets x-forwarded-for with the original client IP as
// the LEFTMOST entry. Don't trust the whole header — only take the
// first hop. Falls back to a sentinel so a misconfigured request
// still gets rate-limited (just bucketed together).
function callerIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("cf-connecting-ip") ?? "unknown";
}

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
      {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit-Hour":  String(HOURLY_LIMIT),
        "X-RateLimit-Limit-Day":   String(DAILY_LIMIT),
        "X-RateLimit-Remaining-Hour": String(Math.max(0, hourly.remaining)),
        "X-RateLimit-Remaining-Day":  String(Math.max(0, daily.remaining)),
      },
    );
  }

  // 4. Parse + validate.
  let body: IncomingBody;
  try {
    body = (await req.json()) as IncomingBody;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return jsonResponse({ error: "no_messages" }, 400);
  }
  if (messages.length > 40) {
    // Bound conversation length — keeps token spend predictable and
    // prevents someone from stuffing 10K turns of fake history into a
    // single request to burn cache writes.
    return jsonResponse({ error: "too_many_messages", max: 40 }, 400);
  }
  for (const m of messages) {
    if ((m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") {
      return jsonResponse({ error: "invalid_message_shape" }, 400);
    }
    if (m.content.length > 16_000) {
      return jsonResponse({ error: "message_too_long", max_chars: 16_000 }, 400);
    }
  }

  // 5. Splice the pet-context block into the first user message. We
  //    put it on the user turn (not the system prompt) so the system
  //    prompt stays byte-identical across all callers — only then does
  //    Anthropic's prompt cache pay off. The pet-context block itself
  //    is per-pet and won't cache cross-conversation, but it's small
  //    and stable within a conversation, which is enough.
  const petContext = typeof body.petContext === "string" ? body.petContext.slice(0, 8_000) : "";
  const apiMessages = messages.map((m, i) => {
    if (i === 0 && m.role === "user" && petContext) {
      return {
        role: "user" as const,
        content: `[PET CONTEXT]\n${petContext}\n[/PET CONTEXT]\n\n${m.content}`,
      };
    }
    return { role: m.role, content: m.content };
  });

  // 6. Call Anthropic. We mark the system prompt with cache_control so
  //    its tokens come back as cache_read on every subsequent request
  //    (~10× cheaper input price). With Haiku 4.5 the minimum
  //    cacheable prefix is 4096 tokens — the system prompt alone is
  //    smaller, so on shorter conversations the cache won't activate
  //    yet. Once the user has a few turns of history, the cumulative
  //    prefix crosses the threshold and caching kicks in.
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: "text",
          text: FLOOF_ASSISTANT_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: apiMessages,
    });

    // Extract the assistant text. We don't pass tool definitions, so
    // every block should be a text block — but we narrow defensively.
    let text = "";
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
    }

    return jsonResponse(
      {
        text,
        stop_reason: response.stop_reason,
        usage: {
          input_tokens:                response.usage.input_tokens,
          output_tokens:               response.usage.output_tokens,
          cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens:     response.usage.cache_read_input_tokens     ?? 0,
        },
        rate_limit: {
          remaining_hour: hourly.remaining,
          remaining_day:  daily.remaining,
        },
      },
      200,
    );
  } catch (err) {
    // Map upstream Anthropic errors to clean client-side codes. The
    // raw Anthropic message can include internal detail we don't want
    // surfacing to the iOS UI.
    if (err instanceof Anthropic.RateLimitError) {
      return jsonResponse({ error: "upstream_rate_limited" }, 429);
    }
    if (err instanceof Anthropic.OverloadedError) {
      return jsonResponse({ error: "upstream_overloaded" }, 503);
    }
    if (err instanceof Anthropic.BadRequestError) {
      return jsonResponse({ error: "bad_request" }, 400);
    }
    if (err instanceof Anthropic.APIError) {
      return jsonResponse({ error: "upstream_error", status: err.status }, 502);
    }
    console.error("ai-floof-assistant unexpected error:", err);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
