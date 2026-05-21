// Your Pets — multi-pet view sorted oldest-first. Each pet card shows
// avatar (tap to set/change photo), name, breed badge, breed summary
// + insider tips. Tap "Add another pet" to onboard a second.
import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image, RefreshControl, Linking, Alert, LayoutAnimation, Platform, UIManager, StyleSheet } from "react-native";

// Enable LayoutAnimation on Android (iOS has it on by default).
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pets } from "../lib/storage";
import { useActivePet } from "../lib/activePet";
import { pickPhotoForSlot, MAX_PHOTOS_PER_PET } from "../lib/petPhotos";
import { usePurchases } from "../lib/purchasesContext";
import { getPetBreeds, getPrimaryBreed, mixedBreedLabel, isMixedBreed, shortBreedName } from "../lib/petBreeds";
import { findType, statusFor, daysUntilDue } from "../lib/healthRecordTypes";
import { CONDITION_BY_ID } from "../data/conditions";
import { breedFacts, breedDisplayName, breedAdjective, breedEmoji } from "../data/breeds";
import { LIFESTYLE_QUESTIONS, LIFESTYLE_DISPLAY } from "../data/lifestyleQuestions";
import { track } from "../lib/analytics";
import { tapLight, tapMedium } from "../lib/haptics";
import PhotoManagerSheet from "../components/PhotoManagerSheet";
import PetAvatar from "../components/PetAvatar";
import { theme } from "../theme";

const titleCase = s => (s || "").split(" ").map(w => w[0]?.toUpperCase() + w.slice(1)).join(" ");

