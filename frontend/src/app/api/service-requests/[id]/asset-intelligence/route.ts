import { NextResponse } from "next/server";

import { SERVICE_REQUEST_PHOTO_BUCKET } from "@/lib/service-request-photos";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/types";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type AssetIntelligenceRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

type ConfidenceLabel = "high" | "medium" | "low";
type AssetApplianceType =
  | "refrigerator"
  | "built_in_refrigerator"
  | "freezer"
  | "wine_cooler"
  | "ice_maker"
  | "washer"
  | "dryer"
  | "dishwasher"
  | "range"
  | "oven"
  | "double_oven"
  | "cooktop"
  | "rangetop"
  | "microwave"
  | "hood"
  | "coffee_machine"
  | "trash_compactor"
  | "unknown_appliance";

type VisionIdentity = {
  isApplianceLabel: boolean;
  brand: string | null;
  applianceType: AssetApplianceType;
  modelNumber: string | null;
  serialNumber: string | null;
  rawVisibleText: string | null;
  confidence: ConfidenceLabel;
};

const ASSET_VISION_TIMEOUT_MS = 25_000;
const ASSET_VISION_MODEL =
  process.env.ASSET_INTELLIGENCE_OPENAI_MODEL?.trim() || "gpt-4o-mini";

const allowedApplianceTypes = new Set<AssetApplianceType>([
  "refrigerator",
  "built_in_refrigerator",
  "freezer",
  "wine_cooler",
  "ice_maker",
  "washer",
  "dryer",
  "dishwasher",
  "range",
  "oven",
  "double_oven",
  "cooktop",
  "rangetop",
  "microwave",
  "hood",
  "coffee_machine",
  "trash_compactor",
  "unknown_appliance",
]);

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

function readBoolean(source: unknown, field: string): boolean {
  if (!source || typeof source !== "object" || !(field in source)) {
    return false;
  }

  return (source as Record<string, unknown>)[field] === true;
}

function extractOpenAiText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const response = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
  };

  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  return (
    response.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter((text): text is string => typeof text === "string")
      .join("\n") ?? ""
  );
}

function normalizeApplianceType(value: string | null): AssetApplianceType {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (normalized.includes("built") && normalized.includes("refrigerator")) {
    return "built_in_refrigerator";
  }
  if (normalized.includes("refrigerator") || normalized === "fridge") {
    return "refrigerator";
  }
  if (normalized.includes("freezer")) {
    return "freezer";
  }
  if (normalized.includes("wine")) {
    return "wine_cooler";
  }
  if (normalized.includes("ice")) {
    return "ice_maker";
  }
  if (normalized.includes("washer") || normalized.includes("washing")) {
    return "washer";
  }
  if (normalized.includes("dryer")) {
    return "dryer";
  }
  if (normalized.includes("dishwasher")) {
    return "dishwasher";
  }
  if (normalized.includes("double") && normalized.includes("oven")) {
    return "double_oven";
  }
  if (normalized.includes("oven")) {
    return "oven";
  }
  if (normalized.includes("range")) {
    return "range";
  }
  if (normalized.includes("rangetop")) {
    return "rangetop";
  }
  if (normalized.includes("cooktop")) {
    return "cooktop";
  }
  if (normalized.includes("microwave")) {
    return "microwave";
  }
  if (normalized.includes("hood")) {
    return "hood";
  }
  if (normalized.includes("coffee")) {
    return "coffee_machine";
  }
  if (normalized.includes("trash") && normalized.includes("compactor")) {
    return "trash_compactor";
  }

  const direct = value as AssetApplianceType | null;
  return direct && allowedApplianceTypes.has(direct)
    ? direct
    : "unknown_appliance";
}

function normalizeIdentity(payload: unknown): VisionIdentity {
  if (!payload || typeof payload !== "object") {
    throw new Error("vision_output_invalid");
  }

  const rawConfidence = readString(payload, "confidence")?.toLowerCase();
  const confidence: ConfidenceLabel =
    rawConfidence === "high" || rawConfidence === "medium" || rawConfidence === "low"
      ? rawConfidence
      : "low";

  const isApplianceLabel = readBoolean(payload, "isApplianceLabel");
  const brand = readString(payload, "brand");
  const modelNumber = readString(payload, "modelNumber");
  const serialNumber = readString(payload, "serialNumber");

  return {
    isApplianceLabel,
    brand,
    applianceType: normalizeApplianceType(readString(payload, "applianceType")),
    modelNumber,
    serialNumber,
    rawVisibleText: readString(payload, "rawVisibleText"),
    confidence:
      isApplianceLabel && brand && modelNumber && serialNumber
        ? confidence
        : confidence === "high"
          ? "medium"
          : confidence,
  };
}

function buildOpenAiSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "isApplianceLabel",
      "brand",
      "applianceType",
      "modelNumber",
      "serialNumber",
      "rawVisibleText",
      "confidence",
    ],
    properties: {
      isApplianceLabel: { type: "boolean" },
      brand: { type: ["string", "null"] },
      applianceType: {
        type: "string",
        enum: Array.from(allowedApplianceTypes),
      },
      modelNumber: { type: ["string", "null"] },
      serialNumber: { type: ["string", "null"] },
      rawVisibleText: { type: ["string", "null"] },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
  };
}

async function callOpenAiVision(imageUrl: string): Promise<VisionIdentity> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("openai_key_missing");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ASSET_VISION_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: ASSET_VISION_MODEL,
        input: [
          {
            role: "system",
            content:
              "You identify appliance model and serial number nameplate photos for an appliance repair CRM. Return only the requested JSON. Do not infer model or serial from unrelated certification, voltage, refrigerant, charge, service, or part numbers. Return null for unreadable fields.",
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Determine whether this image is an appliance manufacturer/model/serial label. If it is, extract brand, normalized WRA applianceType, modelNumber, serialNumber, rawVisibleText, and confidence. High confidence requires a readable label with brand, model number, and serial number.",
              },
              {
                type: "input_image",
                image_url: imageUrl,
              },
            ],
          },
        ],
        temperature: 0,
        max_output_tokens: 900,
        text: {
          format: {
            type: "json_schema",
            name: "asset_label_identity",
            strict: true,
            schema: buildOpenAiSchema(),
          },
        },
      }),
      signal: controller.signal,
    });

    const body = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      throw new Error(`openai_http_${response.status}`);
    }

    return normalizeIdentity(JSON.parse(extractOpenAiText(body)));
  } finally {
    clearTimeout(timeoutId);
  }
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

    const identity = await callOpenAiVision(signedUrlData.signedUrl);
    const rpcIdentity = identity.isApplianceLabel
      ? {
          brand: identity.brand,
          applianceType: identity.applianceType,
          modelNumber: identity.modelNumber,
          serialNumber: identity.serialNumber,
          rawText: identity.rawVisibleText,
          confidenceLabel: identity.confidence,
          isApplianceLabel: true,
        }
      : {
          applianceType: "unknown_appliance",
          confidenceLabel: "low",
          isApplianceLabel: false,
          rawText: identity.rawVisibleText,
        };

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
