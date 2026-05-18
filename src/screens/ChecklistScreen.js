// Weekly checklist — extracted from the prior YourPets screen so it
// stands as its own bottom-tab destination. The tab is labeled
// "Pawgress" in the bottom bar (per build 19 smoke-test feedback —
// "pawgress is supposed to be a fun representation of the checklist")
// and the screen body opens with a Pawgress activity-ring section
// above the weekly checklist itself.
import React, { useEffect, useState, useCallback, useLayoutEffect, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Animated, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pet, Pets, ChecklistState } from "../lib/storage";
import { useActivePet } from "../lib/activePet";
import { generateChecklist, effectiveStatus } from "../lib/checklist";
import { weeklyContentFor } from "../lib/weeklyFreshness";
import { Pawgress, todayKey } from "../lib/pawgress";
import { track } from "../lib/analytics";
import { tapMedium, tapLight, notifySuccess } from "../lib/haptics";
import PawgressPaw from "../components/PawgressPaw";
import WeeklyFocusCard from "../components/WeeklyFocusCard";

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
import ActivePetTitle from "../components/ActivePetTitle";
import ActivePetChip from "../components/ActivePetChip";
import PetSwitcherModal from "../components/PetSwitcherModal";
import { theme } from "../theme";

export default function ChecklistScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [pet, setPet] = useState(null);
  const [pets, setPets] = useState([]);
  const [items, setItems] = useState([]);
  const [weekContent, setWeekContent] = useState(null);
  const [state, setState] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const [pawgressDay, setPawgressDay] = useState(null);
  const celebrationOpacity = useRef(new Animated.Value(0)).current;
  const celebrationScale = useRef(new Animated.Value(0.6)).current;
  const lastCelebratedKeyRef = useRef(null);

  const multiPet = pets.length > 1;
  const dayLabel = WEEKDAY_LABELS[new Date().getDay()];

  // Reactive active-pet id — re-loads the screen whenever active pet
  // changes via any path (floof fan, swipe on Home, switcher modal),
  // not just when the tab gets focus. Without this, switching to a
  // different floof while sitting on the Pawgress tab kept showing
  // the prior pet's checklist + paw fill.
  const { petId: activePetId } = useActivePet();

  // Generation counter — discards stale async results when fast
  // successive active-pet switches fire load() multiple times.
  // See HomeScreen for the wraparound-swipe bug this protects.
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    const p = await Pet.get();
    if (gen !== loadGenRef.current) return;
    const all = await Pets.list();
    if (gen !== loadGenRef.current) return;
    setPet(p);
    setPets(all);
    // Weekly freshness layer — a rotated focus/tip card + two fresh
    // spotlight tasks merged on top of the (stable, recurring) core
    // checklist. See lib/weeklyFreshness.js.
    const freshness = weeklyContentFor(p);
    setWeekContent(freshness);
    setItems([...freshness.spotlight, ...generateChecklist(p)]);
    track("checklist_week_focus", {
      week_index: freshness.weekIndex,
      theme_id: freshness.theme?.id || null,
    });
    const nextState = await ChecklistState.get(p?.id);
    if (gen !== loadGenRef.current) return;
    setState(nextState);
    if (p?.id) {
      const nextDay = await Pawgress.getDay(p.id, todayKey());
      if (gen !== loadGenRef.current) return;
      setPawgressDay(nextDay);
    }
  }, [activePetId]);
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Pet-name context header in the nav bar + active-pet chip on right
  // (multi-pet only). Title is tappable to open the switcher; chip is
  // a parallel affordance for the same action.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <ActivePetTitle
          pet={pet}
          screenName="Checklist"
          multiPet={multiPet}
          onPress={() => setSwitcherVisible(true)}
        />
      ),
      headerRight: multiPet
        ? () => <ActivePetChip pet={pet} onPress={() => {
            // Per build 19 smoke-test feedback: chip tap goes to the
            // pet's profile page (My Floofs tab). Title-tap (with
            // chevron-down) is the switcher modal; chip-tap is the
            // profile-jump. Two visually-distinct tap targets, two
            // distinct destinations.
            tapLight();
            navigation.navigate("Main", { screen: "YourPets" });
          }} />
        : undefined,
    });
  }, [navigation, pet, multiPet]);

  async function handlePickPet(petId) {
    if (!petId || petId === pet?.id) {
      setSwitcherVisible(false);
      return;
    }
    await Pets.setActive(petId);
    track("active_pet_switched", { source: "checklist_switcher", pet_count: pets.length });
    tapLight();
    setSwitcherVisible(false);
    load();
  }

  async function setStatus(id, status) {
    if (!pet?.id) return;
    const next = await ChecklistState.setItem(pet.id, id, status);
    setState(next);
    track("checklist_item_toggled", { action: status });
    if (status === "done") tapMedium();
    else tapLight();

    // Celebrate the moment the user completes ALL items for this pet.
    // De-dup so re-toggling the last item doesn't fire repeatedly:
    // one celebration per pet+date+itemcount combo per session.
    if (status === "done" && items.length > 0) {
      const stillUndone = items.some(i => {
        if (i.id === id) return false; // the just-toggled item
        return effectiveStatus(i, next[i.id]) !== "done";
      });
      if (!stillUndone) {
        const today = new Date().toISOString().slice(0, 10);
        const key = `${pet.id}:${today}:${items.length}`;
        if (lastCelebratedKeyRef.current !== key) {
          lastCelebratedKeyRef.current = key;
          fireCelebration();
        }
      }
    }
  }

  function fireCelebration() {
    track("checklist_all_done");
    notifySuccess();
    setCelebrationVisible(true);
    celebrationOpacity.setValue(0);
    celebrationScale.setValue(0.6);
    Animated.parallel([
      Animated.timing(celebrationOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(celebrationScale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start(() => {
      // Hold visible for ~1.4s, then fade out.
      setTimeout(() => {
        Animated.timing(celebrationOpacity, { toValue: 0, duration: 350, useNativeDriver: true })
          .start(() => setCelebrationVisible(false));
      }, 1400);
    });
  }

  if (!pet) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  const completed = items.filter(i => effectiveStatus(i, state[i.id]) === "done").length;

  return (
    <>
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {/* Daily Pawgress activity ring — fun representation of the day's
          care for [pet]. Resets every day. Tap → opens the Pawgress
          detail modal where the user can fill segments / see streak /
          peek at the Premium history teaser. Per build 19 smoke-test
          feedback: tab is now "Pawgress" + the activity ring carries
          a day-of-week label ("Monday Pawgress" / "Tuesday Pawgress"
          / ...) since each day is a fresh paw. */}
      {pawgressDay && (
        <TouchableOpacity
          onPress={() => { tapMedium(); navigation.navigate("Pawgress"); }}
          style={s.pawgressSection}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${dayLabel} Pawgress · ${Pawgress.countCompleted(pawgressDay)} of 5 pads filled · tap to fill more`}
        >
          <Text style={s.pawgressEyebrow}>{dayLabel.toUpperCase()} PAWGRESS</Text>
          <PawgressPaw completion={pawgressDay} size={150} colorMode="today" />
          <Text style={s.pawgressSubtitle}>
            {Pawgress.isAllFive(pawgressDay)
              ? `${pet.name} is set for today 🎉`
              : `${Pawgress.countCompleted(pawgressDay)} of 5 pads filled — tap to fill more`}
          </Text>
        </TouchableOpacity>
      )}

      {weekContent && <WeeklyFocusCard content={weekContent} />}

      <View style={s.progress}>
        <Text style={s.progressLabel}>This week</Text>
        <Text style={s.progressCount}>{completed} of {items.length} done</Text>
      </View>

      {items.map((it, i) => {
        const status = effectiveStatus(it, state[it.id]);
        const done = status === "done";
        const skipped = status === "skipped";
        return (
          <View key={it.id + i} style={[s.item, done && s.itemDone, skipped && s.itemSkipped]}>
            <TouchableOpacity onPress={() => setStatus(it.id, done ? "open" : "done")} style={s.checkbox}>
              <View style={[s.checkboxBox, done && s.checkboxDone]}>
                {done && <Text style={{ color: "#fff", fontWeight: "800" }}>✓</Text>}
              </View>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={[s.itemTitle, done && { textDecorationLine: "line-through", color: theme.muted }]}>{it.title}</Text>
              {it.why && <Text style={s.itemWhy}>{it.why}</Text>}
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                {it.cadence && <Text style={s.tag}>{it.cadence}</Text>}
                {it.category && <Text style={[s.tag, s.tagAlt]}>{it.category}</Text>}
              </View>
            </View>
            <TouchableOpacity onPress={() => setStatus(it.id, skipped ? "open" : "skipped")} style={s.skipBtn}>
              <Text style={[s.skipText, skipped && { color: theme.accent, fontWeight: "700" }]}>{skipped ? "skipped" : "skip"}</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <View style={s.disclaimer}>
        <Text style={s.disclaimerText}>FloofLife guidance is not a substitute for veterinary advice. When something feels wrong, call your vet.</Text>
      </View>
    </ScrollView>
    <PetSwitcherModal
      visible={switcherVisible}
      onClose={() => setSwitcherVisible(false)}
      pets={pets}
      activeId={pet?.id}
      onPick={handlePickPet}
    />
    {celebrationVisible && (
      <Animated.View
        pointerEvents="none"
        style={[
          s.celebrationOverlay,
          { opacity: celebrationOpacity, transform: [{ scale: celebrationScale }] },
        ]}
      >
        <Text style={s.celebrationEmoji}>🎉</Text>
        <Text style={s.celebrationText}>{pet?.name ? `${pet.name} is set for today` : "All set for today"}</Text>
      </Animated.View>
    )}
    </>
  );
}

const s = StyleSheet.create({
  celebrationOverlay:{ position: "absolute", top: "40%", left: 24, right: 24, paddingVertical: 22, paddingHorizontal: 18, borderRadius: 18, backgroundColor: theme.card, borderWidth: 2, borderColor: theme.accent, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  celebrationEmoji:{ fontSize: 48 },
  celebrationText:{ marginTop: 8, fontSize: 16, fontWeight: "700", color: theme.fg, textAlign: "center", textTransform: "capitalize" },
  pawgressSection:{ alignItems: "center", paddingVertical: 14, paddingHorizontal: 14, borderRadius: 16, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line, marginBottom: 14, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  pawgressEyebrow:{ fontSize: 11, fontWeight: "800", color: theme.muted, letterSpacing: 1.4, marginBottom: 8 },
  pawgressSubtitle:{ fontSize: 13, color: theme.fg, marginTop: 8, textAlign: "center", fontStyle: "italic" },
  progress:     { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingVertical: 14, paddingHorizontal: 16, backgroundColor: theme.accentSoft, borderRadius: 12, marginBottom: 16, gap: 12 },
  progressLabel:{ color: theme.fg, fontWeight: "700", fontSize: 14, letterSpacing: 0.5 },
  progressCount:{ color: theme.accent, fontWeight: "800", fontSize: 18 },
  item:         { flexDirection: "row", alignItems: "flex-start", paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.line, marginBottom: 8 },
  itemDone:     { backgroundColor: "#F2EBE0", opacity: 0.85 },
  itemSkipped:  { opacity: 0.55 },
  checkbox:     { paddingRight: 12, paddingTop: 2 },
  checkboxBox:  { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: theme.muted, alignItems: "center", justifyContent: "center" },
  checkboxDone: { backgroundColor: theme.green, borderColor: theme.green },
  itemTitle:    { fontSize: 15, fontWeight: "600", color: theme.fg, lineHeight: 20 },
  itemWhy:      { fontSize: 12, color: theme.muted, marginTop: 4, lineHeight: 17 },
  tag:          { fontSize: 10, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: theme.accentSoft, color: theme.accent, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  tagAlt:       { backgroundColor: "#EDE3D2", color: theme.muted },
  skipBtn:      { paddingHorizontal: 6, paddingVertical: 4 },
  skipText:     { fontSize: 11, color: theme.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  disclaimer:   { marginTop: 24, padding: 14, borderRadius: 10, backgroundColor: theme.accentSoft },
  disclaimerText:{ fontSize: 11, color: theme.fg, lineHeight: 17 },
});
