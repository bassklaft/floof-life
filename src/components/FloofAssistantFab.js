// Persistent Floof Assistant launcher — a small floating button pinned
// to the right edge, vertically centered, that rides along on every
// screen so the assistant is always one tap away. Hidden while the chat
// itself is open (and on onboarding / no-pet states). Stays dormant if
// the AI proxy isn't configured.
//
// Mounted once at the App root (above the navigator) and told whether
// to show via the `visible` prop, which App.js derives from the current
// route. Tapping reads the authoritative active-pet id and opens the
// chat scoped to that floof.

import React from "react";
import { TouchableOpacity, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { readActivePetId } from "../lib/activePet";
import { isConfigured } from "../lib/aiAssistant";
import { tapMedium } from "../lib/haptics";
import { track } from "../lib/analytics";
import { theme } from "../theme";

export default function FloofAssistantFab({ visible, navRef }) {
  if (!visible) return null;
  if (!isConfigured()) return null; // no AI proxy in this build → no dead button

  async function open() {
    tapMedium();
    track("assistant_fab_tapped");
    let petId = null;
    try { petId = await readActivePetId(); } catch { /* fall back to no param */ }
    navRef?.current?.navigate?.("FloofAssistant", petId ? { petId } : undefined);
  }

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <TouchableOpacity
        style={styles.fab}
        onPress={open}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Ask the Floof Assistant"
      >
        <MaterialCommunityIcons name="chat-question" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-screen passthrough layer so only the button itself is tappable.
  layer: { ...StyleSheet.absoluteFillObject, justifyContent: "center", alignItems: "flex-end" },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    shadowColor: "#7A2A14",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
});
