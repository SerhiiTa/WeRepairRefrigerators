import { NextResponse } from "next/server";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  resolveDashboardCompanyContext,
  type DashboardCompanyContextClient,
} from "@/server/dashboard/company-context";
import {
  generateRepairProposalDraft,
  type RepairProposalGenerationInput,
} from "@/server/finance/repair-proposal-providers";
import { repairProposalDraftToEstimateDraftAgentResult } from "@/server/finance/repair-proposal-schema";
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
  eq(column: string, value: unknown): PriceBookQueryBuilder;
  or(filter: string, options?: Record<string, unknown>): PriceBookQueryBuilder;
  maybeSingle(): Promise<QueryResult<Record<string, unknown>>>;
};

type PriceBookDb = {
  from(table: string): PriceBookQueryBuilder;
};

function asQueryResult<T>(query: PriceBookQueryBuilder): Promise<QueryResult<T>> {
  return query as unknown as Promise<QueryResult<T>>;
}

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message, error: message }, { status });
}

function cleanUuid(value: unknown): string | null {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
    ? value.trim()
    : null;
}

function cleanText(value: unknown, maxLength = 1200): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

async function loadPriceBookCandidates({
  userScoped,
  serviceRole,
  profileId,
  context,
}: {
  userScoped: DashboardCompanyContextClient;
  serviceRole: DashboardCompanyContextClient & PriceBookDb;
  profileId: string;
  context: PriceBookSelectionContext;
}) {
  const companyContext = await resolveDashboardCompanyContext({
    client: userScoped,
    trustedClient: serviceRole,
    profileId,
    operation: "repair_proposal_generation",
  });

  if (!companyContext.ok) {
    return [];
  }

  const scopeFilter = `company_id.is.null,company_id.eq.${companyContext.companyId}`;
  const priceBookDb = serviceRole as unknown as PriceBookDb;
  const [groupsResult, applianceTypesResult, itemsResult, aliasesResult] =
    await Promise.all([
      asQueryResult<PriceBookSelectionGroup[]>(
        priceBookDb.from("price_book_appliance_groups").select("id,name,slug").or(scopeFilter),
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
    if (process.env.NODE_ENV !== "production") {
      console.warn("[repair-proposals] price book selection unavailable", {
        message: firstError.message,
        code: firstError.code ?? null,
      });
    }
    return [];
  }

  return rankPriceBookRepairSolutions({
    context,
    groups: groupsResult.data ?? [],
    applianceTypes: applianceTypesResult.data ?? [],
    items: itemsResult.data ?? [],
    aliases: aliasesResult.data ?? [],
  });
}

export async function POST(request: Request) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  const userScoped = createUserScopedServerClient(accessToken);
  const serviceRole = getSupabaseServiceRoleClient();

  if (!userScoped) {
    return fail("Repair Proposal generation is not configured.", 503);
  }

  const { data: userData, error: userError } =
    await userScoped.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const serviceRequestId = cleanUuid(payload.serviceRequestId ?? payload.jobId);
  const confirmedRepairScope = cleanText(
    payload.confirmedRepairScope ?? payload.technicianDiagnosis,
    2400,
  );

  if (!serviceRequestId) {
    return fail("Service request is required.");
  }
  if (!confirmedRepairScope) {
    return fail("Confirmed repair scope is required.");
  }

  const { data: requestRow, error: requestError } = await userScoped
    .from("service_requests")
    .select(
      "id,customer_name,appliance_type,appliance_brand,appliance_model,issue_description,job_name",
    )
    .eq("id", serviceRequestId)
    .maybeSingle();

  if (requestError) {
    return fail(requestError.message, 400);
  }
  if (!requestRow) {
    return fail("Service request not found.", 404);
  }

  const generationInput: RepairProposalGenerationInput = {
    serviceRequestId,
    customerName: String(requestRow.customer_name ?? "") || null,
    applianceType: String(requestRow.appliance_type ?? "") || null,
    brand: String(requestRow.appliance_brand ?? "") || null,
    modelNumber: String(requestRow.appliance_model ?? "") || null,
    customerComplaint: String(requestRow.issue_description ?? "") || null,
    confirmedRepairScope,
    language:
      payload.language === "english" ||
      payload.language === "russian" ||
      payload.language === "ukrainian" ||
      payload.language === "spanish" ||
      payload.language === "mixed"
        ? payload.language
        : null,
    preferredProvider:
      payload.preferredProvider === "openai" ||
      payload.preferredProvider === "anthropic" ||
      payload.preferredProvider === "deterministic"
        ? payload.preferredProvider
        : null,
    generationMode:
      payload.generationMode === "manual" ||
      payload.generationMode === "template" ||
      payload.generationMode === "deterministic_fallback" ||
      payload.generationMode === "ai"
        ? payload.generationMode
        : "ai",
  };

  const priceBookCandidates = serviceRole
    ? await loadPriceBookCandidates({
        userScoped: userScoped as unknown as DashboardCompanyContextClient,
        serviceRole: serviceRole as unknown as DashboardCompanyContextClient & PriceBookDb,
        profileId: userData.user.id,
        context: {
          serviceRequestId,
          applianceType: generationInput.applianceType,
          brand: generationInput.brand,
          issueDescription: generationInput.customerComplaint,
          jobName: String(requestRow.job_name ?? "") || null,
          diagnosisText: confirmedRepairScope,
        },
      })
    : [];

  const result = await generateRepairProposalDraft({
    ...generationInput,
    priceBookCandidates,
  });
  const draft = repairProposalDraftToEstimateDraftAgentResult(result.proposalDraft);

  return NextResponse.json({
    ok: true,
    source:
      result.provider === "openai" || result.provider === "anthropic"
        ? result.provider
        : "fallback",
    provider: result.provider,
    proposal_draft: result.proposalDraft,
    draft,
    repair_plan: {
      detectedRepairType: "technician_confirmed_repair_proposal",
      customerFacingExplanation: result.proposalDraft.customer_summary,
      requiredOperations: result.proposalDraft.repair_solutions.flatMap((solution) =>
        solution.items
          .filter((item) => item.line_type !== "part" && item.customer_visible)
          .map((item) => ({ id: item.id, title: item.customer_title })),
      ),
      likelyParts: result.proposalDraft.repair_solutions.flatMap((solution) =>
        solution.items
          .filter((item) => item.line_type === "part" && item.customer_visible)
          .map((item) => ({ id: item.id, customerName: item.customer_title })),
      ),
      confidence: draft.confidence,
    },
    estimate_lines: draft.lines,
    customer_summary: draft.customerDescription,
    warranty_text: draft.warrantyText,
    pricing_warnings: result.proposalDraft.warnings.map((warning) => warning.message),
    confidence: draft.confidence,
    explicit_scope: result.explicitScope,
    fallback_reasons: result.fallbackReasons,
    message:
      result.provider === "openai" || result.provider === "anthropic"
        ? "Generated with AI. Please review before sending."
        : "Generated locally. Please review before sending.",
  });
}
