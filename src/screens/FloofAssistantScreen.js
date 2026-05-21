// FloofAssistantScreen — chat UI for the Floof Assistant.
//
// Flow: pick a floof (preselected to the active pet) → see preset
// question chips → type or tap a preset → conversation streams in
// below. The pet-context block is built on the first message and
// re-built only when the user switches floofs (cheap; AsyncStorage).
//
// We bound the conversation to the last 20 turns to keep token spend
// predictable across long sessions. Older turns are dropped silently.
//
// Errors fall into three buckets the UI distinguishes:
//   - not_configured: developer hasn't set EXPO_PUBLIC_AI_PROXY_URL.
//     Show a clear "we need to wire this up" banner.
//   - rate_limited / upstream_*: transient, retry message.
//   - everything else: generic "couldn't reach the assistant" copy.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pets, Pet } from "../lib/storage";
import { useActivePet } from "../lib/activePet";
import { askFloofAssistant, buildPetContext, isConfigured, FloofAssistantError } from "../lib/aiAssistant";
import { tapLight, tapMedium } from "../lib/haptics";
import { track } from "../lib/analytics";
import { theme } from "../theme";

const MAX_TURNS = 20;

// Preset prompts — interpolate the pet name at render time, but the
// underlying templates are stable.
const PRESETS = [
  { id: "weird-poop",   label: "What does this stool tell me?", build: (n) => `Looking at ${n}'s recent stool log, anything I should flag to the vet?` },
  { id: "mood-trend",   label: "Decode their mood pattern",      build: (n) => `Based on ${n}'s recent mood log, are there any patterns worth paying attention to?` },
  { id: "vet-visit",    label: "Help me prep for the vet",       build: (n) => `Help me put together notes to bring to ${n}'s next vet visit.` },
  { id: "breed-quirks", label: "What's normal for the breed?",   build: (n) => `What behaviors and quirks are typical for ${n}'s breed that I should know about?` },
  { id: "enrichment",   label: "Enrichment ideas tonight",       build: (n) => `Give me 3 enrichment ideas for ${n} I can do in 10 minutes tonight.` },
  { id: "off-today",    label: `Why might ${"{name}"} seem off?`, build: (n) => `${n} seems a little off today. What kinds of things should I be looking for?` },
];

