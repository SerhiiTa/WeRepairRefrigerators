export type AddressAutocompleteProviderId =
  | "manual"
  | "google_places"
  | "mapbox"
  | "radar"
  | "apple"
  | "internal";

export type AddressSuggestion = {
  label: string;
  streetAddress: string;
  unit?: string | null;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  placeId?: string | null;
  provider: AddressAutocompleteProviderId;
};

export type AddressAutocompleteAdapter = {
  provider: AddressAutocompleteProviderId;
  isConfigured: boolean;
  search: (query: string) => Promise<AddressSuggestion[]>;
  resolve?: (suggestion: AddressSuggestion) => Promise<AddressSuggestion>;
};

type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type GoogleAutocompletePrediction = {
  description: string;
  place_id: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
};

type GooglePlaceResult = {
  address_components?: GoogleAddressComponent[];
  formatted_address?: string;
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
  place_id?: string;
};

type GoogleMapsRuntime = {
  maps: {
    places: {
      AutocompleteService: new () => {
        getPlacePredictions: (
          request: {
            input: string;
            componentRestrictions?: { country: string };
            fields?: string[];
            types?: string[];
          },
          callback: (
            predictions: GoogleAutocompletePrediction[] | null,
            status: string,
          ) => void,
        ) => void;
      };
      PlacesService: new (container: HTMLDivElement) => {
        getDetails: (
          request: { placeId: string; fields: string[] },
          callback: (place: GooglePlaceResult | null, status: string) => void,
        ) => void;
      };
      PlacesServiceStatus: {
        OK: string;
        ZERO_RESULTS: string;
      };
    };
  };
};

declare global {
  interface Window {
    google?: GoogleMapsRuntime;
    __weRepairGooglePlacesLoader?: Promise<GoogleMapsRuntime>;
  }
}

const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

function getComponent(
  components: GoogleAddressComponent[] | undefined,
  type: string,
  name: "short_name" | "long_name" = "long_name",
) {
  return components?.find((component) => component.types.includes(type))?.[name] ?? "";
}

function normalizeGooglePlace(
  place: GooglePlaceResult,
  fallbackLabel: string,
): AddressSuggestion {
  const streetNumber = getComponent(place.address_components, "street_number");
  const route = getComponent(place.address_components, "route");
  const city =
    getComponent(place.address_components, "locality") ||
    getComponent(place.address_components, "postal_town") ||
    getComponent(place.address_components, "sublocality") ||
    getComponent(place.address_components, "administrative_area_level_2");
  const state = getComponent(
    place.address_components,
    "administrative_area_level_1",
    "short_name",
  );
  const zipCode = getComponent(place.address_components, "postal_code");
  const country = getComponent(
    place.address_components,
    "country",
    "short_name",
  ) || "US";
  const streetAddress = [streetNumber, route].filter(Boolean).join(" ");
  const latitude = place.geometry?.location?.lat();
  const longitude = place.geometry?.location?.lng();

  return {
    label: place.formatted_address || fallbackLabel,
    streetAddress,
    unit: null,
    city,
    state,
    zipCode,
    country,
    latitude: Number.isFinite(latitude) ? latitude ?? null : null,
    longitude: Number.isFinite(longitude) ? longitude ?? null : null,
    placeId: place.place_id ?? null,
    provider: "google_places",
  };
}

function loadGooglePlacesRuntime() {
  if (typeof window === "undefined" || !googleMapsApiKey) {
    return Promise.reject(new Error("Google Places is not configured."));
  }

  if (window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }

  if (window.__weRepairGooglePlacesLoader) {
    return window.__weRepairGooglePlacesLoader;
  }

  window.__weRepairGooglePlacesLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const callbackName = `__weRepairGooglePlacesReady_${Date.now()}`;

    window[callbackName as keyof Window] = (() => {
      delete window[callbackName as keyof Window];
      if (window.google?.maps?.places) {
        resolve(window.google);
      } else {
        reject(new Error("Google Places loaded without the places library."));
      }
    }) as never;

    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      googleMapsApiKey,
    )}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      delete window[callbackName as keyof Window];
      reject(new Error("Google Places script failed to load."));
    };

    document.head.appendChild(script);
  });

  return window.__weRepairGooglePlacesLoader;
}

async function resolveGoogleSuggestion(
  suggestion: AddressSuggestion,
): Promise<AddressSuggestion> {
  if (!suggestion.placeId) {
    return suggestion;
  }

  const google = await loadGooglePlacesRuntime();
  const container = document.createElement("div");
  const service = new google.maps.places.PlacesService(container);

  return new Promise((resolve, reject) => {
    service.getDetails(
      {
        placeId: suggestion.placeId ?? "",
        fields: [
          "address_components",
          "formatted_address",
          "geometry",
          "place_id",
        ],
      },
      (place, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
          reject(new Error("Google Places could not load that address."));
          return;
        }

        resolve(normalizeGooglePlace(place, suggestion.label));
      },
    );
  });
}

export const manualAddressAutocompleteAdapter: AddressAutocompleteAdapter = {
  provider: "manual",
  isConfigured: false,
  async search() {
    return [];
  },
};

export const googlePlacesAddressAutocompleteAdapter: AddressAutocompleteAdapter = {
  provider: "google_places",
  isConfigured: Boolean(googleMapsApiKey),
  async search(query) {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 3) {
      return [];
    }

    const google = await loadGooglePlacesRuntime();
    const service = new google.maps.places.AutocompleteService();

    return new Promise((resolve, reject) => {
      service.getPlacePredictions(
        {
          input: trimmedQuery,
          componentRestrictions: { country: "us" },
          types: ["address"],
        },
        (predictions, status) => {
          if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            resolve([]);
            return;
          }

          if (status !== google.maps.places.PlacesServiceStatus.OK) {
            reject(new Error("Google Places address search failed."));
            return;
          }

          resolve(
            (predictions ?? []).slice(0, 5).map((prediction) => ({
              label: prediction.description,
              streetAddress: prediction.structured_formatting?.main_text ?? "",
              unit: null,
              city: "",
              state: "",
              zipCode: "",
              country: "US",
              latitude: null,
              longitude: null,
              placeId: prediction.place_id,
              provider: "google_places",
            })),
          );
        },
      );
    });
  },
  resolve: resolveGoogleSuggestion,
};

export function getAddressAutocompleteAdapter(): AddressAutocompleteAdapter {
  return googlePlacesAddressAutocompleteAdapter.isConfigured
    ? googlePlacesAddressAutocompleteAdapter
    : manualAddressAutocompleteAdapter;
}

export function buildFormattedAddress(input: {
  streetAddress?: string | null;
  unit?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
}) {
  const lineParts = [
    input.streetAddress,
    input.unit,
    [input.city, input.state, input.zipCode].filter(Boolean).join(" "),
    input.country,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return lineParts.join(", ");
}

export function buildGoogleMapsUrl(input: {
  fullAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  if (
    input.latitude !== null &&
    input.latitude !== undefined &&
    input.longitude !== null &&
    input.longitude !== undefined
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${input.latitude},${input.longitude}`,
    )}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    input.fullAddress ?? "",
  )}`;
}

export function buildAppleMapsUrl(input: {
  fullAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  if (
    input.latitude !== null &&
    input.latitude !== undefined &&
    input.longitude !== null &&
    input.longitude !== undefined
  ) {
    return `https://maps.apple.com/?ll=${encodeURIComponent(
      `${input.latitude},${input.longitude}`,
    )}`;
  }

  return `https://maps.apple.com/?q=${encodeURIComponent(
    input.fullAddress ?? "",
  )}`;
}
