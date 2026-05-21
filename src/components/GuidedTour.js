// GuidedTour — replaces the prior FirstRunTutorial. Multi-step
// onboarding tour with VISUAL pointers: spotlight ring around the
// target tab + curved arrow from the tooltip card down to the
// spotlight + brand-paw mascot. Steps that don't have a target tab
// (welcome, sign-off) center the card with no arrow.
//
// Storage flag: pawrent_tutorial_seen_v2. Bumped from v1 so existing
// users who already dismissed v1 see this fresh after the v1.2.0
// update — they get walked through the new lifestyle questionnaire
// + multi-pet card-stack + Pawgress mechanics.
import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Platform,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Path, Polygon, Circle } from "react-native-svg";
import { theme } from "../theme";
import { tapMedium, tapLight } from "../lib/haptics";

// Tour steps. `targetTab` is the index of the tab to highlight
// (0 = Pawgress, 1 = Home, 2 = My Floofs) — null means no arrow,
// just a centered welcome / sign-off card.
const STEPS = [
  {
    targetTab: null,
    eyebrow: "WELCOME TO FLOOFLIFE",
    title: "Quick tour, then you're in",
    body: "A 60-second walkthrough so you know where everything lives. Skip anytime.",
  },
  {
    targetTab: 0,
    eyebrow: "🐾  PAWGRESS",
    title: "Daily care, one paw print at a time",
    body: "Tap the pawprint here to fill today's 5 care segments — food, movement, body check, mind, and a rotating bonus. Streaks build for the consistent.",
  },
  {
    targetTab: 1,
    eyebrow: "🏠  HOME",
    title: "Every tool you need, one tap each",
    body: "Floof Trackers (Health, Tummy & Mood), Training, Risk Map, Trip Planner, Vets Near Me, Recalls, Age Calculator — plus Emergency and Toxic Foods. All here.",
  },
  {
    targetTab: null,
    eyebrow: "💬  FLOOF ASSISTANT",
    title: "A pet-smart chat, always one tap away",
    body: "See the chat button floating on the right edge of every screen? Tap it anytime to ask about your floof — mood, tummy, breed, training. It remembers your conversation and knows what you've logged. (It's a knowledgeable companion, not a vet.)",
  },
  {
    targetTab: 2,
    eyebrow: "🐶  MY FLOOFS",
    title: "Tap to edit · long-press for the floof fan",
    body:
      "Tap to see each pet's profile, photos, breed insights, and lifestyle questionnaire. Long-press the pawprint here to fan out all your floofs and slide-select the active one.",
  },
  {
    targetTab: 2,
    eyebrow: "📋  TELL US ABOUT YOUR FLOOF",
    title: "Lifestyle questionnaire — find it on each pet's card",
    body:
      "12 quick questions about activity, food, tummy, vet visits, and health. Lives on each floof's card on the My Floofs tab. Skippable — answer what you want, come back later for the rest.",
  },
  {
    targetTab: null,
    eyebrow: "🚨  EMERGENCY",
    title: "Always easy to find",
    body: "Red Emergency card on Home — poison-control hotlines, ER vet finder, pet first-aid course. The one tap you hope you never need.",
  },
  {
    targetTab: null,
    eyebrow: "ALL SET",
    title: "You're ready",
    body: "FloofLife guidance is not a substitute for veterinary advice. When something feels wrong, call your vet.",
  },
];

const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 86 : 64;
const SPOTLIGHT_RADIUS = 38;

