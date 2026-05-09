import { PublicCardGrid } from "@/components/public/PublicCardGrid";
import { PublicCtaSection } from "@/components/public/PublicCtaSection";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { PublicFaqSection } from "@/components/public/sections/PublicFaqSection";
import { PublicRepairProcess } from "@/components/public/sections/PublicRepairProcess";
import { buildSeoPageMetadata, toNextMetadata } from "@/lib/seo-utils";
import { publicFaqs, publicLocations, publicRepairProcessSteps } from "@/lib/public-seo-data";

export const metadata = toNextMetadata(
  buildSeoPageMetadata({
    titleParts: ["Houston-area refrigerator repair locations"],
    description:
      "Location pages for Houston MVP refrigerator repair search, prepared for nationwide SEO expansion.",
    canonicalPath: "/locations",
    keywords: ["Houston refrigerator repair", "Katy refrigerator repair", "Sugar Land refrigerator repair"],
    kind: "location",
  }),
);

export default function LocationsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <PublicPageHeader
        eyebrow="Houston MVP locations"
        title="Location pages for refrigerator repair search."
        description="Start with Houston and nearby service areas, then expand the same public SEO structure into future markets."
      />
      <div className="mx-auto max-w-7xl px-6 py-16">
        <PublicCardGrid
          items={publicLocations.map((location) => ({
            href: `/locations/${location.slug}`,
            title: `${location.name} refrigerator repair`,
            description: location.description,
            meta: "Location",
          }))}
        />
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <PublicRepairProcess steps={publicRepairProcessSteps} />
          <PublicFaqSection faqs={publicFaqs} />
        </div>
      </div>
      <PublicCtaSection />
    </main>
  );
}
