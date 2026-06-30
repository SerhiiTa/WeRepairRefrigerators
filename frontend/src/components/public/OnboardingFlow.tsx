"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  completeOnboarding,
  createCompanyAndOwnerMembership,
  updateBasicProfile,
  updateTechnicianProfile,
} from "@/server/onboarding/actions";
import {
  isDashboardOnboardingStatusSatisfied,
  sanitizeRedirectPath,
} from "@/lib/auth/dashboard-access";
import type { OnboardingActionError } from "@/server/onboarding/types";
import { getCurrentUserProfile } from "@/lib/auth/profile";
import type { ProfileRow, TechnicianProfileRow } from "@/lib/supabase/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type OnboardingPath = "customer" | "independent_technician" | "company_owner";
type LoadState =
  | { status: "loading"; profile: null; error: null }
  | { status: "logged_out"; profile: null; error: null }
  | { status: "error"; profile: null; error: string }
  | { status: "ready"; profile: ProfileRow; error: null };
type SubmitState =
  | { tone: "idle"; message: string }
  | { tone: "success"; message: string }
  | { tone: "error"; message: string };

const pathOptions: Array<{
  value: OnboardingPath;
  title: string;
  description: string;
}> = [
  {
    value: "customer",
    title: "Customer",
    description: "Finish a customer account for future request tracking.",
  },
  {
    value: "independent_technician",
    title: "Independent technician",
    description: "Create a draft technician profile with service areas.",
  },
  {
    value: "company_owner",
    title: "Company owner",
    description: "Create a company and owner membership for the CRM.",
  },
];

const applianceSpecialties = [
  "Refrigerator repair",
  "Built-in refrigeration",
  "Sealed system",
  "Ice maker",
  "Wine cooler",
  "Commercial refrigeration",
];

const stateToneClasses: Record<SubmitState["tone"], string> = {
  idle: "border-blue-100 bg-blue-50 text-blue-800",
  success: "border-emerald-100 bg-emerald-50 text-emerald-800",
  error: "border-red-100 bg-red-50 text-red-800",
};

function getDefaultPath(profile: ProfileRow | null): OnboardingPath {
  if (!profile) {
    return "customer";
  }

  if (profile.role === "company_owner" || profile.role === "admin") {
    return "company_owner";
  }

  if (
    profile.role === "technician" ||
    profile.role === "verified_technician" ||
    profile.role === "expert_technician"
  ) {
    return "independent_technician";
  }

  return "customer";
}

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

function formatError(error: OnboardingActionError): string {
  return error.details
    ? `${error.message} ${error.details}`
    : error.message;
}

function isTechnicianRole(profile: ProfileRow): boolean {
  return (
    profile.role === "technician" ||
    profile.role === "verified_technician" ||
    profile.role === "expert_technician"
  );
}

function isCustomerOnboardingSatisfied({
  role,
  selectedPath,
  onboardingStatus,
}: {
  role: ProfileRow["role"] | null;
  selectedPath: OnboardingPath;
  onboardingStatus: ProfileRow["onboarding_status"];
}): boolean {
  if (role === "customer" || selectedPath === "customer") {
    return (
      onboardingStatus === "customer_ready" || onboardingStatus === "complete"
    );
  }

  return isDashboardOnboardingStatusSatisfied({
    role,
    onboardingStatus,
  });
}

function getOnboardingRedirectPath({
  role,
  selectedPath,
  nextPath,
}: {
  role: ProfileRow["role"] | null;
  selectedPath: OnboardingPath;
  nextPath: string;
}): string {
  if (role === "customer" || selectedPath === "customer") {
    return nextPath.startsWith("/customer") ? nextPath : "/customer/dashboard";
  }

  return nextPath;
}