export default function GuidedTour({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = Dimensions.get("window");
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (visible) setStepIdx(0);
  }, [visible]);

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  function next() {
    tapLight();
    if (isLast) {
      tapMedium();
      onClose?.();
    } else {
      setStepIdx(stepIdx + 1);
    }
  }
  function back() {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  }
  function skip() {
    tapLight();
    onClose?.();
  }

  // Tab center coordinates. The tab bar is at the bottom of the
  // window, divided into 3 equal-width tabs.
  const tabBarY = screenH - insets.bottom - TAB_BAR_HEIGHT;
  const tabCenters = [
    { x: screenW * (1 / 6), y: tabBarY + TAB_BAR_HEIGHT / 2 - 6 },
    { x: screenW * (3 / 6), y: tabBarY + TAB_BAR_HEIGHT / 2 - 6 },
    { x: screenW * (5 / 6), y: tabBarY + TAB_BAR_HEIGHT / 2 - 6 },
  ];

  const target = step.targetTab != null ? tabCenters[step.targetTab] : null;

  // Tooltip card sits in the upper-middle of the screen; arrow
  // curves from the bottom-center of the card down to the
  // spotlight on the tab.
  const cardTop = insets.top + 80;
  const cardBottomEstimate = cardTop + 230; // approximate card height for arrow start
  const cardCenterX = screenW / 2;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.scrim}>
        {/* Spotlight ring around the target tab */}
        {target && (
          <View
            pointerEvents="none"
            style={[
              styles.spotlight,
              {
                left: target.x - SPOTLIGHT_RADIUS,
                top: target.y - SPOTLIGHT_RADIUS,
                width: SPOTLIGHT_RADIUS * 2,
                height: SPOTLIGHT_RADIUS * 2,
                borderRadius: SPOTLIGHT_RADIUS,
              },
            ]}
          />
        )}

        {/* Curved arrow from card to spotlight */}
        {target && (
          <Svg
            pointerEvents="none"
            width={screenW}
            height={screenH}
            style={StyleSheet.absoluteFill}
          >
            <Path
              d={curvePath(
                cardCenterX,
                cardBottomEstimate,
                target.x,
                target.y - SPOTLIGHT_RADIUS - 4,
              )}
              stroke="#fff"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeDasharray="2 7"
              fill="none"
            />
            <ArrowHead
              x={target.x}
              y={target.y - SPOTLIGHT_RADIUS - 6}
              angle={arrowAngle(cardCenterX, cardBottomEstimate, target.x, target.y - SPOTLIGHT_RADIUS - 4)}
            />
          </Svg>
        )}

        {/* Tooltip card */}
        <View
          style={[
            styles.card,
            target ? { top: cardTop } : { top: screenH * 0.32 },
          ]}
        >
          <View style={styles.iconCircle}>
            <Text style={{ fontSize: 30 }}>🐾</Text>
          </View>
          <Text style={styles.eyebrow}>{step.eyebrow}</Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>

          {/* Step dots */}
          <View style={styles.dotsRow}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === stepIdx && styles.dotActive,
                  i < stepIdx && styles.dotPast,
                ]}
              />
            ))}
          </View>

          <View style={styles.btnRow}>
            {stepIdx > 0 ? (
              <TouchableOpacity onPress={back} style={styles.btnSecondary} activeOpacity={0.7}>
                <Text style={styles.btnSecondaryText}>Back</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={skip} style={styles.btnSecondary} activeOpacity={0.7}>
                <Text style={styles.btnSecondaryText}>Skip tour</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={next} style={styles.btnPrimary} activeOpacity={0.85}>
              <Text style={styles.btnPrimaryText}>{isLast ? "Got it — let's go" : "Next"}</Text>
              <MaterialCommunityIcons
                name={isLast ? "check" : "arrow-right"}
                size={16}
                color="#fff"
                style={{ marginLeft: 4 }}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Curved-line SVG path from (x0, y0) to (x1, y1) using a quadratic
// bezier with the control point pulled to the side so the arrow
// arcs gently rather than going straight.
function curvePath(x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  // Control point: midpoint between start and end, offset
  // perpendicularly so the arrow curves outward. Curve direction
  // depends on which side of center the target is on.
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;
  // Perpendicular offset: 18% of the line length, biased toward
  // the target side so the arc reads as "looping toward" the goal.
  const perpScale = 0.18 * Math.sqrt(dx * dx + dy * dy);
  const ux = -dy;
  const uy = dx;
  const ulen = Math.sqrt(ux * ux + uy * uy) || 1;
  const cx = midX + (ux / ulen) * perpScale * (x1 < x0 ? -1 : 1);
  const cy = midY + (uy / ulen) * perpScale * (x1 < x0 ? -1 : 1);
  return `M ${x0} ${y0} Q ${cx} ${cy} ${x1} ${y1}`;
}

function arrowAngle(x0, y0, x1, y1) {
  // Angle of the tangent at the end of the curve (approximated as
  // the line from a point slightly before the end toward the end).
  return Math.atan2(y1 - y0, x1 - x0);
}

function ArrowHead({ x, y, angle }) {
  const size = 14;
  // Triangle pointing in the direction of `angle`, anchored at (x, y).
  const tipX = x;
  const tipY = y;
  const baseAngle1 = angle + Math.PI - 0.5;
  const baseAngle2 = angle + Math.PI + 0.5;
  const b1x = tipX + Math.cos(baseAngle1) * size;
  const b1y = tipY + Math.sin(baseAngle1) * size;
  const b2x = tipX + Math.cos(baseAngle2) * size;
  const b2y = tipY + Math.sin(baseAngle2) * size;
  return (
    <Polygon
      points={`${tipX},${tipY} ${b1x},${b1y} ${b2x},${b2y}`}
      fill="#fff"
    />
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.78)",
  },
  spotlight: {
    position: "absolute",
    borderWidth: 4,
    borderColor: "#fff",
    backgroundColor: "rgba(255,255,255,0.08)",
    shadowColor: "#fff",
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  card: {
    position: "absolute",
    left: 22,
    right: 22,
    backgroundColor: theme.card,
    borderRadius: 22,
    paddingVertical: 22,
    paddingHorizontal: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  iconCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: theme.accentSoft,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: theme.accent + "55",
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 11, fontWeight: "800", color: theme.accent,
    letterSpacing: 1.4, marginBottom: 6,
  },
  title: {
    fontSize: 19, fontWeight: "800", color: theme.fg,
    letterSpacing: -0.3, textAlign: "center", marginBottom: 8,
  },
  body: {
    fontSize: 13, color: theme.fg, lineHeight: 19,
    textAlign: "center", marginBottom: 14,
  },
  dotsRow: {
    flexDirection: "row", gap: 6, marginBottom: 16,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: theme.line,
  },
  dotActive: {
    width: 18, backgroundColor: theme.accent,
  },
  dotPast: {
    backgroundColor: theme.accent + "66",
  },
  btnRow: {
    flexDirection: "row", gap: 10, width: "100%",
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.line,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondaryText: {
    color: theme.muted, fontSize: 14, fontWeight: "600",
  },
  btnPrimary: {
    flex: 2,
    flexDirection: "row",
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimaryText: {
    color: "#fff", fontWeight: "800", fontSize: 14, letterSpacing: 0.4,
  },
});
