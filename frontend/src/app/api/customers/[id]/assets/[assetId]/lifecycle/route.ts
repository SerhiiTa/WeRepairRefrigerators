import { NextResponse } from "next/server";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

const CUSTOMER_APPLIANCE_PHOTO_BUCKET = "customer-appliance-photos";

type AssetLifecycleRouteProps = {
  params: Promise<{
    id: string;
    assetId: string;
  }>;
};

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();

  return token.length > 0 ? token : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function requireAssetAccess(request: Request, customerId: string, assetId: string) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return { ok: false as const, response: fail("A logged-in dashboard session is required.", 401) };
  }

  if (!isUuid(customerId) || !isUuid(assetId)) {
    return { ok: false as const, response: fail("Choose a valid asset.") };
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return { ok: false as const, response: fail("Customer CRM is not configured.", 503) };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return { ok: false as const, response: fail("A valid authenticated session is required.", 401) };
  }

  const { data: canManage, error: manageError } = await supabase.rpc(
    "can_manage_customer_crm",
    { target_customer_id: customerId },
  );

  if (manageError || canManage !== true) {
    return { ok: false as const, response: fail("This account cannot manage that customer.", 403) };
  }

  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return { ok: false as const, response: fail("Asset lifecycle service is not configured.", 503) };
  }

  const { data: asset, error: assetError } = await serviceRole
    .from("customer_appliances")
    .select("id,customer_id,asset_status")
    .eq("id", assetId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (assetError) {
    console.error("Asset lifecycle lookup failed", {
      customerId,
      assetId,
      error: assetError,
    });
    return { ok: false as const, response: fail("Asset lifecycle lookup is temporarily unavailable.", 503) };
  }

  if (!asset) {
    return { ok: false as const, response: fail("Asset is not accessible.", 404) };
  }

  return { ok: true as const, serviceRole, asset };
}

export async function POST(request: Request, { params }: AssetLifecycleRouteProps) {
  const { id: customerId, assetId } = await params;
  const access = await requireAssetAccess(request, customerId, assetId);

  if (!access.ok) {
    return access.response;
  }

  let payload: { action?: unknown };

  try {
    payload = (await request.json()) as { action?: unknown };
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const action = typeof payload.action === "string" ? payload.action : "";

  if (action === "archive" || action === "restore") {
    const nextStatus = action === "archive" ? "archived" : "active";
    const { error } = await access.serviceRole
      .from("customer_appliances")
      .update({ asset_status: nextStatus })
      .eq("id", assetId)
      .eq("customer_id", customerId);

    if (error) {
      return fail("Asset status could not be updated.", 500);
    }

    return NextResponse.json({ ok: true, status: nextStatus });
  }

  return fail("Unsupported asset lifecycle action.");
}

export async function DELETE(request: Request, { params }: AssetLifecycleRouteProps) {
  const { id: customerId, assetId } = await params;
  const access = await requireAssetAccess(request, customerId, assetId);

  if (!access.ok) {
    return access.response;
  }

  const { count: linkedJobCount, error: countError } = await access.serviceRole
    .from("service_requests")
    .select("id", { count: "exact", head: true })
    .eq("customer_appliance_id", assetId);

  if (countError) {
    return fail("Linked jobs could not be checked.", 500);
  }

  if ((linkedJobCount ?? 0) > 0) {
    return fail(
      "This asset has service history and cannot be permanently deleted.",
      409,
    );
  }

  const { data: photos, error: photosError } = await access.serviceRole
    .from("customer_appliance_photos")
    .select("storage_path")
    .eq("customer_appliance_id", assetId)
    .eq("customer_id", customerId);

  if (photosError) {
    return fail("Asset photos could not be loaded.", 500);
  }

  const storagePaths = (photos ?? [])
    .map((photo) => photo.storage_path)
    .filter((path): path is string => typeof path === "string" && path.length > 0);

  if (storagePaths.length > 0) {
    const { error: removeError } = await access.serviceRole.storage
      .from(CUSTOMER_APPLIANCE_PHOTO_BUCKET)
      .remove(storagePaths);

    if (removeError) {
      return fail("Asset photo files could not be deleted.", 500);
    }
  }

  const { error: deleteError } = await access.serviceRole
    .from("customer_appliances")
    .delete()
    .eq("id", assetId)
    .eq("customer_id", customerId);

  if (deleteError) {
    return fail("Asset could not be deleted.", 500);
  }

  return NextResponse.json({ ok: true, status: "deleted" });
}
