import { PublicCardGrid } from "@/components/public/PublicCardGrid";
import { PublicCtaSection } from "@/components/public/PublicCtaSection";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { PublicFaqSection } from "@/components/public/sections/PublicFaqSection";
import { PublicRepairProcess } from "@/components/public/sections/PublicRepairProcess";
import { buildSeoPageMetadata, toNextMetadata } from "@/lib/seo-utils";
import { publicFaqs, publicRepairProcessSteps, publicServices } from "@/lib/public-seo-data";

export const metadata = toNextMetadata(
  buildSeoPageMetadata({
    titleParts: ["Refrigerator repair services", "Houston"],
    description:
      "Public refrigerator repair service pages for Houston search, built for privacy-safe SEO content.",
    canonicalPath: "/services",
    keywords: ["refrigerator repair services", "ice maker repair", "sealed system repair"],
    kind: "service",
  }),
);

export default function ServicesPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicPageHeader
        eyebrow="Repair services"
        title="Public refrigerator repair service pages."
        description="Create scalable service pages for refrigerator symptoms, repair categories, and Houston-area search intent without exposing customer personal data."
        variant="light"
      />
      <div className="mx-auto max-w-7xl px-6 py-16">
        <PublicCardGrid
          variant="light"
          items={publicServices.map((service) => ({
            href: `/services/${service.slug}`,
            title: service.name,
            description: service.description,
            meta: "Service",
          }))}
        />
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <PublicRepairProcess steps={publicRepairProcessSteps} variant="light" />
          <PublicFaqSection faqs={publicFaqs} variant="light" />
        </div>
      </div>
      <PublicCtaSection
        title="Book refrigerator service with clear next steps."
        description="Start with the repair category that matches the symptom, then move toward a technician visit when troubleshooting is no longer enough."
        variant="light"
      />
    </main>
  );
}
