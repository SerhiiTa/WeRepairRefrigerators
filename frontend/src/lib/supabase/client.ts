import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

let browserClient: SupabaseClient<Database> | null = null;

type BrowserAuthLock = <R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>,
) => Promise<R>;

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

function getLocalStorageDiagnostics(): {
  available: boolean;
  error: string | null;
} {
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

const browserAuthLock: BrowserAuthLock = async (_name, _acquireTimeout, fn) => {
  // Keep auth reads deterministic in local dev browsers without adding a second
  // storage system. Supabase Auth and RLS are still enforced by Supabase.
  return fn();
};

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

export function getSupabaseBrowserRuntimeDiagnostics() {
  const localStorage = getLocalStorageDiagnostics();

  return {
    windowAvailable: typeof window !== "undefined",
    origin:
      typeof window === "undefined" ? "server" : window.location.origin,
    hostname:
      typeof window === "undefined" ? "server" : window.location.hostname,
    protocol:
      typeof window === "undefined" ? "server" : window.location.protocol,
    localStorageAvailable: localStorage.available,
    localStorageError: localStorage.error,
  };
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
      browserClient = createClient<Database>(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "wrfr-supabase-auth-token",
          lock: browserAuthLock,
          lockAcquireTimeout: 3000,
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
