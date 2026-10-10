import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  PublicEstimateApproval,
  type PublicEstimatePayload,
} from "@/components/public/PublicEstimateApproval";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { isPublicStripeCheckoutEnabledForToken } from "@/server/finance/stripe-checkout";

type PublicEstimatePageProps = {
  params: Promise<{
    token: string;
  }>;
};

export const dynamic = "force-dynamic";

function isPublicToken(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

function isRecord(value: Json | undefined): value is Record<string, Json> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parsePublicEstimatePayload(data: Json): PublicEstimatePayload | null {
  if (!isRecord(data)) {
    return null;
  }

  const estimate = data.estimate;
  const serviceRequest = data.service_request;

  if (!isRecord(estimate) || !isRecord(serviceRequest)) {
    return null;
  }

  return data as unknown as PublicEstimatePayload;
}

async function loadEstimate(
  token: string,
): Promise<PublicEstimatePayload | null> {
  if (!isPublicToken(token)) {
    return null;
  }

  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc(
    "get_public_estimate_by_token_rpc",
    {
      p_token: token,
    },
  );

  if (error || !data) {
    return null;
  }

  const estimate = parsePublicEstimatePayload(data);

  if (!estimate) {
    return null;
  }

  const { data: paymentData } = await supabase.rpc(
    "get_public_estimate_payment_options_rpc" as never,
    {
      p_token: token,
    } as never,
  );

  if (paymentData && typeof paymentData === "object" && !Array.isArray(paymentData)) {
    return {
      ...estimate,
      payment: paymentData as PublicEstimatePayload["payment"],
    };
  }

  return estimate;
}

export async function generateMetadata({
  params,
}: PublicEstimatePageProps): Promise<Metadata> {
  const { token } = await params;
  const estimate = await loadEstimate(token);

  if (!estimate) {
    return {
      title: "Estimate unavailable | WeRepairRefrigerators",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return {
    title: `${estimate.estimate.estimate_number} Estimate | WeRepairRefrigerators`,
    description: `Review estimate ${estimate.estimate.estimate_number} for ${estimate.service_request.appliance_type} service.`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function PublicEstimatePage({
  params,
}: PublicEstimatePageProps) {
  const { token } = await params;
  const estimate = await loadEstimate(token);

  if (!estimate) {
    notFound();
  }

  const stripePaymentsEnabled = await isPublicStripeCheckoutEnabledForToken({
    documentType: "estimate",
    token,
  });

  return (
    <PublicEstimateApproval
      initialEstimate={estimate}
      stripePaymentsEnabled={stripePaymentsEnabled}
      token={token}
    />
  );
}
