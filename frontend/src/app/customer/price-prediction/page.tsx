"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  readCustomerPreviewState,
} from "@/components/customer/customer-preview-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const PRICE_RANGES: Record<string, string> = {
  refrigerator: "$189-$650",
  "built-in refrigerator": "$350-$1,600",
  "ice maker": "$180-$580",
  freezer: "$190-$700",
  "wine cooler": "$220-$750",
};

export default function PricePredictionPage() {
  const router = useRouter();
  const [preview] = useState(() => readCustomerPreviewState());
  const [status, setStatus] = useState<string | null>(null);

  const range = useMemo(() => {
    const key = preview.applianceType.toLowerCase();
    return PRICE_RANGES[key] ?? "$189-$700";
  }, [preview.applianceType]);

  async function continueToAccount() {
    const supabase = getSupabaseBrowserClient();
    const session = supabase ? await supabase.auth.getSession() : null;

    if (session?.data.session) {
      router.push("/customer/dashboard");
      return;
    }

    setStatus("Create an account before starting a repair request.");
    router.push("/customer/register?next=/customer/dashboard");
  }

  return (
    <main className="min-h-screen bg-[#F7F9FC] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:p-7">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#0F6BFF]">
          Price preview
        </p>
        <h1 className="mt-3 text-3xl font-black text-slate-950">
          Expected repair range: {range}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This is a planning preview based on appliance type, not a quote. A technician
          estimate is created only after a real repair request and job review.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4">
            <p className="text-xs font-bold uppercase text-slate-500">Appliance</p>
            <p className="mt-1 font-black text-slate-950">
              {preview.applianceType || "Refrigerator"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4">
            <p className="text-xs font-bold uppercase text-slate-500">Brand</p>
            <p className="mt-1 font-black text-slate-950">
              {preview.brand || "Brand not selected"}
            </p>
          </div>
        </div>

        {status ? (
          <p className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-slate-700">
            {status}
          </p>
        ) : null}

        <button
          type="button"
          onClick={continueToAccount}
          className="mt-5 h-12 w-full rounded-xl bg-[#0F6BFF] px-4 text-base font-bold text-white transition hover:bg-[#0057D9]"
        >
          Continue with customer account
        </button>
      </div>
    </main>
  );
}
