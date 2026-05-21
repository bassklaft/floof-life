import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizePetBreeds } from "./petBreeds";
import { normalizePetPhotos, migratePetPhotosArray } from "./petPhotos";
import { signalValueMoment } from "./accountPrompt";

// Re-export so existing import sites that pull `normalizePetPhotos`
// from this module keep working.
export { normalizePetPhotos };

// Multi-pet storage with auto-migration from the legacy single-pet key.
// All UI flows read through `Pets`. The legacy `Pet` object is kept so
// existing screens continue to work — it returns the active (or first)
// pet from the list.
//
// v1.2 adds an inline migration: pets that only have `breed: string`
// get a mirrored `breeds: [breed]` populated on read. We persist the
// migrated shape on first write so it sticks.

const KEY_LIST   = "pawrent_pets_v2";
const KEY_LEGACY = "pawrent_pet";
const KEY_ACTIVE = "pawrent_active_pet_id";

function newId() { return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// Apply the v1.2 breeds-array migration to a list of pets. Pure — does
// not write to AsyncStorage; callers decide when to persist.
function migrateBreeds(arr) {
  let changed = false;
  const out = arr.map((p) => {
    const next = normalizePetBreeds(p);
    if (next !== p && JSON.stringify(next) !== JSON.stringify(p)) changed = true;
    return next;
  });
  return { pets: out, changed };
}

// Photo-schema migration is implemented in ./petPhotos.js as pure
// functions (no AsyncStorage), so they can be unit-tested under plain
// Node. We just consume migratePetPhotosArray here.

export const Pets = {
  async list() {
    // Prefer the v2 array
    const s = await AsyncStorage.getItem(KEY_LIST);
    if (s) {
      try {
        const raw = JSON.parse(s);
        // v1.2 migrations chain: breeds first, then photos. Each is
        // idempotent and tracks its own `changed` flag. Persist back
        // to storage only when something actually changed so we don't
        // write on every read.
        const { pets: afterBreeds, changed: c1 } = migrateBreeds(raw);
        const { pets, changed: c2 } = migratePetPhotosArray(afterBreeds);
        if (c1 || c2) await AsyncStorage.setItem(KEY_LIST, JSON.stringify(pets));
        return pets;
      } catch { /* fall through */ }
    }
    // Migrate from legacy single-pet store
    const legacy = await AsyncStorage.getItem(KEY_LEGACY);
    if (legacy) {
      try {
        const pet = JSON.parse(legacy);
        const arr = [normalizePetPhotos(normalizePetBreeds({ ...pet, id: pet.id || newId() }))];
        await AsyncStorage.setItem(KEY_LIST, JSON.stringify(arr));
        return arr;
      } catch { /* */ }
    }
    return [];
  },
  async setAll(arr) {
    await AsyncStorage.setItem(KEY_LIST, JSON.stringify(arr));
    // Mirror first pet to legacy key so older code paths keep working.
    if (arr[0]) await AsyncStorage.setItem(KEY_LEGACY, JSON.stringify(arr[0]));
    else        await AsyncStorage.removeItem(KEY_LEGACY);
  },
  async add(pet) {
    const arr = await this.list();
    const withId = normalizePetPhotos(normalizePetBreeds({
      ...pet,
      id: pet.id || newId(),
      createdAt: pet.createdAt || Date.now(),
    }));
    arr.push(withId);
    await this.setAll(arr);
    // Adding a 2nd (or later) pet is an account soft-prompt value moment.
    if (arr.length >= 2) signalValueMoment("second_pet");
    return withId;
  },
  async update(id, updates) {
    const arr = await this.list();
    const idx = arr.findIndex(p => p.id === id);
    if (idx >= 0) {
      // Normalize through both migrations on every update so any update
      // path (photo edit, name change, etc.) writes a consistent shape.
      arr[idx] = normalizePetPhotos(normalizePetBreeds({ ...arr[idx], ...updates }));
      await this.setAll(arr);
      return arr[idx];
    }
    return null;
  },
  async remove(id) {
    const arr = (await this.list()).filter(p => p.id !== id);
    await this.setAll(arr);
    const activeId = await AsyncStorage.getItem(KEY_ACTIVE);
    if (activeId === id) {
      // Auto-rotate active pet to the next-up (oldest-first) so the
      // user isn't left in an empty-active state. If no pets remain,
      // clear active — App.js consumers (useActivePet listeners)
      // can route back to onboarding.
      const sorted = arr.slice().sort((a, b) => {
        const ageA = a.ageYears ?? -1, ageB = b.ageYears ?? -1;
        if (ageA !== ageB) return ageB - ageA;
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
      const next = sorted[0]?.id || null;
      // Update in-process cache SYNCHRONOUSLY (same tick) so any
      // useActivePet consumer reflects the rotation before the
      // AsyncStorage write completes. setCachedActiveId fires the
      // notify too — no double-notify needed.
      try {
        const mod = require("./activePet");
        mod.setCachedActiveId?.(next);
      } catch { /* swallow */ }
      if (next) {
        await AsyncStorage.setItem(KEY_ACTIVE, next);
      } else {
        await AsyncStorage.removeItem(KEY_ACTIVE);
      }
    }
  },

  // ─────────────── Health records (v1.2) ─────────────────────────
  // Each pet carries `healthRecords: [{ id, type, dateGiven, durationMonths,
  // nextDue, notes?, attachmentUri?, attachmentFilename?, customLabel? }]`.
  // Stored inline on the pet object to keep the storage layout flat;
  // attachments themselves live on the filesystem (caller manages those).
  async listHealthRecords(petId) {
    const arr = await this.list();
    const pet = arr.find((p) => p.id === petId);
    return Array.isArray(pet?.healthRecords) ? pet.healthRecords : [];
  },
  async addHealthRecord(petId, record) {
    const arr = await this.list();
    const idx = arr.findIndex((p) => p.id === petId);
    if (idx < 0) return null;
    const existing = Array.isArray(arr[idx].healthRecords) ? arr[idx].healthRecords : [];
    const withId = {
      ...record,
      id: record.id || ("hr" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      createdAt: record.createdAt || Date.now(),
    };
    arr[idx] = { ...arr[idx], healthRecords: [...existing, withId] };
    await this.setAll(arr);
    return withId;
  },
  async updateHealthRecord(petId, recordId, patch) {
    const arr = await this.list();
    const idx = arr.findIndex((p) => p.id === petId);
    if (idx < 0) return null;
    const records = Array.isArray(arr[idx].healthRecords) ? arr[idx].healthRecords : [];
    const ridx = records.findIndex((r) => r.id === recordId);
    if (ridx < 0) return null;
    const updated = { ...records[ridx], ...patch };
    const next = records.slice();
    next[ridx] = updated;
    arr[idx] = { ...arr[idx], healthRecords: next };
    await this.setAll(arr);
    return updated;
  },
  async removeHealthRecord(petId, recordId) {
    const arr = await this.list();
    const idx = arr.findIndex((p) => p.id === petId);
    if (idx < 0) return false;
    const records = Array.isArray(arr[idx].healthRecords) ? arr[idx].healthRecords : [];
    arr[idx] = { ...arr[idx], healthRecords: records.filter((r) => r.id !== recordId) };
    await this.setAll(arr);
    return true;
  },
  // Has the user dismissed the first-run health-tracker disclaimer for
  // this pet? Stored as a flag on the pet object.
  async hasAckedHealthDisclaimer(petId) {
    const arr = await this.list();
    return !!arr.find((p) => p.id === petId)?.healthDisclaimerAcked;
  },
  async ackHealthDisclaimer(petId) {
    return this.update(petId, { healthDisclaimerAcked: true });
  },
  // Sort oldest pet first (highest age, then earliest createdAt as tiebreaker).
  // Pets without an age fall to the bottom.
  async listSortedOldestFirst() {
    const arr = await this.list();
    return arr.slice().sort((a, b) => {
      const ageA = a.ageYears ?? -1, ageB = b.ageYears ?? -1;
      if (ageA !== ageB) return ageB - ageA;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  },
  async getActiveId() {
    // Prefer the in-process cache so a getActiveId firing inside
    // the same event-loop tick as a setActive sees the new value
    // before the AsyncStorage write resolves. Cold start: cache
    // is `undefined`, fall through to AsyncStorage and seed.
    try {
      const mod = require("./activePet");
      const cached = mod.getCachedActiveId?.();
      if (cached !== undefined) return cached;
    } catch { /* swallow */ }
    const id = await AsyncStorage.getItem(KEY_ACTIVE);
    try {
      const mod = require("./activePet");
      mod.setCachedActiveId?.(id);
    } catch { /* swallow */ }
    return id;
  },
  async setActive(id) {
    if (!id) return;
    // Update the in-process cache SYNCHRONOUSLY before the async
    // AsyncStorage write so any reader in the same tick (e.g., a
    // tab tap immediately after a swipe) sees the new active id.
    // setCachedActiveId also fires the useActivePet notify, so we
    // don't double-notify after the AsyncStorage write resolves.
    try {
      const mod = require("./activePet");
      mod.setCachedActiveId?.(id);
    } catch { /* swallow */ }
    await AsyncStorage.setItem(KEY_ACTIVE, id);
  },
  async clearActive() {
    try {
      const mod = require("./activePet");
      mod.setCachedActiveId?.(null);
    } catch { /* swallow */ }
    await AsyncStorage.removeItem(KEY_ACTIVE);
  },
};

// Backward-compat shim: every screen calls Pet.get() to retrieve "the"
// pet. With multi-pet support that resolves to the active pet (if set
// and still in the list), otherwise the oldest pet as fallback.
export const Pet = {
  async get() {
    const arr = await Pets.list();
    if (arr.length === 0) return null;
    const activeId = await Pets.getActiveId();
    if (activeId) {
      const found = arr.find(p => p.id === activeId);
      if (found) return found;
    }
    const sorted = await Pets.listSortedOldestFirst();
    return sorted[0] || arr[0] || null;
  },
  async set(p) {
    const arr = await Pets.list();
    if (arr.length === 0) {
      await Pets.add(p);
    } else {
      const id = arr[0].id;
      await Pets.update(id, p);
    }
  },
  async clear() {
    await AsyncStorage.removeItem(KEY_LIST);
    await AsyncStorage.removeItem(KEY_LEGACY);
    await AsyncStorage.removeItem(KEY_ACTIVE);
    await AsyncStorage.removeItem(KEY_CHECKLIST_V1);
    await AsyncStorage.removeItem(KEY_CHECKLIST_V2);
    await AsyncStorage.removeItem("pawrent_observations");
  },
};

// Checklist completion state, scoped per pet.
// Shape: { [petId]: { [itemId]: { status, ts } } }
// V1 was a flat { [itemId]: ... } map shared across pets; on first read
// after upgrade the legacy map is folded under the active pet's id.
const KEY_CHECKLIST_V1 = "pawrent_checklist_state";
const KEY_CHECKLIST_V2 = "pawrent_checklist_state_v2";

export const ChecklistState = {
  async _readAll() {
    const raw = await AsyncStorage.getItem(KEY_CHECKLIST_V2);
    if (raw) {
      try { return JSON.parse(raw); } catch { /* fall through to migration */ }
    }
    // Migrate legacy global state under the active pet. If there is no
    // active pet yet (fresh install, mid-onboarding), leave the legacy
    // key alone — the next read will retry once a pet exists.
    const legacy = await AsyncStorage.getItem(KEY_CHECKLIST_V1);
    if (legacy) {
      try {
        const oldState = JSON.parse(legacy);
        const active = await Pet.get();
        if (active?.id) {
          const next = { [active.id]: oldState };
          await AsyncStorage.setItem(KEY_CHECKLIST_V2, JSON.stringify(next));
          await AsyncStorage.removeItem(KEY_CHECKLIST_V1);
          return next;
        }
      } catch { /* fall through */ }
    }
    return {};
  },
  async _writeAll(all) {
    await AsyncStorage.setItem(KEY_CHECKLIST_V2, JSON.stringify(all));
  },
  async get(petId) {
    if (!petId) return {};
    const all = await this._readAll();
    return all[petId] || {};
  },
  async setItem(petId, key, status) {
    if (!petId) return {};
    const all = await this._readAll();
    if (!all[petId]) all[petId] = {};
    all[petId][key] = { status, ts: Date.now() };
    await this._writeAll(all);
    return all[petId];
  },
};

// Mood log — per-pet array of mood entries. Same flat-on-pet-doc shape
// as healthRecords so all per-pet data lives in one place for export.
// Entry: { id, ts, moodId, slot ("morning"|"night"), dateKey, note? }.
const newMoodId = () => "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

Object.assign(Pets, {
  async listMoodLogs(petId) {
    const arr = await this.list();
    const pet = arr.find((p) => p.id === petId);
    return Array.isArray(pet?.moodLogs) ? pet.moodLogs : [];
  },
  async addMoodLog(petId, entry) {
    const arr = await this.list();
    const idx = arr.findIndex((p) => p.id === petId);
    if (idx < 0) return null;
    const existing = Array.isArray(arr[idx].moodLogs) ? arr[idx].moodLogs : [];
    const record = {
      id: entry.id || newMoodId(),
      ts: entry.ts || Date.now(),
      moodId: entry.moodId,
      slot: entry.slot || "morning",
      dateKey: entry.dateKey,
      note: entry.note || "",
    };
    arr[idx] = { ...arr[idx], moodLogs: [...existing, record] };
    await this.setAll(arr);
    return record;
  },
  async removeMoodLog(petId, recordId) {
    const arr = await this.list();
    const idx = arr.findIndex((p) => p.id === petId);
    if (idx < 0) return false;
    const records = Array.isArray(arr[idx].moodLogs) ? arr[idx].moodLogs : [];
    arr[idx] = { ...arr[idx], moodLogs: records.filter((r) => r.id !== recordId) };
    await this.setAll(arr);
    return true;
  },

  // ─────────────── Health conditions (v2) ────────────────────────
  // Per-pet array of diagnosed conditions the owner is tracking, e.g.
  // FIV. Each entry references a guide in src/data/conditions.js by
  // `conditionId`. Shape: { id, conditionId, diagnosedDate?, note?,
  // addedAt }. Inline on the pet doc, same as healthRecords / moodLogs.
  async listConditions(petId) {
    const arr = await this.list();
    const pet = arr.find((p) => p.id === petId);
    return Array.isArray(pet?.conditions) ? pet.conditions : [];
  },
  async addCondition(petId, entry) {
    const arr = await this.list();
    const idx = arr.findIndex((p) => p.id === petId);
    if (idx < 0) return null;
    const existing = Array.isArray(arr[idx].conditions) ? arr[idx].conditions : [];
    // One entry per conditionId — adding a condition already on file
    // is a no-op (returns the existing record).
    const already = existing.find((c) => c.conditionId === entry.conditionId);
    if (already) return already;
    const record = {
      id: entry.id || ("c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
      conditionId: entry.conditionId,
      diagnosedDate: entry.diagnosedDate || null,
      note: entry.note || "",
      addedAt: entry.addedAt || Date.now(),
    };
    arr[idx] = { ...arr[idx], conditions: [...existing, record] };
    await this.setAll(arr);
    return record;
  },
  async removeCondition(petId, recordId) {
    const arr = await this.list();
    const idx = arr.findIndex((p) => p.id === petId);
    if (idx < 0) return false;
    const records = Array.isArray(arr[idx].conditions) ? arr[idx].conditions : [];
    arr[idx] = { ...arr[idx], conditions: records.filter((r) => r.id !== recordId) };
    await this.setAll(arr);
    return true;
  },
});

export const Observations = {
  async list() {
    const s = await AsyncStorage.getItem("pawrent_observations");
    return s ? JSON.parse(s) : [];
  },
  async add(entry) {
    const cur = await this.list();
    cur.unshift({ ...entry, id: Date.now().toString(), ts: Date.now() });
    await AsyncStorage.setItem("pawrent_observations", JSON.stringify(cur));
    return cur;
  },
};
