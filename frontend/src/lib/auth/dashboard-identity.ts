import {
  canAccessAdmin,
  canAccessOpenJobs,
  canAccessPrivateCommunity,
  canManageCompany,
  canPublishPublicProfile,
} from "./permissions";
import { getAppRoleLabel } from "./roles";
import type { AppRole, AuthSessionSnapshot } from "./types";

export type DashboardIdentityMode =
  | "loading"
  | "supabase_unavailable"
  | "guest_demo"
  | "authenticated";

export type DashboardAccessPreview = {
  canAccessOpenJobs: boolean;
  canAccessPrivateCommunity: boolean;
  canManageCompany: boolean;
  canAccessAdmin: boolean;
  canPublishPublicProfile: boolean;
};

export type DashboardIdentityState = {
  mode: DashboardIdentityMode;
  email: string | null;
  role: AppRole;
  roleLabel: string;
  accessPreview: DashboardAccessPreview;
};

const PUBLIC_ACCESS_PREVIEW: DashboardAccessPreview = {
  canAccessOpenJobs: false,
  canAccessPrivateCommunity: false,
  canManageCompany: false,
  canAccessAdmin: false,
  canPublishPublicProfile: false,
};

export const DASHBOARD_IDENTITY_LOADING: DashboardIdentityState = {
  mode: "loading",
  email: null,
  role: "public_visitor",
  roleLabel: "Checking session",
  accessPreview: PUBLIC_ACCESS_PREVIEW,
};

export function createDashboardIdentityState({
  session,
  supabaseAvailable,
}: {
  session: AuthSessionSnapshot | null;
  supabaseAvailable: boolean;
}): DashboardIdentityState {
  if (!supabaseAvailable) {
    return {
      mode: "supabase_unavailable",
      email: null,
      role: "public_visitor",
      roleLabel: "Demo Mode",
      accessPreview: PUBLIC_ACCESS_PREVIEW,
    };
  }

  if (!session) {
    return {
      mode: "guest_demo",
      email: null,
      role: "public_visitor",
      roleLabel: "Guest Demo",
      accessPreview: PUBLIC_ACCESS_PREVIEW,
    };
  }

  const user = session.user;

  // Role values are hydrated from the profile-backed session snapshot when the
  // profiles row is available; otherwise this remains a safe public fallback.
  return {
    mode: "authenticated",
    email: user.email,
    role: user.role,
    roleLabel: getAppRoleLabel(user.role),
    accessPreview: {
      canAccessOpenJobs: canAccessOpenJobs(user),
      canAccessPrivateCommunity: canAccessPrivateCommunity(user),
      canManageCompany: canManageCompany(user),
      canAccessAdmin: canAccessAdmin(user),
      canPublishPublicProfile: canPublishPublicProfile(user),
    },
  };
}
