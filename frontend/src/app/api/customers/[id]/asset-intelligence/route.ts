import { NextResponse } from "next/server";

import {
  MAX_SERVICE_REQUEST_PHOTO_BYTES,
  createSafePhotoStorageId,
  validateServiceRequestPhotoFiles,
} from "@/lib/service-request-photos";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";
import {
  ASSET_VISION_MODEL,
  analyzeAssetLabelImage,
  toAssetIntelligenceRpcIdentity,
} from "@/server/asset-intelligence/vision";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

const CUSTOMER_APPLIANCE_PHOTO_BUCKET = "customer-appliance-photos";

type CustomerAssetIntelligenceRouteProps = {
  params: Promise<{ id: string }>;
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

function getSafeFileName(file: File): string {
  const baseFileName =
    file.name.split(/[/\\]/).pop()?.split(/[?#]/)[0] || "asset-photo.jpg";
  const extension = baseFileName.includes(".")
    ? baseFileName.split(".").pop()?.toLowerCase()
    : "jpg";
  const safeExtension = extension?.replace(/[^a-z0-9]/g, "").slice(0, 8) || "jpg";
  const safeName =
    baseFileName
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "asset-photo";

  return `${createSafePhotoStorageId()}-${safeName}.${safeExtension}`;
}

function toPrefillIdentity(identity: ReturnType<typeof toAssetIntelligenceRpcIdentity>) {
  return identity;
}

function readPhotoPurpose(formData: FormData): "asset_label" | "asset_photo" {
  return formData.get("photoType") === "asset_photo" ? "asset_photo" : "asset_label";
}

async function updateAssetPhotoProcessingState({
  photoId,
  status,
  result = {},
  error = null,
}: {
  photoId: string;
  status: "pending" | "processed" | "needs_review" | "no_asset" | "failed";
  result?: Json;
  error?: string | null;
}) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return;
  }

  await serviceRole
    .from("customer_appliance_photos")
    .update({
      processing_status: status,
      processing_result: result,
      processing_error: error,
      processed_at: status === "pending" ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", photoId);
}

export async function POST(
  request: Request,
  { params }: CustomerAssetIntelligenceRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  const { id: customerId } = await params;

  if (!isUuid(customerId)) {
    return fail("Choose a valid customer before scanning an asset.");
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for Asset Intelligence.", 503);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id,company_id")
    .eq("id", customerId)
    .maybeSingle();

  if (customerError || !customer) {
    return fail("Customer is not accessible for this account.", 404);
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return fail("Upload a valid asset photo.");
  }

  const file = formData.get("photo");
  const photoType = readPhotoPurpose(formData);

  if (!(file instanceof File)) {
    return fail("Choose an asset label photo to scan.");
  }

  if (file.size > MAX_SERVICE_REQUEST_PHOTO_BYTES) {
    return fail("Choose an image smaller than 5 MB.");
  }

  const validation = validateServiceRequestPhotoFiles([file]);

  if (!validation.ok) {
    return fail(validation.message);
  }

  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return fail("Asset Intelligence storage access is not configured.", 503);
  }

  const storagePath = `customers/${customerId}/assets/${getSafeFileName(file)}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await serviceRole.storage
    .from(CUSTOMER_APPLIANCE_PHOTO_BUCKET)
    .upload(storagePath, bytes, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return fail("Asset photo storage is not ready yet.", 503);
  }

  const { data: photo, error: metadataError } = await serviceRole
    .from("customer_appliance_photos")
    .insert({
      customer_id: customerId,
      company_id: customer.company_id,
      customer_appliance_id: null,
      uploaded_by_profile_id: userData.user.id,
      storage_path: storagePath,
      original_filename: file.name.slice(0, 180),
      photo_type: photoType,
      is_cover: photoType === "asset_photo",
      processing_status: photoType === "asset_label" ? "pending" : "processed",
      processing_result:
        photoType === "asset_label"
          ? { provider: "openai", model: ASSET_VISION_MODEL }
          : { source: "manual_asset_photo" },
      processed_at: photoType === "asset_photo" ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (metadataError || !photo) {
    return fail("Asset photo metadata is not ready yet.", 503);
  }

  if (photoType === "asset_photo") {
    return NextResponse.json({
      ok: true,
      photoId: photo.id,
      status: "processed",
      message: "Asset photo added. It will be attached when this asset is saved.",
    });
  }

  try {
    const { data: signedUrlData, error: signedUrlError } =
      await serviceRole.storage
        .from(CUSTOMER_APPLIANCE_PHOTO_BUCKET)
        .createSignedUrl(storagePath, 60 * 5);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error("storage_signed_url_failed");
    }

    const identity = await analyzeAssetLabelImage(signedUrlData.signedUrl);
    const rpcIdentity = toPrefillIdentity(toAssetIntelligenceRpcIdentity(identity));
    const recognized = identity.isApplianceLabel && Boolean(
      identity.brand || identity.modelNumber || identity.serialNumber,
    );
    const status = recognized
      ? identity.confidence === "low"
        ? "needs_review"
        : "processed"
      : "no_asset";

    await updateAssetPhotoProcessingState({
      photoId: photo.id,
      status,
      result: {
        provider: "openai",
        model: ASSET_VISION_MODEL,
        identity: rpcIdentity,
      },
    });

    return NextResponse.json({
      ok: true,
      photoId: photo.id,
      status,
      identity,
      message: recognized
        ? "Asset label scanned. Review the fields before saving."
        : "Photo saved. We could not confidently identify a label, but you can enter the asset manually.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "asset_vision_failed";

    await updateAssetPhotoProcessingState({
      photoId: photo.id,
      status: "failed",
      result: { provider: "openai", model: ASSET_VISION_MODEL },
      error: message,
    });

    return fail(
      "Asset photo saved, but identification is temporarily unavailable. Enter the asset manually.",
      502,
    );
  }
}
