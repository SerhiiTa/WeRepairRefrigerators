import { NextResponse } from "next/server";

import { SERVICE_REQUEST_PHOTO_BUCKET } from "@/lib/service-request-photos";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";
import {
  ASSET_VISION_MODEL,
  analyzeAssetLabelImage,
  toAssetIntelligenceRpcIdentity,
} from "@/server/asset-intelligence/vision";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type AssetIntelligenceRouteProps = {
  params: Promise<{
    id: string;
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

function readString(source: unknown, field: string): string | null {
  if (!source || typeof source !== "object" || !(field in source)) {
    return null;
  }

  const value = (source as Record<string, unknown>)[field];
  return typeof value === "string" ? value.trim() || null : null;
}

async function updatePhotoProcessingState({
  photoId,
  status,
  result = {},
  error = null,
}: {
  photoId: string;
  status: "pending" | "failed";
  result?: Json;
  error?: string | null;
}) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return;
  }

  await serviceRole
    .from("service_request_photos")
    .update({
      asset_processing_status: status,
      asset_processing_result: result,
      asset_processing_error: error,
      processed_at: status === "failed" ? new Date().toISOString() : null,
    })
    .eq("id", photoId);
}

export async function POST(
  request: Request,
  { params }: AssetIntelligenceRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  let payload: { photoId?: unknown; retry?: unknown };

  try {
    payload = (await request.json()) as { photoId?: unknown; retry?: unknown };
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const photoId = typeof payload.photoId === "string" ? payload.photoId : "";
  const retry = payload.retry === true;

  if (!isUuid(photoId)) {
    return fail("Choose a valid attachment to identify.");
  }

  const { id: requestId } = await params;
  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for Asset Intelligence.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const { data: photo, error: photoError } = await supabase
    .from("service_request_photos")
    .select(
      "id,service_request_id,storage_path,asset_processing_status,asset_processing_result,linked_customer_appliance_id",
    )
    .eq("id", photoId)
    .eq("service_request_id", requestId)
    .maybeSingle();

  if (photoError || !photo) {
    return fail("Attachment is not accessible for this account.", 404);
  }

  if (
    !retry &&
    photo.asset_processing_status !== "not_started" &&
    photo.asset_processing_status !== "failed"
  ) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      status: photo.asset_processing_status,
      result: photo.asset_processing_result,
    });
  }

  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return fail("Asset Intelligence storage access is not configured.", 503);
  }

  await updatePhotoProcessingState({
    photoId,
    status: "pending",
    result: { provider: "openai", model: ASSET_VISION_MODEL },
  });

  try {
    const { data: signedUrlData, error: signedUrlError } =
      await serviceRole.storage
        .from(SERVICE_REQUEST_PHOTO_BUCKET)
        .createSignedUrl(photo.storage_path, 60 * 5);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error("storage_signed_url_failed");
    }

    const identity = await analyzeAssetLabelImage(signedUrlData.signedUrl);
    const rpcIdentity = toAssetIntelligenceRpcIdentity(identity);

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "process_service_request_photo_asset_intelligence_rpc",
      {
        p_photo_id: photoId,
        p_identity: rpcIdentity,
      },
    );

    if (rpcError) {
      throw new Error(rpcError.message);
    }

    return NextResponse.json({
      ok: true,
      status: readString(rpcData, "status") ?? "processed",
      action: readString(rpcData, "action"),
      customerApplianceId: readString(rpcData, "customer_appliance_id"),
      identity,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "asset_vision_failed";

    await updatePhotoProcessingState({
      photoId,
      status: "failed",
      result: { provider: "openai", model: ASSET_VISION_MODEL },
      error: message,
    });

    return fail("Asset identification failed. The attachment is still saved.", 502);
  }
}
