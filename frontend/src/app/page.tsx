import Link from "next/link";

import { BrandLogoGrid } from "@/components/public/landing/BrandLogoGrid";
import { LandingHero } from "@/components/public/landing/LandingHero";
import { PricingHighlight } from "@/components/public/landing/PricingHighlight";
import { ProblemCards } from "@/components/public/landing/ProblemCards";
import { ReviewTrustStrip } from "@/components/public/landing/ReviewTrustStrip";
import { ServiceAreaPills } from "@/components/public/landing/ServiceAreaPills";
import { StickyMobileCta } from "@/components/public/landing/StickyMobileCta";
import { PublicCardGrid } from "@/components/public/PublicCardGrid";
import { publicBrands, publicLocations, publicServices } from "@/lib/public-seo-data";

export default function Home() {
  return (
    <main className="min-h-screen bg-white pb-20 text-slate-950 md:pb-0">
      <LandingHero />
      <ReviewTrustStrip />
      <ProblemCards />

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:py-16">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
              Services
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              Schedule the right refrigerator repair visit.
            </h2>
          </div>
          <Link href="/services" className="text-sm font-bold text-blue-700 hover:text-blue-900">
            View services
          </Link>
        </div>
        <div className="mt-8">
          <PublicCardGrid
            variant="light"
            items={publicServices.slice(0, 5).map((service) => ({
              href: `/services/${service.slug}`,
              title: service.name,
              description: service.description,
              meta: "Repair service",
            }))}
          />
        </div>
      </section>

      <BrandLogoGrid brands={publicBrands} />
      <PricingHighlight />
      <ServiceAreaPills locations={publicLocations} />

      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:py-16">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
                Customer trust
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
                Built to become the trusted refrigerator repair platform for Houston.
              </h2>
              <p className="mt-4 leading-8 text-slate-600">
                Public pages are designed around helpful repair education, clear service
                expectations, brand-aware diagnostics, and privacy-safe content that can scale
                as the platform grows.
              </p>
            </div>
            <div className="rounded-3xl bg-blue-50 p-6">
              <p className="text-5xl font-black text-blue-700">“</p>
              <p className="mt-2 leading-7 text-slate-700">
                Mock review: clear communication, practical diagnostic notes, and a clean
                explanation of repair options for a warm refrigerator.
              </p>
              <p className="mt-4 text-sm font-black text-slate-950">Houston homeowner</p>
            </div>
          </div>
        </div>
      </section>

      <StickyMobileCta />
    </main>
  );
}
