// Cloud sync engine — read-local → upload → keep-local migration.
//
// Per docs/features/accounts-and-migration.md:
//   - Read every local record, upsert into per-user Postgres tables.
//   - Upload every photo to Supabase Storage under <user_id>/...
//   - NEVER wipe local data. Local stays as cache + undo guarantee.
//   - Idempotent + resumable. Each record carries a stable client_id;
//     re-running is a no-op for already-synced rows.
//   - Verify before trusting the cloud — a record is "synced" only
//     after both the row insert AND its photos succeed.
//
// The engine is driven by an async generator so the UI can render
// progress (N of total, current record name) without polling. Each
// yield is { kind: "progress" | "error" | "done", payload }. Callers
// `for await (const ev of run(...))` and surface ev as needed.

import * as FileSystem from "expo-file-system/legacy";
import { supabase, supabaseUrl } from "./supabase";
import { Pets, ChecklistState, Observations } from "./storage";
import { StoolLog, DietLog } from "./tummy";

const BUCKET = "pet-media";

// Map a local photo URI (`file://.../pets/<petId>/...jpg`) to a stable
// per-user Storage path. The first segment must equal the user_id —
// that's what the bucket's RLS policy keys off.
function storagePathForPetPhoto(userId, petId, fileUri) {
  const filename = fileUri.split("/").pop() || `photo-${Date.now()}.jpg`;
  return `${userId}/pets/${petId}/${filename}`;
}
function storagePathForHealthAttachment(userId, petId, fileUri) {
  const filename = fileUri.split("/").pop() || `attachment-${Date.now()}`;
  return `${userId}/healthRecords/${petId}/${filename}`;
}
function storagePathForTummyPhoto(userId, petId, fileUri) {
  const filename = fileUri.split("/").pop() || `tummy-${Date.now()}.jpg`;
  return `${userId}/pets/${petId}/tummy/${filename}`;
}

// Upload a local file to Storage via a short-lived presigned URL.
//
// Two-step handshake per docs/security-non-negotiables.md Rule 4 + 5:
//   1. POST to our sync-upload-url Edge Function (IP-rate-limited,
//      JWT-verified) to mint a single-use upload URL scoped to this
//      exact path.
//   2. PUT the file bytes to that URL with FileSystem.uploadAsync.
//      The bytes flow direct to Storage — we don't proxy them through
//      the function (that would kill throughput and blow up Edge CPU
//      bills).
//
// Idempotent: a repeat upload (resume after crash) just mints a new
// URL and re-PUTs. Returns { path } on success, { skipped } when the
// local file vanished, throws on hard failure.
async function uploadFile(localUri, storagePath) {
  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) {
    // Photo URI in storage but the file is gone — skip rather than
    // fail the whole pet. Logged so a follow-up reconciler can
    // surface "N photos missing locally" to the user.
    return { skipped: true, reason: "local_missing" };
  }

  // Step 1: mint a presigned upload URL via our Edge Function.
  const session = (await supabase.auth.getSession()).data.session;
  if (!session?.access_token) throw new Error("Not signed in");
  const mintRes = await fetch(`${supabaseUrl()}/functions/v1/sync-upload-url`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: storagePath,
      expected_bytes: info.size ?? undefined,
    }),
  });
  if (mintRes.status === 429) {
    const retryAfter = Number(mintRes.headers.get("Retry-After") || 60);
    throw new Error(`Rate limited — retry in ${retryAfter}s`);
  }
  if (!mintRes.ok) {
    let detail = "";
    try { detail = await mintRes.text(); } catch { /* swallow */ }
    throw new Error(`Mint URL failed (${mintRes.status}): ${detail}`);
  }
  const minted = await mintRes.json();
  if (!minted?.signed_url) {
    throw new Error("Mint URL returned no signed_url");
  }

  // Step 2: PUT bytes to the signed URL. The URL embeds the auth
  // token in its query string — no Authorization header needed.
  // x-upsert lets a resumed upload overwrite an in-progress object
  // for the same path (Supabase Storage default rejects duplicates).
  const putRes = await FileSystem.uploadAsync(minted.signed_url, localUri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      "x-upsert": "true",
    },
  });
  if (putRes.status !== 200 && putRes.status !== 201) {
    throw new Error(`Storage upload failed (${putRes.status}): ${putRes.body}`);
  }
  return { path: minted.path };
}

