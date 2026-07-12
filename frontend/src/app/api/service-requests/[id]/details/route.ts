import { NextResponse } from "next/server";

import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type ServiceRequestDetailsRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

type UpdateDetailsPayload = {
  jobTypeId?: unknown;
  jobName?: unknown;
  problemTypeId?: unknown;
  description?: unknown;
  marketingSourceId?: unknown;
  tagIds?: unknown;
  newJobTypeName?: unknown;
  newProblemName?: unknown;
  newMarketingSourceName?: unknown;
  newTagName?: unknown;
  newTagCategory?: unknown;
  newTagTone?: unknown;
};

type RpcError = {
  message: string;
};

type JobDetailsRpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: RpcError | null }>;
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

function cleanText(value: unknown, maxLength = 160): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().slice(0, maxLength);

  return cleaned.length > 0 ? cleaned : null;
}

function cleanUuid(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    cleaned,
  )
    ? cleaned
    : null;
}

function cleanUuidArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => cleanUuid(item))
        .filter((item): item is string => Boolean(item)),
    ),
  );
}

function formatDetailsError(message: string): string {
  if (
    message.includes("schema cache") ||
    message.includes("Could not find the function") ||
    message.includes("update_service_request_details_rpc") ||
    message.includes("get_service_request_details_options_rpc")
  ) {
    return "Job Details catalogs are not ready yet. Apply migration 0063 in Supabase, then try again.";
  }

  if (
    message.includes("not accessible") ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "This account is not allowed to update that job.";
  }

  if (
    message.includes("valid job type") ||
    message.includes("valid problem") ||
    message.includes("valid ad source") ||
    message.includes("valid tag") ||
    message.includes("required")
  ) {
    return message;
  }

  return "Job details could not be saved.";
}

async function requireSession(request: Request) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return { ok: false as const, response: fail("A logged-in dashboard session is required.", 401) };
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return { ok: false as const, response: fail("Supabase is not configured for job details.", 503) };
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return { ok: false as const, response: fail("A valid authenticated session is required.", 401) };
  }

  return { ok: true as const, supabase };
}

export async function GET(
  request: Request,
  { params }: ServiceRequestDetailsRouteProps,
) {
  const session = await requireSession(request);

  if (!session.ok) {
    return session.response;
  }

  const { id } = await params;
  const rpcClient = session.supabase as unknown as JobDetailsRpcClient;
  const { data, error } = await rpcClient.rpc(
    "get_service_request_details_options_rpc",
    {
      p_request_id: id,
    },
  );

  if (error) {
    return fail(formatDetailsError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    details: data,
  });
}

export async function PATCH(
  request: Request,
  { params }: ServiceRequestDetailsRouteProps,
) {
  const session = await requireSession(request);

  if (!session.ok) {
    return session.response;
  }

  let payload: UpdateDetailsPayload;

  try {
    payload = (await request.json()) as UpdateDetailsPayload;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const jobName = cleanText(payload.jobName);
  const description = cleanText(payload.description, 1200);

  if (!jobName && !cleanText(payload.newJobTypeName)) {
    return fail("Job name is required.");
  }

  if (!description && !cleanText(payload.newProblemName)) {
    return fail("Description is required.");
  }

  const { id } = await params;
  const rpcClient = session.supabase as unknown as JobDetailsRpcClient;
  const { data, error } = await rpcClient.rpc(
    "update_service_request_details_rpc",
    {
      p_request_id: id,
      p_job_type_id: cleanUuid(payload.jobTypeId),
      p_job_name: jobName,
      p_problem_type_id: cleanUuid(payload.problemTypeId),
      p_description: description,
      p_marketing_source_id: cleanUuid(payload.marketingSourceId),
      p_tag_ids: cleanUuidArray(payload.tagIds),
      p_new_job_type_name: cleanText(payload.newJobTypeName),
      p_new_problem_name: cleanText(payload.newProblemName),
      p_new_marketing_source_name: cleanText(payload.newMarketingSourceName),
      p_new_tag_name: cleanText(payload.newTagName),
      p_new_tag_category: cleanText(payload.newTagCategory, 40) ?? "custom",
      p_new_tag_tone: cleanText(payload.newTagTone, 20) ?? "gray",
    },
  );

  if (error) {
    return fail(formatDetailsError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    details: data,
  });
}
