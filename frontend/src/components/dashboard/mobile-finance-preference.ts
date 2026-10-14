"use client";

import { useState, useSyncExternalStore } from "react";

export type MobileFinanceVersion = "classic" | "new";
export const MOBILE_FINANCE_STORAGE_KEY = "homefixos.finance.mobile-ui.v1";
const CHANGE_EVENT = "homefixos:mobile-finance-version";
const MOBILE_QUERY = "(max-width: 1023px)";
let memoryOnly = false;
let memoryPreference: MobileFinanceVersion = "classic";

export function readMobileFinancePreference(): MobileFinanceVersion {
  if (memoryOnly) return memoryPreference;
  try {
    const saved = window.localStorage.getItem(MOBILE_FINANCE_STORAGE_KEY);
    return saved === "new" ? "new" : "classic";
  } catch {
    return memoryPreference;
  }
}

export function saveMobileFinancePreference(version: MobileFinanceVersion): boolean {
  memoryPreference = version;
  let persisted = true;
  try { window.localStorage.setItem(MOBILE_FINANCE_STORAGE_KEY, version); memoryOnly = false; }
  catch { persisted = false; memoryOnly = true; }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return persisted;
}

function subscribePreference(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === MOBILE_FINANCE_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
const serverPreference = () => null;
export function useMobileFinancePreference() {
  return useSyncExternalStore(subscribePreference, readMobileFinancePreference, serverPreference);
}
function subscribeMobile(listener: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
const readMobile = () => window.matchMedia(MOBILE_QUERY).matches;
const serverMobile = () => false;

export function resolveMobileFinanceVersion(
  applied: MobileFinanceVersion | null,
  preference: MobileFinanceVersion | null,
  workflowOpen: boolean,
): MobileFinanceVersion | null {
  return applied !== null && workflowOpen ? applied : preference;
}

export function useMobileFinancePresentation(workflowOpen: boolean) {
  const preference = useMobileFinancePreference();
  const mobile = useSyncExternalStore(subscribeMobile, readMobile, serverMobile);
  const [applied, setApplied] = useState<MobileFinanceVersion | null>(null);
  const next = resolveMobileFinanceVersion(applied, preference, workflowOpen);
  // Adjust before rendering children, so active forms never remount on a preference change.
  if (next !== applied) setApplied(next);
  return { ready: next !== null, useClassicMobileFinance: mobile && next === "classic" };
}
