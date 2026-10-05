import { NextResponse } from "next/server";

import {
  formatIntakeError,
  getIntakeRequest,
  updateIntakeRequest,
  type IntakeWritePayload,
} from "@/server/intake/intake-service";
import { requireHomeFixPrivateAccess } from "@/server/security/homefix-private-access";

type IntakeRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function GET(request: Request, { params }: IntakeRouteProps) {
  const privateAccess = await requireHomeFixPrivateAccess(request);
  if (!privateAccess.ok) {
    return privateAccess.response;
  }
  const accessToken = privateAccess.context.accessToken;

  const { id } = await params;

  try {
    const intakeRequest = await getIntakeRequest(accessToken, id);

    if (!intakeRequest) {
      return fail("Intake request not found.", 404);
    }

    return NextResponse.json({ ok: true, intakeRequest });
  } catch (error) {
    return fail(
      formatIntakeError(error instanceof Error ? error.message : "Intake load failed."),
      503,
    );
  }
}

export async function PATCH(request: Request, { params }: IntakeRouteProps) {
  const privateAccess = await requireHomeFixPrivateAccess(request);
  if (!privateAccess.ok) {
    return privateAccess.response;
  }
  const accessToken = privateAccess.context.accessToken;

  let payload: IntakeWritePayload;

  try {
    payload = (await request.json()) as IntakeWritePayload;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  const { id } = await params;

  try {
    const intakeRequest = await updateIntakeRequest(accessToken, id, payload);

    return NextResponse.json({ ok: true, intakeRequest });
  } catch (error) {
    return fail(
      formatIntakeError(error instanceof Error ? error.message : "Intake update failed."),
      503,
    );
  }
}

export async function DELETE() {
  return fail(
    "Hard delete is intentionally blocked for intake history. Archive the intake instead; linked jobs, appointments, estimates, and invoices are never deleted from intake cleanup.",
    409,
  );
}
