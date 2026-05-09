import { notFound } from "next/navigation";

import { PublicCtaSection } from "@/components/public/PublicCtaSection";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { PublicFaqSection } from "@/components/public/sections/PublicFaqSection";
import { PublicRelatedLinks } from "@/components/public/sections/PublicRelatedLinks";
import {
  findPublicItem,
  getRelatedLinks,
  publicFaqs,
  publicRepairProcessSteps,
  publicServices,
} from "@/lib/public-seo-data";
import { PublicRepairProcess } from "@/components/public/sections/PublicRepairProcess";
import { buildSeoPageMetadata, toNextMetadata } from "@/lib/seo-utils";

type ServicePageProps = {
  params: Promise<{
    service: string;
  }>;
};

export function generateStaticParams() {
  return publicServices.map((service) => ({
    service: service.slug,
  }));
}

export async function generateMetadata({ params }: ServicePageProps) {
  const { service: serviceSlug } = await params;
  const service = findPublicItem(publicServices, serviceSlug);

  if (!service) {
    return {};
  }

  return toNextMetadata(
    buildSeoPageMetadata({
      titleParts: [service.name, "Houston refrigerator repair"],
      description: service.description,
      canonicalPath: `/services/${service.slug}`,
      keywords: [service.name, "Houston", "refrigerator repair"],
      kind: "service",
    }),
  );
}

export default async function ServicePage({ params }: ServicePageProps) {
  const { service: serviceSlug } = await params;
  const service = findPublicItem(publicServices, serviceSlug);

  if (!service) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicPageHeader
        eyebrow="Service page"
        title={`${service.name} in Houston`}
        description={service.description}
        variant="light"
      />
      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-16 lg:grid-cols-[1fr_22rem]">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-blue-950/5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
            Repair category
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
            Service overview
          </h2>
          <p className="mt-4 leading-8 text-slate-600">{service.summary}</p>
          <p className="mt-4 leading-8 text-slate-600">
            This route is ready for future AI-assisted SEO content generated from approved,
            privacy-safe repair case data.
          </p>
          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
            <h3 className="font-black text-blue-950">When to call a technician</h3>
            <p className="mt-2 leading-7 text-slate-600">
              If cooling loss, leaking, electrical faults, or sealed-system symptoms continue
              after basic checks, schedule service instead of continuing risky troubleshooting.
            </p>
          </div>
        </article>
        <PublicRelatedLinks links={getRelatedLinks({ currentSlug: service.slug })} variant="light" />
      </section>
      <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-16 lg:grid-cols-2">
        <PublicRepairProcess steps={publicRepairProcessSteps} variant="light" />
        <PublicFaqSection faqs={publicFaqs} variant="light" />
      </section>
      <PublicCtaSection
        title={`Need ${service.name.toLowerCase()} in Houston?`}
        description="Review the repair category, compare related pages, and schedule service when the appliance needs hands-on diagnosis."
        variant="light"
      />
    </main>
  );
}
