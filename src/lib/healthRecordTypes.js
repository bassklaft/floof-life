// Catalog of pre-defined health record types. The user picks one of
// these (or "Custom") from the Add Entry flow; the catalog drives the
// available duration options and which pet species each shows for.
//
// IMPORTANT: this catalog is a starting list, not veterinary advice.
// Every entry the user logs is paired with a "verify with your vet"
// disclaimer; the durations here are typical defaults, not guarantees.
// AAHA, AVMA, and individual veterinarians revise schedules; users can
// pick a non-default duration from `durationOptions` whenever the
// catalog and their vet disagree.

export const CATEGORIES = {
  vaccine:      { label: "Vaccine",         icon: "needle" },
  preventative: { label: "Preventative",    icon: "shield-check" },
  wellness:     { label: "Wellness / Care", icon: "stethoscope" },
  custom:       { label: "Other",           icon: "plus-circle" },
};

// Each type:
//   id                    — stable string used as the record's `type` field
//   label                 — display name shown in pickers and lists
//   category              — one of CATEGORIES keys
//   defaultDurationMonths — pre-selected option in the add flow
//   durationOptions       — months the user can choose between
//   speciesAvailable      — "dog" | "cat" | "both"
//   subtypeOptions        — optional extra picker (e.g. Rabies 1y vs 3y)
export const HEALTH_RECORD_TYPES = [
  // === DOG VACCINES ===
  {
    id: "rabies-dog",
    label: "Rabies (dog)",
    category: "vaccine",
    speciesAvailable: "dog",
    defaultDurationMonths: 12,
    durationOptions: [12, 36],
  },
  {
    id: "dhpp",
    label: "DHPP / DAPP",
    category: "vaccine",
    speciesAvailable: "dog",
    defaultDurationMonths: 12,
    durationOptions: [12, 36],
  },
  {
    id: "bordetella",
    label: "Bordetella (kennel cough)",
    category: "vaccine",
    speciesAvailable: "dog",
    defaultDurationMonths: 12,
    durationOptions: [6, 12],
  },
  {
    id: "leptospirosis",
    label: "Leptospirosis",
    category: "vaccine",
    speciesAvailable: "dog",
    defaultDurationMonths: 12,
    durationOptions: [12],
  },
  {
    id: "lyme",
    label: "Lyme",
    category: "vaccine",
    speciesAvailable: "dog",
    defaultDurationMonths: 12,
    durationOptions: [12],
  },
  {
    id: "canine-influenza",
    label: "Canine Influenza",
    category: "vaccine",
    speciesAvailable: "dog",
    defaultDurationMonths: 12,
    durationOptions: [12],
  },

  // === CAT VACCINES ===
  {
    id: "fvrcp",
    label: "FVRCP",
    category: "vaccine",
    speciesAvailable: "cat",
    defaultDurationMonths: 12,
    durationOptions: [12, 36],
  },
  {
    id: "rabies-cat",
    label: "Rabies (cat)",
    category: "vaccine",
    speciesAvailable: "cat",
    defaultDurationMonths: 12,
    durationOptions: [12, 36],
  },
  {
    id: "felv",
    label: "FeLV (Feline Leukemia)",
    category: "vaccine",
    speciesAvailable: "cat",
    defaultDurationMonths: 12,
    durationOptions: [12],
  },
  {
    id: "bordetella-cat",
    label: "Bordetella (cat)",
    category: "vaccine",
    speciesAvailable: "cat",
    defaultDurationMonths: 12,
    durationOptions: [12],
  },

  // === PREVENTATIVES (both species) ===
  {
    id: "heartworm-prev",
    label: "Heartworm preventative",
    category: "preventative",
    speciesAvailable: "both",
    defaultDurationMonths: 1,
    durationOptions: [1, 3, 6, 12],
  },
  {
    id: "flea-tick",
    label: "Flea / Tick preventative",
    category: "preventative",
    speciesAvailable: "both",
    defaultDurationMonths: 1,
    durationOptions: [1, 3, 8],
  },
  {
    id: "dewormer",
    label: "Dewormer",
    category: "preventative",
    speciesAvailable: "both",
    defaultDurationMonths: 3,
    durationOptions: [1, 3, 6, 12],
  },

  // === WELLNESS / CARE (both species) ===
  {
    id: "annual-wellness",
    label: "Annual Wellness Check",
    category: "wellness",
    speciesAvailable: "both",
    defaultDurationMonths: 12,
    durationOptions: [6, 12],
  },
  {
    id: "dental-cleaning",
    label: "Dental Cleaning",
    category: "wellness",
    speciesAvailable: "both",
    defaultDurationMonths: 12,
    durationOptions: [12, 24],
  },
  {
    id: "bloodwork",
    label: "Bloodwork / Senior Panel",
    category: "wellness",
    speciesAvailable: "both",
    defaultDurationMonths: 12,
    durationOptions: [6, 12],
  },
  {
    id: "heartworm-test",
    label: "Heartworm Test",
    category: "wellness",
    speciesAvailable: "both",
    defaultDurationMonths: 12,
    durationOptions: [12],
  },
  {
    // FIV / FeLV combo test (the in-clinic SNAP test). Logged as a
    // WELLNESS test, not a vaccine: the FIV vaccine (Fel-O-Vax FIV)
    // was discontinued in North America ~2016 and globally since, so
    // there is no FIV shot to track. Testing IS current practice —
    // AAFP recommends it at adoption / for every new cat, and annual
    // retesting for cats at ongoing risk (outdoor, multi-cat homes
    // with unknown-status cats, after a bite wound).
    id: "fiv-felv-test",
    label: "FIV / FeLV Test",
    category: "wellness",
    speciesAvailable: "cat",
    defaultDurationMonths: 12,
    durationOptions: [12, 24],
  },
  {
    id: "fecal-exam",
    label: "Fecal Exam",
    category: "wellness",
    speciesAvailable: "both",
    defaultDurationMonths: 12,
    durationOptions: [6, 12],
  },
  {
    id: "weight-check",
    label: "Weight Check",
    category: "wellness",
    speciesAvailable: "both",
    defaultDurationMonths: 6,
    durationOptions: [3, 6, 12],
  },
];

