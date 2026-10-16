/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { ensurePaymentReceipt } from "@/server/finance/payment-receipts";
import { sendConversationSms } from "@/server/communications/telnyx-sms-transport";
import { requireHomeFixPrivateAccess } from "@/server/security/homefix-private-access";

import { emailConfiguration } from "@/server/communications/telnyx-email-transport";
import { deliverPaymentReceiptEmail, receiptEmailRecipient } from "@/server/finance/receipt-email-delivery";

type ReceiptSendRouteProps = {
  params: Promise<{
    id: string;
    paymentId: string;
  }>;
};

type ReceiptRow = {
  id: string;
  amount: number | string;
  company_id: string;
  payment_id: string;
  receipt_number: string;
  service_request_id: string;
};

type PaymentRow = {
  amount: number | string;
  company_id: string | null;
  payment_status: string;
  service_request_id: string;
  voided_at: string | null;
};

type ConversationRow = {
  id: string;
  customer_phone: string | null;
};

const CHANNELS = new Set(["sms", "email"]);

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getReceiptPublicOrigin() {
  const configured = process.env.HOMEFIXOS_PUBLIC_ORIGIN?.trim();

  if (!configured) {
    return null;
  }

  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

function formatReceiptAmount(value: number | string) {
  const amount = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(amount)) {
    return null;
  }

  return amount.toFixed(2);
}

function buildReceiptSmsBody({
  amount,
  jobNumber,
  receiptUrl,
}: {
  amount: number | string;
  jobNumber: string | number | null;
  receiptUrl: string;
}) {
  const displayAmount = formatReceiptAmount(amount);

  if (!displayAmount || !jobNumber) {
    return null;
  }

  return [
    `HomeFix Appliance Repair: We received your payment of $${displayAmount} for Job #${jobNumber}. Thank you!`,
    "",
    "View receipt:",
    receiptUrl,
  ].join("\n");
}

async function findLatestConversation(serviceRequestId: string) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return null;
  }

  const { data } = await (serviceRole as any)
    .from("communication_conversations")
    .select("id,customer_phone")
    .eq("service_request_id", serviceRequestId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data ?? null) as ConversationRow | null;
}

async function getReceiptForPayment(paymentId: string) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return null;
  }

  const { data } = await (serviceRole as any)
    .from("service_request_payment_receipts")
    .select("id,amount,company_id,payment_id,receipt_number,service_request_id")
    .eq("payment_id", paymentId)
    .maybeSingle();

  return (data ?? null) as ReceiptRow | null;
}

async function getPaymentForValidation(paymentId: string) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return null;
  }

  const { data } = await (serviceRole as any)
    .from("service_request_payments")
    .select("amount,company_id,payment_status,service_request_id,voided_at")
    .eq("id", paymentId)
    .maybeSingle();

  return (data ?? null) as PaymentRow | null;
}

async function getJobNumber(serviceRequestId: string) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return null;
  }

  const { data } = await (serviceRole as any)
    .from("service_requests")
    .select("job_number")
    .eq("id", serviceRequestId)
    .maybeSingle();

  return data?.job_number ?? null;
}

async function createDeliveryAttempt({
  channel,
  idempotencyKey,
  initiatedByProfileId,
  paymentId,
  receipt,
  recipient,
}: {
  channel: string;
  idempotencyKey: string;
  initiatedByProfileId: string;
  paymentId: string;
  receipt: ReceiptRow;
  recipient: string;
}) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    throw new Error("Receipt delivery is not configured.");
  }

  const { data, error } = await (serviceRole as any)
    .from("service_request_payment_receipt_deliveries")
    .insert({
      company_id: receipt.company_id,
      delivery_channel: channel,
      delivery_metadata: {
        manual_action: true,
        receipt_number: receipt.receipt_number,
      },
      delivery_status: "pending",
      idempotency_key: idempotencyKey,
      initiated_by_profile_id: initiatedByProfileId,
      payment_id: paymentId,
      receipt_id: receipt.id,
      recipient,
      service_request_id: receipt.service_request_id,
    })
    .select("id,delivery_status")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await (serviceRole as any)
        .from("service_request_payment_receipt_deliveries")
        .select("id,delivery_status")
        .eq("company_id", receipt.company_id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existing) {
        return {
          deliveryId: String(existing.id),
          deliveryStatus: String(existing.delivery_status),
          idempotent: true,
        };
      }
    }

    throw new Error(error.message);
  }

  return {
    deliveryId: String(data.id),
    deliveryStatus: String(data.delivery_status),
    idempotent: false,
  };
}

