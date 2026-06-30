import { DashboardCustomerDetail } from "@/components/dashboard/DashboardCustomers";

type CustomerDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { id } = await params;

  return <DashboardCustomerDetail customerId={id} />;
}
