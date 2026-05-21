// LogStoolScreen — single-screen entry form for a stool log entry.
// Bristol scale picker → color chips → volume → modifier toggles →
// optional photo + walk location + note → Save.
import React, { useState, useLayoutEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActionSheetIOS, Platform, Alert, Image, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pet, Pets } from "../lib/storage";
import { readActivePetId } from "../lib/activePet";
import { StoolLog, BRISTOL_LABELS, STOOL_COLORS, STOOL_COLOR_LABELS, STOOL_VOLUMES, STOOL_VOLUME_LABELS } from "../lib/tummy";
import { pickTummyPhoto } from "../lib/photoPicker";
import { track } from "../lib/analytics";
import { tapMedium, tapLight, notifySuccess } from "../lib/haptics";
import BristolIcon from "../components/BristolIcon";
import { theme } from "../theme";

export default function LogStoolScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const editEntryId = route?.params?.entryId || null;

  const [pet, setPet] = useState(null);
  const [bristol, setBristol] = useState(4);
  const [color, setColor] = useState("brown");
  const [volume, setVolume] = useState("normal");
  const [hasMucus, setHasMucus] = useState(false);
  const [hasBlood, setHasBlood] = useState(false);
  const [hasForeignMaterial, setHasForeignMaterial] = useState(false);
  const [hasUndigestedFood, setHasUndigestedFood] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: editEntryId ? "Edit stool log" : "Log a poop" });
  }, [navigation, editEntryId]);

  React.useEffect(() => {
    (async () => {
      const p = await Pet.get();
      setPet(p);
      if (editEntryId && p?.id) {
        const all = await StoolLog.list(p.id);
        const target = all.find((e) => e.id === editEntryId);
        if (target) {
          setBristol(target.bristol || 4);
          setColor(target.color || "brown");
          setVolume(target.volume || "normal");
          setHasMucus(!!target.hasMucus);
          setHasBlood(!!target.hasBlood);
          setHasForeignMaterial(!!target.hasForeignMaterial);
          setHasUndigestedFood(!!target.hasUndigestedFood);
          setPhotoUri(target.photoUri || null);
          setNote(target.note || "");
        }
      }
    })();
  }, [editEntryId]);

  function showPhotoMenu() {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Take photo", "Choose from library", "Cancel"],
          cancelButtonIndex: 2,
        },
        async (idx) => {
          if (idx === 2) return;
          const source = idx === 0 ? "camera" : "library";
          const uri = await pickTummyPhoto({ petId: pet?.id, source });
          if (uri) {
            setPhotoUri(uri);
            track("tummy_tracker_photo_captured", { source });
          }
        }
      );
    } else {
      // Android fallback — go straight to library.
      pickTummyPhoto({ petId: pet?.id, source: "library" }).then((uri) => {
        if (uri) {
          setPhotoUri(uri);
          track("tummy_tracker_photo_captured", { source: "library" });
        }
      });
    }
  }

  async function save() {
    setSaving(true);
    try {
      // Resolve the write target via the authoritative active-pet
      // store at the moment of save — bypasses any stale `pet` state
      // if the user switched floofs (fan / chip / swipe) after this
      // screen mounted but before they tapped Save.
      const writeId = (await readActivePetId()) || pet?.id;
      if (!writeId) { setSaving(false); return; }
      const payload = {
        bristol, color, volume,
        hasMucus, hasBlood, hasForeignMaterial, hasUndigestedFood,
        photoUri,
        note: note.trim(),
      };
      if (editEntryId) {
        await StoolLog.update(writeId, editEntryId, payload);
      } else {
        await StoolLog.add(writeId, payload);
      }
      track("tummy_tracker_stool_log_created", {
        bristol_scale: bristol,
        color,
        has_photo: !!photoUri,
        has_blood: !!hasBlood,
        pet_species: pet.species,
      });
      notifySuccess();
      navigation.goBack();
    } catch (e) {
      Alert.alert("Couldn't save", e?.message || "Try again.");
    } finally {
      setSaving(false);
    }
  }

  function toggleModifier(setter) {
    return () => { tapLight(); setter((v) => !v); };
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 80, paddingHorizontal: 20 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.label}>CONSISTENCY</Text>
      <Text style={s.help}>Bristol Stool Scale 1–7. Tap to select. (4 is typical for a healthy dog.)</Text>
      <View style={s.bristolRow}>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <TouchableOpacity
            key={n}
            onPress={() => { tapMedium(); setBristol(n); }}
            style={[s.bristolCell, bristol === n && s.bristolCellActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: bristol === n }}
            accessibilityLabel={`Bristol ${n}: ${BRISTOL_LABELS[n]}`}
          >
            <BristolIcon scale={n} size={40} color={bristol === n ? theme.accent : theme.muted} />
            <Text style={[s.bristolNum, bristol === n && s.bristolNumActive]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.bristolDescription}>{BRISTOL_LABELS[bristol]}</Text>

      <Text style={s.label}>COLOR</Text>
      <View style={s.chipRow}>
        {STOOL_COLORS.map((c) => {
          const isSelected = color === c;
          const isWatch = c === "black" || c === "red_tinged";
          return (
            <TouchableOpacity
              key={c}
              onPress={() => { tapLight(); setColor(c); }}
              style={[s.chip, isSelected && s.chipActive, isWatch && s.chipWatch]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[s.chipText, isSelected && s.chipTextActive]}>{STOOL_COLOR_LABELS[c]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={s.label}>VOLUME</Text>
      <View style={s.volumeRow}>
        {STOOL_VOLUMES.map((v) => {
          const isSelected = volume === v;
          return (
            <TouchableOpacity
              key={v}
              onPress={() => { tapLight(); setVolume(v); }}
              style={[s.volumeCell, isSelected && s.volumeCellActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[s.volumeText, isSelected && s.volumeTextActive]}>{STOOL_VOLUME_LABELS[v]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={s.label}>MODIFIERS</Text>
      <ModifierRow label="Mucus" on={hasMucus} onPress={toggleModifier(setHasMucus)} />
      <ModifierRow label="Visible blood" on={hasBlood} onPress={toggleModifier(setHasBlood)} hint="If yes, discuss with your vet." />
      <ModifierRow label="Foreign material" on={hasForeignMaterial} onPress={toggleModifier(setHasForeignMaterial)} />
      <ModifierRow label="Undigested food" on={hasUndigestedFood} onPress={toggleModifier(setHasUndigestedFood)} />

      <Text style={s.label}>PHOTO (optional)</Text>
      <Text style={s.help}>Photos help your vet identify color + consistency. Kept private — never shared with anyone.</Text>
      <TouchableOpacity onPress={showPhotoMenu} style={s.photoBtn} activeOpacity={0.85}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={s.photoPreview} onError={() => {}} />
        ) : (
          <View style={s.photoPlaceholder}>
            <MaterialCommunityIcons name="camera-plus-outline" size={28} color={theme.accent} />
            <Text style={s.photoPlaceholderText}>Add a photo</Text>
          </View>
        )}
      </TouchableOpacity>
      {photoUri && (
        <TouchableOpacity onPress={() => setPhotoUri(null)} style={{ alignSelf: "center", padding: 6 }}>
          <Text style={{ color: theme.muted, fontSize: 12 }}>Remove photo</Text>
        </TouchableOpacity>
      )}

      <Text style={s.label}>NOTE (optional)</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Anything else? Stays local."
        placeholderTextColor={theme.muted}
        style={s.input}
        multiline
      />

      <TouchableOpacity onPress={save} disabled={saving} style={[s.saveBtn, saving && { opacity: 0.6 }]} activeOpacity={0.85}>
        <Text style={s.saveBtnText}>{saving ? "Saving…" : (editEntryId ? "Save changes" : "Log this poop")}</Text>
      </TouchableOpacity>

      <Text style={s.disclaimer}>
        Tummy Tracker is a personal log. Patterns help your vet — but don't replace a visit. Discuss with your vet.
      </Text>
    </ScrollView>
  );
}

function ModifierRow({ label, on, onPress, hint }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.modRow, on && s.modRowOn]} activeOpacity={0.7}>
      <View style={[s.modCheckbox, on && s.modCheckboxOn]}>
        {on && <MaterialCommunityIcons name="check" size={14} color="#fff" />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.modLabel, on && s.modLabelOn]}>{label}</Text>
        {hint && on ? <Text style={s.modHint}>{hint}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  label:        { fontSize: 11, fontWeight: "800", color: theme.muted, letterSpacing: 1.2, marginTop: 16, marginBottom: 6 },
  help:         { fontSize: 11, color: theme.muted, marginBottom: 8, lineHeight: 16 },
  bristolRow:   { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  bristolCell:  { flex: 1, minWidth: 44, paddingVertical: 8, paddingHorizontal: 4, alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card },
  bristolCellActive: { borderColor: theme.accent, borderWidth: 2, backgroundColor: theme.accentSoft },
  bristolNum:   { fontSize: 11, fontWeight: "700", color: theme.muted, marginTop: 2 },
  bristolNumActive: { color: theme.accent },
  bristolDescription: { fontSize: 12, color: theme.fg, marginTop: 8, fontStyle: "italic", textAlign: "center" },
  chipRow:      { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip:         { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card },
  chipActive:   { borderColor: theme.accent, backgroundColor: theme.accent },
  chipWatch:    { borderColor: "#C04A2C" },
  chipText:     { fontSize: 12, color: theme.fg },
  chipTextActive: { color: "#fff", fontWeight: "700" },
  volumeRow:    { flexDirection: "row", gap: 8 },
  volumeCell:   { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card },
  volumeCellActive: { borderColor: theme.accent, borderWidth: 2, backgroundColor: theme.accentSoft },
  volumeText:   { fontSize: 13, fontWeight: "600", color: theme.fg },
  volumeTextActive: { color: theme.accent },
  modRow:       { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.card, marginBottom: 6 },
  modRowOn:     { borderColor: theme.accent, backgroundColor: theme.accentSoft },
  modCheckbox:  { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: theme.muted, alignItems: "center", justifyContent: "center" },
  modCheckboxOn:{ backgroundColor: theme.accent, borderColor: theme.accent },
  modLabel:     { fontSize: 14, fontWeight: "600", color: theme.fg },
  modLabelOn:   { color: theme.accent },
  modHint:      { fontSize: 11, color: theme.muted, marginTop: 2, fontStyle: "italic" },
  photoBtn:     { width: "100%", height: 140, borderRadius: 12, overflow: "hidden", borderWidth: 2, borderColor: theme.accent + "55", borderStyle: "dashed", backgroundColor: theme.bg },
  photoPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  photoPlaceholderText: { color: theme.accent, fontWeight: "700", marginTop: 6, fontSize: 12 },
  photoPreview: { width: "100%", height: "100%", resizeMode: "cover" },
  input:        { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, minHeight: 80, color: theme.fg, textAlignVertical: "top", fontSize: 14 },
  saveBtn:      { marginTop: 22, paddingVertical: 16, borderRadius: 12, backgroundColor: theme.accent, alignItems: "center" },
  saveBtnText:  { color: "#fff", fontWeight: "800", fontSize: 15 },
  disclaimer:   { fontSize: 11, color: theme.muted, marginTop: 16, textAlign: "center", fontStyle: "italic", lineHeight: 16 },
});