async function assertCanAccessPaymentReceipt({
  request,
  serviceRequestId,
  paymentId,
}: {
  request: Request;
  serviceRequestId: string;
  paymentId: string;
}) {
  const privateAccess = await requireHomeFixPrivateAccess(request);
  if (!privateAccess.ok) {
    return privateAccess;
  }

  if (!isUuid(serviceRequestId) || !isUuid(paymentId)) {
    return { ok: false as const, response: fail("Choose a valid payment receipt.") };
  }

  const { data: canView, error: canViewError } =
    await privateAccess.context.supabase.rpc(
      "can_view_service_request" as never,
      { target_service_request_id: serviceRequestId } as never,
    );

  if (canViewError || canView !== true) {
    return {
      ok: false as const,
      response: fail("This account is not allowed to access receipts for that job.", 403),
    };
  }

  const payment = await getPaymentForValidation(paymentId);

  if (
    !payment ||
    payment.service_request_id !== serviceRequestId ||
    payment.payment_status !== "succeeded" ||
    payment.voided_at
  ) {
    return {
      ok: false as const,
      response: fail("Receipt requires a valid succeeded payment.", 403),
    };
  }

  return { ok: true as const, context: privateAccess.context, payment };
}

async function buildReceiptResponse(paymentId: string, serviceRequestId: string) {
  const ensuredReceipt = await ensurePaymentReceipt(paymentId);
  const receipt = await getReceiptForPayment(paymentId);
  const origin = getReceiptPublicOrigin();

  if (!receipt || !ensuredReceipt.receipt_token || !origin) {
    return null;
  }

  const serviceRole = getSupabaseServiceRoleClient();
  const { data: deliveries } = serviceRole
    ? await (serviceRole as any)
        .from("service_request_payment_receipt_deliveries")
        .select("id,delivery_channel,delivery_status,recipient,provider_status,provider_error,sent_at,failed_at,created_at")
        .eq("receipt_id", receipt.id)
        .eq("service_request_id", serviceRequestId)
        .order("created_at", { ascending: false })
    : { data: [] };

  return {
    receipt,
    receiptUrl: `${origin}/receipts/${ensuredReceipt.receipt_token}`,
    deliveries: deliveries ?? [],
  };
}

export async function GET(
  request: Request,
  { params }: ReceiptSendRouteProps,
) {
  const { id: serviceRequestId, paymentId } = await params;
  const access = await assertCanAccessPaymentReceipt({
    paymentId,
    request,
    serviceRequestId,
  });

  if (!access.ok) {
    return access.response;
  }

  const receipt = await buildReceiptResponse(paymentId, serviceRequestId);

  if (!receipt) {
    return fail("Receipt is not ready.", 503);
  }
  const conversation = await findLatestConversation(serviceRequestId);

  return NextResponse.json({
    ok: true,
    deliveryOptions: {
      email: {
        available: Boolean(emailConfiguration()),
        recipient: await receiptEmailRecipient(serviceRequestId),
        reason: emailConfiguration() ? null : "Receipt email delivery is not configured.",
      },
      sms: {
        available: Boolean(conversation?.customer_phone),
        recipient: conversation?.customer_phone ?? null,
      },
    },
    receipt: {
      amount: receipt.receipt.amount,
      receiptNumber: receipt.receipt.receipt_number,
      receiptUrl: receipt.receiptUrl,
    },
    deliveries: receipt.deliveries,
  });
}

