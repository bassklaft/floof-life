// Account soft-prompt scheduler.
//
// Per the v1.3 product spec: the account prompt is OPT-IN and must
// fire only AFTER a value moment — never on first launch or app open.
// Triggers (whichever comes first):
//   - first Tummy entry logged (stool or diet)
//   - a Pawgress ring completed (all 5 segments in a day)
//   - a 2nd pet added
//   - the 3rd app session
//
// Fire-once-then-respect-"Maybe later": after a prompt is shown we
// record the timestamp + a lifetime counter. Re-prompts wait a minimum
// of 7 days and stop entirely after 3 lifetime shows. Creating an
// account (signing in) ends prompting permanently.
//
// State lives in AsyncStorage; an in-memory listener set (same shape as
// activePet.js) lets the mounted modal react the instant a value moment
// fires, without polling.

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_SESSIONS = "pawrent_account_prompt_sessions"; // cold-start counter
const KEY_LIFETIME = "pawrent_account_prompt_count";    // # times shown
const KEY_LAST_TS  = "pawrent_account_prompt_last_ts";  // ms of last show
const KEY_DONE     = "pawrent_account_prompt_done";     // "1" => never prompt again

export const MAX_LIFETIME_PROMPTS = 3;
export const REPROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SESSION_TRIGGER = 3;

const listeners = new Set();
// In-memory flag: did a value moment occur this process? Lets the modal
// fire even if the value moment (e.g. the session-3 trigger during boot)
// happened before the component subscribed.
let _valueMomentFired = false;
let _lastKind = null;

// Subscribe to value moments. Returns an unsubscribe fn.
export function onValueMoment(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Fire a value moment. Safe to call from any data-layer write — it's
// fire-and-forget and never throws into the caller.
export function signalValueMoment(kind) {
  _valueMomentFired = true;
  _lastKind = kind || "unknown";
  for (const fn of listeners) {
    try { fn(_lastKind); } catch { /* swallow — never break a write */ }
  }
}

export function hasValueMomentFired() {
  return _valueMomentFired;
}
export function lastValueMomentKind() {
  return _lastKind;
}

// Bump the cold-start session counter. Call once at app boot. When the
// count reaches SESSION_TRIGGER, that itself counts as a value moment.
export async function recordSession() {
  try {
    const n = (parseInt(await AsyncStorage.getItem(KEY_SESSIONS), 10) || 0) + 1;
    await AsyncStorage.setItem(KEY_SESSIONS, String(n));
    if (n >= SESSION_TRIGGER) signalValueMoment("session");
    return n;
  } catch {
    return 0;
  }
}

// Permanently stop prompting (account created, or max reached).
export async function markDone() {
  try { await AsyncStorage.setItem(KEY_DONE, "1"); } catch { /* swallow */ }
}

// Record that we just showed the prompt: bump the lifetime counter and
// stamp the time. Hitting the max flips the done flag.
export async function markPrompted() {
  try {
    const n = (parseInt(await AsyncStorage.getItem(KEY_LIFETIME), 10) || 0) + 1;
    await AsyncStorage.setItem(KEY_LIFETIME, String(n));
    await AsyncStorage.setItem(KEY_LAST_TS, String(Date.now()));
    if (n >= MAX_LIFETIME_PROMPTS) await markDone();
  } catch { /* swallow */ }
}

// Should we show the prompt right now? Caller is still responsible for
// the orthogonal gates (Supabase configured, user signed out, onboarded)
// — this covers only the frequency/lifetime contract.
export async function shouldPromptNow() {
  try {
    if ((await AsyncStorage.getItem(KEY_DONE)) === "1") return false;
    const count = parseInt(await AsyncStorage.getItem(KEY_LIFETIME), 10) || 0;
    if (count >= MAX_LIFETIME_PROMPTS) return false;
    const lastTs = parseInt(await AsyncStorage.getItem(KEY_LAST_TS), 10) || 0;
    if (lastTs && Date.now() - lastTs < REPROMPT_COOLDOWN_MS) return false;
    return true;
  } catch {
    return false;
  }
}
