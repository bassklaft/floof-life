// MoodTrackerScreen — picker (top) + recent log (below). The picker is
// a grid of mood chips grouped by tone band. Tapping a chip writes a
// MoodLog for the current slot (morning before noon, evening after)
// and shows the guidance for that mood inline. The log strip below
// gives the user a quick "what have we logged this week" view.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pet, Pets } from "../lib/storage";
import { useActivePet } from "../lib/activePet";
import { MOODS, MOOD_BY_ID, moodSlotFor, moodDateKey, MOOD_SLOT_LABELS } from "../data/moods";
import { tapLight, tapMedium } from "../lib/haptics";
import { track } from "../lib/analytics";
import { theme } from "../theme";

const TONE_LABEL = {
  positive: "Sweet spots",
  neutral:  "Quirks of the day",
  watch:    "Worth watching",
};
const TONE_ORDER = ["positive", "neutral", "watch"];

function fmtTs(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function MoodTrackerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();

  const [pet, setPet] = useState(null);
  const [logs, setLogs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  // Last logged mood id this session — drives the guidance card.
  const [selectedMoodId, setSelectedMoodId] = useState(null);

  const slot = useMemo(() => moodSlotFor(), []);
  const todayKey = useMemo(() => moodDateKey(), []);

  useLayoutEffect(() => {
    navigation.setOptions({ title: pet?.name ? `${pet.name}'s Mood` : "Mood" });
  }, [navigation, pet]);

  const { petId: activePetId } = useActivePet();

  // Honor an optional pre-selected pet id from route params (Export
  // floof, Home prompt). Otherwise read the active pet.
  const targetPetId = route?.params?.petId || null;

  const loadGenRef = useRef(0);
  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    let p = null;
    if (targetPetId) {
      const all = await Pets.list();
      p = all.find((x) => x.id === targetPetId) || null;
    } else {
      p = await Pet.get();
    }
    if (gen !== loadGenRef.current) return;
    setPet(p);
    if (!p?.id) return;
    const arr = await Pets.listMoodLogs(p.id);
    if (gen !== loadGenRef.current) return;
    setLogs(arr.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)));
    // Surface the most-recent slot match as the selected mood so the
    // guidance reads as "here's what you said earlier today".
    const sameSlot = arr.filter((r) => r.dateKey === moodDateKey() && r.slot === slot);
    setSelectedMoodId(sameSlot[sameSlot.length - 1]?.moodId || null);
  }, [targetPetId, activePetId, slot]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function pickMood(moodId) {
    if (!pet?.id) return;
    tapMedium();
    const dateKey = moodDateKey();
    const currentSlot = moodSlotFor();
    const record = await Pets.addMoodLog(pet.id, {
      moodId,
      slot: currentSlot,
      dateKey,
    });
    if (record) {
      track("mood_logged", { mood_id: moodId, slot: currentSlot });
      setLogs((prev) => [record, ...prev]);
      setSelectedMoodId(moodId);
    }
  }

  async function deleteLog(id) {
    if (!pet?.id) return;
    tapLight();
    await Pets.removeMoodLog(pet.id, id);
    setLogs((prev) => prev.filter((r) => r.id !== id));
  }

  const grouped = useMemo(() => {
    const out = { positive: [], neutral: [], watch: [] };
    for (const m of MOODS) out[m.tone].push(m);
    return out;
  }, []);

  const selectedMood = selectedMoodId ? MOOD_BY_ID[selectedMoodId] : null;

  // Build a small "this week" map of slot keys → moodId so the
  // history strip can show 7 days × 2 slots at a glance.
  const weekStrip = useMemo(() => {
    const out = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = moodDateKey(d);
      const matches = logs.filter((r) => r.dateKey === key);
      const morning = matches.find((r) => r.slot === "morning")?.moodId || null;
      const night = matches.find((r) => r.slot === "night")?.moodId || null;
      out.push({ key, label: d.toLocaleDateString(undefined, { weekday: "short" }), morning, night, dateLabel: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) });
    }
    return out;
  }, [logs]);

  if (!pet) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <View style={s.intro}>
        <Text style={s.introTitle}>How's {pet.name} this {MOOD_SLOT_LABELS[slot].toLowerCase()}?</Text>
        <Text style={s.introBody}>
          Take a beat. Watch how they're moving, listening, breathing. Pick what feels closest — patterns over time tell the real story, and your vet can see it all in the export.
        </Text>
      </View>

      {TONE_ORDER.map((tone) => (
        <View key={tone} style={{ marginTop: 14 }}>
          <Text style={s.toneHd}>{TONE_LABEL[tone]}</Text>
          <View style={s.chipGrid}>
            {grouped[tone].map((m) => {
              const isSel = selectedMoodId === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => pickMood(m.id)}
                  style={[s.chip, isSel && s.chipActive]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Log mood: ${m.label}`}
                >
                  <Text style={s.chipEmoji}>{m.emoji}</Text>
                  <Text style={[s.chipLabel, isSel && s.chipLabelActive]}>{m.label}</Text>
                  <Text style={[s.chipBlurb, isSel && s.chipBlurbActive]} numberOfLines={2}>{m.blurb}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}

      {selectedMood && (
        <View style={s.guidanceCard}>
          <View style={s.guidanceHd}>
            <Text style={s.guidanceEmoji}>{selectedMood.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.guidanceTitle}>{selectedMood.label}</Text>
              <Text style={s.guidanceSub}>Logged for {pet.name} · {MOOD_SLOT_LABELS[slot]}</Text>
            </View>
          </View>
          <Text style={s.guidanceBody}>{selectedMood.guidance}</Text>
          <Text style={s.guidanceFooter}>
            {selectedMood.tone === "watch"
              ? "If anything feels off beyond a day or two — call your vet. You know your floof's normal."
              : "Logged. The pattern is what your vet will care about — keep checking in."}
          </Text>
        </View>
      )}

      <Text style={s.weekHd}>THIS WEEK</Text>
      <View style={s.weekStrip}>
        {weekStrip.map((d) => (
          <View key={d.key} style={s.weekCell}>
            <Text style={s.weekCellDay}>{d.label}</Text>
            <View style={s.weekCellSlot}>
              <Text style={[s.weekCellEmoji, !d.morning && s.weekCellEmojiEmpty]} numberOfLines={1}>
                {d.morning ? MOOD_BY_ID[d.morning]?.emoji || "·" : "·"}
              </Text>
              <Text style={[s.weekCellEmoji, !d.night && s.weekCellEmojiEmpty]} numberOfLines={1}>
                {d.night ? MOOD_BY_ID[d.night]?.emoji || "·" : "·"}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={s.logHd}>RECENT LOGS</Text>
      {logs.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>Nothing logged yet — pick a mood above to start.</Text>
        </View>
      ) : (
        logs.slice(0, 20).map((r) => {
          const m = MOOD_BY_ID[r.moodId];
          if (!m) return null;
          return (
            <View key={r.id} style={s.logRow}>
              <Text style={s.logEmoji}>{m.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.logLabel}>{m.label} · {MOOD_SLOT_LABELS[r.slot] || ""}</Text>
                <Text style={s.logTs}>{fmtTs(r.ts)}</Text>
              </View>
              <TouchableOpacity onPress={() => deleteLog(r.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialCommunityIcons name="close" size={18} color={theme.muted} />
              </TouchableOpacity>
            </View>
          );
        })
      )}

      <View style={s.disclaimer}>
        <Text style={s.disclaimerText}>
          Mood notes help spot patterns — they're not medical advice. When something feels off beyond a day or two, call your vet.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  intro:           { padding: 14, borderRadius: 12, backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accent + "55" },
  introTitle:      { fontSize: 17, fontWeight: "800", color: theme.accent, letterSpacing: -0.3 },
  introBody:       { fontSize: 13, color: theme.fg, marginTop: 6, lineHeight: 18 },
  toneHd:          { fontSize: 11, fontWeight: "800", color: theme.muted, letterSpacing: 1.2, marginBottom: 8 },
  chipGrid:        { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip:            { width: "31%", padding: 10, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line, alignItems: "center" },
  chipActive:      { backgroundColor: theme.accent, borderColor: theme.accent },
  chipEmoji:       { fontSize: 26 },
  chipLabel:       { fontSize: 12, fontWeight: "800", color: theme.fg, marginTop: 4, letterSpacing: -0.1 },
  chipLabelActive: { color: "#fff" },
  chipBlurb:       { fontSize: 10, color: theme.muted, marginTop: 4, textAlign: "center", lineHeight: 13 },
  chipBlurbActive: { color: "rgba(255,255,255,0.95)" },
  guidanceCard:    { marginTop: 18, padding: 14, borderRadius: 14, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  guidanceHd:      { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  guidanceEmoji:   { fontSize: 28 },
  guidanceTitle:   { fontSize: 16, fontWeight: "800", color: theme.fg, letterSpacing: -0.2 },
  guidanceSub:     { fontSize: 11, color: theme.muted, marginTop: 2 },
  guidanceBody:    { fontSize: 13, color: theme.fg, lineHeight: 19 },
  guidanceFooter:  { fontSize: 11, color: theme.muted, fontStyle: "italic", marginTop: 8, lineHeight: 16 },
  weekHd:          { marginTop: 22, marginBottom: 8, fontSize: 11, fontWeight: "800", color: theme.muted, letterSpacing: 1.2 },
  weekStrip:       { flexDirection: "row", justifyContent: "space-between", padding: 10, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line },
  weekCell:        { alignItems: "center", flex: 1 },
  weekCellDay:     { fontSize: 10, fontWeight: "700", color: theme.muted, letterSpacing: 0.4 },
  weekCellSlot:    { flexDirection: "row", gap: 4, marginTop: 4 },
  weekCellEmoji:   { fontSize: 14 },
  weekCellEmojiEmpty: { opacity: 0.25 },
  logHd:           { marginTop: 22, marginBottom: 8, fontSize: 11, fontWeight: "800", color: theme.muted, letterSpacing: 1.2 },
  empty:           { padding: 16, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line, alignItems: "center" },
  emptyText:       { fontSize: 12, color: theme.muted, fontStyle: "italic" },
  logRow:          { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, marginBottom: 6, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line },
  logEmoji:        { fontSize: 22 },
  logLabel:        { fontSize: 13, fontWeight: "700", color: theme.fg },
  logTs:           { fontSize: 11, color: theme.muted, marginTop: 2 },
  disclaimer:      { marginTop: 18, padding: 14, borderRadius: 10, backgroundColor: theme.accentSoft },
  disclaimerText:  { fontSize: 11, color: theme.fg, lineHeight: 17 },
});
