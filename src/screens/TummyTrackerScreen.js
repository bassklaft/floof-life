// TummyTrackerScreen — main screen for the Tummy Tracker feature.
// Renders the recall-match banner (if any) + vet-visit-suggestion
// banner (if any) + range selector + interleaved stool/diet timeline.
// Free tier: 30-day window. Premium: 90-day / 365-day / all-time.
//
// Spec: docs/features/tummy-tracker.md.
import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Image, Alert, StyleSheet, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Pet } from "../lib/storage";
import { useActivePet } from "../lib/activePet";
import {
  StoolLog, DietLog,
  BRISTOL_LABELS, STOOL_COLOR_LABELS, STOOL_VOLUME_LABELS, DIET_MEAL_TYPE_LABELS,
  detectVetSuggestion,
} from "../lib/tummy";
import { findRecallMatches, buildRecallBannerCopy, isCacheStale } from "../lib/recallMatch";
import { usePurchases } from "../lib/purchasesContext";
import { track } from "../lib/analytics";
import { tapLight, tapMedium } from "../lib/haptics";
import BristolIcon from "../components/BristolIcon";
import { theme } from "../theme";

// Range options. The free tier is 30; the rest are gated.
const RANGES = [
  { key: 30,  label: "30 days",  premium: false },
  { key: 90,  label: "90 days",  premium: true  },
  { key: 365, label: "Year",     premium: true  },
  { key: 0,   label: "All time", premium: true  }, // 0 = no cutoff
];

function fmtTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function TummyTrackerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { isPremium } = usePurchases();

  const [pet, setPet] = useState(null);
  const [stoolEntries, setStoolEntries] = useState([]);
  const [dietEntries, setDietEntries] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [rangeKey, setRangeKey] = useState(30);
  const [recallMatches, setRecallMatches] = useState([]);
  const [recallFetchedAt, setRecallFetchedAt] = useState(0);
  const [vetSuggestion, setVetSuggestion] = useState({ triggered: false });
  const [exporting, setExporting] = useState(false);
  const [recallShownTracked, setRecallShownTracked] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: pet?.name ? `${pet.name}'s Tummy` : "Tummy Tracker" });
  }, [navigation, pet]);

  // Active-pet hook drives reload — without this, switching floofs
  // via the fan-out while sitting on Tummy Tracker kept the prior
  // pet's stool/diet log on screen.
  const { petId: activePetId } = useActivePet();

  // Generation counter — discards stale async results if a newer
  // active-pet switch supersedes this load. See HomeScreen for the
  // wraparound-swipe race this protects against.
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    const p = await Pet.get();
    if (gen !== loadGenRef.current) return;
    setPet(p);
    if (!p?.id) return;

    const [stoolAll, dietAll] = await Promise.all([
      StoolLog.list(p.id),
      DietLog.list(p.id),
    ]);
    if (gen !== loadGenRef.current) return;
    setStoolEntries(stoolAll);
    setDietEntries(dietAll);

    // Always run vet-suggestion detection — free for everyone.
    const sug = detectVetSuggestion(stoolAll);
    setVetSuggestion(sug);
    if (sug.triggered) {
      track("tummy_tracker_vet_suggestion_shown", { trigger_type: sug.triggerType });
    }

    // Always run recall match — free for everyone, runs locally.
    try {
      const { matches, recallsFetchedAt } = await findRecallMatches(p.id, { windowDays: 90 });
      if (gen !== loadGenRef.current) return;
      setRecallMatches(matches);
      setRecallFetchedAt(recallsFetchedAt);
      if (matches.length > 0 && !recallShownTracked) {
        const m0 = matches[0];
        const ageDays = m0.recall?.recallDateRaw
          ? Math.max(0, Math.floor((Date.now() - new Date(m0.recall.recallDateRaw).getTime()) / (24 * 60 * 60 * 1000)))
          : null;
        track("tummy_tracker_recall_match_shown", {
          brand_match: m0.matchedField === "brand",
          recall_age_days: ageDays,
        });
        setRecallShownTracked(true);
      }
    } catch {
      // Network failure leaves recallMatches as last-known; don't surface.
    }
  }, [recallShownTracked, activePetId]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Filter by selected range. Free users picking a Premium range get
  // gated to 30-day; we don't allow selection of premium ranges
  // unless isPremium.
  const cutoffMs = rangeKey === 0 ? 0 : Date.now() - rangeKey * 24 * 60 * 60 * 1000;
  const stoolInRange = rangeKey === 0 ? stoolEntries : stoolEntries.filter((e) => (e.ts || 0) >= cutoffMs);
  const dietInRange  = rangeKey === 0 ? dietEntries  : dietEntries.filter((e) => (e.ts || 0) >= cutoffMs);
  const timeline = [
    ...stoolInRange.map((e) => ({ kind: "stool", entry: e })),
    ...dietInRange.map((e) => ({ kind: "diet",  entry: e })),
  ].sort((a, b) => (b.entry.ts || 0) - (a.entry.ts || 0));

  function pickRange(r) {
    if (r.premium && !isPremium) {
      track("tummy_tracker_premium_upsell_shown", { range: r.label });
      Alert.alert(
        "Premium feature",
        "Upgrade to see 90 days, the full year, or all-time history. Tummy logs are always saved — Premium just unlocks longer views.",
        [
          { text: "Maybe later" },
          { text: "See Premium", onPress: () => navigation.navigate("Premium") },
        ]
      );
      return;
    }
    tapLight();
    setRangeKey(r.key);
  }

  async function exportPdf() {
    if (!isPremium) {
      track("tummy_tracker_premium_upsell_shown", { feature: "pdf_export" });
      Alert.alert(
        "Premium feature",
        "PDF export with photos embedded is part of Premium. Upgrade to share a vet-friendly summary.",
        [
          { text: "Maybe later" },
          { text: "See Premium", onPress: () => navigation.navigate("Premium") },
        ]
      );
      return;
    }
    if (timeline.length === 0) {
      Alert.alert("Nothing to export", "Log at least one entry first.");
      return;
    }
    setExporting(true);
    try {
      track("tummy_tracker_export_initiated", {
        date_range: rangeKey === 0 ? "all_time" : `${rangeKey}d`,
        format: "pdf",
      });
      const html = buildExportHtml({
        pet,
        stoolEntries: stoolInRange,
        dietEntries: dietInRange,
        rangeLabel: RANGES.find((r) => r.key === rangeKey)?.label || `${rangeKey}d`,
        recallMatches,
        vetSuggestion,
      });
      const { uri } = await Print.printToFileAsync({ html });
      const sharable = await Sharing.isAvailableAsync();
      if (sharable) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Share Tummy Tracker log" });
      } else {
        Alert.alert("Saved", `PDF saved to ${uri}`);
      }
    } catch (e) {
      Alert.alert("Export failed", e?.message || "Couldn't generate the PDF.");
    } finally {
      setExporting(false);
    }
  }

  if (!pet) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  const empty = timeline.length === 0;

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 100, paddingHorizontal: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {/* Recall match banner — ALWAYS shown when match exists, free for all */}
      {recallMatches.length > 0 && (
        <View style={s.recallBanner}>
          <View style={s.recallIconCircle}>
            <MaterialCommunityIcons name="alert-octagon" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.recallTitle}>FDA recall match</Text>
            <Text style={s.recallBody}>{buildRecallBannerCopy(recallMatches[0])}</Text>
            {isCacheStale(recallFetchedAt) && (
              <Text style={s.recallStale}>Recall data may be outdated — last synced {new Date(recallFetchedAt).toLocaleDateString()}.</Text>
            )}
          </View>
        </View>
      )}

      {/* Vet visit suggestion banner — ALWAYS shown when triggered, free for all */}
      {vetSuggestion.triggered && (
        <View style={s.vetBanner}>
          <View style={s.vetIconCircle}>
            <MaterialCommunityIcons name="stethoscope" size={20} color={theme.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.vetTitle}>Pattern detected</Text>
            <Text style={s.vetBody}>{vetSuggestion.reason} Discuss with your vet.</Text>
          </View>
        </View>
      )}

      {/* Range selector */}
      <View style={s.rangeRow}>
        {RANGES.map((r) => {
          const isActive = rangeKey === r.key;
          const locked = r.premium && !isPremium;
          return (
            <TouchableOpacity
              key={r.key}
              onPress={() => pickRange(r)}
              style={[s.rangeCell, isActive && s.rangeCellActive, locked && s.rangeCellLocked]}
              activeOpacity={0.7}
            >
              <Text style={[s.rangeText, isActive && s.rangeTextActive]}>{r.label}</Text>
              {locked && <MaterialCommunityIcons name="lock-outline" size={11} color={theme.muted} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Action buttons */}
      <View style={s.actionsRow}>
        <TouchableOpacity onPress={() => { tapMedium(); navigation.navigate("LogStool"); }} style={s.actionBtn} activeOpacity={0.85}>
          <MaterialCommunityIcons name="emoticon-poop" size={18} color={theme.accent} />
          <Text style={s.actionBtnText}>Log poop</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { tapMedium(); navigation.navigate("LogDiet"); }} style={s.actionBtn} activeOpacity={0.85}>
          <MaterialCommunityIcons name="food-drumstick-outline" size={18} color={theme.accent} />
          <Text style={s.actionBtnText}>Log meal</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={exportPdf} disabled={exporting} style={[s.actionBtn, exporting && { opacity: 0.6 }]} activeOpacity={0.85}>
          <MaterialCommunityIcons name={isPremium ? "share-outline" : "lock-outline"} size={18} color={theme.accent} />
          <Text style={s.actionBtnText}>{exporting ? "Exporting…" : "Export"}</Text>
        </TouchableOpacity>
      </View>

      {/* Timeline */}
      {empty ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 56 }}>🐾</Text>
          <Text style={s.emptyTitle}>Log {pet.name}'s first poop</Text>
          <Text style={s.emptyBody}>
            Tummy Tracker turns the question "has this been weird for a few days?" into a clean log your vet can read in 30 seconds.
          </Text>
          <Text style={s.emptyBody}>
            We'll match logged foods against active FDA recalls and flag patterns that warrant a vet conversation. Always free.
          </Text>
        </View>
      ) : (
        timeline.map((row) => {
          const e = row.entry;
          if (row.kind === "stool") {
            return (
              <TouchableOpacity
                key={e.id}
                onPress={() => navigation.navigate("LogStool", { entryId: e.id })}
                style={s.row}
                activeOpacity={0.85}
              >
                <BristolIcon scale={e.bristol} size={36} color={theme.accent} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.rowTitle}>
                    Bristol {e.bristol} · {STOOL_COLOR_LABELS[e.color] || e.color}
                  </Text>
                  <Text style={s.rowSubtitle}>
                    {STOOL_VOLUME_LABELS[e.volume] || e.volume}
                    {e.hasBlood ? " · ⚠️ blood" : ""}
                    {e.hasMucus ? " · mucus" : ""}
                  </Text>
                  <Text style={s.rowMeta}>{fmtTs(e.ts)}</Text>
                </View>
                {e.photoUri ? (
                  <Image source={{ uri: e.photoUri }} style={s.rowPhoto} onError={() => {}} />
                ) : null}
              </TouchableOpacity>
            );
          }
          // diet row
          return (
            <TouchableOpacity
              key={e.id}
              onPress={() => navigation.navigate("LogDiet", { entryId: e.id })}
              style={[s.row, s.rowDiet]}
              activeOpacity={0.85}
            >
              <View style={s.dietIconCircle}>
                <MaterialCommunityIcons name="food-drumstick-outline" size={20} color={theme.green} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.rowTitle}>
                  {DIET_MEAL_TYPE_LABELS[e.mealType] || e.mealType}
                  {e.brand ? ` · ${e.brand}` : ""}
                </Text>
                {e.productName ? (
                  <Text style={s.rowSubtitle} numberOfLines={1}>{e.productName}{e.amount ? ` · ${e.amount}` : ""}</Text>
                ) : (e.amount ? <Text style={s.rowSubtitle}>{e.amount}</Text> : null)}
                <Text style={s.rowMeta}>{fmtTs(e.ts)}</Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}

      {/* Diet & Care guide — folded into Tummy in v1.3 (was its own
          Home card). Reference content lives in DietScreen. */}
      <TouchableOpacity onPress={() => { tapLight(); navigation.navigate("Diet"); }} style={s.dietCareCard} activeOpacity={0.8}>
        <View style={s.dietCareIcon}>
          <MaterialCommunityIcons name="food-apple" size={20} color={theme.green} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.dietCareTitle}>Diet & Care guide</Text>
          <Text style={s.dietCareSub}>Supplements, fresh foods & grooming products</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.muted} />
      </TouchableOpacity>

      <View style={s.disclaimer}>
        <Text style={s.disclaimerText}>
          Tummy Tracker doesn't diagnose. It helps you and your vet see patterns. Always consult your vet for health concerns.
        </Text>
      </View>
    </ScrollView>
  );
}

