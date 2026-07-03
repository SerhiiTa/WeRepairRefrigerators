import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);

  return NextResponse.json(
    {
      ok: false,
      accepted: false,
      sourceType: "retell_ai",
      message:
        "Retell/Telnyx intake receiver is prepared but not enabled. Source verification, number ownership, and call routing are deferred.",
      receivedPayloadShape:
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? Object.keys(payload).slice(0, 12)
          : [],
    },
    { status: 202 },
  );
}
