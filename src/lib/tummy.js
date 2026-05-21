// Tummy Tracker data layer — per-pet stool log + diet log + saved
// foods (a small autocomplete cache). Schema is designed to mirror
// the future Supabase tables `stool_logs`, `diet_logs`, `saved_foods`
// exactly. When backend ships in v1.3+, the sync engine pushes
// records with status `pending` → `synced`.
//
// Spec: docs/features/tummy-tracker.md.
//
// AsyncStorage keys:
//   pawrent_tummy_stool_v1: { [petId]: StoolEntry[] }
//   pawrent_tummy_diet_v1:  { [petId]: DietEntry[] }
//   pawrent_tummy_saved_foods_v1: { [petId]: SavedFood[] }
//
// StoolEntry shape:
//   { id, ts, bristol (1-7), color, volume, hasMucus, hasBlood,
//     hasForeignMaterial, hasUndigestedFood, walkLocation, photoUri,
//     note, syncStatus }
//
// DietEntry shape:
//   { id, ts, mealType, brand, productName, amount, note,
//     recallMatched, recallId, syncStatus }
//
// SavedFood shape (autocomplete cache):
//   { id, brand, productName, lastUsedTs }

import AsyncStorage from "@react-native-async-storage/async-storage";
import { signalValueMoment } from "./accountPrompt";

const KEY_STOOL = "pawrent_tummy_stool_v1";
const KEY_DIET  = "pawrent_tummy_diet_v1";
const KEY_FOODS = "pawrent_tummy_saved_foods_v1";

// Bristol Stool Scale 1-7. Numeric for storage; UI maps to icons +
// human labels at render time.
export const BRISTOL_LABELS = {
  1: "Pebbles — separate hard lumps",
  2: "Lumpy log — sausage-shaped but bumpy",
  3: "Cracked log — sausage with cracks",
  4: "Smooth log — soft, snake-like (ideal)",
  5: "Soft blobs — distinct soft lumps",
  6: "Mushy — fluffy pieces, ragged edges",
  7: "Liquid — entirely liquid, no solid",
};

export const STOOL_COLORS = ["brown", "dark_brown", "black", "yellow", "orange", "green", "red", "red_tinged", "gray", "pale"];
export const STOOL_COLOR_LABELS = {
  brown:       "Brown — typical",
  dark_brown:  "Dark brown",
  black:       "Black — discuss with vet",
  yellow:      "Yellow",
  orange:      "Orange",
  green:       "Green",
  red:         "Red",
  red_tinged:  "Red-tinged — discuss with vet",
  gray:        "Gray / pale",
  pale:        "Pale / clay",
};

export const STOOL_VOLUMES = ["small", "normal", "large"];
export const STOOL_VOLUME_LABELS = {
  small:  "Small",
  normal: "Normal",
  large:  "Large",
};

export const DIET_MEAL_TYPES = ["kibble", "wet", "raw", "treat", "supplement", "scraps", "human_food", "water_only"];
export const DIET_MEAL_TYPE_LABELS = {
  kibble:     "Kibble",
  wet:        "Wet food",
  raw:        "Raw / fresh",
  treat:      "Treat",
  supplement: "Supplement",
  scraps:     "Table scraps",
  human_food: "Human food",
  water_only: "Water only",
};

function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function loadMap(key) {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}
async function saveMap(key, map) {
  await AsyncStorage.setItem(key, JSON.stringify(map));
}

export const StoolLog = {
  async list(petId) {
    if (!petId) return [];
    const all = await loadMap(KEY_STOOL);
    const arr = all[petId] || [];
    return arr.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  },

  async listSinceDays(petId, days) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const all = await this.list(petId);
    return all.filter((e) => (e.ts || 0) >= cutoff);
  },

  async add(petId, entry) {
    if (!petId) return null;
    const all = await loadMap(KEY_STOOL);
    const arr = all[petId] || [];
    const record = {
      id: newId("s_"),
      ts: Date.now(),
      bristol: 4,
      color: "brown",
      volume: "normal",
      hasMucus: false,
      hasBlood: false,
      hasForeignMaterial: false,
      hasUndigestedFood: false,
      walkLocation: null,
      photoUri: null,
      note: "",
      syncStatus: "pending",
      ...entry,
    };
    arr.push(record);
    all[petId] = arr;
    await saveMap(KEY_STOOL, all);
    // Logging a tummy entry is an account soft-prompt value moment.
    signalValueMoment("tummy");
    return record;
  },

  async update(petId, id, updates) {
    if (!petId || !id) return null;
    const all = await loadMap(KEY_STOOL);
    const arr = all[petId] || [];
    const idx = arr.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    arr[idx] = { ...arr[idx], ...updates, syncStatus: "pending" };
    all[petId] = arr;
    await saveMap(KEY_STOOL, all);
    return arr[idx];
  },

  async remove(petId, id) {
    if (!petId || !id) return false;
    const all = await loadMap(KEY_STOOL);
    const arr = (all[petId] || []).filter((e) => e.id !== id);
    all[petId] = arr;
    await saveMap(KEY_STOOL, all);
    return true;
  },
};

