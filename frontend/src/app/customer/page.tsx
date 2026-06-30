import Link from "next/link";

import { CustomerEntryFlow } from "@/components/customer/CustomerEntryFlow";

export const metadata = {
  title: "Customer repair preview | WeRepairRefrigerators",
  description:
    "Start a mobile refrigerator repair preview, compare safe technician options, and create a customer account before booking.",
};

export default function CustomerEntryPage() {
  return (
    <main className="min-h-screen bg-[#F7F9FC] px-4 py-5 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_440px] lg:items-center">
        <section className="rounded-[28px] bg-[#071D36] p-6 text-white shadow-[0_24px_64px_rgba(7,29,54,0.24)] sm:p-8 lg:p-10">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-200">
            Refrigerator repair
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-black leading-tight sm:text-5xl">
            Start with the problem. We will guide the repair path.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-200">
            Preview possible next steps, see public technician options, and create
            a customer account before any booking request starts.
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {["Mobile first", "Account gated", "Technician safe"].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-sm font-bold">{item}</p>
              </div>
            ))}
          </div>
          <Link
            href="/customer/login"
            className="mt-7 inline-flex rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#071D36]"
          >
            Customer sign in
          </Link>
        </section>

        <CustomerEntryFlow />
      </div>
    </main>
  );
}
