import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { requestRetellHumanHandoff } from "@/server/communications/telnyx-bridge-proof";

export const runtime = "nodejs";

function cleanString(value: unknown, maxLength = 500): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

function getPath(payload: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, payload);
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function tokensMatch(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);

  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}

function isAuthorized(request: Request): boolean {
  const expectedToken = process.env.WRA_BRIDGE_PROOF_TRANSFER_TOKEN?.trim();
  const suppliedToken = extractBearerToken(request);

  return Boolean(
    expectedToken &&
      suppliedToken &&
      tokensMatch(suppliedToken, expectedToken),
  );
}

function extractTransferSessionId(payload: unknown): string | null {
  return (
    cleanString(getPath(payload, "wra_transfer_session_id"), 2_500) ??
    cleanString(getPath(payload, "transfer_session_id"), 2_500) ??
    cleanString(getPath(payload, "args.wra_transfer_session_id"), 2_500) ??
    cleanString(getPath(payload, "args.transfer_session_id"), 2_500) ??
    cleanString(getPath(payload, "parameters.wra_transfer_session_id"), 2_500) ??
    cleanString(getPath(payload, "parameters.transfer_session_id"), 2_500)
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized human handoff request." },
      { status: 401 },
    );
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json(
      { ok: false, message: "Human handoff request must be a JSON object." },
      { status: 400 },
    );
  }

  const transferSessionId = extractTransferSessionId(payload);
  if (!transferSessionId) {
    return NextResponse.json(
      { ok: false, message: "WRA transfer session id is required." },
      { status: 400 },
    );
  }

  const result = await requestRetellHumanHandoff({ transferSessionId });

  return NextResponse.json(
    {
      ok: result.ok,
      message: result.ok
        ? "Human handoff requested. Please stay on the line while we connect you."
        : result.message,
      next_action: result.ok ? "wait_for_human_answer" : "continue_ai",
    },
    { status: result.status },
  );
}
