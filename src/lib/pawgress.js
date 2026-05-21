// Pawgress — daily care tracker. Five segments per day per pet (four
// toe pads + one main "daily special" pad). State is per-pet,
// per-date (YYYY-MM-DD local time), so day rollover is implicit —
// the next day key returns a fresh empty record.
//
// AsyncStorage shape (designed to mirror the future Supabase
// `pawgress_days` table the security doc + feature spec describe —
// see docs/features/pawgress-indicator.md):
//
//   pawrent_pawgress_v1: {
//     [petId]: {
//       [yyyy-mm-dd]: { food, movement, body, mind, special }
//     }
//   }
//
// Each segment is a boolean. The optional `special.kind` rotates
// weekly per the rotation schedule below; presence of the special
// segment is independent of the other four.
//
// When backend ships in v1.3+, the sync engine pushes pending local
// rows (anything written here) to `pawgress_days` upserting on
// (user_id, pet_id, day). RLS keeps each user's rows scoped to
// auth.uid() per the security doc.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { signalValueMoment } from "./accountPrompt";

const KEY = "pawrent_pawgress_v1";

export const PAW_SEGMENTS = ["food", "movement", "body", "mind", "special"];
export const SEGMENT_LABELS = {
  food: "Food & Water",
  movement: "Movement",
  body: "Body Check",
  mind: "Mind & Bond",
  special: "Daily Special",
};
export const SEGMENT_DESCRIPTIONS = {
  food: "Fresh water + measured meal portions today",
  movement: "Walk, play, or structured activity matching the breed's energy",
  body: "Quick check of ears, eyes, paws, coat — anything off?",
  mind: "Training, enrichment, or focused cuddle time",
  special: "Today's rotating extra (varies by day of week)",
};

// Daily special rotates by day of week (0=Sun … 6=Sat). Starts simple;
// can become user-configurable in a future version.
const DAILY_SPECIAL_ROTATION = {
  0: { kind: "weigh",    label: "Weigh + body-condition score" },
  1: { kind: "dental",   label: "Dental: brush teeth or dental chew" },
  2: { kind: "groom",    label: "Brush coat or check nails" },
  3: { kind: "brush",    label: "Brush coat or check nails" },
  4: { kind: "training", label: "5 min of focused training" },
  5: { kind: "novelty",  label: "New smell, new route, or puzzle toy" },
  6: { kind: "snuggle",  label: "Long snuggle / vet-check feel-up" },
};

export function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dateKeyFor(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dailySpecialFor(dateKey) {
  const d = new Date(dateKey + "T00:00:00");
  return DAILY_SPECIAL_ROTATION[d.getDay()] || DAILY_SPECIAL_ROTATION[0];
}

function emptyDay(dateKey) {
  return {
    food: false,
    movement: false,
    body: false,
    mind: false,
    special: false,
    specialKind: dailySpecialFor(dateKey).kind,
  };
}

async function loadAll() {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

async function saveAll(map) {
  await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

export const Pawgress = {
  async getDay(petId, dateKey = todayKey()) {
    if (!petId) return emptyDay(dateKey);
    const all = await loadAll();
    const day = all?.[petId]?.[dateKey];
    if (!day) return emptyDay(dateKey);
    // Fill in missing fields (defensive against old shapes).
    return { ...emptyDay(dateKey), ...day };
  },

  async toggleSegment(petId, segment, dateKey = todayKey()) {
    if (!petId) return null;
    if (!PAW_SEGMENTS.includes(segment)) return null;
    const all = await loadAll();
    const petMap = all[petId] || {};
    const day = { ...emptyDay(dateKey), ...(petMap[dateKey] || {}) };
    day[segment] = !day[segment];
    petMap[dateKey] = day;
    all[petId] = petMap;
    await saveAll(all);
    // Completing all 5 segments for a day is an account soft-prompt
    // value moment (a "ring complete").
    if (Pawgress.isAllFive(day)) signalValueMoment("pawgress");
    return day;
  },

  async setSegment(petId, segment, value, dateKey = todayKey()) {
    if (!petId) return null;
    if (!PAW_SEGMENTS.includes(segment)) return null;
    const all = await loadAll();
    const petMap = all[petId] || {};
    const day = { ...emptyDay(dateKey), ...(petMap[dateKey] || {}) };
    day[segment] = !!value;
    petMap[dateKey] = day;
    all[petId] = petMap;
    await saveAll(all);
    if (Pawgress.isAllFive(day)) signalValueMoment("pawgress");
    return day;
  },

  // Premium history view. Returns array of { dateKey, day } sorted
  // newest first, bounded by maxDays (e.g. 30 / 90 / 365 / Infinity).
  async getRange(petId, maxDays = 30) {
    if (!petId) return [];
    const all = await loadAll();
    const petMap = all[petId] || {};
    const today = new Date(todayKey() + "T00:00:00");
    const out = [];
    for (let i = 0; i < maxDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = dateKeyFor(d);
      out.push({ dateKey: key, day: { ...emptyDay(key), ...(petMap[key] || {}) } });
    }
    return out;
  },

  // Streak = consecutive days (counting backward from today, but not
  // requiring today to be complete) where all 5 segments are filled.
  // Today is included in the streak only if today is currently all-5.
  async getStreak(petId) {
    if (!petId) return 0;
    const all = await loadAll();
    const petMap = all[petId] || {};
    let streak = 0;
    const today = new Date(todayKey() + "T00:00:00");
    let cursor = new Date(today);
    // If today isn't complete, start from yesterday so a partial
    // morning doesn't break a 14-day streak.
    const todayKeyStr = dateKeyFor(cursor);
    const todayDay = petMap[todayKeyStr];
    const todayAllFive = todayDay && PAW_SEGMENTS.every((s) => todayDay[s]);
    if (!todayAllFive) cursor.setDate(cursor.getDate() - 1);
    while (true) {
      const key = dateKeyFor(cursor);
      const day = petMap[key];
      const allFive = day && PAW_SEGMENTS.every((s) => day[s]);
      if (!allFive) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
      // Defensive cap so a malformed store can't infinite-loop.
      if (streak > 10000) break;
    }
    return streak;
  },

  // Count of segments filled today.
  countCompleted(day) {
    if (!day) return 0;
    return PAW_SEGMENTS.reduce((acc, s) => acc + (day[s] ? 1 : 0), 0);
  },

  isAllFive(day) {
    if (!day) return false;
    return PAW_SEGMENTS.every((s) => day[s]);
  },
};
