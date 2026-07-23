export type PriceBookSelectionContext = {
  serviceRequestId?: string | null;
  applianceType?: string | null;
  applianceGroup?: string | null;
  brand?: string | null;
  issueDescription?: string | null;
  jobName?: string | null;
  customerComplaint?: string | null;
  diagnosisText?: string | null;
};

export type PriceBookSelectionItem = {
  id: string;
  company_id: string | null;
  item_type: string;
  name: string;
  normalized_name: string;
  customer_description: string | null;
  appliance_group_id: string | null;
  appliance_type: string | null;
  brand: string | null;
  total_price: number;
  active: boolean;
  review_status: string;
  ai_keywords: string[] | null;
  canonical_item_id?: string | null;
};

export type PriceBookSelectionGroup = {
  id: string;
  name: string;
  slug: string;
};

export type PriceBookSelectionApplianceType = {
  appliance_group_id: string;
  appliance_type: string;
  normalized_appliance_type: string;
};

export type PriceBookSelectionAlias = {
  price_book_item_id: string;
  alias: string;
  normalized_alias: string;
};

export type RankedRepairSolution = {
  id: string;
  name: string;
  itemType: string;
  totalPrice: number;
  applianceType: string | null;
  applianceGroupName: string | null;
  brand: string | null;
  customerDescription: string | null;
  score: number;
  matchReasons: string[];
  technicianConfirmationRequired: boolean;
};

function normalize(value: unknown) {
  return typeof value === "string"
    ? value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";
}

function tokenize(value: string) {
  return new Set(
    normalize(value)
      .split(/\s+/)
      .filter((token) => token.length >= 3),
  );
}

function collapseOverrides(items: PriceBookSelectionItem[]) {
  const overrideIds = new Set(
    items
      .filter((item) => item.company_id && item.canonical_item_id)
      .map((item) => item.canonical_item_id),
  );
  const companyKeys = new Set(
    items
      .filter((item) => item.company_id)
      .map(
        (item) =>
          `${item.item_type}:${item.appliance_group_id ?? "none"}:${item.normalized_name}`,
      ),
  );

  return items.filter((item) => {
    if (item.company_id) {
      return true;
    }

    const key = `${item.item_type}:${item.appliance_group_id ?? "none"}:${item.normalized_name}`;
    return !overrideIds.has(item.id) && !companyKeys.has(key);
  });
}

export function rankPriceBookRepairSolutions({
  context,
  items,
  groups,
  applianceTypes,
  aliases,
}: {
  context: PriceBookSelectionContext;
  items: PriceBookSelectionItem[];
  groups: PriceBookSelectionGroup[];
  applianceTypes: PriceBookSelectionApplianceType[];
  aliases: PriceBookSelectionAlias[];
}): RankedRepairSolution[] {
  const normalizedAppliance = normalize(context.applianceType);
  const normalizedGroup = normalize(context.applianceGroup);
  const normalizedBrand = normalize(context.brand);
  const contextText = normalize(
    [
      context.issueDescription,
      context.jobName,
      context.customerComplaint,
      context.diagnosisText,
      context.applianceType,
      context.brand,
    ].join(" "),
  );
  const contextTokens = tokenize(contextText);

  const groupById = new Map(groups.map((group) => [group.id, group]));
  const exactGroupId =
    applianceTypes.find(
      (type) => type.normalized_appliance_type === normalizedAppliance,
    )?.appliance_group_id ??
    groups.find((group) => normalize(group.name) === normalizedGroup)?.id ??
    groups.find((group) => normalize(group.slug) === normalizedGroup)?.id ??
    null;
  const generalGroupId =
    groups.find((group) => group.slug === "general")?.id ??
    groups.find((group) => normalize(group.name) === "general")?.id ??
    null;

  const aliasesByItemId = new Map<string, PriceBookSelectionAlias[]>();
  aliases.forEach((alias) => {
    aliasesByItemId.set(alias.price_book_item_id, [
      ...(aliasesByItemId.get(alias.price_book_item_id) ?? []),
      alias,
    ]);
  });

  return collapseOverrides(items)
    .filter(
      (item) =>
        item.active &&
        item.review_status === "approved" &&
        item.item_type !== "fee",
    )
    .map((item): RankedRepairSolution | null => {
      const itemGroup = item.appliance_group_id
        ? groupById.get(item.appliance_group_id) ?? null
        : null;
      const itemGroupSlug = normalize(itemGroup?.slug);
      const itemGroupName = normalize(itemGroup?.name);
      const itemAppliance = normalize(item.appliance_type);
      const itemBrand = normalize(item.brand);
      const isGeneral =
        item.appliance_group_id === generalGroupId ||
        itemGroupSlug === "general" ||
        itemGroupName === "general" ||
        !item.appliance_group_id;
      const exactAppliance =
        Boolean(normalizedAppliance) && itemAppliance === normalizedAppliance;
      const groupMatch =
        Boolean(exactGroupId) && item.appliance_group_id === exactGroupId;
      const brandMatch =
        Boolean(normalizedBrand) && itemBrand === normalizedBrand;

      if (itemBrand && normalizedBrand && itemBrand !== normalizedBrand) {
        return null;
      }

      if (!exactAppliance && !groupMatch && !isGeneral) {
        return null;
      }

      const aliasText = (aliasesByItemId.get(item.id) ?? [])
        .map((alias) => `${alias.alias} ${alias.normalized_alias}`)
        .join(" ");
      const itemText = normalize(
        [
          item.name,
          item.normalized_name,
          item.customer_description,
          item.appliance_type,
          item.brand,
          ...(item.ai_keywords ?? []),
          aliasText,
        ].join(" "),
      );
      const itemTokens = tokenize(itemText);
      const tokenMatches = Array.from(contextTokens).filter((token) =>
        itemTokens.has(token),
      );
      const matchReasons: string[] = [];
      let score = 0;

      if (exactAppliance) {
        score += 55;
        matchReasons.push("exact appliance");
      } else if (groupMatch) {
        score += 35;
        matchReasons.push("appliance group");
      } else if (isGeneral) {
        score += 5;
        matchReasons.push("general");
      }

      if (brandMatch) {
        score += 20;
        matchReasons.push("brand");
      }

      if (tokenMatches.length > 0) {
        score += Math.min(30, tokenMatches.length * 8);
        matchReasons.push("symptom match");
      }

      if (item.company_id) {
        score += 6;
        matchReasons.push("company approved");
      }

      if (item.item_type === "bundle" || item.item_type === "service") {
        score += 4;
      }

      if (isGeneral) {
        score -= 8;
      }

      return {
        id: item.id,
        name: item.name,
        itemType: item.item_type,
        totalPrice: Number(item.total_price ?? 0),
        applianceType: item.appliance_type,
        applianceGroupName: itemGroup?.name ?? null,
        brand: item.brand,
        customerDescription: item.customer_description,
        score,
        matchReasons,
        technicianConfirmationRequired: true,
      };
    })
    .filter((item): item is RankedRepairSolution => Boolean(item))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 12);
}
