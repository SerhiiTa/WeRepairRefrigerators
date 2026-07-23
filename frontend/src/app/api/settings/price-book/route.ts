import { NextResponse } from "next/server";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  resolveDashboardCompanyContext,
  type DashboardCompanyContextClient,
} from "@/server/dashboard/company-context";
import { extractBearerToken } from "@/server/intake/intake-service";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

export const dynamic = "force-dynamic";

type DashboardRole = "viewer" | "editor" | "manager";

type SupabaseErrorMeta = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

type PriceBookQueryResult<T> = {
  data: T | null;
  error: SupabaseErrorMeta | null;
};

type PriceBookQueryBuilder = {
  select(columns?: string): PriceBookQueryBuilder;
  or(filter: string, options?: Record<string, unknown>): PriceBookQueryBuilder;
  order(column: string, options?: Record<string, unknown>): PriceBookQueryBuilder;
  eq(column: string, value: unknown): PriceBookQueryBuilder;
  is(column: string, value: unknown): PriceBookQueryBuilder;
  in(column: string, values: unknown[]): PriceBookQueryBuilder;
  insert(values: unknown): PriceBookQueryBuilder;
  update(values: unknown): PriceBookQueryBuilder;
  delete(): PriceBookQueryBuilder;
  single(): Promise<PriceBookQueryResult<Record<string, unknown>>>;
  maybeSingle(): Promise<PriceBookQueryResult<Record<string, unknown>>>;
};

type PriceBookDb = {
  from(table: string): PriceBookQueryBuilder;
};

type PriceBookItemRecord = {
  id: string;
  company_id: string | null;
  item_type: string;
  name: string;
  normalized_name: string;
  appliance_group_id: string | null;
  review_status: string;
  active: boolean;
  price_book_item_aliases?: { alias: string; normalized_alias: string }[];
};

type ScoredPriceBookCandidate = PriceBookItemRecord & {
  score: number;
  reason: string;
  sameGroup: boolean;
};

type PriceBookPayload = {
  id?: unknown;
  duplicateAction?: unknown;
  itemType?: unknown;
  name?: unknown;
  description?: unknown;
  applianceGroupId?: unknown;
  applianceType?: unknown;
  brand?: unknown;
  defaultQuantity?: unknown;
  unit?: unknown;
  laborPrice?: unknown;
  partPrice?: unknown;
  totalPrice?: unknown;
  pricingStrategy?: unknown;
  taxable?: unknown;
  defaultTaxBehavior?: unknown;
  warrantyText?: unknown;
  estimatedDurationMinutes?: unknown;
  internalNotes?: unknown;
  customerDescription?: unknown;
  aiKeywords?: unknown;
  aliases?: unknown;
  active?: unknown;
  reviewStatus?: unknown;
  bundleDisplayMode?: unknown;
  bundleChildren?: unknown;
  canonicalItemId?: unknown;
  reason?: unknown;
};

const ITEM_TYPES = ["labor", "part", "service", "fee", "bundle"] as const;
const REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "merged",
  "archived",
] as const;

function asQueryResult<T>(
  query: PriceBookQueryBuilder,
): Promise<PriceBookQueryResult<T>> {
  return query as unknown as Promise<PriceBookQueryResult<T>>;
}

function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { ok: false, message, error: message, ...extra },
    { status },
  );
}

function cleanText(value: unknown, maxLength = 240): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : null;
}

function cleanLongText(value: unknown, maxLength = 2000): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

function cleanUuid(value: unknown): string | null {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
    ? value.trim()
    : null;
}

function cleanNumber(value: unknown, fallback = 0): number {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : fallback;

  return Number.isFinite(numberValue) && numberValue >= 0
    ? Math.round(numberValue * 100) / 100
    : fallback;
}

function cleanInteger(value: unknown): number | null {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value)
        : null;

  return numberValue && Number.isFinite(numberValue) && numberValue > 0
    ? Math.round(numberValue)
    : null;
}

