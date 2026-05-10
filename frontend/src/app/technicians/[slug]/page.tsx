import { notFound } from "next/navigation";
import Link from "next/link";

import { PublicCtaSection } from "@/components/public/PublicCtaSection";
import { PublicFaqSection } from "@/components/public/sections/PublicFaqSection";
import { PublicRelatedLinks } from "@/components/public/sections/PublicRelatedLinks";
import { PublicSiteHeader } from "@/components/public/PublicSiteHeader";
import { TechnicianProfileHeader } from "@/components/public/TechnicianProfileHeader";
import { TechnicianRepairCaseList } from "@/components/public/TechnicianRepairCaseList";
import { TechnicianServiceAreas } from "@/components/public/TechnicianServiceAreas";
import {
  getPublicTechnicianBySlug,
  getPublicTechnicians,
  getRepairCasesForTechnician,
  publicFaqs,
} from "@/lib/public-seo-data";
import { buildSeoPageMetadata, toNextMetadata } from "@/lib/seo-utils";

type TechnicianPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return getPublicTechnicians().map((technician) => ({
    slug: technician.slug,
  }));
}

export async function generateMetadata({ params }: TechnicianPageProps) {
  const { slug } = await params;
  const technician = getPublicTechnicianBySlug(slug);

  if (!technician) {
    return {};
  }

  return toNextMetadata(
    buildSeoPageMetadata({
      titleParts: [technician.name, "Houston refrigerator repair technician"],
      description: `${technician.name} is a public technician profile preview for ${technician.serviceArea}, with mock specialties including ${technician.specialties.join(", ")}.`,
      canonicalPath: `/technicians/${technician.slug}`,
      keywords: [technician.name, "refrigerator repair technician", technician.serviceArea],
      kind: "technician",
    }),
  );
}

export default async function TechnicianPage({ params }: TechnicianPageProps) {
  const { slug } = await params;
  const technician = getPublicTechnicianBySlug(slug);

  if (!technician) {
    notFound();
  }

  const repairCases = getRepairCasesForTechnician(technician.slug);
  const relatedLinks = [
    ...repairCases.slice(0, 2).map((repairCase) => ({
      label: repairCase.title,
      href: `/repair-cases/${repairCase.slug}`,
      description: repairCase.issue,
      kind: "repair-case" as const,
    })),
    {
      label: "All public technicians",
      href: "/technicians",
      description: "Browse technician profile previews for the Houston MVP.",
      kind: "technician" as const,
    },
  ];

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicSiteHeader />
      <TechnicianProfileHeader technician={technician} />
      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-16 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-blue-950/5">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
              Appliance and brand focus
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              Public specialties
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[...(technician.specialties ?? []), ...(technician.brandFocus ?? [])].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm font-black text-blue-900"
                >
                  {item}
                </div>
              ))}
            </div>
          </section>
          <TechnicianRepairCaseList repairCases={repairCases} />
          <PublicFaqSection
            faqs={publicFaqs}
            title="Technician profile questions"
            variant="light"
          />
        </div>
        <aside className="space-y-6">
          <section className="rounded-3xl border border-blue-100 bg-blue-50/80 p-6 shadow-sm shadow-blue-950/5">
            <h2 className="text-xl font-black text-slate-950">Request technician</h2>
            <p className="mt-3 leading-7 text-slate-600">
              Mock actions only. Live availability and booking are not connected yet.
            </p>
            <div className="mt-5 grid gap-3">
              <button
                type="button"
                className="rounded-full bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-700/20"
              >
                Request This Technician
              </button>
              <Link
                href="/repair-cases"
                className="rounded-full border border-blue-200 bg-white px-5 py-3 text-center text-sm font-black text-blue-800 shadow-sm"
              >
                View Repair Cases
              </Link>
              <button
                type="button"
                className="rounded-full border border-blue-200 bg-white px-5 py-3 text-sm font-black text-blue-800 shadow-sm"
              >
                Check Availability
              </button>
            </div>
          </section>
          <TechnicianServiceAreas technician={technician} />
          <PublicRelatedLinks links={relatedLinks} title="Related public pages" variant="light" />
        </aside>
      </section>
      <PublicCtaSection
        title={`Request ${technician.name} for refrigerator repair.`}
        description="Request, availability, and dispatch controls are mock-only placeholders until booking and account workflows are approved."
        variant="light"
        primaryHref="/technicians"
        primaryLabel="Request This Technician"
        secondaryHref="/repair-cases"
        secondaryLabel="View Repair Cases"
      />
    </main>
  );
}