export const DietLog = {
  async list(petId) {
    if (!petId) return [];
    const all = await loadMap(KEY_DIET);
    const arr = all[petId] || [];
    return arr.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  },

  async listSinceDays(petId, days) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const all = await this.list(petId);
    return all.filter((e) => (e.ts || 0) >= cutoff);
  },

  async add(petId, entry) {
    if (!petId) return null;
    const all = await loadMap(KEY_DIET);
    const arr = all[petId] || [];
    const record = {
      id: newId("d_"),
      ts: Date.now(),
      mealType: "kibble",
      brand: "",
      productName: "",
      amount: "",
      note: "",
      recallMatched: false,
      recallId: null,
      syncStatus: "pending",
      ...entry,
    };
    arr.push(record);
    all[petId] = arr;
    await saveMap(KEY_DIET, all);
    // Keep the saved-foods autocomplete cache fresh on every add.
    if (record.brand || record.productName) {
      await SavedFoods.touch(petId, record.brand, record.productName);
    }
    // Logging a tummy entry is an account soft-prompt value moment.
    signalValueMoment("tummy");
    return record;
  },

  async update(petId, id, updates) {
    if (!petId || !id) return null;
    const all = await loadMap(KEY_DIET);
    const arr = all[petId] || [];
    const idx = arr.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    arr[idx] = { ...arr[idx], ...updates, syncStatus: "pending" };
    all[petId] = arr;
    await saveMap(KEY_DIET, all);
    return arr[idx];
  },

  async remove(petId, id) {
    if (!petId || !id) return false;
    const all = await loadMap(KEY_DIET);
    const arr = (all[petId] || []).filter((e) => e.id !== id);
    all[petId] = arr;
    await saveMap(KEY_DIET, all);
    return true;
  },
};

export const SavedFoods = {
  async list(petId) {
    if (!petId) return [];
    const all = await loadMap(KEY_FOODS);
    const arr = all[petId] || [];
    return arr.slice().sort((a, b) => (b.lastUsedTs || 0) - (a.lastUsedTs || 0));
  },

  async touch(petId, brand, productName) {
    if (!petId) return null;
    const trimmedBrand = (brand || "").trim();
    const trimmedProduct = (productName || "").trim();
    if (!trimmedBrand && !trimmedProduct) return null;
    const all = await loadMap(KEY_FOODS);
    const arr = all[petId] || [];
    const matchKey = `${trimmedBrand.toLowerCase()}|${trimmedProduct.toLowerCase()}`;
    const idx = arr.findIndex((f) => `${(f.brand || "").toLowerCase()}|${(f.productName || "").toLowerCase()}` === matchKey);
    if (idx >= 0) {
      arr[idx] = { ...arr[idx], lastUsedTs: Date.now() };
    } else {
      arr.push({ id: newId("f_"), brand: trimmedBrand, productName: trimmedProduct, lastUsedTs: Date.now() });
    }
    all[petId] = arr;
    await saveMap(KEY_FOODS, all);
    return arr;
  },
};

// Vet visit suggestion logic — anomaly detection on stool entries.
// Returns { triggered: bool, reason: string, triggerType: enum,
// recentEntries: count } so the UI can render a banner.
//
// Triggers (any one fires):
//   - 3+ Bristol 1-2 entries in trailing 48h (constipation cluster)
//   - 3+ Bristol 6-7 entries in trailing 48h (diarrhea cluster)
//   - Any entry with hasBlood true
//   - Any entry with color = 'black' or 'red_tinged'
//   - Sudden volume change (most recent volume differs from previous
//     5 entries' modal volume) — only fires if at least 5 prior
//     entries exist
//
// All bullets framed as "discuss with your vet" — never diagnostic.
export function detectVetSuggestion(stoolEntries) {
  if (!Array.isArray(stoolEntries) || stoolEntries.length === 0) {
    return { triggered: false };
  }
  const sorted = stoolEntries.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const cutoff48h = Date.now() - 48 * 60 * 60 * 1000;
  const last48h = sorted.filter((e) => (e.ts || 0) >= cutoff48h);

  // Blood / black / red-tinged on any recent entry
  const blood = last48h.find((e) => e.hasBlood);
  if (blood) return { triggered: true, triggerType: "blood", reason: "Visible blood logged in the last 48 hours.", recentEntries: 1 };

  const black = last48h.find((e) => e.color === "black");
  if (black) return { triggered: true, triggerType: "black_stool", reason: "Black stool logged — can indicate digested blood.", recentEntries: 1 };

  const redTinged = last48h.find((e) => e.color === "red_tinged");
  if (redTinged) return { triggered: true, triggerType: "red_tinged", reason: "Red-tinged stool logged — can indicate lower-GI bleeding.", recentEntries: 1 };

  // 3+ Bristol 1-2 in 48h (constipation)
  const constipation = last48h.filter((e) => e.bristol === 1 || e.bristol === 2);
  if (constipation.length >= 3) {
    return { triggered: true, triggerType: "constipation_cluster", reason: `${constipation.length} hard / pebble entries in the last 48 hours.`, recentEntries: constipation.length };
  }

  // 3+ Bristol 6-7 in 48h (diarrhea)
  const diarrhea = last48h.filter((e) => e.bristol === 6 || e.bristol === 7);
  if (diarrhea.length >= 3) {
    return { triggered: true, triggerType: "diarrhea_cluster", reason: `${diarrhea.length} loose / liquid entries in the last 48 hours.`, recentEntries: diarrhea.length };
  }

  // Sudden volume change vs prior 5 entries' mode
  if (sorted.length >= 6) {
    const recent = sorted[0];
    const prior5 = sorted.slice(1, 6);
    const volCounts = prior5.reduce((acc, e) => { acc[e.volume] = (acc[e.volume] || 0) + 1; return acc; }, {});
    const priorMode = Object.entries(volCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (priorMode && recent.volume !== priorMode && (priorMode === "small" || priorMode === "large")) {
      return { triggered: true, triggerType: "volume_change", reason: `Volume changed from ${priorMode} to ${recent.volume} in the most recent entry.`, recentEntries: 1 };
    }
  }

  return { triggered: false };
}
