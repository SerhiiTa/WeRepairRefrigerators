import { buildConversationJobPrefill } from "@/lib/communications/conversation-job-prefill";
import { NextResponse } from "next/server";

import {
  formatIntakeError,
} from "@/server/intake/intake-service";
import { validateConversationJobPayload } from "@/server/communications/conversation-job-contract";
import { requireHomeFixPrivateAccess } from "@/server/security/homefix-private-access";

type ConversationCreateJobRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, message, ...(extra ?? {}) }, { status });
}

function formatConversationJobError(message: string) {
  const formatted = formatIntakeError(message);

  if (
    formatted.includes("Intake Inbox") ||
    formatted.includes("intake_requests") ||
    formatted.includes("schema cache") ||
    formatted.includes("Could not find")
  ) {
    return "Communications job creation is waiting for the database update.";
  }

  return formatted
    .replaceAll("Intake request", "Request")
    .replaceAll("intake request", "request")
    .replaceAll("Intake", "Request")
    .replaceAll("intake", "request");
}

function getMissingJobFields(message: string) {
  const fields: string[] = [];
  const lower = message.toLowerCase();

  if (lower.includes("customer name")) {
    fields.push("customer_name");
  }
  if (lower.includes("customer phone") || lower.includes("phone number")) {
    fields.push("customer_phone");
  }
  if (lower.includes("service address")) {
    fields.push("service_address");
  }
  if (lower.includes("zip")) {
    fields.push("zip_code");
  }
  if (lower.includes("appliance type")) {
    fields.push("appliance_type");
  }
  if (lower.includes("problem description")) {
    fields.push("problem_description");
  }

  return fields;
}

export async function POST(
  request: Request,
  { params }: ConversationCreateJobRouteProps,
) {
  const privateAccess = await requireHomeFixPrivateAccess(request);
  if (!privateAccess.ok) {
    return privateAccess.response;
  }

  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return fail("Invalid Conversation ID.");
  const supabase = privateAccess.context.supabase;

  let fields: Record<string, string | null>;
  let allowPossibleDuplicate: boolean;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request body.");
    fields = validateConversationJobPayload(body.wizard ?? {});
    if (body.allowPossibleDuplicate !== undefined && typeof body.allowPossibleDuplicate !== "boolean") throw new Error("Invalid duplicate confirmation.");
    allowPossibleDuplicate = body.allowPossibleDuplicate === true;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Invalid Wizard fields.", 400);
  }
  try {
    const { data, error } = await supabase.rpc("save_conversation_job_rpc", {
      p_conversation_id: id,
      p_fields: fields,
      p_allow_possible_duplicate: allowPossibleDuplicate,
    });
    if (error) {
      const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code?.startsWith("22") ? 400 : 503;
      const message = formatConversationJobError(error.message);
      const missingFields = getMissingJobFields(message);
      return fail(message, status, missingFields.length ? { missingFields } : undefined);
    }
    const result = data as Record<string, unknown>;
    const conversion = {
      intakeRequestId: result.intake_request_id,
      serviceRequestId: result.service_request_id,
      appointmentId: result.appointment_id ?? null,
      alreadyConverted: result.already_converted === true,
      duplicateCandidate: result.duplicate_candidate ?? {},
    };
    return NextResponse.json({ ok: true, conversion });
  } catch (error) {
    const message = formatConversationJobError(
      error instanceof Error ? error.message : "Conversation job creation failed.",
    );
    const missingFields = getMissingJobFields(message);

    return fail(
      message,
      503,
      missingFields.length > 0 ? { missingFields } : undefined,
    );
  }
}

// Read-only prefill: browser supplies only the canonical Conversation reference.
export async function GET(request: Request, { params }: ConversationCreateJobRouteProps) {
  const access = await requireHomeFixPrivateAccess(request);
  if (!access.ok) return access.response;
  const {id} = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return fail("Invalid Conversation ID.");
  const db = access.context.supabase;
  const permission = await db.rpc("can_access_communication_conversation", {target_conversation_id:id});
  if (permission.error || permission.data !== true) return fail("Conversation is not accessible.",403);
  try {
    const {data:c,error} = await db.from("communication_conversations").select("*").eq("id",id).single();
    if (error || !c?.company_id) return fail("Conversation is unavailable.",404);
    const [requestResult, leadResult] = await Promise.all([
      c.intake_request_id ? db.from("intake_requests").select("*").eq("id",c.intake_request_id).eq("company_id",c.company_id).single() : Promise.resolve({data:null,error:null}),
      db.from("communication_leads").select("*").eq("conversation_id",id).eq("company_id",c.company_id).maybeSingle(),
    ]);
    if (requestResult.error || leadResult.error) return fail("Conversation source data is unavailable.",409);
    const source = requestResult.data;
    const lead = leadResult.data;
    const customerIds = [c.customer_id,source?.linked_customer_id,lead?.customer_id].filter(Boolean);
    if (new Set(customerIds).size > 1) return fail("Customer association needs review.",409);
    const customerId = customerIds[0] ?? null;
    const customer = customerId ? await db.from("customers").select("*").eq("id",customerId).eq("company_id",c.company_id).single() : {data:null,error:null};
    if (customer.error) return fail("Linked Customer is not accessible.",403);
    const jobIds = [c.service_request_id,source?.linked_service_request_id,lead?.service_request_id].filter(Boolean);
    if (new Set(jobIds).size > 1) return fail("Job association needs review.",409);
    const jobId = jobIds[0] ?? null;
    if (jobId) {
      const job = await db.from("service_requests").select("id").eq("id",jobId).eq("company_id",c.company_id).single();
      if (job.error || !job.data) return fail("Linked Job is not accessible.",403);
    }
    return NextResponse.json({ok:true,context:{conversationId:c.id,customerId,leadId:lead?.id ?? null,sourceRequestId:source?.id ?? null,jobId},fields:buildConversationJobPrefill(c,source ?? {},lead ?? {},customer.data ?? {})});
  } catch {
    return fail("Conversation prefill is unavailable. Please retry.",503);
  }
}
