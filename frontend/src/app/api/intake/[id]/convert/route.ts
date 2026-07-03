import { NextResponse } from "next/server";

import {
  convertIntakeRequest,
  extractBearerToken,
  formatIntakeError,
} from "@/server/intake/intake-service";

type IntakeConvertRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(
  request: Request,
  { params }: IntakeConvertRouteProps,
) {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return fail("A logged-in dashboard session is required.", 401);
  }

  const { id } = await params;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      allowPossibleDuplicate?: unknown;
    };
    const conversion = await convertIntakeRequest(accessToken, id, {
      allowPossibleDuplicate: body.allowPossibleDuplicate === true,
    });

    return NextResponse.json({ ok: true, conversion });
  } catch (error) {
    return fail(
      formatIntakeError(error instanceof Error ? error.message : "Intake conversion failed."),
      503,
    );
  }
}
