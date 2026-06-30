import type { CustomerApplianceRow } from "@/lib/supabase/types";

const applianceIconMap: Record<string, string> = {
  refrigerator: "RF",
  freezer: "FZ",
  "ice maker": "IM",
  "wine cooler": "WC",
  dishwasher: "DW",
  washer: "WA",
  dryer: "DR",
  range: "RG",
  oven: "OV",
  cooktop: "CT",
  microwave: "MW",
  "vent hood": "VH",
  "garbage compactor": "GC",
};

export function getApplianceIconLabel(applianceType: string | null | undefined) {
  const key = applianceType?.trim().toLowerCase() || "";

  return applianceIconMap[key] ?? "AP";
}

export function getApplianceTitle(appliance: CustomerApplianceRow): string {
  return [appliance.brand, appliance.appliance_type].filter(Boolean).join(" ");
}

export function getApplianceSubtitle(appliance: CustomerApplianceRow): string {
  return appliance.location_label || appliance.model_number || "Home appliance";
}
