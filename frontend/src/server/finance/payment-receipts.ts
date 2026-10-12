/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type ReceiptRpcResult = {
  delivery_id?: string;
  receipt_id?: string;
  receipt_number?: string;
  receipt_token?: string;
};

export async function ensurePaymentReceipt(paymentId: string) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    throw new Error("Payment receipt creation is not configured.");
  }

  const { data, error } = await (serviceRole as any).rpc(
    "ensure_service_request_payment_receipt_rpc",
    {
      p_payment_id: paymentId,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? {}) as ReceiptRpcResult;
}
