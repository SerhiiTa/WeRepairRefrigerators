"use client";

import { useEffect, useState } from "react";

import {
  formatDashboardIdentityLabel,
  loadDashboardIdentity,
  type DashboardIdentityLoadResult,
} from "@/lib/dashboard/identity";

type IdentityOverviewState =
  | {
      status: "loading";
      data: null;
      error: null;
    }
  | {
      status: "ready";
      data: DashboardIdentityLoadResult;
      error: null;
    }
  | {
      status: "error";
      data: null;
      error: string;
    };

const IDENTITY_LOAD_TIMEOUT_MS = 8000;

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not completed";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getRelatedStateLabel(status: string): string {
  if (status === "loaded") {
    return "Loaded from Supabase";
  }

  if (status === "empty") {
    return "No record yet";
  }

  if (status === "rls_limited") {
    return "Restricted by RLS";
  }

  if (status === "error") {
    return "Unable to load";
  }

  return "Not applicable";
}

export function DashboardIdentityOverview() {
  const [state, setState] = useState<IdentityOverviewState>({
    status: "loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function refreshIdentity() {
      try {
        const data = await withTimeout(
          loadDashboardIdentity(),
          IDENTITY_LOAD_TIMEOUT_MS,
        );

        if (!isMounted) {
          return;
        }

        setState({ status: "ready", data, error: null });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setState({
          status: "error",
          data: null,
          error:
            error instanceof Error
              ? error.message
              : "Dashboard identity failed to load.",
        });
      }
    }

    void refreshIdentity();

    return () => {
      isMounted = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <section className="rounded-lg border border-white/10 bg-slate-900 p-5">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-cyan-200">
          Real account data
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Loading Supabase session, profile, company, and technician context.
        </p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-5 text-amber-100">
        <p className="text-sm font-black uppercase tracking-[0.18em]">
          Real account data
        </p>
        <p className="mt-3 text-sm leading-6">{state.error}</p>
      </section>
    );
  }

  const { data } = state;

  if (data.status !== "ready") {
    return (
      <section className="rounded-lg border border-white/10 bg-slate-900 p-5">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-cyan-200">
          Real account data
        </p>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Dashboard identity is not ready:{" "}
          {formatDashboardIdentityLabel(data.status)}.
        </p>
      </section>
    );
  }

  const profile = data.profile;
  const company = data.company.data;
  const membership = data.companyMembership.data;
  const technicianProfile = data.technicianProfile.data;
  const roleContext = getRoleContext(data);

  const cards = [
    {
      label: "Workspace view",
      value: roleContext.value,
      helper: roleContext.helper,
    },
    {
      label: "Signed in as",
      value: profile.email ?? "Email unavailable",
      helper: `Profile ID ${profile.id.slice(0, 8)}...`,
    },
    {
      label: "Profile state",
      value: `${formatDashboardIdentityLabel(profile.role)} / ${formatDashboardIdentityLabel(profile.status)}`,
      helper: `Onboarding: ${formatDashboardIdentityLabel(profile.onboarding_status)} (${formatDateTime(profile.onboarding_completed_at)})`,
    },
    {
      label: "Company context",
      value: company?.name ?? getRelatedStateLabel(data.company.status),
      helper: company
        ? `${formatDashboardIdentityLabel(company.status)} company in ${company.primary_city ?? "service area not set"}, ${company.primary_state}`
        : data.company.error ?? "No company is linked to this profile yet.",
    },
    {
      label: "Membership visibility",
      value: membership
        ? `${formatDashboardIdentityLabel(membership.member_role)} / ${formatDashboardIdentityLabel(membership.member_status)}`
        : getRelatedStateLabel(data.companyMembership.status),
      helper:
        data.companyMembership.error ??
        "Raw membership rows are intentionally limited when the account cannot manage company members.",
    },
    {
      label: "Technician profile",
      value:
        technicianProfile?.display_name ??
        technicianProfile?.business_name ??
        getRelatedStateLabel(data.technicianProfile.status),
      helper: technicianProfile
        ? `${formatDashboardIdentityLabel(technicianProfile.technician_status)} | ${technicianProfile.service_zip_codes.length} ZIPs | ${technicianProfile.specialties.length} specialties`
        : data.technicianProfile.error ??
          "Create or update a technician profile during onboarding.",
    },
    {
      label: "Marketplace mode",
      value: technicianProfile?.marketplace_enabled
        ? "Marketplace enabled"
        : "Not enabled yet",
      helper: technicianProfile?.public_profile_ready
        ? "Public technician profile is ready for future marketplace publishing."
        : "Public profile publishing remains gated by technician status and review.",
    },
  ];

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-cyan-200">
          Real account data
        </p>
        <h2 className="mt-2 text-xl font-bold text-white">
          Supabase identity and onboarding context
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          These cards are loaded from the authenticated Supabase session and RLS
          protected profile/onboarding tables. Marketplace operations below are
          still demo data.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.label}
            className="rounded-lg border border-white/10 bg-slate-900 p-5"
          >
            <p className="text-sm font-medium text-slate-400">{card.label}</p>
            <p className="mt-3 break-words text-2xl font-bold tracking-tight text-white">
              {card.value}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {card.helper}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function getRoleContext(data: Extract<DashboardIdentityLoadResult, { status: "ready" }>) {
  const { profile, company, technicianProfile } = data;

  if (profile.role === "admin") {
    return {
      value: "Admin-capable account",
      helper:
        "Admin-specific tools are still placeholders. Current dashboard data remains RLS-scoped and mock operations are labeled separately.",
    };
  }

  if (profile.role === "company_owner") {
    return {
      value: "Company owner workspace",
      helper: company.data
        ? `Company context loaded for ${company.data.name}. Team, leads, coverage, and analytics are still preview workflows.`
        : "Company owner account is active, but company details were not readable in this RLS context.",
    };
  }

  if (
    profile.role === "technician" ||
    profile.role === "verified_technician" ||
    profile.role === "expert_technician"
  ) {
    return {
      value: "Technician workspace",
      helper: technicianProfile.data
        ? `Technician profile is ${formatDashboardIdentityLabel(technicianProfile.data.technician_status)} with ${technicianProfile.data.specialties.length} specialties configured.`
        : "No technician profile is readable yet. Complete technician onboarding before enabling real marketplace workflows.",
    };
  }

  return {
    value: "Dashboard role unavailable",
    helper:
      "Customer and inactive account states should be redirected before dashboard content renders.",
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("Dashboard identity loading timed out."));
      }, timeoutMs);
    }),
  ]);
}
