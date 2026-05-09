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
    <main className="min-h-screen bg-slate-950 text-white">
      <PublicPageHeader
        eyebrow="Location page"
        title={`${location.name} refrigerator repair`}
        description={location.description}
      />
      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-16 lg:grid-cols-[1fr_22rem]">
        <article className="rounded-lg border border-white/10 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold tracking-tight text-white">Local SEO foundation</h2>
          <p className="mt-4 leading-8 text-slate-300">{location.summary}</p>
          <p className="mt-4 leading-8 text-slate-300">
            Future public pages can connect approved repair summaries to city and
            neighborhood intent while avoiding private customer data.
          </p>
        </article>
        <PublicRelatedLinks links={getRelatedLinks({ currentSlug: location.slug })} />
      </section>
      <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-16 lg:grid-cols-2">
        <PublicRepairProcess steps={publicRepairProcessSteps} />
        <PublicFaqSection faqs={publicFaqs} />
      </section>
      <PublicCtaSection />
    </main>
  );
}
