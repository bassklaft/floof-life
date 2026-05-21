import React, { useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, TouchableOpacity, View, Text, Platform } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { initAnalytics, screen as trackScreen, track } from "./src/lib/analytics";
import { initHaptics, tapLight, tapMedium, tapHeavy } from "./src/lib/haptics";
import { Pets } from "./src/lib/storage";
import FloofFanOverlay from "./src/components/FloofFanOverlay";
import MyFloofsTabButton from "./src/components/MyFloofsTabButton";
import PawIcon from "./src/components/PawIcon";
import GuidedTour from "./src/components/GuidedTour";
import AppHeader from "./src/components/AppHeader";
import { computeFanCenters, hitTestFan } from "./src/lib/fanGeometry";
import { useActivePet } from "./src/lib/activePet";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Bumped from _v1 → _v2 with the v1.2.0 release so existing users
// (who already dismissed v1's text-bullet tutorial) see the new
// visual guided tour fresh once after updating. Future content
// updates that warrant a re-show should bump this again.
const TUTORIAL_SEEN_KEY = "pawrent_tutorial_seen_v2";

import Logo from "./src/components/Logo";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import HomeScreen from "./src/screens/HomeScreen";
import YourPetsScreen from "./src/screens/YourPetsScreen";
import ChecklistScreen from "./src/screens/ChecklistScreen";
import ToxicScreen from "./src/screens/ToxicScreen";
import VetsScreen from "./src/screens/VetsScreen";
import DietScreen from "./src/screens/DietScreen";
import RecallsScreen from "./src/screens/RecallsScreen";
import TripScreen from "./src/screens/TripScreen";
import TrainingScreen from "./src/screens/TrainingScreen";
import RiskScreen from "./src/screens/RiskScreen";
import EmergencyScreen from "./src/screens/EmergencyScreen";
import DogAgeScreen from "./src/screens/DogAgeScreen";
import PremiumScreen from "./src/screens/PremiumScreen";
import HealthTrackerScreen from "./src/screens/HealthTrackerScreen";
import AddHealthRecordScreen from "./src/screens/AddHealthRecordScreen";
import PawgressScreen from "./src/screens/PawgressScreen";
import TummyTrackerScreen from "./src/screens/TummyTrackerScreen";
import LogStoolScreen from "./src/screens/LogStoolScreen";
import LogDietScreen from "./src/screens/LogDietScreen";
import MoodTrackerScreen from "./src/screens/MoodTrackerScreen";
import ExportFloofDataScreen from "./src/screens/ExportFloofDataScreen";
import FloofAssistantScreen from "./src/screens/FloofAssistantScreen";
import ConditionsScreen from "./src/screens/ConditionsScreen";
import AboutScreen from "./src/screens/AboutScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { PurchasesProvider } from "./src/lib/purchasesContext";
import { AuthProvider } from "./src/lib/auth";
import AccountScreen from "./src/screens/AccountScreen";
import CloudSyncStatusScreen from "./src/screens/CloudSyncStatusScreen";
import AccountSoftPrompt from "./src/components/AccountSoftPrompt";
import { recordSession } from "./src/lib/accountPrompt";
import ChurnFeedbackGate from "./src/components/ChurnFeedbackGate";
import { theme } from "./src/theme";

const RootStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

// Tiny child of SafeAreaProvider whose only job is to read the
// bottom safe-area inset and report it back to App.js (which lives
// outside the provider and can't useSafeAreaInsets directly). The
// fan-out gesture math needs the bottom inset to position circles
// correctly above the tab bar.
function FanInsetSentinel({ onBottom }) {
  const insets = useSafeAreaInsets();
  useEffect(() => { onBottom?.(insets.bottom); }, [insets.bottom, onBottom]);
  return null;
}

function HamburgerLeft({ navigation }) {
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate("Settings")}
      style={{ paddingHorizontal: 14, paddingVertical: 6 }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <MaterialCommunityIcons name="menu" size={26} color={theme.fg} />
    </TouchableOpacity>
  );
}

function tabIcon(routeName) {
  return function TabIcon({ focused, color }) {
    const isHome = routeName === "Home";
    const size = isHome ? 30 : 24;
    // Tab bar paws use the canonical PawIcon — same silhouette as
    // the Logo header but without the green-check badge (per Max's
    // spec: dock icons stay identical to the brand mark minus the
    // checkmark). Focused / unfocused is signalled via color, not
    // a separate outline glyph.
    return (
      <View style={isHome ? { marginTop: -4 } : null}>
        <PawIcon size={size} color={color} />
      </View>
    );
  };
}