async function loadOwnTechnicianProfile(
  profileId: string,
): Promise<TechnicianProfileRow | null> {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("technician_profiles")
    .select(
      "id,profile_id,company_id,affiliation_type,display_name,business_name,years_experience,service_summary_public,bio_private,primary_city,primary_state,service_zip_codes,service_cities,appliance_categories,brands_serviced,specialties,languages,avatar_color,technician_status,marketplace_enabled,public_profile_ready,verification_submitted_at,verified_at,verified_by_profile_id,rejected_at,suspended_at,archived_by_profile_id,archived_at,created_at,updated_at",
    )
    .eq("profile_id", profileId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

export function OnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = sanitizeRedirectPath(searchParams.get("next"));
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    profile: null,
    error: null,
  });
  const [selectedPath, setSelectedPath] =
    useState<OnboardingPath>("customer");
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [serviceZipCodes, setServiceZipCodes] = useState("");
  const [bio, setBio] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [specialties, setSpecialties] = useState(applianceSpecialties.slice(0, 3).join(", "));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({
    tone: "idle",
    message:
      "This onboarding flow writes only the fields supported by the current dev/staging schema.",
  });

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      const result = await getCurrentUserProfile();

      if (!isMounted) {
        return;
      }

      if (result.status === "logged_out") {
        setLoadState({ status: "logged_out", profile: null, error: null });
        return;
      }

      if (result.status === "supabase_unavailable") {
        setLoadState({
          status: "error",
          profile: null,
          error: "Supabase is not configured in this browser session.",
        });
        return;
      }

      if (result.status === "profile_unavailable") {
        setLoadState({
          status: "error",
          profile: null,
          error:
            result.error ??
            "A session exists, but the matching profile row is unavailable.",
        });
        return;
      }

      const defaultPath = getDefaultPath(result.profile);

      setLoadState({ status: "ready", profile: result.profile, error: null });
      setSelectedPath(defaultPath);
      setFullName(result.profile.full_name ?? "");

      if (isTechnicianRole(result.profile)) {
        const technicianProfile = await loadOwnTechnicianProfile(
          result.profile.id,
        );

        if (!isMounted) {
          return;
        }

        if (technicianProfile) {
          setDisplayName(technicianProfile.display_name ?? "");
          setBio(
            technicianProfile.bio_private ??
              technicianProfile.service_summary_public ??
              "",
          );
          setYearsExperience(
            technicianProfile.years_experience === null
              ? ""
              : String(technicianProfile.years_experience),
          );
          setServiceZipCodes(technicianProfile.service_zip_codes.join(", "));
          setSpecialties(
            technicianProfile.specialties.length > 0
              ? technicianProfile.specialties.join(", ")
              : applianceSpecialties.slice(0, 3).join(", "),
          );
        }
      }

      if (
        isCustomerOnboardingSatisfied({
          role: result.profile.role,
          selectedPath: defaultPath,
          onboardingStatus: result.profile.onboarding_status,
        })
      ) {
        router.replace(
          getOnboardingRedirectPath({
            role: result.profile.role,
            selectedPath: defaultPath,
            nextPath,
          }),
        );
      }
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [nextPath, router]);

  const companySlug = useMemo(() => createSlug(companyName), [companyName]);
  const profile = loadState.profile;
  const canCreateCompany =
    profile?.role === "company_owner" || profile?.role === "admin";

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
      message: "Saving onboarding details...",
    });

    const accessToken = await getAccessToken();

    if (!accessToken) {
      setSubmitState({
        tone: "error",
        message: "Log in again before completing onboarding.",
      });
      setIsSubmitting(false);
      return;
    }

    const profileResult = await updateBasicProfile({
      accessToken,
      fullName,
    });

    if (!profileResult.ok) {
      setSubmitState({
        tone: "error",
        message: formatError(profileResult.error),
      });
      setIsSubmitting(false);
      return;
    }

    if (selectedPath === "company_owner") {
      const companyResult = await createCompanyAndOwnerMembership({
        accessToken,
        companyName,
        slug: companySlug,
        businessPhone: companyPhone,
        websiteUrl: companyWebsite,
      });

      if (!companyResult.ok) {
        setSubmitState({
          tone: "error",
          message: formatError(companyResult.error),
        });
        setIsSubmitting(false);
        return;
      }
    }

    if (selectedPath === "independent_technician") {
      const technicianResult = await updateTechnicianProfile({
        accessToken,
        displayName: displayName || fullName,
        yearsExperience: yearsExperience
          ? Number.parseInt(yearsExperience, 10)
          : undefined,
        serviceSummaryPublic: bio,
        bioPrivate: bio,
        primaryCity: "Houston",
        primaryState: "TX",
        serviceZipCodes: splitList(serviceZipCodes),
        specialties: splitList(specialties),
        languages: ["en"],
      });

      if (!technicianResult.ok) {
        setSubmitState({
          tone: "error",
          message: formatError(technicianResult.error),
        });
        setIsSubmitting(false);
        return;
      }
    }

    const completionResult = await completeOnboarding({ accessToken });

    if (!completionResult.ok) {
      setSubmitState({
        tone: "error",
        message: formatError(completionResult.error),
      });
      setIsSubmitting(false);
      return;
    }

    if (
      !isCustomerOnboardingSatisfied({
        role: profileResult.data.profile.role,
        selectedPath,
        onboardingStatus: completionResult.data.onboardingStatus,
      })
    ) {
      setSubmitState({
        tone: "error",
        message:
          completionResult.data.onboardingStatus ===
          "technician_profile_required"
            ? "Your account details were saved, but the technician profile was not created. Apply the Task 84 technician profile upsert RPC or fix the technician profile RLS policy before completing technician onboarding."
            : `Your account details were saved, but onboarding is still ${completionResult.data.onboardingStatus}. Dashboard access will remain blocked until this status is complete.`,
      });
      setIsSubmitting(false);
      return;
    }

    const redirectPath = getOnboardingRedirectPath({
      role: profileResult.data.profile.role,
      selectedPath,
      nextPath,
    });

    setSubmitState({
      tone: "success",
      message:
        redirectPath.startsWith("/customer")
          ? "Onboarding saved. Opening your customer dashboard..."
          : "Onboarding saved. Opening your dashboard...",
    });
    setIsSubmitting(false);
    router.replace(redirectPath);
    router.refresh();
  }

  if (loadState.status === "loading") {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
          Checking account
        </p>
        <p className="mt-3 text-slate-600">Loading your Supabase profile...</p>
      </div>
    );
  }

  if (loadState.status === "logged_out") {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
          Login required
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
          Log in before onboarding.
        </h1>
        <p className="mt-4 leading-7 text-slate-600">
          This setup flow writes to the dev/staging Supabase project, so it needs
          a real authenticated session.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent("/onboarding")}`}
          className="mt-6 inline-flex rounded-full bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800"
        >
          Go to login
        </Link>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="rounded-3xl border border-red-100 bg-red-50 p-6 text-red-900 shadow-xl shadow-slate-950/5">
        <p className="text-sm font-black uppercase tracking-[0.2em]">
          Onboarding unavailable
        </p>
        <p className="mt-3 leading-7">{loadState.error}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5 sm:p-8"
    >
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
            Real onboarding
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            Finish your account setup.
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-slate-600">
            Signed in as {profile?.email}. Role:{" "}
            <span className="font-bold text-slate-950">{profile?.role}</span>.
            Status:{" "}
            <span className="font-bold text-slate-950">{profile?.status}</span>.
          </p>
        </div>
        <Link
          href={
            profile?.role === "customer" || selectedPath === "customer"
              ? "/customer/dashboard"
              : "/dashboard"
          }
          className="inline-flex justify-center rounded-full border border-blue-200 bg-white px-5 py-3 text-sm font-black text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
        >
          Dashboard
        </Link>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">
          Choose setup path
        </h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {pathOptions.map((option) => (
            <label
              key={option.value}
              className={`flex gap-3 rounded-2xl border p-4 transition ${
                selectedPath === option.value
                  ? "border-blue-400 bg-blue-50"
                  : "border-slate-200 bg-slate-50 hover:border-blue-200"
              }`}
            >
              <input
                type="radio"
                name="path"
                value={option.value}
                checked={selectedPath === option.value}
                onChange={() => setSelectedPath(option.value)}
                className="mt-1 h-4 w-4 accent-blue-700"
              />
              <span>
                <span className="block text-sm font-black text-slate-950">
                  {option.title}
                </span>
                <span className="mt-1 block text-sm leading-6 text-slate-600">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-5">
        <div className="grid gap-5 md:grid-cols-2">
          <label>
            <span className="text-sm font-bold text-slate-800">Full name</span>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              placeholder="Your name"
            />
          </label>
          <label>
            <span className="text-sm font-bold text-slate-800">Phone</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              type="tel"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              placeholder="Optional for now"
            />
            <span className="mt-2 block text-xs font-bold text-slate-500">
              Phone is collected for future contact tables and is not stored in
              `profiles` yet.
            </span>
          </label>
        </div>

        {selectedPath === "company_owner" ? (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
            <div className="grid gap-5 md:grid-cols-2">
              <label>
                <span className="text-sm font-bold text-slate-800">
                  Company name
                </span>
                <input
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  required={selectedPath === "company_owner"}
                  className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  placeholder="Houston Refrigeration Co"
                />
              </label>
              <label>
                <span className="text-sm font-bold text-slate-800">
                  Company phone
                </span>
                <input
                  value={companyPhone}
                  onChange={(event) => setCompanyPhone(event.target.value)}
                  type="tel"
                  className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  placeholder="Optional"
                />
              </label>
              <label className="md:col-span-2">
                <span className="text-sm font-bold text-slate-800">
                  Company website
                </span>
                <input
                  value={companyWebsite}
                  onChange={(event) => setCompanyWebsite(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  placeholder="https://example.com"
                />
              </label>
              <label className="md:col-span-2">
                <span className="text-sm font-bold text-slate-800">
                  Company service ZIP codes
                </span>
                <input
                  value={serviceZipCodes}
                  onChange={(event) => setServiceZipCodes(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-blue-100 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  placeholder="77024, 77079, 77494"
                />
                <span className="mt-2 block text-xs font-bold text-blue-900/70">
                  Company service-area persistence is planned for a future
                  service area table.
                </span>
              </label>
            </div>
            <p className="mt-4 text-sm font-bold text-blue-900">
              Generated slug: {companySlug || "enter-company-name"}
            </p>
            {!canCreateCompany ? (
              <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                Company creation requires your profile role to be company_owner
                or admin. Public signup cannot grant this role.
              </p>
            ) : null}
          </div>
        ) : null}

        {selectedPath === "independent_technician" ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="grid gap-5 md:grid-cols-2">
              <label>
                <span className="text-sm font-bold text-slate-800">
                  Display name
                </span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  placeholder="Public technician name"
                />
              </label>
              <label>
                <span className="text-sm font-bold text-slate-800">
                  Years of experience
                </span>
                <input
                  value={yearsExperience}
                  onChange={(event) => setYearsExperience(event.target.value)}
                  type="number"
                  min="0"
                  max="80"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  placeholder="Optional"
                />
              </label>
              <label>
                <span className="text-sm font-bold text-slate-800">
                  Service ZIP codes
                </span>
                <input
                  value={serviceZipCodes}
                  onChange={(event) => setServiceZipCodes(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  placeholder="77024, 77079, 77494"
                />
              </label>
              <label>
                <span className="text-sm font-bold text-slate-800">
                  Specialties
                </span>
                <input
                  value={specialties}
                  onChange={(event) => setSpecialties(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  placeholder="Sealed system, Sub-Zero, ice maker"
                />
              </label>
              <label className="md:col-span-2">
                <span className="text-sm font-bold text-slate-800">
                  Bio / repair focus
                </span>
                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  rows={4}
                  className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base leading-7 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  placeholder="Briefly describe your refrigerator repair experience."
                />
              </label>
            </div>
            {profile?.status === "pending" ? (
              <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                Pending technician profiles may still be blocked by the current
                RLS helper. If this happens, promote the dev account to active
                before testing technician profile creation.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <div
        className={`mt-6 rounded-2xl border px-4 py-3 text-sm font-bold ${stateToneClasses[submitState.tone]}`}
      >
        {submitState.message}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-blue-700 px-5 py-3 text-base font-black text-white shadow-lg shadow-blue-700/20 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isSubmitting ? "Saving..." : "Complete onboarding"}
      </button>
    </form>
  );
}
