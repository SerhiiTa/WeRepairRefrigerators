import Link from "next/link";

import { DashboardLeadPreview } from "@/components/dashboard/DashboardLeadPreview";
import { mapSearchParamsToMarketplaceLead } from "@/lib/intake-to-lead";

type DashboardLeadPreviewPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardLeadPreviewPage({
  searchParams,
}: DashboardLeadPreviewPageProps) {
  const lead = mapSearchParamsToMarketplaceLead(await searchParams);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_34%),#0f172a] p-6">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-200">
          Lead preview
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Public intake to dashboard lead preview.
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-300">
              This preview demonstrates how marketplace requests will appear in the CRM.
            </p>
          </div>
          <Link
            className="inline-flex justify-center rounded-md bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
            href="/dashboard/leads"
          >
            Open Lead Inbox
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
        This route displays only transient mock preview data from the public intake flow. No lead is
        stored, no customer is contacted, and no repair case is created.
      </section>

      <DashboardLeadPreview lead={lead} />
    </div>
  );
}
