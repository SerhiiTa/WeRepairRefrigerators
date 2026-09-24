import { IntakeInbox } from "@/components/dashboard/intake/IntakeInbox";

type DashboardIntakePageProps = {
  searchParams?: Promise<{
    returnTo?: string | string[];
    selected?: string | string[];
  }>;
};

function getSafeDashboardReturnTo(value: string | string[] | undefined): string | null {
  const returnTo = Array.isArray(value) ? value[0] : value;

  if (!returnTo) {
    return null;
  }

  if (
    /^\/dashboard(?:\/|\?|$)/.test(returnTo) &&
    !returnTo.startsWith("//") &&
    !returnTo.includes("://")
  ) {
    return returnTo;
  }

  return null;
}

function getSingleValue(value: string | string[] | undefined): string | null {
  const singleValue = Array.isArray(value) ? value[0] : value;
  return singleValue && singleValue.trim().length > 0 ? singleValue : null;
}

export default async function DashboardIntakePage({
  searchParams,
}: DashboardIntakePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const returnTo = getSafeDashboardReturnTo(resolvedSearchParams?.returnTo);
  const selectedId = getSingleValue(resolvedSearchParams?.selected);

  return <IntakeInbox returnTo={returnTo} selectedRequestId={selectedId} />;
}