function normalizePriceBookText(value: unknown): string {
  return typeof value === "string"
    ? value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";
}

function cleanStringArray(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => cleanText(item, 80))
        .filter((item): item is string => Boolean(item)),
    ),
  ).slice(0, maxItems);
}

function cleanItemType(value: unknown) {
  return ITEM_TYPES.find((item) => item === value) ?? null;
}

function cleanReviewStatus(value: unknown) {
  return REVIEW_STATUSES.find((status) => status === value) ?? null;
}

function cleanPricingStrategy(value: unknown) {
  return typeof value === "string" &&
    ["fixed_total", "labor_plus_part", "bundle_override", "manual"].includes(
      value,
    )
    ? value
    : "fixed_total";
}

function cleanTaxBehavior(value: unknown) {
  return typeof value === "string" &&
    ["company_default", "taxable", "non_taxable"].includes(value)
    ? value
    : "company_default";
}

function cleanBundleDisplayMode(value: unknown) {
  return typeof value === "string" &&
    ["expanded", "collapsed", "technician_choice"].includes(value)
    ? value
    : "expanded";
}

function getDashboardRole(
  profileRole: string | null,
  memberRole: string | null,
): DashboardRole {
  if (profileRole === "admin" || profileRole === "company_owner") {
    return "manager";
  }

  if (memberRole === "owner" || memberRole === "manager") {
    return "manager";
  }

  if (memberRole === "dispatcher" || profileRole === "dispatcher") {
    return "editor";
  }

  return "viewer";
}

async function readDevMembershipDiagnostics({
  userScoped,
  serviceRole,
  profileId,
}: {
  userScoped: PriceBookDb & {
    rpc(functionName: string): Promise<PriceBookQueryResult<unknown>>;
  };
  serviceRole: PriceBookDb;
  profileId: string;
}) {
  if (process.env.NODE_ENV === "production") {
    return null;
  }

  const rpcResult = await userScoped.rpc("current_dashboard_company_id");
  const membershipResult = await asQueryResult<Record<string, unknown>[]>(
    serviceRole
      .from("company_members")
      .select(
        "company_id,member_role,member_status,archived_at,removed_at,suspended_at",
      )
      .eq("profile_id", profileId),
  );
  const membershipRows = membershipResult.data ?? [];
  const companyIds = Array.from(
    new Set(
      membershipRows
        .map((row) =>
          typeof row.company_id === "string" ? row.company_id : null,
        )
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const companiesResult =
    companyIds.length > 0
      ? await asQueryResult<Record<string, unknown>[]>(
          serviceRole
            .from("companies")
            .select("id,name,status,archived_at")
            .in("id", companyIds),
        )
      : { data: [], error: null };
  const companyById = new Map(
    (companiesResult.data ?? []).map((row) => [String(row.id), row]),
  );

  return {
    currentDashboardCompanyIdPresent:
      typeof rpcResult.data === "string" && rpcResult.data.length > 0,
    currentDashboardCompanyIdSuffix:
      typeof rpcResult.data === "string" ? rpcResult.data.slice(-6) : null,
    currentDashboardCompanyIdError: rpcResult.error?.code ?? null,
    membershipRowCount: membershipRows.length,
    membershipRows: membershipRows.map((row) => {
      const companyId =
        typeof row.company_id === "string" ? row.company_id : null;
      const company = companyId ? companyById.get(companyId) : null;

      return {
        companyIdSuffix: companyId ? companyId.slice(-6) : null,
        memberRole:
          typeof row.member_role === "string" ? row.member_role : null,
        memberStatus:
          typeof row.member_status === "string" ? row.member_status : null,
        archived: Boolean(row.archived_at),
        removed: Boolean(row.removed_at),
        suspended: Boolean(row.suspended_at),
        companyExists: Boolean(company),
        companyStatus:
          company && typeof company.status === "string"
            ? company.status
            : null,
        companyArchived: Boolean(company?.archived_at),
      };
    }),
    membershipQueryError: membershipResult.error?.code ?? null,
    companiesQueryError: companiesResult.error?.code ?? null,
  };
}

async function requireSession(request: Request) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return {
      ok: false as const,
      response: fail("A logged-in dashboard session is required.", 401),
    };
  }

  const userScoped = createUserScopedServerClient(accessToken);

  if (!userScoped) {
    return {
      ok: false as const,
      response: fail("Supabase is not configured for Price Book.", 503),
    };
  }

  const { data: userData, error: userError } =
    await userScoped.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return {
      ok: false as const,
      response: fail("A valid authenticated session is required.", 401),
    };
  }

  const { data: profile, error: profileError } = await userScoped
    .from("profiles")
    .select("id,email,full_name,role,status")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return {
      ok: false as const,
      response: fail("A dashboard profile is required.", 401),
    };
  }

  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return {
      ok: false as const,
      response: fail("Server Price Book writer is not configured.", 503),
    };
  }

  const companyContext = await resolveDashboardCompanyContext({
    client: userScoped as unknown as DashboardCompanyContextClient,
    trustedClient: serviceRole as unknown as DashboardCompanyContextClient,
    profileId: String(profile.id),
    operation: "settings_price_book",
  });

  if (!companyContext.ok) {
    const devMembershipDiagnostics = await readDevMembershipDiagnostics({
      userScoped:
        userScoped as unknown as PriceBookDb & {
          rpc(functionName: string): Promise<PriceBookQueryResult<unknown>>;
        },
      serviceRole: serviceRole as unknown as PriceBookDb,
      profileId: String(profile.id),
    });
    const diagnostics =
      process.env.NODE_ENV !== "production"
        ? {
            diagnostics: {
              authenticatedUserIdSuffix: String(profile.id).slice(-6),
              profileLoaded: true,
              resolverStage: companyContext.stage,
              membership: devMembershipDiagnostics,
            },
          }
        : {};

    return {
      ok: false as const,
      response: fail("We couldn’t load your company Price Book.", companyContext.status, {
        code: companyContext.code,
        ...diagnostics,
      }),
    };
  }

  return {
    ok: true as const,
    serviceRole: serviceRole as unknown as PriceBookDb,
    companyId: companyContext.companyId,
    profile,
    role: getDashboardRole(
      typeof profile.role === "string" ? profile.role : null,
      companyContext.membership.memberRole,
    ),
  };
}

