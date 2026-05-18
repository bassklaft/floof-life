// WeeklyFocusCard — the freshness header on the checklist. Shows this
// week's rotated theme ("this week's focus") and a "did you know"
// tip. Purely presentational; the deterministic rotation lives in
// lib/weeklyFreshness.js and the copy in data/weeklyContent.js.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme } from "../theme";

export default function WeeklyFocusCard({ content }) {
  if (!content) return null;
  const { theme: focus, tip } = content;
  if (!focus && !tip) return null;

  return (
    <View style={s.card}>
      {focus && (
        <>
          <Text style={s.eyebrow}>THIS WEEK'S FOCUS</Text>
          <Text style={s.title}>{focus.title}</Text>
          {!!focus.blurb && <Text style={s.blurb}>{focus.blurb}</Text>}
        </>
      )}

      {focus && tip && <View style={s.divider} />}

      {tip && (
        <>
          <Text style={[s.eyebrow, s.eyebrowMuted]}>DID YOU KNOW</Text>
          <Text style={s.tipTitle}>{tip.title}</Text>
          {!!tip.body && <Text style={s.tipBody}>{tip.body}</Text>}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.accent + "44",
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.accent,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  eyebrowMuted: { color: theme.muted },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.fg,
    letterSpacing: -0.2,
  },
  blurb: {
    fontSize: 13,
    color: theme.fg,
    lineHeight: 19,
    marginTop: 5,
  },
  divider: {
    height: 1,
    backgroundColor: theme.line,
    marginVertical: 14,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.fg,
    lineHeight: 19,
  },
  tipBody: {
    fontSize: 13,
    color: theme.muted,
    lineHeight: 19,
    marginTop: 4,
  },
});
