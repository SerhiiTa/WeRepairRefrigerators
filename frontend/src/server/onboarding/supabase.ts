import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "@/lib/supabase/env";
import type { Database, ProfileRow } from "@/lib/supabase/types";

import type { OnboardingActionError } from "./types";
import { createOnboardingError } from "./validation";

export type OnboardingSessionContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
  email: string | null;
  profile: ProfileRow;
};

export function createUserScopedServerClient(
  accessToken: string,
): SupabaseClient<Database> | null {
  const config = getSupabasePublicConfig();

  if (!config || !accessToken.trim()) {
    return null;
  }

  return createClient<Database>(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function requireOnboardingSession(
  accessToken: string,
): Promise<
  | { ok: true; data: OnboardingSessionContext }
  | { ok: false; error: OnboardingActionError }
> {
  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return {
      ok: false,
      error: createOnboardingError(
        "supabase_unavailable",
        "Supabase is not configured for server-side onboarding actions.",
      ),
    };
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return {
      ok: false,
      error: createOnboardingError(
        "unauthenticated",
        "A valid authenticated session is required.",
        userError?.message,
      ),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id,email,full_name,role,status,role_intent,company_id,onboarding_status,onboarding_completed_at,created_at,updated_at",
    )
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false,
      error: createOnboardingError(
        "database_error",
        "Unable to read the authenticated profile.",
        profileError.message,
      ),
    };
  }

  if (!profile) {
    return {
      ok: false,
      error: createOnboardingError(
        "profile_missing",
        "Authenticated user does not have a profile row.",
      ),
    };
  }

  return {
    ok: true,
    data: {
      supabase,
      userId: userData.user.id,
      email: userData.user.email ?? null,
      profile,
    },
  };
}
