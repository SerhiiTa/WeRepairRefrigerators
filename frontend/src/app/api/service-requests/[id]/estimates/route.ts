import { NextResponse } from "next/server";

import { createUserScopedServerClient } from "@/server/onboarding/supabase";

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
  quantity: number;
  unitPrice: number;
  notes?: string | null;
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function formatEstimateError(message: string): string {
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

  return "We could not create this estimate yet.";
}

export async function POST(
  request: Request,
  { params }: ServiceRequestEstimatesRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  let payload: {
    catalogItems?: unknown;
    customItems?: unknown;
  };

  try {
    payload = (await request.json()) as {
      catalogItems?: unknown;
      customItems?: unknown;
    };
  } catch {
    return fail("Request body was not valid JSON.");
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
          const unitPrice = cleanMoney(rawItem.unitPrice);

          if (!itemTitle || unitPrice <= 0) {
            return null;
          }

          return {
            itemTitle,
            quantity: cleanQuantity(rawItem.quantity),
            unitPrice,
            notes: cleanText(rawItem.notes, 1000) || null,
          };
        })
        .filter((item): item is EstimateCustomItemInput => item !== null)
    : [];

  if (catalogItems.length + customItems.length === 0) {
    return fail("Add at least one estimate line item.");
  }

  const { id } = await params;
  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for estimates.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const { data, error } = await supabase.rpc(
    "create_service_request_estimate_rpc",
    {
      p_request_id: id,
      p_catalog_items: catalogItems,
      p_custom_items: customItems,
    },
  );

  if (error) {
    return fail(formatEstimateError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    estimate: data,
  });
}
