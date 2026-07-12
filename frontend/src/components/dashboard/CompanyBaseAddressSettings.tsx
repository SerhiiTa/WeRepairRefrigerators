"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildFormattedAddress,
  getAddressAutocompleteAdapter,
  type AddressSuggestion,
} from "@/lib/address-autocomplete";
import { formatDashboardIdentityLabel, loadDashboardIdentity } from "@/lib/dashboard/identity";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CompanyRow } from "@/lib/supabase/types";

type FormState = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
};

type SaveState =
  | { status: "idle"; message: string | null }
  | { status: "saving"; message: string | null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function readCompanyForm(company: CompanyRow | null): FormState {
  return {
    line1: company?.base_address_line1 ?? "",
    line2: company?.base_address_line2 ?? "",
    city: company?.base_city ?? "",
    state: company?.base_state ?? "TX",
    zip: company?.base_zip ?? "",
    country: company?.base_country ?? "US",
    formattedAddress: company?.base_formatted_address ?? "",
    latitude: company?.base_latitude ?? null,
    longitude: company?.base_longitude ?? null,
    placeId: company?.base_place_id ?? null,
  };
}

function canEditCompanyBaseAddress(role: string | null | undefined) {
  return role === "owner" || role === "manager";
}

export function CompanyBaseAddressSettings() {
  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const [form, setForm] = useState<FormState>(() => readCompanyForm(null));
  const [searchText, setSearchText] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({
    status: "idle",
    message: null,
  });

  const autocomplete = useMemo(() => getAddressAutocompleteAdapter(), []);
  const previewAddress =
    form.formattedAddress ||
    buildFormattedAddress({
      streetAddress: form.line1,
      unit: form.line2,
      city: form.city,
      state: form.state,
      zipCode: form.zip,
      country: form.country,
    });

  useEffect(() => {
    let isMounted = true;

    async function loadCompany() {
      const identity = await loadDashboardIdentity();

      if (!isMounted) {
        return;
      }

      if (identity.status !== "ready") {
        setLoadStatus("unavailable");
        return;
      }

      const loadedCompany = identity.company.data;
      setCompany(loadedCompany);
      setForm(readCompanyForm(loadedCompany));
      setSearchText(loadedCompany?.base_formatted_address ?? "");
      setCanEdit(canEditCompanyBaseAddress(identity.companyMembership.data?.member_role));
      setLoadStatus("ready");
    }

    void loadCompany();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!autocomplete.isConfigured || searchText.trim().length < 3) {
      return;
    }

    let isActive = true;

    autocomplete
      .search(searchText)
      .then((result) => {
        if (isActive) {
          setSuggestions(result);
        }
      })
      .catch(() => {
        if (isActive) {
          setSuggestions([]);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsSearching(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [autocomplete, searchText]);

  async function applySuggestion(suggestion: AddressSuggestion) {
    const resolved = autocomplete.resolve
      ? await autocomplete.resolve(suggestion).catch(() => suggestion)
      : suggestion;

    setForm({
      line1: resolved.streetAddress,
      line2: resolved.unit ?? "",
      city: resolved.city,
      state: resolved.state || "TX",
      zip: resolved.zipCode,
      country: resolved.country || "US",
      formattedAddress: resolved.label,
      latitude: resolved.latitude ?? null,
      longitude: resolved.longitude ?? null,
      placeId: resolved.placeId ?? null,
    });
    setSearchText(resolved.label);
    setSuggestions([]);
  }

  async function saveCompanyBaseAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!company?.id) {
      setSaveState({
        status: "error",
        message: "Company context is not available.",
      });
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const session = await supabase?.auth.getSession();
    const accessToken = session?.data.session?.access_token;

    if (!accessToken) {
      setSaveState({
        status: "error",
        message: "Log in again before saving company settings.",
      });
      return;
    }

    setSaveState({ status: "saving", message: "Saving company base address..." });

    const response = await fetch("/api/dashboard/company-base-address", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        companyId: company.id,
        baseAddressLine1: form.line1,
        baseAddressLine2: form.line2,
        baseCity: form.city,
        baseState: form.state,
        baseZip: form.zip,
        baseCountry: form.country,
        baseFormattedAddress: previewAddress,
        baseLatitude: form.latitude,
        baseLongitude: form.longitude,
        basePlaceId: form.placeId,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      company?: CompanyRow;
    } | null;

    if (!response.ok || !payload?.ok) {
      setSaveState({
        status: "error",
        message:
          payload?.message ??
          "Company base address could not be saved yet.",
      });
      return;
    }

    setCompany(payload.company ?? company);
    setForm(readCompanyForm(payload.company ?? company));
    setSaveState({
      status: "success",
      message: "Company base address saved.",
    });
  }

  if (loadStatus === "loading") {
    return (
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
        <p className="font-bold text-[#64748B]">Loading company settings...</p>
      </section>
    );
  }

  if (loadStatus === "unavailable" || !company) {
    return (
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
        <h2 className="text-xl font-black text-[#0F172A]">Company Base Address</h2>
        <p className="mt-2 text-sm leading-6 text-[#64748B]">
          Company settings are available when a dashboard company context is loaded.
        </p>
      </section>
    );
  }

  return (
    <form
      className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
      onSubmit={saveCompanyBaseAddress}
    >
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.14em] text-[#2563EB]">
            Company
          </p>
          <h2 className="mt-1 text-2xl font-black text-[#0F172A]">
            Company Base Address
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748B]">
            Used as the default origin for driving distance to client service
            addresses. Technician Base Address overrides this when set.
          </p>
        </div>
        <span className="rounded-full bg-[#F8FAFC] px-3 py-1 text-xs font-black text-[#64748B]">
          {formatDashboardIdentityLabel(company.status)}
        </span>
      </div>

      {!canEdit ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          Company base address can be edited by company owners or managers.
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="md:col-span-2">
          <span className="text-sm font-bold text-[#334155]">
            Search address
          </span>
          <input
            className="mt-2 w-full rounded-[10px] border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3 text-base text-[#0F172A] outline-none focus:border-[#2563EB]"
            disabled={!canEdit}
            onChange={(event) => {
              const value = event.target.value;
              setSearchText(value);
              if (value.trim().length < 3) {
                setSuggestions([]);
                setIsSearching(false);
              } else {
                setIsSearching(true);
              }
            }}
            placeholder="Start typing company office, shop, or home base"
            value={searchText}
          />
          {suggestions.length > 0 ? (
            <div className="mt-2 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-lg">
              {suggestions.map((suggestion) => (
                <button
                  className="block w-full border-b border-[#F1F5F9] px-4 py-3 text-left text-sm font-bold text-[#0F172A] last:border-b-0"
                  key={`${suggestion.placeId ?? suggestion.label}-${suggestion.label}`}
                  onClick={() => void applySuggestion(suggestion)}
                  type="button"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          ) : null}
          {isSearching ? (
            <span className="mt-2 block text-xs font-bold text-[#64748B]">
              Searching addresses...
            </span>
          ) : null}
        </label>

        <SettingsInput
          disabled={!canEdit}
          label="Address line 1"
          onChange={(value) =>
            setForm((current) => ({ ...current, line1: value, formattedAddress: "" }))
          }
          value={form.line1}
        />
        <SettingsInput
          disabled={!canEdit}
          label="Address line 2 / Suite"
          onChange={(value) =>
            setForm((current) => ({ ...current, line2: value, formattedAddress: "" }))
          }
          value={form.line2}
        />
        <SettingsInput
          disabled={!canEdit}
          label="City"
          onChange={(value) =>
            setForm((current) => ({ ...current, city: value, formattedAddress: "" }))
          }
          value={form.city}
        />
        <div className="grid grid-cols-[1fr_1fr_90px] gap-3">
          <SettingsInput
            disabled={!canEdit}
            label="State"
            maxLength={2}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                state: value.toUpperCase(),
                formattedAddress: "",
              }))
            }
            value={form.state}
          />
          <SettingsInput
            disabled={!canEdit}
            label="ZIP"
            onChange={(value) =>
              setForm((current) => ({ ...current, zip: value, formattedAddress: "" }))
            }
            value={form.zip}
          />
          <SettingsInput
            disabled={!canEdit}
            label="Country"
            maxLength={2}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                country: value.toUpperCase(),
                formattedAddress: "",
              }))
            }
            value={form.country}
          />
        </div>
      </div>

      <p className="mt-4 text-sm font-bold text-[#475569]">
        Saved origin:{" "}
        <span className="text-[#0F172A]">
          {previewAddress || "No company base address set"}
        </span>
      </p>

      {saveState.message ? (
        <p
          className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${
            saveState.status === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-blue-200 bg-blue-50 text-blue-800"
          }`}
        >
          {saveState.message}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button
          className="rounded-[10px] border border-[#CBD5E1] px-4 py-3 text-sm font-black text-[#334155] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canEdit || saveState.status === "saving"}
          onClick={() => {
            setForm(readCompanyForm(null));
            setSearchText("");
            setSuggestions([]);
          }}
          type="button"
        >
          Clear
        </button>
        <button
          className="rounded-[10px] bg-[#2563EB] px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          disabled={!canEdit || saveState.status === "saving"}
          type="submit"
        >
          {saveState.status === "saving" ? "Saving..." : "Save Company Base Address"}
        </button>
      </div>
    </form>
  );
}

function SettingsInput({
  label,
  value,
  onChange,
  disabled,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
}) {
  return (
    <label>
      <span className="text-sm font-bold text-[#334155]">{label}</span>
      <input
        className="mt-2 w-full rounded-[10px] border border-[#CBD5E1] bg-[#F8FAFC] px-4 py-3 text-base text-[#0F172A] outline-none focus:border-[#2563EB] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}
