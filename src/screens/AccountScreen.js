// Account screen — sign in / sign up / signed-in state for the v2.0
// cloud-sync feature. Per docs/features/accounts-and-migration.md
// accounts are a SOFT prompt: the app works fully without one, and
// this screen renders a "not yet configured" message if the Supabase
// env vars are unset (so internal/dev builds don't crash).
//
// Auth methods (per Max's 2026-05-19 decision):
//   - Sign in with Apple — primary on iOS (App Store 4.8)
//   - Email + password — fallback for users who refuse Apple ID
//
// Signed-in state shows:
//   - Email / display name
//   - "Back up my floofs" button → kicks off the cloud-sync migration
//   - Sign out
//   - Delete account (double-confirm, calls account-delete Edge Function)

import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Platform, StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import { useAuth } from "../lib/auth";
import { tapLight, tapMedium, tapHeavy } from "../lib/haptics";
import { track } from "../lib/analytics";
import { theme } from "../theme";

export default function AccountScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const {
    user, loading, configured,
    signInWithApple, signInWithEmail, signUpWithEmail, signOut, deleteAccount,
  } = useAuth();

  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [working, setWorking] = useState(false);

  if (!configured) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, padding: 20, paddingTop: 40 }}>
        <Text style={s.h1}>Accounts coming soon</Text>
        <Text style={[s.body, { marginTop: 12 }]}>
          Cloud backup for your floofs isn't switched on in this build yet.
          Your data is safe right where it is — on this device.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  // ─── Signed in ──────────────────────────────────────────────────
  if (user) {
    return (
      <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 60 }}>
        <Text style={s.h1}>Your account</Text>
        <View style={s.card}>
          <Text style={s.label}>Signed in as</Text>
          <Text style={s.value}>{user.email || user.user_metadata?.email || "(no email on file)"}</Text>
        </View>

        <Text style={s.sectionHd}>CLOUD BACKUP</Text>
        <TouchableOpacity
          onPress={() => { tapMedium(); navigation.navigate("CloudSyncStatus"); }}
          style={[s.card, { borderColor: theme.accent }]}
        >
          <Text style={[s.body, { fontWeight: "700", color: theme.accent }]}>Back up my floofs</Text>
          <Text style={[s.sub, { marginTop: 4 }]}>
            Save a private cloud backup of your pets, photos, and logs. Your
            local copy always stays on this device. Multi-device restore is
            coming soon.
          </Text>
        </TouchableOpacity>

        <Text style={s.sectionHd}>ACCOUNT</Text>
        <TouchableOpacity
          style={s.row}
          onPress={async () => {
            tapLight();
            await signOut();
            track("auth_signout_tapped");
          }}
        >
          <Text style={s.rowLabel}>Sign out</Text>
        </TouchableOpacity>

        <Text style={s.sectionHd}>DANGER ZONE</Text>
        <TouchableOpacity
          onPress={() => confirmDelete(deleteAccount)}
          style={[s.card, { borderColor: theme.red }]}
        >
          <Text style={[s.body, { color: theme.red, fontWeight: "700" }]}>Delete account</Text>
          <Text style={[s.sub, { marginTop: 4 }]}>
            Removes your cloud copy and signs you out. Your local data on this
            device is kept (you can keep using the app offline).
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ─── Signed out ─────────────────────────────────────────────────
  async function handleApple() {
    setWorking(true);
    tapMedium();
    const { error, data } = await signInWithApple();
    setWorking(false);
    if (error) {
      if (!error.cancelled) {
        Alert.alert("Couldn't sign in", error.message || "Try again.");
      }
      return;
    }
    track("auth_apple_success", { created: !!data?.user?.created_at });
    tapLight();
  }

  async function handleEmail() {
    if (!email || !password) {
      Alert.alert("Missing info", "Enter an email and password.");
      return;
    }
    setWorking(true);
    tapMedium();
    const fn = mode === "signup" ? signUpWithEmail : signInWithEmail;
    const { error, data } = await fn(email.trim(), password);
    setWorking(false);
    if (error) {
      Alert.alert(mode === "signup" ? "Couldn't sign up" : "Couldn't sign in", error.message || "Try again.");
      return;
    }
    if (mode === "signup" && !data?.session) {
      Alert.alert(
        "Check your email",
        "We sent you a confirmation link. Tap it, then come back here to sign in.",
      );
    }
    tapLight();
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 60 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.h1}>{mode === "signup" ? "Make a FloofLife account" : "Sign in"}</Text>
      <Text style={[s.body, { marginTop: 6, color: theme.muted }]}>
        Save a private cloud backup of your floofs. Your data stays on this
        device too — never deleted by signing in.
      </Text>

      {Platform.OS === "ios" && AppleAuthentication.AppleAuthenticationButton ? (
        <View style={{ marginTop: 18 }}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={
              mode === "signup"
                ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
            }
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={10}
            style={{ width: "100%", height: 48 }}
            onPress={handleApple}
          />
        </View>
      ) : null}

      <View style={s.divider}>
        <View style={s.dividerLine} />
        <Text style={s.dividerText}>or with email</Text>
        <View style={s.dividerLine} />
      </View>

      <TextInput
        style={s.input}
        placeholder="Email"
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={!working}
      />
      <TextInput
        style={s.input}
        placeholder="Password"
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        secureTextEntry
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        value={password}
        onChangeText={setPassword}
        editable={!working}
      />

      <TouchableOpacity
        style={[s.primaryBtn, working && { opacity: 0.5 }]}
        onPress={handleEmail}
        disabled={working}
      >
        {working
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.primaryBtnText}>{mode === "signup" ? "Create account" : "Sign in"}</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        style={{ marginTop: 12, alignItems: "center" }}
        onPress={() => { tapLight(); setMode(mode === "signup" ? "signin" : "signup"); }}
      >
        <Text style={{ color: theme.accent, fontWeight: "600" }}>
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </Text>
      </TouchableOpacity>

      <Text style={[s.sub, { textAlign: "center", marginTop: 18 }]}>
        You can use FloofLife without an account — just close this screen.
      </Text>
    </ScrollView>
  );
}