async function loadPriceBookData(serviceRole: PriceBookDb, companyId: string) {
  const scopeFilter = `company_id.is.null,company_id.eq.${companyId}`;

  const [
    groupsResult,
    applianceTypesResult,
    itemsResult,
    aliasesResult,
    bundleItemsResult,
  ] = await Promise.all([
    asQueryResult<Record<string, unknown>[]>(
      serviceRole
        .from("price_book_appliance_groups")
        .select("*")
        .or(scopeFilter)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ),
    asQueryResult<Record<string, unknown>[]>(
      serviceRole
        .from("price_book_appliance_group_types")
        .select("*, price_book_appliance_groups!inner(company_id)")
        .or(scopeFilter, { foreignTable: "price_book_appliance_groups" })
        .order("sort_order", { ascending: true })
        .order("appliance_type", { ascending: true }),
    ),
    asQueryResult<Record<string, unknown>[]>(
      serviceRole
        .from("price_book_items")
        .select("*")
        .or(scopeFilter)
        .order("item_type", { ascending: true })
        .order("name", { ascending: true }),
    ),
    asQueryResult<Record<string, unknown>[]>(
      serviceRole
        .from("price_book_item_aliases")
        .select("*, price_book_items!inner(company_id)")
        .or(scopeFilter, { foreignTable: "price_book_items" }),
    ),
    asQueryResult<Record<string, unknown>[]>(
      serviceRole
        .from("price_book_bundle_items")
        .select(
          "*, bundle:price_book_items!price_book_bundle_items_bundle_item_id_fkey(company_id,name,item_type), child:price_book_items!price_book_bundle_items_child_item_id_fkey(id,name,item_type,total_price,customer_description)",
        )
        .or(scopeFilter, { foreignTable: "bundle" })
        .order("sort_order", { ascending: true }),
    ),
  ]);

  const firstError =
    groupsResult.error ??
    applianceTypesResult.error ??
    itemsResult.error ??
    aliasesResult.error ??
    bundleItemsResult.error;

  if (firstError) {
    throw firstError;
  }

  return {
    groups: groupsResult.data ?? [],
    applianceTypes: applianceTypesResult.data ?? [],
    items: itemsResult.data ?? [],
    aliases: aliasesResult.data ?? [],
    bundleItems: bundleItemsResult.data ?? [],
  };
}

