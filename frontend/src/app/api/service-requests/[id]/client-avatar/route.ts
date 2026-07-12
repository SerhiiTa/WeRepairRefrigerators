import { NextResponse } from "next/server";
import { Buffer } from "node:buffer";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { Database } from "@/lib/supabase/types";
import { extractBearerToken } from "@/server/intake/intake-service";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

export const dynamic = "force-dynamic";

type ClientAvatarRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

type AvatarOwner =
  | { type: "customer"; id: string; previousPath: string | null }
  | { type: "service_request"; id: string; previousPath: string | null };

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_BUCKET = "client-avatars";
const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function logAvatarError(
  operation: string,
  error: unknown,
  extra?: Record<string, unknown>,
) {
  const safeError =
    error && typeof error === "object"
      ? {
          message: "message" in error ? String(error.message) : undefined,
          code: "code" in error ? String(error.code) : undefined,
          statusCode:
            "statusCode" in error ? String(error.statusCode) : undefined,
          details: "details" in error ? String(error.details) : undefined,
          hint: "hint" in error ? String(error.hint) : undefined,
        }
      : { message: String(error) };

  console.error("[client-avatar]", {
    operation,
    bucket: AVATAR_BUCKET,
    ...extra,
    error: safeError,
  });
}

function fail(message: string, status = 400, detail?: string) {
  const error =
    process.env.NODE_ENV === "development" && detail ? detail : message;

  return NextResponse.json({ ok: false, error, message }, { status });
}

function safeExtension(file: File) {
  const fromName = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase()
    : "";
  const fromType = file.type.split("/").pop()?.toLowerCase();

  return (fromName || fromType || "jpg").replace(/[^a-z0-9]/g, "").slice(0, 8) || "jpg";
}

async function requireAvatarOwner(
  request: Request,
  id: string,
): Promise<
  | {
      ok: true;
      accessToken: string;
      owner: AvatarOwner;
    }
  | { ok: false; response: NextResponse }
> {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return { ok: false, response: fail("A logged-in dashboard session is required.", 401) };
  }

  const userScopedSupabase = createUserScopedServerClient(accessToken);

  if (!userScopedSupabase) {
    return { ok: false, response: fail("Supabase is not configured for client avatars.", 503) };
  }

  const { data: userData, error: userError } =
    await userScopedSupabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return { ok: false, response: fail("A valid authenticated session is required.", 401) };
  }

  const { data: requestRow, error: requestError } = await userScopedSupabase
    .from("service_requests")
    .select("id,customer_id")
    .eq("id", id)
    .maybeSingle();

  if (requestError) {
    return {
      ok: false,
      response: fail("Client avatar storage is not ready. Apply migration 0058 if needed.", 503),
    };
  }

  if (!requestRow) {
    return { ok: false, response: fail("Service request not found.", 404) };
  }

  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return { ok: false, response: fail("Server avatar storage is not configured.", 503) };
  }

  const customerId = requestRow.customer_id ?? null;

  if (customerId) {
    const { data: customer, error: customerError } = await serviceRole
      .from("customers")
      .select("id,avatar_storage_path")
      .eq("id", customerId)
      .maybeSingle();

    if (customerError) {
      logAvatarError("select_customer_avatar_owner", customerError, {
        serviceRequestId: id,
        customerId,
      });
      return {
        ok: false,
        response: fail(
          "Client avatar storage is not ready. Apply migration 0058 if needed.",
          503,
          customerError.message,
        ),
      };
    }

    if (!customer) {
      return { ok: false, response: fail("Linked client could not be loaded.", 404) };
    }

    return {
      ok: true,
      accessToken,
      owner: {
        type: "customer",
        id: customerId,
        previousPath:
          "avatar_storage_path" in customer
            ? ((customer as Database["public"]["Tables"]["customers"]["Row"]).avatar_storage_path ?? null)
            : null,
      },
    };
  }

  return {
    ok: true,
    accessToken,
    owner: {
      type: "service_request",
      id,
      previousPath: await loadJobAvatarPath(id),
    },
  };
}

async function loadJobAvatarPath(id: string) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return null;
  }

  const { data } = await serviceRole
    .from("service_requests")
    .select("job_client_avatar_storage_path")
    .eq("id", id)
    .maybeSingle();

  return data && "job_client_avatar_storage_path" in data
    ? ((data as { job_client_avatar_storage_path?: string | null })
        .job_client_avatar_storage_path ?? null)
    : null;
}

async function createSignedAvatarUrl(path: string | null) {
  if (!path) {
    return null;
  }

  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return null;
  }

  const { data, error } = await serviceRole.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (error) {
    logAvatarError("create_signed_url", error, { storagePath: path });
    return null;
  }

  return data.signedUrl;
}