// Three tabs: Checklist | Home (center) | Your Pets. Home is the hub
// that links out to Toxic, Vets, Diet, Recalls (each pushed from the
// root stack, not in the tab bar).
function MainTabs({
  navigation,
  onMyFloofsLongPress,
  onFanLongPressStart,
  onFanLongPressMove,
  onFanLongPressEnd,
  onFanShortTap,
  fanCenters,
}) {
  return (
    <Tabs.Navigator
      initialRouteName="Home"
      screenOptions={({ route, navigation: tabNav }) => ({
        headerStyle: { backgroundColor: theme.bg, shadowColor: "transparent" },
        headerTitleStyle: { color: theme.fg, fontWeight: "700" },
        headerTitleAlign: "center",
        headerLeft: () => <HamburgerLeft navigation={navigation} />,
        // Logo always centered in the header — tapping jumps to Home tab.
        headerTitle: () => <Logo onPress={() => tabNav.navigate("Home")} />,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.line,
          height: Platform.OS === "ios" ? 86 : 64,
          paddingTop: 6,
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", letterSpacing: 0.3 },
        tabBarIcon: tabIcon(route.name),
      })}
    >
      <Tabs.Screen name="Checklist" component={ChecklistScreen}
        options={{ title: "This Week", tabBarLabel: "Pawgress" }}
        listeners={{ tabPress: () => tapHeavy() }} />
      <Tabs.Screen name="Home"
        options={{ title: "FloofLife", tabBarLabel: "Home" }}
        listeners={{ tabPress: () => tapHeavy() }}>
        {(props) => <HomeScreen {...props} onShowFloofFan={onMyFloofsLongPress} />}
      </Tabs.Screen>
      <Tabs.Screen name="YourPets"  component={YourPetsScreen}
        options={{
          title: "My Floofs",
          tabBarLabel: "My Floofs",
          // Custom tab button so the long-press → slide → release
          // gesture is one continuous touch session (not split into
          // long-press-then-lift-then-tap). The default tab button
          // fires `tabLongPress` as a discrete event which forces a
          // touch handoff that breaks the continuous-slide UX.
          tabBarButton: (btnProps) => (
            <MyFloofsTabButton
              {...btnProps}
              onShortTap={() => tapLight()}
              onLongPressStart={() => {
                onFanLongPressStart?.();
              }}
              onLongPressMove={(x, y) => {
                onFanLongPressMove?.(x, y);
              }}
              onLongPressEnd={(x, y) => {
                onFanLongPressEnd?.(x, y);
              }}
            />
          ),
        }} />
    </Tabs.Navigator>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const navRef = useRef(null);
  const lastRouteRef = useRef(null);

  useEffect(() => {
    (async () => {
      const profile = await AsyncStorage.getItem("pawrent_pet");
      setOnboarded(!!profile);
      setReady(true);
      // First-run tutorial: show once after the user has a pet but
      // hasn't yet seen the welcome card. Per build 19 smoke-test
      // feedback ("brief tutorial for new users").
      if (profile) {
        const seen = await AsyncStorage.getItem(TUTORIAL_SEEN_KEY);
        if (!seen) {
          // Slight delay so the home screen is rendered before the
          // overlay appears — the user sees the app behind the modal.
          setTimeout(() => setTutorialVisible(true), 400);
        }
      }
    })();
  }, []);

  async function dismissTutorial() {
    setTutorialVisible(false);
    await AsyncStorage.setItem(TUTORIAL_SEEN_KEY, "1");
  }

  useEffect(() => { initAnalytics(); }, []);
  useEffect(() => { initHaptics(); }, []);
  // Bump the cold-start session counter for the account soft-prompt.
  // The 3rd session is itself a value moment (see lib/accountPrompt).
  useEffect(() => { recordSession(); }, []);

  // Watch active-pet state — if the active id becomes null AND the
  // pets list is empty (e.g., the user just deleted their last
  // floof from EditPet → Delete), route back to onboarding so the
  // app doesn't sit in an empty-active state. Pets.remove
  // auto-rotates to the next-up pet when there's one remaining,
  // so this listener only fires for the genuinely-empty case.
  const { petId: activePetId } = useActivePet();
  useEffect(() => {
    if (activePetId != null) return;
    if (!onboarded) return;
    (async () => {
      const list = await Pets.list();
      if (list.length === 0) {
        setOnboarded(false);
        try { await AsyncStorage.removeItem("pawrent_pet"); } catch { /* swallow */ }
      }
    })();
  }, [activePetId, onboarded]);

  // Floof fan-out state. Hoisted to App root so the gesture (long-
  // press → slide → release) can be one continuous touch session
  // owned by the custom My Floofs tab button. The button calls
  // these handlers in sequence; this component drives the visual
  // state of FloofFanOverlay accordingly.
  const [longPressSwitcherVisible, setLongPressSwitcherVisible] = useState(false);
  const [longPressPets, setLongPressPets] = useState([]);
  const [longPressActiveId, setLongPressActiveId] = useState(null);
  const [longPressHoveredId, setLongPressHoveredId] = useState(null);
  // Cached fan-circle centers, recomputed when pets change. Used by
  // the move/end handlers to hit-test touch coordinates.
  const fanCentersRef = useRef([]);
  const safeAreaBottomRef = useRef(0);
  // Refs so the handlers (passed as props) see latest values without
  // re-creating the closure on every render.
  const longPressVisibleRef = useRef(false);
  const longPressPetsRef = useRef([]);
  const longPressActiveIdRef = useRef(null);
  const longPressHoveredIdRef = useRef(null);
  longPressVisibleRef.current = longPressSwitcherVisible;
  longPressPetsRef.current = longPressPets;
  longPressActiveIdRef.current = longPressActiveId;
  longPressHoveredIdRef.current = longPressHoveredId;

  // Safety auto-close: if the fan-out has been visible for more
  // than 10s without a release, force-close it. Defends against
  // any path where the PanResponder loses its release event (system
  // gesture interrupt, multitasking, or any iOS-side regression
  // we haven't yet identified). Should never fire in normal use —
  // the user releases their finger within ~1-2s.
  useEffect(() => {
    if (!longPressSwitcherVisible) return;
    const t = setTimeout(() => {
      setLongPressSwitcherVisible(false);
      setLongPressHoveredId(null);
    }, 10000);
    return () => clearTimeout(t);
  }, [longPressSwitcherVisible]);

  async function handleFanLongPressStart() {
    const list = await Pets.listSortedOldestFirst();
    if (list.length <= 1) return; // no-op for single-pet households
    let active = await Pets.getActiveId();
    if (!active || !list.find((p) => p.id === active)) {
      active = list[0]?.id || null;
    }
    setLongPressPets(list);
    setLongPressActiveId(active);
    setLongPressHoveredId(null);
    setLongPressSwitcherVisible(true);
    fanCentersRef.current = computeFanCenters(list, safeAreaBottomRef.current);
    tapMedium();
    track("active_pet_switcher_opened", { source: "tab_long_press" });
  }

  function handleFanLongPressMove(x, y) {
    if (!longPressVisibleRef.current) return;
    const hit = hitTestFan(x, y, fanCentersRef.current);
    if (hit !== longPressHoveredIdRef.current) {
      setLongPressHoveredId(hit);
      if (hit) tapLight();
    }
  }

  async function handleFanLongPressEnd(x, y) {
    if (!longPressVisibleRef.current) {
      // Long-press never opened the fan (e.g., single-pet household).
      // Nothing to commit.
      return;
    }
    const picked = hitTestFan(x, y, fanCentersRef.current);
    setLongPressSwitcherVisible(false);
    setLongPressHoveredId(null);
    if (picked && picked !== longPressActiveIdRef.current) {
      try {
        await Pets.setActive(picked);
        track("active_pet_switched", {
          source: "tab_long_press",
          pet_count: longPressPetsRef.current.length,
        });
        tapLight();
        if (navRef.current?.navigate) {
          try { navRef.current.navigate("Main", { screen: "Home" }); } catch {}
        }
      } catch { /* swallow */ }
    }
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.accent} />
        <Text style={{ marginTop: 12, color: theme.muted }}>Loading…</Text>
      </View>
    );
  }

  // Shared push-screen options (Toxic, Vets, Diet, Recalls, Settings).
  //
  // Uses a custom JS `header` component (AppHeader) instead of the
  // native UINavigationBar. iOS 26 auto-applies a "Liquid Glass"
  // capsule background behind every native nav-bar button, which
  // the user kept circling as a "white border around the floof
  // icon" in builds 43-45 even after we removed the chip's own
  // border. A JS header bypasses iOS 26's button-appearance entirely.
  const pushScreenOptions = {
    headerShown: true,
    header: (props) => <AppHeader {...props} />,
    // The below options are kept for backwards-compat / accessibility
    // fallbacks but are not used by AppHeader directly.
    headerStyle: { backgroundColor: theme.bg },
    headerTitleStyle: { color: theme.fg, fontWeight: "700" },
    headerTintColor: theme.accent,
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
      <PurchasesProvider>
      <NavigationContainer
        ref={navRef}
        onReady={() => {
          const route = navRef.current?.getCurrentRoute?.();
          if (route?.name) {
            lastRouteRef.current = route.name;
            trackScreen(route.name);
          }
        }}
        onStateChange={() => {
          const route = navRef.current?.getCurrentRoute?.();
          if (route?.name && route.name !== lastRouteRef.current) {
            lastRouteRef.current = route.name;
            trackScreen(route.name);
          }
        }}
      >
        <RootStack.Navigator
          screenOptions={{ headerShown: false }}
          screenListeners={{
            transitionEnd: (e) => {
              // Haptic on back-navigation (swipe-from-left-edge OR
              // header back-button OR programmatic goBack). Native-
              // stack emits transitionEnd with data.closing=true when
              // a screen is being popped. Light tap so it confirms
              // the gesture without being noisy.
              if (e?.data?.closing) tapLight();
            },
          }}
        >
          {!onboarded ? (
            <RootStack.Screen name="Onboarding">
              {(props) => <OnboardingScreen {...props} onDone={() => {
                setOnboarded(true);
                // Show tutorial after a brief delay so Home renders
                // before the welcome modal appears.
                setTimeout(() => setTutorialVisible(true), 400);
              }} />}
            </RootStack.Screen>
          ) : (
            <>
              <RootStack.Screen name="Main">
                {(props) => (
                  <MainTabs
                    {...props}
                    // Discrete open used by FloofCardStack's
                    // hold-on-stack path (the in-stack alternative
                    // to the long-press-on-tab gesture). The
                    // continuous slide-to-pick path goes through
                    // onFanLongPress* below.
                    onMyFloofsLongPress={handleFanLongPressStart}
                    onFanLongPressStart={handleFanLongPressStart}
                    onFanLongPressMove={handleFanLongPressMove}
                    onFanLongPressEnd={handleFanLongPressEnd}
                  />
                )}
              </RootStack.Screen>
              <RootStack.Screen name="Toxic"    component={ToxicScreen}    options={{ ...pushScreenOptions, title: "Toxic Foods & Plants" }} />
              <RootStack.Screen name="Vets"     component={VetsScreen}     options={{ ...pushScreenOptions, title: "Vets Near Me" }} />
              <RootStack.Screen name="Diet"     component={DietScreen}     options={{ ...pushScreenOptions, title: "Diet & Care" }} />
              <RootStack.Screen name="Recalls"  component={RecallsScreen}  options={{ ...pushScreenOptions, title: "Recalls & Class Actions" }} />
              <RootStack.Screen name="Trip"     component={TripScreen}     options={{ ...pushScreenOptions, title: "Trip Planning" }} />
              <RootStack.Screen name="Training" component={TrainingScreen} options={{ ...pushScreenOptions, title: "Training Exercises" }} />
              <RootStack.Screen name="Risk"     component={RiskScreen}     options={{ ...pushScreenOptions, title: "Risk Map" }} />
              <RootStack.Screen name="Emergency" component={EmergencyScreen} options={{ ...pushScreenOptions, title: "Emergency Resources" }} />
              <RootStack.Screen name="DogAge"   component={DogAgeScreen}   options={{ ...pushScreenOptions, title: "Age Calculator" }} />
              <RootStack.Screen name="HealthTracker"   component={HealthTrackerScreen}   options={{ ...pushScreenOptions, title: "Health Tracker" }} />
              <RootStack.Screen name="AddHealthRecord" component={AddHealthRecordScreen} options={{ ...pushScreenOptions, presentation: "modal", title: "Health Record" }} />
              <RootStack.Screen name="Pawgress"        component={PawgressScreen}        options={{ ...pushScreenOptions, presentation: "modal", title: "Pawgress" }} />
              <RootStack.Screen name="TummyTracker"    component={TummyTrackerScreen}    options={{ ...pushScreenOptions, title: "Tummy Tracker" }} />
              <RootStack.Screen name="LogStool"        component={LogStoolScreen}        options={{ ...pushScreenOptions, presentation: "modal", title: "Log a poop" }} />
              <RootStack.Screen name="LogDiet"         component={LogDietScreen}         options={{ ...pushScreenOptions, presentation: "modal", title: "Log a meal" }} />
              <RootStack.Screen name="MoodTracker"     component={MoodTrackerScreen}     options={{ ...pushScreenOptions, title: "Mood" }} />
              <RootStack.Screen name="ExportFloofData" component={ExportFloofDataScreen} options={{ ...pushScreenOptions, presentation: "modal", title: "Export Floof Data" }} />
              <RootStack.Screen name="FloofAssistant"  component={FloofAssistantScreen}  options={{ ...pushScreenOptions, title: "Ask the Floof Assistant" }} />
              <RootStack.Screen name="Conditions"      component={ConditionsScreen}      options={{ ...pushScreenOptions, title: "Health Conditions" }} />
              <RootStack.Screen name="About"    component={AboutScreen}    options={{ ...pushScreenOptions, title: "About FloofLife" }} />
              <RootStack.Screen name="AddPet"   options={{ ...pushScreenOptions, presentation: "modal", title: "Add a floof" }}>
                {(props) => <OnboardingScreen {...props} addMode onDone={() => props.navigation.goBack()} />}
              </RootStack.Screen>
              <RootStack.Screen name="EditPet"  options={{ ...pushScreenOptions, presentation: "modal", title: "Edit floof" }}>
                {(props) => (
                  <OnboardingScreen
                    {...props}
                    editMode
                    editPetId={props.route?.params?.petId}
                    onDone={() => props.navigation.goBack()}
                  />
                )}
              </RootStack.Screen>
              <RootStack.Screen name="Premium"  component={PremiumScreen}  options={{ ...pushScreenOptions, presentation: "modal", title: "Premium" }} />
              <RootStack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ ...pushScreenOptions, presentation: "modal", title: "Settings" }}
              />
              <RootStack.Screen
                name="Account"
                component={AccountScreen}
                options={{ ...pushScreenOptions, presentation: "modal", title: "Account" }}
              />
              <RootStack.Screen
                name="CloudSyncStatus"
                component={CloudSyncStatusScreen}
                options={{ ...pushScreenOptions, presentation: "modal", title: "Cloud Backup" }}
              />
            </>
          )}
        </RootStack.Navigator>
      </NavigationContainer>
      {/* Churn-feedback prompt — opens after a cancelled trial /
          subscription, or the 2nd app open with no subscription.
          Lives inside PurchasesProvider so it can read RevenueCat
          state; stays dormant until the backend URL is configured. */}
      <ChurnFeedbackGate onboarded={onboarded} />
      {/* Soft-prompt for cloud accounts (v2.0). Skippable — encourages
          but doesn't require sign-in. Stays dormant if Supabase env
          vars are unset or the user has already dismissed it once. */}
      <AccountSoftPrompt onboarded={onboarded} navRef={navRef} />
      </PurchasesProvider>
      </AuthProvider>
      {/* Long-press-on-My-Floofs-tab fan-out overlay. Pet profile-photo
          circles fan in an arc from above the My Floofs tab; tap a
          circle to switch active pet. Rendered at App root so it
          overlays any tab. Single-pet households never see it
          (showLongPressSwitcher early-returns). */}
      <FanInsetSentinel onBottom={(b) => { safeAreaBottomRef.current = b; }} />
      <FloofFanOverlay
        visible={longPressSwitcherVisible}
        onClose={() => setLongPressSwitcherVisible(false)}
        pets={longPressPets}
        activeId={longPressActiveId}
        hoveredId={longPressHoveredId}
        bottomInset={safeAreaBottomRef.current}
      />
      {/* First-run tutorial — shown once after onboarding completes,
          plus once for any existing user who hasn't seen it (the
          AsyncStorage flag is the gate). Tap "Got it" → flag is set
          and the overlay never re-appears. */}
      <GuidedTour
        visible={tutorialVisible}
        onClose={dismissTutorial}
      />
    </SafeAreaProvider>
  );
}
