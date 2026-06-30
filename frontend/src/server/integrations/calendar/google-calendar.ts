import type {
  CalendarEventCancel,
  CalendarEventCreate,
  CalendarEventRef,
  CalendarEventUpdate,
  CalendarProvider,
  CalendarSummary,
  AvailabilityWindow,
  CalendarSyncResult,
  ProviderResult,
} from "@/lib/integrations";

type GoogleCalendarConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  defaultCalendarId: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleCalendarEventResponse = {
  id?: string;
  htmlLink?: string;
  error?: {
    message?: string;
    code?: number;
  };
};

function safeMessage(message: string): string {
  return message.replace(/\s+/g, " ").slice(0, 500);
}

function providerUnavailable<T>(message: string): ProviderResult<T> {
  return {
    ok: false,
    error: {
      code: "provider_unavailable",
      message,
      retryable: false,
    },
    providerRequestId: "google-calendar-disabled",
  };
}

function getGoogleCalendarConfig(): GoogleCalendarConfig | null {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim();
  const defaultCalendarId =
    process.env.GOOGLE_CALENDAR_DEFAULT_CALENDAR_ID?.trim() || "primary";

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
    defaultCalendarId,
  };
}

async function getAccessToken(
  config: GoogleCalendarConfig,
): Promise<ProviderResult<string>> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | GoogleTokenResponse
    | null;

  if (!response.ok || !payload?.access_token) {
    return {
      ok: false,
      error: {
        code: "authentication_required",
        message: safeMessage(
          payload?.error_description ??
            payload?.error ??
            "Google Calendar OAuth token refresh failed.",
        ),
        retryable: false,
        providerStatus: response.status,
      },
    };
  }

  return {
    ok: true,
    data: payload.access_token,
  };
}

function buildGoogleEvent(input: CalendarEventCreate) {
  return {
    summary: input.title,
    location: input.location,
    description: input.description,
    start: {
      dateTime: input.startsAt,
      timeZone: "America/Chicago",
    },
    end: {
      dateTime: input.endsAt,
      timeZone: "America/Chicago",
    },
  };
}

function eventRefFromPayload(
  payload: GoogleCalendarEventResponse | null,
  fallbackId?: string,
): ProviderResult<CalendarEventRef> {
  const providerEventId = payload?.id ?? fallbackId;

  if (!providerEventId) {
    return providerUnavailable("Google Calendar did not return an event id.");
  }

  return {
    ok: true,
    data: {
      providerEventId,
      url: payload?.htmlLink,
    },
  };
}

export function isGoogleCalendarConfigured(): boolean {
  return getGoogleCalendarConfig() !== null;
}

export function createGoogleCalendarProvider(): CalendarProvider {
  const config = getGoogleCalendarConfig();

  if (!config) {
    const disabled = <T>() =>
      Promise.resolve(
        providerUnavailable<T>(
          "Google Calendar is not configured. Appointment booking still succeeds without calendar sync.",
        ),
      );

    return {
      listCalendars: () => Promise.resolve({ ok: true, data: [] }),
      getAvailability: () => Promise.resolve({ ok: true, data: [] }),
      createEvent: () => disabled(),
      updateEvent: () => disabled(),
      cancelEvent: () => disabled(),
      syncEvents: () => Promise.resolve({ ok: true, data: { eventsChanged: 0 } }),
    };
  }

  const googleConfig = config;

  async function withToken<T>(
    callback: (accessToken: string) => Promise<ProviderResult<T>>,
  ): Promise<ProviderResult<T>> {
    const tokenResult = await getAccessToken(googleConfig);

    if (!tokenResult.ok) {
      return tokenResult;
    }

    return callback(tokenResult.data);
  }

  return {
    listCalendars: (): Promise<ProviderResult<CalendarSummary[]>> =>
      withToken(async (accessToken) => {
        const response = await fetch(
          "https://www.googleapis.com/calendar/v3/users/me/calendarList",
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        const payload = (await response.json().catch(() => null)) as
          | { items?: Array<{ id?: string; summary?: string; primary?: boolean }> }
          | null;

        if (!response.ok) {
          return providerUnavailable("Google Calendar list request failed.");
        }

        return {
          ok: true,
          data: (payload?.items ?? [])
            .filter((calendar) => calendar.id && calendar.summary)
            .map((calendar) => ({
              id: calendar.id ?? "",
              name: calendar.summary ?? "",
              primary: calendar.primary,
            })),
        };
      }),
    getAvailability: (): Promise<ProviderResult<AvailabilityWindow[]>> =>
      Promise.resolve({ ok: true, data: [] }),
    createEvent: (
      input: CalendarEventCreate,
    ): Promise<ProviderResult<CalendarEventRef>> =>
      withToken(async (accessToken) => {
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            googleConfig.defaultCalendarId,
          )}/events`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(buildGoogleEvent(input)),
          },
        );
        const payload = (await response.json().catch(() => null)) as
          | GoogleCalendarEventResponse
          | null;

        if (!response.ok) {
          return {
            ok: false,
            error: {
              code: "provider_unavailable",
              message: safeMessage(
                payload?.error?.message ??
                  "Google Calendar event creation failed.",
              ),
              retryable: true,
              providerStatus: response.status,
            },
          };
        }

        return eventRefFromPayload(payload);
      }),
    updateEvent: (
      input: CalendarEventUpdate,
    ): Promise<ProviderResult<CalendarEventRef>> =>
      withToken(async (accessToken) => {
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            googleConfig.defaultCalendarId,
          )}/events/${encodeURIComponent(input.providerEventId)}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(buildGoogleEvent(input)),
          },
        );
        const payload = (await response.json().catch(() => null)) as
          | GoogleCalendarEventResponse
          | null;

        if (!response.ok) {
          return providerUnavailable("Google Calendar event update failed.");
        }

        return eventRefFromPayload(payload, input.providerEventId);
      }),
    cancelEvent: (
      input: CalendarEventCancel,
    ): Promise<ProviderResult<{ canceled: true }>> =>
      withToken(async (accessToken) => {
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            googleConfig.defaultCalendarId,
          )}/events/${encodeURIComponent(input.providerEventId)}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        if (!response.ok && response.status !== 410) {
          return providerUnavailable("Google Calendar event cancellation failed.");
        }

        return { ok: true, data: { canceled: true } };
      }),
    syncEvents: (): Promise<ProviderResult<CalendarSyncResult>> =>
      Promise.resolve({ ok: true, data: { eventsChanged: 0 } }),
  };
}
