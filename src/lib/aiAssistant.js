// Client-side wrapper for the Floof Assistant proxy. The actual
// Anthropic call lives in /supabase/functions/ai-floof-assistant —
// the client never holds the API key.
//
// Two responsibilities:
//   1. Build the pet-context block server-bound from local-only
//      AsyncStorage data (mood logs, tummy logs, health records,
//      lifestyle answers, breed/age/weight). We do this client-side
//      so the backend stays stateless — it never reads pet data from
//      a DB. The data goes over HTTPS only for the duration of the
//      request.
//   2. POST to the proxy and return the assistant's reply.
//
// Pet data shipped is bounded — last 20 mood logs, last 15 stool, last
// 15 diet, all health records (typically <30), lifestyle answers.
// Photos and exact timestamps are stripped; we only include what
// would matter to a vet reading a summary.

import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Pets } from "./storage";
import { StoolLog, DietLog, BRISTOL_LABELS, STOOL_COLOR_LABELS, DIET_MEAL_TYPE_LABELS } from "./tummy";
import { findType } from "./healthRecordTypes";
import { MOOD_BY_ID, MOOD_SLOT_LABELS } from "../data/moods";
import { getPetBreeds, mixedBreedLabel } from "./petBreeds";
import { breedDisplayName } from "../data/breeds";
import { LIFESTYLE_QUESTIONS, LIFESTYLE_DISPLAY } from "../data/lifestyleQuestions";
import { CONDITION_BY_ID } from "../data/conditions";

// Resolved at module load. We support both EXPO_PUBLIC_AI_PROXY_URL
// (preferred — set via .env, baked into the bundle at build time) AND
// an `extra` field in app.json/eas.json for deploy-time injection.
function resolveProxyUrl() {
  // process.env.EXPO_PUBLIC_* is inlined at build time by Expo.
  const fromEnv = process.env.EXPO_PUBLIC_AI_PROXY_URL;
  if (fromEnv) return fromEnv;
  // Fallback: expo-constants `extra`. Lets us flip the endpoint per
  // EAS profile (dev / preview / prod) without rebuilding the app.
  const extra = Constants?.expoConfig?.extra ?? Constants?.manifest?.extra ?? {};
  return extra.aiProxyUrl || "";
}

export const AI_PROXY_URL = resolveProxyUrl();
export const isConfigured = () => !!AI_PROXY_URL;

// ────────────────────────────────────────────────────────────────────
// Chat memory — the assistant's conversation history is persisted
// per-pet in AsyncStorage so it survives leaving + reopening the chat.
// Stored locally only (like all pet data); never sent anywhere except
// the bounded turns included in each request. Capped so storage stays
// small and the next session reloads quickly.
// ────────────────────────────────────────────────────────────────────
const CHAT_HISTORY_CAP = 40;
const chatKey = (petId) => `pawrent_ai_chat_${petId}`;

