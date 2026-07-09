import { unstable_cache } from "next/cache";

import type { PropertyIntelligence } from "@/lib/property-intelligence";

const HASDATA_ZILLOW_PROPERTY_ENDPOINT =
  process.env.HASDATA_ZILLOW_PROPERTY_ENDPOINT ??
  "https://api.hasdata.com/scrape/zillow/property";

const PROPERTY_INTELLIGENCE_CACHE_SECONDS = 60 * 60 * 24 * 14;
const HASDATA_TIMEOUT_MS = 45_000;

type JsonObject = Record<string, unknown>;

type ProviderResult =
  | { ok: true; property: PropertyIntelligence | null }
  | { ok: false; reason: string };

type ParsedAddress = {
  zipCode: string | null;
};

export function normalizePropertyAddress(address: unknown): string | null {
  if (typeof address !== "string") {
    return null;
  }

  const normalized = address.replace(/\s+/g, " ").trim();

  return normalized.length >= 8 ? normalized : null;
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function readPath(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number.parseInt(part, 10);

      return Number.isInteger(index) ? current[index] : undefined;
    }

    const object = asObject(current);

    return object ? object[part] : undefined;
  }, root);
}

function readFirst(root: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = readPath(root, path);

    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return null;
}

function readString(root: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const value = readPath(root, path);

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function readNumber(root: unknown, paths: string[]): number | null {
  for (const path of paths) {
    const value = readPath(root, path);

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number.parseFloat(value.replace(/[$,]/g, ""));

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function buildZillowHomesUrl(normalizedAddress: string): string {
  const addressWithoutCountry = normalizedAddress
    .replace(/,\s*US$/i, "")
    .replace(/\s+US$/i, "")
    .trim();
  const slug = addressWithoutCountry
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `https://www.zillow.com/homes/${slug}_rb/`;
}

function parseAddressForValidation(normalizedAddress: string): ParsedAddress {
  return {
    zipCode: normalizedAddress.match(/\b\d{5}(?:-\d{4})?\b/)?.[0]?.slice(0, 5) ?? null,
  };
}

function resultMatchesAddress(
  property: JsonObject,
  normalizedAddress: string,
): boolean {
  const expected = parseAddressForValidation(normalizedAddress);

  if (!expected.zipCode) {
    return true;
  }

  const resultZip = readString(property, [
    "address.zipcode",
    "address.zipCode",
    "address.postalCode",
    "zipcode",
    "zipCode",
    "postalCode",
  ]);

  return !resultZip || resultZip.slice(0, 5) === expected.zipCode;
}

function looksLikePropertyPayload(value: unknown): boolean {
  return Boolean(
    readFirst(value, [
      "zestimate",
      "imgSrc",
      "photo",
      "livingArea",
      "yearBuilt",
      "propertyType",
      "latitude",
      "latLong.latitude",
    ]),
  );
}

function findPropertyPayload(payload: unknown): JsonObject | null {
  const object = asObject(payload);

  if (!object) {
    return null;
  }

  const candidates = [
    object,
    object.property,
    object.home,
    object.result,
    object.data,
    readPath(object, "data.property"),
    readPath(object, "data.home"),
    readPath(object, "data.result"),
    readPath(object, "results.0"),
    readPath(object, "data.results.0"),
    readPath(object, "properties.0"),
    readPath(object, "data.properties.0"),
    readPath(object, "searchResults.0"),
    readPath(object, "data.searchResults.0"),
  ];

  for (const candidate of candidates) {
    if (looksLikePropertyPayload(candidate)) {
      return asObject(candidate);
    }
  }

  return null;
}

function toPropertyIntelligence(
  payload: unknown,
  normalizedAddress: string,
): PropertyIntelligence | null {
  const property = findPropertyPayload(payload);

  if (!property) {
    return null;
  }

  if (!resultMatchesAddress(property, normalizedAddress)) {
    return null;
  }

  return {
    photo: readString(property, [
      "photo",
      "image",
      "imageUrl",
      "imgSrc",
      "primaryPhoto",
      "primaryPhoto.url",
      "photos.0.url",
      "photos.0.mixedSources.jpeg.0.url",
      "responsivePhotos.0.mixedSources.jpeg.0.url",
      "carouselPhotos.0.url",
      "miniCardPhotos.0.url",
    ]),
    zestimate: readNumber(property, [
      "zestimate",
      "zestimate.zestimate",
      "zestimateAmount",
      "homeValue",
      "estimatedValue",
    ]),
    livingArea: readNumber(property, [
      "livingArea",
      "livingAreaValue",
      "livingAreaSqft",
      "area.livingArea",
      "buildingArea",
      "resoFacts.livingArea",
      "resoFacts.livingAreaValue",
    ]),
    yearBuilt: readNumber(property, ["yearBuilt", "resoFacts.yearBuilt"]),
    propertyType: readString(property, [
      "propertyType",
      "homeType",
      "propertySubType",
      "resoFacts.propertySubType.0",
    ]),
    latitude: readNumber(property, [
      "latitude",
      "lat",
      "geo.latitude",
      "latLong.latitude",
      "address.latitude",
    ]),
    longitude: readNumber(property, [
      "longitude",
      "lng",
      "lon",
      "long",
      "geo.longitude",
      "latLong.longitude",
      "address.longitude",
    ]),
    mapImage: readString(property, [
      "mapImage",
      "staticMapImage",
      "staticMapUrl",
      "staticMapUrls.5",
      "staticMapUrls.4",
      "staticMapUrls.2",
      "staticMapUrls.0",
      "mapUrl",
      "map.image",
      "hdpMapUrl",
    ]),
  };
}

async function fetchHasDataProperty(
  normalizedAddress: string,
): Promise<ProviderResult> {
  const apiKey = process.env.HASDATA_API_KEY?.trim();

  if (!apiKey) {
    return { ok: false, reason: "HASDATA_API_KEY is not configured." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HASDATA_TIMEOUT_MS);

  try {
    const response = await fetch(HASDATA_ZILLOW_PROPERTY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ url: buildZillowHomesUrl(normalizedAddress) }),
      signal: controller.signal,
    });

    if (response.status === 404) {
      return { ok: true, property: null };
    }

    if (!response.ok) {
      return {
        ok: false,
        reason: `HasData returned ${response.status}.`,
      };
    }

    const payload = (await response.json()) as unknown;

    return {
      ok: true,
      property: toPropertyIntelligence(payload, normalizedAddress),
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? error.message
          : "HasData property request failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

const getCachedPropertyIntelligence = unstable_cache(
  async (normalizedAddress: string) => fetchHasDataProperty(normalizedAddress),
  ["property-intelligence-hasdata-zillow-v2"],
  {
    revalidate: PROPERTY_INTELLIGENCE_CACHE_SECONDS,
  },
);

export async function getPropertyIntelligence(
  address: string,
): Promise<PropertyIntelligence | null> {
  const normalizedAddress = normalizePropertyAddress(address);

  if (!normalizedAddress) {
    return null;
  }

  const result = await getCachedPropertyIntelligence(normalizedAddress);

  if (!result.ok) {
    console.warn("[property-intelligence] HasData lookup failed", {
      reason: result.reason,
    });
    return null;
  }

  return result.property;
}

export const propertyIntelligenceCache = {
  revalidateSeconds: PROPERTY_INTELLIGENCE_CACHE_SECONDS,
};
