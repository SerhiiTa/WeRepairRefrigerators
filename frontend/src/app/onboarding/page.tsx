import type { Metadata } from "next";
import { Suspense } from "react";

import { OnboardingFlow } from "@/components/public/OnboardingFlow";
import { PublicSiteHeader } from "@/components/public/PublicSiteHeader";
import { RefrigerationBackground } from "@/components/public/visuals/RefrigerationBackground";

export const metadata: Metadata = {
  title: "Onboarding | WeRepairRefrigerators",
  description:
    "Complete real dev/staging onboarding setup for WeRepairRefrigerators accounts.",
};

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicSiteHeader />
      <section className="relative overflow-hidden px-5 pb-16 pt-8 sm:px-6 lg:pb-24">
        <RefrigerationBackground />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
              Account setup
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
              Connect your profile to the first real onboarding records.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              This dev/staging flow uses the Task 75/76 server actions and
              trusted RPCs. It keeps route protection conservative while we test
              real Supabase writes for profiles, technician drafts, companies,
              owner membership, and onboarding completion.
            </p>
            <div className="mt-8 grid gap-3 text-sm font-bold text-slate-600">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                Customer accounts can complete basic onboarding.
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                Technician accounts can create a draft profile when current RLS
                status allows it.
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                Company owners can create a company and owner membership through
                the trusted RPC path.
              </div>
            </div>
          </div>
          <Suspense
            fallback={
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5">
                <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
                  Loading setup
                </p>
                <p className="mt-3 text-slate-600">
                  Preparing the onboarding flow...
                </p>
              </div>
            }
          >
            <OnboardingFlow />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
