import { NextResponse } from "next/server";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  resolveDashboardCompanyContext,
  type DashboardCompanyContextClient,
} from "@/server/dashboard/company-context";
import { extractBearerToken } from "@/server/intake/intake-service";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";
import {
  rankPriceBookRepairSolutions,
  type PriceBookSelectionAlias,
  type PriceBookSelectionApplianceType,
  type PriceBookSelectionContext,
  type PriceBookSelectionGroup,
  type PriceBookSelectionItem,
} from "@/server/price-book/selection";

export const dynamic = "force-dynamic";

type QueryResult<T> = {
  data: T | null;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
};

type PriceBookQueryBuilder = {
  select(columns?: string): PriceBookQueryBuilder;
  or(filter: string, options?: Record<string, unknown>): PriceBookQueryBuilder;
};

type PriceBookDb = {
  from(table: string): PriceBookQueryBuilder;
};

function asQueryResult<T>(
  query: PriceBookQueryBuilder,
): Promise<QueryResult<T>> {
  return query as unknown as Promise<QueryResult<T>>;
}

function fail(message: string, status = 400) {
  return NextResponse.json(
    { ok: false, message, error: message },
    { status },
  );
}

function cleanUuid(value: unknown): string | null {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
    ? value.trim()
    : null;
}

function cleanText(value: unknown, maxLength = 800): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

function normalizeContext(payload: Record<string, unknown>): PriceBookSelectionContext {
  return {
    serviceRequestId: cleanUuid(payload.serviceRequestId),
    applianceType: cleanText(payload.applianceType, 120),
    applianceGroup: cleanText(payload.applianceGroup, 120),
    brand: cleanText(payload.brand, 120),
    issueDescription: cleanText(payload.issueDescription, 1200),
    jobName: cleanText(payload.jobName, 240),
    customerComplaint: cleanText(payload.customerComplaint, 1200),
    diagnosisText: cleanText(payload.diagnosisText, 1200),
  };
}

export async function POST(request: Request) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  const userScoped = createUserScopedServerClient(accessToken);
  const serviceRole = getSupabaseServiceRoleClient();

  if (!userScoped || !serviceRole) {
    return fail("Price Book selection is not configured.", 503);
  }

  const { data: userData, error: userError } =
    await userScoped.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const companyContext = await resolveDashboardCompanyContext({
    client: userScoped as unknown as DashboardCompanyContextClient,
    trustedClient: serviceRole as unknown as DashboardCompanyContextClient,
    profileId: userData.user.id,
    operation: "price_book_repair_solutions",
  });

  if (!companyContext.ok) {
    return fail("We couldn’t load your company Price Book.", companyContext.status);
  }

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  let context = normalizeContext(payload);

  if (context.serviceRequestId) {
    const { data: requestRow, error: requestError } = await userScoped
      .from("service_requests")
      .select(
        "id,job_name,appliance_type,appliance_brand,issue_description,customer_id",
      )
      .eq("id", context.serviceRequestId)
      .maybeSingle();

    if (requestError) {
      return fail(requestError.message, 400);
    }

    if (requestRow) {
      context = {
        ...context,
        applianceType:
          context.applianceType ?? String(requestRow.appliance_type ?? ""),
        brand: context.brand ?? String(requestRow.appliance_brand ?? ""),
        issueDescription:
          context.issueDescription ?? String(requestRow.issue_description ?? ""),
        jobName: context.jobName ?? String(requestRow.job_name ?? ""),
      };
    }
  }

  const scopeFilter = `company_id.is.null,company_id.eq.${companyContext.companyId}`;
  const priceBookDb = serviceRole as unknown as PriceBookDb;
  const [
    groupsResult,
    applianceTypesResult,
    itemsResult,
    aliasesResult,
  ] = await Promise.all([
    asQueryResult<PriceBookSelectionGroup[]>(
      priceBookDb
      .from("price_book_appliance_groups")
      .select("id,name,slug")
        .or(scopeFilter),
    ),
    asQueryResult<PriceBookSelectionApplianceType[]>(
      priceBookDb
      .from("price_book_appliance_group_types")
      .select(
        "appliance_group_id,appliance_type,normalized_appliance_type, price_book_appliance_groups!inner(company_id)",
      )
        .or(scopeFilter, { foreignTable: "price_book_appliance_groups" }),
    ),
    asQueryResult<PriceBookSelectionItem[]>(
      priceBookDb
      .from("price_book_items")
      .select(
        "id,company_id,item_type,name,normalized_name,customer_description,appliance_group_id,appliance_type,brand,total_price,active,review_status,ai_keywords,canonical_item_id",
      )
        .or(scopeFilter),
    ),
    asQueryResult<PriceBookSelectionAlias[]>(
      priceBookDb
      .from("price_book_item_aliases")
      .select("price_book_item_id,alias,normalized_alias, price_book_items!inner(company_id)")
        .or(scopeFilter, { foreignTable: "price_book_items" }),
    ),
  ]);

  const firstError =
    groupsResult.error ??
    applianceTypesResult.error ??
    itemsResult.error ??
    aliasesResult.error;

  if (firstError) {
    return fail(firstError.message, 503);
  }

  const suggestions = rankPriceBookRepairSolutions({
    context,
    groups: groupsResult.data ?? [],
    applianceTypes: applianceTypesResult.data ?? [],
    items: itemsResult.data ?? [],
    aliases: aliasesResult.data ?? [],
  });

  return NextResponse.json({
    ok: true,
    source: "rules",
    aiUsed: false,
    context,
    suggestions,
  });
}
