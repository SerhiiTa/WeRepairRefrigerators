import { CommunicationLeadEdit } from "@/components/dashboard/communications/CommunicationLeadsWorkspace";

type DashboardCommunicationLeadEditPageProps = {
  params: Promise<{
    leadId: string;
  }>;
};

export default async function DashboardCommunicationLeadEditPage({
  params,
}: DashboardCommunicationLeadEditPageProps) {
  const { leadId } = await params;

  return <CommunicationLeadEdit leadId={leadId} />;
}
