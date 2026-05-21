// ChurnFeedbackModal — reason checklist + free-text + optional
// contact / demographic fields, shown when a user cancels (a trial or
// a subscription) or has opened the app twice without subscribing.
//
// The form is intentionally all-optional: a churning user owes us
// nothing, and "Not now" dismisses it for good. On "Send feedback"
// the parent (ChurnFeedbackGate) POSTs to the backend; if that fails
// the modal surfaces a retry plus an "email it instead" fallback so
// the feedback is never silently lost.
//
// Submit lifecycle is owned by the parent and passed in via `status`
// ("idle" | "sending" | "error"); this component only collects fields.
import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from "react-native";
import { theme } from "../theme";
import { tapLight, tapMedium } from "../lib/haptics";
import {
  CANCEL_REASONS,
  NOSUB_REASONS,
  AGE_RANGES,
  FOUND_VIA,
  CANCEL_TITLE,
  FEEDBACK_BODY,
} from "../lib/churnFeedback";

function Chip({ label, on, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[s.chip, on && s.chipOn]}
    >
      <Text style={[s.chipText, on && s.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ChurnFeedbackModal({
  visible,
  variant,
  status,
  onSubmit,
  onEmailFallback,
  onClose,
}) {
  const isCancel = variant === "cancel";
  const reasons = isCancel ? CANCEL_REASONS : NOSUB_REASONS;

  const [picked, setPicked] = useState([]);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [foundVia, setFoundVia] = useState("");

  const sending = status === "sending";
  const errored = status === "error";

  function toggleReason(r) {
    tapLight();
    setPicked((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));
  }
  function pickOne(setter, cur, val) {
    tapLight();
    setter(cur === val ? "" : val);
  }

  function fields() {
    return { reasons: picked, message, name, email, phone, ageRange, foundVia };
  }
  function handleSubmit() {
    if (sending) return;
    tapMedium();
    onSubmit?.(fields());
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={s.scrim}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.card}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {isCancel && <Text style={s.title}>{CANCEL_TITLE}</Text>}
            <Text style={[s.body, isCancel && { marginTop: 6 }]}>{FEEDBACK_BODY}</Text>

            {/* Why — multi-select. */}
            <Text style={s.label}>Mind telling us why?</Text>
            <View style={s.chipWrap}>
              {reasons.map((r) => (
                <Chip
                  key={r}
                  label={r}
                  on={picked.includes(r)}
                  onPress={() => toggleReason(r)}
                />
              ))}
            </View>

            <TextInput
              style={s.textArea}
              value={message}
              onChangeText={setMessage}
              placeholder="Anything else you'd like to share?"
              placeholderTextColor={theme.muted}
              multiline
              textAlignVertical="top"
              editable={!sending}
            />

            {/* Contact — all optional. */}
            <Text style={s.sectionHd}>STAY IN TOUCH — OPTIONAL</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={theme.muted}
              autoCapitalize="words"
              editable={!sending}
            />
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={theme.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!sending}
            />
            <TextInput
              style={s.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone"
              placeholderTextColor={theme.muted}
              keyboardType="phone-pad"
              editable={!sending}
            />

            {/* Demographics — all optional, single-select. */}
            <Text style={s.sectionHd}>A BIT ABOUT YOU — OPTIONAL</Text>
            <Text style={s.label}>Age range</Text>
            <View style={s.chipWrap}>
              {AGE_RANGES.map((a) => (
                <Chip
                  key={a}
                  label={a}
                  on={ageRange === a}
                  onPress={() => pickOne(setAgeRange, ageRange, a)}
                />
              ))}
            </View>
            <Text style={s.label}>How did you find FloofLife?</Text>
            <View style={s.chipWrap}>
              {FOUND_VIA.map((f) => (
                <Chip
                  key={f}
                  label={f}
                  on={foundVia === f}
                  onPress={() => pickOne(setFoundVia, foundVia, f)}
                />
              ))}
            </View>

            {errored && (
              <Text style={s.errorText}>
                Couldn't send just now. Try again, or email it to us instead.
              </Text>
            )}

            <View style={s.btnRow}>
              <TouchableOpacity
                onPress={onClose}
                disabled={sending}
                style={[s.btnSecondary, sending && s.btnDisabled]}
                activeOpacity={0.7}
              >
                <Text style={s.btnSecondaryText}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={sending}
                style={[s.btnPrimary, sending && s.btnDisabled]}
                activeOpacity={0.85}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.btnPrimaryText}>
                    {errored ? "Try again" : "Send feedback"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {errored && (
              <TouchableOpacity
                onPress={() => onEmailFallback?.(fields())}
                style={s.emailFallback}
                activeOpacity={0.7}
              >
                <Text style={s.emailFallbackText}>Email it to us instead</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    maxHeight: "88%",
    backgroundColor: theme.card,
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: theme.fg,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 14,
    color: theme.fg,
    lineHeight: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.fg,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionHd: {
    marginTop: 20,
    marginBottom: 2,
    fontSize: 11,
    fontWeight: "800",
    color: theme.muted,
    letterSpacing: 1,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.bg,
  },
  chipOn: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accent,
  },
  chipText: { fontSize: 13, color: theme.muted },
  chipTextOn: { color: theme.accent, fontWeight: "700" },
  textArea: {
    marginTop: 12,
    minHeight: 84,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: theme.fg,
    backgroundColor: theme.bg,
  },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.fg,
    backgroundColor: theme.bg,
  },
  errorText: {
    marginTop: 16,
    fontSize: 13,
    color: theme.red,
    lineHeight: 18,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.line,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecondaryText: { color: theme.muted, fontSize: 14, fontWeight: "600" },
  btnPrimary: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 14, letterSpacing: 0.3 },
  btnDisabled: { opacity: 0.5 },
  emailFallback: {
    marginTop: 12,
    alignItems: "center",
    paddingVertical: 6,
  },
  emailFallbackText: {
    fontSize: 13,
    color: theme.accent,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
