import { ServiceRequestsInbox } from "@/components/dashboard/ServiceRequestsInbox";

export default function DashboardLeadsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-3">
      <header className="px-1">
        <h1 className="text-2xl font-black tracking-tight text-[#0F172A]">
          Jobs
        </h1>
      </header>

      <ServiceRequestsInbox />
    </div>
  );
}
