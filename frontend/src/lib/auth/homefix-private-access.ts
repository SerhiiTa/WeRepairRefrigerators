import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

export const HOMEFIX_PRIVATE_COMPANY_ID =
  "f0639d2c-6fcf-4ab5-93a2-cde8f3ba9633";

export type HomeFixPrivateAccessDecision =
  | {
      allowed: true;
      reason: "platform_admin" | "homefix_member";
      userId: string;
    }
  | {
      allowed: false;
      reason:
        | "supabase_unavailable"
        | "logged_out"
        | "profile_inactive"
        | "not_homefix_member"
        | "membership_lookup_failed";
      userId: string | null;
    };

type HomeFixPrivateAccessClient = Pick<SupabaseClient<Database>, "auth" | "from" | "rpc">;

function isActiveProfileStatus(status: unknown): boolean {
  return status === "active" || status === "verified";
}

export async function evaluateHomeFixPrivateAccess(
  supabase: HomeFixPrivateAccessClient | null,
): Promise<HomeFixPrivateAccessDecision> {
  if (!supabase) {
    return { allowed: false, reason: "supabase_unavailable", userId: null };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  if (userError || !userId) {
    return { allowed: false, reason: "logged_out", userId: null };
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc(
    "is_admin" as never,
  );

  if (!adminError && isAdmin === true) {
    return { allowed: true, reason: "platform_admin", userId };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,status")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile || !isActiveProfileStatus(profile.status)) {
    return { allowed: false, reason: "profile_inactive", userId };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("company_members")
    .select("id")
    .eq("profile_id", userId)
    .eq("company_id", HOMEFIX_PRIVATE_COMPANY_ID)
    .eq("member_status", "active")
    .is("archived_at", null)
    .is("removed_at", null)
    .is("suspended_at", null)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return { allowed: false, reason: "membership_lookup_failed", userId };
  }

  if (!membership) {
    return { allowed: false, reason: "not_homefix_member", userId };
  }

  return { allowed: true, reason: "homefix_member", userId };
}
