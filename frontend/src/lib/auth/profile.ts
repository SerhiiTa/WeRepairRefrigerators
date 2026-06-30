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
  onStep?: (step: CurrentUserProfileStep) => void;
  stepTimeoutMs?: number;
  throwOnSessionError?: boolean;
  throwOnProfileError?: boolean;
};

export type CurrentUserProfileStepName =
  | "checking_session"
  | "session_success"
  | "session_empty"
  | "session_error"
  | "loading_profile"
  | "profile_success"
  | "profile_missing"
  | "profile_error";

export type CurrentUserProfileStep = {
  name: CurrentUserProfileStepName;
  status: "checking" | "success" | "warning" | "error";
  message: string;
};

const DEFAULT_PROFILE_STEP_TIMEOUT_MS = 6000;

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

function emitProfileStep(
  onStep: ((step: CurrentUserProfileStep) => void) | undefined,
  step: CurrentUserProfileStep,
) {
  onStep?.(step);
}

function createTimeoutError(message: string): Error {
  return new Error(message);
}

async function withStepTimeout<T>({
  promise,
  timeoutMs,
  timeoutMessage,
}: {
  promise: PromiseLike<T>;
  timeoutMs: number;
  timeoutMessage: string;
}): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(createTimeoutError(timeoutMessage));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
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
  const stepTimeoutMs =
    options.stepTimeoutMs ?? DEFAULT_PROFILE_STEP_TIMEOUT_MS;

  if (!supabase) {
    return {
      status: "supabase_unavailable",
      profile: null,
      session: null,
      error: null,
    };
  }

  emitProfileStep(options.onStep, {
    name: "checking_session",
    status: "checking",
    message: "Checking Supabase browser session.",
  });

  let sessionResponse: Awaited<ReturnType<typeof supabase.auth.getSession>>;

  try {
    sessionResponse = await withStepTimeout({
      promise: supabase.auth.getSession(),
      timeoutMs: stepTimeoutMs,
      timeoutMessage:
        "Supabase auth session check timed out before returning a session.",
    });
  } catch (error) {
    const message = getProfileReadErrorMessage(error);

    emitProfileStep(options.onStep, {
      name: "session_error",
      status: "error",
      message,
    });

    if (options.throwOnSessionError) {
      throw error;
    }

    return {
      status: "logged_out",
      profile: null,
      session: null,
      error: null,
    };
  }

  const { data: sessionData, error: sessionError } = sessionResponse;

  if (sessionError) {
    emitProfileStep(options.onStep, {
      name: "session_error",
      status: "error",
      message: sessionError.message,
    });

    if (options.throwOnSessionError) {
      throw new Error(sessionError.message);
    }

    return {
      status: "logged_out",
      profile: null,
      session: null,
      error: null,
    };
  }

  const session = createAuthSessionSnapshot(sessionData.session);

  if (!session) {
    emitProfileStep(options.onStep, {
      name: "session_empty",
      status: "warning",
      message: "No active Supabase session exists in this browser origin.",
    });

    return {
      status: "logged_out",
      profile: null,
      session: null,
      error: null,
    };
  }

  emitProfileStep(options.onStep, {
    name: "session_success",
    status: "success",
    message: "Supabase session loaded.",
  });

  emitProfileStep(options.onStep, {
    name: "loading_profile",
    status: "checking",
    message: "Loading matching public.profiles row.",
  });

  try {
    type ProfileQueryResponse = {
      data: ProfileRow | null;
      error: { message: string } | null;
    };

    const { data, error } = await withStepTimeout<ProfileQueryResponse>({
      promise: supabase
        .from("profiles")
        .select(
          "id,email,full_name,role,status,role_intent,company_id,onboarding_status,onboarding_completed_at,created_at,updated_at",
        )
        .eq("id", session.user.id)
        .maybeSingle() as PromiseLike<ProfileQueryResponse>,
      timeoutMs: stepTimeoutMs,
      timeoutMessage:
        "Supabase profiles query timed out before dashboard access could be verified.",
    });

    if (error || !data) {
      const message = error?.message ?? "No matching profile row was found.";

      emitProfileStep(options.onStep, {
        name: error ? "profile_error" : "profile_missing",
        status: error ? "error" : "warning",
        message,
      });

      if (error && options.throwOnProfileError) {
        throw new Error(message);
      }

      return {
        status: "profile_unavailable",
        profile: null,
        session,
        error: message,
      };
    }

    emitProfileStep(options.onStep, {
      name: "profile_success",
      status: "success",
      message: "Profile row loaded.",
    });

    return {
      status: "profile_ready",
      profile: data,
      session: createProfileBackedSession(session, data),
      error: null,
    };
  } catch (error) {
    const message = getProfileReadErrorMessage(error);

    emitProfileStep(options.onStep, {
      name: "profile_error",
      status: "error",
      message,
    });

    if (options.throwOnProfileError) {
      throw error;
    }

    return {
      status: "profile_unavailable",
      profile: null,
      session,
      error: message,
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