export default function FloofAssistantScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();

  const { petId: activePetId } = useActivePet();
  const [pets, setPets] = useState([]);
  const [selectedPetId, setSelectedPetId] = useState(route?.params?.petId || null);
  const [petContext, setPetContext] = useState("");
  const [turns, setTurns] = useState([]); // [{role: "user"|"assistant", content: string, id}]
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: "Ask the Floof Assistant" });
  }, [navigation]);

  // Load pets list + default to active pet if no explicit param.
  const load = useCallback(async () => {
    const list = await Pets.listSortedOldestFirst();
    setPets(list);
    if (!selectedPetId) {
      const active = await Pet.get();
      if (active?.id) setSelectedPetId(active.id);
      else if (list[0]?.id) setSelectedPetId(list[0].id);
    }
  }, [selectedPetId]);
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Re-build pet context whenever the selected floof changes. Reset
  // the conversation too — context-mismatched turns would confuse the
  // model (e.g. user asked about Falafel, then switched to Bella).
  useEffect(() => {
    if (!selectedPetId) return;
    let cancelled = false;
    (async () => {
      const ctx = await buildPetContext(selectedPetId);
      if (cancelled) return;
      setPetContext(ctx);
      setTurns([]);
      setError(null);
    })();
    return () => { cancelled = true; };
  }, [selectedPetId]);

  const selectedPet = useMemo(
    () => pets.find((p) => p.id === selectedPetId) || null,
    [pets, selectedPetId],
  );

  async function send(text) {
    const trimmed = (text || "").trim();
    if (!trimmed || busy) return;
    if (!isConfigured()) {
      setError({ code: "not_configured" });
      return;
    }
    tapMedium();
    setError(null);
    const userTurn = { role: "user", content: trimmed, id: `u${Date.now()}` };
    const nextTurns = [...turns, userTurn].slice(-MAX_TURNS);
    setTurns(nextTurns);
    setInput("");
    setBusy(true);
    try {
      const apiMessages = nextTurns.map(({ role, content }) => ({ role, content }));
      const response = await askFloofAssistant({
        messages: apiMessages,
        petContext,
      });
      const assistantText = (response?.text || "").trim();
      if (assistantText) {
        setTurns((prev) => [...prev, { role: "assistant", content: assistantText, id: `a${Date.now()}` }].slice(-MAX_TURNS));
      }
      track("ai_assistant_turn", {
        pet_id: selectedPetId,
        cache_read_tokens:     response?.usage?.cache_read_input_tokens     ?? 0,
        cache_creation_tokens: response?.usage?.cache_creation_input_tokens ?? 0,
        input_tokens:          response?.usage?.input_tokens                ?? 0,
        output_tokens:         response?.usage?.output_tokens               ?? 0,
      });
    } catch (err) {
      if (err instanceof FloofAssistantError) {
        setError({ code: err.code, extra: err.extra });
      } else {
        setError({ code: "unknown" });
      }
    } finally {
      setBusy(false);
      // Defer to next tick so the new content has measured.
      setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 50);
    }
  }

  function tapPreset(preset) {
    tapLight();
    const name = selectedPet?.name || "your floof";
    send(preset.build(name));
  }

  // ─── Renders ──────────────────────────────────────────────────────

  if (!selectedPet) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, padding: 24, alignItems: "center", justifyContent: "center" }}>
        <MaterialCommunityIcons name="paw" size={40} color={theme.muted} />
        <Text style={{ color: theme.muted, marginTop: 12, textAlign: "center" }}>Add a floof first — then I can answer questions about them.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.intro}>
          <Text style={s.introTitle}>Ask me about {selectedPet.name}</Text>
          <Text style={s.introBody}>
            I'll factor in what you've logged — breed, age, weight, vaccines, mood patterns, and tummy log. I'm not a vet — I won't diagnose or prescribe — but I can help you spot what's worth asking your vet about.
          </Text>
        </View>

        {pets.length > 1 && (
          <View style={s.petPickerWrap}>
            <Text style={s.petPickerLabel}>Which floof are you asking about?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 12 }}>
              {pets.map((p) => {
                const sel = p.id === selectedPetId;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => { tapLight(); setSelectedPetId(p.id); }}
                    style={[s.petChip, sel && s.petChipActive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.petChipText, sel && s.petChipTextActive]}>{p.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {turns.length === 0 && (
          <View style={s.presetsWrap}>
            <Text style={s.presetsHd}>SUGGESTIONS</Text>
            <View style={s.presetsGrid}>
              {PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.id}
                  onPress={() => tapPreset(preset)}
                  style={s.presetChip}
                  activeOpacity={0.7}
                >
                  <Text style={s.presetChipText}>{preset.label.replace("{name}", selectedPet.name)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {turns.map((t) => (
          <View key={t.id} style={[s.bubbleRow, t.role === "user" ? s.bubbleRowUser : s.bubbleRowAssistant]}>
            <View style={[s.bubble, t.role === "user" ? s.bubbleUser : s.bubbleAssistant]}>
              <Text style={t.role === "user" ? s.bubbleUserText : s.bubbleAssistantText}>{t.content}</Text>
            </View>
          </View>
        ))}

        {busy && (
          <View style={[s.bubbleRow, s.bubbleRowAssistant]}>
            <View style={[s.bubble, s.bubbleAssistant]}>
              <ActivityIndicator color={theme.accent} />
            </View>
          </View>
        )}

        {error && (
          <View style={s.errorCard}>
            <Text style={s.errorTitle}>
              {error.code === "not_configured" ? "Floof Assistant isn't wired up yet"
                : error.code === "rate_limited" ? "Slow down — give it a minute"
                : error.code === "upstream_rate_limited" || error.code === "upstream_overloaded" ? "The assistant is overloaded — try again in a moment"
                : "Couldn't reach the assistant"}
            </Text>
            <Text style={s.errorBody}>
              {error.code === "not_configured"
                ? "Set EXPO_PUBLIC_AI_PROXY_URL in .env and rebuild. See supabase/functions/ai-floof-assistant/README.md for the setup."
                : error.code === "rate_limited"
                  ? `Per-${error.extra?.window === "daily" ? "day" : "hour"} limit reached. Try again in ${error.extra?.retry_after_seconds ?? "a bit"}s.`
                  : "Check your connection and try again."}
            </Text>
          </View>
        )}

        <Text style={s.footnote}>
          Floof Assistant is a knowledgeable companion, not a vet. When something feels wrong, call your vet — or call ASPCA Animal Poison Control at 1‑888‑426‑4435 for suspected poisonings.
        </Text>
      </ScrollView>

      <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={`Ask about ${selectedPet.name}…`}
          placeholderTextColor={theme.muted}
          style={s.textInput}
          multiline
          editable={!busy}
        />
        <TouchableOpacity
          onPress={() => send(input)}
          disabled={busy || !input.trim()}
          style={[s.sendBtn, (busy || !input.trim()) && s.sendBtnDisabled]}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  intro:           { padding: 14, borderRadius: 12, backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accent + "55", marginBottom: 14 },
  introTitle:      { fontSize: 16, fontWeight: "800", color: theme.accent, letterSpacing: -0.3 },
  introBody:       { fontSize: 13, color: theme.fg, marginTop: 6, lineHeight: 18 },
  petPickerWrap:   { marginBottom: 14 },
  petPickerLabel:  { fontSize: 11, fontWeight: "800", color: theme.muted, letterSpacing: 1.2, marginBottom: 8 },
  petChip:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line },
  petChipActive:   { backgroundColor: theme.accent, borderColor: theme.accent },
  petChipText:     { fontSize: 13, fontWeight: "700", color: theme.fg, textTransform: "capitalize" },
  petChipTextActive: { color: "#fff" },
  presetsWrap:     { marginBottom: 14 },
  presetsHd:       { fontSize: 11, fontWeight: "800", color: theme.muted, letterSpacing: 1.2, marginBottom: 8 },
  presetsGrid:     { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  presetChip:      { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line, maxWidth: "100%" },
  presetChipText:  { fontSize: 13, color: theme.fg, fontWeight: "600" },
  bubbleRow:       { marginBottom: 10, flexDirection: "row" },
  bubbleRowUser:   { justifyContent: "flex-end" },
  bubbleRowAssistant: { justifyContent: "flex-start" },
  bubble:          { maxWidth: "85%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubbleUser:      { backgroundColor: theme.accent, borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line, borderBottomLeftRadius: 4 },
  bubbleUserText:  { color: "#fff", fontSize: 14, lineHeight: 20 },
  bubbleAssistantText: { color: theme.fg, fontSize: 14, lineHeight: 20 },
  errorCard:       { padding: 12, borderRadius: 12, backgroundColor: "#FCE9C8", borderWidth: 1, borderColor: "#E0A82E", marginBottom: 8 },
  errorTitle:      { fontSize: 13, fontWeight: "800", color: "#5A3F0A" },
  errorBody:       { fontSize: 12, color: "#5A3F0A", marginTop: 4, lineHeight: 16 },
  footnote:        { fontSize: 11, color: theme.muted, marginTop: 12, lineHeight: 16, textAlign: "center", fontStyle: "italic" },
  inputBar:        { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 14, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.line, backgroundColor: theme.bg },
  textInput:       { flex: 1, maxHeight: 120, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line, fontSize: 15, color: theme.fg },
  sendBtn:         { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { opacity: 0.4 },
});
