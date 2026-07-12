import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DatabaseServiceRequestPhotoType } from "@/lib/supabase/types";

export const SERVICE_REQUEST_PHOTO_BUCKET = "service-request-photos";
export const MAX_SERVICE_REQUEST_PHOTOS = 5;
export const MAX_SERVICE_REQUEST_PHOTO_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export type ServiceRequestPhotoValidationResult =
  | { ok: true; files: File[] }
  | { ok: false; message: string };

export type CustomerPhotoUploadResult =
  | { ok: true; uploadedCount: number }
  | { ok: false; uploadedCount: number; message: string };

export type TechnicianPhotoUploadResult =
  | { ok: true }
  | { ok: false; message: string };

type SafeIdCryptoSource = {
  randomUUID?: () => string;
  getRandomValues?: <ArrayType extends Uint8Array>(array: ArrayType) => ArrayType;
};

export function validateServiceRequestPhotoFiles(
  files: File[],
): ServiceRequestPhotoValidationResult {
  if (files.length > MAX_SERVICE_REQUEST_PHOTOS) {
    return {
      ok: false,
      message: `Upload up to ${MAX_SERVICE_REQUEST_PHOTOS} photos for this request.`,
    };
  }

  const invalidType = files.find((file) => !ALLOWED_IMAGE_TYPES.has(file.type));

  if (invalidType) {
    return {
      ok: false,
      message: `${invalidType.name} is not a supported image type.`,
    };
  }

  const oversized = files.find(
    (file) => file.size > MAX_SERVICE_REQUEST_PHOTO_BYTES,
  );

  if (oversized) {
    return {
      ok: false,
      message: `${oversized.name} is larger than 5 MB.`,
    };
  }

  return { ok: true, files };
}

export async function uploadCustomerServiceRequestPhotos({
  requestId,
  files,
}: {
  requestId: string;
  files: File[];
}): Promise<CustomerPhotoUploadResult> {
  const validation = validateServiceRequestPhotoFiles(files);

  if (!validation.ok) {
    return {
      ok: false,
      uploadedCount: 0,
      message: validation.message,
    };
  }

  if (files.length === 0) {
    return { ok: true, uploadedCount: 0 };
  }

  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return {
      ok: false,
      uploadedCount: 0,
      message: "Photo uploads are not configured in this browser.",
    };
  }

  let uploadedCount = 0;

  for (const file of files) {
    const storagePath = buildServiceRequestPhotoPath({
      requestId,
      scope: "customer",
      fileName: file.name,
    });

    const { error: uploadError } = await supabase.storage
      .from(SERVICE_REQUEST_PHOTO_BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return {
        ok: false,
        uploadedCount,
        message: formatPhotoUploadError(uploadError.message),
      };
    }

    const { error: metadataError } = await supabase
      .from("service_request_photos")
      .insert({
        service_request_id: requestId,
        storage_path: storagePath,
        original_filename: file.name,
        photo_type: "customer_upload",
        uploaded_by_profile_id: null,
      });

    if (metadataError) {
      return {
        ok: false,
        uploadedCount,
        message: formatPhotoUploadError(metadataError.message),
      };
    }

    uploadedCount += 1;
  }

  return { ok: true, uploadedCount };
}

export async function uploadTechnicianServiceRequestPhoto({
  requestId,
  file,
  photoType,
}: {
  requestId: string;
  file: File;
  photoType: Exclude<DatabaseServiceRequestPhotoType, "customer_upload">;
}): Promise<TechnicianPhotoUploadResult> {
  const validation = validateServiceRequestPhotoFiles([file]);

  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return {
      ok: false,
      message: "Photo uploads are not configured in this browser.",
    };
  }

  const storagePath = buildServiceRequestPhotoPath({
    requestId,
    scope: "technician",
    fileName: file.name,
  });

  const { error: uploadError } = await supabase.storage
    .from(SERVICE_REQUEST_PHOTO_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return { ok: false, message: formatPhotoUploadError(uploadError.message) };
  }

  const { error: metadataError } = await supabase.rpc(
    "add_service_request_photo_rpc",
    {
      p_request_id: requestId,
      p_storage_path: storagePath,
      p_original_filename: file.name,
      p_photo_type: photoType,
    },
  );

  if (metadataError) {
    return { ok: false, message: formatPhotoUploadError(metadataError.message) };
  }

  return { ok: true };
}

function buildServiceRequestPhotoPath({
  requestId,
  scope,
  fileName,
}: {
  requestId: string;
  scope: "customer" | "technician";
  fileName: string;
}) {
  const baseFileName =
    fileName.split(/[/\\]/).pop()?.split(/[?#]/)[0] || "service-photo.jpg";
  const extension = baseFileName.includes(".")
    ? baseFileName.split(".").pop()?.toLowerCase()
    : "jpg";
  const safeExtension = extension?.replace(/[^a-z0-9]/g, "").slice(0, 8) || "jpg";
  const safeName =
    baseFileName
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "service-photo";

  return `${requestId}/${scope}/${createSafePhotoStorageId()}-${safeName}.${safeExtension}`;
}

export function createSafePhotoStorageId(
  cryptoSource: SafeIdCryptoSource | null | undefined = globalThis.crypto,
): string {
  const randomUUID = cryptoSource?.randomUUID;

  if (typeof randomUUID === "function") {
    try {
      const id = randomUUID.call(cryptoSource);

      if (typeof id === "string" && id.length > 0) {
        return sanitizeStorageId(id);
      }
    } catch {
      // Fall through to byte-based or timestamp fallback.
    }
  }

  const getRandomValues = cryptoSource?.getRandomValues;

  if (typeof getRandomValues === "function") {
    try {
      const bytes = getRandomValues.call(
        cryptoSource,
        new Uint8Array(16),
      );

      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");

      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
        12,
        16,
      )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } catch {
      // Fall through to timestamp fallback.
    }
  }

  return sanitizeStorageId(
    `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 14)}-${Math.random().toString(36).slice(2, 10)}`,
  );
}

function sanitizeStorageId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `photo-${Date.now().toString(36)}`;
}

function formatPhotoUploadError(message: string): string {
  if (
    message.includes("service-request-photos") ||
    message.includes("Bucket not found") ||
    message.includes("storage")
  ) {
    return "Photo storage is not ready yet. Apply migration 0021 and create the private bucket policies in Supabase.";
  }

  if (
    message.includes("service_request_photos") ||
    message.includes("schema cache") ||
    message.includes("Could not find")
  ) {
    return "Photo metadata is not ready yet. Apply migration 0021 in Supabase.";
  }

  if (message.includes("row-level security") || message.includes("permission")) {
    return "This account cannot attach photos to that service request.";
  }

  return message || "Photo upload failed. Please try again.";
}
