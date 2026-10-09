import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

if (!config.supabase.url || !config.supabase.anonKey || !config.supabase.serviceRoleKey) {
  throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required");
}

const authOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
} as const;

export const supabase = createClient(
  config.supabase.url,
  config.supabase.anonKey,
  authOptions
);

export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  authOptions
);
