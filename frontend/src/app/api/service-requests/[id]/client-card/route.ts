import { NextResponse } from "next/server";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";
import { extractBearerToken } from "@/server/intake/intake-service";
import {
  calculateDrivingDistance,
  type MapsDistanceOriginSource,
} from "@/server/maps/distance";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

export const dynamic = "force-dynamic";

type ClientCardRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

type OriginResult = {
  address: string | null;
  source: MapsDistanceOriginSource;
  setupHref: string | null;
  profileId: string;
  technicianProfileId: string | null;
  companyId: string | null;
  rejectionReason: string | null;
};

type ServiceRequestClientContext = {
  id: string;
  customer_id: string | null;
  full_address: string | null;
  street_address: string | null;
  unit: string | null;
  city: string | null;
  state: string;
  zip_code: string;
  country: string;
};

type BaseAddressRow = {
  id?: string | null;
  base_address_line1?: string | null;
  base_address_line2?: string | null;
  base_city?: string | null;
  base_state?: string | null;
  base_zip?: string | null;
  base_country?: string | null;
  base_formatted_address?: string | null;
  base_latitude?: number | null;
  base_longitude?: number | null;
};

type CompanyMembershipLookup = {
  company_id: string;
  member_role: string | null;
  member_status: string | null;
};

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function cleanAddress(value: string | null | undefined): string | null {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}

function buildServiceAddress(request: ServiceRequestClientContext): string | null {
  if (request.full_address?.trim()) {
    return request.full_address.trim();
  }

  const streetLine = [request.street_address, request.unit]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
  const stateZip = [request.state, request.zip_code]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  const cityLine = [request.city, stateZip]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
  const address = [streetLine, cityLine, request.country === "US" ? null : request.country]
    .filter(Boolean)
    .join(", ");

  return cleanAddress(address);
}

