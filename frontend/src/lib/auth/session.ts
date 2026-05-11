import type { Session, User } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "../supabase/client";
import { getSupabaseServerClient } from "../supabase/server";
import {
  isVerifiedTechnicianRole,
  normalizeAppRole,
  normalizeAuthProfileStatus,
} from "./roles";
import type { AppRole, AuthSessionSnapshot, AuthUserProfile } from "./types";

type AuthMetadata = Record<string, unknown>;

function getMetadataValue(
  user: User,
  key: "role" | "status" | "company_id",
): unknown {
  const appMetadata = user.app_metadata as AuthMetadata;
  const userMetadata = user.user_metadata as AuthMetadata;

  return appMetadata[key] ?? userMetadata[key];
}

export function createAuthUserProfile(user: User): AuthUserProfile {
  const role = normalizeAppRole(getMetadataValue(user, "role"));
  const status = normalizeAuthProfileStatus(getMetadataValue(user, "status"));
  const companyId = getMetadataValue(user, "company_id");

  return {
    id: user.id,
    email: user.email ?? null,
    role,
    status,
    companyId: typeof companyId === "string" ? companyId : null,
    isVerifiedTechnician:
      isVerifiedTechnicianRole(role) || status === "verified",
  };
}

export function createAuthSessionSnapshot(
  session: Session | null,
): AuthSessionSnapshot | null {
  if (!session?.user) {
    return null;
  }

  return {
    user: createAuthUserProfile(session.user),
    expiresAt: session.expires_at ?? null,
  };
}

export async function getBrowserAuthSession(): Promise<AuthSessionSnapshot | null> {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    return null;
  }

  return createAuthSessionSnapshot(data.session);
}

export async function getServerAuthSession(): Promise<AuthSessionSnapshot | null> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    return null;
  }

  return createAuthSessionSnapshot(data.session);
}

export function getRoleFromSession(
  session: AuthSessionSnapshot | null,
): AppRole {
  return session?.user.role ?? "public_visitor";
}
