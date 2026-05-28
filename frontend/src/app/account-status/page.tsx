import type { Metadata } from "next";
import { Suspense } from "react";

import { AccountStatusPanel } from "@/components/public/AccountStatusPanel";
import { PublicSiteHeader } from "@/components/public/PublicSiteHeader";
import { RefrigerationBackground } from "@/components/public/visuals/RefrigerationBackground";

export const metadata: Metadata = {
  title: "Account Status | WeRepairRefrigerators",
  description:
    "Safe account status information for WeRepairRefrigerators dashboard access.",
};

export default function AccountStatusPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicSiteHeader />
      <section className="relative overflow-hidden px-5 py-16 sm:px-6 lg:py-24">
        <RefrigerationBackground />
        <Suspense
          fallback={
            <div className="relative z-10 mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
                Loading status
              </p>
              <p className="mt-3 text-slate-600">
                Preparing the account status screen...
              </p>
            </div>
          }
        >
          <AccountStatusPanel />
        </Suspense>
      </section>
    </main>
  );
}
