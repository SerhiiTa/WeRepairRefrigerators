import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

let browserClient: SupabaseClient<Database> | null = null;

type SupabaseBrowserClientResult =
  | {
      status: "ready";
      client: SupabaseClient<Database>;
      error: null;
    }
  | {
      status: "unavailable" | "error";
      client: null;
      error: string;
    };

const memoryStorage = new Map<string, string>();

function readSupabaseBrowserEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "",
  };
}

function hasSupabaseBrowserEnv(): boolean {
  const env = readSupabaseBrowserEnv();

  return env.url.length > 0 && env.anonKey.length > 0;
}

function getSupabaseBrowserConfig(): { url: string; anonKey: string } | null {
  const env = readSupabaseBrowserEnv();

  if (!env.url || !env.anonKey) {
    return null;
  }

  return env;
}

function canUseLocalStorage(): { available: boolean; error: string | null } {
  if (typeof window === "undefined") {
    return {
      available: false,
      error: "window is unavailable",
    };
  }

  try {
    const testKey = "wrfr:supabase-storage-test";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return {
      available: true,
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      error:
        error instanceof Error
          ? error.message
          : "localStorage is blocked or unavailable",
    };
  }
}

function createMemoryStorage(): Storage {
  return {
    get length() {
      return memoryStorage.size;
    },
    clear() {
      memoryStorage.clear();
    },
    getItem(key) {
      return memoryStorage.get(key) ?? null;
    },
    key(index) {
      return Array.from(memoryStorage.keys())[index] ?? null;
    },
    removeItem(key) {
      memoryStorage.delete(key);
    },
    setItem(key, value) {
      memoryStorage.set(key, value);
    },
  };
}

function formatClientError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Supabase browser client failed to initialize.";
}

export function isSupabaseBrowserConfigured(): boolean {
  return hasSupabaseBrowserEnv();
}

export function getSupabaseBrowserClientResult(): SupabaseBrowserClientResult {
  const config = getSupabaseBrowserConfig();

  if (!config) {
    return {
      status: "unavailable",
      client: null,
      error: "Supabase browser client is not configured in this browser bundle.",
    };
  }

  if (!browserClient) {
    try {
      const storageCheck = canUseLocalStorage();

      browserClient = createClient<Database>(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          ...(storageCheck.available
            ? {}
            : { storage: createMemoryStorage() }),
          storageKey: "wrfr-supabase-auth-token",
        },
      });
    } catch (error) {
      return {
        status: "error",
        client: null,
        error: formatClientError(error),
      };
    }
  }

  return {
    status: "ready",
    client: browserClient,
    error: null,
  };
}

export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  const result = getSupabaseBrowserClientResult();

  return result.client;
}
