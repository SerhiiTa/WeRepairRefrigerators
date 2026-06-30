"use client";

export type CustomerPreviewState = {
  applianceType: string;
  brand: string;
  issue: string;
  zipCode: string;
  preferredWindow: string;
};

export const CUSTOMER_PREVIEW_STORAGE_KEY = "wra_customer_preview";

export const emptyCustomerPreviewState: CustomerPreviewState = {
  applianceType: "",
  brand: "",
  issue: "",
  zipCode: "",
  preferredWindow: "",
};

export function readCustomerPreviewState(): CustomerPreviewState {
  if (typeof window === "undefined") {
    return emptyCustomerPreviewState;
  }

  try {
    const raw = window.sessionStorage.getItem(CUSTOMER_PREVIEW_STORAGE_KEY);
    if (!raw) {
      return emptyCustomerPreviewState;
    }

    const parsed = JSON.parse(raw) as Partial<CustomerPreviewState>;

    return {
      applianceType: parsed.applianceType ?? "",
      brand: parsed.brand ?? "",
      issue: parsed.issue ?? "",
      zipCode: parsed.zipCode ?? "",
      preferredWindow: parsed.preferredWindow ?? "",
    };
  } catch {
    return emptyCustomerPreviewState;
  }
}

export function writeCustomerPreviewState(value: CustomerPreviewState) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(CUSTOMER_PREVIEW_STORAGE_KEY, JSON.stringify(value));
}
