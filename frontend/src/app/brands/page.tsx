import { PublicCardGrid } from "@/components/public/PublicCardGrid";
import { PublicCtaSection } from "@/components/public/PublicCtaSection";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { PublicFaqSection } from "@/components/public/sections/PublicFaqSection";
import { PublicRepairProcess } from "@/components/public/sections/PublicRepairProcess";
import { PublicSymptomList } from "@/components/public/sections/PublicSymptomList";
import { buildSeoPageMetadata, toNextMetadata } from "@/lib/seo-utils";
import { publicBrands, publicFaqs, publicRepairProcessSteps, publicSymptoms } from "@/lib/public-seo-data";

export const metadata = toNextMetadata(
  buildSeoPageMetadata({
    titleParts: ["Refrigerator brands", "Houston repair"],
    description:
      "Brand-specific refrigerator repair pages for Houston homeowners, built for privacy-safe public SEO content.",
    canonicalPath: "/brands",
    keywords: ["refrigerator brands", "Houston refrigerator repair", "Sub-Zero repair"],
    kind: "brand",
  }),
);

export default function BrandsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <PublicPageHeader
        eyebrow="Refrigerator brands"
        title="Brand-specific refrigerator repair pages for the Houston MVP."
        description="Explore the public SEO foundation for refrigerator brands WeRepairRefrigerators will support with privacy-safe repair summaries and technical education."
      />
      <div className="mx-auto max-w-7xl px-6 py-16">
        <PublicCardGrid
          items={publicBrands.map((brand) => ({
            href: `/brands/${brand.slug}`,
            title: `${brand.name} refrigerator repair`,
            description: brand.description,
            meta: "Brand",
          }))}
        />
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <PublicSymptomList symptoms={publicSymptoms} />
          <PublicRepairProcess steps={publicRepairProcessSteps} />
        </div>
        <div className="mt-10">
          <PublicFaqSection faqs={publicFaqs} />
        </div>
      </div>
      <PublicCtaSection />
    </main>
  );
}
