import { NextResponse } from "next/server";

import {
  createIntakeRequest,
  extractBearerToken,
  formatIntakeError,
  listIntakeRequests,
  type IntakeWritePayload,
} from "@/server/intake/intake-service";

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function GET(request: Request) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  try {
    const result = await listIntakeRequests(accessToken);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return fail(
      formatIntakeError(error instanceof Error ? error.message : "Intake list failed."),
      503,
    );
  }
}

export async function POST(request: Request) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  let payload: IntakeWritePayload;

  try {
    payload = (await request.json()) as IntakeWritePayload;
  } catch {
    return fail("Request body was not valid JSON.");
  }

  try {
    const intakeRequest = await createIntakeRequest(accessToken, payload);

    return NextResponse.json({ ok: true, intakeRequest });
  } catch (error) {
    return fail(
      formatIntakeError(error instanceof Error ? error.message : "Intake create failed."),
      503,
    );
  }
}
