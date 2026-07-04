import { NextResponse } from "next/server";

import {
  ingestPhoneCommunication,
  type PhoneWorkflowIngestionResult,
} from "./phone-workflow";
import type { PhoneWorkflowProvider } from "./phone-normalization";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPath(payload: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!isRecord(current)) {
      return undefined;
    }
    return current[key];
  }, payload);
}

function cleanLogText(value: unknown, maxLength = 160): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

function payloadKeys(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value).slice(0, 20) : [];
}

function resolveProvider(request: Request, payload: unknown): PhoneWorkflowProvider {
  const url = new URL(request.url);
  const queryProvider = url.searchParams.get("provider")?.toLowerCase();

  if (queryProvider === "telnyx" || queryProvider === "retell") {
    return queryProvider;
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const provider =
      typeof record.provider === "string"
        ? record.provider.toLowerCase()
        : typeof record.source === "string"
          ? record.source.toLowerCase()
          : "";

    if (provider === "telnyx" || provider === "retell") {
      return provider;
    }

    if ("call" in record || "transcript_object" in record) {
      return "retell";
    }
  }

  return "telnyx";
}

function getRetellEvent(payload: unknown): string | null {
  return cleanLogText(getPath(payload, "event"), 120);
}

function getTranscriptLength(payload: unknown): number {
  const transcript =
    cleanLogText(getPath(payload, "call.transcript"), 20_000) ??
    cleanLogText(getPath(payload, "transcript"), 20_000) ??
    cleanLogText(getPath(payload, "data.payload.transcript"), 20_000);

  return transcript?.length ?? 0;
}

function buildSafeWebhookDiagnostics(
  provider: PhoneWorkflowProvider,
  payload: unknown,
) {
  const customAnalysisData = getPath(
    payload,
    "call.call_analysis.custom_analysis_data",
  );
  const callAnalysis = getPath(payload, "call.call_analysis");

  return {
    provider,
    event: getRetellEvent(payload),
    topLevelKeys: payloadKeys(payload),
    callKeys: payloadKeys(getPath(payload, "call")),
    callId:
      cleanLogText(getPath(payload, "call.call_id")) ??
      cleanLogText(getPath(payload, "call_id")),
    fromNumber:
      cleanLogText(getPath(payload, "call.from_number")) ??
      cleanLogText(getPath(payload, "from_number")),
    toNumber:
      cleanLogText(getPath(payload, "call.to_number")) ??
      cleanLogText(getPath(payload, "to_number")),
    transcriptPresent: getTranscriptLength(payload) > 0,
    transcriptLength: getTranscriptLength(payload),
    callAnalysisPresent: isRecord(callAnalysis),
    customAnalysisDataKeys: payloadKeys(customAnalysisData),
  };
}

function logSafeWebhookDiagnostic(
  phase: "received" | "skipped" | "completed" | "failed",
  diagnostics: ReturnType<typeof buildSafeWebhookDiagnostics>,
  extra: Record<string, unknown> = {},
) {
  console.info("[communications-phone-webhook]", {
    phase,
    ...diagnostics,
    ...extra,
  });
}

function safeWebhookError(message: string) {
  return process.env.NODE_ENV === "production"
    ? "Phone workflow could not be accepted yet."
    : message;
}

export async function handlePhoneWorkflowWebhook(request: Request) {
  const payload = await request.json().catch(() => null);

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        message: "Phone workflow payload must be a JSON object.",
      },
      { status: 400 },
    );
  }

  const provider = resolveProvider(request, payload);
  const diagnostics = buildSafeWebhookDiagnostics(provider, payload);

  logSafeWebhookDiagnostic("received", diagnostics);

  if (provider === "retell") {
    const event = getRetellEvent(payload);
    if (event && event !== "call_analyzed") {
      const reason = `Retell event ${event} is not ingested by this endpoint.`;

      logSafeWebhookDiagnostic("skipped", diagnostics, { reason });

      return NextResponse.json(
        {
          ok: true,
          accepted: false,
          provider,
          message: reason,
        },
        { status: 202 },
      );
    }
  }

  try {
    const result: PhoneWorkflowIngestionResult =
      await ingestPhoneCommunication(provider, payload);

    logSafeWebhookDiagnostic(result.accepted ? "completed" : "skipped", diagnostics, {
      accepted: result.accepted,
      reason: result.reason,
      conversationCreated: Boolean(result.conversationId),
      intakeCreated: Boolean(result.intakeRequestId),
      customerRecognitionStatus: result.customerRecognitionStatus,
      timelineEventsCreated: result.timelineEventsCreated,
      transcriptCreated: result.transcriptCreated,
    });

    return NextResponse.json(
      {
        ...result,
        message: result.accepted
          ? "Phone workflow accepted into WRA Communications Hub."
          : result.reason,
      },
      { status: result.accepted ? 200 : 202 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown phone workflow error.";

    logSafeWebhookDiagnostic("failed", diagnostics, {
      reason: safeWebhookError(message),
    });

    return NextResponse.json(
      {
        ok: false,
        accepted: false,
        provider,
        message: safeWebhookError(message),
      },
      { status: 500 },
    );
  }
}
