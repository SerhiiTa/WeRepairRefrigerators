import { NextResponse } from "next/server";

import { createBrowserCallSession } from "@/server/communications/telnyx-browser-voice";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

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

export async function POST(request: Request) {
  const accessToken = extractBearerToken(request);
  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  const supabase = createUserScopedServerClient(accessToken);
  if (!supabase) {
    return fail("Browser calling is not configured for this dashboard session.", 503);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const body = (await request.json().catch(() => null)) as {
    conversationId?: unknown;
    customerId?: unknown;
    destinationPhone?: unknown;
  } | null;
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;
  const customerId = typeof body?.customerId === "string" ? body.customerId : null;
  const destinationPhone =
    typeof body?.destinationPhone === "string" ? body.destinationPhone : null;

  if (!destinationPhone || (!customerId && !conversationId)) {
    return fail("Choose a conversation or Customer with a phone number before calling.");
  }

  let companyId: string | null = null;
  let resolvedCustomerId: string | null = null;
  let customerDisplayName: string | null = null;

  if (conversationId) {
    const { data: conversation, error: conversationError } = await supabase
      .from("communication_conversations")
      .select("id,company_id,customer_id,customer_display_name")
      .eq("id", conversationId)
      .maybeSingle();

    if (conversationError || !conversation) {
      return fail("This Communications conversation is not accessible.", 403);
    }

    const { data: canAccess, error: accessError } = await supabase.rpc(
      "can_access_communication_conversation",
      { target_conversation_id: conversation.id },
    );

    if (accessError || canAccess !== true) {
      return fail("This Communications conversation is not accessible for calling.", 403);
    }

    companyId = conversation.company_id;
    resolvedCustomerId = conversation.customer_id;
    customerDisplayName = conversation.customer_display_name;
  }

  if (customerId) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id,company_id,full_name,phone")
      .eq("id", customerId)
      .maybeSingle();

    if (customerError || !customer) {
      return fail("This Customer is not accessible.", 403);
    }

    if (!customer.company_id) {
      return fail("This Customer is missing company ownership.", 403);
    }

    const { data: canManageCustomer, error: manageError } = await supabase.rpc(
      "can_manage_customer_crm",
      { target_customer_id: customer.id },
    );

    if (manageError || canManageCustomer !== true) {
      return fail("This Customer is not accessible for calling.", 403);
    }

    if (companyId && customer.company_id !== companyId) {
      return fail("The selected Customer does not belong to this Conversation.", 403);
    }

    companyId = customer.company_id;
    resolvedCustomerId = customer.id;
    customerDisplayName = customer.full_name;
  }

  if (!companyId) {
    return fail("This call is missing company ownership.", 403);
  }

  const result = await createBrowserCallSession({
    companyId,
    conversationId,
    customerId: resolvedCustomerId,
    customerDisplayName,
    destinationPhone,
  });

  if (!result.ok) {
    return fail(result.message, result.status);
  }

  return NextResponse.json({
    ok: true,
    callId: result.callId,
    conversationId: result.conversationId,
    telnyxToken: result.telnyxToken,
    callerNumber: result.callerNumber,
    destinationNumber: result.destinationNumber,
    customerDisplayName: result.customerDisplayName,
    sourceAccountId: result.sourceAccountId,
  });
}
