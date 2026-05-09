import { PublicCardGrid } from "@/components/public/PublicCardGrid";
import { PublicCtaSection } from "@/components/public/PublicCtaSection";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { PublicFaqSection } from "@/components/public/sections/PublicFaqSection";
import { PublicRepairProcess } from "@/components/public/sections/PublicRepairProcess";
import { buildSeoPageMetadata, toNextMetadata } from "@/lib/seo-utils";
import { publicFaqs, publicRepairCases, publicRepairProcessSteps } from "@/lib/public-seo-data";

export const metadata = toNextMetadata(
  buildSeoPageMetadata({
    titleParts: ["Public refrigerator repair case summaries"],
    description:
      "Privacy-safe public refrigerator repair case summaries for future AI-generated SEO pages.",
    canonicalPath: "/repair-cases",
    keywords: ["repair case summaries", "refrigerator repair SEO", "privacy-safe repair content"],
    kind: "repair-case",
  }),
);

export default function PublicRepairCasesPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicPageHeader
        eyebrow="Public repair cases"
        title="Privacy-safe refrigerator repair case summaries."
        description="These mock public pages show how approved repair cases can become technical SEO content without customer names, phone numbers, addresses, or private notes."
        variant="light"
      />
      <div className="mx-auto max-w-7xl px-6 py-16">
        <PublicCardGrid
          variant="light"
          items={publicRepairCases.map((repairCase) => ({
            href: `/repair-cases/${repairCase.slug}`,
            title: repairCase.title,
            description: repairCase.issue,
            meta: `${repairCase.brand} / ${repairCase.location}`,
          }))}
        />
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <PublicRepairProcess steps={publicRepairProcessSteps} variant="light" />
          <PublicFaqSection faqs={publicFaqs} variant="light" />
        </div>
      </div>
      <PublicCtaSection
        title="Repair examples should help customers without exposing customers."
        description="Every public repair case is structured around the appliance, symptom, diagnosis, and location-safe summary."
        variant="light"
      />
    </main>
  );
}
