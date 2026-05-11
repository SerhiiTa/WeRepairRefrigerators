import { LeadInbox } from "@/components/dashboard/LeadInbox";
import { getMarketplaceLeads } from "@/data/mock-leads";

export default function DashboardLeadsPage() {
  const leads = getMarketplaceLeads();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_34%),#0f172a] p-6">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-200">
          Marketplace leads
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Review technician requests from public discovery.
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-300">
              Triage mock ZIP-based service requests, review privacy-safe lead details, and test
              local-only status actions before real marketplace persistence exists.
            </p>
          </div>
          <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-100">
            Mock inbox only
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
        In the live version, marketplace requests can be reviewed and converted into repair cases.
        This page does not store leads, contact customers, or modify repair case data.
      </section>

      <LeadInbox leads={leads} />
    </div>
  );
}
