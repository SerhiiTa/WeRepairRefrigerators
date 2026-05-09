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
    <main className="min-h-screen bg-white text-slate-950">
      <PublicPageHeader
        eyebrow="Brand repair page"
        title={`${brand.name} refrigerator repair in Houston`}
        description={brand.description}
        variant="light"
      />
      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-16 lg:grid-cols-[1fr_22rem]">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-blue-950/5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
            Brand guidance
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
            Public repair summary
          </h2>
          <p className="mt-4 leading-8 text-slate-600">{brand.summary}</p>
          <p className="mt-4 leading-8 text-slate-600">
            Future AI-generated pages can connect brand, symptom, service, and location data
            while keeping customer names, phone numbers, and private notes out of public content.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["Houston service", "Brand-aware diagnosis", "No private data"].map((item) => (
              <div key={item} className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm font-black text-blue-900">
                {item}
              </div>
            ))}
          </div>
        </article>
        <PublicRelatedLinks links={getRelatedLinks({ currentSlug: brand.slug })} variant="light" />
      </section>
      <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-16 lg:grid-cols-2">
        <PublicSymptomList symptoms={publicSymptoms} variant="light" />
        <PublicRepairProcess steps={publicRepairProcessSteps} variant="light" />
      </section>
      <section className="mx-auto max-w-7xl px-6 pb-16">
        <PublicFaqSection faqs={publicFaqs} variant="light" />
      </section>
      <PublicCtaSection
        title={`Schedule ${brand.name} refrigerator repair in Houston.`}
        description="Use public guidance to understand the symptom, then bring in a qualified refrigerator technician for diagnosis and repair."
        variant="light"
      />
    </main>
  );
}
