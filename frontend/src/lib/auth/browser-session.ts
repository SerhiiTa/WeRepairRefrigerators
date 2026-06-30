import type { Session, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

type BrowserSessionReadinessResult =
  | { ok: true }
  | { ok: false; message: string };

export function sanitizeLocalRedirectPath(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}

export async function waitForBrowserSessionReadiness({
  supabase,
  session,
  timeoutMs = 8000,
}: {
  supabase: SupabaseClient<Database>;
  session: Session | null;
  timeoutMs?: number;
}): Promise<BrowserSessionReadinessResult> {
  if (session?.access_token && session.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }
  }

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    const sessionResult = await withTimeout(
      supabase.auth.getSession(),
      Math.max(250, Math.min(remainingMs, 1200)),
    );

    if (!sessionResult.ok) {
      return {
        ok: false,
        message: sessionResult.message,
      };
    }

    const { data, error } = sessionResult.value;

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    if (data.session?.access_token) {
      return { ok: true };
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return {
    ok: false,
    message:
      "Login succeeded, but this browser did not persist the session before redirecting.",
  };
}

export function navigateAfterBrowserLogin(path: string): void {
  window.location.assign(path);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const value = await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Supabase getSession timed out on this browser."));
        }, timeoutMs);
      }),
    ]);

    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Supabase getSession failed on this browser.",
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
