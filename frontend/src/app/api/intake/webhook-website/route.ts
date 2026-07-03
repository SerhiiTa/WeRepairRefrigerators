import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);

  return NextResponse.json(
    {
      ok: false,
      accepted: false,
      sourceType: "website_form",
      message:
        "Website intake receiver is prepared but not enabled. Use authenticated /api/intake until source authentication is configured.",
      receivedPayloadShape:
        payload && typeof payload === "object" && !Array.isArray(payload)
          ? Object.keys(payload).slice(0, 12)
          : [],
    },
    { status: 202 },
  );
}
