"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type PriceBookRole = "viewer" | "editor" | "manager";

type PriceBookGroup = {
  id: string;
  company_id: string | null;
  name: string;
  slug: string;
  active: boolean;
};

type PriceBookApplianceType = {
  id: string;
  appliance_group_id: string;
  appliance_type: string;
  normalized_appliance_type: string;
  sort_order: number;
};

type PriceBookItem = {
  id: string;
  company_id: string | null;
  item_type: "labor" | "part" | "service" | "fee" | "bundle";
  name: string;
  normalized_name: string;
  description: string | null;
  appliance_group_id: string | null;
  appliance_type: string | null;
  brand: string | null;
  default_quantity: number;
  unit: string;
  labor_price: number;
  part_price: number;
  total_price: number;
  pricing_strategy: string;
  taxable: boolean;
  default_tax_behavior: string;
  warranty_text: string | null;
  estimated_duration_minutes: number | null;
  internal_notes: string | null;
  customer_description: string | null;
  ai_keywords: string[];
  bundle_display_mode: string;
  active: boolean;
  review_status: "pending" | "approved" | "rejected" | "merged" | "archived";
  canonical_item_id: string | null;
  source: string;
};

type PriceBookAlias = {
  id: string;
  price_book_item_id: string;
  alias: string;
  normalized_alias: string;
};

type PriceBookBundleItem = {
  id: string;
  bundle_item_id: string;
  child_item_id: string;
  sort_order: number;
  default_quantity: number;
  is_optional: boolean;
  is_required: boolean;
  bundled_price_override: number | null;
  use_child_price: boolean;
  hidden_internal: boolean;
  customer_expanded_description: string | null;
  child?: {
    id: string;
    name: string;
    item_type: string;
    total_price: number;
    customer_description: string | null;
  } | null;
};

type DuplicateCandidate = {
  id: string;
  name: string;
  itemType: string;
  reviewStatus: string;
  matchReason: string;
  matchScore: number;
};

type PriceBookResponse = {
  ok?: boolean;
  message?: string;
  code?: string;
  diagnostics?: {
    authenticatedUserIdSuffix?: string | null;
    profileLoaded?: boolean;
    resolverStage?: string | null;
    membership?: {
      currentDashboardCompanyIdPresent?: boolean;
      currentDashboardCompanyIdSuffix?: string | null;
      currentDashboardCompanyIdError?: string | null;
      membershipRowCount?: number;
      membershipRows?: Array<{
        companyIdSuffix?: string | null;
        memberRole?: string | null;
        memberStatus?: string | null;
        archived?: boolean;
        removed?: boolean;
        suspended?: boolean;
        companyExists?: boolean;
        companyStatus?: string | null;
        companyArchived?: boolean;
      }>;
      membershipQueryError?: string | null;
      companiesQueryError?: string | null;
    } | null;
  };
  role?: PriceBookRole;
  groups?: PriceBookGroup[];
  applianceTypes?: PriceBookApplianceType[];
  items?: PriceBookItem[];
  aliases?: PriceBookAlias[];
  bundleItems?: PriceBookBundleItem[];
};

type BundleChildForm = {
  childItemId: string;
  defaultQuantity: number;
  isOptional: boolean;
  isRequired: boolean;
  bundledPriceOverride: number | null;
  useChildPrice: boolean;
  hiddenInternal: boolean;
  customerExpandedDescription: string;
};

type FormState = {
  id: string | null;
  itemType: PriceBookItem["item_type"];
  name: string;
  description: string;
  applianceGroupId: string;
  applianceType: string;
  brand: string;
  defaultQuantity: string;
  unit: string;
  laborPrice: string;
  partPrice: string;
  totalPrice: string;
  taxable: boolean;
  warrantyText: string;
  estimatedDurationMinutes: string;
  customerDescription: string;
  internalNotes: string;
  aiKeywords: string;
  aliases: string;
  active: boolean;
  reviewStatus: PriceBookItem["review_status"];
  bundleDisplayMode: string;
  bundleChildren: BundleChildForm[];
};

const EMPTY_FORM: FormState = {
  id: null,
  itemType: "bundle",
  name: "",
  description: "",
  applianceGroupId: "",
  applianceType: "",
  brand: "",
  defaultQuantity: "1",
  unit: "each",
  laborPrice: "0",
  partPrice: "0",
  totalPrice: "0",
  taxable: true,
  warrantyText: "",
  estimatedDurationMinutes: "",
  customerDescription: "",
  internalNotes: "",
  aiKeywords: "",
  aliases: "",
  active: true,
  reviewStatus: "approved",
  bundleDisplayMode: "expanded",
  bundleChildren: [],
};