// Filter to the types appropriate for this pet's species. "Both" types
// always appear; species-specific types only when matched.
export function typesForSpecies(species) {
  const sp = (species || "dog").toLowerCase();
  return HEALTH_RECORD_TYPES.filter((t) => t.speciesAvailable === "both" || t.speciesAvailable === sp);
}

// Group types by category for the picker UI.
export function typesByCategory(species) {
  const out = { vaccine: [], preventative: [], wellness: [] };
  for (const t of typesForSpecies(species)) {
    if (out[t.category]) out[t.category].push(t);
  }
  return out;
}

export function findType(typeId) {
  return HEALTH_RECORD_TYPES.find((t) => t.id === typeId) || null;
}

// Add `durationMonths` to a Date and return a new Date. Months is the
// canonical unit because vaccine/preventative cadences are quoted in
// months ("3-year rabies", "monthly heartworm"). Calendar-month math:
// keep the same day-of-month when possible, clip to last day if not
// (e.g. Jan 31 + 1mo = Feb 28).
export function addMonths(date, months) {
  const d = new Date(date.getTime());
  const targetMonth = d.getMonth() + months;
  const targetDate = d.getDate();
  d.setDate(1);
  d.setMonth(targetMonth);
  const lastDayOfTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDate, lastDayOfTargetMonth));
  return d;
}

// Helper for the Add flow: compute the next-due date given dateGiven and durationMonths.
export function computeNextDue(dateGivenISO, durationMonths) {
  if (!dateGivenISO || !durationMonths) return null;
  const d = new Date(dateGivenISO);
  if (!isFinite(d.getTime())) return null;
  return addMonths(d, durationMonths).toISOString();
}

// "Up to date" / "Due soon" / "Overdue" status for a record.
export function statusFor(record, today = new Date()) {
  if (!record?.nextDue) return "unknown";
  const due = new Date(record.nextDue);
  const ms = due.getTime() - today.getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days < 0) return "overdue";
  if (days < 30) return "due-soon";
  return "ok";
}

// Days remaining until the record is due (negative = past due). null if
// the record has no nextDue.
export function daysUntilDue(record, today = new Date()) {
  if (!record?.nextDue) return null;
  const due = new Date(record.nextDue);
  if (!isFinite(due.getTime())) return null;
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// Pretty short label for a duration in months — used in chips and
// confirmation text. ("3 years", "12 months", "1 month")
export function durationLabel(months) {
  if (months % 12 === 0) {
    const y = months / 12;
    return y === 1 ? "1 year" : `${y} years`;
  }
  return months === 1 ? "1 month" : `${months} months`;
}