function scoreDuplicate(
  candidate: PriceBookItemRecord & { aliases: string[] },
  normalizedName: string,
  aliases: string[],
) {
  if (candidate.normalized_name === normalizedName) {
    return { score: 100, reason: "exact_name" };
  }

  const normalizedAliases = aliases.map(normalizePriceBookText).filter(Boolean);
  const candidateAliases = Array.isArray(candidate.aliases)
    ? candidate.aliases
    : [];

  if (
    candidateAliases.some((alias: string) =>
      normalizedAliases.includes(normalizePriceBookText(alias)),
    )
  ) {
    return { score: 90, reason: "alias" };
  }

  const tokens = new Set(
    normalizedName.split(/\s+/).filter((token) => token.length >= 3),
  );
  const overlap = Array.from(tokens).filter((token) =>
    String(candidate.normalized_name ?? "").includes(token),
  ).length;

  if (overlap >= 2) {
    return { score: 70, reason: "token_overlap" };
  }

  return { score: 0, reason: "none" };
}

async function findDuplicates({
  serviceRole,
  companyId,
  itemType,
  name,
  applianceGroupId,
  aliases,
  excludeItemIds,
}: {
  serviceRole: PriceBookDb;
  companyId: string;
  itemType: string;
  name: string;
  applianceGroupId: string | null;
  aliases: string[];
  excludeItemIds?: string[];
}) {
  const normalizedName = normalizePriceBookText(name);
  const { data: rows, error } = await asQueryResult<PriceBookItemRecord[]>(
    serviceRole
      .from("price_book_items")
      .select("id,company_id,item_type,name,normalized_name,appliance_group_id,review_status,active,price_book_item_aliases(alias,normalized_alias)")
      .eq("item_type", itemType)
      .eq("active", true)
      .is("archived_at", null)
      .in("review_status", ["approved", "pending"])
      .or(`company_id.is.null,company_id.eq.${companyId}`),
  );

  if (error) {
    throw error;
  }

  return (rows ?? [])
    .filter((row) => !(excludeItemIds ?? []).includes(row.id))
    .map((row): ScoredPriceBookCandidate => {
      const score = scoreDuplicate(
        {
          ...row,
          aliases: (row.price_book_item_aliases ?? []).map(
            (alias: { alias: string }) => alias.alias,
          ),
        },
        normalizedName,
        aliases,
      );
      const sameGroup = !applianceGroupId || row.appliance_group_id === applianceGroupId;

      return { ...row, ...score, sameGroup };
    })
    .filter((row) => row.score >= 90 || (row.score >= 70 && row.sameGroup))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      companyId: row.company_id,
      itemType: row.item_type,
      name: row.name,
      applianceGroupId: row.appliance_group_id,
      reviewStatus: row.review_status,
      active: row.active,
      matchReason: row.reason,
      matchScore: row.score,
    }));
}

