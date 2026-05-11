import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "../supabase/client";
import { getSupabaseServerClient } from "../supabase/server";
import type { Database, ProfileRow } from "../supabase/types";
import {
  createDashboardIdentityState,
  type DashboardIdentityState,
} from "./dashboard-identity";
import {
  isVerifiedTechnicianRole,
  normalizeAppRole,
  normalizeAuthProfileStatus,
} from "./roles";
import { createAuthSessionSnapshot } from "./session";
import type { AuthSessionSnapshot, AuthUserProfile } from "./types";

export type ProfileReadSource = "browser" | "server";

export type CurrentUserProfileResult =
  | {
      status: "supabase_unavailable";
      profile: null;
      session: null;
      error: null;
    }
  | {
      status: "logged_out";
      profile: null;
      session: null;
      error: null;
    }
  | {
      status: "profile_unavailable";
      profile: null;
      session: AuthSessionSnapshot;
      error: string | null;
    }
  | {
      status: "profile_ready";
      profile: ProfileRow;
      session: AuthSessionSnapshot;
      error: null;
    };

type GetCurrentUserProfileOptions = {
  source?: ProfileReadSource;
  client?: SupabaseClient<Database> | null;
};

function getProfileClient(
  source: ProfileReadSource,
): SupabaseClient<Database> | null {
  return source === "server"
    ? getSupabaseServerClient()
    : getSupabaseBrowserClient();
}

function getProfileReadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Profile read is unavailable in mock mode.";
}

function createProfileBackedSession(
  session: AuthSessionSnapshot,
  profile: ProfileRow,
): AuthSessionSnapshot {
  const role = normalizeAppRole(profile.role);
  const status = normalizeAuthProfileStatus(profile.status);

  const user: AuthUserProfile = {
    id: profile.id,
    email: profile.email ?? session.user.email,
    role,
    status,
    companyId: profile.company_id,
    isVerifiedTechnician:
      isVerifiedTechnicianRole(role) || status === "verified",
  };

  return {
    user,
    expiresAt: session.expiresAt,
  };
}

// Real profile reads require supabase/migrations/0001_profiles_roles.sql to be
// reviewed and applied. Until then this helper returns safe fallback states so
// the frontend can keep running with mock data and no route protection changes.
export async function getCurrentUserProfile(
  options: GetCurrentUserProfileOptions = {},
): Promise<CurrentUserProfileResult> {
  const source = options.source ?? "browser";
  const supabase = options.client ?? getProfileClient(source);

  if (!supabase) {
    return {
      status: "supabase_unavailable",
      profile: null,
      session: null,
      error: null,
    };
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    return {
      status: "logged_out",
      profile: null,
      session: null,
      error: null,
    };
  }

  const session = createAuthSessionSnapshot(sessionData.session);

  if (!session) {
    return {
      status: "logged_out",
      profile: null,
      session: null,
      error: null,
    };
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id,email,full_name,role,status,role_intent,company_id,created_at,updated_at",
      )
      .eq("id", session.user.id)
      .maybeSingle();

    if (error || !data) {
      return {
        status: "profile_unavailable",
        profile: null,
        session,
        error: error?.message ?? null,
      };
    }

    return {
      status: "profile_ready",
      profile: data,
      session,
      error: null,
    };
  } catch (error) {
    return {
      status: "profile_unavailable",
      profile: null,
      session,
      error: getProfileReadErrorMessage(error),
    };
  }
}

export function mapProfileToDashboardIdentity({
  profile,
  session,
  supabaseAvailable = true,
}: {
  profile: ProfileRow | null;
  session: AuthSessionSnapshot | null;
  supabaseAvailable?: boolean;
}): DashboardIdentityState {
  if (!profile || !session) {
    return createDashboardIdentityState({ session, supabaseAvailable });
  }

  return createDashboardIdentityState({
    session: createProfileBackedSession(session, profile),
    supabaseAvailable,
  });
}
