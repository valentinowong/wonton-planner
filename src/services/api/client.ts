import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "Supabase credentials are missing. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.",
  );
}

const isWeb = Platform.OS === "web";
const isBrowser = typeof window !== "undefined";

const authOptions = isBrowser
  ? {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: isWeb,
      storage: isWeb ? undefined : AsyncStorage,
    }
  : {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    };

export const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "", {
  auth: authOptions,
});
