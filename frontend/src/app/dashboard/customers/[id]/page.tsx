import { DashboardCustomerDetail } from "@/components/dashboard/DashboardCustomers";

type CustomerDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    returnTo?: string | string[];
  }>;
};

function getSafeDashboardReturnTo(value: string | string[] | undefined): string {
  const returnTo = Array.isArray(value) ? value[0] : value;

  if (!returnTo) {
    return "/dashboard/customers";
  }

  if (
    /^\/dashboard(?:\/|\?|$)/.test(returnTo) &&
    !returnTo.startsWith("//") &&
    !returnTo.includes("://")
  ) {
    return returnTo;
  }

  return "/dashboard/customers";
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: CustomerDetailPageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const returnTo = getSafeDashboardReturnTo(resolvedSearchParams?.returnTo);

  return <DashboardCustomerDetail customerId={id} returnTo={returnTo} />;
}