function createItemRow({
  payload,
  companyId,
  profileId,
  role,
}: {
  payload: PriceBookPayload;
  companyId: string;
  profileId: string;
  role: DashboardRole;
}) {
  const itemType = cleanItemType(payload.itemType);
  const name = cleanText(payload.name, 160);

  if (!itemType || !name) {
    return null;
  }

  const requestedStatus = cleanReviewStatus(payload.reviewStatus);
  const reviewStatus =
    role === "manager" && requestedStatus
      ? requestedStatus
      : role === "manager"
        ? "approved"
        : "pending";
  const laborPrice = cleanNumber(payload.laborPrice);
  const partPrice = cleanNumber(payload.partPrice);
  const totalPrice =
    payload.totalPrice === undefined
      ? Math.round((laborPrice + partPrice) * 100) / 100
      : cleanNumber(payload.totalPrice);

  return {
    company_id: companyId,
    item_type: itemType,
    name,
    normalized_name: normalizePriceBookText(name),
    description: cleanLongText(payload.description, 1000),
    appliance_group_id: cleanUuid(payload.applianceGroupId),
    appliance_type: cleanText(payload.applianceType, 80),
    brand: cleanText(payload.brand, 80),
    default_quantity: Math.max(0.01, cleanNumber(payload.defaultQuantity, 1)),
    unit: cleanText(payload.unit, 40) ?? "each",
    labor_price: laborPrice,
    part_price: partPrice,
    total_price: totalPrice,
    pricing_strategy: cleanPricingStrategy(payload.pricingStrategy),
    taxable: typeof payload.taxable === "boolean" ? payload.taxable : true,
    default_tax_behavior: cleanTaxBehavior(payload.defaultTaxBehavior),
    warranty_text: cleanLongText(payload.warrantyText, 1000),
    estimated_duration_minutes: cleanInteger(payload.estimatedDurationMinutes),
    internal_notes: cleanLongText(payload.internalNotes, 1500),
    customer_description: cleanLongText(payload.customerDescription, 1200),
    ai_keywords: cleanStringArray(payload.aiKeywords, 16),
    bundle_display_mode: cleanBundleDisplayMode(payload.bundleDisplayMode),
    active: typeof payload.active === "boolean" ? payload.active : true,
    review_status: reviewStatus,
    created_by_profile_id: profileId,
    approved_by_profile_id: reviewStatus === "approved" ? profileId : null,
    approved_at: reviewStatus === "approved" ? new Date().toISOString() : null,
    source: reviewStatus === "approved" ? "company" : "pending_request",
  };
}

async function replaceAliases(
  serviceRole: PriceBookDb,
  itemId: string,
  aliases: string[],
) {
  await asQueryResult<Record<string, unknown>[]>(
    serviceRole
      .from("price_book_item_aliases")
      .delete()
      .eq("price_book_item_id", itemId),
  );

  const rows = aliases
    .map((alias) => ({
      price_book_item_id: itemId,
      alias,
      normalized_alias: normalizePriceBookText(alias),
    }))
    .filter((row) => row.normalized_alias.length > 0);

  if (rows.length > 0) {
    const { error } = await asQueryResult<Record<string, unknown>[]>(
      serviceRole.from("price_book_item_aliases").insert(rows),
    );
    if (error) {
      throw error;
    }
  }
}

async function replaceBundleChildren(
  serviceRole: PriceBookDb,
  itemId: string,
  bundleChildren: unknown,
) {
  if (!Array.isArray(bundleChildren)) {
    return;
  }

  await asQueryResult<Record<string, unknown>[]>(
    serviceRole
      .from("price_book_bundle_items")
      .delete()
      .eq("bundle_item_id", itemId),
  );

  const rows = bundleChildren
    .map((child, index) => {
      const childRecord = child as Record<string, unknown>;
      const childItemId = cleanUuid(childRecord.childItemId);

      if (!childItemId || childItemId === itemId) {
        return null;
      }

      return {
        bundle_item_id: itemId,
        child_item_id: childItemId,
        sort_order: index * 10 + 10,
        default_quantity: Math.max(
          0.01,
          cleanNumber(childRecord.defaultQuantity, 1),
        ),
        is_optional:
          typeof childRecord.isOptional === "boolean"
            ? childRecord.isOptional
            : false,
        is_required:
          typeof childRecord.isRequired === "boolean"
            ? childRecord.isRequired
            : true,
        bundled_price_override:
          childRecord.bundledPriceOverride === null
            ? null
            : cleanNumber(childRecord.bundledPriceOverride),
        use_child_price:
          typeof childRecord.useChildPrice === "boolean"
            ? childRecord.useChildPrice
            : true,
        hidden_internal:
          typeof childRecord.hiddenInternal === "boolean"
            ? childRecord.hiddenInternal
            : false,
        customer_expanded_description: cleanLongText(
          childRecord.customerExpandedDescription,
          800,
        ),
      };
    })
    .filter(Boolean);

  if (rows.length > 0) {
    const { error } = await asQueryResult<Record<string, unknown>[]>(
      serviceRole.from("price_book_bundle_items").insert(rows),
    );
    if (error) {
      throw error;
    }
  }
}

