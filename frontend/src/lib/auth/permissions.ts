import { isVerifiedTechnicianRole } from "./roles";
import type { AppRole, PermissionSubject } from "./types";

function getSubjectRole(subject: PermissionSubject | null): AppRole {
  if (!subject) {
    return "public_visitor";
  }

  if (typeof subject === "string") {
    return subject;
  }

  return subject.role;
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
  const role = getSubjectRole(subject);

  return (
    role === "technician" ||
    role === "verified_technician" ||
    role === "expert_technician" ||
    role === "company_owner" ||
    role === "admin"
  );
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
