import { ServiceRequestDetail } from "@/components/dashboard/ServiceRequestDetail";

type DashboardLeadDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DashboardLeadDetailPage({
  params,
}: DashboardLeadDetailPageProps) {
  const { id } = await params;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ServiceRequestDetail requestId={id} />
    </div>
  );
}
