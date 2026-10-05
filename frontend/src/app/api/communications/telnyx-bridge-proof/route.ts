import { NextResponse } from "next/server";

import { handleTelnyxBridgeProofWebhook } from "@/server/communications/telnyx-bridge-proof";
import { verifyTelnyxWebhookSignature } from "@/server/communications/telnyx-sms-transport";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("telnyx-signature-ed25519");
  const timestamp = request.headers.get("telnyx-timestamp");

  if (!verifyTelnyxWebhookSignature({ rawBody, signature, timestamp })) {
    return NextResponse.json(
      { ok: false, message: "Invalid Telnyx webhook signature." },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: false, message: "Telnyx webhook payload must be valid JSON." },
      { status: 400 },
    );
  }

  const result = await handleTelnyxBridgeProofWebhook(payload);
  return NextResponse.json(
    { ok: result.ok, message: result.message },
    { status: result.status },
  );
}
