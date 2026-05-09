import { notFound } from "next/navigation";

import { PublicCtaSection } from "@/components/public/PublicCtaSection";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { PublicFaqSection } from "@/components/public/sections/PublicFaqSection";
import { PublicRelatedLinks } from "@/components/public/sections/PublicRelatedLinks";
import { PublicRepairProcess } from "@/components/public/sections/PublicRepairProcess";
import { PublicSymptomList } from "@/components/public/sections/PublicSymptomList";
import {
  findPublicItem,
  getRelatedLinks,
  publicBrands,
  publicFaqs,
  publicRepairProcessSteps,
  publicSymptoms,
} from "@/lib/public-seo-data";
import { buildSeoPageMetadata, toNextMetadata } from "@/lib/seo-utils";

type BrandPageProps = {
  params: Promise<{
    brand: string;
  }>;
};

export function generateStaticParams() {
  return publicBrands.map((brand) => ({
    brand: brand.slug,
  }));
}

export async function generateMetadata({ params }: BrandPageProps) {
  const { brand: brandSlug } = await params;
  const brand = findPublicItem(publicBrands, brandSlug);

  if (!brand) {
    return {};
  }

  return toNextMetadata(
    buildSeoPageMetadata({
      titleParts: [`${brand.name} refrigerator repair`, "Houston"],
      description: brand.description,
      canonicalPath: `/brands/${brand.slug}`,
      keywords: [brand.name, "refrigerator repair", "Houston"],
      kind: "brand",
    }),
  );
}

export default async function BrandPage({ params }: BrandPageProps) {
  const { brand: brandSlug } = await params;
  const brand = findPublicItem(publicBrands, brandSlug);

  if (!brand) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <PublicPageHeader
        eyebrow="Brand repair page"
        title={`${brand.name} refrigerator repair in Houston`}
        description={brand.description}
      />
      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-16 lg:grid-cols-[1fr_22rem]">
        <article className="rounded-lg border border-white/10 bg-slate-900 p-6">
          <h2 className="text-2xl font-bold tracking-tight text-white">Public repair summary</h2>
          <p className="mt-4 leading-8 text-slate-300">{brand.summary}</p>
          <p className="mt-4 leading-8 text-slate-300">
            Future AI-generated pages can connect brand, symptom, service, and location data
            while keeping customer names, phone numbers, and private notes out of public content.
          </p>
        </article>
        <PublicRelatedLinks links={getRelatedLinks({ currentSlug: brand.slug })} />
      </section>
      <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-16 lg:grid-cols-2">
        <PublicSymptomList symptoms={publicSymptoms} />
        <PublicRepairProcess steps={publicRepairProcessSteps} />
      </section>
      <section className="mx-auto max-w-7xl px-6 pb-16">
        <PublicFaqSection faqs={publicFaqs} />
      </section>
      <PublicCtaSection />
    </main>
  );
}
