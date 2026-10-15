import { CommunicationLeadDetail } from "@/components/dashboard/communications/CommunicationLeadsWorkspace";

type DashboardCommunicationLeadDetailPageProps = {
  searchParams: Promise<{ returnTo?: string | string[] }>;
  params: Promise<{
    leadId: string;
  }>;
};

export default async function DashboardCommunicationLeadDetailPage({
  params,
  searchParams,
}: DashboardCommunicationLeadDetailPageProps) {
  const { leadId } = await params;

  const { returnTo } = await searchParams;
  return <CommunicationLeadDetail leadId={leadId} returnTo={typeof returnTo === "string" ? returnTo : undefined} />;
}
