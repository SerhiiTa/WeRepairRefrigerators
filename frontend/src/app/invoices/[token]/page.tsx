import { notFound } from "next/navigation";

import {
  PublicInvoicePayment,
  type PublicInvoicePayload,
} from "@/components/public/PublicInvoicePayment";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isPublicStripeCheckoutEnabledForToken } from "@/server/finance/stripe-checkout";

type PublicInvoicePageProps = {
  params: Promise<{
    token: string;
  }>;
};

const TOKEN_PATTERN = /^[0-9a-f]{64}$/i;

function parsePublicInvoicePayload(value: unknown): PublicInvoicePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const payload = value as PublicInvoicePayload;

  if (!payload.invoice?.invoice_number || !payload.company?.name) {
    return null;
  }

  return payload;
}

export default async function PublicInvoicePage({ params }: PublicInvoicePageProps) {
  const { token } = await params;

  if (!TOKEN_PATTERN.test(token)) {
    notFound();
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    notFound();
  }

  const { data, error } = await supabase.rpc(
    "get_public_invoice_by_token_rpc" as never,
    {
      p_token: token,
    } as never,
  );

  if (error) {
    notFound();
  }

  const payload = parsePublicInvoicePayload(data);

  if (!payload || payload.link_state === "not_found" || payload.link_state === "invalid") {
    notFound();
  }

  const stripePaymentsEnabled = await isPublicStripeCheckoutEnabledForToken({
    documentType: "invoice",
    token,
  });

  return (
    <PublicInvoicePayment
      data={payload}
      stripePaymentsEnabled={stripePaymentsEnabled}
      token={token}
    />
  );
}
