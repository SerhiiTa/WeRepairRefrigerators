import { DashboardNotice } from "@/components/dashboard/DashboardNotice";
import { ServiceRequestsInbox } from "@/components/dashboard/ServiceRequestsInbox";

export default function DashboardLeadsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_34%),#0f172a] p-6">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-200">
          Service requests
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Review real customer requests from public intake.
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-300">
              Triage saved schedule-service submissions, review customer contact details, and see
              selected technician context from public profile requests.
            </p>
          </div>
          <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-100">
            Supabase-backed
          </div>
        </div>
      </section>

      <DashboardNotice tone="amber">
        Status updates and repair case conversion are intentionally deferred until a safe
        server-side workflow is added. This page reads real service requests through RLS.
      </DashboardNotice>

      <ServiceRequestsInbox />
    </div>
  );
}
