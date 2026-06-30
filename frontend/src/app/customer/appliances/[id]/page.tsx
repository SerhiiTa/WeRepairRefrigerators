import { CustomerApplianceDetailShell } from "@/components/customer/CustomerApplianceDetailShell";

export const metadata = {
  title: "Customer appliance | WeRepairRefrigerators",
  description: "Review appliance details and start a repair request.",
};

export default async function CustomerApplianceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <CustomerApplianceDetailShell applianceId={id} />;
}