function buildBaseAddress(row: BaseAddressRow | null | undefined): string | null {
  if (!row) {
    return null;
  }

  if (row.base_formatted_address?.trim()) {
    return row.base_formatted_address.trim();
  }

  const streetLine = [row.base_address_line1, row.base_address_line2]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  const cityLine = [
    row.base_city,
    [row.base_state, row.base_zip].map((part) => part?.trim()).filter(Boolean).join(" "),
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
  const address = [streetLine, cityLine, row.base_country === "US" ? null : row.base_country]
    .filter(Boolean)
    .join(", ");

  return cleanAddress(address);
}

function canManageCompanySettings(role: string | null | undefined) {
  return role === "owner" || role === "manager";
}

function logOriginResolution(result: OriginResult) {
  console.info("[client-card-distance-origin]", {
    profileId: result.profileId,
    technicianProfileId: result.technicianProfileId,
    companyId: result.companyId,
    originSource: result.source,
    originAddressAvailable: Boolean(result.address),
    rejectionReason: result.rejectionReason,
  });
}

async function resolveOriginAddress(
  supabase: ReturnType<typeof getSupabaseServiceRoleClient>,
  userScopedSupabase: ReturnType<typeof createUserScopedServerClient>,
  userId: string,
): Promise<OriginResult> {
  let companyId: string | null = null;
  let setupHref = "/dashboard/technician-profile";
  let selectedMembership: CompanyMembershipLookup | null = null;
  let technicianProfileId: string | null = null;
  let rejectionReason: string | null = null;

  if (userScopedSupabase) {
    const { data } = await userScopedSupabase.rpc("current_dashboard_company_id");
    companyId = typeof data === "string" ? data : null;
  }

  if (supabase) {
    const { data: technician } = await supabase
      .from("technician_profiles")
      .select(
        "id,base_address_line1,base_address_line2,base_city,base_state,base_zip,base_country,base_formatted_address,base_latitude,base_longitude",
      )
      .eq("profile_id", userId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const address = buildBaseAddress(technician as BaseAddressRow | null);
    technicianProfileId =
      ((technician as BaseAddressRow | null)?.id as string | null) ?? null;

    if (address) {
      const result = {
        address,
        source: "technician",
        setupHref: "/dashboard/technician-profile",
        profileId: userId,
        technicianProfileId,
        companyId,
        rejectionReason: null,
      } satisfies OriginResult;
      logOriginResolution(result);
      return result;
    }

    rejectionReason = technician
      ? "technician_base_address_empty"
      : "technician_profile_missing";
  }

  if (supabase && !companyId) {
    const { data: membership } = await supabase
      .from("company_members")
      .select("company_id,member_role,member_status")
      .eq("profile_id", userId)
      .eq("member_status", "active")
      .is("archived_at", null)
      .is("removed_at", null)
      .is("suspended_at", null)
      .order("joined_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (membership?.company_id) {
      selectedMembership = membership as CompanyMembershipLookup;
      companyId = selectedMembership.company_id;
    } else {
      rejectionReason = rejectionReason ?? "active_company_membership_missing";
    }
  }

  if (supabase && companyId) {
    if (!selectedMembership) {
      const { data: membership } = await supabase
        .from("company_members")
        .select("company_id,member_role,member_status")
        .eq("company_id", companyId)
        .eq("profile_id", userId)
        .eq("member_status", "active")
        .is("archived_at", null)
        .is("removed_at", null)
        .is("suspended_at", null)
        .maybeSingle();

      selectedMembership = membership as CompanyMembershipLookup | null;
    }

    if (canManageCompanySettings(selectedMembership?.member_role)) {
      setupHref = "/dashboard/settings";
    }

    const { data: company } = await supabase
      .from("companies")
      .select(
        "id,base_address_line1,base_address_line2,base_city,base_state,base_zip,base_country,base_formatted_address,base_latitude,base_longitude,status,archived_at",
      )
      .eq("id", companyId)
      .is("archived_at", null)
      .maybeSingle();
    const address = buildBaseAddress(company as BaseAddressRow | null);

    if (address) {
      const result = {
        address,
        source: "company",
        setupHref,
        profileId: userId,
        technicianProfileId,
        companyId,
        rejectionReason: null,
      } satisfies OriginResult;
      logOriginResolution(result);
      return result;
    }

    rejectionReason = company
      ? "company_base_address_empty"
      : "company_not_found_or_archived";
  }

  const result = {
    address: null,
    source: "missing",
    setupHref,
    profileId: userId,
    technicianProfileId,
    companyId,
    rejectionReason,
  } satisfies OriginResult;
  logOriginResolution(result);
  return result;
}

async function createAvatarSignedUrl(path: string | null) {
  if (!path) {
    return null;
  }

  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return null;
  }

  const { data, error } = await serviceRole.storage
    .from("client-avatars")
    .createSignedUrl(path, 60 * 60);

  if (error) {
    return null;
  }

  return data.signedUrl;
}

export async function GET(
  request: Request,
  { params }: ClientCardRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  const userScopedSupabase = createUserScopedServerClient(accessToken);

  if (!userScopedSupabase) {
    return fail("Supabase is not configured for client card context.", 503);
  }

  const { data: userData, error: userError } =
    await userScopedSupabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const { id } = await params;
  const { data: requestRow, error: requestError } = await userScopedSupabase
    .from("service_requests")
    .select(
      "id,customer_id,full_address,street_address,unit,city,state,zip_code,country",
    )
    .eq("id", id)
    .maybeSingle();

  if (requestError) {
    return fail("Client card context is not ready. Apply migration 0058 if needed.", 503);
  }

  if (!requestRow) {
    return fail("Service request not found.", 404);
  }

  const typedRequest = requestRow as ServiceRequestClientContext;
  const serviceRole = getSupabaseServiceRoleClient();
  let customerAvatarPath: string | null = null;
  let jobAvatarPath: string | null = null;

  if (serviceRole && typedRequest.customer_id) {
    const { data: customer } = await serviceRole
      .from("customers")
      .select("avatar_storage_path")
      .eq("id", typedRequest.customer_id)
      .maybeSingle();

    customerAvatarPath =
      "avatar_storage_path" in (customer ?? {})
        ? ((customer as Database["public"]["Tables"]["customers"]["Row"]).avatar_storage_path ?? null)
        : null;
  }

  if (serviceRole && !customerAvatarPath) {
    const { data: avatarRequest } = await serviceRole
      .from("service_requests")
      .select("job_client_avatar_storage_path")
      .eq("id", typedRequest.id)
      .maybeSingle();

    jobAvatarPath =
      avatarRequest && "job_client_avatar_storage_path" in avatarRequest
        ? ((avatarRequest as { job_client_avatar_storage_path?: string | null })
            .job_client_avatar_storage_path ?? null)
        : null;
  }

  const avatarPath = customerAvatarPath ?? jobAvatarPath;
  const avatarUrl = await createAvatarSignedUrl(avatarPath);
  const origin = await resolveOriginAddress(
    serviceRole,
    userScopedSupabase,
    userData.user.id,
  );
  const destination = buildServiceAddress(typedRequest);
  const distance = await calculateDrivingDistance({
    origin: origin.address,
    destination,
    originSource: origin.source,
  });

  return NextResponse.json({
    ok: true,
    diagnostics: {
      originSource: origin.source,
      originAddressAvailable: Boolean(origin.address),
      destinationAddressAvailable: Boolean(destination),
    },
    clientAvatar: {
      storagePath: avatarPath,
      signedUrl: avatarUrl,
      owner: typedRequest.customer_id ? "customer" : "service_request",
    },
    distance: {
      ...distance,
      originSource: origin.source,
      originAddress: null,
      originAddressAvailable: Boolean(origin.address),
      destinationAddressAvailable: Boolean(destination),
      setupHref: distance.status === "missing_origin" ? origin.setupHref : null,
    },
  });
}
