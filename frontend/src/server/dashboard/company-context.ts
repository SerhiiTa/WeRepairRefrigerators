type SupabaseErrorMeta = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

type QueryResult<T> = {
  data: T | null;
  error: SupabaseErrorMeta | null;
};

type ChainableQuery = {
  select(columns?: string): ChainableQuery;
  eq(column: string, value: unknown): ChainableQuery;
  is(column: string, value: unknown): ChainableQuery;
  order(column: string, options?: Record<string, unknown>): ChainableQuery;
  limit(count: number): ChainableQuery;
  maybeSingle(): Promise<QueryResult<Record<string, unknown>>>;
};

export type DashboardCompanyContextClient = {
  rpc(functionName: string): Promise<QueryResult<unknown>>;
  from(table: string): ChainableQuery;
};

export type DashboardCompanyContext =
  | {
      ok: true;
      companyId: string;
      membership: {
        memberRole: string | null;
        memberStatus: string | null;
      };
      source: "rpc" | "company_members";
    }
  | {
      ok: false;
      code:
        | "COMPANY_CONTEXT_MISSING"
        | "COMPANY_MEMBERSHIP_MISSING"
        | "COMPANY_NOT_FOUND"
        | "PRICE_BOOK_QUERY_FAILED";
      status: number;
      stage: string;
      message: string;
    };

function devLogDashboardCompanyContext(
  operation: string,
  details: Record<string, unknown>,
) {
  if (process.env.NODE_ENV !== "production") {
    console.info("[dashboard-company-context]", {
      operation,
      ...details,
    });
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function resolveDashboardCompanyContext({
  client,
  trustedClient,
  profileId,
  operation,
}: {
  client: DashboardCompanyContextClient;
  trustedClient?: DashboardCompanyContextClient | null;
  profileId: string;
  operation: string;
}): Promise<DashboardCompanyContext> {
  devLogDashboardCompanyContext(operation, {
    stage: "start",
    hasProfileId: Boolean(profileId),
  });

  const rpcResult = await client.rpc("current_dashboard_company_id");

  if (rpcResult.error) {
    devLogDashboardCompanyContext(operation, {
      stage: "rpc_failed",
      message: rpcResult.error.message,
      code: rpcResult.error.code ?? null,
      details: rpcResult.error.details ?? null,
      hint: rpcResult.error.hint ?? null,
    });
  }

  let companyId = readString(rpcResult.data);
  const source: "rpc" | "company_members" = companyId
    ? "rpc"
    : "company_members";
  const membershipClient = trustedClient ?? client;

  if (!companyId) {
    const membershipLookup = await membershipClient
      .from("company_members")
      .select("company_id,member_role,member_status")
      .eq("profile_id", profileId)
      .eq("member_status", "active")
      .is("archived_at", null)
      .is("removed_at", null)
      .is("suspended_at", null)
      .order("joined_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (membershipLookup.error) {
      devLogDashboardCompanyContext(operation, {
        stage: "membership_lookup_failed",
        message: membershipLookup.error.message,
        code: membershipLookup.error.code ?? null,
        details: membershipLookup.error.details ?? null,
        hint: membershipLookup.error.hint ?? null,
      });

      return {
        ok: false,
        code: "PRICE_BOOK_QUERY_FAILED",
        status: 503,
        stage: "membership_lookup_failed",
        message: "Company membership could not be verified.",
      };
    }

    companyId = readString(membershipLookup.data?.company_id);
  }

  if (!companyId) {
    devLogDashboardCompanyContext(operation, {
      stage: "company_context_missing",
    });

    return {
      ok: false,
      code: "COMPANY_CONTEXT_MISSING",
      status: 403,
      stage: "company_context_missing",
      message: "Company context is required.",
    };
  }

  const membershipResult = await membershipClient
    .from("company_members")
    .select("company_id,profile_id,member_role,member_status")
    .eq("company_id", companyId)
    .eq("profile_id", profileId)
    .eq("member_status", "active")
    .is("archived_at", null)
    .is("removed_at", null)
    .is("suspended_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipResult.error) {
    devLogDashboardCompanyContext(operation, {
      stage: "membership_verify_failed",
      message: membershipResult.error.message,
      code: membershipResult.error.code ?? null,
      details: membershipResult.error.details ?? null,
      hint: membershipResult.error.hint ?? null,
    });

    return {
      ok: false,
      code: "PRICE_BOOK_QUERY_FAILED",
      status: 503,
      stage: "membership_verify_failed",
      message: "Company membership could not be verified.",
    };
  }

  if (!membershipResult.data) {
    devLogDashboardCompanyContext(operation, {
      stage: "membership_missing",
      source,
    });

    return {
      ok: false,
      code: "COMPANY_MEMBERSHIP_MISSING",
      status: 403,
      stage: "membership_missing",
      message: "Active company membership is required.",
    };
  }

  const companyResult = await membershipClient
    .from("companies")
    .select("id,status")
    .eq("id", companyId)
    .maybeSingle();

  if (companyResult.error) {
    devLogDashboardCompanyContext(operation, {
      stage: "company_lookup_failed",
      message: companyResult.error.message,
      code: companyResult.error.code ?? null,
      details: companyResult.error.details ?? null,
      hint: companyResult.error.hint ?? null,
    });

    return {
      ok: false,
      code: "PRICE_BOOK_QUERY_FAILED",
      status: 503,
      stage: "company_lookup_failed",
      message: "Company could not be verified.",
    };
  }

  if (!companyResult.data) {
    devLogDashboardCompanyContext(operation, {
      stage: "company_not_found",
      source,
    });

    return {
      ok: false,
      code: "COMPANY_NOT_FOUND",
      status: 403,
      stage: "company_not_found",
      message: "Company record could not be found.",
    };
  }

  devLogDashboardCompanyContext(operation, {
    stage: "resolved",
    source,
    hasCompanyId: true,
    membershipRole:
      typeof membershipResult.data.member_role === "string"
        ? membershipResult.data.member_role
        : null,
  });

  return {
    ok: true,
    companyId,
    source,
    membership: {
      memberRole:
        typeof membershipResult.data.member_role === "string"
          ? membershipResult.data.member_role
          : null,
      memberStatus:
        typeof membershipResult.data.member_status === "string"
          ? membershipResult.data.member_status
          : null,
    },
  };
}