function HealthTrackerRow({ pet, navigation }) {
  const [records, setRecords] = useState([]);
  useEffect(() => {
    let mounted = true;
    Pets.listHealthRecords(pet.id).then((r) => { if (mounted) setRecords(r); });
    return () => { mounted = false; };
  }, [pet.id]);
  const overdue = records.filter((r) => statusFor(r) === "overdue").length;
  const next = records
    .filter((r) => r?.nextDue && statusFor(r) !== "overdue")
    .sort((a, b) => new Date(a.nextDue) - new Date(b.nextDue))[0];
  const subtitle = (() => {
    if (records.length === 0) return "No records yet — tap to add";
    if (next) {
      const days = daysUntilDue(next);
      const t = findType(next.type);
      const label = next.customLabel || t?.label || "Next";
      if (days != null && days >= 0) {
        return `${label} due in ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"}`}`;
      }
    }
    return overdue > 0 ? `${overdue} overdue · tap to review` : "Up to date";
  })();
  return (
    <TouchableOpacity onPress={() => navigation.navigate("HealthTracker", { petId: pet.id })} style={s.healthRow} activeOpacity={0.7}>
      <View style={s.healthRowIcon}>
        <MaterialCommunityIcons name="clipboard-pulse-outline" size={18} color={theme.green} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.healthRowTitle}>Health Tracker</Text>
        <Text style={s.healthRowSubtitle}>{subtitle}</Text>
      </View>
      {overdue > 0 && (
        <View style={s.healthRowBadge}><Text style={s.healthRowBadgeText}>{overdue}</Text></View>
      )}
      <MaterialCommunityIcons name="chevron-right" size={20} color={theme.muted} />
    </TouchableOpacity>
  );
}

// Health Conditions row — entry point to per-pet condition guides
// (FIV, FeLV, ...). Shows what's on file, or a soft invite to add a
// diagnosis. Same row pattern as HealthTrackerRow.
function ConditionsRow({ pet, navigation }) {
  const [conditions, setConditions] = useState([]);
  useEffect(() => {
    let mounted = true;
    Pets.listConditions(pet.id).then((r) => { if (mounted) setConditions(r); });
    return () => { mounted = false; };
  }, [pet.id]);
  const subtitle = conditions.length === 0
    ? "Tracking a diagnosis? Tap for care guidance"
    : conditions
        .map((c) => CONDITION_BY_ID[c.conditionId]?.shortLabel || CONDITION_BY_ID[c.conditionId]?.label)
        .filter(Boolean)
        .join(" · ") + " · tap for care guidance";
  return (
    <TouchableOpacity onPress={() => navigation.navigate("Conditions", { petId: pet.id })} style={s.healthRow} activeOpacity={0.7}>
      <View style={[s.healthRowIcon, { backgroundColor: theme.accent + "1f" }]}>
        <MaterialCommunityIcons name="heart-pulse" size={18} color={theme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.healthRowTitle}>Health Conditions</Text>
        <Text style={s.healthRowSubtitle}>{subtitle}</Text>
      </View>
      {conditions.length > 0 && (
        <View style={[s.healthRowBadge, { backgroundColor: theme.accent }]}>
          <Text style={s.healthRowBadgeText}>{conditions.length}</Text>
        </View>
      )}
      <MaterialCommunityIcons name="chevron-right" size={20} color={theme.muted} />
    </TouchableOpacity>
  );
}

export default function YourPetsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [pets, setPets] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [aboutOpen, setAboutOpen] = useState({});
  const [healthOpen, setHealthOpen] = useState({});
  const [tipsOpen, setTipsOpen] = useState({});
  const [sourcesOpen, setSourcesOpen] = useState({});
  const [originStoryOpen, setOriginStoryOpen] = useState({});
  const [lifestyleOpen, setLifestyleOpen] = useState({});
  // Pet ID currently being edited in the photo manager sheet, or null.
  const [photoMgrPetId, setPhotoMgrPetId] = useState(null);
  const { isPremium } = usePurchases();
  // Reactive active-pet — keeps activeId in sync if the user switched
  // floofs via the floof fan or anywhere else while this tab was idle.
  const { petId: liveActivePetId } = useActivePet();

  // Scroll-to-active: when the user lands on this screen via a path
  // that names a specific floof (Quick Access "My Floofs" card on
  // Home, ActivePetChip in any pet-scoped header, fan release that
  // routes here), the active pet's card should slide into view —
  // not leave the user staring at the eldest pet at the top scrolled
  // and having to manually find the floof they tapped.
  //
  // Pattern: each pet card calls onLayout with its top y-offset; we
  // remember that in a ref-keyed-by-pet-id map, then animate the
  // ScrollView to (yOffset - sticky-padding) when the screen
  // focuses with an active pet that isn't the eldest one.
  const scrollRef = useRef(null);
  const cardYOffsetsRef = useRef({});
  const lastScrolledForRef = useRef(null);

  function toggleAbout(sectionId) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAboutOpen(prev => {
      // All My Floofs sections default COLLAPSED — cleaner first
      // impression on the screen. Tap to expand.
      const currentlyExpanded = prev[sectionId] ?? false;
      const next = !currentlyExpanded;
      if (next) track("about_breed_expanded");
      return { ...prev, [sectionId]: next };
    });
    tapLight();
  }

  function toggleHealth(sectionId) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHealthOpen(prev => {
      const next = !prev[sectionId];
      if (next) track("health_considerations_expanded");
      return { ...prev, [sectionId]: next };
    });
    tapLight();
  }

  function toggleSubSection(setter, sectionId, eventName) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setter(prev => {
      const next = !prev[sectionId];
      if (next && eventName) track(eventName);
      return { ...prev, [sectionId]: next };
    });
    tapLight();
  }

  const load = useCallback(async () => {
    const list = await Pets.listSortedOldestFirst();
    setPets(list);
    let active = await Pets.getActiveId();
    // If active id is missing or stale, fall back to the oldest pet so
    // the visual indicator matches what Pet.get() would resolve to.
    if (!active || !list.find(p => p.id === active)) {
      active = list[0]?.id || null;
    }
    setActiveId(active);
  }, [liveActivePetId]);
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Scroll the active pet's card into view whenever the screen gains
  // focus with a non-eldest active floof selected. Eldest is already
  // at the top — no scroll needed there. Skip if we already scrolled
  // for this same activeId in this focus session, so we don't fight
  // a user who manually scrolls afterward.
  useFocusEffect(
    useCallback(() => {
      if (!activeId || pets.length === 0) return;
      // Don't re-scroll if we already nudged for this active pet.
      if (lastScrolledForRef.current === activeId) return;
      const idx = pets.findIndex((p) => p.id === activeId);
      if (idx <= 0) {
        // Eldest is at the top; just remember we "handled" this one.
        lastScrolledForRef.current = activeId;
        return;
      }
      // Layout positions are populated by onLayout on each card.
      // Wait one tick so the ScrollView has measured its children.
      const timer = setTimeout(() => {
        const y = cardYOffsetsRef.current[activeId];
        if (typeof y === "number" && scrollRef.current?.scrollTo) {
          // Subtract a small offset so the card isn't flush against
          // the very top — leaves the active badge visible.
          scrollRef.current.scrollTo({ y: Math.max(0, y - 12), animated: true });
          lastScrolledForRef.current = activeId;
        }
      }, 220);
      // On blur, drop the scroll-memo so the next focus re-scrolls
      // even if the user lands on the same active pet — they may
      // have manually scrolled elsewhere on the list and expect to
      // be brought back to the active card on re-entry.
      return () => {
        clearTimeout(timer);
        lastScrolledForRef.current = null;
      };
    }, [activeId, pets]),
  );

  // Avatar tap opens the labeled photo-manager sheet so the user
  // sees their existing 5 prompt slots (with labels matching the
  // first-run onboarding reel) and can fill, replace, or remove any
  // of them — including users who created their pet before the
  // multi-photo feature shipped, who would otherwise never see the
  // labeled prompts. The actual pickPetPhoto call lives inside the
  // sheet now, scoped per slot.
  // Opening the photo manager always activates the chosen pet
  // first. PhotoManagerSheet resolves write target via
  // readActivePetId() at upload time, so opening for a
  // not-currently-active pet (e.g., user is on Bella's card while
  // Max is the active pet) needs to flip active to that pet up
  // front. Otherwise uploads would land on the active pet, not
  // the one whose card was tapped.
  async function openPhotoManager(petId) {
    if (!petId) return;
    try {
      await Pets.setActive(petId);
      setActiveId(petId);
    } catch { /* swallow */ }
    setPhotoMgrPetId(petId);
    tapMedium();
  }

  function editPet(petId) {
    track("pet_edit_opened");
    tapLight();
    navigation.navigate("EditPet", { petId });
  }

  // Whole-card-tap to select active pet (per build 19 smoke-test
  // feedback). Tap the NAME row → editPet (above). Tap the PHOTO →
  // changePhoto (above). Tap anywhere else on the card (whitespace,
  // breed/age meta, breed cards' empty space) → activate that pet.
  // Inner TouchableOpacity handlers catch their own taps before this
  // bubbles up, so nested-pressable behavior is what we want.
  async function activatePetFromCard(petId) {
    if (!petId) return;
    if (petId === activeId) {
      // Already active — give a light haptic acknowledgment but don't
      // re-trigger storage write or navigation.
      tapLight();
      return;
    }
    await Pets.setActive(petId);
    setActiveId(petId);
    track("active_pet_switched", { source: "my_floofs_card", pet_count: pets.length });
    tapMedium();
  }

  function addAnotherPet() {
    if (!isPremium) {
      Alert.alert(
        "Multi-floof is a Premium feature",
        "Upgrade to add a second (or third, or fifth) floof to FloofLife. Each gets their own breed-tailored checklist.",
        [
          { text: "Maybe later" },
          { text: "See Premium", onPress: () => navigation.navigate("Premium") },
        ],
      );
      return;
    }
    navigation.navigate("AddPet");
  }

  if (pets.length === 0) {
    return (
      <View style={s.empty}>
        <View style={s.emptyIconCircle}>
          <Text style={{ fontSize: 72 }}>🐾</Text>
        </View>
        <Text style={s.emptyTitle}>Welcome to FloofLife</Text>
        <Text style={s.emptyBody}>
          Here to help you keep your Floof thriving. Add your first floof and we'll personalize a weekly checklist, breed-specific health considerations, and insider tips just for them.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate("AddPet")}
          style={s.emptyCTA}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Add your first floof"
        >
          <MaterialCommunityIcons name="plus-circle" size={22} color="#fff" />
          <Text style={s.emptyCTAText}>Add your first floof</Text>
        </TouchableOpacity>
        <Text style={s.emptyDisclaimer}>
          We don't share your pet's info with anyone. Your data stays on this device unless you choose to back it up to your account.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 60, paddingHorizontal: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <TouchableOpacity onPress={addAnotherPet} style={s.addBtn} activeOpacity={0.8}>
        <MaterialCommunityIcons name="plus-circle-outline" size={22} color={theme.accent} />
        <Text style={s.addBtnText}>Add another floof</Text>
        {!isPremium && (
          <View style={s.premiumBadge}>
            <Text style={s.premiumBadgeText}>PREMIUM</Text>
          </View>
        )}
      </TouchableOpacity>

      <Text style={s.intro}>
        💝 The pets you love, sorted oldest first — they've been around the longest, they get the spotlight.
      </Text>

      {pets.map((pet, idx) => {
        const breedKeys = getPetBreeds(pet);
        const primary = getPrimaryBreed(pet);
        const isMix = isMixedBreed(pet);
        const mixLabel = mixedBreedLabel(pet);
        const isMultiPet = pets.length > 1;
        const isActive = isMultiPet && activeId === pet.id;
        // Multi-pet cards are tappable as a whole (whitespace + body)
        // to set this pet as active. Single-pet households render a
        // static View since there's no other pet to switch to. Inner
        // pressables (photo, name, breed-card sections) capture their
        // own taps and don't bubble up — RN's touch-responder system
        // handles this without explicit propagation guards.
        const CardWrap = isMultiPet ? TouchableOpacity : View;
        const cardWrapProps = isMultiPet
          ? { onPress: () => activatePetFromCard(pet.id), activeOpacity: 0.92 }
          : {};
        return (
          <CardWrap
            key={pet.id || idx}
            {...cardWrapProps}
            onLayout={(e) => {
              // Capture this card's y-offset within the ScrollView so
              // the focus-time scroll-to-active effect can land on it.
              const y = e?.nativeEvent?.layout?.y;
              if (pet?.id && typeof y === "number") {
                cardYOffsetsRef.current[pet.id] = y;
              }
            }}
            style={[s.petCard, isActive && s.petCardActive]}
            accessibilityRole={isMultiPet ? "button" : undefined}
            accessibilityLabel={isMultiPet ? `Make ${pet.name} the active floof` : undefined}
            accessibilityState={isMultiPet ? { selected: isActive } : undefined}
          >
            {isActive && (
              <View style={s.activeBadge}><Text style={s.activeBadgeText}>✓ ACTIVE</Text></View>
            )}
            {idx === 0 && isMultiPet && (
              <View style={s.eldestBadge}><Text style={s.eldestBadgeText}>👑 ELDEST</Text></View>
            )}
            {isMultiPet && !isActive && (
              <Text style={s.tapToSwitchHint}>Tap card to switch active floof</Text>
            )}

            <View style={{ alignItems: "center", marginTop: 4 }}>
              {(() => {
                // Card avatar rotates per session across the pet's
                // photos[] (PetAvatar handles slot rotation + branded
                // fallback for photoless pets).
                const photos = Array.isArray(pet.photos)
                  ? pet.photos.filter((u) => typeof u === "string" && u.length > 0)
                  : (pet.photoUri ? [pet.photoUri] : []);
                const photoCount = photos.length;
                return (
                  <>
                    <TouchableOpacity onPress={() => openPhotoManager(pet.id)} activeOpacity={0.7} style={s.avatarWrap}>
                      <PetAvatar pet={pet} size={88} slot="card" showName={photoCount === 0} />
                      <View style={s.avatarBadge}>
                        <MaterialCommunityIcons name="camera" size={16} color="#fff" />
                      </View>
                    </TouchableOpacity>
                    <Text style={s.avatarHint}>
                      {photoCount > 0
                        ? `Tap to manage photos · ${photoCount}/${MAX_PHOTOS_PER_PET}`
                        : "Tap to add the 5 photos that tell their story"}
                    </Text>
                  </>
                );
              })()}
            </View>

            {/* Pet name is the dedicated tap target → opens Edit. The rest
                of the card is informational. Active-pet switching has
                moved to the nav-bar pet chip and the title-tap on
                pet-scoped screens. */}
            <TouchableOpacity
              onPress={() => editPet(pet.id)}
              activeOpacity={0.6}
              style={s.petNameRow}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${pet.name}`}
            >
              <Text style={s.petName}>{pet.name}</Text>
              <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.accent} style={{ marginLeft: 8 }} />
            </TouchableOpacity>
            <Text style={s.petMeta}>
              {mixLabel || titleCase(primary)} {pet.species} · {pet.ageYears} yr{pet.weightLbs ? ` · ${pet.weightLbs} lb` : ""}
            </Text>
            {pet.mixOf && <Text style={s.mixMeta}>Mix of: {pet.mixOf}</Text>}

            <HealthTrackerRow pet={pet} navigation={navigation} />
            <ConditionsRow pet={pet} navigation={navigation} />

            {/* Lifestyle card — collapsed by default. Shows answered
                questions if pet.lifestyle has any entries; shows a
                CTA to fill the questionnaire (jumps into EditPet)
                when empty. Same toggle pattern as the breed cards. */}
            {(() => {
              const lifestyle = (pet && typeof pet.lifestyle === "object" && pet.lifestyle) || {};
              const answered = LIFESTYLE_QUESTIONS.filter((q) => {
                const v = lifestyle[q.key];
                return q.type === "multi" ? Array.isArray(v) && v.length > 0 : !!v;
              });
              const total = LIFESTYLE_QUESTIONS.length;
              const expanded = !!lifestyleOpen[pet.id];
              if (answered.length === 0) {
                return (
                  <TouchableOpacity
                    onPress={() => editPet(pet.id)}
                    style={s.lifestyleEmpty}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="clipboard-text-outline" size={18} color={theme.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.lifestyleEmptyTitle}>Tell us about {pet.name}</Text>
                      <Text style={s.lifestyleEmptyBody}>Activity, food, tummy, vet, health — quick taps, all skippable.</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={theme.accent} />
                  </TouchableOpacity>
                );
              }
              return (
                <View style={s.breedCard}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setLifestyleOpen((prev) => ({ ...prev, [pet.id]: !prev[pet.id] }));
                      tapLight();
                    }}
                    style={s.breedHeader}
                  >
                    {/* Non-breaking spaces between "N", "of", "M" keep
                        the count token together so we never get an
                        orphaned "of 12" on its own line. Same chevron
                        affordance as the About / Health / Tips cards
                        below so the row is consistent + compact. */}
                    <Text style={s.breedTitle} numberOfLines={2}>{`🐾 ${pet.name}'s lifestyle · ${answered.length} of ${total}`}</Text>
                    <MaterialCommunityIcons
                      name={expanded ? "chevron-up" : "chevron-down"}
                      size={22}
                      color={theme.muted}
                    />
                  </TouchableOpacity>
                  {expanded && (
                    <>
                      {answered.map((q) => {
                        const display = LIFESTYLE_DISPLAY[q.key] || { valueToLabel: {} };
                        const valueToLabel = display.valueToLabel || {};
                        const v = lifestyle[q.key];
                        let valueText = "";
                        if (q.type === "multi") {
                          valueText = (Array.isArray(v) ? v : [])
                            .map((x) => valueToLabel[x] || String(x))
                            .filter(Boolean)
                            .join(", ");
                        } else {
                          valueText = valueToLabel[v] || (v == null ? "" : String(v));
                        }
                        return (
                          <View key={q.key} style={s.lifestyleAnswerRow}>
                            <Text style={s.lifestyleAnswerLabel}>{q.title.replace(/\{pet\}/g, pet.name || "")}</Text>
                            <Text style={s.lifestyleAnswerValue}>{valueText || "—"}</Text>
                          </View>
                        );
                      })}
                      <TouchableOpacity onPress={() => editPet(pet.id)} style={s.lifestyleEditBtn} activeOpacity={0.7}>
                        <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.accent} />
                        <Text style={s.lifestyleEditBtnText}>Edit answers</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              );
            })()}

            {breedKeys.map((breedKey) => {
              const breed = breedFacts[breedKey];
              if (!breed?.about && !breed?.summary) return null;
              const sectionId = `${pet.id}:${breedKey}`;
              const aboutExpanded = aboutOpen[sectionId] ?? false;
              const healthExpanded = !!healthOpen[sectionId];
              const originStoryExpanded = !!originStoryOpen[sectionId];
              const sourcesExpanded = !!sourcesOpen[sectionId];
              return (
                <React.Fragment key={breedKey}>
                  {/* About card — default expanded; warm narrative + origin
                      + collapsible origin story + collapsible sources +
                      brachy warning. NO medical content. */}
                  <View style={s.breedCard}>
                    {isMix && (
                      <View style={s.breedSectionHd}>
                        <Text style={s.breedChipEmoji}>{breedEmoji(breedKey)}</Text>
                        <Text style={s.breedSectionLabel}>{shortBreedName(breedKey).toUpperCase()}</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => toggleAbout(sectionId)}
                      style={s.breedHeader}
                    >
                      <Text style={s.breedTitle} numberOfLines={2}>About {breedDisplayName(breedKey)}</Text>
                      <MaterialCommunityIcons
                        name={aboutExpanded ? "chevron-up" : "chevron-down"}
                        size={22}
                        color={theme.muted}
                      />
                    </TouchableOpacity>
                    {aboutExpanded && (<>
                      {breed.origin && <Text style={s.breedOrigin}>📍 {breed.origin}</Text>}
                      <Text style={s.breedBody}>{breed.about ?? breed.summary}</Text>
                      {breed.originStory && (
                        <View style={{ marginTop: 10 }}>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => toggleSubSection(setOriginStoryOpen, sectionId, "origin_story_expanded")}
                            style={s.subSectionHeader}
                          >
                            <Text style={s.subSectionTitle} numberOfLines={2}>📖 Origin Story · How the {breedDisplayName(breedKey)} became the {breedDisplayName(breedKey)}</Text>
                            <Text style={s.subSectionHint}>{originStoryExpanded ? "Hide" : "Show"}</Text>
                          </TouchableOpacity>
                          {originStoryExpanded && (
                            <Text style={[s.breedBody, { marginTop: 8, fontStyle: "italic" }]}>
                              {breed.originStory}
                            </Text>
                          )}
                        </View>
                      )}
                      {(breed.origin || breed.originStory) && (
                        <Text style={s.originNote}>
                          Origin information reflects current scholarly consensus where available, and acknowledged debate where it exists.
                        </Text>
                      )}
                      {Array.isArray(breed.references) && breed.references.length > 0 && (
                        <View style={{ marginTop: 12 }}>
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => toggleSubSection(setSourcesOpen, sectionId, "sources_expanded")}
                            style={s.subSectionHeader}
                          >
                            <Text style={s.subSectionTitle}>📚 Sources · {breed.references.length} {breed.references.length === 1 ? "reference" : "references"}</Text>
                            <Text style={s.subSectionHint}>{sourcesExpanded ? "Hide" : "Show"}</Text>
                          </TouchableOpacity>
                          {sourcesExpanded && (
                            <View style={{ marginTop: 4 }}>
                              {breed.references.map((r, i) => (
                                <TouchableOpacity key={i} onPress={() => Linking.openURL(r.url)} style={{ paddingVertical: 4 }}>
                                  <Text style={s.breedRefText}>↗ {r.label}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </View>
                      )}
                      {breed.brachycephalic && (
                        <View style={s.brachyWarn}>
                          <Text style={s.brachyText}>
                            ⚠ Short-snout (brachycephalic) breed. Most airlines refuse them as cargo, heat above 80°F is dangerous, and BOAS surgery is a common breed-specific intervention.
                          </Text>
                        </View>
                      )}
                    </>)}
                  </View>

                  {/* Health Considerations card — default collapsed; serious,
                      audit-quality medical content. Only the header toggles
                      the section; the expanded list is plain text (no per-
                      item caret) so users don't think the bullets are
                      tappable. (Build 46 fix: the entire card used to be a
                      TouchableOpacity, which made the › bullets feel
                      clickable + every tap collapsed the section.) */}
                  {Array.isArray(breed.health) && breed.health.length > 0 && (
                    <View style={s.healthCard}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => toggleHealth(sectionId)}
                        style={s.cardHeaderClean}
                      >
                        <Text style={s.cardHeaderEmoji}>💛</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.cardHeaderTitle}>Health Considerations</Text>
                          <Text style={s.cardHeaderSubtitle} numberOfLines={2}>
                            {breed.health.length} to know about for {breedDisplayName(breedKey)}
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name={healthExpanded ? "chevron-up" : "chevron-down"}
                          size={22}
                          color={theme.muted}
                        />
                      </TouchableOpacity>
                      {healthExpanded && (
                        <View style={{ marginTop: 10 }}>
                          {breed.healthSummary ? (
                            <Text style={s.healthIntro}>{breed.healthSummary}</Text>
                          ) : (
                            <Text style={s.healthIntro}>
                              Every breed has health patterns worth knowing — being aware lets you screen early and stay ahead of issues.
                            </Text>
                          )}
                          {breed.health.map((h, i) => (
                            <View key={i} style={s.healthItem}>
                              <Text style={s.healthBody}>{h}</Text>
                            </View>
                          ))}
                          <Text style={s.healthFooter}>
                            Discuss screening cadence with your vet — most of these are catchable early.
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </React.Fragment>
              );
            })}

            {breedKeys.map((breedKey) => {
              const breed = breedFacts[breedKey];
              if (!Array.isArray(breed?.tips) || breed.tips.length === 0) return null;
              const sectionId = `${pet.id}:${breedKey}`;
              const tipsExpanded = !!tipsOpen[sectionId];
              return (
                <View key={`tips-${breedKey}`} style={s.tipsCard}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => toggleSubSection(setTipsOpen, sectionId, "insider_tips_expanded")}
                    style={s.cardHeaderClean}
                  >
                    <Text style={s.cardHeaderEmoji}>💡</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardHeaderTitle}>Insider Tips</Text>
                      <Text style={s.cardHeaderSubtitle} numberOfLines={2}>
                        {breed.tips.length} {breed.tips.length === 1 ? "thing" : "things"} only {breedAdjective(breedKey)} owners know
                      </Text>
                    </View>
                    <MaterialCommunityIcons
                      name={tipsExpanded ? "chevron-up" : "chevron-down"}
                      size={22}
                      color={theme.muted}
                    />
                  </TouchableOpacity>
                  {tipsExpanded && (
                    <>
                      <Text style={s.tipsSub}>From owner communities, breed clubs, and vet references.</Text>
                      {breed.tips.map((tip, i) => (
                        <View key={i} style={s.tipRow}>
                          <Text style={s.tipBullet}>›</Text>
                          <Text style={s.tipBody}>{tip}</Text>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              );
            })}
          </CardWrap>
        );
      })}

      <View style={s.disclaimer}>
        <Text style={s.disclaimerText}>
          FloofLife guidance is not a substitute for veterinary advice. When something feels wrong, call your vet.
        </Text>
      </View>
      <PhotoManagerSheet
        visible={!!photoMgrPetId}
        pet={pets.find((p) => p.id === photoMgrPetId) || null}
        onClose={() => setPhotoMgrPetId(null)}
        // openPhotoManager (above) calls Pets.setActive on the
        // tapped pet BEFORE setting photoMgrPetId, so by the time
        // PhotoManagerSheet writes via readActivePetId() it lands
        // on the correct (active) pet. This callback just tells
        // us to refresh so the card avatar rotates to the new
        // photo.
        onAfterChange={async () => { await load(); }}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  empty:        { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, backgroundColor: theme.bg },
  emptyIconCircle:{ width: 140, height: 140, borderRadius: 70, backgroundColor: theme.accentSoft, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.accent + "33" },
  emptyTitle:   { fontSize: 24, fontWeight: "800", color: theme.fg, marginTop: 22, letterSpacing: -0.4 },
  emptyBody:    { fontSize: 14, color: theme.muted, marginTop: 10, textAlign: "center", lineHeight: 21, paddingHorizontal: 16 },
  emptyCTA:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12, backgroundColor: theme.accent, marginTop: 28 },
  emptyCTAText: { color: "#fff", fontWeight: "700", fontSize: 15, letterSpacing: 0.3 },
  emptyDisclaimer:{ fontSize: 11, color: theme.muted, marginTop: 16, textAlign: "center", fontStyle: "italic" },
  intro:        { fontSize: 13, color: theme.muted, marginBottom: 14, lineHeight: 19 },
  petCard:      { backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.line, padding: 18, marginBottom: 16, position: "relative", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  petCardActive:{ borderColor: theme.accent, borderWidth: 2 },
  activeBadge:  { position: "absolute", top: 12, left: 12, backgroundColor: theme.accent, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tapToSwitchHint:{ fontSize: 10, color: theme.muted, fontStyle: "italic", textAlign: "center", marginTop: 28, marginBottom: -4, letterSpacing: 0.3 },
  activeBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  petNameRow:   { flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 12 },
  eldestBadge:  { position: "absolute", top: 12, right: 12, backgroundColor: theme.accent, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  eldestBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  avatarWrap:    { position: "relative" },
  avatar:        { width: 130, height: 130, borderRadius: 65, borderWidth: 3, borderColor: theme.accent + "55" },
  avatarFallback:{ width: 130, height: 130, borderRadius: 65, backgroundColor: theme.accentSoft, alignItems: "center", justifyContent: "center" },
  avatarBadge:   { position: "absolute", bottom: 4, right: 4, width: 32, height: 32, borderRadius: 16, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: theme.card },
  avatarHint:    { fontSize: 11, color: theme.muted, marginTop: 8, fontStyle: "italic" },
  petName:       { fontSize: 26, fontWeight: "800", color: theme.fg, textAlign: "center", textTransform: "capitalize" },
  petMeta:       { fontSize: 13, color: theme.muted, marginTop: 4, textAlign: "center", textTransform: "capitalize" },
  mixMeta:       { fontSize: 12, color: theme.accent, marginTop: 4, textAlign: "center", fontStyle: "italic" },
  breedCard:     { marginTop: 16, padding: 14, backgroundColor: theme.bg, borderRadius: 12, borderWidth: 1, borderColor: theme.line },
  lifestyleEmpty:        { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: theme.accentSoft, borderWidth: 1, borderColor: theme.accent + "55" },
  lifestyleEmptyTitle:   { fontSize: 14, fontWeight: "700", color: theme.accent },
  lifestyleEmptyBody:    { fontSize: 12, color: theme.fg, marginTop: 2, lineHeight: 17 },
  lifestyleAnswerRow:    { paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.line },
  lifestyleAnswerLabel:  { fontSize: 12, fontWeight: "700", color: theme.muted, letterSpacing: 0.2 },
  lifestyleAnswerValue:  { fontSize: 14, color: theme.fg, marginTop: 3, lineHeight: 19, textTransform: "capitalize" },
  lifestyleEditBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 14, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: theme.accentSoft, alignSelf: "center" },
  lifestyleEditBtnText:  { color: theme.accent, fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  breedSectionHd:{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  breedSectionLabel:{ fontSize: 10, fontWeight: "800", color: theme.accent, letterSpacing: 1.4 },
  breedChipEmoji:{ fontSize: 14 },
  breedHeader:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  breedTitle:    { flex: 1, fontWeight: "700", color: theme.fg, fontSize: 16 },
  breedHeaderHint:{ flexShrink: 0, fontSize: 11, color: theme.accent, fontWeight: "600" },
  breedOrigin:   { fontSize: 11, color: theme.muted, fontWeight: "600", marginBottom: 8, letterSpacing: 0.3 },
  originNote:    { fontSize: 10, color: theme.muted, fontStyle: "italic", marginTop: 8, lineHeight: 14 },
  breedBody:     { fontSize: 13, color: theme.muted, lineHeight: 19 },
  breedRefHd:    { fontSize: 10, fontWeight: "800", color: theme.muted, letterSpacing: 1, marginBottom: 6 },
  breedRefText:  { fontSize: 12, color: theme.accent, fontWeight: "600" },
  brachyWarn:    { marginTop: 12, padding: 10, backgroundColor: "#FCE9C8", borderRadius: 8, borderWidth: 1, borderColor: "#E0A82E" },
  brachyText:    { fontSize: 12, color: "#5A3F0A", lineHeight: 18 },
  healthDisclosure:{ marginTop: 12, padding: 12, backgroundColor: theme.bg, borderRadius: 10, borderWidth: 1, borderColor: theme.line },
  healthCard:      { marginTop: 12, padding: 14, backgroundColor: theme.card, borderRadius: 12, borderWidth: 1, borderColor: theme.line },
  cardHeaderClean: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardHeaderEmoji: { fontSize: 22 },
  cardHeaderTitle: { fontSize: 15, fontWeight: "800", color: theme.fg, letterSpacing: -0.2 },
  cardHeaderSubtitle: { fontSize: 12, color: theme.muted, marginTop: 2 },
  healthHeader:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  healthHeaderText:{ flex: 1, fontSize: 13, fontWeight: "700", color: theme.fg },
  healthHeaderHint:{ flexShrink: 0, fontSize: 11, color: theme.accent, fontWeight: "600" },
  healthIntro:     { fontSize: 12, color: theme.muted, lineHeight: 17, marginBottom: 8 },
  // Considerations items — flat text rows with no bullet, no padding,
  // no border. Reads as paragraphs, NOT tappable rows. (Build 46 fix:
  // the previous `s.healthRow` definition further down in this file
  // collided with this one in object-literal order — the LAST
  // definition won, so each item rendered with padding+border+bg and
  // looked like a clickable card.)
  healthItem:      { marginBottom: 10 },
  healthBody:      { fontSize: 13, color: theme.fg, lineHeight: 19 },
  healthFooter:    { fontSize: 11, color: theme.muted, fontStyle: "italic", marginTop: 6, lineHeight: 16 },
  tipsCard:      { marginTop: 12, padding: 14, backgroundColor: theme.accentSoft, borderRadius: 12, borderWidth: 1, borderColor: theme.accent + "44" },
  tipsHeader:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  tipsTitle:     { flex: 1, fontWeight: "800", color: theme.fg, fontSize: 14 },
  tipsHeaderHint:{ flexShrink: 0, fontSize: 11, color: theme.accent, fontWeight: "600" },
  tipsSub:       { fontSize: 11, color: theme.muted, lineHeight: 16, marginTop: 6, marginBottom: 10, fontStyle: "italic" },
  subSectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 4 },
  subSectionTitle: { flex: 1, fontSize: 12, fontWeight: "700", color: theme.fg, letterSpacing: 0.2 },
  subSectionHint:  { flexShrink: 0, fontSize: 11, color: theme.accent, fontWeight: "600" },
  tipRow:        { flexDirection: "row", marginBottom: 8 },
  tipBullet:     { color: theme.accent, fontWeight: "800", marginRight: 8, fontSize: 14, lineHeight: 19 },
  tipBody:       { flex: 1, fontSize: 13, color: theme.fg, lineHeight: 19 },
  addBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, borderRadius: 12, borderWidth: 2, borderColor: theme.accent, borderStyle: "dashed", backgroundColor: theme.bg, marginTop: 4 },
  addBtnText:    { color: theme.accent, fontWeight: "700", fontSize: 14 },
  premiumBadge:  { backgroundColor: theme.accent, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginLeft: 4 },
  premiumBadgeText:{ color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  healthRow:     { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginTop: 14, borderRadius: 12, backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.line },
  healthRowIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: theme.green + "1f" },
  healthRowTitle:{ fontSize: 14, fontWeight: "700", color: theme.fg },
  healthRowSubtitle:{ fontSize: 11, color: theme.muted, marginTop: 2 },
  healthRowBadge:{ backgroundColor: theme.red, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", marginRight: 4 },
  healthRowBadgeText:{ color: "#fff", fontSize: 11, fontWeight: "800" },
  disclaimer:    { marginTop: 16, padding: 14, borderRadius: 10, backgroundColor: theme.accentSoft },
  disclaimerText:{ fontSize: 11, color: theme.fg, lineHeight: 17 },
});
