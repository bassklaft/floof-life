// Account soft-prompt modal (v1.3).
//
// OPT-IN, benefit-led, fires only AFTER a value moment — never on first
// launch or app open. The trigger logic lives in src/lib/accountPrompt.js
// (value moments: first Tummy entry, a completed Pawgress ring, a 2nd
// pet, or the 3rd session — whichever first). This component just
// listens for those moments and, when the frequency contract allows
// (min 7 days between shows, max 3 lifetime), presents the modal.
//
// Copy is warm and uses the active pet's name. "Maybe later" is a
// guilt-free dismissal; the cooldown does the rest. Stays dormant if
// Supabase isn't configured or the user is already signed in.

import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../lib/auth";
import {
  onValueMoment, hasValueMomentFired, shouldPromptNow, markPrompted, markDone,
} from "../lib/accountPrompt";
import { Pet } from "../lib/storage";
import { tapLight, tapMedium } from "../lib/haptics";
import { track } from "../lib/analytics";
import { theme } from "../theme";

export default function AccountSoftPrompt({ onboarded, navRef }) {
  const { user, configured, loading } = useAuth();
  const [visible, setVisible] = useState(false);
  const [petName, setPetName] = useState("");
  const shownThisProcess = useRef(false);

  // Once the user is signed in, never prompt again.
  useEffect(() => {
    if (user) { markDone(); }
  }, [user]);

  useEffect(() => {
    if (!onboarded || loading || !configured || user) return;

    let cancelled = false;

    async function maybeShow() {
      if (cancelled || shownThisProcess.current) return;
      if (!(await shouldPromptNow())) return;
      // Resolve the active pet's name for the copy. Fall back to a warm
      // generic if there's somehow no pet.
      let name = "your floof";
      try {
        const pet = await Pet.get();
        if (pet?.name) name = pet.name;
      } catch { /* keep fallback */ }
      if (cancelled) return;
      shownThisProcess.current = true;
      setPetName(name);
      setVisible(true);
      await markPrompted();
      track("account_soft_prompt_shown");
    }

    // If a value moment already fired earlier this process (e.g. the
    // session-3 trigger during boot), evaluate immediately.
    if (hasValueMomentFired()) {
      // Small delay so the triggering screen settles before the modal.
      const t = setTimeout(maybeShow, 600);
      return () => { cancelled = true; clearTimeout(t); };
    }

    // Otherwise wait for the next value moment.
    const unsub = onValueMoment(() => { setTimeout(maybeShow, 600); });
    return () => { cancelled = true; unsub(); };
  }, [onboarded, loading, configured, user]);

  function dismissMaybeLater() {
    tapLight();
    setVisible(false);
    track("account_soft_prompt_dismissed", { action: "maybe_later" });
    // markPrompted already stamped the time + counter when we showed it,
    // so the 7-day cooldown / 3-lifetime cap are already in force.
  }

  function tapCreate() {
    tapMedium();
    setVisible(false);
    track("account_soft_prompt_accepted");
    navRef?.current?.navigate?.("Account");
  }

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismissMaybeLater}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.emoji}>🐾</Text>
          <Text style={s.h1}>Back up {petName}'s data</Text>
          <Text style={s.body}>
            Create a free account to save a private cloud backup of {petName}'s
            health records and photos. Multi-device restore is coming soon.
          </Text>

          <TouchableOpacity style={s.primary} onPress={tapCreate}>
            <Text style={s.primaryText}>Create account</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.secondary} onPress={dismissMaybeLater}>
            <Text style={s.secondaryText}>Maybe later</Text>
          </TouchableOpacity>

          <Text style={s.fineprint}>
            Your floofs stay on this device either way.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop:    { flex: 1, backgroundColor: "rgba(20,14,9,0.55)", justifyContent: "center", padding: 24 },
  card:        { backgroundColor: theme.bg, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: theme.line, alignItems: "center" },
  emoji:       { fontSize: 40, marginBottom: 6 },
  h1:          { fontSize: 22, fontWeight: "800", color: theme.fg, letterSpacing: -0.3, textAlign: "center" },
  body:        { fontSize: 15, color: theme.fg, lineHeight: 22, marginTop: 12, textAlign: "center" },
  primary:     { backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 22, alignSelf: "stretch" },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  secondary:   { paddingVertical: 12, alignItems: "center", marginTop: 4, alignSelf: "stretch" },
  secondaryText:{ color: theme.muted, fontWeight: "600", fontSize: 15 },
  fineprint:   { fontSize: 12, color: theme.muted, marginTop: 8, textAlign: "center" },
});