async function finalizeDelivery({
  deliveryId,
  message,
  messageId,
  providerMessageId,
  success,
}: {
  deliveryId: string;
  message?: string;
  messageId?: string | null;
  providerMessageId?: string | null;
  success: boolean;
}) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return null;
  }

  const { data } = await (serviceRole as any).rpc(
    "finalize_service_request_payment_receipt_delivery_rpc",
    {
      p_communication_message_id: messageId ?? null,
      p_delivery_id: deliveryId,
      p_provider_error: success ? null : message ?? "Receipt delivery failed.",
      p_provider_message_id: providerMessageId ?? null,
      p_provider_status: success ? "accepted" : "failed",
      p_success: success,
    },
  );

  return data;
}

export async function POST(
  request: Request,
  { params }: ReceiptSendRouteProps,
) {
  const { id: serviceRequestId, paymentId } = await params;
  const access = await assertCanAccessPaymentReceipt({
    paymentId,
    request,
    serviceRequestId,
  });

  if (!access.ok) {
    return access.response;
  }

  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const channel = getString(payload.channel);
  const recipient = getString(payload.recipient);
  const idempotencyKey = getString(payload.idempotencyKey);

  if (!channel || !CHANNELS.has(channel)) {
    return fail("Choose SMS or Email receipt delivery.");
  }

  if (!recipient) {
    return fail("Receipt recipient is required.");
  }

  if (!idempotencyKey || idempotencyKey.length < 12 || idempotencyKey.length > 160) {
    return fail("A valid receipt delivery idempotency key is required.");
  }

  if (channel === "email") {
    const origin = getReceiptPublicOrigin();
    if (!origin || !access.payment.company_id) return fail("Receipt email delivery is not configured.", 503);
    const result = await deliverPaymentReceiptEmail({jobId:serviceRequestId,paymentId,companyId:access.payment.company_id,actorId:access.context.userId,recipient,idempotencyKey,origin});
    return NextResponse.json(result.body,{status:result.status});
  }

  const receiptData = await buildReceiptResponse(paymentId, serviceRequestId);

  if (!receiptData) {
    return fail("Receipt is not ready for delivery.", 503);
  }

  const { receipt, receiptUrl } = receiptData;
  const conversation =
    channel === "sms" ? await findLatestConversation(serviceRequestId) : null;

  if (channel === "sms" && !conversation) {
    return fail("Job conversation is not available for receipt SMS.", 404);
  }

  if (channel === "sms" && recipient !== conversation?.customer_phone) {
    return fail("Receipt SMS must use the authorized Job conversation recipient.", 403);
  }

  const delivery = await createDeliveryAttempt({
    channel,
    idempotencyKey,
    initiatedByProfileId: access.context.userId,
    paymentId,
    receipt,
    recipient,
  });

  if (delivery.idempotent && delivery.deliveryStatus !== "pending") {
    return NextResponse.json({
      ok: true,
      deliveryId: delivery.deliveryId,
      deliveryStatus: delivery.deliveryStatus,
      idempotent: true,
    });
  }

  const body = buildReceiptSmsBody({
    amount: receipt.amount,
    jobNumber: await getJobNumber(serviceRequestId),
    receiptUrl,
  });

  if (!body) {
    const finalized = await finalizeDelivery({
      deliveryId: delivery.deliveryId,
      message: "Receipt SMS could not be prepared.",
      success: false,
    });

    return NextResponse.json(
      {
        ok: false,
        deliveryId: delivery.deliveryId,
        deliveryStatus: "failed",
        result: finalized,
        message: "Receipt SMS could not be prepared.",
      },
      { status: 503 },
    );
  }

  if (!conversation) {
    return fail("Job conversation is not available for receipt SMS.", 404);
  }

  const result = await sendConversationSms({
    body,
    conversationId: conversation.id,
  });

  const finalized = await finalizeDelivery({
    deliveryId: delivery.deliveryId,
    message: result.ok ? undefined : result.message,
    messageId: result.messageId,
    providerMessageId: result.ok ? result.providerMessageId : null,
    success: result.ok,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        deliveryId: delivery.deliveryId,
        deliveryStatus: "failed",
        result: finalized,
        message: result.message,
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    deliveryId: delivery.deliveryId,
    deliveryStatus: "sent",
    receiptUrl,
    result: finalized,
  });
}
