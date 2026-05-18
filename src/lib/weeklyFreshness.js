// Weekly content-freshness engine for the checklist.
//
// The care checklist is, correctly, mostly repetitive — brushing,
// weigh-ins, ear checks recur because the care recurs. The risk is
// that the WHOLE screen then feels static: nothing changes week to
// week, so there's no reason to come back, and (once Premium-gated)
// no reason to keep paying — a user could screenshot it once and be
// "done".
//
// This engine adds a freshness LAYER on top of that stable core:
// every week each pet gets a rotated theme ("this week's focus"), a
// rotated "did you know" tip, and two fresh spotlight tasks.
// Selection is fully deterministic from (petId, weekIndex):
//   - identical all week (no flicker between renders / relaunches)
//   - advances exactly once per week, automatically
//   - phase-shifted per pet (two floofs don't see the same week)
//   - cycles the whole pool before repeating
// It needs no backend and works entirely offline — consistent with
// FloofLife's local-first architecture, and unaffected by the future
// account system (rotation keys off the local petId).

import { WEEKLY_THEMES, SPOTLIGHT_TASKS, FRESHNESS_TIPS } from "../data/weeklyContent";
import { RULES_OF_THUMB } from "../data/rulesOfThumb";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// A stable integer that increments once per week, rolling over at
// local Monday midnight. Same value for every render within a week.
// The Monday's calendar date is converted through Date.UTC so DST and
// timezone shifts can't make two consecutive Mondays land in the same
// or a skipped bucket.
export function getWeekIndex(date = new Date()) {
  const d = new Date(date.getTime());
  const mondayOffset = (d.getDay() + 6) % 7; // days since Monday (0 = Mon)
  d.setDate(d.getDate() - mondayOffset);     // back to this week's Monday
  const utcMonday = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(utcMonday / WEEK_MS);
}

// djb2 string hash → non-negative int. Phase-shifts each pet's
// rotation so two floofs in one household don't see the same week.
function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Positive modulo — guards against negative seeds / empty pools.
function mod(n, m) {
  return m > 0 ? ((n % m) + m) % m : 0;
}

function petAgeYears(pet) {
  if (pet?.ageYears != null) return pet.ageYears;
  if (pet?.ageMonths != null) return pet.ageMonths / 12;
  return 3;
}

// Replace the {pet} token with the pet's name (or a warm fallback).
export function fillPet(str, pet) {
  if (typeof str !== "string") return str;
  return str.replace(/\{pet\}/g, pet?.name || "your floof");
}

// Build the (pet)-specific applicability filter. A content item may
// carry `species` (array) and/or `stage` ("senior" | "young"). Age
// thresholds match generateChecklist() in lib/checklist.js.
function makeFilter(pet) {
  const species = (pet?.species || "dog").toLowerCase();
  const age = petAgeYears(pet);
  const isSenior = (species === "dog" && age >= 7) || (species === "cat" && age >= 10);
  const isYoung = age < 1;
  return (c) => {
    if (Array.isArray(c.species) && !c.species.includes(species)) return false;
    if (c.stage === "senior" && !isSenior) return false;
    if (c.stage === "young" && !isYoung) return false;
    return true;
  };
}

// Deterministically pick one item from `pool` for this (pet, week).
function rotate(pool, week, offset) {
  return pool.length ? pool[mod(week + offset, pool.length)] : null;
}

// The full freshness payload for a pet's checklist this week:
//   { weekIndex, theme, tip, spotlight }
// `spotlight` items come out already in checklist-item shape
// ({ id, title, why, cadence, category }) with a week-stamped id, so
// the screen can merge them straight into the checklist — last week's
// spotlight items simply fall out of the list, fresh ones take over.
export function weeklyContentFor(pet, date = new Date()) {
  const weekIndex = getWeekIndex(date);
  if (!pet) return { weekIndex, theme: null, tip: null, spotlight: [] };

  const applies = makeFilter(pet);
  const offset = hashString(String(pet.id || pet.name || "floof"));

  // Theme — "this week's focus".
  const themes = WEEKLY_THEMES.filter(applies);
  const rawTheme = rotate(themes, weekIndex, offset);
  const theme = rawTheme
    ? { id: rawTheme.id, title: fillPet(rawTheme.title, pet), blurb: fillPet(rawTheme.blurb, pet) }
    : null;

  // Tip — drawn from the freshness pool PLUS the existing rules of
  // thumb, so the corpus is large enough not to repeat for months.
  // Offset by 7 so the tip doesn't rotate in lockstep with the theme.
  const tipPool = [...FRESHNESS_TIPS, ...RULES_OF_THUMB].filter(applies);
  const rawTip = rotate(tipPool, weekIndex, offset + 7);
  const tip = rawTip
    ? { id: rawTip.id || null, title: fillPet(rawTip.title, pet), body: fillPet(rawTip.body, pet) }
    : null;

  // Spotlight — two distinct fresh tasks, in checklist-item shape.
  const tasks = SPOTLIGHT_TASKS.filter(applies);
  const spotlight = [];
  const count = Math.min(2, tasks.length);
  for (let k = 0; k < count; k++) {
    const t = tasks[mod(weekIndex * 2 + offset + k, tasks.length)];
    spotlight.push({
      // Week-stamped so each week is a fresh, separately-tracked item;
      // last week's id simply drops out of the rendered list.
      id: `wk${weekIndex}-${t.id}`,
      title: fillPet(t.title, pet),
      why: fillPet(t.why, pet),
      cadence: "weekly",
      category: "this week",
    });
  }

  return { weekIndex, theme, tip, spotlight };
}
