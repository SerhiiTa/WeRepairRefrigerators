import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  PublicEstimateApproval,
  type PublicEstimatePayload,
} from "@/components/public/PublicEstimateApproval";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

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

  return parsePublicEstimatePayload(data);
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

  return <PublicEstimateApproval initialEstimate={estimate} token={token} />;
}
