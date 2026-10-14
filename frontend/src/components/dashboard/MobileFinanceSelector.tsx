"use client";

import { useState } from "react";
import { saveMobileFinancePreference, useMobileFinancePreference } from "./mobile-finance-preference";

export function MobileFinanceSelector() {
  const version = useMobileFinancePreference();
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
      <span id="finance-interface-label" className="font-medium text-[#64748B]">Finance interface</span>
      <div role="group" aria-labelledby="finance-interface-label" className="inline-flex rounded-xl bg-[#EDEFF3] p-1">
        {(["classic", "new"] as const).map((option) => (
          <button key={option} type="button" aria-pressed={version === option} disabled={version === null}
            onClick={() => setStorageUnavailable(!saveMobileFinancePreference(option))}
            className={`min-h-11 min-w-20 rounded-lg px-3 text-sm font-semibold disabled:opacity-50 ${version === option ? "bg-white text-[#007AFF]" : "text-[#64748B]"}`}>
            {option === "classic" ? "Classic" : "New"}
          </button>
        ))}
      </div>
      {storageUnavailable ? <p role="status" className="text-xs text-[#64748B]">Browser storage unavailable. This choice applies for this session only.</p> : null}
    </div>
  );
}