export async function GET(request: Request) {
  const session = await requireSession(request);

  if (!session.ok) {
    return session.response;
  }

  try {
    const data = await loadPriceBookData(session.serviceRole, session.companyId);

    return NextResponse.json({
      ok: true,
      companyId: session.companyId,
      role: session.role,
      ...data,
    });
  } catch (error) {
    console.error("[price-book]", {
      operation: "load",
      companyId: session.companyId,
      error:
        error && typeof error === "object"
          ? {
              message: "message" in error ? error.message : String(error),
              code: "code" in error ? error.code : null,
              details: "details" in error ? error.details : null,
              hint: "hint" in error ? error.hint : null,
            }
          : { message: String(error) },
    });

    return fail("Price Book could not be loaded. Apply migration 0066 if needed.", 503);
  }
}

export async function POST(request: Request) {
  const session = await requireSession(request);

  if (!session.ok) {
    return session.response;
  }

  if (session.role === "viewer") {
    return fail(
      "This account can use existing Price Book items but cannot create catalog rows.",
      403,
    );
  }

  let payload: PriceBookPayload;

  try {
    payload = (await request.json()) as PriceBookPayload;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const aliases = cleanStringArray(payload.aliases, 12);
  const row = createItemRow({
    payload,
    companyId: session.companyId,
    profileId: session.profile.id,
    role: session.role,
  });

  if (!row) {
    return fail("Item type and name are required.");
  }

  const duplicateAction =
    typeof payload.duplicateAction === "string"
      ? payload.duplicateAction
      : "check";
  const duplicates = await findDuplicates({
    serviceRole: session.serviceRole,
    companyId: session.companyId,
    itemType: row.item_type,
    name: row.name,
    applianceGroupId: row.appliance_group_id,
    aliases,
  });

  if (
    duplicates.length > 0 &&
    duplicateAction !== "request_new" &&
    !(duplicateAction === "create_anyway" && session.role === "manager")
  ) {
    return fail("Similar items already exist.", 409, {
      duplicateCandidates: duplicates,
    });
  }

  if (duplicateAction === "request_new") {
    row.review_status = "pending";
    row.approved_by_profile_id = null;
    row.approved_at = null;
    row.source = "pending_request";
  }

  const { data: item, error } = await session.serviceRole
    .from("price_book_items")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    return fail(error.message, 400);
  }

  if (!item?.id) {
    return fail("Price Book item could not be confirmed after save.", 503);
  }

  const itemId = String(item.id);

  await replaceAliases(session.serviceRole, itemId, aliases);
  await replaceBundleChildren(session.serviceRole, itemId, payload.bundleChildren);

  return NextResponse.json({
    ok: true,
    item,
    duplicateCandidates: duplicates,
  });
}

