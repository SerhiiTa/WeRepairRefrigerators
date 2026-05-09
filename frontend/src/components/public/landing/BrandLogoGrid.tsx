import Link from "next/link";

import type { Brand } from "@/types/public-seo";

type BrandLogoGridProps = {
  brands: Brand[];
};

export function BrandLogoGrid({ brands }: BrandLogoGridProps) {
  return (
    <section className="border-y border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:py-16">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
              Brands
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              Brand-aware refrigerator repair.
            </h2>
          </div>
          <Link href="/brands" className="text-sm font-bold text-blue-700 hover:text-blue-900">
            View all brands
          </Link>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {brands.slice(0, 10).map((brand) => (
            <Link
              key={brand.slug}
              href={`/brands/${brand.slug}`}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-center text-sm font-black text-slate-800 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
            >
              {brand.name}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
