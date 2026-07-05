export type RetellCallRecording = {
  recordingUrl: string | null;
  recordingMultiChannelUrl: string | null;
  scrubbedRecordingUrl: string | null;
  durationMs: number | null;
  startTimestamp: string | null;
  endTimestamp: string | null;
};

export function getBestRetellRecordingAudioUrl(
  recording: RetellCallRecording,
): string | null {
  return (
    recording.scrubbedRecordingUrl ??
    recording.recordingUrl ??
    recording.recordingMultiChannelUrl
  );
}

function cleanUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const text = value.trim();
  return /^https:\/\/.+/i.test(text) ? text : null;
}

function cleanNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanIsoDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const date = new Date(value.trim());
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

export async function fetchRetellCallRecording(
  callId: string,
): Promise<
  | { ok: true; recording: RetellCallRecording }
  | { ok: false; reason: string; status?: number }
> {
  const apiKey = process.env.RETELL_API_KEY;
  const cleanedCallId = callId.trim();

  if (!apiKey) {
    return { ok: false, reason: "Retell recording access is not configured." };
  }

  if (!cleanedCallId) {
    return { ok: false, reason: "Missing Retell call id." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(
      `https://api.retellai.com/v2/get-call/${encodeURIComponent(cleanedCallId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | Record<string, unknown>
      | null;

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        reason: "Retell recording is unavailable for this call.",
      };
    }

    return {
      ok: true,
      recording: {
        recordingUrl: cleanUrl(payload?.recording_url),
        recordingMultiChannelUrl: cleanUrl(payload?.recording_multi_channel_url),
        scrubbedRecordingUrl: cleanUrl(payload?.scrubbed_recording_url),
        durationMs: cleanNumber(payload?.duration_ms),
        startTimestamp: cleanIsoDate(payload?.start_timestamp),
        endTimestamp: cleanIsoDate(payload?.end_timestamp),
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error && error.name === "AbortError"
          ? "Retell recording lookup timed out."
          : "Retell recording lookup failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
