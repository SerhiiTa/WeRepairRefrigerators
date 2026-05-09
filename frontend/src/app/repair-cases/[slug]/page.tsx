import { notFound } from "next/navigation";

import { PublicCtaSection } from "@/components/public/PublicCtaSection";
import { PublicPageHeader } from "@/components/public/PublicPageHeader";
import { PublicAiContentBlocks } from "@/components/public/sections/PublicAiContentBlocks";
import { PublicFaqSection } from "@/components/public/sections/PublicFaqSection";
import { PublicRelatedLinks } from "@/components/public/sections/PublicRelatedLinks";
import {
  findPublicRepairCase,
  getRelatedLinks,
  publicAiContentBlocks,
  publicFaqs,
  publicRepairCases,
} from "@/lib/public-seo-data";
import { buildSeoPageMetadata, toNextMetadata } from "@/lib/seo-utils";

type PublicRepairCasePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return publicRepairCases.map((repairCase) => ({
    slug: repairCase.slug,
  }));
}

export async function generateMetadata({ params }: PublicRepairCasePageProps) {
  const { slug } = await params;
  const repairCase = findPublicRepairCase(slug);

  if (!repairCase) {
    return {};
  }

  return toNextMetadata(
    buildSeoPageMetadata({
      titleParts: [repairCase.title, "Public repair case"],
      description: repairCase.issue,
      canonicalPath: `/repair-cases/${repairCase.slug}`,
      keywords: [repairCase.brand, repairCase.service, repairCase.location],
      kind: "repair-case",
    }),
  );
}

export default async function PublicRepairCasePage({ params }: PublicRepairCasePageProps) {
  const { slug } = await params;
  const repairCase = findPublicRepairCase(slug);

  if (!repairCase) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <PublicPageHeader
        eyebrow="Public repair case"
        title={repairCase.title}
        description="A privacy-safe technical summary prepared for future AI-generated SEO workflows."
      />
      <section className="mx-auto max-w-7xl px-6 py-16">
        <article className="grid gap-5 lg:grid-cols-3">
          {[
            ["Location", repairCase.location],
            ["Brand", repairCase.brand],
            ["Service", repairCase.service],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/10 bg-slate-900 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                {label}
              </p>
              <p className="mt-2 text-lg font-bold text-white">{value}</p>
            </div>
          ))}
        </article>

        <article className="mt-6 grid gap-6 lg:grid-cols-3">
          {[
            ["Issue", repairCase.issue],
            ["Diagnostic summary", repairCase.diagnosis],
            ["Public repair summary", repairCase.resolution],
          ].map(([title, body]) => (
            <section key={title} className="rounded-lg border border-white/10 bg-slate-900 p-6">
              <h2 className="text-xl font-bold text-white">{title}</h2>
              <p className="mt-4 leading-7 text-slate-300">{body}</p>
            </section>
          ))}
        </article>
        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-6">
            <PublicAiContentBlocks blocks={publicAiContentBlocks} />
            <PublicFaqSection faqs={publicFaqs} />
          </div>
          <PublicRelatedLinks
            links={getRelatedLinks({
              currentSlug: repairCase.slug,
              includeRepairCases: false,
            })}
          />
        </div>
      </section>
      <PublicCtaSection
        title="Public case pages stay privacy-first."
        description="This page intentionally excludes customer names, phone numbers, exact addresses, private notes, and dashboard-only CRM fields."
      />
    </main>
  );
}
