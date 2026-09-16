import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type AssetIntelligenceResult =
  | { ok: true; status: string; action: string | null; customerApplianceId: string | null }
  | { ok: false; message: string };

function readStringField(source: unknown, field: string): string | null {
  if (!source || typeof source !== "object" || !(field in source)) {
    return null;
  }

  const value = (source as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

export async function processServiceRequestPhotoForAssetIntelligence({
  photoId,
  requestId,
  retry = false,
}: {
  photoId: string;
  requestId: string;
  retry?: boolean;
}): Promise<AssetIntelligenceResult> {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return { ok: false, message: "Asset Intelligence is not available in this browser." };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    return { ok: false, message: "A logged-in dashboard session is required." };
  }

  const response = await fetch(
    `/api/service-requests/${encodeURIComponent(requestId)}/asset-intelligence`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ photoId, retry }),
    },
  );
  const data = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    return {
      ok: false,
      message:
        readStringField(data, "message") ??
        "Asset identification failed. The attachment is still saved.",
    };
  }

  return {
    ok: true,
    status: readStringField(data, "status") ?? "no_asset",
    action: readStringField(data, "action"),
    customerApplianceId: readStringField(data, "customer_appliance_id"),
  };
}

export async function setServiceRequestPhotoAsAssetCover({
  photoId,
}: {
  photoId: string;
}): Promise<AssetIntelligenceResult> {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return { ok: false, message: "Asset cover photos are not available in this browser." };
  }

  const { data, error } = await supabase.rpc(
    "set_customer_appliance_cover_photo_from_job_rpc",
    {
      p_photo_id: photoId,
    },
  );

  if (error) {
    return { ok: false, message: error.message };
  }

  return {
    ok: true,
    status: readStringField(data, "status") ?? "updated",
    action: "cover_updated",
    customerApplianceId: readStringField(data, "customer_appliance_id"),
  };
}
