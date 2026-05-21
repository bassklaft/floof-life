// Home hub — pet-photo hero with greeting + 5 destination cards.
// The hero is the emotional anchor: a big photo of the pet behind a
// gentle dark gradient, name + breed overlaid. FloofLife exists to
// keep that face around for more years.
import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, ImageBackground, RefreshControl, Linking, Platform, Animated, StyleSheet, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pet, Pets, ChecklistState } from "../lib/storage";
import { useActivePet } from "../lib/activePet";
import { pickPhotoForSlot } from "../lib/petPhotos";
import { generateChecklist, effectiveStatus } from "../lib/checklist";
import { MOOD_BY_ID, moodDateKey, moodSlotFor, MOOD_SLOT_LABELS } from "../data/moods";
import { breedFacts } from "../data/breeds";
import { getPrimaryBreed, mixedBreedLabel, isMixedBreed, shortBreedName } from "../lib/petBreeds";
import { findType, statusFor, daysUntilDue } from "../lib/healthRecordTypes";
import { Pawgress, todayKey } from "../lib/pawgress";
import { openMapsSearch } from "../lib/maps";
import { tapMedium, tapHeavy } from "../lib/haptics";
import PawgressPaw from "../components/PawgressPaw";
import PawIcon from "../components/PawIcon";
import PhotoManagerSheet from "../components/PhotoManagerSheet";
import FloofCardStack from "../components/FloofCardStack";
import { theme } from "../theme";

// Multi-pet hero dimensions for the swipeable card stack — same
// 92%/320 footprint the existing single-pet hero uses (see s.hero).
const HERO_HEIGHT = 320;

const titleCase = s => s.split(" ").map(w => w[0]?.toUpperCase() + w.slice(1)).join(" ");

