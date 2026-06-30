import Link from "next/link";

import { BrandLogo } from "@/components/BrandLogo";
import { PublicCustomerAccountNav } from "@/components/public/PublicCustomerAccountNav";

type PublicSiteHeaderProps = {
  className?: string;
};

export function PublicSiteHeader({ className = "" }: PublicSiteHeaderProps) {
  return (
    <header className={`relative z-10 ${className}`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-4">
          <BrandLogo variant="light" />
          <a
            href="tel:+17135550134"
            className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm lg:hidden"
          >
            Call
          </a>
        </div>
        <nav
          aria-label="Public navigation"
          className="flex flex-wrap items-center gap-2 sm:gap-3"
        >
          {[
            ["Services", "/services"],
            ["Brands", "/brands"],
            ["Locations", "/locations"],
            ["Technicians", "/technicians"],
            ["Find Technician", "/find-technician"],
            ["Repair Cases", "/repair-cases"],
            ["Schedule Service", "/schedule-service"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="rounded-full px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-blue-50 hover:text-blue-800"
            >
              {label}
            </Link>
          ))}
          <a
            href="tel:+17135550134"
            className="hidden rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm lg:inline-flex"
          >
            (713) 555-0134
          </a>
          <PublicCustomerAccountNav />
        </nav>
      </div>
    </header>
  );
}
