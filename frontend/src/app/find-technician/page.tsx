import { PublicCtaSection } from "@/components/public/PublicCtaSection";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { TechnicianZipDiscovery } from "@/components/public/TechnicianZipDiscovery";
import { getPublicTechnicians } from "@/lib/public-seo-data";
import { buildSeoPageMetadata, toNextMetadata } from "@/lib/seo-utils";

export const metadata = toNextMetadata(
  buildSeoPageMetadata({
    titleParts: ["Find a refrigerator repair technician by ZIP", "Houston"],
    description:
      "Search mock Houston MVP technician coverage by ZIP code, service type, and refrigerator brand specialty.",
    canonicalPath: "/find-technician",
    keywords: ["find refrigerator repair technician", "Houston ZIP refrigerator repair"],
    kind: "technician",
  }),
);

export default function FindTechnicianPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicPageHeader
        eyebrow="Find technician"
        title="Find a refrigerator repair technician by ZIP code."
        description="Use static Houston MVP coverage data to preview how customers will discover verified refrigerator repair technicians by ZIP, service type, and brand specialty."
        variant="light"
      />
      <TechnicianZipDiscovery technicians={getPublicTechnicians()} />
      <PublicCtaSection
        title="ZIP discovery is mock-only for now."
        description="This page previews future technician matching. No live booking, dispatch, maps, or availability logic is connected yet."
        variant="light"
        primaryHref="/technicians"
        primaryLabel="Browse technicians"
        secondaryHref="/repair-cases"
        secondaryLabel="View repair examples"
      />
    </main>
  );
}
