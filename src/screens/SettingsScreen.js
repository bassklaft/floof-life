import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, Linking, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Application from "expo-application";
import { Pet, Pets } from "../lib/storage";
import { useActivePet } from "../lib/activePet";
import { usePurchases } from "../lib/purchasesContext";
import { useAuth } from "../lib/auth";
import { getDeviceId } from "../lib/founderOverride";
import { track, resetAnalytics } from "../lib/analytics";
import { tapLight, tapHeavy } from "../lib/haptics";
import { theme } from "../theme";

const FEEDBACK_EMAIL = "streetparkinfo@gmail.com";
const PRIVACY_URL = "https://bassklaft.github.io/floof-life/legal/privacy-policy.html";
const TERMS_URL = "https://bassklaft.github.io/floof-life/legal/terms-of-service.html";

const titleCase = s => s.split(" ").map(w => w[0]?.toUpperCase() + w.slice(1)).join(" ");

export default function SettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [pet, setPet] = useState(null);
  const [petCount, setPetCount] = useState(0);
  const [deviceId, setDeviceId] = useState("");
  const { isPremium, isFounderDevice } = usePurchases();
  const { user: authUser, configured: authConfigured } = useAuth();

  // Reactive active-pet — re-fetch when user switches floofs.
  const { petId: activePetId } = useActivePet();
  useEffect(() => { Pet.get().then(setPet); }, [activePetId]);
  useEffect(() => { Pets.list().then(arr => setPetCount(arr.length)); }, [activePetId]);
  useEffect(() => { getDeviceId().then(setDeviceId); }, []);

  // Compose a mailto: link with diagnostic context (app version, OS,
  // pet count). No pet names, photos, or other identifying data — see
  // the Privacy Policy. Falls back to a copy-the-address Alert if the
  // device has no configured mail client.
  async function sendFeedback() {
    track("send_feedback_tapped", { pet_count: petCount });
    tapLight();
    const version = Application.nativeApplicationVersion || "unknown";
    const build = Application.nativeBuildVersion || "?";
    const os = `${Platform.OS} ${Platform.Version}`;
    const body = [
      "What's working well?",
      "",
      "",
      "What's not working?",
      "",
      "",
      "What features would you want next?",
      "",
      "",
      "---",
      `App version: ${version} (${build})`,
      `OS: ${os}`,
      `Pet count: ${petCount}`,
    ].join("\n");
    const url = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("FloofLife Feedback")}&body=${encodeURIComponent(body)}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return;
      }
    } catch { /* fall through to alert */ }
    Alert.alert(
      "No mail app found",
      `Email us at ${FEEDBACK_EMAIL}`,
      [{ text: "OK" }],
    );
  }

  function showDeviceId() {
    Alert.alert(
      isFounderDevice ? "Device ID (founder override active)" : "Device ID",
      (deviceId || "(unavailable)") +
        (isFounderDevice
          ? "\n\n✅ This device is on the founder list — Premium is unlocked locally."
          : "\n\nCopy and send to Max to add this device to the founder list."),
      [{ text: "OK" }],
    );
  }

  if (!pet) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  function openMultiPet() {
    if (!isPremium) {
      navigation.navigate("Premium");
      return;
    }
    navigation.navigate("AddPet");
  }

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 60 }}>
      {/* Prominent top-of-screen vet disclaimer — liability-protective
          but framed warmly. Visible without scrolling on every Settings
          visit, distinct from the small bottom-of-screen reminder. */}
      <View style={s.vetDisclaimer}>
        <Text style={s.vetDisclaimerHd}>FloofLife is not a substitute for your vet.</Text>
        <Text style={s.vetDisclaimerBody}>
          We're here to help you keep track of your floof's health and give you and your vet more to work with — patterns, logs, dates — so the conversations you have with your vet are richer. For any medical concern, your vet comes first.
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.h2}>{pet.name}</Text>
        <Text style={s.sub}>{titleCase(pet.breed || "")} {pet.species} · {pet.ageYears} yr{pet.weightLbs ? ` · ${pet.weightLbs} lb` : ""}</Text>
      </View>

      <Text style={s.sectionHd}>SUBSCRIPTION</Text>
      {isPremium ? (
        <TouchableOpacity onPress={() => navigation.navigate("Premium")} style={[s.card, { borderColor: theme.accent }]}>
          <Text style={[s.body, { fontWeight: "700", color: theme.accent }]}>⭐ Premium active</Text>
          <Text style={[s.sub, { marginTop: 4 }]}>Tap to view details or restore on another device.</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => navigation.navigate("Premium")} style={[s.card, { borderColor: theme.accent }]}>
          <Text style={[s.body, { fontWeight: "700", color: theme.accent }]}>⭐ Upgrade to Premium</Text>
          <Text style={[s.sub, { marginTop: 4 }]}>$4.99/mo or $39/yr — multi-floof, expanded breed depth, health & care tracking.</Text>
        </TouchableOpacity>
      )}

      <Text style={s.sectionHd}>FEATURES</Text>
      <TouchableOpacity onPress={openMultiPet} style={s.row}>
        <Text style={s.rowLabel}>Multi-floof support</Text>
        {isPremium ? (
          <Text style={{ color: theme.muted }}>›</Text>
        ) : (
          <View style={s.premiumBadge}>
            <Text style={s.premiumBadgeText}>PREMIUM</Text>
          </View>
        )}
      </TouchableOpacity>

      {authConfigured && (
        <>
          <Text style={s.sectionHd}>ACCOUNT</Text>
          <TouchableOpacity
            style={s.row}
            onPress={() => { tapLight(); navigation.navigate("Account"); }}
          >
            <MaterialCommunityIcons name="account-circle-outline" size={18} color={theme.muted} />
            <Text style={s.rowLabel}>{authUser ? "Your account" : "Sign in or create account"}</Text>
            <Text style={[s.sub, { textTransform: "none", maxWidth: 160 }]} numberOfLines={1} ellipsizeMode="middle">
              {authUser?.email || "Back up your floofs"}
            </Text>
            <Text style={{ color: theme.muted }}>›</Text>
          </TouchableOpacity>
        </>
      )}

      <Text style={s.sectionHd}>YOUR DATA</Text>
      <Row label="Export Floof data" icon="share-variant" onPress={() => { tapLight(); navigation.navigate("ExportFloofData"); }} />

      <Text style={s.sectionHd}>FLOOFLIFE</Text>
      <Row label="Story · About this app" onPress={() => navigation.navigate("About")} />
      <Row label="Send Feedback" icon="message-text-outline" onPress={sendFeedback} />

      {isFounderDevice && (
        <>
          <Text style={s.sectionHd}>DEBUG</Text>
          <TouchableOpacity onPress={showDeviceId} style={s.row}>
            <Text style={s.rowLabel}>My Device ID</Text>
            <Text style={[s.sub, { textTransform: "none", maxWidth: 180 }]} numberOfLines={1} ellipsizeMode="middle">
              {deviceId || "—"}
            </Text>
          </TouchableOpacity>
        </>
      )}

      <Text style={s.sectionHd}>HELP</Text>
      <Row label="Contact support"   onPress={() => Linking.openURL("mailto:hello@stickaround.app")} />
      <Row label="Privacy policy"    onPress={() => Linking.openURL(PRIVACY_URL)} />
      <Row label="Terms of service"  onPress={() => Linking.openURL(TERMS_URL)} />

      <Text style={s.sectionHd}>DANGER ZONE</Text>
      <TouchableOpacity onPress={() => Alert.alert("Reset FloofLife?", "This deletes your pet profile and all checklist data. Cannot be undone.", [
        { text: "Cancel" },
        { text: "Delete", style: "destructive", onPress: async () => { track("reset_all_data_confirmed"); tapHeavy(); await Pet.clear(); resetAnalytics(); Alert.alert("Done", "Restart the app."); } },
      ])} style={[s.card, { borderColor: theme.red }]}>
        <Text style={[s.body, { color: theme.red, fontWeight: "700" }]}>Reset all data</Text>
      </TouchableOpacity>

      <View style={s.disclaimer}>
        <Text style={s.disclaimerText}>FloofLife provides general guidance for healthy pets. It is not a substitute for veterinary advice. Always consult your vet for medical questions.</Text>
      </View>
    </ScrollView>
  );
}

