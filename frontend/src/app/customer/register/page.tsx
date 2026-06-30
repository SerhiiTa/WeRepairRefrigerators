import { Suspense } from "react";

import { CustomerAuthPanel } from "@/components/customer/CustomerAuthPanel";

export const metadata = {
  title: "Customer registration | WeRepairRefrigerators",
  description: "Create a WeRepairRefrigerators customer account.",
};

export default function CustomerRegisterPage() {
  return (
    <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-md">
        <Suspense fallback={null}>
          <CustomerAuthPanel mode="register" />
        </Suspense>
      </div>
    </main>
  );
}
