"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildFormattedAddress,
  getAddressAutocompleteAdapter,
  type AddressSuggestion,
} from "@/lib/address-autocomplete";
import { formatDashboardIdentityLabel, loadDashboardIdentity } from "@/lib/dashboard/identity";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TechnicianProfileRow } from "@/lib/supabase/types";
import { updateTechnicianProfile } from "@/server/onboarding/actions";
import type { OnboardingActionError } from "@/server/onboarding/types";

type EditorState =
  | {
      status: "loading";
      profile: null;
      error: null;
    }
  | {
      status: "ready";
      profile: TechnicianProfileRow | null;
      error: null;
    }
  | {
      status: "unavailable";
      profile: null;
      error: string;
    };

type SubmitState =
  | {
      tone: "idle";
      message: string;
    }
  | {
      tone: "success";
      message: string;
    }
  | {
      tone: "error";
      message: string;
    };

const submitToneClasses: Record<SubmitState["tone"], string> = {
  idle: "border-blue-200 bg-blue-50 text-blue-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
};

const schemaSupportedFields = [
  "display_name",
  "business_name",
  "years_experience",
  "service_summary_public",
  "bio_private",
  "primary_city",
  "primary_state",
  "base_address_line1",
  "base_address_line2",
  "base_city",
  "base_state",
  "base_zip",
  "base_formatted_address",
  "service_zip_codes",
  "service_cities",
  "appliance_categories",
  "brands_serviced",
  "specialties",
  "languages",
  "marketplace_enabled",
];

const applianceCategoryOptions = [
  "Refrigerator",
  "Freezer",
  "Ice Maker",
  "Wine Cooler",
  "Dishwasher",
  "Washer",
  "Dryer",
  "Range",
  "Oven",
  "Cooktop",
  "Microwave",
  "Vent Hood",
  "Garbage Compactor",
];

const commonBrandOptions = [
  "Sub-Zero",
  "Wolf",
  "Thermador",
  "Viking",
  "Bosch",
  "KitchenAid",
  "Whirlpool",
  "Maytag",
  "GE",
  "GE Profile",
  "Monogram",
  "Samsung",
  "LG",
  "Frigidaire",
  "Electrolux",
  "Miele",
  "JennAir",
  "Scotsman",
];

const avatarColorOptions = [
  "#0F6BFF",
  "#16A34A",
  "#7E22CE",
  "#EA580C",
  "#0F766E",
  "#334155",
];

