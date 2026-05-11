import { AnalyticsOverview } from "@/components/dashboard/AnalyticsOverview";
import { DashboardNotice } from "@/components/dashboard/DashboardNotice";
import { mockMarketplaceAnalyticsLeads } from "@/data/mock-analytics";

export default function DashboardAnalyticsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_34%),#0f172a] p-6">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-200">
          Marketplace analytics
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Lead source analytics and marketplace insights.
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-300">
              Preview where refrigerator repair requests originate, how technicians convert demand,
              and which ZIPs are busiest before real analytics or paid leads exist.
            </p>
          </div>
          <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-100">
            Mock analytics only
          </div>
        </div>
      </section>

      <DashboardNotice tone="amber">
        Analytics shown here are demonstration data for the future marketplace CRM.
      </DashboardNotice>

      <AnalyticsOverview leads={mockMarketplaceAnalyticsLeads} />
    </div>
  );
}
