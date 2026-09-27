import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type CommunicationPhoneIdentityType = "customer" | "lead" | "unknown";

export type CommunicationPhoneIdentity = {
  identityType: CommunicationPhoneIdentityType;
  customerId: string | null;
  leadId: string | null;
  displayName: string | null;
  phone: string | null;
  email: string | null;
  canonicalPhone: string | null;
};

const UNKNOWN_IDENTITY: CommunicationPhoneIdentity = {
  identityType: "unknown",
  customerId: null,
  leadId: null,
  displayName: null,
  phone: null,
  email: null,
  canonicalPhone: null,
};

type ResolverRow = {
  identity_type: CommunicationPhoneIdentityType;
  customer_id: string | null;
  lead_id: string | null;
  display_name: string | null;
  phone: string | null;
  email: string | null;
  canonical_phone: string | null;
};

export async function resolveCommunicationPhoneIdentity({
  companyId,
  phone,
}: {
  companyId: string | null;
  phone: string | null;
}): Promise<CommunicationPhoneIdentity> {
  if (!companyId || !phone) {
    return UNKNOWN_IDENTITY;
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return UNKNOWN_IDENTITY;
  }

  const { data, error } = await supabase.rpc(
    "resolve_phone_identity_for_communication_rpc",
    {
      p_company_id: companyId,
      p_phone: phone,
    },
  );

  if (error) {
    console.error("[communications-phone-identity-resolver-error]", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return UNKNOWN_IDENTITY;
  }

  const row = Array.isArray(data) ? (data[0] as ResolverRow | undefined) : undefined;
  if (!row) {
    return UNKNOWN_IDENTITY;
  }

  return {
    identityType: row.identity_type,
    customerId: row.customer_id,
    leadId: row.lead_id,
    displayName: row.display_name,
    phone: row.phone,
    email: row.email,
    canonicalPhone: row.canonical_phone,
  };
}
