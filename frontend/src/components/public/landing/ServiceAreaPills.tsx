import Link from "next/link";

import type { Location } from "@/types/public-seo";

type ServiceAreaPillsProps = {
  locations: Location[];
};

export function ServiceAreaPills({ locations }: ServiceAreaPillsProps) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 lg:py-16">
      <div className="rounded-3xl border border-blue-100 bg-blue-50 p-6 sm:p-8">
        <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-700">
          Houston service area
        </p>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
          Local first, built to expand.
        </h2>
        <div className="mt-6 flex flex-wrap gap-3">
          {locations.map((location) => (
            <Link
              key={location.slug}
              href={`/locations/${location.slug}`}
              className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-800 shadow-sm"
            >
              {location.name}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
