// Supabase client — the single source for any code that needs to call
// Supabase Auth, Postgres (REST/RPC), Storage, or Edge Functions from
// the app.
//
// The client is intentionally tolerant of missing env vars: if either
// EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is unset,
// `supabase` is `null` and `isSupabaseConfigured()` returns false.
// Account/cloud-sync UI keys off that and shows a "not yet configured"
// state — the rest of the app keeps working fully local.
//
// Per docs/security-non-negotiables.md Rule 1, ONLY the anon key
// ships in the client. The service-role key never leaves Supabase
// Edge Functions.
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export function isSupabaseConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export const supabase = isSupabaseConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // RN has no URL parsing for OAuth callbacks; SIWA goes through
        // the native flow, not the web redirect. So no URL detection.
        detectSessionInUrl: false,
      },
    })
  : null;

// The Supabase project URL — useful for constructing Edge Function URLs
// in callers that need to bypass the SDK (e.g., short-lived presigned
// upload URLs are minted by an Edge Function and the result is fetched
// directly).
export function supabaseUrl() {
  return SUPABASE_URL || null;
}
