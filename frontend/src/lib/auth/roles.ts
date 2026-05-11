import { APP_ROLES, type AppRole, type AuthProfileStatus } from "./types";

const APP_ROLE_SET = new Set<AppRole>(APP_ROLES);

const APP_ROLE_LABELS: Record<AppRole, string> = {
  public_visitor: "Public Visitor",
  customer: "Customer",
  technician: "Technician",
  verified_technician: "Verified Technician",
  expert_technician: "Expert Technician",
  company_owner: "Company Owner",
  admin: "Admin",
};

const AUTH_PROFILE_STATUSES = [
  "pending",
  "active",
  "verified",
  "rejected",
  "suspended",
] as const satisfies readonly AuthProfileStatus[];

const AUTH_PROFILE_STATUS_SET = new Set<AuthProfileStatus>(
  AUTH_PROFILE_STATUSES,
);

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && APP_ROLE_SET.has(value as AppRole);
}

export function normalizeAppRole(value: unknown): AppRole {
  return isAppRole(value) ? value : "public_visitor";
}

export function isAuthProfileStatus(
  value: unknown,
): value is AuthProfileStatus {
  return (
    typeof value === "string" &&
    AUTH_PROFILE_STATUS_SET.has(value as AuthProfileStatus)
  );
}

export function normalizeAuthProfileStatus(value: unknown): AuthProfileStatus {
  return isAuthProfileStatus(value) ? value : "pending";
}

export function getAppRoleLabel(role: AppRole): string {
  return APP_ROLE_LABELS[role];
}

export function isTechnicianRole(role: AppRole): boolean {
  return (
    role === "technician" ||
    role === "verified_technician" ||
    role === "expert_technician"
  );
}

export function isVerifiedTechnicianRole(role: AppRole): boolean {
  return role === "verified_technician" || role === "expert_technician";
}
