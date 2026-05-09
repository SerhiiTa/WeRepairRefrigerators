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
    <main className="min-h-screen bg-slate-950 text-white">
      <PublicPageHeader
        eyebrow="Service page"
        title={`${service.name} in Houston`}
        description={service.description}
      />
      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-16 lg:grid-cols-[1fr_22rem]">
        <article className="rounded-lg border border-white/10 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold tracking-tight text-white">Service overview</h2>
          <p className="mt-4 leading-8 text-slate-300">{service.summary}</p>
          <p className="mt-4 leading-8 text-slate-300">
            This route is ready for future AI-assisted SEO content generated from approved,
            privacy-safe repair case data.
          </p>
        </article>
        <PublicRelatedLinks links={getRelatedLinks({ currentSlug: service.slug })} />
      </section>
      <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-16 lg:grid-cols-2">
        <PublicRepairProcess steps={publicRepairProcessSteps} />
        <PublicFaqSection faqs={publicFaqs} />
      </section>
      <PublicCtaSection />
    </main>
  );
}
