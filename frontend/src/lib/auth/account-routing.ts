import type { Session, SupabaseClient } from "@supabase/supabase-js";

import { canAccessDashboard } from "@/lib/auth/permissions";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import type { Database } from "@/lib/supabase/types";

type RoleIntent = "customer" | "technician";

export type AuthenticatedWorkspaceRoute = "/customer/dashboard" | "/dashboard";

type ResolveAuthenticatedWorkspaceOptions = {
  supabase: SupabaseClient<Database>;
  session: Session | null;
  roleIntent?: RoleIntent | null;
};

type AuthenticatedWorkspaceResult = {
  path: AuthenticatedWorkspaceRoute;
  reason:
    | "dashboard_profile_role"
    | "customer_profile_role"
    | "customer_record"
    | "technician_intent"
    | "customer_intent";
};

function getMetadataRoleIntent(session: Session | null): RoleIntent | null {
  const value = session?.user.user_metadata.role_intent;

  return value === "customer" || value === "technician" ? value : null;
}

export async function resolveAuthenticatedWorkspace({
  supabase,
  session,
  roleIntent = null,
}: ResolveAuthenticatedWorkspaceOptions): Promise<AuthenticatedWorkspaceResult> {
  const profileResult = await getCurrentUserProfile({ client: supabase });

  if (profileResult.status === "profile_ready") {
    if (canAccessDashboard(profileResult.session.user)) {
      return {
        path: "/dashboard",
        reason: "dashboard_profile_role",
      };
    }

    if (profileResult.profile.role === "customer") {
      return {
        path: "/customer/dashboard",
        reason: "customer_profile_role",
      };
    }
  }

  const userId = session?.user.id ?? profileResult.session?.user.id ?? null;

  if (userId) {
    const customerResult = await supabase
      .from("customers")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (!customerResult.error && customerResult.data) {
      return {
        path: "/customer/dashboard",
        reason: "customer_record",
      };
    }
  }

  const fallbackIntent = roleIntent ?? getMetadataRoleIntent(session);

  if (fallbackIntent === "technician") {
    return {
      path: "/dashboard",
      reason: "technician_intent",
    };
  }

  return {
    path: "/customer/dashboard",
    reason: "customer_intent",
  };
}
