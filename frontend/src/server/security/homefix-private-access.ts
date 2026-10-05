import { NextResponse } from "next/server";

import {
  evaluateHomeFixPrivateAccess,
  type HomeFixPrivateAccessDecision,
} from "@/lib/auth/homefix-private-access";
import type { Database } from "@/lib/supabase/types";
import { createUserScopedServerClient } from "@/server/onboarding/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HomeFixPrivateAccessContext = {
  accessToken: string;
  decision: Extract<HomeFixPrivateAccessDecision, { allowed: true }>;
  supabase: SupabaseClient<Database>;
  userId: string;
};

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();

  return token.length > 0 ? token : null;
}

export function privateAccessErrorResponse(decision: HomeFixPrivateAccessDecision) {
  const status = decision.reason === "logged_out" || !decision.userId ? 401 : 403;

  return NextResponse.json(
    {
      ok: false,
      message:
        status === 401
          ? "A logged-in HomeFix dashboard session is required."
          : "HomeFix dashboard access is restricted to authorized HomeFix users.",
    },
    { status },
  );
}

export async function requireHomeFixPrivateAccess(
  request: Request,
): Promise<
  | { ok: true; context: HomeFixPrivateAccessContext }
  | { ok: false; response: NextResponse }
> {
  const accessToken = extractBearerToken(request);

  if (!accessToken) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, message: "A logged-in HomeFix dashboard session is required." },
        { status: 401 },
      ),
    };
  }

  const supabase = createUserScopedServerClient(accessToken);

  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, message: "HomeFix dashboard access is not configured." },
        { status: 503 },
      ),
    };
  }

  const decision = await evaluateHomeFixPrivateAccess(supabase);

  if (!decision.allowed) {
    return { ok: false, response: privateAccessErrorResponse(decision) };
  }

  return {
    ok: true,
    context: {
      accessToken,
      decision,
      supabase,
      userId: decision.userId,
    },
  };
}
