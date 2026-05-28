import { PublicCtaSection } from "@/components/public/PublicCtaSection";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { TechnicianCard } from "@/components/public/TechnicianCard";
import { loadPublicTechnicianProfiles } from "@/lib/public-technician-profiles";
import { buildSeoPageMetadata, toNextMetadata } from "@/lib/seo-utils";

export const dynamic = "force-dynamic";

export const metadata = toNextMetadata(
  buildSeoPageMetadata({
    titleParts: ["Houston refrigerator repair technicians"],
    description:
      "Preview public technician profiles for the WeRepairRefrigerators Houston MVP, including specialties, service areas, and privacy-safe repair examples.",
    canonicalPath: "/technicians",
    keywords: ["Houston refrigerator repair technicians", "verified appliance technician"],
    kind: "technician",
  }),
);

export default async function TechniciansPage() {
  const technicians = await loadPublicTechnicianProfiles();

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicPageHeader
        eyebrow="Technician profiles"
        title="Meet Houston refrigerator repair technician previews."
        description="Public technician profiles show only approved customer-facing fields, service areas, specialties, and safe marketplace context."
        variant="light"
      />
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-5 lg:grid-cols-3">
          {technicians.map((technician) => (
            <TechnicianCard key={technician.slug} technician={technician} />
          ))}
        </div>
      </section>
      <PublicCtaSection
        title="Technician requests are still intake-only for now."
        description="Public profiles are ready for future booking, availability, and account workflows, but no live dispatch or booking logic exists yet."
        variant="light"
        primaryHref="/repair-cases"
        primaryLabel="View repair examples"
        secondaryHref="/dashboard"
        secondaryLabel="Technician dashboard"
      />
    </main>
  );
}
