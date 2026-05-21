// ConditionsScreen — per-pet health-condition guides.
//
// For an owner whose floof has a diagnosed chronic condition (FIV,
// FeLV, ...). Two zones:
//   1. "On file" — conditions the owner has added, each expandable to
//      its full guidance (sections from src/data/conditions.js).
//   2. "Add a condition" — catalog entries for this pet's species not
//      yet on file.
//
// This screen presents guidance only. It never diagnoses — the owner
// adds a condition because their VET diagnosed it. Copy throughout
// keeps that framing.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, LayoutAnimation, Platform, UIManager, StyleSheet } from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pet, Pets } from "../lib/storage";
import { useActivePet } from "../lib/activePet";
import { CONDITION_BY_ID, conditionsForSpecies } from "../data/conditions";
import { tapLight, tapMedium } from "../lib/haptics";
import { track } from "../lib/analytics";
import { theme } from "../theme";

// Render a guide body string — lines starting with "• " become
// hanging-indent bullet rows; everything else is a paragraph.
function GuideBody({ text }) {
  const blocks = (text || "").split("\n");
  return (
    <View>
      {blocks.map((line, i) => {
        if (line.trim() === "") return <View key={i} style={{ height: 8 }} />;
        if (line.startsWith("• ")) {
          return (
            <View key={i} style={s.bulletRow}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={s.bulletText}>{line.slice(2)}</Text>
            </View>
          );
        }
        return <Text key={i} style={s.para}>{line}</Text>;
      })}
    </View>
  );
}

