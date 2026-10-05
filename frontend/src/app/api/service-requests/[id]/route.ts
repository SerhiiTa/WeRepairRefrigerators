import { NextResponse } from "next/server";

import { requireHomeFixPrivateAccess } from "@/server/security/homefix-private-access";

type ServiceRequestRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function formatDeleteJobError(message: string): string {
  if (
    message.includes("delete_safe_service_request_rpc") ||
    message.includes("schema cache") ||
    message.includes("Could not find the function")
  ) {
    return "Job deletion is not ready yet. Apply the latest safe-delete migration in Supabase, then try again.";
  }

  if (
    message.includes("financial") ||
    message.includes("customer") ||
    message.includes("history")
  ) {
    return "This job can't be deleted because it already contains financial or customer history.";
  }

  if (message.includes("not found")) {
    return "Job not found.";
  }

  if (
    message.includes("not accessible") ||
    message.includes("permission denied") ||
    message.includes("row-level security")
  ) {
    return "This account is not allowed to delete that job.";
  }

  return "Job could not be deleted.";
}

export async function DELETE(request: Request, { params }: ServiceRequestRouteProps) {
  const privateAccess = await requireHomeFixPrivateAccess(request);
  if (!privateAccess.ok) {
    return privateAccess.response;
  }
  const supabase = privateAccess.context.supabase;

  const { id } = await params;

  if (!isUuid(id)) {
    return fail("Choose a valid job to delete.");
  }

  const { data, error } = await supabase.rpc("delete_safe_service_request_rpc", {
    p_service_request_id: id,
  });

  if (error) {
    return fail(formatDeleteJobError(error.message), 403);
  }

  return NextResponse.json({
    ok: true,
    request: data,
  });
}
