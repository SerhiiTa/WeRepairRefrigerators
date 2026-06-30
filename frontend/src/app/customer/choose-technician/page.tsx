import { Suspense } from "react";

import { CustomerChooseTechnicianShell } from "@/components/customer/CustomerChooseTechnicianShell";

export const metadata = {
  title: "Choose technician | WeRepairRefrigerators",
  description: "Choose a marketplace technician and appointment window.",
};

export default function CustomerChooseTechnicianPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
          <div className="mx-auto max-w-4xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-bold text-slate-600">Loading technician options...</p>
          </div>
        </main>
      }
    >
      <CustomerChooseTechnicianShell />
    </Suspense>
  );
}
