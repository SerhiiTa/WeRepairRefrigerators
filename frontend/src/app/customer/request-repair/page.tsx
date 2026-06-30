import { Suspense } from "react";

import { CustomerRepairRequestShell } from "@/components/customer/CustomerRepairRequestShell";

export const metadata = {
  title: "Request repair | WeRepairRefrigerators",
  description: "Start a repair request from a saved appliance.",
};

export default function CustomerRequestRepairPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
          <div className="mx-auto max-w-3xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-bold text-slate-600">Loading repair intake...</p>
          </div>
        </main>
      }
    >
      <CustomerRepairRequestShell />
    </Suspense>
  );
}
