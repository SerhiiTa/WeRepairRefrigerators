import { ServiceRequestDetail } from "@/components/dashboard/ServiceRequestDetail";

type DashboardLeadDetailPageProps = {
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
    return "/dashboard/leads";
  }

  if (
    /^\/dashboard(?:\/|\?|$)/.test(returnTo) &&
    !returnTo.startsWith("//") &&
    !returnTo.includes("://")
  ) {
    return returnTo;
  }

  return "/dashboard/leads";
}

export default async function DashboardLeadDetailPage({
  params,
  searchParams,
}: DashboardLeadDetailPageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const returnTo = getSafeDashboardReturnTo(resolvedSearchParams?.returnTo);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ServiceRequestDetail requestId={id} returnTo={returnTo} />
    </div>
  );
}
