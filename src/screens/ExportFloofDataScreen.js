// ExportFloofDataScreen — per-floof export of mood, tummy (stool +
// diet), and health-tracker data. Each pet has its own card with
// per-data-type checkboxes. Tap "Export selected" and we render a
// single combined plain-text report and hand it off to the system
// share sheet (vet email, Files, AirDrop). PDF would be cleaner for
// vet print-outs, but text is universally readable + plays nicely
// with copy/paste into a vet portal.
//
// Reachable from Settings ("Export Floof data"). The selection is
// transient — the next visit defaults to nothing checked.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Pets } from "../lib/storage";
import { StoolLog, DietLog, BRISTOL_LABELS, STOOL_COLOR_LABELS, STOOL_VOLUME_LABELS, DIET_MEAL_TYPE_LABELS } from "../lib/tummy";
import { findType, statusFor, daysUntilDue } from "../lib/healthRecordTypes";
import { MOOD_BY_ID, MOOD_SLOT_LABELS } from "../data/moods";
import { CONDITION_BY_ID } from "../data/conditions";
import { breedDisplayName } from "../data/breeds";
import { getPetBreeds, mixedBreedLabel } from "../lib/petBreeds";
import { tapLight, tapMedium } from "../lib/haptics";
import { track } from "../lib/analytics";
import { theme } from "../theme";

const DATA_TYPES = [
  { key: "mood",   label: "Mood log",            sub: "Daily morning + evening readings" },
  { key: "tummy",  label: "Tummy log",           sub: "Stool entries (Bristol, color, flags) + diet entries" },
  { key: "health", label: "Health records",      sub: "Vaccines, preventatives, wellness — with next-due dates" },
];

const titleCase = (s) => (s || "").split(" ").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");

function fmtTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function fmtDateOnly(s) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return s; }
}