export async function PATCH(request: Request) {
  const session = await requireSession(request);

  if (!session.ok) {
    return session.response;
  }

  if (session.role !== "manager") {
    return fail(
      "Only company managers can edit, approve, archive, or merge Price Book items.",
      403,
    );
  }

  let payload: PriceBookPayload;

  try {
    payload = (await request.json()) as PriceBookPayload;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const id = cleanUuid(payload.id);

  if (!id) {
    return fail("Price Book item is required.");
  }

  const row = createItemRow({
    payload,
    companyId: session.companyId,
    profileId: session.profile.id,
    role: session.role,
  });

  if (!row) {
    return fail("Item type and name are required.");
  }

  const { data: existingItem, error: existingError } =
    await session.serviceRole
      .from("price_book_items")
      .select("*")
      .eq("id", id)
      .or(`company_id.is.null,company_id.eq.${session.companyId}`)
      .maybeSingle();

  if (existingError) {
    return fail(existingError.message, 400);
  }

  if (!existingItem?.id) {
    return fail("Price Book item was not found in this company catalog.", 404);
  }

  const existingCompanyId =
    typeof existingItem.company_id === "string" ? existingItem.company_id : null;

  if (existingCompanyId && existingCompanyId !== session.companyId) {
    return fail("This Price Book item belongs to another company.", 403);
  }

  const aliases = cleanStringArray(payload.aliases, 12);
  const duplicateExclusions = [
    id,
    typeof existingItem.canonical_item_id === "string"
      ? existingItem.canonical_item_id
      : null,
  ].filter((value): value is string => Boolean(value));
  const duplicateAction =
    typeof payload.duplicateAction === "string"
      ? payload.duplicateAction
      : "check";
  const duplicates = await findDuplicates({
    serviceRole: session.serviceRole,
    companyId: session.companyId,
    itemType: row.item_type,
    name: row.name,
    applianceGroupId: row.appliance_group_id,
    aliases,
    excludeItemIds: duplicateExclusions,
  });

  if (
    duplicates.length > 0 &&
    duplicateAction !== "request_new" &&
    !(duplicateAction === "create_anyway" && session.role === "manager")
  ) {
    return fail("Similar items already exist.", 409, {
      duplicateCandidates: duplicates,
    });
  }

  const nextReviewStatus =
    cleanReviewStatus(payload.reviewStatus) ?? row.review_status;
  const updateRow = {
    ...row,
    review_status: nextReviewStatus,
    approved_by_profile_id:
      nextReviewStatus === "approved" ? session.profile.id : null,
    approved_at:
      nextReviewStatus === "approved" ? new Date().toISOString() : null,
    archived_at:
      nextReviewStatus === "archived" ? new Date().toISOString() : null,
    canonical_item_id:
      nextReviewStatus === "merged" ? cleanUuid(payload.canonicalItemId) : null,
  };

  const saveQuery = existingCompanyId
    ? session.serviceRole
        .from("price_book_items")
        .update(updateRow)
        .eq("id", id)
        .eq("company_id", session.companyId)
        .select("*")
        .maybeSingle()
    : session.serviceRole
        .from("price_book_items")
        .insert({
          ...updateRow,
          company_id: session.companyId,
          source: "company_override",
          canonical_item_id:
            nextReviewStatus === "merged"
              ? cleanUuid(payload.canonicalItemId)
              : id,
        })
        .select("*")
        .single();

  const { data: item, error } = await saveQuery;

  if (error) {
    return fail(error.message, 400);
  }

  if (!item?.id) {
    return fail("Price Book item could not be confirmed after update.", 503);
  }

  const itemId = String(item.id);

  await replaceAliases(
    session.serviceRole,
    itemId,
    aliases,
  );
  await replaceBundleChildren(session.serviceRole, itemId, payload.bundleChildren);

  if (nextReviewStatus === "merged" && updateRow.canonical_item_id) {
    await asQueryResult<Record<string, unknown>[]>(
      session.serviceRole.from("price_book_item_merge_history").insert({
        company_id: session.companyId,
        source_item_id: itemId,
        target_item_id: updateRow.canonical_item_id,
        merged_by_profile_id: session.profile.id,
        reason: cleanLongText(payload.reason, 500),
      }),
    );
  }

  return NextResponse.json({ ok: true, item });
}
