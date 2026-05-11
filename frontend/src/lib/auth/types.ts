export const APP_ROLES = [
  "public_visitor",
  "customer",
  "technician",
  "verified_technician",
  "expert_technician",
  "company_owner",
  "admin",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type AuthProfileStatus =
  | "pending"
  | "active"
  | "verified"
  | "rejected"
  | "suspended";

export type AuthUserProfile = {
  id: string;
  email: string | null;
  role: AppRole;
  status: AuthProfileStatus;
  companyId: string | null;
  isVerifiedTechnician: boolean;
};

export type AuthSessionSnapshot = {
  user: AuthUserProfile;
  expiresAt: number | null;
};

export type PermissionSubject =
  | AppRole
  | Pick<AuthUserProfile, "role" | "isVerifiedTechnician">;
