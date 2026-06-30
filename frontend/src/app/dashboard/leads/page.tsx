import { DashboardNotice } from "@/components/dashboard/DashboardNotice";
import { ServiceRequestsInbox } from "@/components/dashboard/ServiceRequestsInbox";

export default function DashboardLeadsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#0F6BFF]">
          Jobs inbox
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-[#0F172A]">
              Technician job board
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-[#64748B]">
              Triage customer requests, open job workspaces, book appointments,
              create estimates and invoices, and keep daily refrigerator repair
              work moving.
            </p>
          </div>
          <div className="rounded-[10px] border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-[#0F6BFF]">
            Live jobs
          </div>
        </div>
      </section>

      <DashboardNotice tone="amber">
        Use this board to triage new requests, open job workspaces, and keep
        daily repair work moving from one screen.
      </DashboardNotice>

      <ServiceRequestsInbox />
    </div>
  );
}
