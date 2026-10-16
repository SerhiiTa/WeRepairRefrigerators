import { ServiceRequestsInbox } from "@/components/dashboard/ServiceRequestsInbox";

export default async function DashboardLeadsPage({ searchParams }: { searchParams: Promise<{ newJob?: string; conversationId?: string; customerId?: string }> }) {
  const query = await searchParams;
  return (
    <div className="w-full space-y-3">
      <header className="px-1">
        <h1 className="text-2xl font-black tracking-tight text-[#0F172A]">
          Jobs
        </h1>
      </header>

      <ServiceRequestsInbox initialNewJob={query.newJob === "1" && !query.conversationId && !query.customerId} />
    </div>
  );
}
