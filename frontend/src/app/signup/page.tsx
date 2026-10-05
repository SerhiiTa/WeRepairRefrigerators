import type { Metadata } from "next";

import { PublicSiteHeader } from "@/components/public/PublicSiteHeader";
import { RefrigerationBackground } from "@/components/public/visuals/RefrigerationBackground";

export const metadata: Metadata = {
  title: "Account Registration Unavailable",
  description: "Account registration is currently unavailable.",
};

export default function SignupPage() {
  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicSiteHeader />
      <section className="relative overflow-hidden px-5 pb-16 pt-8 sm:px-6 lg:pb-24">
        <RefrigerationBackground />
        <div className="relative z-10 mx-auto max-w-4xl">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">
              Account access
            </p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
              Account registration is currently unavailable.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Already have an account? Sign in to continue.
            </p>
            <a
              href="/login"
              className="mt-8 inline-flex rounded-full bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
            >
              Sign in
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