export default function ConditionsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();

  const [pet, setPet] = useState(null);
  const [conditions, setConditions] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: pet?.name ? `${pet.name}'s Conditions` : "Health Conditions" });
  }, [navigation, pet]);

  const { petId: activePetId } = useActivePet();
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
    const arr = await Pets.listConditions(p.id);
    if (gen !== loadGenRef.current) return;
    setConditions(arr);
  }, [targetPetId, activePetId]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Catalog entries for this pet's species, minus anything on file.
  const available = useMemo(() => {
    if (!pet) return [];
    const onFile = new Set(conditions.map((c) => c.conditionId));
    return conditionsForSpecies(pet.species).filter((c) => !onFile.has(c.id));
  }, [pet, conditions]);

  async function addCondition(conditionId) {
    if (!pet?.id) return;
    tapMedium();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    await Pets.addCondition(pet.id, { conditionId });
    track("condition_added", { condition_id: conditionId });
    const arr = await Pets.listConditions(pet.id);
    setConditions(arr);
    setExpandedId(conditionId); // open the new one so the guide is right there
  }

  function confirmRemove(record) {
    const guide = CONDITION_BY_ID[record.conditionId];
    Alert.alert(
      `Remove ${guide?.shortLabel || "this condition"}?`,
      "This just removes it from FloofLife — it doesn't change anything about your floof's care. You can add it back anytime.",
      [
        { text: "Cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            tapLight();
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            await Pets.removeCondition(pet.id, record.id);
            setConditions(await Pets.listConditions(pet.id));
          },
        },
      ],
    );
  }

  function toggleExpanded(conditionId) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === conditionId ? null : conditionId));
    tapLight();
  }

  if (!pet) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  const speciesLabel = (pet.species || "pet").toLowerCase();

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 40 }}
    >
      <View style={s.intro}>
        <Text style={s.introTitle}>Caring for {pet.name}</Text>
        <Text style={s.introBody}>
          If your vet has diagnosed {pet.name} with a condition, add it here for supportive day-to-day guidance — what to watch for, how to keep them comfortable, and what to bring up at the next visit. This is guidance, not a diagnosis or treatment plan.
        </Text>
      </View>

      {conditions.length > 0 && (
        <>
          <Text style={s.sectionHd}>ON FILE</Text>
          {conditions.map((record) => {
            const guide = CONDITION_BY_ID[record.conditionId];
            if (!guide) return null;
            const expanded = expandedId === guide.id;
            return (
              <View key={record.id} style={s.condCard}>
                <TouchableOpacity
                  onPress={() => toggleExpanded(guide.id)}
                  activeOpacity={0.7}
                  style={s.condHeader}
                >
                  <Text style={s.condEmoji}>{guide.emoji || "🩺"}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.condTitle}>{guide.label}</Text>
                    <Text style={s.condOneLiner}>{guide.oneLiner}</Text>
                  </View>
                  <MaterialCommunityIcons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={22}
                    color={theme.muted}
                  />
                </TouchableOpacity>

                {expanded && (
                  <View style={s.guideBody}>
                    {guide.sections.map((sec, i) => (
                      <View key={i} style={s.guideSection}>
                        <Text style={s.guideSectionTitle}>{sec.title}</Text>
                        <GuideBody text={sec.body} />
                      </View>
                    ))}
                    {Array.isArray(guide.resources) && guide.resources.length > 0 && (
                      <View style={s.guideSection}>
                        <Text style={s.guideSectionTitle}>Where to learn more</Text>
                        {guide.resources.map((r, i) => (
                          <View key={i} style={s.bulletRow}>
                            <Text style={s.bulletDot}>›</Text>
                            <Text style={s.bulletText}>{r}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    <TouchableOpacity onPress={() => confirmRemove(record)} style={s.removeBtn} activeOpacity={0.7}>
                      <MaterialCommunityIcons name="close-circle-outline" size={15} color={theme.muted} />
                      <Text style={s.removeBtnText}>Remove {guide.shortLabel} from FloofLife</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

      {available.length > 0 && (
        <>
          <Text style={s.sectionHd}>{conditions.length > 0 ? "ADD ANOTHER" : "ADD A CONDITION"}</Text>
          {available.map((guide) => (
            <TouchableOpacity
              key={guide.id}
              onPress={() => addCondition(guide.id)}
              style={s.addCard}
              activeOpacity={0.7}
            >
              <Text style={s.condEmoji}>{guide.emoji || "🩺"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.addTitle}>{guide.label}</Text>
                <Text style={s.addOneLiner} numberOfLines={2}>{guide.oneLiner}</Text>
              </View>
              <MaterialCommunityIcons name="plus-circle" size={22} color={theme.accent} />
            </TouchableOpacity>
          ))}
        </>
      )}

      {conditions.length === 0 && available.length === 0 && (
        <View style={s.empty}>
          <MaterialCommunityIcons name="heart-pulse" size={36} color={theme.muted} />
          <Text style={s.emptyText}>
            FloofLife doesn't have condition guides for {speciesLabel}s yet — they're on the way. In the meantime, the Floof Assistant can talk through anything specific to {pet.name}.
          </Text>
        </View>
      )}

      <View style={s.disclaimer}>
        <Text style={s.disclaimerText}>
          Condition guides are supportive information, not veterinary advice, a diagnosis, or a treatment plan. Your vet knows {pet.name}'s situation — follow their guidance, and call them whenever something feels off.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  intro:            { padding: 14, borderRadius: 12, backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accent + "55" },
  introTitle:       { fontSize: 16, fontWeight: "800", color: theme.accent, letterSpacing: -0.3 },
  introBody:        { fontSize: 13, color: theme.fg, marginTop: 6, lineHeight: 18 },
  sectionHd:        { marginTop: 22, marginBottom: 8, fontSize: 11, fontWeight: "800", color: theme.muted, letterSpacing: 1.2 },
  condCard:         { backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.line, marginBottom: 10, overflow: "hidden" },
  condHeader:       { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  condEmoji:        { fontSize: 24 },
  condTitle:        { fontSize: 15, fontWeight: "800", color: theme.fg, letterSpacing: -0.2 },
  condOneLiner:     { fontSize: 12, color: theme.muted, marginTop: 3, lineHeight: 16 },
  guideBody:        { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: theme.line },
  guideSection:     { marginTop: 14 },
  guideSectionTitle:{ fontSize: 13, fontWeight: "800", color: theme.accent, letterSpacing: 0.2, marginBottom: 6 },
  para:             { fontSize: 13, color: theme.fg, lineHeight: 19 },
  bulletRow:        { flexDirection: "row", gap: 8, marginTop: 3 },
  bulletDot:        { fontSize: 13, color: theme.accent, fontWeight: "800", lineHeight: 19 },
  bulletText:       { flex: 1, fontSize: 13, color: theme.fg, lineHeight: 19 },
  removeBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 18, paddingVertical: 8 },
  removeBtnText:    { fontSize: 12, color: theme.muted, fontWeight: "600" },
  addCard:          { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line, marginBottom: 10 },
  addTitle:         { fontSize: 14, fontWeight: "700", color: theme.fg },
  addOneLiner:      { fontSize: 12, color: theme.muted, marginTop: 3, lineHeight: 16 },
  empty:            { alignItems: "center", padding: 28, marginTop: 16, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line },
  emptyText:        { fontSize: 13, color: theme.muted, textAlign: "center", marginTop: 12, lineHeight: 19 },
  disclaimer:       { marginTop: 22, padding: 14, borderRadius: 10, backgroundColor: theme.accentSoft },
  disclaimerText:   { fontSize: 11, color: theme.fg, lineHeight: 17 },
});
