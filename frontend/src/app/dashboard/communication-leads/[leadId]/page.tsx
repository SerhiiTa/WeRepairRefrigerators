import { CommunicationLeadDetail } from "@/components/dashboard/communications/CommunicationLeadsWorkspace";

type DashboardCommunicationLeadDetailPageProps = {
  params: Promise<{
    leadId: string;
  }>;
};

export default async function DashboardCommunicationLeadDetailPage({
  params,
}: DashboardCommunicationLeadDetailPageProps) {
  const { leadId } = await params;

  return <CommunicationLeadDetail leadId={leadId} />;
}
