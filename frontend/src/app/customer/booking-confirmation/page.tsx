import { Suspense } from "react";

import { CustomerBookingConfirmationShell } from "@/components/customer/CustomerBookingConfirmationShell";

export const metadata = {
  title: "Repair booked | WeRepairRefrigerators",
  description: "Repair request and appointment confirmation.",
};

export default function CustomerBookingConfirmationPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
          <div className="mx-auto max-w-3xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-bold text-slate-600">Loading confirmation...</p>
          </div>
        </main>
      }
    >
      <CustomerBookingConfirmationShell />
    </Suspense>
  );
}
