"use client";

import Link from "next/link";

import { BrandLogo } from "@/components/BrandLogo";
import { CustomerAccountMenu } from "@/components/customer/CustomerAccountMenu";
import type { CustomerRow } from "@/lib/supabase/types";

export function CustomerPortalHeader({
  customer,
}: {
  customer: CustomerRow | null;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <BrandLogo variant="light" />
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="hidden rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 sm:inline-flex"
          >
            Explore Marketplace
          </Link>
          <Link
            href="/customer/dashboard"
            className="rounded-full bg-[#0F6BFF] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#0057D9]"
          >
            Portal
          </Link>
          <CustomerAccountMenu customer={customer} />
        </div>
      </div>
    </header>
  );
}