// Multi-pet hero collage. Adapts layout to family size:
//   2 pets: side-by-side 50/50
//   3 pets: 3 vertical stripes (each 1/3 width) — symmetric so a
//           floof without a photo doesn't make the whole hero look
//           lopsided
//   4 pets: 2x2 grid
//   5+ pets: 2x2 grid with the 4th tile showing "+N more" overlay
// Active pet's tile gets a subtle accent-color border so it reads as
// "this is who's active right now" without forcing a single-photo
// hero again. Photos come from each pet's stored documentDirectory
// URI; pets without a photo get a branded FloofLife placeholder
// (paw + green check + pet name).
function CollageTile({ pet, active, overflow = 0, tileIndex = 0 }) {
  // Each collage tile gets a different photo from the pet's set so two
  // tiles for the same pet wouldn't show the same image (single-pet
  // households still see the daily-rotated hero — different slot).
  const tileUri = pickPhotoForSlot(pet, "collage", { tileIndex });
  const placeholderName = (pet?.name && pet.name.trim()) || "FloofLife";
  return (
    <View style={[collageStyles.tile, active && collageStyles.tileActive]}>
      {tileUri ? (
        <ImageBackground source={{ uri: tileUri }} style={collageStyles.tileImage} imageStyle={collageStyles.tileImageInner}>
          {overflow > 0 && (
            <View style={collageStyles.overflowOverlay}>
              <Text style={collageStyles.overflowText}>+{overflow} more</Text>
            </View>
          )}
        </ImageBackground>
      ) : (
        <View style={collageStyles.tileFallback}>
          {/* Branded placeholder — canonical PawIcon with check (the
              FloofLife mark) over the pet's name. Reads as "no photo
              yet" but still feels like the app, not a missing-asset
              hole. Same canonical paw vector as Logo / tabs / Pawgress. */}
          <PawIcon size={52} withCheck color={theme.accent} checkBg={theme.bg} />
          <Text style={collageStyles.placeholderName} numberOfLines={1}>
            {placeholderName}
          </Text>
          {overflow > 0 && (
            <View style={collageStyles.overflowOverlay}>
              <Text style={collageStyles.overflowText}>+{overflow} more</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function FloofCollage({ pets, activeId }) {
  const n = pets.length;
  if (n === 2) {
    return (
      <View style={[collageStyles.fill, { flexDirection: "row" }]}>
        {pets.slice(0, 2).map((p, i) => (
          <CollageTile key={p.id} pet={p} active={p.id === activeId} tileIndex={i} />
        ))}
      </View>
    );
  }
  if (n === 3) {
    // 3 vertical stripes — each pet gets 1/3 of the hero width across
    // the full hero height. Symmetric (no "1 on top, 2 on bottom"
    // asymmetry that lopsided when a tile is photoless).
    return (
      <View style={[collageStyles.fill, { flexDirection: "row" }]}>
        {pets.slice(0, 3).map((p, i) => (
          <CollageTile key={p.id} pet={p} active={p.id === activeId} tileIndex={i} />
        ))}
      </View>
    );
  }
  // 4+
  const visible = pets.slice(0, 4);
  const overflow = Math.max(0, n - 4);
  return (
    <View style={[collageStyles.fill, { flexDirection: "column" }]}>
      <View style={{ flex: 1, flexDirection: "row" }}>
        <CollageTile pet={visible[0]} active={visible[0].id === activeId} tileIndex={0} />
        <CollageTile pet={visible[1]} active={visible[1].id === activeId} tileIndex={1} />
      </View>
      <View style={{ flex: 1, flexDirection: "row" }}>
        <CollageTile pet={visible[2]} active={visible[2].id === activeId} tileIndex={2} />
        <CollageTile
          pet={visible[3]}
          active={visible[3].id === activeId}
          overflow={overflow}
          tileIndex={3}
        />
      </View>
    </View>
  );
}

// Subtle idle wobble for the Quick Access cards. Each card wobbles
// once every ~6-10 seconds with a random offset so the row doesn't
// move in unison. Soft enough to invite tap, not jarring. Per build
// 19 smoke-test feedback ("bounce a little or shake a little — soft
// and fun and silly, dont move too far from origin").
function WobbleCard({ children, idleSeconds = 7 }) {
  const wobble = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let mounted = true;
    let timer = null;
    function tick() {
      if (!mounted) return;
      Animated.sequence([
        Animated.timing(wobble, { toValue: 1,    duration: 140, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: -1,   duration: 160, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: 0.4,  duration: 120, useNativeDriver: true }),
        Animated.timing(wobble, { toValue: 0,    duration: 100, useNativeDriver: true }),
      ]).start(() => {
        const next = idleSeconds * 1000 + Math.random() * 3000;
        timer = setTimeout(tick, next);
      });
    }
    // Initial delay randomized so cards don't all wobble at the same time
    timer = setTimeout(tick, Math.random() * 4000 + 2000);
    return () => { mounted = false; if (timer) clearTimeout(timer); };
  }, [idleSeconds, wobble]);
  const rotate = wobble.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ["-2.5deg", "0deg", "2.5deg"],
  });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      {children}
    </Animated.View>
  );
}

const collageStyles = StyleSheet.create({
  fill:           { ...StyleSheet.absoluteFillObject },
  tile:           { flex: 1, overflow: "hidden" },
  tileActive:     { borderWidth: 3, borderColor: theme.accent },
  tileImage:      { flex: 1 },
  tileImageInner: { resizeMode: "cover" },
  tileFallback:   { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.accentSoft, padding: 8, gap: 6 },
  placeholderName:{ fontSize: 12, fontWeight: "800", color: theme.fg, letterSpacing: -0.2, textAlign: "center", maxWidth: "92%", textTransform: "capitalize" },
  overflowOverlay:{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  overflowText:   { color: "#fff", fontSize: 18, fontWeight: "800", letterSpacing: 0.4 },
});

export default function HomeScreen({ navigation, onShowFloofFan }) {
  const insets = useSafeAreaInsets();
  const [pet, setPet] = useState(null);
  const [pets, setPets] = useState([]);
  const [items, setItems] = useState([]);
  const [state, setState] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [healthRecords, setHealthRecords] = useState([]);
  const [pawgressDay, setPawgressDay] = useState(null);
  const [todayMoodLogs, setTodayMoodLogs] = useState([]);
  // Photo manager sheet — opened by tapping the single-pet hero banner.
  const [showPhotoManager, setShowPhotoManager] = useState(false);
  // Reactive active-pet id. Reloads the whole hub when it changes —
  // covers the case where the user switches via the floof fan (or any
  // other path that doesn't unfocus Home), so the hero, Pawgress
  // card, Health subtitle, and "This week" counter never lag behind
  // the current active floof. Build-43 bug: focus-only reload meant
  // an external switch on the focused tab stayed stale.
  const { petId: activePetId } = useActivePet();

  // Generation counter for race-protection. Build 43 surfaced a
  // wrap-around-the-carousel race: fast successive swipes
  // (Elliot → Cricket → Falafel) fired multiple `load()`s and
  // multiple `Pets.setActive` writes concurrently. Their
  // `Pawgress.getDay` / `ChecklistState.get` / `listHealthRecords`
  // promises resolved in non-deterministic order — the LATER
  // setActive's data fetch sometimes settled BEFORE the earlier
  // one, leaving the hero on the new pet but the Pawgress
  // subtitle ("Today's 5 pads filled · Elliot") on the old. Each
  // `load()` increments this counter; after every await it checks
  // whether it is still the latest invocation, and bails if not.
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    const p = await Pet.get();
    if (gen !== loadGenRef.current) return;
    const all = await Pets.listSortedOldestFirst();
    if (gen !== loadGenRef.current) return;
    setPet(p);
    setPets(all);
    setItems(generateChecklist(p));
    const nextState = await ChecklistState.get(p?.id);
    if (gen !== loadGenRef.current) return;
    setState(nextState);
    if (p?.id) {
      const [nextHr, nextDay, nextMoods] = await Promise.all([
        Pets.listHealthRecords(p.id),
        Pawgress.getDay(p.id, todayKey()),
        Pets.listMoodLogs(p.id),
      ]);
      if (gen !== loadGenRef.current) return;
      setHealthRecords(nextHr);
      setPawgressDay(nextDay);
      const today = moodDateKey();
      setTodayMoodLogs(nextMoods.filter((m) => m.dateKey === today));
    }
  }, [activePetId]);

  const petsCount = pets.length;
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openVetsNearMe() {
    openMapsSearch("veterinarian");
  }

  if (!pet) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  const primaryBreed = getPrimaryBreed(pet);
  const breed = breedFacts[primaryBreed];
  const breedDisplay = mixedBreedLabel(pet) || titleCase(primaryBreed);
  const completed = items.filter(i => effectiveStatus(i, state[i.id]) === "done").length;
  // Hero photo rotates daily across the pet's photos[] set. Falls back
  // to legacy photoUri-only pets gracefully via pickPhotoForSlot.
  const heroPhotoUri = pickPhotoForSlot(pet, "hero");
  const hasPhoto = !!heroPhotoUri;

  // Health tracker preview: nearest upcoming + overdue count
  const overdueCount = healthRecords.filter((r) => statusFor(r) === "overdue").length;
  const nextUpcoming = healthRecords
    .filter((r) => r?.nextDue && statusFor(r) !== "overdue")
    .sort((a, b) => new Date(a.nextDue) - new Date(b.nextDue))[0] || null;
  const healthSubtitle = (() => {
    if (healthRecords.length === 0) return "No records yet — tap to add vaccines, preventatives, more";
    if (nextUpcoming) {
      const days = daysUntilDue(nextUpcoming);
      const t = findType(nextUpcoming.type);
      const label = nextUpcoming.customLabel || t?.label || "Next";
      if (days != null && days >= 0 && days <= 365) {
        return `${label} due in ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`}`;
      }
    }
    return overdueCount > 0 ? `${overdueCount} overdue · tap to review` : "Up to date — review your log";
  })();

  // Mood prompt — surface a soft CTA when the current slot (morning
  // before noon, evening after) has no log yet for the active pet.
  // Today's slot already logged → still show the card, but with a
  // "checked in" subtitle so the value is visible.
  const currentMoodSlot = moodSlotFor();
  const moodAlreadyLogged = todayMoodLogs.some((m) => m.slot === currentMoodSlot);
  const lastMoodToday = todayMoodLogs.length > 0
    ? todayMoodLogs.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))[0]
    : null;
  const lastMoodEmoji = lastMoodToday ? MOOD_BY_ID[lastMoodToday.moodId]?.emoji : null;
  const moodSubtitle = moodAlreadyLogged
    ? `${MOOD_SLOT_LABELS[currentMoodSlot]} checked in${lastMoodEmoji ? ` · ${lastMoodEmoji}` : ""} — tap to add tonight's reading or look back`
    : `Take a beat — log how ${pet.name} is feeling this ${MOOD_SLOT_LABELS[currentMoodSlot].toLowerCase()}`;

  // Home Quick Access order (below Emergency), per Max 2026-05-21:
  // Assistant, Floof Trackers, Training, Toxic Foods & Plants, Risk,
  // Trip Planner, Vets, Recalls, Age Calculator, My Floofs.
  // Health/Tummy/Mood live in the Floof Trackers hub; Diet & Care is
  // folded into Tummy.
  const trackerBadge = overdueCount > 0 ? overdueCount : null;
  const cards = [
    { key: "assistant",title: "Floof Assistant",      subtitle: `Chat about ${pet.name} — mood, tummy, breed, training. Not a vet.`, icon: "chat-question-outline", tint: theme.accent, onPress: () => navigation.navigate("FloofAssistant", { petId: pet.id }) },
    { key: "trackers", title: "Floof Trackers",       subtitle: "Health, Tummy & Mood — all in one place", icon: "heart-pulse", tint: theme.accent, onPress: () => navigation.navigate("FloofTrackers"), badge: trackerBadge },
    { key: "training", title: "Training Exercises",   subtitle: "Behavioral, physical, mental — and how often",     icon: "school",         tint: "#7A4F0A",    onPress: () => navigation.navigate("Training") },
    { key: "toxic",    title: "Toxic Foods & Plants", subtitle: "Quick reference — what to keep away",             icon: "leaf",           tint: theme.green,  onPress: () => navigation.navigate("Toxic") },
    { key: "risk",     title: "Risk Map",             subtitle: "Hazards near you · breed-specific risks · rules of thumb", icon: "map-marker-alert", tint: "#9C2A0F", onPress: () => navigation.navigate("Risk") },
    { key: "trip",     title: "Trip Planner",         subtitle: "Packing, transit safety, tick prep",                icon: "bag-suitcase",   tint: "#3F5A30",    onPress: () => navigation.navigate("Trip") },
    { key: "vets",     title: "Vets Near Me",         subtitle: "Apple or Google Maps — your choice",              icon: "hospital-marker", tint: "#3F8E5C",   onPress: openVetsNearMe },
    { key: "recalls",  title: "Recalls & Class Actions", subtitle: "Active FDA investigations & owner concerns",  icon: "alert-octagon",  tint: "#C04A2C",    onPress: () => navigation.navigate("Recalls") },
    { key: "age",      title: "Age Calculator",       subtitle: `${pet.name}'s human-equivalent age — multi-factor, not "1 yr = 7"`, icon: "calendar-heart", tint: "#7A4F0A", onPress: () => navigation.navigate("DogAge") },
    { key: "pets",     title: "My Floofs",            subtitle: `${pet.name} · ${breedDisplay}`,    icon: "paw",            tint: theme.accent, onPress: () => navigation.navigate("Main", { screen: "YourPets" }) },
  ];

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {/* Hero — single-pet households see the active pet's photo
          full-bleed. Multi-pet households see a SWIPEABLE STACK of
          pet cards — flip through with a finger, long-press the
          My Floofs tab to open the floof fan (FloofFanOverlay),
          tap a card to activate that pet AND open the photo
          manager scoped to them. Each card is bound to one pet,
          so taps + swipes always know which floof they're acting
          on. Pinch-in to open the fan was removed in build 33
          (recurring TurboModule crash on multi-touch). */}
      {(() => {
        const isMultiPet = petsCount > 1;
        const HeroWrap = TouchableOpacity;
        const wrapProps = { onPress: () => { tapMedium(); setShowPhotoManager(true); }, activeOpacity: 0.85 };

        if (isMultiPet) {
          // Compute the same 92%-of-window width the single-pet
          // hero uses (`width: "92%"` + alignSelf: "center" on
          // s.hero). This matches the visual footprint exactly.
          const cardW = Math.round(Dimensions.get("window").width * 0.92);
          return (
            <View style={s.heroStackWrap}>
              <Text style={s.heroStackEyebrow}>YOUR FLOOFS</Text>
              <FloofCardStack
                pets={pets}
                activeId={pet.id}
                width={cardW}
                height={HERO_HEIGHT}
                onActivate={async (petId) => {
                  if (!petId || petId === pet.id) return;
                  // Optimistic visual update so parent state matches
                  // FloofCardStack's internal index immediately. The
                  // ACTUAL data fetch (pawgressDay / healthRecords /
                  // checklistState) is owned by `load()` — kicked off
                  // by `Pets.setActive` flipping the useActivePet
                  // listener, which bumps `activePetId` and re-runs
                  // load via its dep. Generation counter inside load
                  // discards stale results if a newer swipe supersedes
                  // this one. Build-43 lesson: fetching here AND in
                  // load created two racing sources of truth that
                  // de-synced under fast wraparound swipes (hero on
                  // Cricket, "Today's pawgress · Elliot").
                  const newPet = pets.find((p) => p.id === petId);
                  if (newPet) {
                    setPet(newPet);
                    setItems(generateChecklist(newPet));
                  }
                  try { await Pets.setActive(petId); }
                  catch { /* swipe is non-destructive */ }
                }}
                onTapFront={async (tappedPet) => {
                  // Tap a card → activate that pet + open the
                  // photo manager scoped to them. Same model as
                  // onActivate above: optimistic setPet, then
                  // setActive triggers load via the listener.
                  if (!tappedPet?.id) return;
                  if (tappedPet.id !== pet.id) {
                    setPet(tappedPet);
                    setItems(generateChecklist(tappedPet));
                    try { await Pets.setActive(tappedPet.id); }
                    catch { /* see onActivate */ }
                  }
                  setShowPhotoManager(true);
                }}
                onLongPress={() => {
                  if (typeof onShowFloofFan === "function") onShowFloofFan();
                }}
              />
            </View>
          );
        }

        // Single-pet households: existing single-photo hero.
        if (hasPhoto) {
          return (
            <HeroWrap {...wrapProps}>
              <ImageBackground source={{ uri: heroPhotoUri }} style={s.hero} imageStyle={s.heroImage}>
                <View style={s.heroOverlay} />
                <View style={s.heroContent}>
                  <Text style={s.heroEyebrow}>FOR</Text>
                  <Text style={s.heroName}>{pet.name}</Text>
                  <Text style={s.heroMeta}>
                    {breedDisplay} · {pet.ageYears} yr{pet.weightLbs ? ` · ${pet.weightLbs} lb` : ""}
                  </Text>
                </View>
              </ImageBackground>
            </HeroWrap>
          );
        }
        return (
          <HeroWrap {...wrapProps} style={s.heroFallback}>
            <Text style={s.greet}>Hi, {pet.name}'s human 👋</Text>
            <Text style={s.species}>{breedDisplay} {pet.species} · {pet.ageYears} yr{pet.weightLbs ? ` · ${pet.weightLbs} lb` : ""}</Text>
          </HeroWrap>
        );
      })()}

      <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
        <TouchableOpacity onPress={() => navigation.navigate("Main", { screen: "Checklist" })} style={s.progress}>
          <Text style={s.progressLabel}>This week</Text>
          <Text style={s.progressCount}>{completed} of {items.length} done →</Text>
        </TouchableOpacity>

        {/* Pawgress card first — daily-care paw is the everyday-action
            entry point and reads as the "next thing to do today". */}
        {pawgressDay && (
          <TouchableOpacity
            onPress={() => navigation.navigate("Pawgress", { petId: pet.id })}
            style={s.pawgressCard}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Pawgress: ${Pawgress.countCompleted(pawgressDay)} of 5 pads filled today`}
          >
            {(() => {
              // Green check on the Home card mirrors the detail-screen
              // gate: 5 pads filled AND no daily checklist items still
              // pending. Otherwise the paw shows partially filled with
              // no check, signaling there's still something to do today.
              const dailyPending = items.filter((it) => {
                if (it.frequency !== "daily") return false;
                const status = effectiveStatus(it, state[it.id]);
                return status !== "done" && status !== "skipped";
              }).length;
              const fullyDone = Pawgress.isAllFive(pawgressDay) && dailyPending === 0;
              return (
                <PawgressPaw
                  completion={pawgressDay}
                  size={56}
                  colorMode="today"
                  isComplete={fullyDone}
                />
              );
            })()}
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.pawgressTitle} numberOfLines={1}>{pet.name}'s Pawgress</Text>
              <Text style={s.pawgressSubtitle} numberOfLines={2}>
                {Pawgress.isAllFive(pawgressDay)
                  ? `Today's 5 pads filled — sweet dreams`
                  : `${Pawgress.countCompleted(pawgressDay)} of 5 pads filled — complete today's checklist to fill the paw`}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.muted} />
          </TouchableOpacity>
        )}

        {/* Mood prompt — appears when today's slot (morning/night) has
            no log yet. Soft, low-stakes ask — "take a beat" — that
            reads as an invitation, not a task. Once logged for the
            current slot, the prompt collapses (the Quick Access
            Mood Tracker card remains for review / re-logging). */}
        {!moodAlreadyLogged && (
          <TouchableOpacity
            onPress={() => { tapMedium(); navigation.navigate("MoodTracker", { petId: pet.id }); }}
            style={s.moodPrompt}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Log ${pet.name}'s mood for this ${MOOD_SLOT_LABELS[currentMoodSlot].toLowerCase()}`}
          >
            <Text style={s.moodPromptEmoji}>{currentMoodSlot === "morning" ? "🌅" : "🌙"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.moodPromptTitle}>How's {pet.name} this {MOOD_SLOT_LABELS[currentMoodSlot].toLowerCase()}?</Text>
              <Text style={s.moodPromptBody}>Tap to read their mood — patterns over time help you (and your vet) catch things early.</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={theme.accent} />
          </TouchableOpacity>
        )}

        {/* Emergency below — still findable in 2 seconds via the bold
            red card + tabular position. The everyday Pawgress action
            takes the top slot. */}
        <TouchableOpacity onPress={() => { tapHeavy(); navigation.navigate("Emergency"); }} style={s.emergencyCard} activeOpacity={0.7}>
          <View style={s.emergencyIcon}>
            <MaterialCommunityIcons name="hospital-box" size={28} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.emergencyTitle}>EMERGENCY RESOURCES</Text>
            <Text style={s.emergencySubtitle}>Poison-control hotlines · find an ER vet · pet first-aid course</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#fff" />
        </TouchableOpacity>

        <Text style={s.sectionHd}>QUICK ACCESS</Text>
        {cards.map(c => (
          <WobbleCard key={c.key}>
            <TouchableOpacity onPress={() => { tapMedium(); c.onPress(); }} style={s.card} activeOpacity={0.7}>
              <View style={[s.iconCircle, { backgroundColor: c.tint + "1f" }]}>
                <MaterialCommunityIcons name={c.icon} size={26} color={c.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle} numberOfLines={1}>{c.title}</Text>
                <Text style={s.cardSubtitle} numberOfLines={2}>{c.subtitle}</Text>
              </View>
              {c.badge ? (
                <View style={s.cardBadge}><Text style={s.cardBadgeText}>{c.badge}</Text></View>
              ) : null}
              <MaterialCommunityIcons name="chevron-right" size={22} color={theme.muted} />
            </TouchableOpacity>
          </WobbleCard>
        ))}

        {Array.isArray(breed?.tips) && breed.tips.length > 0 && (
          <>
            <Text style={s.sectionHd}>INSIDER TIPS · {isMixedBreed(pet) ? shortBreedName(primaryBreed).toUpperCase() : titleCase(primaryBreed)}</Text>
            <View style={s.tipsCard}>
              <Text style={s.tipsSub}>From owner communities, breed clubs, and vet references.</Text>
              {breed.tips.slice(0, 3).map((tip, i) => (
                <View key={i} style={s.tipRow}>
                  <Text style={s.tipBullet}>›</Text>
                  <Text style={s.tipBody}>{tip}</Text>
                </View>
              ))}
              {breed.tips.length > 3 && (
                <TouchableOpacity onPress={() => navigation.navigate("Main", { screen: "YourPets" })} style={s.tipsMore}>
                  <Text style={s.tipsMoreText}>See all {breed.tips.length} tips →</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        <View style={s.disclaimer}>
          <Text style={s.disclaimerText}>
            FloofLife guidance is not a substitute for veterinary advice. When something feels wrong, call your vet.
          </Text>
        </View>
      </View>
      <PhotoManagerSheet
        visible={showPhotoManager}
        pet={pet}
        onClose={() => setShowPhotoManager(false)}
        // PhotoManagerSheet does the storage write itself via
        // readActivePetId() at write time — onAfterChange just
        // tells us to re-pull data so the hero rotates to the
        // newly-uploaded photo and the Quick Access subtitle
        // refreshes.
        onAfterChange={async () => { await load(); }}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  hero:         { width: "92%", alignSelf: "center", height: 320, justifyContent: "flex-end", borderRadius: 22, overflow: "hidden", marginTop: 8 },
  heroStackWrap:{ alignSelf: "center", marginTop: 8 },
  heroStackEyebrow: { fontSize: 11, fontWeight: "800", color: theme.muted, letterSpacing: 1.6, marginBottom: 8, marginLeft: "4%" },
  heroImage:    { resizeMode: "cover", borderRadius: 22 },
  heroOverlay:  { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  heroContent:  { padding: 22 },
  heroEyebrow:  { fontSize: 11, fontWeight: "700", color: "#FBE4DC", letterSpacing: 1.6, marginBottom: 4 },
  heroName:     { fontSize: 38, fontWeight: "800", color: "#fff", letterSpacing: -0.5, textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  heroFamilyNames: { fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: -0.3, textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  heroFamilyName:      { color: "#fff", fontWeight: "700" },
  heroFamilyNameActive:{ color: theme.accent, fontWeight: "900", textShadowColor: "rgba(255,255,255,0.6)", textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 },
  heroMeta:     { fontSize: 14, color: "#fff", marginTop: 2, opacity: 0.95, textTransform: "capitalize" },
  heroFallback: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  heroSwitch:   { fontSize: 11, fontWeight: "700", color: "#fff", opacity: 0.95, marginTop: 6, letterSpacing: 0.6, textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  greet:        { fontSize: 22, fontWeight: "700", color: theme.fg, marginTop: 4 },
  species:      { fontSize: 13, color: theme.muted, marginTop: 4, textTransform: "capitalize" },
  progress:     { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingVertical: 14, paddingHorizontal: 16, backgroundColor: theme.accentSoft, borderRadius: 12, gap: 12 },
  progressLabel:{ color: theme.fg, fontWeight: "700", fontSize: 14, letterSpacing: 0.5 },
  progressCount:{ color: theme.accent, fontWeight: "800", fontSize: 16 },
  sectionHd:    { marginTop: 22, marginBottom: 10, fontSize: 11, fontWeight: "700", color: theme.muted, letterSpacing: 1.2 },
  // Soft shadow language across cards — makes them lift off the cream
  // background. Per build 19 smoke-test feedback ("feels a little flat
  // texturally"). Standard iOS HIG-friendly card depth: low opacity
  // black, modest radius, slight downward offset.
  emergencyCard:    { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: "#C04A2C", borderRadius: 14, marginTop: 18, gap: 14, shadowColor: "#7A2A14", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  pawgressCard:     { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: theme.card, borderRadius: 14, marginTop: 12, borderWidth: 1, borderColor: theme.line, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  moodPrompt:       { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, marginTop: 12, borderRadius: 14, backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accent + "55" },
  moodPromptEmoji:  { fontSize: 28 },
  moodPromptTitle:  { fontSize: 14, fontWeight: "800", color: theme.accent, letterSpacing: -0.2 },
  moodPromptBody:   { fontSize: 12, color: theme.fg, marginTop: 3, lineHeight: 16 },
  pawgressTitle:    { fontSize: 14, fontWeight: "700", color: theme.fg },
  pawgressSubtitle: { fontSize: 12, color: theme.muted, marginTop: 3, lineHeight: 16 },
  emergencyIcon:    { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  emergencyTitle:   { fontSize: 14, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
  emergencySubtitle:{ fontSize: 11, color: "rgba(255,255,255,0.9)", marginTop: 3, lineHeight: 15 },
  card:         { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.line, marginBottom: 10, gap: 14, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  cardBadge:    { backgroundColor: theme.red, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", marginRight: 4 },
  cardBadgeText:{ color: "#fff", fontSize: 11, fontWeight: "800" },
  iconCircle:   { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  cardTitle:    { fontSize: 16, fontWeight: "700", color: theme.fg },
  cardSubtitle: { fontSize: 12, color: theme.muted, marginTop: 2, lineHeight: 17 },
  tipsCard:     { padding: 14, backgroundColor: theme.accentSoft, borderRadius: 12, borderWidth: 1, borderColor: theme.accent + "44" },
  tipsSub:      { fontSize: 11, color: theme.muted, lineHeight: 16, marginBottom: 10, fontStyle: "italic" },
  tipRow:       { flexDirection: "row", marginBottom: 8 },
  tipBullet:    { color: theme.accent, fontWeight: "800", marginRight: 8, fontSize: 14, lineHeight: 19 },
  tipBody:      { flex: 1, fontSize: 13, color: theme.fg, lineHeight: 19 },
  tipsMore:     { marginTop: 4, alignSelf: "flex-start", paddingVertical: 4 },
  tipsMoreText: { color: theme.accent, fontWeight: "700", fontSize: 13 },
  disclaimer:   { marginTop: 24, padding: 14, borderRadius: 10, backgroundColor: theme.accentSoft },
  disclaimerText:{ fontSize: 11, color: theme.fg, lineHeight: 17 },
});
