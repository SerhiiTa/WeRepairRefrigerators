export type MapsDistanceOriginSource = "technician" | "company" | "missing";

export type MapsDistanceResult = {
  status: "ready" | "missing_origin" | "missing_destination" | "unavailable";
  label: string;
  distanceMeters: number | null;
  distanceMiles: number | null;
  durationSeconds: number | null;
  durationText: string | null;
  originSource: MapsDistanceOriginSource;
};

type CacheEntry = {
  value: MapsDistanceResult;
  expiresAt: number;
};

const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const distanceCache = new Map<string, CacheEntry>();

function roundMiles(meters: number) {
  return Math.round((meters / 1609.344) * 10) / 10;
}

function buildCacheKey(origin: string, destination: string) {
  return `${origin.trim().toLowerCase()}::${destination.trim().toLowerCase()}`;
}

function unavailable(originSource: MapsDistanceOriginSource): MapsDistanceResult {
  return {
    status: "unavailable",
    label: "Distance unavailable",
    distanceMeters: null,
    distanceMiles: null,
    durationSeconds: null,
    durationText: null,
    originSource,
  };
}

function logDistanceDiagnostic(
  operation: string,
  details: Record<string, unknown>,
) {
  console.info("[maps-distance]", {
    operation,
    ...details,
  });
}

export async function calculateDrivingDistance({
  origin,
  destination,
  originSource,
}: {
  origin: string | null;
  destination: string | null;
  originSource: MapsDistanceOriginSource;
}): Promise<MapsDistanceResult> {
  if (!destination?.trim()) {
    return {
      status: "missing_destination",
      label: "Service address unavailable",
      distanceMeters: null,
      distanceMiles: null,
      durationSeconds: null,
      durationText: null,
      originSource,
    };
  }

  if (!origin?.trim()) {
    return {
      status: "missing_origin",
      label: "Set base address to calculate distance",
      distanceMeters: null,
      distanceMiles: null,
      durationSeconds: null,
      durationText: null,
      originSource: "missing",
    };
  }

  const cacheKey = buildCacheKey(origin, destination);
  const cached = distanceCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();

  if (!apiKey) {
    logDistanceDiagnostic("missing_api_key", {
      originSource,
      hasOrigin: Boolean(origin?.trim()),
      hasDestination: Boolean(destination?.trim()),
    });
    return unavailable(originSource);
  }

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("units", "imperial");
  url.searchParams.set("origins", origin);
  url.searchParams.set("destinations", destination);
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      logDistanceDiagnostic("google_http_error", {
        originSource,
        httpStatus: response.status,
        httpStatusText: response.statusText,
      });
      return unavailable(originSource);
    }

    const payload = (await response.json()) as {
      status?: string;
      rows?: Array<{
        elements?: Array<{
          status?: string;
          distance?: { text?: string; value?: number };
          duration?: { text?: string; value?: number };
        }>;
      }>;
    };
    const element = payload.rows?.[0]?.elements?.[0];
    const distanceMeters = element?.distance?.value;
    const distanceMiles =
      typeof distanceMeters === "number" ? roundMiles(distanceMeters) : null;

    if (
      payload.status !== "OK" ||
      element?.status !== "OK" ||
      typeof distanceMeters !== "number" ||
      distanceMiles === null
    ) {
      logDistanceDiagnostic("google_distance_unavailable", {
        originSource,
        googleStatus: payload.status ?? null,
        elementStatus: element?.status ?? null,
      });
      return unavailable(originSource);
    }

    const result: MapsDistanceResult = {
      status: "ready",
      label: `${distanceMiles.toFixed(1)} mi away`,
      distanceMeters,
      distanceMiles,
      durationSeconds:
        typeof element.duration?.value === "number" ? element.duration.value : null,
      durationText: element.duration?.text ?? null,
      originSource,
    };

    distanceCache.set(cacheKey, {
      value: result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return result;
  } catch (error) {
    logDistanceDiagnostic("distance_request_failed", {
      originSource,
      message: error instanceof Error ? error.message : String(error),
    });
    return unavailable(originSource);
  }
}