function confirmDelete(deleteAccount) {
  Alert.alert(
    "Delete your account?",
    "This removes your cloud copy of pets, photos, and logs. Your local copy on this device stays.\n\nThis can't be undone.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Continue",
        style: "destructive",
        onPress: () => Alert.alert(
          "Are you sure?",
          "Tap Delete to permanently remove the cloud copy of your account.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: async () => {
                tapHeavy();
                const { error } = await deleteAccount();
                if (error) {
                  Alert.alert("Couldn't delete", error.message || "Try again — or contact support.");
                  return;
                }
                Alert.alert("Account deleted", "Your local floofs are still here on this device.");
              },
            },
          ],
        ),
      },
    ],
  );
}

const s = StyleSheet.create({
  h1:           { fontSize: 26, fontWeight: "800", color: theme.fg, letterSpacing: -0.4 },
  label:        { fontSize: 11, fontWeight: "700", color: theme.muted, letterSpacing: 1.2 },
  value:        { fontSize: 16, color: theme.fg, marginTop: 4, fontWeight: "600" },
  body:         { fontSize: 14, color: theme.fg, lineHeight: 20 },
  sub:          { fontSize: 13, color: theme.muted, lineHeight: 18 },
  card:         { padding: 14, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.line, marginTop: 12 },
  sectionHd:    { marginTop: 22, marginBottom: 8, fontSize: 11, fontWeight: "700", color: theme.muted, letterSpacing: 1.2 },
  row:          { flexDirection: "row", justifyContent: "space-between", padding: 14, backgroundColor: theme.card, borderRadius: 10, borderWidth: 1, borderColor: theme.line, marginBottom: 6, alignItems: "center" },
  rowLabel:     { flex: 1, fontSize: 14, color: theme.fg },
  divider:      { flexDirection: "row", alignItems: "center", marginTop: 22, marginBottom: 14 },
  dividerLine:  { flex: 1, height: 1, backgroundColor: theme.line },
  dividerText:  { fontSize: 11, color: theme.muted, marginHorizontal: 10, letterSpacing: 1, fontWeight: "700" },
  input:        { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: theme.fg, marginBottom: 10 },
  primaryBtn:   { backgroundColor: theme.accent, paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 6 },
  primaryBtnText:{ color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 0.2 },
});
