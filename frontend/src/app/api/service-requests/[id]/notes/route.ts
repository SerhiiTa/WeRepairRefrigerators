import { NextResponse } from "next/server";

import {
  SERVICE_REQUEST_NOTE_TYPES,
  type ServiceRequestWritableNoteType,
} from "@/lib/service-request-records";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";

type ServiceRequestNotesRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

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

function isWritableNoteType(value: string): value is ServiceRequestWritableNoteType {
  return SERVICE_REQUEST_NOTE_TYPES.includes(
    value as ServiceRequestWritableNoteType,
  );
}

function formatNoteError(message: string): string {
  if (
    message.includes("schema cache") ||
    message.includes("Could not find the function") ||
    message.includes("add_service_request_note_rpc")
  ) {
    return "Internal notes are not ready yet. Apply migration 0020 in Supabase, then try again.";
  }

  if (message.includes("Invalid service request note type")) {
    return "Choose a valid internal note type.";
  }

  if (message.includes("body is required")) {
    return "Add a short note before saving.";
  }

  if (
    message.includes("not accessible") ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "This account is not allowed to add notes to that service request.";
  }

  return "We could not save this internal note yet.";
}

export async function POST(
  request: Request,
  { params }: ServiceRequestNotesRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  let payload: { noteType?: unknown; body?: unknown };

  try {
    payload = (await request.json()) as { noteType?: unknown; body?: unknown };
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const noteType =
    typeof payload.noteType === "string" ? payload.noteType.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";

  if (!isWritableNoteType(noteType)) {
    return fail("Choose a valid internal note type.");
  }

  if (!body) {
    return fail("Add a short note before saving.");
  }

  const { id } = await params;
  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return fail("Supabase is not configured for internal notes.", 503);
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return fail("A valid authenticated session is required.", 401);
  }

  const { data, error } = await supabase.rpc("add_service_request_note_rpc", {
    p_request_id: id,
    p_note_type: noteType,
    p_body: body,
  });

  if (error) {
    return fail(formatNoteError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    note: data,
  });
}
