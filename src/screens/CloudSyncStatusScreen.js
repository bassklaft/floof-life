// Cloud sync progress UI. Runs the migration engine from
// src/lib/cloudSync.js, surfaces progress + errors, and lets the user
// kick it off again if anything failed. Per the design doc, this is a
// **dedicated screen** (not a modal) because the migration can take
// minutes on a household with many photos.
//
// Behavior on screen-leave: the iterator stops naturally on next tick.
// Re-entering re-runs from scratch — upserts are idempotent so any
// already-synced rows are no-ops.

import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { runFullMigration } from "../lib/cloudSync";
import { tapLight, tapMedium } from "../lib/haptics";
import { track } from "../lib/analytics";
import { theme } from "../theme";

export default function CloudSyncStatusScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState("idle"); // idle | running | done | error
  const [progress, setProgress] = useState({ done: 0, total: 0, label: "" });
  const [errors, setErrors] = useState([]);
  const [summary, setSummary] = useState(null);
  const cancelRef = useRef(false);

  async function run() {
    cancelRef.current = false;
    setStatus("running");
    setErrors([]);
    setSummary(null);
    track("cloud_sync_started");
    try {
      for await (const ev of runFullMigration()) {
        if (cancelRef.current) break;
        if (ev.kind === "progress") {
          setProgress(ev.payload);
        } else if (ev.kind === "error") {
          setErrors((prev) => [...prev, ev.payload]);
        } else if (ev.kind === "done") {
          setSummary(ev.payload);
        }
      }
    } catch (err) {
      setErrors((prev) => [...prev, { scope: "fatal", message: err?.message || String(err) }]);
    }
    setStatus(errors.length > 0 ? "error" : "done");
    track("cloud_sync_finished", { errors: errors.length });
  }

  useEffect(() => () => { cancelRef.current = true; }, []);

  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 60 }}>
      <Text style={s.h1}>Back up your floofs</Text>
      <Text style={s.body}>
        We'll upload your pets, photos, and logs to your account. Your local
        copy stays exactly where it is — we never delete anything from this
        device.
      </Text>

      {status === "idle" && (
        <TouchableOpacity style={s.primary} onPress={() => { tapMedium(); run(); }}>
          <Text style={s.primaryText}>Start backup</Text>
        </TouchableOpacity>
      )}

      {status === "running" && (
        <View style={s.card}>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${pct}%` }]} />
          </View>
          <Text style={s.progressLabel}>{progress.label || "Working…"}</Text>
          <Text style={s.progressSub}>
            {progress.done} of {progress.total} items · {pct}%
          </Text>
          <ActivityIndicator color={theme.accent} style={{ marginTop: 12 }} />
        </View>
      )}

      {(status === "done" || status === "error") && summary && (
        <View style={[s.card, { borderColor: errors.length === 0 ? theme.green : theme.yellow }]}>
          <Text style={[s.h2, { color: errors.length === 0 ? theme.green : theme.yellow }]}>
            {errors.length === 0 ? "Backup complete." : "Backup finished with some skips."}
          </Text>
          <Text style={s.body}>
            {summary.petCount} floof{summary.petCount === 1 ? "" : "s"} backed up.
            {errors.length > 0 ? ` ${errors.length} item${errors.length === 1 ? "" : "s"} couldn't upload — try again later.` : ""}
          </Text>
          <Text style={s.subtle}>Your local copy is unchanged.</Text>
          <TouchableOpacity style={s.secondary} onPress={() => { tapLight(); run(); }}>
            <Text style={s.secondaryText}>Run again</Text>
          </TouchableOpacity>
        </View>
      )}

      {errors.length > 0 && (
        <View style={s.errorCard}>
          <Text style={s.errorHd}>What couldn't be uploaded</Text>
          {errors.slice(0, 8).map((e, i) => (
            <Text key={i} style={s.errorItem} numberOfLines={2}>
              · {e.scope}: {e.message}
            </Text>
          ))}
          {errors.length > 8 && (
            <Text style={s.errorItem}>· …and {errors.length - 8} more</Text>
          )}
        </View>
      )}

      <TouchableOpacity style={{ marginTop: 20, alignItems: "center" }} onPress={() => { tapLight(); navigation.goBack(); }}>
        <Text style={{ color: theme.muted, fontWeight: "600" }}>Close</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  h1:           { fontSize: 26, fontWeight: "800", color: theme.fg, letterSpacing: -0.4 },
  h2:           { fontSize: 18, fontWeight: "800", marginBottom: 6 },
  body:         { fontSize: 14, color: theme.fg, lineHeight: 20, marginTop: 10 },
  subtle:       { fontSize: 12, color: theme.muted, marginTop: 8 },
  card:         { padding: 16, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.line, marginTop: 18 },
  primary:      { backgroundColor: theme.accent, paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 22 },
  primaryText:  { color: "#fff", fontWeight: "800", fontSize: 16 },
  secondary:    { paddingVertical: 12, alignItems: "center", marginTop: 10, borderWidth: 1, borderColor: theme.line, borderRadius: 10 },
  secondaryText:{ color: theme.fg, fontWeight: "700", fontSize: 14 },
  progressTrack:{ height: 10, backgroundColor: theme.accentSoft, borderRadius: 6, overflow: "hidden" },
  progressFill: { height: 10, backgroundColor: theme.accent },
  progressLabel:{ marginTop: 12, fontSize: 14, color: theme.fg, fontWeight: "600" },
  progressSub:  { marginTop: 4, fontSize: 12, color: theme.muted },
  errorCard:    { padding: 14, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.yellow, marginTop: 14 },
  errorHd:      { fontSize: 13, fontWeight: "800", color: theme.yellow, letterSpacing: 0.5, marginBottom: 8 },
  errorItem:    { fontSize: 12, color: theme.fg, lineHeight: 17, marginBottom: 2 },
});
