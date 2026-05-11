import { PublicSiteHeader } from "@/components/public/PublicSiteHeader";
import { ServiceRequestFlow } from "@/components/public/ServiceRequestFlow";
import { getPublicTechnicians } from "@/lib/public-seo-data";
import { buildSeoPageMetadata, toNextMetadata } from "@/lib/seo-utils";
import type { ServiceRequestFormValues } from "@/components/public/ServiceRequestForm";

type ScheduleServicePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata = toNextMetadata(
  buildSeoPageMetadata({
    titleParts: ["Schedule refrigerator service", "Houston"],
    description:
      "Preview the WeRepairRefrigerators public service request intake for Houston refrigerator repair.",
    canonicalPath: "/schedule-service",
    keywords: ["schedule refrigerator service", "Houston refrigerator repair", "book repair"],
    kind: "service",
  }),
);

function getParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function applianceTypeFromService(service: string) {
  const normalizedService = service.toLowerCase();

  if (normalizedService.includes("ice-machine") || normalizedService.includes("ice machine")) {
    return "Ice machine";
  }

  if (normalizedService.includes("ice-maker") || normalizedService.includes("ice maker")) {
    return "Refrigerator ice maker";
  }

  if (normalizedService.includes("wine")) {
    return "Wine cooler";
  }

  if (normalizedService.includes("built-in")) {
    return "Built-in refrigerator";
  }

  return "Refrigerator";
}

export default async function ScheduleServicePage({ searchParams }: ScheduleServicePageProps) {
  const resolvedSearchParams = await searchParams;
  const service = getParam(resolvedSearchParams, "service");
  const brand = getParam(resolvedSearchParams, "brand");
  const technician = getParam(resolvedSearchParams, "technician");
  const zip = getParam(resolvedSearchParams, "zip");
  const technicians = getPublicTechnicians();

  const initialValues: ServiceRequestFormValues = {
    zipCode: zip,
    applianceType: applianceTypeFromService(service),
    brand: brand || "Other / Not sure",
    issueDescription: "",
    preferredServiceWindow: "First available",
    technicianPreference: technician,
    customerFirstName: "",
    phone: "",
  };

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicSiteHeader />
      <section className="border-y border-blue-100 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_34%),#eff6ff]">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <p className="text-sm font-black uppercase tracking-[0.24em] text-blue-700">
            Unified intake
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
            Schedule Houston refrigerator repair service.
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600">
            Use one preview flow for scheduling service, requesting a technician, booking repair,
            or contacting the marketplace from public pages.
          </p>
        </div>
      </section>
      <ServiceRequestFlow initialValues={initialValues} technicians={technicians} />
    </main>
  );
}
