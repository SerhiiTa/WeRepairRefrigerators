import { Suspense } from "react";

import { CustomerAuthPanel } from "@/components/customer/CustomerAuthPanel";

export const metadata = {
  title: "Customer login | WeRepairRefrigerators",
  description: "Sign in to your WeRepairRefrigerators customer account.",
};

export default function CustomerLoginPage() {
  return (
    <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
      <div className="mx-auto max-w-md">
        <Suspense fallback={null}>
          <CustomerAuthPanel mode="login" />
        </Suspense>
      </div>
    </main>
  );
}
