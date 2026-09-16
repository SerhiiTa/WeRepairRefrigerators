import type { ReactNode } from "react";

export const WRA_ASSET_PLACEHOLDER_TYPES = [
  "refrigerator",
  "built_in_refrigerator",
  "freezer",
  "wine_cooler",
  "ice_maker",
  "washer",
  "dryer",
  "dishwasher",
  "range",
  "oven",
  "double_oven",
  "cooktop",
  "rangetop",
  "microwave",
  "hood",
  "coffee_machine",
  "trash_compactor",
  "unknown_appliance",
] as const;

export type WraAssetPlaceholderType =
  (typeof WRA_ASSET_PLACEHOLDER_TYPES)[number];

const typeAliases: Record<string, WraAssetPlaceholderType> = {
  refrigerator: "refrigerator",
  fridge: "refrigerator",
  "built in refrigerator": "built_in_refrigerator",
  "built-in refrigerator": "built_in_refrigerator",
  "built_in_refrigerator": "built_in_refrigerator",
  freezer: "freezer",
  "wine cooler": "wine_cooler",
  "wine_cooler": "wine_cooler",
  "ice maker": "ice_maker",
  "ice machine": "ice_maker",
  "ice_maker": "ice_maker",
  washer: "washer",
  "washing machine": "washer",
  dryer: "dryer",
  dishwasher: "dishwasher",
  range: "range",
  stove: "range",
  oven: "oven",
  "double oven": "double_oven",
  "double_oven": "double_oven",
  cooktop: "cooktop",
  rangetop: "rangetop",
  microwave: "microwave",
  hood: "hood",
  "range hood": "hood",
  "coffee machine": "coffee_machine",
  "coffee maker": "coffee_machine",
  "coffee_machine": "coffee_machine",
  "trash compactor": "trash_compactor",
  "trash_compactor": "trash_compactor",
};

export function getAssetPlaceholderType(
  applianceType: string | null | undefined,
): WraAssetPlaceholderType {
  const key = String(applianceType ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  return typeAliases[key] ?? "unknown_appliance";
}

export function getAssetPlaceholderLabel(
  applianceType: string | null | undefined,
): string {
  return getAssetPlaceholderType(applianceType)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AssetImage({
  applianceType,
  coverUrl,
  className = "",
}: {
  applianceType: string | null | undefined;
  coverUrl?: string | null;
  className?: string;
}) {
  if (coverUrl) {
    return (
      <div
        aria-label={getAssetPlaceholderLabel(applianceType)}
        className={`bg-cover bg-center ${className}`}
        role="img"
        style={{ backgroundImage: `url("${coverUrl.replaceAll('"', "%22")}")` }}
      />
    );
  }

  return (
    <div
      aria-label={`${getAssetPlaceholderLabel(applianceType)} placeholder`}
      className={`flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 text-[#2563EB] ${className}`}
      role="img"
    >
      {renderAssetPlaceholderIcon(getAssetPlaceholderType(applianceType))}
    </div>
  );
}

function renderAssetPlaceholderIcon(type: WraAssetPlaceholderType): ReactNode {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
  };

  if (
    type === "washer" ||
    type === "dryer" ||
    type === "dishwasher" ||
    type === "microwave" ||
    type === "coffee_machine"
  ) {
    return (
      <svg aria-hidden="true" className="h-2/3 w-2/3" viewBox="0 0 48 48">
        <rect {...common} height="34" rx="5" width="30" x="9" y="7" />
        <path {...common} d="M15 14h18" />
        <circle {...common} cx="24" cy="29" r="9" />
        <circle {...common} cx="33" cy="13" r="1" />
      </svg>
    );
  }

  if (
    type === "range" ||
    type === "oven" ||
    type === "double_oven" ||
    type === "cooktop" ||
    type === "rangetop"
  ) {
    return (
      <svg aria-hidden="true" className="h-2/3 w-2/3" viewBox="0 0 48 48">
        <rect {...common} height="34" rx="5" width="30" x="9" y="7" />
        <path {...common} d="M15 16h18M15 25h18" />
        <circle {...common} cx="17" cy="12" r="1" />
        <circle {...common} cx="24" cy="12" r="1" />
        <circle {...common} cx="31" cy="12" r="1" />
      </svg>
    );
  }

  if (type === "hood") {
    return (
      <svg aria-hidden="true" className="h-2/3 w-2/3" viewBox="0 0 48 48">
        <path {...common} d="M17 8h14l2 14H15l2-14Z" />
        <path {...common} d="M11 22h26l-4 12H15l-4-12ZM19 39h10" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-2/3 w-2/3" viewBox="0 0 48 48">
      <rect {...common} height="36" rx="5" width="26" x="11" y="6" />
      <path {...common} d="M24 6v36M16 14h4M16 22h4M28 14h4" />
    </svg>
  );
}
