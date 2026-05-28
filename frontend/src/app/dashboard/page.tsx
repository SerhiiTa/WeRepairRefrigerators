import Link from "next/link";

import { MetricCard } from "@/components/MetricCard";
import { DashboardIdentityOverview } from "@/components/dashboard/DashboardIdentityOverview";
import { RepairCasesTable } from "@/components/dashboard/RepairCasesTable";

const metrics = [
  {
    label: "Open repair cases",
    value: "12",
    helper: "Cases waiting on diagnosis, technician notes, or customer approval.",
  },
  {
    label: "AI article drafts",
    value: "7",
    helper: "Repair stories ready for review before local SEO publishing.",
  },
  {
    label: "Technician profiles",
    value: "4",
    helper: "Houston-area technicians prepared for the MVP directory.",
  },
];

const realWorkflowCards = [
  {
    title: "Leads",
    href: "/dashboard/leads",
    description:
      "Review real schedule-service requests saved in Supabase and scoped by RLS.",
  },
  {
    title: "Technician Profile",
    href: "/dashboard/technician-profile",
    description:
      "Manage the authenticated technician profile that powers public marketplace visibility.",
  },
];

const contentCards = [
  {
    title: "AI Articles",
    description:
      "Review generated repair content before publishing refrigerator repair pages for local search.",
  },
  {
    title: "Technicians",
    description:
      "Keep profiles simple for now: service areas, refrigerator specialties, and trust details.",
  },
  {
    title: "Settings",
    description:
      "Future home for account, security, and workspace preferences. Auth and profile state now load from Supabase; deeper settings remain planned.",
  },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_34%),#0f172a] p-6">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-200">
          Overview
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Manage Houston refrigerator repair operations from one shell.
            </h2>
            <p className="mt-3 max-w-3xl leading-7 text-slate-300">
              Real Supabase Auth, profile, onboarding, company, and technician
              context now appear in the dashboard shell. The Leads inbox reads
              real saved service requests; repair cases, analytics, and job
              boards remain preview data until the next persistence phase.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex justify-center rounded-md border border-white/15 px-4 py-2.5 text-sm font-bold text-white transition hover:border-cyan-300 hover:bg-white/5"
          >
            View homepage
          </Link>
        </div>
      </section>

      <DashboardIdentityOverview />

      <section className="grid gap-5 lg:grid-cols-2">
        {realWorkflowCards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-5 transition hover:border-cyan-200/50 hover:bg-cyan-300/15"
          >
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100">
              Real CRM workflow
            </p>
            <h2 className="mt-3 text-xl font-bold text-white">{card.title}</h2>
            <p className="mt-3 leading-7 text-cyan-50/80">{card.description}</p>
          </Link>
        ))}
      </section>

      <div>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-cyan-200">
          Preview operations data
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          These cards still use local demo datasets. They are intentionally separate from
          the real account/session and service request data above.
        </p>
      </div>

      <section className="grid gap-5 md:grid-cols-3">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <RepairCasesTable />

      <section className="grid gap-5 lg:grid-cols-3">
        {contentCards.map((card) => (
          <article key={card.title} className="rounded-lg border border-white/10 bg-slate-900 p-5">
            <h2 className="text-lg font-bold text-white">{card.title}</h2>
            <p className="mt-3 leading-7 text-slate-400">{card.description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
