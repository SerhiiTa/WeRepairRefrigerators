import { isVerifiedTechnicianRole } from "./roles";
import type {
  AppRole,
  AuthProfileStatus,
  AuthSessionSnapshot,
  PermissionSubject,
} from "./types";

type ProfilePresenceSubject =
  | {
      id: string | null;
    }
  | null
  | undefined;

type ProfileStatusSubject =
  | {
      status: AuthProfileStatus;
    }
  | null
  | undefined;

function getSubjectRole(subject: PermissionSubject | null): AppRole {
  if (!subject) {
    return "public_visitor";
  }

  if (typeof subject === "string") {
    return subject;
  }

  return subject.role;
}

export function isAuthenticated(
  session: AuthSessionSnapshot | null | undefined,
): session is AuthSessionSnapshot {
  return Boolean(session?.user.id);
}

export function hasProfile(
  profile: ProfilePresenceSubject,
): profile is { id: string } {
  return typeof profile?.id === "string" && profile.id.length > 0;
}

export function isActiveProfile(profile: ProfileStatusSubject): boolean {
  return profile?.status === "active" || profile?.status === "verified";
}

export function hasRole(
  subject: PermissionSubject | null | undefined,
  roles: AppRole | readonly AppRole[],
): boolean {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return allowedRoles.includes(getSubjectRole(subject ?? null));
}

function hasVerifiedTechnicianAccess(subject: PermissionSubject | null): boolean {
  if (!subject) {
    return false;
  }

  if (typeof subject === "string") {
    return isVerifiedTechnicianRole(subject);
  }

  return subject.isVerifiedTechnician || isVerifiedTechnicianRole(subject.role);
}

export function canAccessDashboard(subject: PermissionSubject | null): boolean {
  return hasRole(subject, [
    "technician",
    "verified_technician",
    "expert_technician",
    "company_owner",
    "admin",
  ]);
}

export function canAccessOpenJobs(subject: PermissionSubject | null): boolean {
  const role = getSubjectRole(subject);

  return (
    hasVerifiedTechnicianAccess(subject) ||
    role === "company_owner" ||
    role === "admin"
  );
}

export function canAccessPrivateCommunity(
  subject: PermissionSubject | null,
): boolean {
  const role = getSubjectRole(subject);

  return hasVerifiedTechnicianAccess(subject) || role === "admin";
}

export function canManageCompany(subject: PermissionSubject | null): boolean {
  const role = getSubjectRole(subject);

  return role === "company_owner" || role === "admin";
}

export function canAccessAdmin(subject: PermissionSubject | null): boolean {
  return getSubjectRole(subject) === "admin";
}

export function canPublishPublicProfile(
  subject: PermissionSubject | null,
): boolean {
  const role = getSubjectRole(subject);

  return (
    hasVerifiedTechnicianAccess(subject) ||
    role === "company_owner" ||
    role === "admin"
  );
}