const itemTypeLabels: Record<PriceBookItem["item_type"], string> = {
  labor: "Labor",
  part: "Part",
  service: "Service",
  fee: "Fee",
  bundle: "Bundle",
};

const preferredGroupOrder = [
  "cooling",
  "laundry",
  "cooking",
  "dishwashing",
  "general",
];

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function normalizeText(value: unknown) {
  return typeof value === "string"
    ? value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";
}

function splitList(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function readItemAliases(itemId: string, aliases: PriceBookAlias[]) {
  return aliases
    .filter((alias) => alias.price_book_item_id === itemId)
    .map((alias) => alias.alias);
}

function buildBundleChildren(
  itemId: string,
  bundleItems: PriceBookBundleItem[],
): BundleChildForm[] {
  return bundleItems
    .filter((child) => child.bundle_item_id === itemId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((child) => ({
      childItemId: child.child_item_id,
      defaultQuantity: Number(child.default_quantity ?? 1),
      isOptional: Boolean(child.is_optional),
      isRequired: Boolean(child.is_required),
      bundledPriceOverride:
        child.bundled_price_override === null
          ? null
          : Number(child.bundled_price_override),
      useChildPrice: Boolean(child.use_child_price),
      hiddenInternal: Boolean(child.hidden_internal),
      customerExpandedDescription: child.customer_expanded_description ?? "",
    }));
}

function formFromItem(
  item: PriceBookItem,
  aliases: PriceBookAlias[],
  bundleItems: PriceBookBundleItem[],
): FormState {
  return {
    id: item.id,
    itemType: item.item_type,
    name: item.name,
    description: item.description ?? "",
    applianceGroupId: item.appliance_group_id ?? "",
    applianceType: item.appliance_type ?? "",
    brand: item.brand ?? "",
    defaultQuantity: String(item.default_quantity ?? 1),
    unit: item.unit ?? "each",
    laborPrice: String(item.labor_price ?? 0),
    partPrice: String(item.part_price ?? 0),
    totalPrice: String(item.total_price ?? 0),
    taxable: item.taxable,
    warrantyText: item.warranty_text ?? "",
    estimatedDurationMinutes: item.estimated_duration_minutes
      ? String(item.estimated_duration_minutes)
      : "",
    customerDescription: item.customer_description ?? "",
    internalNotes: item.internal_notes ?? "",
    aiKeywords: (item.ai_keywords ?? []).join(", "),
    aliases: readItemAliases(item.id, aliases).join(", "),
    active: item.active,
    reviewStatus: item.review_status,
    bundleDisplayMode: item.bundle_display_mode ?? "expanded",
    bundleChildren: buildBundleChildren(item.id, bundleItems),
  };
}

function buildPayload(form: FormState, duplicateAction?: string) {
  return {
    id: form.id,
    duplicateAction,
    itemType: form.itemType,
    name: form.name,
    description: form.description,
    applianceGroupId: form.applianceGroupId || null,
    applianceType: form.applianceType,
    brand: form.brand,
    defaultQuantity: Number(form.defaultQuantity || 1),
    unit: form.unit,
    laborPrice: Number(form.laborPrice || 0),
    partPrice: Number(form.partPrice || 0),
    totalPrice: Number(form.totalPrice || 0),
    pricingStrategy:
      form.itemType === "bundle" ? "bundle_override" : "fixed_total",
    taxable: form.taxable,
    defaultTaxBehavior: "company_default",
    warrantyText: form.warrantyText,
    estimatedDurationMinutes: form.estimatedDurationMinutes
      ? Number(form.estimatedDurationMinutes)
      : null,
    internalNotes: form.internalNotes,
    customerDescription: form.customerDescription,
    aiKeywords: splitList(form.aiKeywords),
    aliases: splitList(form.aliases),
    active: form.active,
    reviewStatus: form.reviewStatus,
    bundleDisplayMode: form.bundleDisplayMode,
    bundleChildren: form.itemType === "bundle" ? form.bundleChildren : [],
  };
}

function collapseCompanyOverrides(items: PriceBookItem[]) {
  const companyOverrides = new Set(
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
    return !companyOverrides.has(item.id) && !companyKeys.has(key);
  });
}

function getGroupLabel(group: PriceBookGroup) {
  if (group.slug === "general") {
    return "General";
  }

  return group.name;
}

function itemSearchText(
  item: PriceBookItem,
  aliases: PriceBookAlias[],
  groupName: string,
) {
  return normalizeText(
    [
      item.name,
      item.description,
      item.customer_description,
      item.appliance_type,
      item.brand,
      groupName,
      ...readItemAliases(item.id, aliases),
      ...(item.ai_keywords ?? []),
    ].join(" "),
  );
}

export function PriceBookSettings() {
  const [groups, setGroups] = useState<PriceBookGroup[]>([]);
  const [applianceTypes, setApplianceTypes] = useState<PriceBookApplianceType[]>(
    [],
  );
  const [items, setItems] = useState<PriceBookItem[]>([]);
  const [aliases, setAliases] = useState<PriceBookAlias[]>([]);
  const [bundleItems, setBundleItems] = useState<PriceBookBundleItem[]>([]);
  const [role, setRole] = useState<PriceBookRole>("viewer");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [lastErrorCode, setLastErrorCode] = useState<string | null>(null);
  const [lastDiagnostics, setLastDiagnostics] = useState<
    PriceBookResponse["diagnostics"] | null
  >(null);
  const [search, setSearch] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editorOpen, setEditorOpen] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [openMenuItemId, setOpenMenuItemId] = useState<string | null>(null);
  const [childSearch, setChildSearch] = useState("");

  const canEdit = role === "editor" || role === "manager";
  const canApprove = role === "manager";
  const visibleItems = useMemo(() => collapseCompanyOverrides(items), [items]);

  const orderedGroups = useMemo(() => {
    return [...groups]
      .filter((group) => group.active)
      .sort((a, b) => {
        const aIndex = preferredGroupOrder.indexOf(a.slug);
        const bIndex = preferredGroupOrder.indexOf(b.slug);

        return (
          (aIndex === -1 ? 99 : aIndex) -
            (bIndex === -1 ? 99 : bIndex) || a.name.localeCompare(b.name)
        );
      });
  }, [groups]);

  const groupById = useMemo(() => {
    const map = new Map<string, PriceBookGroup>();
    groups.forEach((group) => map.set(group.id, group));
    return map;
  }, [groups]);

  const typesByGroupId = useMemo(() => {
    const map = new Map<string, string[]>();
    applianceTypes.forEach((type) => {
      const current = map.get(type.appliance_group_id) ?? [];
      current.push(type.appliance_type);
      map.set(type.appliance_group_id, current);
    });
    return map;
  }, [applianceTypes]);

  const activeGroupId = selectedGroupId || orderedGroups[0]?.id || "";

  const filteredItems = useMemo(() => {
    const normalizedSearch = normalizeText(search);

    return visibleItems
      .filter((item) => {
        if (normalizedSearch) {
          const groupName =
            groupById.get(item.appliance_group_id ?? "")?.name ?? "General";
          return itemSearchText(item, aliases, groupName).includes(
            normalizedSearch,
          );
        }

        return activeGroupId
          ? item.appliance_group_id === activeGroupId
          : item.appliance_group_id === null;
      })
      .sort((a, b) => {
        const activeSort = Number(b.active) - Number(a.active);
        const statusSort =
          (a.review_status === "archived" ? 1 : 0) -
          (b.review_status === "archived" ? 1 : 0);
        return activeSort || statusSort || a.name.localeCompare(b.name);
      });
  }, [activeGroupId, aliases, groupById, search, visibleItems]);

  const selectedGroup = activeGroupId
    ? groupById.get(activeGroupId) ?? null
    : null;

  async function fetchWithAuth(url: string, init?: RequestInit) {
    const supabase = getSupabaseBrowserClient();
    const session = await supabase?.auth.getSession();
    const accessToken = session?.data.session?.access_token;

    if (process.env.NODE_ENV !== "production") {
      console.info("[price-book-client-auth]", {
        operation: "fetch_with_auth",
        hasSession: Boolean(session?.data.session),
        hasAccessToken: Boolean(accessToken),
        userIdSuffix: session?.data.session?.user?.id
          ? session.data.session.user.id.slice(-6)
          : null,
      });
    }

    if (!accessToken) {
      throw new Error("Log in again before managing Price Book.");
    }

    return fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
    });
  }

  async function loadPriceBook() {
    setLoadState("loading");
    setMessage(null);
    setLastErrorCode(null);
    setLastDiagnostics(null);

    try {
      const response = await fetchWithAuth("/api/settings/price-book");
      const payload = (await response.json().catch(() => null)) as
        | PriceBookResponse
        | null;

      if (!response.ok || !payload?.ok) {
        setLastErrorCode(payload?.code ?? null);
        setLastDiagnostics(payload?.diagnostics ?? null);
        if (process.env.NODE_ENV !== "production") {
          console.info("[price-book-client-auth]", {
            operation: "load_failed",
            status: response.status,
            code: payload?.code ?? null,
            hasMessage: Boolean(payload?.message),
          });
        }
        throw new Error(payload?.message ?? "Price Book could not be loaded.");
      }

      setGroups(payload.groups ?? []);
      setApplianceTypes(payload.applianceTypes ?? []);
      setItems(payload.items ?? []);
      setAliases(payload.aliases ?? []);
      setBundleItems(payload.bundleItems ?? []);
      setRole(payload.role ?? "viewer");
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setMessage(
        error instanceof Error ? error.message : "Price Book could not be loaded.",
      );
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPriceBook();
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreateRepair() {
    setForm({
      ...EMPTY_FORM,
      applianceGroupId: activeGroupId,
      applianceType: typesByGroupId.get(activeGroupId)?.[0] ?? "",
    });
    setDuplicates([]);
    setChildSearch("");
    setEditorOpen(true);
  }

  function openItem(item: PriceBookItem) {
    setForm(formFromItem(item, aliases, bundleItems));
    setDuplicates([]);
    setChildSearch("");
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setDuplicates([]);
    setChildSearch("");
  }

  async function submitItem(
    event?: Pick<FormEvent<HTMLFormElement>, "preventDefault">,
    duplicateAction?: string,
  ) {
    event?.preventDefault();

    if (!canEdit) {
      setMessage("This account can use Price Book items but cannot create repairs.");
      return;
    }

    setIsSaving(true);
    setMessage(null);
    setDuplicates([]);

    try {
      const method = form.id ? "PATCH" : "POST";
      const response = await fetchWithAuth("/api/settings/price-book", {
        method,
        body: JSON.stringify(buildPayload(form, duplicateAction)),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        duplicateCandidates?: DuplicateCandidate[];
      } | null;

      if (response.status === 409 && payload?.duplicateCandidates?.length) {
        setDuplicates(payload.duplicateCandidates);
        setMessage("Similar repair already exists.");
        return;
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? "Repair could not be saved.");
      }

      setMessage(form.id ? "Repair updated." : "Repair created.");
      closeEditor();
      await loadPriceBook();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Repair could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateReviewStatus(
    item: PriceBookItem,
    reviewStatus: PriceBookItem["review_status"],
  ) {
    const nextForm = {
      ...formFromItem(item, aliases, bundleItems),
      reviewStatus,
      active: reviewStatus !== "archived",
    };

    if (
      reviewStatus === "archived" &&
      !window.confirm(`Archive "${item.name}"?`)
    ) {
      return;
    }

    setIsSaving(true);
    setMessage(null);
    setOpenMenuItemId(null);

    try {
      const response = await fetchWithAuth("/api/settings/price-book", {
        method: "PATCH",
        body: JSON.stringify(buildPayload(nextForm)),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? "Review update failed.");
      }

      setMessage(reviewStatus === "archived" ? "Repair archived." : "Repair restored.");
      await loadPriceBook();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review update failed.");
    } finally {
      setIsSaving(false);
    }
  }

  function duplicateItem(item: PriceBookItem) {
    const next = formFromItem(item, aliases, bundleItems);
    setForm({
      ...next,
      id: null,
      name: `${next.name} Copy`,
      reviewStatus: canApprove ? "approved" : "pending",
      active: true,
    });
    setDuplicates([]);
    setOpenMenuItemId(null);
    setEditorOpen(true);
  }

  const childSearchResults = useMemo(() => {
    const normalizedSearch = normalizeText(childSearch);
    const selectedChildIds = new Set(
      form.bundleChildren.map((child) => child.childItemId),
    );

    return visibleItems
      .filter(
        (item) =>
          item.id !== form.id &&
          item.item_type !== "bundle" &&
          !selectedChildIds.has(item.id) &&
          item.active &&
          item.review_status === "approved",
      )
      .filter((item) => {
        if (!normalizedSearch) {
          return item.appliance_group_id === form.applianceGroupId;
        }

        const groupName =
          groupById.get(item.appliance_group_id ?? "")?.name ?? "General";
        return itemSearchText(item, aliases, groupName).includes(normalizedSearch);
      })
      .slice(0, 8);
  }, [
    aliases,
    childSearch,
    form.applianceGroupId,
    form.bundleChildren,
    form.id,
    groupById,
    visibleItems,
  ]);

  return (
    <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#0F172A]">Price Book</h2>
          <p className="mt-1 text-sm leading-6 text-[#64748B]">
            Repair solutions used for estimates and invoices.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateRepair}
          disabled={!canEdit}
          className="inline-flex items-center justify-center rounded-full bg-[#2563EB] px-4 py-2 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
        >
          + New Repair
        </button>
      </div>

      {message ? (
        <div
          data-price-book-error-code={lastErrorCode ?? undefined}
          data-price-book-user-suffix={
            lastDiagnostics?.authenticatedUserIdSuffix ?? undefined
          }
          data-price-book-resolver-stage={
            lastDiagnostics?.resolverStage ?? undefined
          }
          data-price-book-membership-count={
            lastDiagnostics?.membership?.membershipRowCount === undefined
              ? undefined
              : String(lastDiagnostics.membership.membershipRowCount)
          }
          data-price-book-rpc-company-present={
            lastDiagnostics?.membership?.currentDashboardCompanyIdPresent ===
            undefined
              ? undefined
              : String(
                  lastDiagnostics.membership.currentDashboardCompanyIdPresent,
                )
          }
          data-price-book-membership-state={
            lastDiagnostics?.membership?.membershipRows
              ?.map(
                (row) =>
                  `${row.companyIdSuffix ?? "none"}:${row.memberRole ?? "none"}:${row.memberStatus ?? "none"}:${row.archived ? "archived" : "not_archived"}:${row.removed ? "removed" : "not_removed"}:${row.suspended ? "suspended" : "not_suspended"}:${row.companyExists ? "company_exists" : "company_missing"}:${row.companyStatus ?? "no_status"}`,
              )
              .join("|") || undefined
          }
          className="mt-4 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-sm font-semibold text-[#1D4ED8]"
        >
          {message}
        </div>
      ) : null}

      <div className="mt-5">
        <label className="sr-only" htmlFor="price-book-search">
          Search Price Book
        </label>
        <input
          id="price-book-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search repair, brand, symptom, keyword"
          className="w-full rounded-xl border border-[#D1D5DB] px-4 py-3 text-sm outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
        />
      </div>

      <div className="mt-5 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-5">
        <div className="lg:hidden">
          <label className="sr-only" htmlFor="price-book-group">
            Appliance category
          </label>
          <select
            id="price-book-group"
            value={activeGroupId}
            onChange={(event) => setSelectedGroupId(event.target.value)}
            className="w-full rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-sm font-semibold text-[#0F172A]"
          >
            {orderedGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {getGroupLabel(group)}
              </option>
            ))}
          </select>
        </div>

        <nav className="hidden rounded-xl border border-[#E5E7EB] p-2 lg:block">
          {orderedGroups.map((group) => {
                const isSelected = group.id === activeGroupId;
            const types = typesByGroupId.get(group.id) ?? [];

            return (
              <button
                key={group.id}
                type="button"
                onClick={() => setSelectedGroupId(group.id)}
                className={`mb-1 block w-full rounded-lg px-3 py-2 text-left transition ${
                  isSelected
                    ? "bg-[#EFF6FF] text-[#1D4ED8]"
                    : "text-[#334155] hover:bg-[#F8FAFC]"
                }`}
              >
                <span className="block text-sm font-bold">
                  {getGroupLabel(group)}
                </span>
                {types.length > 0 ? (
                  <span className="mt-0.5 block truncate text-xs text-[#64748B]">
                    {types.slice(0, 3).join(", ")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="mt-4 lg:mt-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#0F172A]">
                {search.trim()
                  ? "Search results"
                  : selectedGroup
                    ? getGroupLabel(selectedGroup)
                    : "Repairs"}
              </h3>
              <p className="text-xs text-[#64748B]">
                {filteredItems.length} repair
                {filteredItems.length === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadPriceBook()}
              className="text-xs font-semibold text-[#64748B] hover:text-[#2563EB]"
            >
              Refresh
            </button>
          </div>

          {loadState === "loading" ? (
            <div className="rounded-xl border border-dashed border-[#CBD5E1] p-6 text-sm text-[#64748B]">
              Loading Price Book...
            </div>
          ) : loadState === "error" ? (
            <div className="rounded-xl border border-dashed border-[#FCA5A5] p-6 text-sm text-[#991B1B]">
              Price Book is unavailable until migration 0066 is applied and the
              dashboard session can access the company.
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#CBD5E1] p-6 text-sm text-[#64748B]">
              No repair solutions match this view.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#E5E7EB]">
              {filteredItems.map((item, index) => {
                const group = groupById.get(item.appliance_group_id ?? "");
                const showCategory =
                  Boolean(search.trim()) && group && group.id !== activeGroupId;

                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openItem(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        openItem(item);
                      }
                    }}
                    className={`relative grid cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 bg-white px-4 py-3 transition hover:bg-[#F8FAFC] ${
                      index > 0 ? "border-t border-[#E5E7EB]" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-bold text-[#0F172A]">
                          {item.name}
                        </p>
                        {item.item_type === "bundle" ? (
                          <span className="shrink-0 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-bold uppercase text-[#047857]">
                            Bundle
                          </span>
                        ) : null}
                        {item.review_status === "pending" ? (
                          <span className="shrink-0 rounded-full bg-[#FFFBEB] px-2 py-0.5 text-[10px] font-bold uppercase text-[#B45309]">
                            Pending
                          </span>
                        ) : null}
                        {!item.active || item.review_status === "archived" ? (
                          <span className="shrink-0 rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-bold uppercase text-[#64748B]">
                            Inactive
                          </span>
                        ) : null}
                      </div>
                      {showCategory ? (
                        <p className="mt-0.5 text-xs text-[#64748B]">
                          {group?.name}
                          {item.appliance_type ? ` • ${item.appliance_type}` : ""}
                        </p>
                      ) : null}
                    </div>

                    <p className="text-sm font-bold text-[#0F172A]">
                      {formatMoney(item.total_price)}
                    </p>

                    <div className="relative">
                      <button
                        type="button"
                        aria-label={`Actions for ${item.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenMenuItemId((current) =>
                            current === item.id ? null : item.id,
                          );
                        }}
                        className="rounded-full px-2 py-1 text-lg leading-none text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#0F172A]"
                      >
                        ⋯
                      </button>
                      {openMenuItemId === item.id ? (
                        <div
                          onClick={(event) => event.stopPropagation()}
                          className="absolute right-0 top-8 z-10 w-44 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-lg"
                        >
                          <button
                            type="button"
                            onClick={() => duplicateItem(item)}
                            className="block w-full px-3 py-2 text-left text-sm font-semibold text-[#0F172A] hover:bg-[#F8FAFC]"
                          >
                            Duplicate
                          </button>
                          {item.review_status === "archived" || !item.active ? (
                            <button
                              type="button"
                              onClick={() => void updateReviewStatus(item, "approved")}
                              className="block w-full px-3 py-2 text-left text-sm font-semibold text-[#047857] hover:bg-[#F8FAFC]"
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void updateReviewStatus(item, "archived")}
                              className="block w-full px-3 py-2 text-left text-sm font-semibold text-[#B45309] hover:bg-[#F8FAFC]"
                            >
                              Archive
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#020617]/40 p-0 sm:items-center sm:p-4">
          <form
            onSubmit={(event) => void submitItem(event)}
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-3xl sm:rounded-3xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E5E7EB] bg-white px-5 py-4">
              <div>
                <h3 className="text-lg font-bold text-[#0F172A]">
                  {form.id ? "Edit Repair" : "New Repair"}
                </h3>
                <p className="text-xs text-[#64748B]">
                  Customer view first. Advanced settings stay tucked away.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-full px-3 py-2 text-sm font-bold text-[#64748B] hover:bg-[#F8FAFC]"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <section>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#2563EB]">
                  Customer View
                </p>
                <div className="mt-3 grid gap-3">
                  <input
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Repair Name"
                    className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                    required
                  />
                  <textarea
                    value={form.customerDescription}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        customerDescription: event.target.value,
                      }))
                    }
                    placeholder="Customer Description"
                    className="min-h-20 rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={form.totalPrice}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          totalPrice: event.target.value,
                        }))
                      }
                      placeholder="Total Price"
                      inputMode="decimal"
                      className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                    />
                    <select
                      value={form.applianceGroupId}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          applianceGroupId: event.target.value,
                          applianceType:
                            typesByGroupId.get(event.target.value)?.[0] ??
                            current.applianceType,
                        }))
                      }
                      className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                    >
                      <option value="">General</option>
                      {orderedGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {getGroupLabel(group)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Included Work"
                    className="min-h-20 rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                  />
                </div>
              </section>

              <details className="rounded-xl border border-[#E5E7EB] px-4 py-3">
                <summary className="cursor-pointer text-sm font-bold text-[#0F172A]">
                  Appliance & Matching
                </summary>
                <div className="mt-3 grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={form.applianceType}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          applianceType: event.target.value,
                        }))
                      }
                      placeholder="Appliance Type"
                      list="price-book-appliance-types"
                      className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                    />
                    <input
                      value={form.brand}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          brand: event.target.value,
                        }))
                      }
                      placeholder="Brand"
                      className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                    />
                  </div>
                  <input
                    value={form.aliases}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        aliases: event.target.value,
                      }))
                    }
                    placeholder="Aliases, comma separated"
                    className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                  />
                  <input
                    value={form.aiKeywords}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        aiKeywords: event.target.value,
                      }))
                    }
                    placeholder="Symptoms and keywords, comma separated"
                    className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                  />
                </div>
              </details>

              <details className="rounded-xl border border-[#E5E7EB] px-4 py-3">
                <summary className="cursor-pointer text-sm font-bold text-[#0F172A]">
                  Internal Pricing
                </summary>
                <div className="mt-3 grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <select
                      value={form.itemType}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          itemType: event.target.value as PriceBookItem["item_type"],
                        }))
                      }
                      className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                    >
                      {Object.entries(itemTypeLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={form.laborPrice}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          laborPrice: event.target.value,
                        }))
                      }
                      placeholder="Labor Allocation"
                      inputMode="decimal"
                      className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                    />
                    <input
                      value={form.partPrice}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          partPrice: event.target.value,
                        }))
                      }
                      placeholder="Parts Allocation"
                      inputMode="decimal"
                      className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <input
                      value={form.estimatedDurationMinutes}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          estimatedDurationMinutes: event.target.value,
                        }))
                      }
                      placeholder="Duration Minutes"
                      inputMode="numeric"
                      className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                    />
                    <input
                      value={form.unit}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          unit: event.target.value,
                        }))
                      }
                      placeholder="Unit"
                      className="rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                    />
                    <label className="flex items-center justify-between rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-semibold text-[#334155]">
                      Taxable
                      <input
                        type="checkbox"
                        checked={form.taxable}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            taxable: event.target.checked,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <textarea
                    value={form.internalNotes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        internalNotes: event.target.value,
                      }))
                    }
                    placeholder="Internal notes"
                    className="min-h-20 rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                  />
                </div>
              </details>

              <details className="rounded-xl border border-[#E5E7EB] px-4 py-3">
                <summary className="cursor-pointer text-sm font-bold text-[#0F172A]">
                  Warranty
                </summary>
                <textarea
                  value={form.warrantyText}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      warrantyText: event.target.value,
                    }))
                  }
                  placeholder="Default warranty or custom override"
                  className="mt-3 min-h-20 w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                />
              </details>

              {form.itemType === "bundle" ? (
                <details
                  className="rounded-xl border border-[#E5E7EB] px-4 py-3"
                  open
                >
                  <summary className="cursor-pointer text-sm font-bold text-[#0F172A]">
                    Bundle Content
                  </summary>
                  <div className="mt-3 space-y-2">
                    {form.bundleChildren.length === 0 ? (
                      <p className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-sm text-[#64748B]">
                        No included work yet.
                      </p>
                    ) : (
                      form.bundleChildren.map((child, index) => {
                        const childItem = visibleItems.find(
                          (item) => item.id === child.childItemId,
                        );
                        return (
                          <div
                            key={`${child.childItemId}-${index}`}
                            className="rounded-lg border border-[#E5E7EB] px-3 py-2"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-[#0F172A]">
                                  {childItem?.name ?? "Unknown work"}
                                </p>
                                <p className="text-xs text-[#64748B]">
                                  {child.isOptional ? "Optional" : "Required"}
                                  {child.hiddenInternal ? " • Internal only" : ""}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setForm((current) => ({
                                    ...current,
                                    bundleChildren: current.bundleChildren.filter(
                                      (_, childIndex) => childIndex !== index,
                                    ),
                                  }))
                                }
                                className="text-xs font-bold text-[#B91C1C]"
                              >
                                Remove
                              </button>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-[#334155]">
                              <label className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={child.isOptional}
                                  onChange={(event) =>
                                    setForm((current) => ({
                                      ...current,
                                      bundleChildren: current.bundleChildren.map(
                                        (row, childIndex) =>
                                          childIndex === index
                                            ? {
                                                ...row,
                                                isOptional: event.target.checked,
                                                isRequired: !event.target.checked,
                                              }
                                            : row,
                                      ),
                                    }))
                                  }
                                />
                                Optional
                              </label>
                              <label className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={child.hiddenInternal}
                                  onChange={(event) =>
                                    setForm((current) => ({
                                      ...current,
                                      bundleChildren: current.bundleChildren.map(
                                        (row, childIndex) =>
                                          childIndex === index
                                            ? {
                                                ...row,
                                                hiddenInternal:
                                                  event.target.checked,
                                              }
                                            : row,
                                      ),
                                    }))
                                  }
                                />
                                Internal only
                              </label>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="mt-3">
                    <input
                      value={childSearch}
                      onChange={(event) => setChildSearch(event.target.value)}
                      placeholder="Search work to include"
                      className="w-full rounded-xl border border-[#D1D5DB] px-3 py-2 text-sm"
                    />
                    {childSearchResults.length > 0 ? (
                      <div className="mt-2 overflow-hidden rounded-xl border border-[#E5E7EB]">
                        {childSearchResults.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setForm((current) => ({
                                ...current,
                                bundleChildren: [
                                  ...current.bundleChildren,
                                  {
                                    childItemId: item.id,
                                    defaultQuantity: 1,
                                    isOptional: false,
                                    isRequired: true,
                                    bundledPriceOverride: null,
                                    useChildPrice: true,
                                    hiddenInternal: false,
                                    customerExpandedDescription: "",
                                  },
                                ],
                              }));
                              setChildSearch("");
                            }}
                            className="flex w-full items-center justify-between gap-3 border-t border-[#E5E7EB] px-3 py-2 text-left first:border-t-0 hover:bg-[#F8FAFC]"
                          >
                            <span className="truncate text-sm font-semibold text-[#0F172A]">
                              {item.name}
                            </span>
                            <span className="text-sm font-bold text-[#0F172A]">
                              {formatMoney(item.total_price)}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </details>
              ) : null}

              {duplicates.length > 0 ? (
                <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-4">
                  <p className="text-sm font-bold text-[#92400E]">
                    Similar repair already exists
                  </p>
                  <div className="mt-3 space-y-2">
                    {duplicates.map((duplicate) => {
                      const existing = visibleItems.find(
                        (item) => item.id === duplicate.id,
                      );
                      return (
                        <div
                          key={duplicate.id}
                          className="rounded-lg bg-white px-3 py-2"
                        >
                          <p className="text-sm font-bold text-[#0F172A]">
                            {duplicate.name}
                          </p>
                          <p className="text-xs text-[#64748B]">
                            {duplicate.matchReason.replace(/_/g, " ")}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {existing ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openItem(existing)}
                                  className="rounded-full bg-[#0F172A] px-3 py-1.5 text-xs font-bold text-white"
                                >
                                  Open Existing
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openItem(existing)}
                                  className="rounded-full border border-[#D1D5DB] px-3 py-1.5 text-xs font-bold text-[#0F172A]"
                                >
                                  Use Existing
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canApprove ? (
                      <button
                        type="button"
                        onClick={() => void submitItem(undefined, "create_anyway")}
                        className="rounded-full border border-[#D97706] px-3 py-1.5 text-xs font-bold text-[#92400E]"
                      >
                        Continue as New
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setDuplicates([])}
                      className="rounded-full border border-[#D1D5DB] px-3 py-1.5 text-xs font-bold text-[#334155]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-[#E5E7EB] bg-white px-5 py-4">
              <button
                type="button"
                onClick={closeEditor}
                className="rounded-full border border-[#D1D5DB] px-4 py-2 text-sm font-bold text-[#0F172A]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !canEdit}
                className="rounded-full bg-[#2563EB] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-[#CBD5E1]"
              >
                {isSaving ? "Saving..." : "Save Repair"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <datalist id="price-book-appliance-types">
        {applianceTypes.map((type) => (
          <option key={type.id} value={type.appliance_type} />
        ))}
      </datalist>
    </section>
  );
}
