// Churn-feedback — triggers, local counters, and submission for the
// cancellation / non-conversion feedback prompt.
//
// Three moments open the prompt (see components/ChurnFeedbackGate):
//   1. The user cancels a free trial.
//   2. The user cancels a paid subscription.
//   3. The user has opened the app twice and never subscribed.
//
// Feedback is POSTed to the churn-feedback Supabase Edge Function
// (see supabase/functions/churn-feedback/). That function is the only
// thing that touches the database — per docs/security-non-negotiables.md
// the client never holds a service-role key. If the POST fails the
// modal offers a mailto fallback so feedback is never silently lost.

import { Linking, Alert, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Application from "expo-application";
import Purchases from "react-native-purchases";
import { PREMIUM_ENTITLEMENT_ID } from "./config";

// ────────────────────────────────────────────────────────────────────
// Endpoint resolution. Mirrors src/lib/aiAssistant.js: prefer the
// build-time env var, fall back to expo-constants `extra` so the
// endpoint can be flipped per EAS profile without a rebuild. An empty
// string means the backend isn't wired yet — the feature stays dormant.
// ────────────────────────────────────────────────────────────────────
function resolveEndpoint() {
  const fromEnv = process.env.EXPO_PUBLIC_CHURN_FEEDBACK_URL;
  if (fromEnv) return fromEnv;
  const extra = Constants?.expoConfig?.extra ?? Constants?.manifest?.extra ?? {};
  return extra.churnFeedbackUrl || "";
}
export const CHURN_FEEDBACK_URL = resolveEndpoint();
export const isChurnFeedbackConfigured = () => !!CHURN_FEEDBACK_URL;

// Fallback inbox for the mailto path — mirrors SettingsScreen's
// FEEDBACK_EMAIL (the address the manual "Send Feedback" button uses).
const FEEDBACK_EMAIL = "streetparkinfo@gmail.com";

// ────────────────────────────────────────────────────────────────────
// AsyncStorage keys
// ────────────────────────────────────────────────────────────────────
const KEY_OPEN_COUNT  = "pawrent_app_open_count";
const KEY_CANCEL_DONE = "pawrent_churn_fb_cancel"; // handled unsubscribe timestamp
const KEY_NOSUB_DONE  = "pawrent_churn_fb_nosub";  // "1" once shown

// ── App-open counter — bumped once per cold start (the gate mounts
//    once per process). Returns the new count. ────────────────────────
export async function bumpAppOpenCount() {
  try {
    const raw = await AsyncStorage.getItem(KEY_OPEN_COUNT);
    const next = (parseInt(raw, 10) || 0) + 1;
    await AsyncStorage.setItem(KEY_OPEN_COUNT, String(next));
    return next;
  } catch {
    return 0;
  }
}

// ── Handled flags — each trigger fires at most once. ─────────────────
export async function getCancelHandledKey() {
  try { return await AsyncStorage.getItem(KEY_CANCEL_DONE); }
  catch { return null; }
}
export async function markCancelHandled(unsubKey) {
  try { await AsyncStorage.setItem(KEY_CANCEL_DONE, String(unsubKey)); }
  catch { /* swallow */ }
}
export async function isNoSubHandled() {
  try { return (await AsyncStorage.getItem(KEY_NOSUB_DONE)) === "1"; }
  catch { return false; }
}
export async function markNoSubHandled() {
  try { await AsyncStorage.setItem(KEY_NOSUB_DONE, "1"); }
  catch { /* swallow */ }
}

// ────────────────────────────────────────────────────────────────────
// RevenueCat-state detection
// ────────────────────────────────────────────────────────────────────

// A cancellation is "auto-renew turned off" — RevenueCat surfaces it
// as a non-null unsubscribeDetectedAt on the premium entitlement. We
// read entitlements.all (not .active) so a cancelled trial that has
// since lapsed is still caught. Returns null when there's nothing to
// act on (still renewing, or no premium entitlement ever).
export function detectCancellation(customerInfo) {
  const ent = customerInfo?.entitlements?.all?.[PREMIUM_ENTITLEMENT_ID];
  if (!ent || !ent.unsubscribeDetectedAt) return null;
  const isTrial = String(ent.periodType).toUpperCase() === "TRIAL";
  return {
    kind: isTrial ? "trial" : "subscription",
    // Per-cancellation key — a re-subscribe + re-cancel produces a
    // fresh unsubscribeDetectedAt, which re-arms the prompt.
    unsubKey: String(ent.unsubscribeDetectedAt),
  };
}

// True only once RevenueCat state has loaded AND the user has never
// held any entitlement. customerInfo == null (RC not configured, or
// not yet fetched) returns false — we never guess "never subscribed".
export function hasNeverSubscribed(customerInfo) {
  const all = customerInfo?.entitlements?.all;
  return !!all && Object.keys(all).length === 0;
}

// ────────────────────────────────────────────────────────────────────
// Form content
// ────────────────────────────────────────────────────────────────────

export const CANCEL_REASONS = [
  "Too expensive",
  "Not using it enough",
  "Missing features I wanted",
  "Found a better app",
  "Ran into bugs or problems",
  "Just trying it out",
];

export const NOSUB_REASONS = [
  "Too expensive",
  "Don't need the premium features",
  "Happy with the free version",
  "Not sure it's worth it yet",
  "Ran into bugs or problems",
];

export const AGE_RANGES = ["18–24", "25–34", "35–44", "45–54", "55–64", "65+"];

export const FOUND_VIA = [
  "App Store search",
  "Friend or family",
  "Social media",
  "Web search",
  "News or article",
];

// Prompt copy. CANCEL_TITLE shows only for the 'cancel' variant; the
// 'nosub' variant opens straight at FEEDBACK_BODY (per spec — omit the
// "We're sad to see you go" farewell when the user never subscribed).
export const CANCEL_TITLE = "We're sad to see you go :(";
export const FEEDBACK_BODY =
  "Any feedback is appreciated! Good or bad, it all helps :)";

// ────────────────────────────────────────────────────────────────────
// RevenueCat customer attributes
// ────────────────────────────────────────────────────────────────────

// Pushes user-provided contact + demographic info to RevenueCat so it
// shows on the customer in the RC dashboard (instead of just the
// anonymous id). Best-effort — never blocks or fails the submission.
async function pushRevenueCatAttributes({ name, email, phone, ageRange, foundVia }) {
  try {
    if (email) await Purchases.setEmail(email);
    if (name)  await Purchases.setDisplayName(name);
    if (phone) await Purchases.setPhoneNumber(phone);
    const attrs = {};
    if (ageRange) attrs.churn_age_range = ageRange;
    if (foundVia) attrs.churn_found_via = foundVia;
    if (Object.keys(attrs).length) await Purchases.setAttributes(attrs);
  } catch { /* attributes are a nice-to-have; never block on them */ }
}

// Best-effort read of the RevenueCat anonymous app-user id, so a
// feedback row can be joined to the RC dashboard customer.
async function getRcAppUserId() {
  try { return await Purchases.getAppUserID(); }
  catch { return null; }
}

// ────────────────────────────────────────────────────────────────────
// Submission
// ────────────────────────────────────────────────────────────────────

function appVersionString() {
  return `${Application.nativeApplicationVersion || "?"} (${Application.nativeBuildVersion || "?"})`;
}

// POSTs to the Edge Function. Returns { ok: true } or
// { ok: false, error }. Also pushes RevenueCat attributes (best-effort,
// fire-and-forget — not awaited so it can't slow the submit).
export async function submitChurnFeedback({
  variant, kind, reasons, message, name, email, phone, ageRange, foundVia,
}) {
  if (!CHURN_FEEDBACK_URL) return { ok: false, error: "not_configured" };

  pushRevenueCatAttributes({ name, email, phone, ageRange, foundVia });

  const payload = {
    variant,
    kind: kind || null,
    reasons: reasons || [],
    message: message || "",
    name: name || "",
    email: email || "",
    phone: phone || "",
    ageRange: ageRange || "",
    foundVia: foundVia || "",
    rcAppUserId: (await getRcAppUserId()) || "",
    appVersion: appVersionString(),
    os: `${Platform.OS} ${Platform.Version}`,
  };

  try {
    const res = await fetch(CHURN_FEEDBACK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    return { ok: true };
  } catch {
    return { ok: false, error: "network" };
  }
}

// mailto fallback — used only when the backend POST fails. Opens the
// user's mail app with everything pre-filled so feedback is never
// lost; the user sends it themselves (their address is the From: line).
export async function emailChurnFeedback({
  variant, kind, reasons, message, name, email, phone, ageRange, foundVia,
}) {
  const lead =
    variant === "cancel"
      ? `I cancelled my ${kind === "trial" ? "free trial" : "subscription"}.`
      : "I've been using FloofLife but haven't subscribed.";
  const lines = [
    lead,
    "",
    reasons && reasons.length ? `Reasons: ${reasons.join(", ")}` : "Reasons: (none selected)",
    "",
    "More feedback:",
    message && message.trim() ? message.trim() : "(none)",
    "",
    "About me:",
    `Name: ${name || "(not given)"}`,
    `Email: ${email || "(not given)"}`,
    `Phone: ${phone || "(not given)"}`,
    `Age range: ${ageRange || "(not given)"}`,
    `Found FloofLife via: ${foundVia || "(not given)"}`,
    "",
    "---",
    `App version: ${appVersionString()}`,
    `OS: ${Platform.OS} ${Platform.Version}`,
  ];
  const subject =
    variant === "cancel"
      ? "FloofLife — Cancellation feedback"
      : "FloofLife — Feedback";
  const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
  try {
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
      return true;
    }
  } catch { /* fall through to the alert */ }
  Alert.alert("No mail app found", `Email us at ${FEEDBACK_EMAIL}`, [{ text: "OK" }]);
  return false;
}
