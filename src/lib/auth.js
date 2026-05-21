// Auth provider + hook. Wraps Supabase Auth's session and surfaces the
// three sign-in paths the app supports:
//   - Sign in with Apple (primary on iOS — App Store 4.8 requirement)
//   - Email + password (fallback for users who refuse Apple ID)
//   - Sign up (email + password)
//
// Sign-out and account deletion also live here so call sites have a
// single import. Per docs/features/accounts-and-migration.md, account
// creation is a SOFT prompt — the app works fully offline with no
// session, so every consumer must tolerate `user: null`.
//
// On every successful sign-in (Apple or email), we call
// Purchases.logIn(supabaseUserId) so RevenueCat aliases the anonymous
// entitlement to the new account. This is the mechanism that prevents
// existing payers from ever seeing a new paywall after upgrading.

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import Purchases from "react-native-purchases";
import { supabase, isSupabaseConfigured } from "./supabase";
import { track } from "./analytics";

const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  configured: false,
  signInWithApple: async () => ({ error: new Error("Auth not configured") }),
  signInWithEmail: async () => ({ error: new Error("Auth not configured") }),
  signUpWithEmail: async () => ({ error: new Error("Auth not configured") }),
  signOut: async () => {},
  deleteAccount: async () => ({ error: new Error("Auth not configured") }),
});

// Best-effort RevenueCat aliasing. Failures don't block sign-in —
// Premium gating still works through the existing anon RC user until
// the next aliasing attempt succeeds. We surface the result so callers
// (test paths, smoke tests) can assert it landed when needed.
async function aliasRevenueCat(supabaseUserId) {
  if (!supabaseUserId) return { ok: false, reason: "no_user_id" };
  try {
    const result = await Purchases.logIn(supabaseUserId);
    // RC returns { customerInfo, created } — `created` true if this is
    // the first time RC has seen this app-user-id. Either way, the
    // entitlement state is now keyed to the account.
    return { ok: true, customerInfo: result?.customerInfo, created: !!result?.created };
  } catch (err) {
    return { ok: false, reason: err?.message || "rc_login_failed" };
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    // Restore any persisted session from AsyncStorage. supabase-js
    // does this on construction, but we wait for it explicitly so the
    // UI can show a spinner until we know whether the user is signed in.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session ?? null);
      setLoading(false);
      // If a session restored, re-alias RC — covers the cold-start
      // case where the app was killed between RC's anon-init and the
      // last sign-in. Idempotent.
      if (data.session?.user?.id) {
        aliasRevenueCat(data.session.user.id);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession ?? null);
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe?.();
    };
  }, [configured]);

  const signInWithApple = useCallback(async () => {
    if (!configured) return { error: new Error("Auth not configured") };
    if (Platform.OS !== "ios") return { error: new Error("Sign in with Apple is iOS only") };
    try {
      const available = await AppleAuthentication.isAvailableAsync();
      if (!available) return { error: new Error("Sign in with Apple is not available on this device") };
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        return { error: new Error("No identity token returned by Apple") };
      }
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });
      if (error) return { error };
      const userId = data?.user?.id;
      if (userId) {
        await aliasRevenueCat(userId);
        track("auth_signed_in", { method: "apple", created: !!data?.user?.created_at });
      }
      return { data };
    } catch (err) {
      // Apple's "user cancelled" reads as ERR_REQUEST_CANCELED — bubble
      // up so the UI can ignore it silently instead of showing an error.
      if (err?.code === "ERR_REQUEST_CANCELED") {
        return { error: { cancelled: true, message: "Cancelled" } };
      }
      return { error: err };
    }
  }, [configured]);

  const signInWithEmail = useCallback(async (email, password) => {
    if (!configured) return { error: new Error("Auth not configured") };
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };
    const userId = data?.user?.id;
    if (userId) {
      await aliasRevenueCat(userId);
      track("auth_signed_in", { method: "email", created: false });
    }
    return { data };
  }, [configured]);

  const signUpWithEmail = useCallback(async (email, password) => {
    if (!configured) return { error: new Error("Auth not configured") };
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error };
    // Supabase returns user + session when email-confirmations are
    // disabled (default for new projects). When they're enabled the
    // session is null until the user confirms via email.
    const userId = data?.user?.id;
    if (userId && data?.session) {
      await aliasRevenueCat(userId);
      track("auth_signed_in", { method: "email_signup", created: true });
    } else {
      track("auth_email_confirmation_required");
    }
    return { data };
  }, [configured]);

  const signOut = useCallback(async () => {
    if (!configured) return;
    try {
      await supabase.auth.signOut();
    } catch { /* swallow */ }
    // Hand RevenueCat back to an anonymous identity so the next user
    // on this device doesn't inherit the prior user's entitlement.
    try {
      await Purchases.logOut();
    } catch { /* swallow — already anon, or RC not configured */ }
    track("auth_signed_out");
  }, [configured]);

  const deleteAccount = useCallback(async () => {
    if (!configured) return { error: new Error("Auth not configured") };
    if (!session) return { error: new Error("Not signed in") };
    try {
      // Account deletion runs server-side: an Edge Function deletes
      // auth.users (cascades to per-user data rows) + the Storage
      // objects under pets/<user_id>/. The function authenticates via
      // the user's JWT; the client cannot delete itself directly
      // because RLS doesn't expose auth.users to anon/authenticated.
      const { data, error } = await supabase.functions.invoke("account-delete", { body: {} });
      if (error) return { error };
      // Local sign-out + RC anon-flip happens AFTER the server confirms
      // deletion so a partial failure doesn't leave the user signed out
      // of an account that still exists.
      await signOut();
      track("auth_account_deleted");
      return { data };
    } catch (err) {
      return { error: err };
    }
  }, [configured, session, signOut]);

  const value = {
    user: session?.user ?? null,
    session,
    loading,
    configured,
    signInWithApple,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    deleteAccount,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
