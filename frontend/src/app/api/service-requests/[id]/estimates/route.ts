import { NextResponse } from "next/server";

import type { Json } from "@/lib/supabase/types";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type EstimateSupabaseClient = NonNullable<
  ReturnType<typeof createUserScopedServerClient>
>;

type ServiceRequestEstimatesRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

type EstimateCatalogItemInput = {
  pricingCatalogItemId: string;
  quantity: number;
  notes?: string | null;
};

type EstimateCustomItemInput = {
  itemTitle: string;
  customerName?: string | null;
  internalName?: string | null;
  publicDescription?: string | null;
  lineType?: "labor" | "part" | "material" | "custom" | "warranty";
  quantity: number;
  unitPrice: number;
  unitCost?: number;
  technicianCost?: number;
  taxable?: boolean;
  warrantyText?: string | null;
  notes?: string | null;
};

type EstimatePayload = {
  catalogItems: EstimateCatalogItemInput[];
  customItems: EstimateCustomItemInput[];
  estimateDecisionContext?: Json | null;
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

function cleanText(value: unknown, maxLength = 1000): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanQuantity(value: unknown): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 1;
  }

  return Math.max(1, Math.min(20, Math.floor(numberValue)));
}

function cleanMoney(value: unknown): number {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.min(50000, Math.round(numberValue * 100) / 100));
}

function cleanLineType(
  value: unknown,
): "labor" | "part" | "material" | "custom" | "warranty" {
  return value === "labor" ||
    value === "part" ||
    value === "material" ||
    value === "warranty"
    ? value
    : "custom";
}

function cleanBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function cleanJsonObject(value: unknown): Json | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Json;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function formatEstimateError(message: string): string {
  const devSuffix =
    process.env.NODE_ENV === "production" ? "" : ` Dev detail: ${message}`;

  if (
    message.includes("service_requests.company_id") ||
    message.includes('column "company_id"') ||
    message.includes("user_can_access_company")
  ) {
    return `Estimate company-scoping SQL is not fully applied. Apply the latest estimate persistence/company scope migration in Supabase, then try again.${devSuffix}`;
  }

  if (
    message.includes("update_service_request_estimate_draft_rpc") ||
    message.includes("void_service_request_estimate_draft_rpc") ||
    message.includes("archive_service_request_estimate_draft_rpc")
  ) {
    return "Estimate lifecycle actions are not ready yet. Apply the latest estimate lifecycle migrations in Supabase, then try again.";
  }

  if (
    message.includes("schema cache") ||
    message.includes("Could not find the function") ||
    message.includes("create_service_request_estimate_rpc")
  ) {
    return "Estimates are not ready yet. Apply migration 0023 in Supabase, then try again.";
  }

  if (message.includes("at least one")) {
    return "Add at least one estimate line item.";
  }

  if (
    message.includes("not accessible") ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "This account is not allowed to create an estimate for that service request.";
  }

  return `We could not create this estimate yet.${devSuffix}`;
}

async function readEstimatePayload(request: Request): Promise<
  | {
      ok: true;
      payload: EstimatePayload;
      rawPayload: Record<string, unknown>;
    }
  | {
      ok: false;
      response: NextResponse;
    }
> {
  let payload: {
    catalogItems?: unknown;
    customItems?: unknown;
  } & Record<string, unknown>;

  try {
    payload = (await request.json()) as {
      catalogItems?: unknown;
      customItems?: unknown;
    } & Record<string, unknown>;
  } catch {
    return {
      ok: false,
      response: fail("Request body was not valid JSON."),
    };
  }

  const catalogItems = Array.isArray(payload.catalogItems)
    ? payload.catalogItems
        .map((item): EstimateCatalogItemInput | null => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const rawItem = item as Record<string, unknown>;
          const pricingCatalogItemId = cleanText(rawItem.pricingCatalogItemId, 80);

          if (!isUuid(pricingCatalogItemId)) {
            return null;
          }

          return {
            pricingCatalogItemId,
            quantity: cleanQuantity(rawItem.quantity),
            notes: cleanText(rawItem.notes, 1000) || null,
          };
        })
        .filter((item): item is EstimateCatalogItemInput => item !== null)
    : [];

  const customItems = Array.isArray(payload.customItems)
    ? payload.customItems
        .map((item): EstimateCustomItemInput | null => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const rawItem = item as Record<string, unknown>;
          const itemTitle = cleanText(rawItem.itemTitle, 160);
          const customerName = cleanText(rawItem.customerName, 160);
          const internalName = cleanText(rawItem.internalName, 160);
          const publicDescription = cleanText(rawItem.publicDescription, 1000);
          const unitPrice = cleanMoney(rawItem.unitPrice);
          const unitCost = cleanMoney(rawItem.unitCost ?? rawItem.technicianCost);

          if ((!itemTitle && !customerName) || unitPrice < 0) {
            return null;
          }

          return {
            itemTitle: itemTitle || customerName,
            customerName: customerName || itemTitle || null,
            internalName: internalName || null,
            publicDescription: publicDescription || null,
            lineType: cleanLineType(rawItem.lineType),
            quantity: cleanQuantity(rawItem.quantity),
            unitPrice,
            unitCost,
            technicianCost: unitCost,
            taxable: cleanBoolean(rawItem.taxable, true),
            warrantyText: cleanText(rawItem.warrantyText, 1000) || null,
            notes: cleanText(rawItem.notes, 1000) || null,
          };
        })
        .filter((item): item is EstimateCustomItemInput => item !== null)
    : [];

  if (catalogItems.length + customItems.length === 0) {
    return {
      ok: false,
      response: fail("Add at least one estimate line item."),
    };
  }

  return {
    ok: true,
    payload: {
      catalogItems,
      customItems,
      estimateDecisionContext: cleanJsonObject(payload.estimateDecisionContext),
    },
    rawPayload: payload,
  };
}