export async function loadChatHistory(petId) {
  if (!petId) return [];
  try {
    const raw = await AsyncStorage.getItem(chatKey(petId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function saveChatHistory(petId, turns) {
  if (!petId) return;
  try {
    const bounded = (Array.isArray(turns) ? turns : []).slice(-CHAT_HISTORY_CAP);
    await AsyncStorage.setItem(chatKey(petId), JSON.stringify(bounded));
  } catch { /* swallow — history is best-effort */ }
}

export async function clearChatHistory(petId) {
  if (!petId) return;
  try { await AsyncStorage.removeItem(chatKey(petId)); } catch { /* swallow */ }
}

const titleCase = (s) => (s || "").split(" ").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");

function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ────────────────────────────────────────────────────────────────────
// Build the pet-context block sent to the model.
//
// Format is plain text with section headers — the model parses it
// like reading a chart, and any text-based format works (don't use
// JSON; the model is better at narrative summaries). Keep it under
// ~2000 chars typical so we don't blow the input budget.
// ────────────────────────────────────────────────────────────────────
export async function buildPetContext(petId) {
  if (!petId) return "";
  const all = await Pets.list();
  const pet = all.find((p) => p.id === petId);
  if (!pet) return "";

  const lines = [];
  const breedKeys = getPetBreeds(pet);
  const breedDisp = mixedBreedLabel(pet)
    || (breedKeys[0] ? breedDisplayName(breedKeys[0]) : "");

  lines.push(`Name: ${pet.name || "unnamed"}`);
  lines.push(`Species: ${titleCase(pet.species || "")}`);
  if (breedDisp) lines.push(`Breed: ${breedDisp}`);
  if (pet.ageYears != null) lines.push(`Age: ${pet.ageYears} yr`);
  if (pet.weightLbs) lines.push(`Weight: ${pet.weightLbs} lb`);
  if (pet.mixOf) lines.push(`Mix of: ${pet.mixOf}`);

  // Diagnosed conditions — high-signal context. Surface these early
  // and explicitly so the assistant factors them into every answer
  // (e.g. an FIV+ cat changes how to think about a minor symptom).
  const conditions = Array.isArray(pet.conditions) ? pet.conditions : [];
  if (conditions.length > 0) {
    lines.push("");
    lines.push("Diagnosed conditions (vet-confirmed — owner is tracking these):");
    for (const c of conditions) {
      const guide = CONDITION_BY_ID[c.conditionId];
      const label = guide?.label || c.conditionId;
      const diagnosed = c.diagnosedDate ? ` (diagnosed ${fmtDate(c.diagnosedDate)})` : "";
      lines.push(`- ${label}${diagnosed}`);
      if (c.note) lines.push(`  owner note: ${c.note}`);
    }
  }

  // Lifestyle — what the owner has self-reported (activity, food,
  // vet, tummy baseline). Skip empty.
  const lifestyle = (pet.lifestyle && typeof pet.lifestyle === "object") ? pet.lifestyle : {};
  const lifestyleLines = [];
  for (const q of LIFESTYLE_QUESTIONS) {
    const v = lifestyle[q.key];
    if (v == null || (Array.isArray(v) && v.length === 0)) continue;
    const valueToLabel = LIFESTYLE_DISPLAY[q.key]?.valueToLabel || {};
    const value = Array.isArray(v)
      ? v.map((x) => valueToLabel[x] || String(x)).join(", ")
      : (valueToLabel[v] || String(v));
    lifestyleLines.push(`- ${q.title.replace(/\{pet\}/g, pet.name || "the floof")}: ${value}`);
  }
  if (lifestyleLines.length > 0) {
    lines.push("");
    lines.push("Lifestyle:");
    lines.push(...lifestyleLines);
  }

  // Health records — vaccines, preventatives, wellness. Most recent
  // first. Mark anything overdue.
  const records = Array.isArray(pet.healthRecords) ? pet.healthRecords : [];
  if (records.length > 0) {
    const sorted = records.slice().sort((a, b) => new Date(b.dateGiven || 0) - new Date(a.dateGiven || 0));
    lines.push("");
    lines.push("Health records:");
    for (const r of sorted.slice(0, 12)) {
      const t = findType(r.type);
      const label = r.customLabel || t?.label || r.type || "record";
      const datePart = r.dateGiven ? ` (given ${fmtDate(r.dateGiven)})` : "";
      const duePart  = r.nextDue   ? `, next due ${fmtDate(r.nextDue)}` : "";
      lines.push(`- ${label}${datePart}${duePart}`);
    }
  }

  // Mood — last 14 days, summarized as a slot/mood timeline.
  const moodLogs = Array.isArray(pet.moodLogs) ? pet.moodLogs : [];
  if (moodLogs.length > 0) {
    const recent = moodLogs.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 20);
    lines.push("");
    lines.push("Recent moods (most recent first):");
    for (const m of recent) {
      const mood = MOOD_BY_ID[m.moodId];
      const slot = MOOD_SLOT_LABELS[m.slot] || titleCase(m.slot || "");
      lines.push(`- ${fmtDate(m.ts)} (${slot}): ${mood?.label || m.moodId}${mood?.tone === "watch" ? " [watch]" : ""}`);
    }
  }

  // Tummy — stool + diet, last 15 of each, most recent first.
  try {
    const [stool, diet] = await Promise.all([StoolLog.list(petId), DietLog.list(petId)]);
    if (stool.length > 0) {
      lines.push("");
      lines.push("Recent stool log:");
      for (const e of stool.slice(0, 15)) {
        const flags = [];
        if (e.hasBlood)           flags.push("blood");
        if (e.hasMucus)           flags.push("mucus");
        if (e.hasForeignMaterial) flags.push("foreign material");
        if (e.hasUndigestedFood)  flags.push("undigested food");
        const flagsStr = flags.length ? ` [${flags.join(", ")}]` : "";
        lines.push(`- ${fmtDate(e.ts)}: Bristol ${e.bristol} (${BRISTOL_LABELS[e.bristol] || ""}), ${STOOL_COLOR_LABELS[e.color] || e.color || "color unknown"}${flagsStr}`);
      }
    }
    if (diet.length > 0) {
      lines.push("");
      lines.push("Recent diet log:");
      for (const e of diet.slice(0, 15)) {
        const product = [e.brand, e.productName].filter(Boolean).join(" — ");
        lines.push(`- ${fmtDate(e.ts)}: ${DIET_MEAL_TYPE_LABELS[e.mealType] || e.mealType}${product ? `, ${product}` : ""}${e.recallMatched ? " [RECALL MATCH]" : ""}`);
      }
    }
  } catch { /* tummy logs are optional; swallow */ }

  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────
// POST to the proxy. Surfaces structured errors so the UI can map
// them to friendly messages without parsing strings.
// ────────────────────────────────────────────────────────────────────

export class FloofAssistantError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

export async function askFloofAssistant({ messages, petContext, signal }) {
  if (!AI_PROXY_URL) {
    throw new FloofAssistantError("not_configured", "AI proxy URL not configured.");
  }
  let res;
  try {
    res = await fetch(AI_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, petContext }),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    throw new FloofAssistantError("network", err?.message || "Network error");
  }
  // Body MAY not be JSON if the function crashed — wrap parse defensively.
  let body = null;
  try { body = await res.json(); } catch { /* swallow */ }
  if (!res.ok) {
    const code = body?.error || `http_${res.status}`;
    throw new FloofAssistantError(code, body?.error || `Server error (${res.status})`, body || {});
  }
  return body;
}
