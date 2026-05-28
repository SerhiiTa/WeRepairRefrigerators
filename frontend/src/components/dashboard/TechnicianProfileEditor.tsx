"use client";

import { useEffect, useState } from "react";

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
  idle: "border-blue-300/20 bg-blue-300/10 text-blue-100",
  success: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
  error: "border-rose-300/25 bg-rose-300/10 text-rose-100",
};

const schemaSupportedFields = [
  "display_name",
  "business_name",
  "years_experience",
  "service_summary_public",
  "bio_private",
  "primary_city",
  "primary_state",
  "service_zip_codes",
  "specialties",
  "languages",
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
  const [specialties, setSpecialties] = useState("");
  const [languages, setLanguages] = useState("en");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({
    tone: "idle",
    message:
      "This editor uses the current authenticated Supabase session and only writes fields present in the applied technician_profiles schema.",
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
        setSpecialties(joinList(technicianProfile.specialties));
        setLanguages(joinList(technicianProfile.languages));
      }
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

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
        ? "Attempting RLS-protected technician profile update..."
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
      specialties: splitList(specialties),
      languages: splitList(languages),
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
        ? "Technician profile saved through the current RLS path."
        : "Draft technician profile created.",
    });
    setIsSubmitting(false);
  }

  if (editorState.status === "loading") {
    return (
      <section className="mx-auto max-w-5xl rounded-lg border border-white/10 bg-slate-900 p-6">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-cyan-200">
          Technician profile
        </p>
        <p className="mt-3 text-slate-400">
          Loading your authenticated technician profile...
        </p>
      </section>
    );
  }

  if (editorState.status === "unavailable") {
    return (
      <section className="mx-auto max-w-5xl rounded-lg border border-amber-300/20 bg-amber-300/10 p-6 text-amber-100">
        <p className="text-sm font-black uppercase tracking-[0.18em]">
          Technician profile unavailable
        </p>
        <p className="mt-3 leading-7">{editorState.error}</p>
      </section>
    );
  }

  const profile = editorState.profile;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_34%),#0f172a] p-6">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-200">
          Real technician profile
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Manage your technician profile.
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-300">
              This page reads and writes through your authenticated Supabase
              session and the current `technician_profiles` RLS policies. No
              service-role key or admin bypass is used.
            </p>
          </div>
          <div className="rounded-md border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
            <p>
              Status:{" "}
              <span className="font-bold text-white">
                {profile
                  ? formatDashboardIdentityLabel(profile.technician_status)
                  : "No profile yet"}
              </span>
            </p>
            <p className="mt-1">
              Public profile:{" "}
              <span className="font-bold text-white">
                {profile?.public_profile_ready ? "Ready" : "Not ready"}
              </span>
            </p>
          </div>
        </div>
      </section>

      {!profile ? (
        <section className="rounded-lg border border-blue-300/20 bg-blue-300/10 p-5 text-blue-100">
          <p className="text-sm font-black uppercase tracking-[0.18em]">
            Empty state
          </p>
          <h2 className="mt-2 text-xl font-bold text-white">
            No technician profile exists yet.
          </h2>
          <p className="mt-2 leading-7 text-blue-100/80">
            The current applied RLS permits active technician, company owner, or
            admin roles to create their own draft technician profile with
            marketplace and public visibility turned off.
          </p>
        </section>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-white/10 bg-slate-900 p-6"
      >
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
            label="Specialties"
            value={specialties}
            onChange={setSpecialties}
            placeholder="Sealed system, Sub-Zero, ice maker"
          />
          <DashboardTextInput
            label="Languages"
            value={languages}
            onChange={setLanguages}
            placeholder="en, es"
          />
          <div className="rounded-md border border-white/10 bg-slate-950/45 px-4 py-3 text-sm text-slate-300">
            <p className="font-bold text-white">Read-only visibility fields</p>
            <p className="mt-2">
              Marketplace enabled:{" "}
              <span className="font-bold text-white">
                {profile?.marketplace_enabled ? "Yes" : "No"}
              </span>
            </p>
            <p className="mt-1">
              Affiliation:{" "}
              <span className="font-bold text-white">
                {formatDashboardIdentityLabel(
                  profile?.affiliation_type ?? "independent",
                )}
              </span>
            </p>
          </div>
          <DashboardTextArea
            label="Public service summary"
            value={serviceSummaryPublic}
            onChange={setServiceSummaryPublic}
            placeholder="Customer-safe repair focus for future public profile use."
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
          <p className="text-sm leading-6 text-slate-500">
            Existing profile updates may be blocked until a reviewed
            column-safe update policy or trusted RPC is added.
          </p>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex justify-center rounded-md bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
          >
            {isSubmitting
              ? "Saving..."
              : profile
                ? "Save Profile"
                : "Create Draft Profile"}
          </button>
        </div>
      </form>

      <section className="rounded-lg border border-white/10 bg-slate-900 p-5">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
          Current schema fields
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {schemaSupportedFields.map((field) => (
            <span
              key={field}
              className="rounded-full border border-white/10 bg-slate-950 px-3 py-1 text-xs font-bold text-slate-300"
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
      <span className="text-sm font-bold text-slate-200">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        maxLength={maxLength}
        className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10"
        placeholder={placeholder}
      />
    </label>
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
      <span className="text-sm font-bold text-slate-200">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        className="mt-2 w-full resize-y rounded-md border border-white/10 bg-slate-950 px-4 py-3 text-base leading-7 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300 focus:ring-4 focus:ring-cyan-300/10"
        placeholder={placeholder}
      />
    </label>
  );
}