async function requireEstimateSupabase(request: Request) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return {
      ok: false as const,
      response: fail("A logged-in dashboard session is required.", 401),
    };
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return {
      ok: false as const,
      response: fail("Supabase is not configured for estimates.", 503),
    };
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return {
      ok: false as const,
      response: fail("A valid authenticated session is required.", 401),
    };
  }

  return {
    ok: true as const,
    supabase,
  };
}

async function recordEstimateDecisionEvent({
  supabase,
  requestId,
  estimateId,
  eventType,
  decisionContext,
}: {
  supabase: EstimateSupabaseClient;
  requestId: string | null;
  estimateId: string | null;
  eventType: "draft_saved" | "draft_updated" | "draft_archived";
  decisionContext: Json | null | undefined;
}) {
  if (!decisionContext) {
    return;
  }

  await supabase.rpc("record_estimate_learning_event_rpc", {
    p_request_id: requestId,
    p_estimate_id: estimateId,
    p_event_type: eventType,
    p_decision_context: decisionContext,
  });
}

export async function POST(
  request: Request,
  { params }: ServiceRequestEstimatesRouteProps,
) {
  const auth = await requireEstimateSupabase(request);

  if (!auth.ok) {
    return auth.response;
  }

  const parsed = await readEstimatePayload(request);

  if (!parsed.ok) {
    return parsed.response;
  }

  const { id } = await params;

  const { data, error } = await auth.supabase.rpc(
    "create_service_request_estimate_rpc",
    {
      p_request_id: id,
      p_catalog_items: parsed.payload.catalogItems,
      p_custom_items: parsed.payload.customItems,
    },
  );

  if (error) {
    return fail(formatEstimateError(error.message), 403);
  }

  await recordEstimateDecisionEvent({
    supabase: auth.supabase,
    requestId: id,
    estimateId:
      data && typeof data === "object" && "id" in data
        ? String(data.id)
        : null,
    eventType: "draft_saved",
    decisionContext: parsed.payload.estimateDecisionContext,
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    estimate: data,
  });
}

export async function PATCH(request: Request) {
  const auth = await requireEstimateSupabase(request);

  if (!auth.ok) {
    return auth.response;
  }

  const parsed = await readEstimatePayload(request);

  if (!parsed.ok) {
    return parsed.response;
  }

  const estimateId = cleanText(parsed.rawPayload.estimateId, 80);

  if (!isUuid(estimateId)) {
    return fail("Choose a valid draft estimate to update.");
  }

  const { data, error } = await auth.supabase.rpc(
    "update_service_request_estimate_draft_rpc",
    {
      p_estimate_id: estimateId,
      p_catalog_items: parsed.payload.catalogItems,
      p_custom_items: parsed.payload.customItems,
    },
  );

  if (error) {
    return fail(formatEstimateError(error.message), 403);
  }

  await recordEstimateDecisionEvent({
    supabase: auth.supabase,
    requestId:
      data && typeof data === "object" && "service_request_id" in data
        ? String(data.service_request_id)
        : null,
    estimateId,
    eventType: "draft_updated",
    decisionContext: parsed.payload.estimateDecisionContext,
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    estimate: data,
  });
}

export async function DELETE(request: Request) {
  const auth = await requireEstimateSupabase(request);

  if (!auth.ok) {
    return auth.response;
  }

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const estimateId = cleanText(payload.estimateId, 80);

  if (!isUuid(estimateId)) {
    return fail("Choose a valid draft estimate to archive.");
  }

  const archiveResult = await auth.supabase.rpc(
    "archive_service_request_estimate_draft_rpc",
    {
      p_estimate_id: estimateId,
    },
  );
  const { data, error } = archiveResult.error
    ? await auth.supabase.rpc("void_service_request_estimate_draft_rpc", {
        p_estimate_id: estimateId,
      })
    : archiveResult;

  if (error) {
    return fail(formatEstimateError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    estimate: data,
  });
}
