import { NextResponse } from "next/server";

import { createSafePhotoStorageId } from "@/lib/service-request-photos";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { requireHomeFixPrivateAccess } from "@/server/security/homefix-private-access";

const ATTACHMENT_BUCKET = "service-request-attachments";
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
  "text/csv",
]);

type AttachmentRouteProps = {
  params: Promise<{ id: string }>;
};

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function getSafeFileName(file: File): string {
  const baseFileName =
    file.name.split(/[/\\]/).pop()?.split(/[?#]/)[0] || "attachment";
  const extension = baseFileName.includes(".")
    ? baseFileName.split(".").pop()?.toLowerCase()
    : "bin";
  const safeExtension = extension?.replace(/[^a-z0-9]/g, "").slice(0, 10) || "bin";
  const safeName =
    baseFileName
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "attachment";

  return `${createSafePhotoStorageId()}-${safeName}.${safeExtension}`;
}

function getAttachmentCategory(file: File) {
  if (file.type === "application/pdf") {
    return "pdf";
  }

  if (file.type.startsWith("image/")) {
    return "other";
  }

  return "other";
}

export async function POST(request: Request, { params }: AttachmentRouteProps) {
  const privateAccess = await requireHomeFixPrivateAccess(request);
  if (!privateAccess.ok) {
    return privateAccess.response;
  }

  const { id: requestId } = await params;
  if (!isUuid(requestId)) {
    return fail("Choose a valid job before uploading files.");
  }

  const { data: accessibleRequest, error: accessError } = await privateAccess.context.supabase
    .from("service_requests")
    .select("id")
    .eq("id", requestId)
    .maybeSingle();

  if (accessError || !accessibleRequest) {
    return fail("This account cannot attach files to that job.", 403);
  }

  const serviceRole = getSupabaseServiceRoleClient();
  if (!serviceRole) {
    return fail("Attachment storage is not configured.", 503);
  }

  const { data: serviceRequest, error: requestError } = await serviceRole
    .from("service_requests")
    .select("id,company_id")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !serviceRequest) {
    return fail("Job could not be found.", 404);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("Upload a valid file.");
  }

  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return fail("Choose at least one file to upload.");
  }

  if (files.length > 8) {
    return fail("Upload up to 8 files at a time.");
  }

  const uploadedIds: string[] = [];

  for (const file of files) {
    if (file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) {
      return fail(`${file.name} must be smaller than 20 MB.`);
    }

    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      return fail(`${file.name} is not an allowed attachment type.`);
    }

    const storagePath = `${requestId}/dashboard/${getSafeFileName(file)}`;
    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await serviceRole.storage
      .from(ATTACHMENT_BUCKET)
      .upload(storagePath, Buffer.from(bytes), {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return fail("Attachment file could not be stored.", 503);
    }

    const { data: attachment, error: metadataError } = await serviceRole
      .from("service_request_attachments")
      .insert({
        company_id: serviceRequest.company_id,
        service_request_id: requestId,
        uploaded_by_profile_id: privateAccess.context.userId,
        storage_bucket: ATTACHMENT_BUCKET,
        storage_path: storagePath,
        original_filename: file.name.slice(0, 240),
        mime_type: file.type || null,
        file_size_bytes: file.size,
        attachment_category: getAttachmentCategory(file),
        source_system: "native",
        attachment_metadata: { upload_source: "customer_desktop" },
      })
      .select("id")
      .single();

    if (metadataError || !attachment) {
      await serviceRole.storage.from(ATTACHMENT_BUCKET).remove([storagePath]);
      return fail("Attachment metadata could not be saved.", 503);
    }

    uploadedIds.push(attachment.id);
  }

  return NextResponse.json({
    ok: true,
    uploadedCount: uploadedIds.length,
    attachmentIds: uploadedIds,
  });
}