// HTML template for the PDF export — vet-friendly: chronological,
// scannable, single-page-printable for short ranges. Photos embedded
// inline via file:// URIs (expo-print supports local file refs).
function buildExportHtml({ pet, stoolEntries, dietEntries, rangeLabel, recallMatches, vetSuggestion }) {
  const allEntries = [
    ...stoolEntries.map((e) => ({ kind: "stool", entry: e })),
    ...dietEntries.map((e) => ({ kind: "diet",  entry: e })),
  ].sort((a, b) => (b.entry.ts || 0) - (a.entry.ts || 0));

  const escapeHtml = (s) => String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const recallBanner = recallMatches.length > 0
    ? `<div class="banner banner-recall"><strong>FDA RECALL MATCH:</strong> ${escapeHtml(buildRecallBannerCopy(recallMatches[0]))}</div>`
    : "";
  const vetBanner = vetSuggestion?.triggered
    ? `<div class="banner banner-vet"><strong>Pattern detected:</strong> ${escapeHtml(vetSuggestion.reason)} Discuss with your vet.</div>`
    : "";

  const rows = allEntries.map((row) => {
    const e = row.entry;
    const ts = new Date(e.ts || 0).toLocaleString();
    if (row.kind === "stool") {
      const photo = e.photoUri ? `<div class="photo"><img src="${escapeHtml(e.photoUri)}" /></div>` : "";
      return `
        <tr class="stool">
          <td class="ts">${escapeHtml(ts)}</td>
          <td class="content">
            <div><strong>Bristol ${e.bristol}</strong> — ${escapeHtml(BRISTOL_LABELS[e.bristol] || "")}</div>
            <div>Color: ${escapeHtml(STOOL_COLOR_LABELS[e.color] || e.color)}</div>
            <div>Volume: ${escapeHtml(STOOL_VOLUME_LABELS[e.volume] || e.volume)}</div>
            ${e.hasBlood ? `<div class="flag">⚠️ Visible blood</div>` : ""}
            ${e.hasMucus ? `<div>Mucus present</div>` : ""}
            ${e.hasForeignMaterial ? `<div>Foreign material noted</div>` : ""}
            ${e.hasUndigestedFood ? `<div>Undigested food noted</div>` : ""}
            ${e.note ? `<div class="note">Note: ${escapeHtml(e.note)}</div>` : ""}
            ${photo}
          </td>
        </tr>`;
    }
    return `
      <tr class="diet">
        <td class="ts">${escapeHtml(ts)}</td>
        <td class="content">
          <div><strong>${escapeHtml(DIET_MEAL_TYPE_LABELS[e.mealType] || e.mealType)}</strong></div>
          ${e.brand ? `<div>Brand: ${escapeHtml(e.brand)}</div>` : ""}
          ${e.productName ? `<div>Product: ${escapeHtml(e.productName)}</div>` : ""}
          ${e.amount ? `<div>Amount: ${escapeHtml(e.amount)}</div>` : ""}
          ${e.note ? `<div class="note">Note: ${escapeHtml(e.note)}</div>` : ""}
        </td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Tummy Tracker — ${escapeHtml(pet?.name || "Pet")}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; color: #1F2123; margin: 24px; font-size: 12px; }
  h1 { font-size: 22px; margin: 0 0 4px 0; color: #1F2123; }
  .header-meta { color: #666; font-size: 11px; margin-bottom: 16px; }
  .banner { padding: 10px 12px; border-radius: 8px; margin-bottom: 12px; font-size: 11px; line-height: 1.5; }
  .banner-recall { background: #FFE6E0; border-left: 4px solid #C04A2C; }
  .banner-vet { background: #FCF3D6; border-left: 4px solid #E0A82E; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td { vertical-align: top; padding: 8px 10px; border-bottom: 1px solid #E2DBC8; font-size: 11px; }
  td.ts { width: 110px; color: #666; font-variant-numeric: tabular-nums; }
  tr.stool { background: #F4F0E2; }
  tr.diet  { background: #fff; }
  .flag { color: #C04A2C; font-weight: 700; }
  .note { color: #555; font-style: italic; margin-top: 4px; }
  .photo img { max-width: 240px; max-height: 180px; margin-top: 6px; border-radius: 4px; border: 1px solid #ddd; }
  .footer { margin-top: 18px; font-size: 10px; color: #888; line-height: 1.5; }
</style>
</head>
<body>
  <h1>${escapeHtml(pet?.name || "Pet")} — Tummy Tracker log</h1>
  <div class="header-meta">
    Range: ${escapeHtml(rangeLabel)} · ${stoolEntries.length} stool entr${stoolEntries.length === 1 ? "y" : "ies"} · ${dietEntries.length} diet entr${dietEntries.length === 1 ? "y" : "ies"} · Generated ${new Date().toLocaleString()}
  </div>
  ${recallBanner}
  ${vetBanner}
  <table>${rows || `<tr><td>No entries in this range.</td></tr>`}</table>
  <div class="footer">
    Tummy Tracker is a personal log generated by FloofLife. It doesn't diagnose. Discuss patterns with your veterinarian.
  </div>
</body>
</html>`;
}

const s = StyleSheet.create({
  recallBanner:    { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 12, backgroundColor: "#FFE6E0", borderLeftWidth: 4, borderLeftColor: "#C04A2C", marginBottom: 12 },
  recallIconCircle:{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#C04A2C" },
  recallTitle:     { fontSize: 13, fontWeight: "800", color: "#7A2A14", marginBottom: 4, letterSpacing: 0.4 },
  recallBody:      { fontSize: 12, color: "#1F2123", lineHeight: 17 },
  recallStale:     { fontSize: 10, color: "#7A2A14", marginTop: 4, fontStyle: "italic" },
  vetBanner:       { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 12, backgroundColor: theme.accentSoft, borderLeftWidth: 4, borderLeftColor: theme.accent, marginBottom: 12 },
  vetIconCircle:   { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg },
  vetTitle:        { fontSize: 13, fontWeight: "800", color: theme.accent, marginBottom: 4, letterSpacing: 0.4 },
  vetBody:         { fontSize: 12, color: theme.fg, lineHeight: 17 },
  rangeRow:        { flexDirection: "row", gap: 6, marginTop: 4 },
  rangeCell:       { flex: 1, paddingVertical: 8, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 4, borderRadius: 8, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card },
  rangeCellActive: { borderColor: theme.accent, borderWidth: 2, backgroundColor: theme.accentSoft },
  rangeCellLocked: { opacity: 0.7 },
  rangeText:       { fontSize: 11, fontWeight: "600", color: theme.fg },
  rangeTextActive: { color: theme.accent, fontWeight: "800" },
  actionsRow:      { flexDirection: "row", gap: 8, marginTop: 10, marginBottom: 14 },
  actionBtn:       { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.accent + "55", backgroundColor: theme.bg },
  actionBtnText:   { fontSize: 12, fontWeight: "700", color: theme.accent },
  empty:           { alignItems: "center", paddingVertical: 32, paddingHorizontal: 12 },
  emptyTitle:      { fontSize: 18, fontWeight: "800", color: theme.fg, marginTop: 14 },
  emptyBody:       { fontSize: 13, color: theme.muted, marginTop: 10, textAlign: "center", lineHeight: 19 },
  row:             { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card, marginBottom: 8 },
  rowDiet:         { backgroundColor: theme.bg },
  rowTitle:        { fontSize: 13, fontWeight: "700", color: theme.fg },
  rowSubtitle:     { fontSize: 11, color: theme.muted, marginTop: 2 },
  rowMeta:         { fontSize: 10, color: theme.muted, marginTop: 4 },
  rowPhoto:        { width: 48, height: 48, borderRadius: 8, marginLeft: 8 },
  dietIconCircle:  { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme.green + "1f" },
  dietCareCard:    { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginTop: 18, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line },
  dietCareIcon:    { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: theme.green + "1f" },
  dietCareTitle:   { fontSize: 15, fontWeight: "700", color: theme.fg },
  dietCareSub:     { fontSize: 12, color: theme.muted, marginTop: 2 },
  disclaimer:      { marginTop: 16, padding: 12, borderRadius: 10, backgroundColor: theme.accentSoft },
  disclaimerText:  { fontSize: 11, color: theme.fg, textAlign: "center", lineHeight: 16, fontStyle: "italic" },
});