function Row({ label, onPress, icon }) {
  return (
    <TouchableOpacity onPress={onPress} style={s.row}>
      {icon && <MaterialCommunityIcons name={icon} size={18} color={theme.muted} />}
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={{ color: theme.muted }}>›</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  h2:           { fontSize: 22, fontWeight: "700", color: theme.fg },
  sub:          { fontSize: 13, color: theme.muted, marginTop: 4, textTransform: "capitalize" },
  body:         { fontSize: 14, color: theme.fg, lineHeight: 20 },
  card:         { padding: 14, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.line, marginBottom: 8 },
  sectionHd:    { marginTop: 18, marginBottom: 8, fontSize: 11, fontWeight: "700", color: theme.muted, letterSpacing: 1.2 },
  row:          { flexDirection: "row", justifyContent: "space-between", padding: 14, backgroundColor: theme.card, borderRadius: 10, borderWidth: 1, borderColor: theme.line, marginBottom: 6, alignItems: "center", gap: 12 },
  rowLabel:     { flex: 1, fontSize: 14, color: theme.fg },
  disclaimer:   { marginTop: 24, padding: 14, borderRadius: 10, backgroundColor: theme.accentSoft },
  disclaimerText:{ fontSize: 11, color: theme.fg, lineHeight: 17 },
  vetDisclaimer:    { padding: 14, marginBottom: 14, borderRadius: 12, backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accent + "55" },
  vetDisclaimerHd:  { fontSize: 14, fontWeight: "800", color: theme.accent, letterSpacing: -0.2, marginBottom: 6 },
  vetDisclaimerBody:{ fontSize: 12, color: theme.fg, lineHeight: 18 },
  premiumBadge: { flexShrink: 0, backgroundColor: theme.accent, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  premiumBadgeText:{ color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
});