async function updateAvatarPath(owner: AvatarOwner, path: string | null) {
  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return { ok: false as const, message: "Server avatar storage is not configured." };
  }

  if (owner.type === "customer") {
    const { data, error } = await serviceRole
      .from("customers")
      .update({
        avatar_storage_path: path,
        avatar_updated_at: path ? new Date().toISOString() : null,
      })
      .eq("id", owner.id)
      .select("id")
      .maybeSingle();

    if (error) {
      logAvatarError("update_customer_avatar_path", error, {
        customerId: owner.id,
        hasPath: Boolean(path),
      });

      return { ok: false as const, message: error.message };
    }

    if (!data?.id) {
      return {
        ok: false as const,
        message: "Linked client avatar row was not updated.",
      };
    }

    return { ok: true as const };
  }

  const { data, error } = await serviceRole
    .from("service_requests")
    .update({
      job_client_avatar_storage_path: path,
      job_client_avatar_updated_at: path ? new Date().toISOString() : null,
    })
    .eq("id", owner.id)
    .select("id")
    .maybeSingle();

  if (error) {
    logAvatarError("update_job_avatar_path", error, {
      serviceRequestId: owner.id,
      hasPath: Boolean(path),
    });

    return { ok: false as const, message: error.message };
  }

  if (!data?.id) {
    return {
      ok: false as const,
      message: "Job client avatar row was not updated.",
    };
  }

  return { ok: true as const };
}

export async function POST(
  request: Request,
  { params }: ClientAvatarRouteProps,
) {
  const { id } = await params;
  const ownerResult = await requireAvatarOwner(request, id);

  if (!ownerResult.ok) {
    return ownerResult.response;
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return fail("Avatar upload was not valid form data.");
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return fail("Choose an image before uploading.");
  }

  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return fail("Choose a JPG, PNG, WebP, HEIC, or HEIF image.");
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return fail("Choose an image smaller than 5 MB.");
  }

  const serviceRole = getSupabaseServiceRoleClient();

  if (!serviceRole) {
    return fail("Server avatar storage is not configured.", 503);
  }

  const storagePath =
    ownerResult.owner.type === "customer"
      ? `customers/${ownerResult.owner.id}/${crypto.randomUUID()}.${safeExtension(file)}`
      : `service-requests/${ownerResult.owner.id}/client/${crypto.randomUUID()}.${safeExtension(file)}`;
  const uploadResult = await serviceRole.storage
    .from(AVATAR_BUCKET)
    .upload(storagePath, Buffer.from(await file.arrayBuffer()), {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadResult.error) {
    logAvatarError("upload_avatar_bytes", uploadResult.error, {
      ownerType: ownerResult.owner.type,
      ownerId: ownerResult.owner.id,
      contentType: file.type,
      fileSize: file.size,
    });

    return fail(
      "Client avatar storage is not ready. Apply migration 0058 if needed.",
      503,
      uploadResult.error.message,
    );
  }

  const updateResult = await updateAvatarPath(ownerResult.owner, storagePath);

  if (!updateResult.ok) {
    await serviceRole.storage.from(AVATAR_BUCKET).remove([storagePath]);
    return fail("Client avatar could not be saved yet.", 503, updateResult.message);
  }

  if (ownerResult.owner.previousPath) {
    await serviceRole.storage.from(AVATAR_BUCKET).remove([ownerResult.owner.previousPath]);
  }
  const avatarUrl = await createSignedAvatarUrl(storagePath);
  const ownerType =
    ownerResult.owner.type === "service_request" ? "job" : "customer";

  return NextResponse.json({
    ok: true,
    avatarUrl,
    storagePath,
    ownerType,
    avatar: {
      storagePath,
      signedUrl: avatarUrl,
      owner: ownerResult.owner.type,
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: ClientAvatarRouteProps,
) {
  const { id } = await params;
  const ownerResult = await requireAvatarOwner(request, id);

  if (!ownerResult.ok) {
    return ownerResult.response;
  }

  const updateResult = await updateAvatarPath(ownerResult.owner, null);

  if (!updateResult.ok) {
    return fail("Client avatar could not be removed yet.", 503, updateResult.message);
  }

  if (ownerResult.owner.previousPath) {
    const serviceRole = getSupabaseServiceRoleClient();
    await serviceRole?.storage
      .from(AVATAR_BUCKET)
      .remove([ownerResult.owner.previousPath]);
  }

  return NextResponse.json({
    ok: true,
    avatarUrl: null,
    storagePath: null,
    ownerType:
      ownerResult.owner.type === "service_request" ? "job" : "customer",
    avatar: {
      storagePath: null,
      signedUrl: null,
      owner: ownerResult.owner.type,
    },
  });
}