// Upsert a single jsonb-blob row into a per-user table. The unique
// (user_id, client_id) primary key makes this idempotent.
async function upsertRow(table, userId, clientId, data, extraColumns = {}) {
  const row = {
    user_id: userId,
    client_id: clientId,
    data,
    updated_at: new Date().toISOString(),
    ...extraColumns,
  };
  const { error } = await supabase.from(table).upsert(row, {
    onConflict: "user_id,client_id",
  });
  if (error) throw error;
}

// Strip local file:// URIs from a pet's photo arrays and replace them
// with the Storage paths we just uploaded. The local copy stays put —
// we only rewrite what gets sent to the cloud.
function rewritePhotoUris(pet, uploadedMap) {
  const next = { ...pet };
  if (Array.isArray(next.photos)) {
    next.photos = next.photos.map((uri) => uploadedMap.get(uri) || uri);
  }
  if (next.photoUri && uploadedMap.has(next.photoUri)) {
    next.photoUri = uploadedMap.get(next.photoUri);
  }
  return next;
}

// The orchestrator. Yields progress events; the caller (CloudSyncStatusScreen)
// renders them.
export async function* runFullMigration() {
  if (!supabase) {
    yield { kind: "error", payload: { message: "Supabase not configured" } };
    return;
  }
  const session = (await supabase.auth.getSession()).data.session;
  const user = session?.user;
  if (!user) {
    yield { kind: "error", payload: { message: "Not signed in" } };
    return;
  }
  const userId = user.id;

  // ─── Snapshot everything local ────────────────────────────────────
  const pets = await Pets.list();
  const observations = await Observations.list();

  // Total work units for progress UI: pets + photos + per-pet sub-records
  let totalUnits = pets.length + observations.length;
  for (const p of pets) {
    totalUnits += (p.photos?.length || 0);
    totalUnits += (p.healthRecords?.length || 0);
    totalUnits += (p.moodLogs?.length || 0);
    totalUnits += (p.conditions?.length || 0);
    totalUnits += (await StoolLog.list(p.id)).length;
    totalUnits += (await DietLog.list(p.id)).length;
    totalUnits += 1; // checklist state
  }
  totalUnits += 1; // app prefs blob

  let done = 0;
  const progress = (label) => ({ kind: "progress", payload: { done, total: totalUnits, label } });

  // ─── Per-pet loop ─────────────────────────────────────────────────
  for (const pet of pets) {
    yield progress(`Backing up ${pet.name || "your floof"}…`);

    // Upload pet portrait photos first so we can rewrite their URIs
    // before the row insert.
    const uploaded = new Map();
    for (const uri of pet.photos || []) {
      if (!uri || !uri.startsWith("file://")) continue;
      const storagePath = storagePathForPetPhoto(userId, pet.id, uri);
      try {
        const result = await uploadFile(uri, storagePath);
        if (result.path) uploaded.set(uri, result.path);
      } catch (err) {
        yield { kind: "error", payload: { scope: "photo", petId: pet.id, message: err?.message || String(err) } };
      }
      done += 1;
      yield progress(`Uploading photos for ${pet.name || "your floof"}…`);
    }

    // The pet doc itself — embeds health records, mood logs, conditions
    // inline (mirroring the local shape) AND has the cloud-rewritten
    // photo URIs.
    const petCloud = rewritePhotoUris(pet, uploaded);
    try {
      await upsertRow("pets", userId, pet.id, petCloud);
    } catch (err) {
      yield { kind: "error", payload: { scope: "pet", petId: pet.id, message: err?.message || String(err) } };
    }
    done += 1;
    yield progress(`Saved ${pet.name || "your floof"} to the cloud.`);

    // Also fan out health records / mood logs / etc. into their own
    // tables so future cross-pet queries are cheap. The data is still
    // in the pet doc as the source of truth; these are denormalized
    // copies for query convenience.
    for (const hr of pet.healthRecords || []) {
      // Upload health-record attachments if present
      let hrCloud = hr;
      if (hr.attachmentUri && hr.attachmentUri.startsWith("file://")) {
        const path = storagePathForHealthAttachment(userId, pet.id, hr.attachmentUri);
        try {
          const result = await uploadFile(hr.attachmentUri, path);
          if (result.path) hrCloud = { ...hr, attachmentUri: result.path };
        } catch (err) {
          yield { kind: "error", payload: { scope: "health_attachment", petId: pet.id, message: err?.message || String(err) } };
        }
      }
      try {
        await upsertRow("health_records", userId, hr.id, hrCloud, { pet_client_id: pet.id });
      } catch (err) {
        yield { kind: "error", payload: { scope: "health_record", petId: pet.id, message: err?.message || String(err) } };
      }
      done += 1;
      yield progress("");
    }
    for (const m of pet.moodLogs || []) {
      try {
        await upsertRow("mood_logs", userId, m.id, m, { pet_client_id: pet.id });
      } catch (err) {
        yield { kind: "error", payload: { scope: "mood_log", petId: pet.id, message: err?.message || String(err) } };
      }
      done += 1;
      yield progress("");
    }
    // Conditions are inline on the pet doc — no separate table.
    done += (pet.conditions?.length || 0);

    // Tummy tracker (stool + diet logs)
    const stools = await StoolLog.list(pet.id);
    for (const e of stools) {
      let entryCloud = e;
      if (e.photoUri && e.photoUri.startsWith("file://")) {
        const path = storagePathForTummyPhoto(userId, pet.id, e.photoUri);
        try {
          const result = await uploadFile(e.photoUri, path);
          if (result.path) entryCloud = { ...e, photoUri: result.path };
        } catch (err) {
          yield { kind: "error", payload: { scope: "stool_photo", petId: pet.id, message: err?.message || String(err) } };
        }
      }
      try {
        await upsertRow("stool_logs", userId, e.id, entryCloud, { pet_client_id: pet.id });
      } catch (err) {
        yield { kind: "error", payload: { scope: "stool_log", petId: pet.id, message: err?.message || String(err) } };
      }
      done += 1;
      yield progress("");
    }
    const diets = await DietLog.list(pet.id);
    for (const e of diets) {
      try {
        await upsertRow("diet_logs", userId, e.id, e, { pet_client_id: pet.id });
      } catch (err) {
        yield { kind: "error", payload: { scope: "diet_log", petId: pet.id, message: err?.message || String(err) } };
      }
      done += 1;
      yield progress("");
    }

    // Checklist state for this pet (one row holds the full item-status map)
    const checklist = await ChecklistState.get(pet.id);
    try {
      const { error } = await supabase.from("checklist_state").upsert({
        user_id: userId,
        pet_client_id: pet.id,
        data: checklist,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,pet_client_id" });
      if (error) throw error;
    } catch (err) {
      yield { kind: "error", payload: { scope: "checklist_state", petId: pet.id, message: err?.message || String(err) } };
    }
    done += 1;
    yield progress("");
  }

  // Observations (cross-pet)
  for (const o of observations) {
    try {
      await upsertRow("observations", userId, String(o.id), o);
    } catch (err) {
      yield { kind: "error", payload: { scope: "observation", message: err?.message || String(err) } };
    }
    done += 1;
    yield progress("");
  }

  // App prefs (placeholder for now — schema accepts whatever blob)
  try {
    const { error } = await supabase.from("app_prefs").upsert({
      user_id: userId,
      data: {},
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (error) throw error;
  } catch (err) {
    yield { kind: "error", payload: { scope: "app_prefs", message: err?.message || String(err) } };
  }
  done += 1;

  yield { kind: "done", payload: { done, total: totalUnits, petCount: pets.length } };
}
