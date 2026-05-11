import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  getSupabasePublicConfig,
  hasSupabasePublicConfig,
  warnIfSupabaseEnvMissing,
} from "./env";
import type { Database } from "./types";

export function isSupabaseServerConfigured(): boolean {
  return hasSupabasePublicConfig();
}

export function getSupabaseServerClient(): SupabaseClient<Database> | null {
  const config = getSupabasePublicConfig();

  if (!config) {
    warnIfSupabaseEnvMissing("Server client");
    return null;
  }

  return createClient<Database>(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
