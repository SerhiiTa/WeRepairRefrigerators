import { notFound } from "next/navigation";

import { PublicCtaSection } from "@/components/public/PublicCtaSection";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { PublicFaqSection } from "@/components/public/sections/PublicFaqSection";
import { PublicRelatedLinks } from "@/components/public/sections/PublicRelatedLinks";
import {
  findPublicItem,
  getRelatedLinks,
  publicFaqs,
  publicLocations,
  publicRepairProcessSteps,
} from "@/lib/public-seo-data";
import { PublicRepairProcess } from "@/components/public/sections/PublicRepairProcess";
import { buildSeoPageMetadata, toNextMetadata } from "@/lib/seo-utils";

type LocationPageProps = {
  params: Promise<{
    city: string;
  }>;
};

export function generateStaticParams() {
  return publicLocations.map((location) => ({
    city: location.slug,
  }));
}

export async function generateMetadata({ params }: LocationPageProps) {
  const { city } = await params;
  const location = findPublicItem(publicLocations, city);

  if (!location) {
    return {};
  }

  return toNextMetadata(
    buildSeoPageMetadata({
      titleParts: [`${location.name} refrigerator repair`, "Houston MVP"],
      description: location.description,
      canonicalPath: `/locations/${location.slug}`,
      keywords: [location.name, "refrigerator repair", "Houston"],
      kind: "location",
    }),
  );
}

export default async function LocationPage({ params }: LocationPageProps) {
  const { city } = await params;
  const location = findPublicItem(publicLocations, city);

  if (!location) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicPageHeader
        eyebrow="Location page"
        title={`${location.name} refrigerator repair`}
        description={location.description}
        variant="light"
      />
      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-16 lg:grid-cols-[1fr_22rem]">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-blue-950/5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
            Service area
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
            Local refrigerator repair foundation
          </h2>
          <p className="mt-4 leading-8 text-slate-600">{location.summary}</p>
          <p className="mt-4 leading-8 text-slate-600">
            Future public pages can connect approved repair summaries to city and
            neighborhood intent while avoiding private customer data.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {["Local Houston market", "Brand and service links", "Public-safe summaries"].map((item) => (
              <span key={item} className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-black text-blue-800">
                {item}
              </span>
            ))}
          </div>
        </article>
        <PublicRelatedLinks links={getRelatedLinks({ currentSlug: location.slug })} variant="light" />
      </section>
      <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-16 lg:grid-cols-2">
        <PublicRepairProcess steps={publicRepairProcessSteps} variant="light" />
        <PublicFaqSection faqs={publicFaqs} variant="light" />
      </section>
      <PublicCtaSection
        title={`Refrigerator repair guidance for ${location.name}.`}
        description="Find location-specific repair information and move toward service when a refrigerator needs a professional diagnosis."
        variant="light"
      />
    </main>
  );
}