function joinList(values: string[] | null | undefined): string {
  return Array.isArray(values) ? values.join(", ") : "";
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatError(error: OnboardingActionError): string {
  return error.details
    ? `${error.message} ${error.details}`
    : error.message;
}

export function TechnicianProfileEditor() {
  const [editorState, setEditorState] = useState<EditorState>({
    status: "loading",
    profile: null,
    error: null,
  });
  const [displayName, setDisplayName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [serviceSummaryPublic, setServiceSummaryPublic] = useState("");
  const [bioPrivate, setBioPrivate] = useState("");
  const [primaryCity, setPrimaryCity] = useState("Houston");
  const [primaryState, setPrimaryState] = useState("TX");
  const [serviceZipCodes, setServiceZipCodes] = useState("");
  const [serviceCities, setServiceCities] = useState("");
  const [applianceCategories, setApplianceCategories] = useState("");
  const [brandsServiced, setBrandsServiced] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [languages, setLanguages] = useState("en");
  const [avatarColor, setAvatarColor] = useState("#0F6BFF");
  const [marketplaceEnabled, setMarketplaceEnabled] = useState(false);
  const [baseAddressLine1, setBaseAddressLine1] = useState("");
  const [baseAddressLine2, setBaseAddressLine2] = useState("");
  const [baseCity, setBaseCity] = useState("");
  const [baseState, setBaseState] = useState("TX");
  const [baseZip, setBaseZip] = useState("");
  const [baseCountry, setBaseCountry] = useState("US");
  const [baseFormattedAddress, setBaseFormattedAddress] = useState("");
  const [baseLatitude, setBaseLatitude] = useState<number | null>(null);
  const [baseLongitude, setBaseLongitude] = useState<number | null>(null);
  const [basePlaceId, setBasePlaceId] = useState<string | null>(null);
  const [baseAddressSearch, setBaseAddressSearch] = useState("");
  const [baseAddressSuggestions, setBaseAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isBaseAddressSearching, setIsBaseAddressSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({
    tone: "idle",
    message:
      "This editor saves the editable technician profile fields available for this workspace.",
  });
  const addressAutocomplete = useMemo(() => getAddressAutocompleteAdapter(), []);
  const technicianBaseAddressPreview =
    baseFormattedAddress ||
    buildFormattedAddress({
      streetAddress: baseAddressLine1,
      unit: baseAddressLine2,
      city: baseCity,
      state: baseState,
      zipCode: baseZip,
      country: baseCountry,
    });

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      const result = await loadDashboardIdentity();

      if (!isMounted) {
        return;
      }

      if (result.status !== "ready") {
        setEditorState({
          status: "unavailable",
          profile: null,
          error: `Dashboard identity is not ready: ${formatDashboardIdentityLabel(result.status)}.`,
        });
        return;
      }

      const technicianProfile = result.technicianProfile.data;

      setEditorState({
        status: "ready",
        profile: technicianProfile,
        error: null,
      });

      if (technicianProfile) {
        setDisplayName(technicianProfile.display_name ?? "");
        setBusinessName(technicianProfile.business_name ?? "");
        setYearsExperience(
          technicianProfile.years_experience === null
            ? ""
            : String(technicianProfile.years_experience),
        );
        setServiceSummaryPublic(
          technicianProfile.service_summary_public ?? "",
        );
        setBioPrivate(technicianProfile.bio_private ?? "");
        setPrimaryCity(technicianProfile.primary_city ?? "Houston");
        setPrimaryState(technicianProfile.primary_state ?? "TX");
        setServiceZipCodes(joinList(technicianProfile.service_zip_codes));
        setServiceCities(joinList(technicianProfile.service_cities));
        setApplianceCategories(joinList(technicianProfile.appliance_categories));
        setBrandsServiced(joinList(technicianProfile.brands_serviced));
        setSpecialties(joinList(technicianProfile.specialties));
        setLanguages(joinList(technicianProfile.languages));
        setAvatarColor(technicianProfile.avatar_color ?? "#0F6BFF");
        setMarketplaceEnabled(Boolean(technicianProfile.marketplace_enabled));
        setBaseAddressLine1(technicianProfile.base_address_line1 ?? "");
        setBaseAddressLine2(technicianProfile.base_address_line2 ?? "");
        setBaseCity(technicianProfile.base_city ?? "");
        setBaseState(technicianProfile.base_state ?? "TX");
        setBaseZip(technicianProfile.base_zip ?? "");
        setBaseCountry(technicianProfile.base_country ?? "US");
        setBaseFormattedAddress(technicianProfile.base_formatted_address ?? "");
        setBaseLatitude(technicianProfile.base_latitude ?? null);
        setBaseLongitude(technicianProfile.base_longitude ?? null);
        setBasePlaceId(technicianProfile.base_place_id ?? null);
        setBaseAddressSearch(technicianProfile.base_formatted_address ?? "");
      }
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!addressAutocomplete.isConfigured || baseAddressSearch.trim().length < 3) {
      return;
    }

    let isActive = true;

    addressAutocomplete
      .search(baseAddressSearch)
      .then((suggestions) => {
        if (isActive) {
          setBaseAddressSuggestions(suggestions);
        }
      })
      .catch(() => {
        if (isActive) {
          setBaseAddressSuggestions([]);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsBaseAddressSearching(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [addressAutocomplete, baseAddressSearch]);

  async function applyBaseAddressSuggestion(suggestion: AddressSuggestion) {
    const resolved = addressAutocomplete.resolve
      ? await addressAutocomplete.resolve(suggestion).catch(() => suggestion)
      : suggestion;

    setBaseAddressLine1(resolved.streetAddress);
    setBaseAddressLine2(resolved.unit ?? "");
    setBaseCity(resolved.city);
    setBaseState(resolved.state || "TX");
    setBaseZip(resolved.zipCode);
    setBaseCountry(resolved.country || "US");
    setBaseFormattedAddress(resolved.label);
    setBaseLatitude(resolved.latitude ?? null);
    setBaseLongitude(resolved.longitude ?? null);
    setBasePlaceId(resolved.placeId ?? null);
    setBaseAddressSearch(resolved.label);
    setBaseAddressSuggestions([]);
  }

  function clearBaseAddress() {
    setBaseAddressLine1("");
    setBaseAddressLine2("");
    setBaseCity("");
    setBaseState("TX");
    setBaseZip("");
    setBaseCountry("US");
    setBaseFormattedAddress("");
    setBaseLatitude(null);
    setBaseLongitude(null);
    setBasePlaceId(null);
    setBaseAddressSearch("");
    setBaseAddressSuggestions([]);
  }

  async function getAccessToken(): Promise<string | null> {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.access_token) {
      return null;
    }

    return data.session.access_token;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitState({
      tone: "idle",
      message: editorState.profile
        ? "Saving technician profile updates..."
        : "Creating draft technician profile...",
    });

    const accessToken = await getAccessToken();

    if (!accessToken) {
      setSubmitState({
        tone: "error",
        message: "Log in again before editing your technician profile.",
      });
      setIsSubmitting(false);
      return;
    }

    const result = await updateTechnicianProfile({
      accessToken,
      displayName,
      businessName,
      yearsExperience: yearsExperience
        ? Number.parseInt(yearsExperience, 10)
        : undefined,
      serviceSummaryPublic,
      bioPrivate,
      primaryCity,
      primaryState,
      serviceZipCodes: splitList(serviceZipCodes),
      serviceCities: splitList(serviceCities),
      applianceCategories: splitList(applianceCategories),
      brandsServiced: splitList(brandsServiced),
      specialties: splitList(specialties),
      languages: splitList(languages),
      avatarColor,
      marketplaceEnabled,
      baseAddressLine1,
      baseAddressLine2,
      baseCity,
      baseState,
      baseZip,
      baseCountry,
      baseFormattedAddress: technicianBaseAddressPreview,
      baseLatitude,
      baseLongitude,
      basePlaceId,
    });

    if (!result.ok) {
      setSubmitState({
        tone: "error",
        message: formatError(result.error),
      });
      setIsSubmitting(false);
      return;
    }

    setEditorState({
      status: "ready",
      profile: result.data.profile,
      error: null,
    });
    setSubmitState({
      tone: "success",
      message: editorState.profile
        ? "Technician profile saved."
        : "Draft technician profile created.",
    });
    setIsSubmitting(false);
  }

  if (editorState.status === "loading") {
    return (
      <section className="mx-auto max-w-5xl rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[#0F6BFF]">
          Technician profile
        </p>
        <p className="mt-3 text-[#64748B]">
          Loading your authenticated technician profile...
        </p>
      </section>
    );
  }

  if (editorState.status === "unavailable") {
    return (
      <section className="mx-auto max-w-5xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">
          Technician profile unavailable
        </p>
        <p className="mt-3 leading-7">{editorState.error}</p>
      </section>
    );
  }

  const profile = editorState.profile;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#0F6BFF]">
          Marketplace settings
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">
              Manage your public booking profile.
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-[#64748B]">
              Keep your customer-facing name, service areas, appliance categories,
              brands, and marketplace availability current for booking matches.
            </p>
          </div>
          <div className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm text-[#334155]">
            <p>
              Status:{" "}
              <span className="font-bold text-[#0F172A]">
                {profile
                  ? formatDashboardIdentityLabel(profile.technician_status)
                  : "No profile yet"}
              </span>
            </p>
            <p className="mt-1">
              Customer booking:{" "}
              <span className="font-bold text-[#0F172A]">
                {profile?.marketplace_enabled ? "Enabled" : "Disabled"}
              </span>
            </p>
          </div>
        </div>
      </section>

      {!profile ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-800 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-blue-700">
            Empty state
          </p>
          <h2 className="mt-2 text-xl font-bold text-[#0F172A]">
            No technician profile exists yet.
          </h2>
          <p className="mt-2 leading-7 text-blue-800">
            Active technician, company owner, and admin accounts can create a
            draft technician profile with public visibility
            turned off.
          </p>
        </section>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
      >
        <div className="mb-6 grid gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-4 md:grid-cols-[auto_1fr_auto] md:items-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-black text-white"
            style={{ backgroundColor: avatarColor }}
            aria-hidden="true"
          >
            {(displayName || businessName || "T").trim().slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-[0.12em] text-blue-700">
              Marketplace visibility
            </p>
            <h2 className="mt-1 text-xl font-black text-[#0F172A]">
              {marketplaceEnabled ? "Visible for customer booking" : "Hidden from customer booking"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#475569]">
              Only verified public-ready profiles can be shown to customers. If this profile is not verified yet, the database keeps marketplace visibility off.
            </p>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-black text-[#0F172A]">
            <input
              type="checkbox"
              checked={marketplaceEnabled}
              onChange={(event) => setMarketplaceEnabled(event.target.checked)}
              className="h-5 w-5 accent-[#0F6BFF]"
            />
            Marketplace enabled
          </label>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <DashboardTextInput
            label="Display name"
            value={displayName}
            onChange={setDisplayName}
            placeholder="Public technician name"
          />
          <DashboardTextInput
            label="Business name"
            value={businessName}
            onChange={setBusinessName}
            placeholder="Optional business name"
          />
          <DashboardTextInput
            label="Years of experience"
            value={yearsExperience}
            onChange={setYearsExperience}
            type="number"
            placeholder="Optional"
          />
          <div className="grid gap-5 sm:grid-cols-[1fr_120px]">
            <DashboardTextInput
              label="Primary city"
              value={primaryCity}
              onChange={setPrimaryCity}
              placeholder="Houston"
            />
            <DashboardTextInput
              label="State"
              value={primaryState}
              onChange={setPrimaryState}
              placeholder="TX"
              maxLength={2}
            />
          </div>
          <DashboardTextInput
            label="Service ZIP codes"
            value={serviceZipCodes}
            onChange={setServiceZipCodes}
            placeholder="77024, 77079, 77494"
          />
          <DashboardTextInput
            label="Service cities"
            value={serviceCities}
            onChange={setServiceCities}
            placeholder="Houston, Katy, Sugar Land"
          />
          <DashboardTextInput
            label="Appliance categories serviced"
            value={applianceCategories}
            onChange={setApplianceCategories}
            placeholder="Refrigerator, Dishwasher, Washer"
          />
          <DashboardTextInput
            label="Brands serviced"
            value={brandsServiced}
            onChange={setBrandsServiced}
            placeholder="Sub-Zero, GE Profile, Samsung"
          />
          <DashboardTextInput
            label="Specialties and skills"
            value={specialties}
            onChange={setSpecialties}
            placeholder="Sealed system, compressor diagnostics, built-in refrigeration"
          />
          <DashboardTextInput
            label="Languages"
            value={languages}
            onChange={setLanguages}
            placeholder="en, es"
          />
          <div className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm text-[#334155]">
            <p className="font-bold text-[#0F172A]">Profile readiness</p>
            <p className="mt-2">
              Public booking enabled:{" "}
              <span className="font-bold text-[#0F172A]">
                {profile?.marketplace_enabled ? "Yes" : "No"}
              </span>
            </p>
            <p className="mt-1">
              Public profile ready:{" "}
              <span className="font-bold text-[#0F172A]">
                {profile?.public_profile_ready ? "Yes" : "No"}
              </span>
            </p>
            <p className="mt-1">
              Affiliation:{" "}
              <span className="font-bold text-[#0F172A]">
                {formatDashboardIdentityLabel(
                  profile?.affiliation_type ?? "independent",
              )}
            </span>
            </p>
          </div>
          <div className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3">
            <p className="text-sm font-bold text-[#0F172A]">Avatar color</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {avatarColorOptions.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setAvatarColor(color)}
                  className={`h-9 w-9 rounded-full border-2 ${
                    avatarColor === color ? "border-[#0F172A]" : "border-white"
                  } shadow-sm`}
                  style={{ backgroundColor: color }}
                  aria-label={`Use avatar color ${color}`}
                />
              ))}
            </div>
          </div>
          <div className="md:col-span-2 rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
            <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-start">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.14em] text-[#2563EB]">
                  Distance origin
                </p>
                <h3 className="mt-1 text-lg font-black text-[#0F172A]">
                  Technician Base Address
                </h3>
                <p className="mt-1 text-sm leading-6 text-[#64748B]">
                  Optional personal override for driving distance. If blank,
                  WRA uses the Company Base Address.
                </p>
              </div>
              <button
                className="rounded-[10px] border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-black text-[#334155]"
                onClick={clearBaseAddress}
                type="button"
              >
                Clear override
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="text-sm font-bold text-[#334155]">
                  Search address
                </span>
                <input
                  className="mt-2 w-full rounded-[8px] border border-[#E5E7EB] bg-white px-4 py-3 text-base text-[#0F172A] outline-none transition placeholder:text-[#64748B] focus:border-[#0F6BFF] focus:ring-4 focus:ring-[#0F6BFF]/10"
                  onChange={(event) => {
                    const value = event.target.value;
                    setBaseAddressSearch(value);
                    if (value.trim().length < 3) {
                      setBaseAddressSuggestions([]);
                      setIsBaseAddressSearching(false);
                    } else {
                      setIsBaseAddressSearching(true);
                    }
                  }}
                  placeholder="Home base, shop, warehouse, or dispatch location"
                  value={baseAddressSearch}
                />
                {baseAddressSuggestions.length > 0 ? (
                  <div className="mt-2 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-lg">
                    {baseAddressSuggestions.map((suggestion) => (
                      <button
                        className="block w-full border-b border-[#F1F5F9] px-4 py-3 text-left text-sm font-bold text-[#0F172A] last:border-b-0"
                        key={`${suggestion.placeId ?? suggestion.label}-${suggestion.label}`}
                        onClick={() => void applyBaseAddressSuggestion(suggestion)}
                        type="button"
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {isBaseAddressSearching ? (
                  <span className="mt-2 block text-xs font-bold text-[#64748B]">
                    Searching addresses...
                  </span>
                ) : null}
              </label>

              <DashboardTextInput
                label="Address line 1"
                value={baseAddressLine1}
                onChange={(value) => {
                  setBaseAddressLine1(value);
                  setBaseFormattedAddress("");
                }}
                placeholder="Street address"
              />
              <DashboardTextInput
                label="Address line 2 / Suite"
                value={baseAddressLine2}
                onChange={(value) => {
                  setBaseAddressLine2(value);
                  setBaseFormattedAddress("");
                }}
                placeholder="Optional"
              />
              <DashboardTextInput
                label="City"
                value={baseCity}
                onChange={(value) => {
                  setBaseCity(value);
                  setBaseFormattedAddress("");
                }}
                placeholder="Houston"
              />
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_90px]">
                <DashboardTextInput
                  label="State"
                  value={baseState}
                  onChange={(value) => {
                    setBaseState(value.toUpperCase());
                    setBaseFormattedAddress("");
                  }}
                  placeholder="TX"
                  maxLength={2}
                />
                <DashboardTextInput
                  label="ZIP"
                  value={baseZip}
                  onChange={(value) => {
                    setBaseZip(value);
                    setBaseFormattedAddress("");
                  }}
                  placeholder="77056"
                />
                <DashboardTextInput
                  label="Country"
                  value={baseCountry}
                  onChange={(value) => {
                    setBaseCountry(value.toUpperCase());
                    setBaseFormattedAddress("");
                  }}
                  placeholder="US"
                  maxLength={2}
                />
              </div>
            </div>
            <p className="mt-4 text-sm font-bold text-[#475569]">
              Saved override:{" "}
              <span className="text-[#0F172A]">
                {technicianBaseAddressPreview || "No technician override set"}
              </span>
            </p>
          </div>
          <DashboardTextArea
            label="Short public bio"
            value={serviceSummaryPublic}
            onChange={setServiceSummaryPublic}
            placeholder="Customer-safe repair focus shown in technician selection."
          />
          <DashboardTextArea
            label="Private technician bio"
            value={bioPrivate}
            onChange={setBioPrivate}
            placeholder="Internal technician notes about experience and focus."
          />
        </div>

        <div
          className={`mt-6 rounded-md border px-4 py-3 text-sm font-bold ${submitToneClasses[submitState.tone]}`}
        >
          {submitState.message}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-[#64748B]">
            Customer booking uses these fields for ZIP coverage, appliance category, brand experience, and top-match ranking.
          </p>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex justify-center rounded-[10px] bg-[#0F6BFF] px-5 py-3 text-sm font-black text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            {isSubmitting
              ? "Saving..."
              : profile
                ? "Save Profile"
                : "Create Draft Profile"}
          </button>
        </div>
      </form>

      <section className="grid gap-4 md:grid-cols-2">
        <ChecklistCard
          title="Appliance categories"
          values={splitList(applianceCategories)}
          suggestions={applianceCategoryOptions}
          onAdd={(value) =>
            setApplianceCategories(joinList([...splitList(applianceCategories), value]))
          }
        />
        <ChecklistCard
          title="Common brands"
          values={splitList(brandsServiced)}
          suggestions={commonBrandOptions}
          onAdd={(value) =>
            setBrandsServiced(joinList([...splitList(brandsServiced), value]))
          }
        />
      </section>

      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[#64748B]">
          Editable fields
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {schemaSupportedFields.map((field) => (
            <span
              key={field}
              className="rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1 text-xs font-bold text-[#334155]"
            >
              {field}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function DashboardTextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  maxLength?: number;
}) {
  return (
    <label>
      <span className="text-sm font-bold text-[#334155]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        maxLength={maxLength}
        className="mt-2 w-full rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-base text-[#0F172A] outline-none transition placeholder:text-[#64748B] focus:border-[#0F6BFF] focus:ring-4 focus:ring-[#0F6BFF]/10"
        placeholder={placeholder}
      />
    </label>
  );
}

function ChecklistCard({
  title,
  values,
  suggestions,
  onAdd,
}: {
  title: string;
  values: string[];
  suggestions: string[];
  onAdd: (value: string) => void;
}) {
  const normalizedValues = new Set(values.map((value) => value.toLowerCase()));

  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.14em] text-[#0F6BFF]">
            Quick add
          </p>
          <h2 className="mt-1 text-lg font-black text-[#0F172A]">{title}</h2>
        </div>
        <span className="rounded-full bg-[#F8FAFC] px-3 py-1 text-xs font-bold text-[#64748B]">
          {values.length} selected
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {suggestions.map((suggestion) => {
          const selected = normalizedValues.has(suggestion.toLowerCase());

          return (
            <button
              key={suggestion}
              type="button"
              disabled={selected}
              onClick={() => onAdd(suggestion)}
              className={`rounded-full border px-3 py-2 text-xs font-black transition ${
                selected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-[#E5E7EB] bg-[#F8FAFC] text-[#334155] hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
              }`}
            >
              {selected ? "Added · " : "+ "}
              {suggestion}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DashboardTextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="md:col-span-2">
      <span className="text-sm font-bold text-[#334155]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        className="mt-2 w-full resize-y rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-base leading-7 text-[#0F172A] outline-none transition placeholder:text-[#64748B] focus:border-[#0F6BFF] focus:ring-4 focus:ring-[#0F6BFF]/10"
        placeholder={placeholder}
      />
    </label>
  );
}
