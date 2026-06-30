import { CustomerRepairDetailShell } from "@/components/customer/CustomerRepairDetailShell";

type CustomerRepairDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const metadata = {
  title: "Repair details | WeRepairRefrigerators",
  description: "View and update customer repair request details.",
};

export default async function CustomerRepairDetailPage({
  params,
}: CustomerRepairDetailPageProps) {
  const { id } = await params;

  return <CustomerRepairDetailShell repairReference={id} />;
}
