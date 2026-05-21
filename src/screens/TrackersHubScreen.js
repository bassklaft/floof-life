// Floof Trackers hub — one entry point for the three per-pet trackers
// (Health, Tummy, Mood), shown as large labeled circular "bubbles"
// (Apple-Watch-cluster vibe, but labeled). Replaces the three separate
// Home Quick Access cards.
//
// Tummy now also contains the old Diet & Care reference content (see
// TummyTrackerScreen) — folded in per the v1.3 consolidation.

import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pet } from "../lib/storage";
import { useActivePet } from "../lib/activePet";
import { tapMedium } from "../lib/haptics";
import { theme } from "../theme";

const { width } = Dimensions.get("window");
// Two bubbles per row with comfortable gutters; the 3rd centers below.
const BUBBLE = Math.min(150, Math.round((width - 20 * 2 - 24) / 2));

function Bubble({ icon, label, sub, tint, onPress }) {
  return (
    <TouchableOpacity style={styles.bubbleWrap} onPress={() => { tapMedium(); onPress(); }} activeOpacity={0.8}>
      <View style={[styles.bubble, { width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2, backgroundColor: tint + "22", borderColor: tint + "55" }]}>
        <MaterialCommunityIcons name={icon} size={Math.round(BUBBLE * 0.42)} color={tint} />
      </View>
      <Text style={styles.bubbleLabel}>{label}</Text>
      {sub ? <Text style={styles.bubbleSub} numberOfLines={2}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

export default function TrackersHubScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [pet, setPet] = useState(null);
  const { petId: activePetId } = useActivePet();
  useEffect(() => { Pet.get().then(setPet); }, [activePetId]);

  const petId = pet?.id;
  const name = pet?.name || "your floof";

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
      <Text style={styles.h1}>Floof Trackers</Text>
      <Text style={styles.intro}>Everything you log about {name}, in one place. Tap a tracker.</Text>

      <View style={styles.grid}>
        <Bubble
          icon="clipboard-pulse-outline"
          label="Health"
          sub="Vaccines, preventatives, records"
          tint={theme.green}
          onPress={() => navigation.navigate("HealthTracker", { petId })}
        />
        <Bubble
          icon="stomach"
          label="Tummy"
          sub="Poops, meals, diet & care, recalls"
          tint="#7A4F0A"
          onPress={() => navigation.navigate("TummyTracker", { petId })}
        />
      </View>
      <View style={[styles.grid, styles.gridLast]}>
        <Bubble
          icon="emoticon-outline"
          label="Mood"
          sub="How they're feeling, over time"
          tint={theme.yellow}
          onPress={() => navigation.navigate("MoodTracker", { petId })}
        />
      </View>

      <View style={styles.note}>
        <Text style={styles.noteText}>
          Patterns across these trackers give you — and your vet — more to work
          with. Trackers are not a substitute for veterinary care.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1:        { fontSize: 26, fontWeight: "800", color: theme.fg, letterSpacing: -0.4 },
  intro:     { fontSize: 14, color: theme.muted, lineHeight: 20, marginTop: 6, marginBottom: 18 },
  grid:      { flexDirection: "row", justifyContent: "center", gap: 24, marginBottom: 22 },
  gridLast:  { marginBottom: 8 },
  bubbleWrap:{ alignItems: "center", width: BUBBLE },
  bubble:    { alignItems: "center", justifyContent: "center", borderWidth: 1.5, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  bubbleLabel:{ fontSize: 16, fontWeight: "800", color: theme.fg, marginTop: 10 },
  bubbleSub: { fontSize: 11, color: theme.muted, textAlign: "center", marginTop: 2, lineHeight: 15 },
  note:      { marginTop: 18, padding: 14, borderRadius: 10, backgroundColor: theme.accentSoft },
  noteText:  { fontSize: 11, color: theme.fg, lineHeight: 17 },
});
