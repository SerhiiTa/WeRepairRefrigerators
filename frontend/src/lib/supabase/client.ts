import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  getSupabasePublicConfig,
  hasSupabasePublicConfig,
  warnIfSupabaseEnvMissing,
} from "./env";
import type { Database } from "./types";

let browserClient: SupabaseClient<Database> | null = null;

export function isSupabaseBrowserConfigured(): boolean {
  return hasSupabasePublicConfig();
}

export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  const config = getSupabasePublicConfig();

  if (!config) {
    warnIfSupabaseEnvMissing("Browser client");
    return null;
  }

  if (!browserClient) {
    browserClient = createClient<Database>(config.url, config.anonKey);
  }

  return browserClient;
}