export default function ExportFloofDataScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [pets, setPets] = useState([]);
  // selection[petId][dataType] = boolean.
  const [selection, setSelection] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const list = await Pets.listSortedOldestFirst();
    setPets(list);
  }, []);
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function toggle(petId, dataType) {
    tapLight();
    setSelection((prev) => {
      const next = { ...prev };
      next[petId] = { ...(next[petId] || {}), [dataType]: !next[petId]?.[dataType] };
      return next;
    });
  }

  function toggleAllForPet(petId, value) {
    tapMedium();
    setSelection((prev) => {
      const next = { ...prev };
      next[petId] = DATA_TYPES.reduce((acc, t) => { acc[t.key] = value; return acc; }, {});
      return next;
    });
  }

  const totalSelected = useMemo(() => {
    let n = 0;
    for (const p of pets) {
      for (const t of DATA_TYPES) {
        if (selection[p.id]?.[t.key]) n++;
      }
    }
    return n;
  }, [pets, selection]);

  async function buildReport() {
    const lines = [];
    const generatedAt = new Date();
    lines.push("FloofLife — Floof Health Export");
    lines.push(`Generated: ${generatedAt.toLocaleString()}`);
    lines.push("");
    lines.push("This is owner-logged data, not a clinical record. Patterns and timing are what matter most — discuss anything notable with your vet.");
    lines.push("");

    for (const pet of pets) {
      const sel = selection[pet.id] || {};
      const anySelected = DATA_TYPES.some((t) => sel[t.key]);
      if (!anySelected) continue;

      const breedKeys = getPetBreeds(pet);
      const breedDisp = mixedBreedLabel(pet) || breedKeys.map((k) => breedDisplayName(k)).join(" / ");

      lines.push("════════════════════════════════════════");
      lines.push(`Floof: ${pet.name}`);
      lines.push(`Breed: ${breedDisp || "—"}${pet.species ? ` (${titleCase(pet.species)})` : ""}`);
      lines.push(`Age: ${pet.ageYears != null ? `${pet.ageYears} yr` : "—"}${pet.weightLbs ? `   Weight: ${pet.weightLbs} lb` : ""}`);
      // Diagnosed conditions always print in the header — they're
      // identity-level context a vet reading this needs up front.
      const petConditions = Array.isArray(pet.conditions) ? pet.conditions : [];
      if (petConditions.length > 0) {
        const labels = petConditions
          .map((c) => CONDITION_BY_ID[c.conditionId]?.label || c.conditionId)
          .filter(Boolean);
        if (labels.length > 0) lines.push(`Diagnosed conditions: ${labels.join("; ")}`);
      }
      lines.push("");

      if (sel.mood) {
        const moodLogs = (await Pets.listMoodLogs(pet.id))
          .slice()
          .sort((a, b) => (b.ts || 0) - (a.ts || 0));
        lines.push("── Mood log ──");
        if (moodLogs.length === 0) {
          lines.push("  (no mood entries logged yet)");
        } else {
          for (const r of moodLogs) {
            const m = MOOD_BY_ID[r.moodId];
            const slotLabel = MOOD_SLOT_LABELS[r.slot] || titleCase(r.slot || "");
            lines.push(`  ${fmtTs(r.ts)}  [${slotLabel}]  ${m?.label || r.moodId}${m?.tone === "watch" ? "  *watch" : ""}`);
            if (r.note) lines.push(`      note: ${r.note}`);
          }
        }
        lines.push("");
      }

      if (sel.tummy) {
        const stool = await StoolLog.list(pet.id);
        const diet  = await DietLog.list(pet.id);
        lines.push("── Tummy log: stool entries ──");
        if (stool.length === 0) {
          lines.push("  (no stool entries logged yet)");
        } else {
          for (const e of stool) {
            const flags = [];
            if (e.hasBlood)            flags.push("BLOOD");
            if (e.hasMucus)            flags.push("mucus");
            if (e.hasForeignMaterial)  flags.push("foreign material");
            if (e.hasUndigestedFood)   flags.push("undigested food");
            const flagsStr = flags.length ? `  *flags: ${flags.join(", ")}` : "";
            lines.push(
              `  ${fmtTs(e.ts)}  Bristol ${e.bristol} (${BRISTOL_LABELS[e.bristol] || ""})`
            );
            lines.push(
              `      color: ${STOOL_COLOR_LABELS[e.color] || e.color || "—"}   volume: ${STOOL_VOLUME_LABELS[e.volume] || e.volume || "—"}${flagsStr}`
            );
            if (e.note) lines.push(`      note: ${e.note}`);
            if (e.walkLocation) lines.push(`      where: ${e.walkLocation}`);
          }
        }
        lines.push("");
        lines.push("── Tummy log: diet entries ──");
        if (diet.length === 0) {
          lines.push("  (no diet entries logged yet)");
        } else {
          for (const e of diet) {
            const product = [e.brand, e.productName].filter(Boolean).join(" — ");
            lines.push(`  ${fmtTs(e.ts)}  ${DIET_MEAL_TYPE_LABELS[e.mealType] || e.mealType || "—"}${product ? `   ${product}` : ""}${e.amount ? `   (${e.amount})` : ""}${e.recallMatched ? "  *RECALL MATCH" : ""}`);
            if (e.note) lines.push(`      note: ${e.note}`);
          }
        }
        lines.push("");
      }

      if (sel.health) {
        const records = await Pets.listHealthRecords(pet.id);
        lines.push("── Health records ──");
        if (records.length === 0) {
          lines.push("  (no health records logged yet)");
        } else {
          const sorted = records.slice().sort((a, b) => new Date(b.dateGiven || 0) - new Date(a.dateGiven || 0));
          for (const r of sorted) {
            const t = findType(r.type);
            const label = r.customLabel || t?.label || r.type || "Record";
            const status = statusFor(r);
            const days = daysUntilDue(r);
            const dueBit = r.nextDue
              ? `   next due: ${fmtDateOnly(r.nextDue)}${days != null ? ` (${days >= 0 ? `${days}d` : `${-days}d overdue`})` : ""}`
              : "";
            lines.push(`  ${fmtDateOnly(r.dateGiven)}  ${label}${status === "overdue" ? "  *OVERDUE" : ""}${dueBit}`);
            if (r.notes) lines.push(`      note: ${r.notes}`);
          }
        }
        lines.push("");
      }
    }

    lines.push("════════════════════════════════════════");
    lines.push("Generated by FloofLife. Owner-logged — not a substitute for veterinary advice.");
    return lines.join("\n");
  }

  async function onExport() {
    if (totalSelected === 0) {
      Alert.alert("Nothing selected", "Pick at least one data type for at least one floof.");
      return;
    }
    try {
      setBusy(true);
      tapMedium();
      const text = await buildReport();
      const stamp = new Date().toISOString().slice(0, 10);
      const path = `${FileSystem.cacheDirectory}flooflife-export-${stamp}.txt`;
      await FileSystem.writeAsStringAsync(path, text, { encoding: FileSystem.EncodingType.UTF8 });
      track("export_floof_data", { items_selected: totalSelected, pet_count: pets.length });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "Your device can't open the share sheet right now.");
        return;
      }
      await Sharing.shareAsync(path, {
        mimeType: "text/plain",
        dialogTitle: "Share Floof data with your vet",
        UTI: "public.plain-text",
      });
    } catch (err) {
      Alert.alert("Export failed", err?.message || "Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  if (pets.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, padding: 24, alignItems: "center", justifyContent: "center" }}>
        <MaterialCommunityIcons name="paw" size={48} color={theme.muted} />
        <Text style={{ color: theme.muted, marginTop: 12, textAlign: "center" }}>No floofs to export yet — add a floof first.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 120 }}>
      <View style={s.intro}>
        <Text style={s.introTitle}>Share what you've logged</Text>
        <Text style={s.introBody}>
          Pick which floofs and which logs you want to send. We'll bundle everything into one plain-text report your vet can read, search, or paste into their notes.
        </Text>
      </View>

      {pets.map((pet) => {
        const breedKeys = getPetBreeds(pet);
        const breedDisp = mixedBreedLabel(pet) || (breedKeys[0] ? breedDisplayName(breedKeys[0]) : "");
        const sel = selection[pet.id] || {};
        const anySelected = DATA_TYPES.some((t) => sel[t.key]);
        const allSelected = DATA_TYPES.every((t) => sel[t.key]);
        return (
          <View key={pet.id} style={s.petCard}>
            <View style={s.petHd}>
              <View style={{ flex: 1 }}>
                <Text style={s.petName}>{pet.name}</Text>
                <Text style={s.petMeta}>
                  {breedDisp || "—"}{pet.species ? ` · ${titleCase(pet.species)}` : ""}{pet.ageYears != null ? ` · ${pet.ageYears} yr` : ""}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => toggleAllForPet(pet.id, !allSelected)}
                style={s.allBtn}
                activeOpacity={0.7}
              >
                <Text style={s.allBtnText}>{allSelected ? "Clear" : "Select all"}</Text>
              </TouchableOpacity>
            </View>
            {DATA_TYPES.map((t) => {
              const checked = !!sel[t.key];
              return (
                <TouchableOpacity
                  key={t.key}
                  onPress={() => toggle(pet.id, t.key)}
                  style={s.checkboxRow}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={`${t.label} for ${pet.name}`}
                >
                  <View style={[s.checkbox, checked && s.checkboxOn]}>
                    {checked && <MaterialCommunityIcons name="check" size={16} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.checkboxLabel}>{t.label}</Text>
                    <Text style={s.checkboxSub}>{t.sub}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}

      <TouchableOpacity
        onPress={onExport}
        disabled={busy || totalSelected === 0}
        style={[s.exportBtn, (busy || totalSelected === 0) && s.exportBtnDisabled]}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="share-variant" size={20} color="#fff" />
        <Text style={s.exportBtnText}>
          {busy ? "Building report…" : totalSelected === 0 ? "Pick something to export" : `Export ${totalSelected} item${totalSelected === 1 ? "" : "s"}`}
        </Text>
      </TouchableOpacity>

      <Text style={s.footnote}>
        Exports stay on your device until you choose to share them. We only receive your floof's data if you turn on cloud backup in your account.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  intro:          { padding: 14, borderRadius: 12, backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accent + "55", marginBottom: 14 },
  introTitle:     { fontSize: 16, fontWeight: "800", color: theme.accent, letterSpacing: -0.3 },
  introBody:      { fontSize: 13, color: theme.fg, marginTop: 6, lineHeight: 18 },
  petCard:        { backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.line, padding: 14, marginBottom: 14 },
  petHd:          { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  petName:        { fontSize: 18, fontWeight: "800", color: theme.fg, textTransform: "capitalize" },
  petMeta:        { fontSize: 12, color: theme.muted, marginTop: 2, textTransform: "capitalize" },
  allBtn:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.accentSoft },
  allBtnText:     { fontSize: 11, fontWeight: "800", color: theme.accent, letterSpacing: 0.3 },
  checkboxRow:    { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.line },
  checkbox:       { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: theme.muted, alignItems: "center", justifyContent: "center" },
  checkboxOn:     { backgroundColor: theme.accent, borderColor: theme.accent },
  checkboxLabel:  { fontSize: 14, fontWeight: "700", color: theme.fg },
  checkboxSub:    { fontSize: 11, color: theme.muted, marginTop: 2, lineHeight: 15 },
  exportBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, borderRadius: 14, backgroundColor: theme.accent, marginTop: 6 },
  exportBtnDisabled: { opacity: 0.55 },
  exportBtnText:  { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.3 },
  footnote:       { fontSize: 11, color: theme.muted, marginTop: 16, textAlign: "center", fontStyle: "italic", lineHeight: 16 },
});
