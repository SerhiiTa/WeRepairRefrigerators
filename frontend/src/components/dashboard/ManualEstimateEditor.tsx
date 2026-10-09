"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";

import {
  CustomerEstimatePreview,
  type CustomerEstimatePreviewData,
} from "@/components/public/CustomerEstimatePreview";
import {
  formatServiceRequestMoney,
  formatServiceRequestSource,
  type DashboardServiceRequest,
  type DashboardServiceRequestEstimate,
  type DashboardServiceRequestEstimateItem,
} from "@/lib/service-request-records";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { calculateRepairProposalTotals } from "@/server/finance/repair-proposal-calculations";

type ManualEstimateLineType = "labor" | "part" | "service" | "fee" | "other";

type ManualEstimateLine = {
  id: string;
  type: ManualEstimateLineType;
  name: string;
  description: string;
  quantity: number;
  customerUnitPrice: number;
  internalUnitCost: number;
  taxable: boolean;
  customerVisible: boolean;
  warrantyIncluded: boolean;
  partNumber: string;
  vendor: string;
  internalNote: string;
};

type ManualEstimateMetadata = {
  version: "manual-estimate-editor-v1";
  whatWeFound: string;
  repairSolution: string;
  estimatedCompletion: string;
};

type EstimateDeliveryChannel = "sms" | "email";

type EstimateDeliveryRequest = {
  channel: EstimateDeliveryChannel;
  recipient: string;
  messagePreview: string;
  idempotencyKey: string;
  allowCustomerEmailReplacement?: boolean;
};

type PriceBookItemType = "labor" | "part" | "service" | "fee" | "bundle";

type PriceBookSearchItem = {
  id: string;
  item_type: PriceBookItemType;
  name: string;
  description: string | null;
  appliance_type: string | null;
  brand: string | null;
  default_quantity: number;
  labor_price: number;
  part_price: number;
  total_price: number;
  taxable: boolean;
  customer_description: string | null;
  active: boolean;
  review_status: string;
  archived_at?: string | null;
};

type PriceBookAlias = {
  price_book_item_id: string;
  alias: string;
  normalized_alias: string;
};

type PriceBookSearchState =
  | { status: "idle"; message: null }
  | { status: "loading"; message: null }
  | { status: "ready"; message: null }
  | { status: "error"; message: string };

type ManualEstimateEditorProps = {
  request: DashboardServiceRequest;
  initialEstimate: DashboardServiceRequestEstimate | null;
  estimates?: DashboardServiceRequestEstimate[];
  activeEstimateId?: string | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  onSwitchEstimate?: (estimate: DashboardServiceRequestEstimate) => void;
  onApproveForCustomer: (estimate: {
    id: string;
    estimateNumber: string;
  }) =>
    | Promise<{ ok: true } | { ok: false; message: string }>
    | { ok: true }
    | { ok: false; message: string };
  onSendEstimate: (estimate: {
    id: string;
    estimateNumber: string;
    delivery: EstimateDeliveryRequest;
  }) => Promise<boolean> | boolean;
  onReviseEstimate?: (estimate: {
    id: string;
    estimateNumber: string;
  }) =>
    | Promise<{ ok: true } | { ok: false; message: string }>
    | { ok: true }
    | { ok: false; message: string };
  onDeleteEstimate?: (estimate: {
    id: string;
    estimateNumber: string;
  }) => Promise<boolean> | boolean;
  onUndoApproval?: (estimate: {
    id: string;
    estimateNumber: string;
  }) =>
    | Promise<{ ok: true } | { ok: false; message: string }>
    | { ok: true }
    | { ok: false; message: string };
  onCreateInvoice?: (estimate: DashboardServiceRequestEstimate) => Promise<void> | void;
  onCollectPayment?: (estimate: DashboardServiceRequestEstimate) => void;
  customerHref?: string | null;
  linkedInvoiceNumber?: string | null;
  depositPaid?: number;
  isCreatingInvoice?: boolean;
  sendingEstimateId: string | null;
};

type EstimateWorkspaceTab =
  | "details"
  | "items"
  | "terms"
  | "notes"
  | "attachments"
  | "history";

type SaveState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type SaveResult = {
  id: string;
  estimateNumber: string;
} | null;

type DeleteState =
  | { status: "idle"; message: null }
  | { status: "deleting"; message: null }
  | { status: "error"; message: string };

type ItemDraftState = {
  mode: "add" | "edit";
  lineId: string | null;
  line: ManualEstimateLine;
} | null;

const lineTypeOptions = [
  { value: "part", label: "Part" },
  { value: "labor", label: "Labor" },
  { value: "service", label: "Service" },
  { value: "fee", label: "Fee" },
  { value: "other", label: "Other" },
] as const satisfies readonly { value: ManualEstimateLineType; label: string }[];

function iconPath(name: "back" | "more" | "edit" | "plus" | "trash" | "mic") {
  if (name === "back") {
    return <path d="m15 18-6-6 6-6" />;
  }

  if (name === "more") {
    return (
      <>
        <path d="M12 5h.01" />
        <path d="M12 12h.01" />
        <path d="M12 19h.01" />
      </>
    );
  }

  if (name === "edit") {
    return (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </>
    );
  }

  if (name === "plus") {
    return (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    );
  }

  if (name === "trash") {
    return (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M6 6l1 15h10l1-15" />
      </>
    );
  }

  return (
    <>
      <path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Z" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </>
  );
}

function EstimateIcon({
  name,
  className,
}: {
  name: "back" | "more" | "edit" | "plus" | "trash" | "mic";
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className ?? "h-5 w-5"}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.2}
      viewBox="0 0 24 24"
    >
      {iconPath(name)}
    </svg>
  );
}

function EstimateCustomerCardContent({
  address,
  customerInitials,
  customerName,
  customerPhone,
}: {
  address: string;
  customerInitials: string;
  customerName: string;
  customerPhone: string | null;
}) {
  return (
    <>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-black text-[#0F6BFF]">
        {customerInitials}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-black leading-5 tracking-[-0.02em] text-[#0F172A]">
          {customerName}
        </h3>
        {customerPhone ? (
          <p className="mt-1 text-sm font-semibold leading-5 text-[#475569]">
            {customerPhone}
          </p>
        ) : null}
        {address ? (
          <p className="mt-0.5 text-sm font-semibold leading-5 text-[#475569]">
            {address}
          </p>
        ) : null}
      </div>
      <span className="self-center text-xl text-[#64748B]">›</span>
    </>
  );
}

function buildLineId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `manual-line-${crypto.randomUUID()}`;
  }

  return `manual-line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isPersistedEstimateUuid(value: string | null): value is string {
  return Boolean(
    value?.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    ),
  );
}

function formatCompactJobNumber(request: DashboardServiceRequest) {
  return `Job #${request.jobNumber?.toString() ?? "Pending"}`;
}

function mapPriceBookTypeToLineType(
  itemType: PriceBookItemType,
): ManualEstimateLineType {
  if (itemType === "labor" || itemType === "part" || itemType === "service" || itemType === "fee") {
    return itemType;
  }

  return "service";
}

function getPriceBookSellPrice(item: PriceBookSearchItem) {
  const totalPrice = Number(item.total_price);

  if (Number.isFinite(totalPrice) && totalPrice > 0) {
    return totalPrice;
  }

  const laborPrice = Number(item.labor_price);
  const partPrice = Number(item.part_price);
  const fallbackPrice = (Number.isFinite(laborPrice) ? laborPrice : 0) +
    (Number.isFinite(partPrice) ? partPrice : 0);

  return Math.max(0, fallbackPrice);
}

function normalizePriceBookSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function createLineFromPriceBookItem(item: PriceBookSearchItem): ManualEstimateLine {
  return {
    id: buildLineId(),
    type: mapPriceBookTypeToLineType(item.item_type),
    name: item.name,
    description: item.customer_description ?? item.description ?? "",
    quantity: Number(item.default_quantity) > 0 ? Number(item.default_quantity) : 1,
    customerUnitPrice: getPriceBookSellPrice(item),
    internalUnitCost: 0,
    taxable: item.taxable,
    customerVisible: true,
    warrantyIncluded: false,
    partNumber: "",
    vendor: "",
    internalNote: "",
  };
}

function createBlankLine(type: ManualEstimateLineType = "part"): ManualEstimateLine {
  return {
    id: buildLineId(),
    type,
    name: "",
    description: "",
    quantity: 1,
    customerUnitPrice: 0,
    internalUnitCost: 0,
    taxable: type === "part",
    customerVisible: true,
    warrantyIncluded: false,
    partNumber: "",
    vendor: "",
    internalNote: "",
  };
}

function getRequestAddress(request: DashboardServiceRequest) {
  const streetLine = [request.streetAddress, request.unit].filter(Boolean).join(", ");
  const cityLine = [
    request.city,
    [request.state, request.zipCode].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return [streetLine || request.fullAddress, cityLine, request.country]
    .filter(Boolean)
    .join(", ");
}

function parseMetadata(value: string | null): Partial<ManualEstimateMetadata> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const record = parsed as Record<string, unknown>;

    if (record.version !== "manual-estimate-editor-v1") {
      return {};
    }

    return {
      version: "manual-estimate-editor-v1",
      whatWeFound:
        typeof record.whatWeFound === "string" ? record.whatWeFound : "",
      repairSolution:
        typeof record.repairSolution === "string" ? record.repairSolution : "",
      estimatedCompletion:
        typeof record.estimatedCompletion === "string"
          ? record.estimatedCompletion
          : "",
    };
  } catch {
    return {};
  }
}

function parseLineNotes(value: string | null): {
  partNumber: string;
  vendor: string;
  internalNote: string;
} {
  if (!value) {
    return { partNumber: "", vendor: "", internalNote: "" };
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { partNumber: "", vendor: "", internalNote: value };
    }

    const record = parsed as Record<string, unknown>;

    if (record.version !== "manual-estimate-line-v1") {
      return { partNumber: "", vendor: "", internalNote: value };
    }

    return {
      partNumber: typeof record.partNumber === "string" ? record.partNumber : "",
      vendor: typeof record.vendor === "string" ? record.vendor : "",
      internalNote:
        typeof record.internalNote === "string" ? record.internalNote : "",
    };
  } catch {
    return { partNumber: "", vendor: "", internalNote: value };
  }
}

function lineTypeFromEstimateItem(
  item: DashboardServiceRequestEstimateItem,
): ManualEstimateLineType {
  if (item.lineType === "material") {
    return "service";
  }

  if (item.lineType === "custom") {
    return "other";
  }

  if (item.lineType === "part" || item.lineType === "labor") {
    return item.lineType;
  }

  return "other";
}

function lineTypeToApiType(
  type: ManualEstimateLineType,
): "labor" | "part" | "material" | "custom" {
  if (type === "service") {
    return "material";
  }

  if (type === "fee" || type === "other") {
    return "custom";
  }

  return type;
}

function lineTypeLabel(type: ManualEstimateLineType) {
  return lineTypeOptions.find((option) => option.value === type)?.label ?? "Other";
}

function estimateLineToManualLine(
  item: DashboardServiceRequestEstimateItem,
): ManualEstimateLine {
  const noteData = parseLineNotes(item.notes);

  return {
    id: item.id,
    type: lineTypeFromEstimateItem(item),
    name: item.customerName ?? item.itemTitle,
    description: item.publicDescription ?? "",
    quantity: item.quantity,
    customerUnitPrice: item.unitPrice,
    internalUnitCost: item.internalCost ?? item.technicianCost ?? 0,
    taxable: item.taxable,
    customerVisible: item.lineType !== "warranty",
    warrantyIncluded: Boolean(item.warrantyText),
    partNumber: noteData.partNumber,
    vendor: noteData.vendor,
    internalNote: noteData.internalNote,
  };
}

function buildLineNotes(line: ManualEstimateLine) {
  const payload = {
    version: "manual-estimate-line-v1",
    partNumber: line.partNumber.trim(),
    vendor: line.vendor.trim(),
    internalNote: line.internalNote.trim(),
  };

  if (!payload.partNumber && !payload.vendor && !payload.internalNote) {
    return null;
  }

  return JSON.stringify(payload);
}

function safeNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function formatMoneyInputValue(value: number) {
  return safeNumber(value).toFixed(2);
}

function sanitizeMoneyInputValue(value: string) {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const [integer = "", ...decimalParts] = normalized.split(".");
  const decimal = decimalParts.join("").slice(0, 2);

  if (!normalized.includes(".")) {
    return integer;
  }

  return `${integer}.${decimal}`;
}

function parseMoneyInputValue(value: string) {
  if (value.trim() === "" || value === ".") {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function limitMetadataText(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength);
}

function normalizePhoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

function isValidEstimateSmsRecipient(value: string) {
  const digits = normalizePhoneDigits(value);

  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

function isValidEstimateEmailRecipient(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function createEstimateDeliveryIdempotencyKey(
  estimateId: string,
  channel: EstimateDeliveryChannel,
  recipient: string,
) {
  return [
    "estimate-delivery",
    estimateId,
    channel,
    recipient.trim().toLowerCase(),
    Date.now().toString(36),
  ].join(":");
}

function getLineTotal(line: ManualEstimateLine) {
  return Math.round(line.quantity * line.customerUnitPrice * 100) / 100;
}

function getInitialMetadata(
  request: DashboardServiceRequest,
  estimate: DashboardServiceRequestEstimate | null,
) {
  const metadata = parseMetadata(estimate?.customerPreviewNotes ?? null);

  return {
    whatWeFound:
      metadata.whatWeFound ??
      estimate?.customerPreviewNotes ??
      request.issueDescription ??
      "",
    repairSolution:
      metadata.repairSolution ??
      estimate?.items.find((item) => item.lineType !== "warranty")?.customerName ??
      "",
    estimatedCompletion:
      metadata.estimatedCompletion ??
      "After approval and parts availability are confirmed.",
  };
}

function getInitialEstimateLines(
  estimate: DashboardServiceRequestEstimate | null,
) {
  return (
    estimate?.items
      .filter((item) => item.lineType !== "warranty")
      .map(estimateLineToManualLine) ?? []
  );
}

function getInitialWarrantyText(
  estimate: DashboardServiceRequestEstimate | null,
) {
  return (
    estimate?.warrantyText ??
    "90 days labor and installed parts unless otherwise specified."
  );
}

export function ManualEstimateEditor({
  request,
  initialEstimate,
  estimates = [],
  activeEstimateId,
  onClose,
  onSaved,
  onSwitchEstimate,
  onApproveForCustomer,
  onSendEstimate,
  onReviseEstimate,
  onDeleteEstimate,
  onUndoApproval,
  onCreateInvoice,
  onCollectPayment,
  customerHref,
  linkedInvoiceNumber,
  depositPaid = 0,
  isCreatingInvoice = false,
  sendingEstimateId,
}: ManualEstimateEditorProps) {
  const router = useRouter();
  const initialMetadata = useMemo(
    () => getInitialMetadata(request, initialEstimate),
    [initialEstimate, request],
  );
  const [savedEstimateId, setSavedEstimateId] = useState<string | null>(
    initialEstimate?.id ?? null,
  );
  const [savedEstimateNumber, setSavedEstimateNumber] = useState<string | null>(
    initialEstimate?.estimateNumber ?? null,
  );
  const [estimateStatus, setEstimateStatus] = useState<
    DashboardServiceRequestEstimate["estimateStatus"] | "unsaved"
  >(initialEstimate?.estimateStatus ?? "unsaved");
  const [whatWeFound, setWhatWeFound] = useState(initialMetadata.whatWeFound);
  const [repairSolution, setRepairSolution] = useState(
    initialMetadata.repairSolution,
  );
  const [estimatedCompletion, setEstimatedCompletion] = useState(
    initialMetadata.estimatedCompletion,
  );
  const [warrantyText, setWarrantyText] = useState(
    getInitialWarrantyText(initialEstimate),
  );
  const [lines, setLines] = useState<ManualEstimateLine[]>(
    () => getInitialEstimateLines(initialEstimate),
  );
  const [discountType, setDiscountType] = useState<"flat" | "percent">(
    initialEstimate?.discountType ?? "flat",
  );
  const [discountValue, setDiscountValue] = useState(
    String(initialEstimate?.discountValue ?? 0),
  );
  const [taxRate, setTaxRate] = useState(String(initialEstimate?.taxRate ?? 8.25));
  const [itemDraft, setItemDraft] = useState<ItemDraftState>(null);
  const [openLineMenuId, setOpenLineMenuId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({
    status: "idle",
    message: null,
  });
  const [pendingAction, setPendingAction] = useState<
    "save" | "send" | "approve" | "revise" | null
  >(null);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isEstimateMenuOpen, setIsEstimateMenuOpen] = useState(false);
  const [isAddItemMenuOpen, setIsAddItemMenuOpen] = useState(false);
  const [isSendEstimateOpen, setIsSendEstimateOpen] = useState(false);
  const [deliveryChannel, setDeliveryChannel] =
    useState<EstimateDeliveryChannel>("sms");
  const [deliveryRecipient, setDeliveryRecipient] = useState(
    request.customerPhone ?? "",
  );
  const [deliveryRecipientTouched, setDeliveryRecipientTouched] =
    useState(false);
  const [allowCustomerEmailReplacement, setAllowCustomerEmailReplacement] =
    useState(false);
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);
  const [isUndoApprovalConfirmOpen, setIsUndoApprovalConfirmOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [activeWorkspaceTab, setActiveWorkspaceTab] =
    useState<EstimateWorkspaceTab>("items");
  const [deleteState, setDeleteState] = useState<DeleteState>({
    status: "idle",
    message: null,
  });
  const activeSavePromiseRef = useRef<Promise<SaveResult> | null>(null);
  const lastSavedSignatureRef = useRef("");
  const savedFeedbackTimerRef = useRef<number | null>(null);
  const [priceBookItems, setPriceBookItems] = useState<PriceBookSearchItem[]>([]);
  const [priceBookAliases, setPriceBookAliases] = useState<PriceBookAlias[]>([]);
  const [priceBookSearch, setPriceBookSearch] = useState("");
  const [priceBookState, setPriceBookState] = useState<PriceBookSearchState>({
    status: "idle",
    message: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadPriceBook() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setPriceBookState({
            status: "error",
            message: "Price Book is not available for this workspace.",
          });
        }
        return;
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (sessionError || !accessToken) {
        if (isMounted) {
          setPriceBookState({
            status: "error",
            message: "Log in again to search Price Book.",
          });
        }
        return;
      }

      if (isMounted) {
        setPriceBookState({ status: "loading", message: null });
      }

      try {
        const response = await fetch("/api/settings/price-book", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          message?: string;
          items?: PriceBookSearchItem[];
          aliases?: PriceBookAlias[];
        } | null;

        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.message ?? "Price Book could not be loaded.");
        }

        if (isMounted) {
          setPriceBookItems(Array.isArray(payload.items) ? payload.items : []);
          setPriceBookAliases(Array.isArray(payload.aliases) ? payload.aliases : []);
          setPriceBookState({ status: "ready", message: null });
        }
      } catch (error) {
        if (isMounted) {
          setPriceBookState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Price Book could not be loaded.",
          });
        }
      }
    }

    void loadPriceBook();

    return () => {
      isMounted = false;
    };
  }, []);

  const aliasesByItemId = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const alias of priceBookAliases) {
      map.set(alias.price_book_item_id, [
        ...(map.get(alias.price_book_item_id) ?? []),
        alias.alias,
        alias.normalized_alias,
      ]);
    }

    return map;
  }, [priceBookAliases]);
  const priceBookMatches = useMemo(() => {
    const query = normalizePriceBookSearchText(priceBookSearch);

    if (query.length < 2) {
      return [];
    }

    return priceBookItems
      .filter((item) =>
        item.active &&
        item.archived_at == null &&
        ["approved", "pending"].includes(item.review_status),
      )
      .map((item) => {
        const aliases = aliasesByItemId.get(item.id) ?? [];
        const searchText = normalizePriceBookSearchText(
          [
            item.name,
            item.customer_description,
            item.description,
            item.appliance_type,
            item.brand,
            item.item_type,
            ...aliases,
          ]
            .filter(Boolean)
            .join(" "),
        );
        const normalizedName = normalizePriceBookSearchText(item.name);
        const startsWithName = normalizedName.startsWith(query);
        const includesQuery = searchText.includes(query);

        if (!startsWithName && !includesQuery) {
          return null;
        }

        return { item, score: startsWithName ? 2 : 1 };
      })
      .filter((match): match is { item: PriceBookSearchItem; score: number } =>
        Boolean(match),
      )
      .sort((left, right) =>
        right.score - left.score || left.item.name.localeCompare(right.item.name),
      )
      .slice(0, 6)
      .map((match) => match.item);
  }, [aliasesByItemId, priceBookItems, priceBookSearch]);

  const customerVisibleLines = lines.filter((line) => line.customerVisible);
  const totals = calculateRepairProposalTotals({
    lines: customerVisibleLines.map((line) => ({
      lineType: lineTypeToApiType(line.type),
      quantity: line.quantity,
      unitPrice: line.customerUnitPrice,
      unitCost: line.internalUnitCost,
      taxable: line.taxable,
    })),
    discountType,
    discountValue: Number(discountValue),
    taxRate: Number(taxRate),
  });
  const hasCustomerLinkage = Boolean(request.customerName || request.customerId);
  const itemErrors = new Map<string, string[]>();

  for (const line of lines) {
    const errors: string[] = [];

    if (!line.name.trim()) {
      errors.push("Item name required");
    }

    if (line.quantity <= 0) {
      errors.push("Qty must be greater than zero");
    }

    if (line.customerVisible && line.customerUnitPrice <= 0) {
      errors.push("Price required");
    }

    if (errors.length > 0) {
      itemErrors.set(line.id, errors);
    }
  }

  const saveErrors = [
    lines.length === 0 ? "Add at least one item before saving this estimate." : null,
    lines.some((line) => !line.name.trim()) ? "Every item needs a name." : null,
    lines.some((line) => line.quantity <= 0)
      ? "Every item quantity must be greater than zero."
      : null,
  ].filter((error): error is string => Boolean(error));
  const sendErrors = [
    ...saveErrors,
    customerVisibleLines.length === 0
      ? "Add at least one customer-facing item."
      : null,
    customerVisibleLines.some((line) => line.customerUnitPrice <= 0)
      ? "Customer-facing items need prices before sending."
      : null,
    totals.total <= 0 ? "Estimate total must be greater than zero." : null,
    !hasCustomerLinkage ? "Link a customer before sending." : null,
    !savedEstimateId ? "Save the draft before sending." : null,
  ].filter((error): error is string => Boolean(error));
  const sendReadinessErrors = [
    ...saveErrors,
    customerVisibleLines.length === 0
      ? "Add at least one customer-facing item."
      : null,
    customerVisibleLines.some((line) => line.customerUnitPrice <= 0)
      ? "Customer-facing items need prices before sending."
      : null,
    totals.total <= 0 ? "Estimate total must be greater than zero." : null,
    !hasCustomerLinkage ? "Link a customer before sending." : null,
  ].filter((error): error is string => Boolean(error));
  const canAttemptSend =
    sendReadinessErrors.length === 0 &&
    saveState.status !== "saving" &&
    sendingEstimateId === null &&
    !["declined", "void"].includes(estimateStatus);
  const normalizedDeliveryRecipient = deliveryRecipient.trim();
  const deliveryRecipientIsValid =
    deliveryChannel === "sms"
      ? isValidEstimateSmsRecipient(normalizedDeliveryRecipient)
      : isValidEstimateEmailRecipient(normalizedDeliveryRecipient);
  const customerEmailReplacementRequired =
    deliveryChannel === "email" &&
    Boolean(request.customerEmail?.trim()) &&
    normalizedDeliveryRecipient.toLowerCase() !==
      request.customerEmail?.trim().toLowerCase();
  const canConfirmEstimateDelivery =
    canAttemptSend &&
    deliveryRecipientIsValid &&
    (!customerEmailReplacementRequired || allowCustomerEmailReplacement);
  const estimateDeliveryMessagePreview = `${
    request.selectedTechnicianBusinessName ?? "HomeFix Appliance Repair"
  }: Your estimate ${savedEstimateNumber ?? "Estimate"} is ready for review. Please approve or decline using this secure link:`;
  const canEditFinancialFields =
    estimateStatus === "unsaved" || estimateStatus === "draft";
  const canApproveForCustomer =
    isPersistedEstimateUuid(savedEstimateId) &&
    saveState.status !== "saving" &&
    !["approved", "converted_to_invoice", "declined", "void"].includes(estimateStatus);
  const canShowDraftActions =
    canEditFinancialFields || estimateStatus === "sent" || estimateStatus === "presented";
  const canReviseEstimate =
    savedEstimateId !== null &&
    (estimateStatus === "sent" || estimateStatus === "declined") &&
    saveState.status !== "saving" &&
    Boolean(onReviseEstimate);
  const canDeleteEstimate =
    savedEstimateId !== null &&
    estimateStatus === "draft" &&
    deleteState.status !== "deleting" &&
    Boolean(onDeleteEstimate);
  const canUndoApproval =
    savedEstimateId !== null &&
    estimateStatus === "approved" &&
    saveState.status !== "saving" &&
    Boolean(onUndoApproval);
  const createdDate = initialEstimate?.createdAt ?? new Date().toISOString();
  const address = getRequestAddress(request);
  const customerPreviewData: CustomerEstimatePreviewData = {
    companyName:
      request.selectedTechnicianBusinessName ?? "WeRepairRefrigerators",
    estimateNumber: savedEstimateNumber ?? "Draft estimate",
    estimateStatus,
    customerName: request.customerName || "Customer",
    serviceAddress: address,
    estimateDate: createdDate,
    whatWeFound,
    repairSolution,
    items: customerVisibleLines.map((line) => ({
      id: line.id,
      title: line.name || "Estimate item",
      description: line.description || null,
      quantity: line.quantity,
      unitPrice: line.customerUnitPrice,
      lineTotal: getLineTotal(line),
    })),
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    tax: totals.tax,
    taxRate: totals.taxRate,
    total: totals.total,
    warrantyText: warrantyText.trim() || null,
    estimatedCompletion: estimatedCompletion.trim() || null,
    customerNotes: null,
  };
  const customerInitials = (request.customerName || "Customer")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "C";
  const statusLabel =
    estimateStatus === "unsaved" ? "Not saved" : formatServiceRequestSource(estimateStatus);
  const activeSwitcherEstimateId = activeEstimateId ?? savedEstimateId;
  const canCreateInvoice =
    initialEstimate?.estimateStatus === "approved" &&
    !linkedInvoiceNumber &&
    Boolean(onCreateInvoice);
  const canCollectPayment =
    initialEstimate?.estimateStatus === "approved" &&
    !linkedInvoiceNumber &&
    Boolean(onCollectPayment);
  const estimateTotalForDisplay = initialEstimate?.total ?? totals.total;
  const remainingEstimateBalance = Math.max(0, estimateTotalForDisplay - depositPaid);
  const workspaceTabs: Array<{ id: EstimateWorkspaceTab; label: string }> = [
    { id: "details", label: "Details" },
    { id: "items", label: "Items" },
    { id: "terms", label: "Terms" },
    { id: "notes", label: "Notes" },
    { id: "attachments", label: "Attachments" },
    { id: "history", label: "History" },
  ];
  const editableSignature = useMemo(
    () =>
      JSON.stringify({
      whatWeFound,
      repairSolution,
      estimatedCompletion,
      warrantyText,
      lines,
      discountType,
      discountValue,
      taxRate,
      }),
    [
    discountType,
    discountValue,
    estimatedCompletion,
    lines,
    repairSolution,
    taxRate,
    warrantyText,
    whatWeFound,
    ],
  );

  const [lastSavedSignature, setLastSavedSignature] = useState(editableSignature);

  const hasUnsavedChanges = editableSignature !== lastSavedSignature;
  const saveFeedbackLabel =
    saveState.status === "saving"
      ? "Saving..."
      : saveState.status === "success"
        ? "Saved"
        : null;

  useEffect(() => {
    lastSavedSignatureRef.current = lastSavedSignature;
  }, [lastSavedSignature]);

  function resetFeedback() {
    if (saveState.status !== "idle") {
      setSaveState({ status: "idle", message: null });
    }
  }

  function openAddItem(type: ManualEstimateLineType = "part") {
    if (!canEditFinancialFields) {
      return;
    }

    setItemDraft({
      mode: "add",
      lineId: null,
      line: createBlankLine(type),
    });
  }

  function addPriceBookItem(item: PriceBookSearchItem) {
    if (!canEditFinancialFields) {
      return;
    }

    setLines((current) => [...current, createLineFromPriceBookItem(item)]);
    setPriceBookSearch("");
    setValidationAttempted(false);
    resetFeedback();
  }

  function openEditItem(line: ManualEstimateLine) {
    if (!canEditFinancialFields) {
      return;
    }

    setOpenLineMenuId(null);
    setItemDraft({
      mode: "edit",
      lineId: line.id,
      line: { ...line },
    });
  }

  function saveItemDraft() {
    if (!itemDraft || !canEditFinancialFields) {
      return;
    }

    const nextLine = {
      ...itemDraft.line,
      name: itemDraft.line.name.trim(),
      description: itemDraft.line.description.trim(),
      partNumber: itemDraft.line.partNumber.trim(),
      vendor: itemDraft.line.vendor.trim(),
      internalNote: itemDraft.line.internalNote.trim(),
    };

    if (itemDraft.mode === "edit" && itemDraft.lineId) {
      setLines((current) =>
        current.map((line) => (line.id === itemDraft.lineId ? nextLine : line)),
      );
    } else {
      setLines((current) => [...current, nextLine]);
    }

    setValidationAttempted(false);
    resetFeedback();
    setItemDraft(null);
  }

  function deleteLine(lineId: string) {
    if (!canEditFinancialFields) {
      return;
    }

    setLines((current) => current.filter((line) => line.id !== lineId));
    setOpenLineMenuId(null);
    resetFeedback();
  }

  function copyLine(line: ManualEstimateLine) {
    if (!canEditFinancialFields) {
      return;
    }

    setLines((current) => [
      ...current,
      {
        ...line,
        id: buildLineId(),
        name: `${line.name || "Estimate item"} copy`,
      },
    ]);
    setOpenLineMenuId(null);
    resetFeedback();
  }

  function duplicateEstimate() {
    setSavedEstimateId(null);
    setSavedEstimateNumber(null);
    setEstimateStatus("unsaved");
    setIsEstimateMenuOpen(false);
    setSaveState({
      status: "idle",
      message: null,
    });
  }

  function buildPayload() {
    return {
      ...(savedEstimateId ? { estimateId: savedEstimateId } : {}),
      catalogItems: [],
      customItems: lines.map((line) => ({
        itemTitle: line.name.trim() || "Untitled estimate item",
        customerName: line.name.trim() || "Untitled estimate item",
        internalName: line.name.trim() || null,
        lineType: lineTypeToApiType(line.type),
        quantity: safeNumber(line.quantity),
        unitPrice: safeNumber(line.customerUnitPrice),
        unitCost: safeNumber(line.internalUnitCost),
        technicianCost: safeNumber(line.internalUnitCost),
        taxable: line.taxable,
        publicDescription: line.description.trim() || null,
        warrantyText: line.warrantyIncluded ? warrantyText.trim() || null : null,
        notes: buildLineNotes(line),
      })),
      adjustments: {
        discountType,
        discountValue: totals.discountValue,
        taxRate: totals.taxRate,
      },
      metadata: {
        customerPreviewNotes: JSON.stringify({
          version: "manual-estimate-editor-v1",
          whatWeFound: limitMetadataText(whatWeFound, 600),
          repairSolution: limitMetadataText(repairSolution, 500),
          estimatedCompletion: limitMetadataText(estimatedCompletion, 250),
        } satisfies ManualEstimateMetadata),
        warrantyText: warrantyText.trim() || null,
        disclaimerText: null,
      },
      estimateDecisionContext: {
        eventSource: "manual_estimate_editor",
        diagnosisText: whatWeFound.trim(),
        confirmedRepairScope: whatWeFound.trim(),
        repairProposal: {
          repairSolution: repairSolution.trim(),
          customerDescription: whatWeFound.trim(),
          estimatedCompletion: estimatedCompletion.trim() || null,
          source: "manual",
        },
        lineDecisions: lines.map((line) => ({
          lineType: lineTypeToApiType(line.type),
          customerName: line.name.trim(),
          internalName: line.name.trim(),
          quantity: line.quantity,
          unitPrice: line.customerUnitPrice,
          unitCost: line.internalUnitCost,
          publicDescription: line.description.trim() || null,
          taxable: line.taxable,
          customerVisible: line.customerVisible,
          warrantyIncluded: line.warrantyIncluded,
          lineTotal: getLineTotal(line),
          wasEdited: true,
        })),
        totals: {
          subtotal: totals.subtotal,
          discountType,
          discountValue: totals.discountValue,
          discountAmount: totals.discountAmount,
          taxableSubtotal: totals.taxableAmount,
          taxRate: totals.taxRate,
          tax: totals.tax,
          grandTotal: totals.total,
          internalCostTotal: totals.internalCostTotal,
          margin: totals.grossProfit,
          marginPercent: totals.marginPercent,
          persistedAuthoritatively: true,
        },
        total: totals.total,
      },
    };
  }

  async function saveDraft(
    options: { source?: "autosave" | "navigation" | "manual" } = {},
  ): Promise<SaveResult> {
    const source = options.source ?? "manual";

    if (!canEditFinancialFields) {
      if (source !== "autosave") {
        setSaveState({
          status: "error",
          message: "Approved estimates are read-only. Duplicate this estimate to make changes.",
        });
      }

      return null;
    }

    if (activeSavePromiseRef.current) {
      const activePromise = activeSavePromiseRef.current;
      const activeResult = await activePromise;

      if (activeSavePromiseRef.current === activePromise) {
        activeSavePromiseRef.current = null;
      }

      if (editableSignature === lastSavedSignatureRef.current) {
        return activeResult;
      }

      return saveDraft(options);
    }

    const signatureAtSaveStart = editableSignature;

    if (source !== "autosave") {
      setValidationAttempted(true);
    }

    if (saveErrors.length > 0) {
      if (source === "autosave") {
        return null;
      }

      setSaveState({ status: "error", message: saveErrors[0] });
      return null;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setSaveState({
        status: "error",
        message: "Estimates are not available for this workspace.",
      });
      return null;
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setSaveState({
        status: "error",
        message: "Log in again before saving this estimate.",
      });
      return null;
    }

    const savePromise = (async () => {
      setSaveState({ status: "saving", message: null });
      setPendingAction(source === "manual" ? "save" : null);

      let response: Response;

      try {
        response = await fetch(
          `/api/service-requests/${request.id}/estimates`,
          {
            method: savedEstimateId ? "PATCH" : "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(buildPayload()),
          },
        );
      } catch {
        setPendingAction(null);
        setSaveState({
          status: "error",
          message: "Estimate could not be fully saved. Please try again.",
        });
        return null;
      }
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        estimate?: {
          id?: string;
          estimate_number?: string | null;
          total?: number | string | null;
        };
      } | null;

      if (!response.ok || !payload?.ok) {
        setPendingAction(null);
        setSaveState({
          status: "error",
          message: payload?.message ?? "We could not save this estimate yet.",
        });
        return null;
      }

      const nextEstimateId =
        payload.estimate?.id && typeof payload.estimate.id === "string"
          ? payload.estimate.id
          : savedEstimateId;
      const nextEstimateNumber =
        payload.estimate?.estimate_number ?? savedEstimateNumber ?? "Estimate";

      lastSavedSignatureRef.current = signatureAtSaveStart;
      setLastSavedSignature(signatureAtSaveStart);
      setSavedEstimateId(nextEstimateId);
      setSavedEstimateNumber(nextEstimateNumber);
      setEstimateStatus("draft");
      setPendingAction(null);
      setSaveState({
        status: "success",
        message: "Saved",
      });
      await onSaved();

      return nextEstimateId
        ? { id: nextEstimateId, estimateNumber: nextEstimateNumber }
        : null;
    })();

    activeSavePromiseRef.current = savePromise;
    const result = await savePromise;

    if (activeSavePromiseRef.current === savePromise) {
      activeSavePromiseRef.current = null;
    }

    return result;
  }

  async function flushPendingChangesBeforeNavigation() {
    if (activeSavePromiseRef.current) {
      const activePromise = activeSavePromiseRef.current;
      await activePromise;

      if (activeSavePromiseRef.current === activePromise) {
        activeSavePromiseRef.current = null;
      }
    }

    if (editableSignature === lastSavedSignatureRef.current) {
      return true;
    }

    const result = await saveDraft({ source: "navigation" });

    return Boolean(result);
  }

  async function closeAfterSave() {
    const canNavigate = await flushPendingChangesBeforeNavigation();

    if (canNavigate) {
      onClose();
    }
  }

  async function switchEstimateAfterSave(estimate: DashboardServiceRequestEstimate) {
    const canNavigate = await flushPendingChangesBeforeNavigation();

    if (canNavigate) {
      onSwitchEstimate?.(estimate);
    }
  }

  async function openCustomerAfterSave(
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    event.preventDefault();
    const canNavigate = await flushPendingChangesBeforeNavigation();

    if (canNavigate) {
      router.push(href);
    }
  }

  useEffect(() => {
    if (
      !canEditFinancialFields ||
      !hasUnsavedChanges ||
      saveErrors.length > 0 ||
      saveState.status === "saving"
    ) {
      return;
    }

    const autosaveTimer = window.setTimeout(() => {
      void saveDraft({ source: "autosave" });
    }, 750);

    return () => window.clearTimeout(autosaveTimer);
    // saveDraft intentionally reads the latest render snapshot; editableSignature is the debounce key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    canEditFinancialFields,
    editableSignature,
    hasUnsavedChanges,
    saveErrors.length,
    saveState.status,
  ]);

  useEffect(() => {
    if (savedFeedbackTimerRef.current) {
      window.clearTimeout(savedFeedbackTimerRef.current);
      savedFeedbackTimerRef.current = null;
    }

    if (saveState.status !== "success") {
      return;
    }

    savedFeedbackTimerRef.current = window.setTimeout(() => {
      setSaveState((current) =>
        current.status === "success" ? { status: "idle", message: null } : current,
      );
    }, 1400);

    return () => {
      if (savedFeedbackTimerRef.current) {
        window.clearTimeout(savedFeedbackTimerRef.current);
        savedFeedbackTimerRef.current = null;
      }
    };
  }, [saveState.status]);

  function openSendEstimateModal() {
    setValidationAttempted(true);

    if (sendReadinessErrors.length > 0 || sendingEstimateId !== null) {
      setSaveState({
        status: "error",
        message: sendReadinessErrors[0] ?? "Estimate is already being sent.",
      });
      return;
    }

    setDeliveryChannel("sms");
    setDeliveryRecipient(request.customerPhone ?? "");
    setDeliveryRecipientTouched(false);
    setAllowCustomerEmailReplacement(false);
    setIsSendEstimateOpen(true);
  }

  async function sendToClient() {
    setValidationAttempted(true);

    const savedEstimate =
      savedEstimateId && !hasUnsavedChanges
        ? {
            id: savedEstimateId,
            estimateNumber: savedEstimateNumber ?? "Estimate",
          }
        : await saveDraft({ source: "navigation" });
    const sendValidationErrors = [
      ...saveErrors,
      customerVisibleLines.length === 0
        ? "Add at least one customer-facing item."
        : null,
      customerVisibleLines.some((line) => line.customerUnitPrice <= 0)
        ? "Customer-facing items need prices before sending."
        : null,
      totals.total <= 0 ? "Estimate total must be greater than zero." : null,
      !hasCustomerLinkage ? "Link a customer before sending." : null,
      !savedEstimate ? "Save a valid estimate before sending." : null,
    ].filter((error): error is string => Boolean(error));

    if (!savedEstimate || sendValidationErrors.length > 0 || sendingEstimateId !== null) {
      setSaveState({
        status: "error",
        message: sendValidationErrors[0] ?? "Estimate is already being sent.",
      });
      return;
    }

    if (!deliveryRecipientIsValid) {
      setSaveState({
        status: "error",
        message:
          deliveryChannel === "sms"
            ? "Enter a valid customer phone number before sending."
            : "Enter a valid customer email before sending.",
      });
      return;
    }

    if (customerEmailReplacementRequired && !allowCustomerEmailReplacement) {
      setSaveState({
        status: "error",
        message:
          "Confirm that this successful send should replace the Customer email.",
      });
      return;
    }

    setSaveState({ status: "saving", message: null });
    setPendingAction("send");

    try {
      const sent = await onSendEstimate({
        id: savedEstimate.id,
        estimateNumber: savedEstimate.estimateNumber,
        delivery: {
          channel: deliveryChannel,
          recipient: normalizedDeliveryRecipient,
          messagePreview: estimateDeliveryMessagePreview,
          idempotencyKey: createEstimateDeliveryIdempotencyKey(
            savedEstimate.id,
            deliveryChannel,
            normalizedDeliveryRecipient,
          ),
          allowCustomerEmailReplacement,
        },
      });
      if (!sent) {
        setPendingAction(null);
        setSaveState({
          status: "error",
          message: "Estimate could not be sent. Please try again.",
        });
        return;
      }
      if (estimateStatus !== "approved") {
        setEstimateStatus("sent");
      }
      setIsSendEstimateOpen(false);
      setPendingAction(null);
      setSaveState({ status: "success", message: "Estimate sent to customer." });
      await onSaved();
    } catch {
      setPendingAction(null);
      setSaveState({
        status: "error",
        message: "Estimate could not be sent. Please try again.",
      });
    }
  }

  async function approveForCustomer() {
    const savedEstimate =
      savedEstimateId && !hasUnsavedChanges
        ? {
            id: savedEstimateId,
            estimateNumber: savedEstimateNumber ?? "Estimate",
          }
        : await saveDraft({ source: "navigation" });

    if (!savedEstimate || !canApproveForCustomer) {
      setSaveState({
        status: "error",
        message: isPersistedEstimateUuid(savedEstimateId)
          ? "Save this estimate before recording approval."
          : "This estimate needs a saved database record before it can be approved.",
      });
      setIsApproveConfirmOpen(false);
      return;
    }

    setSaveState({ status: "saving", message: null });
    setPendingAction("approve");
    setIsApproveConfirmOpen(false);

    try {
      const approvalResult = await onApproveForCustomer({
        id: savedEstimate.id,
        estimateNumber: savedEstimate.estimateNumber,
      });

      if (!approvalResult.ok) {
        setPendingAction(null);
        setSaveState({
          status: "error",
          message: approvalResult.message,
        });
        return;
      }

      setEstimateStatus("approved");
      setPendingAction(null);
      setSaveState({
        status: "success",
        message: "Estimate approved by technician on behalf of customer.",
      });
      await onSaved();
    } catch {
      setPendingAction(null);
      setSaveState({
        status: "error",
        message: "Estimate could not be approved for the customer. Please try again.",
      });
    }
  }

  async function reviseEstimate() {
    if (!savedEstimateId || !savedEstimateNumber || !onReviseEstimate) {
      setSaveState({
        status: "error",
        message: "Choose a sent or declined estimate to revise.",
      });
      return;
    }

    setSaveState({ status: "saving", message: null });
    setPendingAction("revise");

    try {
      const result = await onReviseEstimate({
        id: savedEstimateId,
        estimateNumber: savedEstimateNumber,
      });

      if (!result.ok) {
        setPendingAction(null);
        setSaveState({
          status: "error",
          message: result.message,
        });
        return;
      }

      setEstimateStatus("draft");
      setPendingAction(null);
      setSaveState({
        status: "success",
        message:
          "Estimate reopened as a draft revision. Previously sent links were revoked.",
      });
      await onSaved();
    } catch {
      setPendingAction(null);
      setSaveState({
        status: "error",
        message: "Estimate could not be reopened for revision.",
      });
    }
  }

  async function deleteEstimate() {
    if (!savedEstimateId || !canDeleteEstimate) {
      return;
    }

    setDeleteState({ status: "deleting", message: null });

    try {
      const deleted = await onDeleteEstimate?.({
        id: savedEstimateId,
        estimateNumber: savedEstimateNumber ?? "Estimate",
      });

      if (!deleted) {
        setDeleteState({
          status: "error",
          message: "Estimate could not be deleted.",
        });
        return;
      }

      setIsDeleteConfirmOpen(false);
      setDeleteState({ status: "idle", message: null });
    } catch {
      setDeleteState({
        status: "error",
        message: "Estimate could not be deleted.",
      });
    }
  }

  async function undoApproval() {
    if (!savedEstimateId || !savedEstimateNumber || !canUndoApproval) {
      setSaveState({
        status: "error",
        message: "Approval cannot be undone for this estimate.",
      });
      setIsUndoApprovalConfirmOpen(false);
      return;
    }

    setSaveState({ status: "saving", message: null });
    setPendingAction("approve");
    setIsUndoApprovalConfirmOpen(false);

    try {
      const result = await onUndoApproval?.({
        id: savedEstimateId,
        estimateNumber: savedEstimateNumber,
      });

      if (!result?.ok) {
        setPendingAction(null);
        setSaveState({
          status: "error",
          message: result?.message ?? "Approval could not be undone.",
        });
        return;
      }

      setEstimateStatus("draft");
      setPendingAction(null);
      setSaveState({
        status: "success",
        message: "Approval undone. This estimate is back in Draft.",
      });
      await onSaved();
    } catch {
      setPendingAction(null);
      setSaveState({
        status: "error",
        message: "Approval could not be undone.",
      });
    }
  }

  return (
    <section className="fixed inset-0 z-40 overflow-y-auto bg-white pb-[calc(7.5rem+env(safe-area-inset-bottom))] text-[#0B1228] lg:static lg:z-auto lg:overflow-visible lg:rounded-[2rem] lg:border lg:border-[#E5E7EB] lg:bg-white lg:pb-0 lg:shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
      <div className="sticky top-0 z-10 border-b border-[#E5E7EB] bg-white/95 px-3 py-2 backdrop-blur lg:static lg:rounded-t-[2rem] lg:px-6 lg:py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <button
            aria-label="Back to Finance"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#0F172A] transition hover:bg-[#F1F5F9]"
            onClick={() => void closeAfterSave()}
            type="button"
          >
            <EstimateIcon name="back" />
          </button>
          <div className="min-w-0 text-center">
            <h2 className="truncate text-lg font-black tracking-[-0.02em] sm:text-xl">
              {savedEstimateNumber ?? "New Estimate"}
            </h2>
            <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[#0F6BFF]">
              {statusLabel}
            </span>
            {saveFeedbackLabel ? (
              <p className="mt-1 text-[0.68rem] font-black text-[#64748B]">
                {saveFeedbackLabel}
              </p>
            ) : null}
          </div>
          <div className="relative">
            <button
              aria-label="Estimate actions"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[#0F172A] transition hover:bg-[#F1F5F9]"
              onClick={() => setIsEstimateMenuOpen((current) => !current)}
              type="button"
            >
              <EstimateIcon name="more" />
            </button>
            {isEstimateMenuOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white py-2 text-sm font-bold shadow-[0_18px_44px_rgba(15,23,42,0.18)]">
                <button
                  className="block w-full px-4 py-2.5 text-left text-[#0F172A] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={lines.length === 0}
                  onClick={() => {
                    setIsEstimateMenuOpen(false);
                    setIsPreviewOpen(true);
                  }}
                  type="button"
                >
                  Preview Proposal
                </button>
                {canEditFinancialFields ? (
                  <button
                    className="block w-full px-4 py-2.5 text-left text-[#0F172A] hover:bg-[#F8FAFC]"
                    onClick={() => {
                      setIsEstimateMenuOpen(false);
                      if (lines[0]) {
                        openEditItem(lines[0]);
                      }
                    }}
                    type="button"
                  >
                    Edit Estimate
                  </button>
                ) : null}
                {canReviseEstimate ? (
                  <button
                    className="block w-full px-4 py-2.5 text-left text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={pendingAction === "revise"}
                    onClick={() => {
                      setIsEstimateMenuOpen(false);
                      void reviseEstimate();
                    }}
                    type="button"
                  >
                    {pendingAction === "revise" ? "Reopening..." : "Revise Estimate"}
                  </button>
                ) : null}
                <button
                  className="block w-full px-4 py-2.5 text-left text-[#0F172A] hover:bg-[#F8FAFC]"
                  onClick={duplicateEstimate}
                  type="button"
                >
                  Duplicate
                </button>
                <button
                  className="block w-full px-4 py-2.5 text-left text-[#0F6BFF] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!canAttemptSend}
                  onClick={() => {
                    setIsEstimateMenuOpen(false);
                    openSendEstimateModal();
                  }}
                  type="button"
                >
                  {estimateStatus === "sent" || estimateStatus === "approved"
                    ? "Resend"
                    : "Send to Customer"}
                </button>
                {canCreateInvoice && initialEstimate ? (
                  <button
                    className="block w-full px-4 py-2.5 text-left text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={isCreatingInvoice}
                    onClick={() => {
                      setIsEstimateMenuOpen(false);
                      void onCreateInvoice?.(initialEstimate);
                    }}
                    type="button"
                  >
                    {isCreatingInvoice ? "Creating Invoice..." : "Convert to Invoice"}
                  </button>
                ) : null}
                {canCollectPayment && initialEstimate ? (
                  <button
                    className="block w-full px-4 py-2.5 text-left text-[#0F6BFF] hover:bg-blue-50"
                    onClick={() => {
                      setIsEstimateMenuOpen(false);
                      onCollectPayment?.(initialEstimate);
                    }}
                    type="button"
                  >
                    Collect Payment
                  </button>
                ) : null}
                {linkedInvoiceNumber ? (
                  <div className="px-4 py-2.5 text-left text-xs font-black text-emerald-700">
                    Invoice {linkedInvoiceNumber}
                  </div>
                ) : null}
                {savedEstimateId && estimateStatus === "approved" ? (
                  <button
                    className="block w-full px-4 py-2.5 text-left text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!canUndoApproval}
                    onClick={() => {
                      setIsEstimateMenuOpen(false);
                      setIsUndoApprovalConfirmOpen(true);
                    }}
                    type="button"
                  >
                    Undo Approval
                  </button>
                ) : null}
                {savedEstimateId && estimateStatus === "draft" ? (
                  <button
                    className="block w-full px-4 py-2.5 text-left text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!canDeleteEstimate}
                    onClick={() => {
                      setIsEstimateMenuOpen(false);
                      setDeleteState({ status: "idle", message: null });
                      setIsDeleteConfirmOpen(true);
                    }}
                    type="button"
                  >
                    Delete Estimate
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        {estimates.length > 1 ? (
          <div className="mx-auto mt-3 flex max-w-6xl gap-2 overflow-x-auto px-1 pb-1">
            {estimates.map((estimate, index) => {
              const isActive = estimate.id === activeSwitcherEstimateId;

              return (
                <button
                  className={`shrink-0 border-b-2 px-3 py-2 text-sm font-black transition ${
                    isActive
                      ? "border-[#0F6BFF] text-[#0F6BFF]"
                      : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                  }`}
                  key={estimate.id}
                  onClick={() => {
                    if (!isActive) {
                      void switchEstimateAfterSave(estimate);
                    }
                  }}
                  type="button"
                >
                  Estimate {index + 1}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

        <div className="mx-auto mt-2 flex max-w-6xl gap-2 overflow-x-auto border-b border-[#E5E7EB] pb-0.5">
          {workspaceTabs.map((tab) => (
            <button
              className={`shrink-0 border-b-2 px-3 py-2 text-sm font-black transition lg:px-4 ${
                activeWorkspaceTab === tab.id
                  ? "border-[#0F6BFF] text-[#0F6BFF]"
                  : "border-transparent text-[#64748B] hover:text-[#0F172A]"
              }`}
              key={tab.id}
              onClick={() => setActiveWorkspaceTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

      <div className="mx-auto max-w-6xl px-3 pt-4 lg:px-6 lg:pt-4">
        {activeWorkspaceTab === "details" ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="grid gap-3">
              {customerHref ? (
                <Link
                  className="flex gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 text-left transition hover:bg-[#F8FAFC]"
                  href={customerHref}
                  onClick={(event) => void openCustomerAfterSave(event, customerHref)}
                >
                  <EstimateCustomerCardContent
                    address={address}
                    customerInitials={customerInitials}
                    customerName={request.customerName || "Customer"}
                    customerPhone={request.customerPhone}
                  />
                </Link>
              ) : (
                <div className="flex gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 text-left">
                  <EstimateCustomerCardContent
                    address={address}
                    customerInitials={customerInitials}
                    customerName={request.customerName || "Customer"}
                    customerPhone={request.customerPhone}
                  />
                </div>
              )}
              <div className="rounded-2xl bg-[#F8FAFC] p-4">
                <p className="text-sm font-black text-[#0F172A]">
                  {formatCompactJobNumber(request)}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-[#475569]">
                  {[request.applianceType, request.issueDescription]
                    .filter(Boolean)
                    .join(" - ") || "Job details"}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
              <EditableTextSection
                label="What we found"
                onChange={(value) => {
                  setWhatWeFound(value);
                  resetFeedback();
                }}
                onDictate={() => null}
                readOnly={!canEditFinancialFields}
                value={whatWeFound}
              />
              <EditableTextSection
                label="Repair solution"
                onChange={(value) => {
                  setRepairSolution(value);
                  resetFeedback();
                }}
                readOnly={!canEditFinancialFields}
                value={repairSolution}
              />
            </div>
          </div>
        ) : null}

        {activeWorkspaceTab === "items" ? (
          <>
            <section className="relative rounded-2xl border border-[#E5E7EB] bg-white">
              <div className="flex flex-col gap-3 border-b border-[#E5E7EB] p-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-black">Items ({lines.length})</h3>
                    {canEditFinancialFields ? (
                    <div className="relative lg:hidden">
                      <button
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#0F6BFF] px-3 text-sm font-black text-white shadow-sm"
                        onClick={() => setIsAddItemMenuOpen((current) => !current)}
                        type="button"
                      >
                        <EstimateIcon className="h-4 w-4" name="plus" />
                        Add Item
                      </button>
                    </div>
                    ) : null}
                  </div>
                  {canEditFinancialFields ? (
                  <div className="relative mt-3 max-w-3xl">
                    <label className="block text-xs font-black text-[#64748B]" htmlFor="price-book-search">
                      Search Price Book
                    </label>
                    <input
                      autoComplete="off"
                      className="mt-1 w-full rounded-xl border border-[#D7E4FF] bg-white px-3 py-2.5 text-sm font-bold text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
                      id="price-book-search"
                      onChange={(event) => setPriceBookSearch(event.target.value)}
                      placeholder="Search parts, labor, services, fees"
                      type="search"
                      value={priceBookSearch}
                    />
            {priceBookSearch.trim().length >= 2 ? (
              <div className="absolute left-0 right-0 z-20 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_18px_44px_rgba(15,23,42,0.14)]">
                {priceBookState.status === "loading" ? (
                  <p className="px-3 py-3 text-sm font-semibold text-[#64748B]">
                    Loading Price Book...
                  </p>
                ) : priceBookState.status === "error" ? (
                  <p className="px-3 py-3 text-sm font-semibold text-amber-800">
                    {priceBookState.message}
                  </p>
                ) : priceBookMatches.length > 0 ? (
                  <div className="divide-y divide-[#E5E7EB]">
                    {priceBookMatches.map((item) => (
                      <button
                        className="block w-full px-3 py-2.5 text-left transition hover:bg-[#F8FAFC]"
                        key={item.id}
                        onClick={() => addPriceBookItem(item)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-[#0F172A]">
                              {item.name}
                            </p>
                            <p className="mt-0.5 text-xs font-semibold text-[#64748B]">
                              {lineTypeLabel(mapPriceBookTypeToLineType(item.item_type))}
                              {item.appliance_type ? ` • ${item.appliance_type}` : ""}
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-black text-[#0F6BFF]">
                            {formatServiceRequestMoney(getPriceBookSellPrice(item))}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="px-3 py-3 text-sm font-semibold text-[#64748B]">
                    No active Price Book items found. Add a custom line item instead.
                  </p>
                )}
              </div>
            ) : null}
                  </div>
                  ) : null}
                </div>
                {canEditFinancialFields ? (
                <div className="relative hidden lg:block">
                  <button
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#0F6BFF] px-4 text-sm font-black text-white shadow-sm transition hover:bg-[#0958D9]"
                    onClick={() => setIsAddItemMenuOpen((current) => !current)}
                    type="button"
                  >
                    <EstimateIcon className="h-4 w-4" name="plus" />
                    Add Item
                  </button>
                </div>
                ) : null}
                {canEditFinancialFields && isAddItemMenuOpen ? (
                  <div className="absolute right-4 top-24 z-30 w-52 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white py-2 text-sm font-bold shadow-[0_18px_44px_rgba(15,23,42,0.18)] lg:right-10 lg:top-32">
                    {[
                      { label: "Add Part", type: "part" as const },
                      { label: "Add Labor", type: "labor" as const },
                      { label: "Add Service / Fee", type: "service" as const },
                      { label: "Custom Line Item", type: "other" as const },
                    ].map((item) => (
                      <button
                        className="block w-full px-4 py-2.5 text-left text-[#0F172A] hover:bg-[#F8FAFC]"
                        key={item.label}
                        onClick={() => {
                          setIsAddItemMenuOpen(false);
                          openAddItem(item.type);
                        }}
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
          </div>

          {lines.length > 0 ? (
            <>
            <div className="hidden lg:block">
              <div className="grid grid-cols-[48%_10%_16%_16%_10%] border-b border-[#E5E7EB] bg-[#F8FAFC] px-4 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#64748B]">
                <div>Item / Service</div>
                <div className="text-center">Qty</div>
                <div className="text-right">Unit Price</div>
                <div className="text-right">Total</div>
                <div className="text-right">Actions</div>
              </div>
              {lines.map((line) => {
                const errors = itemErrors.get(line.id) ?? [];

                return (
                  <article
                    className={`relative grid min-h-[56px] grid-cols-[48%_10%_16%_16%_10%] items-center border-b border-[#E5E7EB] bg-white px-4 text-sm transition ${
                      canEditFinancialFields
                        ? "cursor-pointer hover:bg-[#F8FAFC]"
                        : ""
                    }`}
                    key={line.id}
                    onClick={() => {
                      if (canEditFinancialFields) {
                        openEditItem(line);
                      }
                    }}
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h4 className="min-w-0 truncate font-black leading-5 text-[#0F172A]">
                          {line.name || "Untitled item"}
                        </h4>
                        <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[0.68rem] font-black text-emerald-700">
                          {lineTypeLabel(line.type)}
                        </span>
                      </div>
                      {line.description ? (
                        <p className="mt-0.5 text-xs font-semibold leading-4 text-[#64748B]">
                          {line.description}
                        </p>
                      ) : null}
                      {validationAttempted && errors.length > 0 ? (
                        <p className="mt-2 text-xs font-bold text-amber-800">
                          {errors.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-center font-black text-[#0F172A]">{line.quantity}</div>
                    <div className="text-right font-black text-[#0F172A]">
                      {line.customerVisible && line.customerUnitPrice <= 0 ? (
                        <span className="text-amber-700">Required</span>
                      ) : (
                        formatServiceRequestMoney(line.customerUnitPrice)
                      )}
                    </div>
                    <div className="text-right font-black text-[#0F172A]">
                      {formatServiceRequestMoney(getLineTotal(line))}
                    </div>
                    <div className="flex justify-end">
                      {canEditFinancialFields ? (
                      <>
                      <button
                        aria-label={`Actions for ${line.name || "item"}`}
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-[#64748B] transition hover:bg-[#EEF2FF]"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenLineMenuId((current) =>
                            current === line.id ? null : line.id,
                          );
                        }}
                        type="button"
                      >
                        <EstimateIcon className="h-4 w-4" name="more" />
                      </button>
                      {openLineMenuId === line.id ? (
                        <div
                          className="absolute right-1 top-10 z-20 w-32 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white py-1 text-sm font-bold shadow-lg"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            className="block w-full px-3 py-2 text-left text-[#0F172A] hover:bg-[#F8FAFC]"
                            onClick={() => openEditItem(line)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="block w-full px-3 py-2 text-left text-[#0F172A] hover:bg-[#F8FAFC]"
                            onClick={() => copyLine(line)}
                            type="button"
                          >
                            Copy
                          </button>
                          <button
                            className="block w-full px-3 py-2 text-left text-red-700 hover:bg-red-50"
                            onClick={() => deleteLine(line.id)}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                      </>
                      ) : (
                        <span className="text-xs font-black text-[#94A3B8]">Locked</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="divide-y divide-[#E5E7EB] lg:hidden">
              {lines.map((line) => {
                const errors = itemErrors.get(line.id) ?? [];

                return (
                  <article
                    className="relative bg-white px-4 py-3"
                    key={line.id}
                  >
                    <button
                      className={`block min-h-11 w-full text-left ${
                        canEditFinancialFields ? "" : "cursor-default"
                      }`}
                      onClick={() => {
                        if (canEditFinancialFields) {
                          openEditItem(line);
                        }
                      }}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="truncate text-sm font-black text-[#0F172A]">
                              {line.name || "Untitled item"}
                            </h4>
                            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[0.68rem] font-black text-emerald-700">
                              {lineTypeLabel(line.type)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs font-semibold text-[#64748B]">
                            {line.quantity} x {formatServiceRequestMoney(line.customerUnitPrice)}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-black text-[#0F172A]">
                          {formatServiceRequestMoney(getLineTotal(line))}
                        </p>
                      </div>
                    </button>
                    {canEditFinancialFields ? (
                    <button
                      aria-label={`Actions for ${line.name || "item"}`}
                      className="absolute right-2 top-9 flex h-10 w-10 items-center justify-center rounded-lg text-[#64748B]"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenLineMenuId((current) =>
                          current === line.id ? null : line.id,
                        );
                      }}
                      type="button"
                    >
                      <EstimateIcon className="h-4 w-4" name="more" />
                    </button>
                    ) : null}
                    {canEditFinancialFields && openLineMenuId === line.id ? (
                      <div className="absolute right-2 top-16 z-20 w-32 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white py-1 text-sm font-bold shadow-lg">
                        <button
                          className="block w-full px-3 py-2 text-left text-[#0F172A] hover:bg-[#F8FAFC]"
                          onClick={() => openEditItem(line)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="block w-full px-3 py-2 text-left text-[#0F172A] hover:bg-[#F8FAFC]"
                          onClick={() => copyLine(line)}
                          type="button"
                        >
                          Copy
                        </button>
                        <button
                          className="block w-full px-3 py-2 text-left text-red-700 hover:bg-red-50"
                          onClick={() => deleteLine(line.id)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                    {validationAttempted && errors.length > 0 ? (
                      <p className="mt-2 text-xs font-bold text-amber-800">
                        {errors.join(" · ")}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
            </>
          ) : null}
            </section>

            <section className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white p-4">
          <h3 className="text-base font-black">Financial Summary</h3>
          <dl className="mt-3 grid gap-2 text-sm lg:grid-cols-4">
            <div className="flex items-center justify-between">
              <dt className="text-[#0F172A]">Subtotal</dt>
              <dd className="font-black">{formatServiceRequestMoney(totals.subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[#475569]">Discount</dt>
              <dd className="text-[#475569]">
                {formatServiceRequestMoney(totals.discountAmount)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[#475569]">Tax ({totals.taxRate.toFixed(3)}%)</dt>
              <dd className="text-[#475569]">{formatServiceRequestMoney(totals.tax)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-[#E5E7EB] pt-2 lg:border-t-0 lg:pt-0">
              <dt className="text-lg font-black">Total</dt>
              <dd className="text-2xl font-black text-[#0F6BFF]">
                {formatServiceRequestMoney(totals.total)}
              </dd>
            </div>
          </dl>
          {estimateStatus === "approved" ? (
            <div className="mt-4 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#64748B]">
                  Estimate Total
                </p>
                <p className="mt-1 text-lg font-black text-[#0F172A]">
                  {formatServiceRequestMoney(estimateTotalForDisplay)}
                </p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#64748B]">
                  Deposit Paid
                </p>
                <p className="mt-1 text-lg font-black text-emerald-700">
                  {formatServiceRequestMoney(depositPaid)}
                </p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#64748B]">
                  Remaining
                </p>
                <p className="mt-1 text-lg font-black text-orange-600">
                  {formatServiceRequestMoney(remainingEstimateBalance)}
                </p>
              </div>
            </div>
          ) : null}
          {canEditFinancialFields ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs font-black text-[#64748B]">Discount type</span>
              <select
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-2 py-2 text-sm font-bold"
                onChange={(event) =>
                  setDiscountType(event.target.value === "percent" ? "percent" : "flat")
                }
                value={discountType}
              >
                <option value="flat">$</option>
                <option value="percent">%</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-black text-[#64748B]">Discount</span>
              <input
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-2 py-2 text-right text-sm font-black"
                min="0"
                onChange={(event) => setDiscountValue(event.target.value)}
                step="0.01"
                type="number"
                value={discountValue}
              />
            </label>
            <label className="block">
              <span className="text-xs font-black text-[#64748B]">Tax %</span>
              <input
                className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-2 py-2 text-right text-sm font-black"
                min="0"
                onChange={(event) => setTaxRate(event.target.value)}
                step="0.01"
                type="number"
                value={taxRate}
              />
            </label>
          </div>
          ) : null}
            </section>
          </>
        ) : null}

        {activeWorkspaceTab === "terms" ? (
          <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
            <details className="border-b border-[#E5E7EB]" open>
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-sm font-black">
              Warranty
              <span className="font-semibold text-[#94A3B8]">
                {warrantyText.trim() ? "Set" : "Not set"}
                <span className="ml-2 text-[#64748B]">›</span>
              </span>
            </summary>
            <div className="px-4 pb-4">
              <label className="block text-xs font-black text-[#64748B]">
                Parts / labor warranty
              </label>
              <textarea
                className="mt-2 min-h-24 w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-semibold leading-6"
                disabled={!canEditFinancialFields}
                onChange={(event) => setWarrantyText(event.target.value)}
                value={warrantyText}
              />
            </div>
            </details>
            <details open>
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-sm font-black">
              Estimated completion
              <span className="font-semibold text-[#94A3B8]">
                {estimatedCompletion.trim() ? "Set" : "Not set"}
                <span className="ml-2 text-[#64748B]">›</span>
              </span>
            </summary>
            <div className="px-4 pb-4">
              <label className="block text-xs font-black text-[#64748B]">
                Completion note
              </label>
              <textarea
                className="mt-2 min-h-24 w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-semibold leading-6"
                disabled={!canEditFinancialFields}
                onChange={(event) => setEstimatedCompletion(event.target.value)}
                value={estimatedCompletion}
              />
            </div>
            </details>
          </section>
        ) : null}

        {activeWorkspaceTab === "notes" ? (
          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 text-sm font-semibold leading-6 text-[#64748B]">
            Notes stay in the Job Workspace for now.
          </section>
        ) : null}

        {activeWorkspaceTab === "attachments" ? (
          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4 text-sm font-semibold leading-6 text-[#64748B]">
            Attachments stay in the Job Workspace for now.
          </section>
        ) : null}

        {activeWorkspaceTab === "history" ? (
          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
            <h3 className="text-lg font-black text-[#0F172A]">History</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#64748B]">
              Detailed Estimate lifecycle history is not available in this workspace yet.
            </p>
          </section>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E5E7EB] bg-white/95 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_32px_rgba(15,23,42,0.08)] backdrop-blur lg:sticky lg:bottom-0 lg:mx-auto lg:mt-6 lg:max-w-6xl lg:rounded-b-[2rem] lg:border-x lg:px-6">
        {(validationAttempted && sendErrors.length > 0) || saveState.status === "error" ? (
          <p
            className={`mb-2 text-xs font-bold ${
              saveState.status === "error" || sendErrors.length > 0
                ? "text-amber-800"
                : "text-[#0F6BFF]"
            }`}
          >
            {saveState.message ?? sendErrors[0]}
          </p>
        ) : null}
        {estimateStatus === "approved" && initialEstimate ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              className="rounded-xl border border-[#D7E4FF] bg-white px-2 py-3 text-xs font-black text-[#0F6BFF] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
              disabled={!canCreateInvoice || isCreatingInvoice}
              onClick={() => void onCreateInvoice?.(initialEstimate)}
              type="button"
            >
              {linkedInvoiceNumber
                ? `Invoice ${linkedInvoiceNumber}`
                : isCreatingInvoice
                  ? "Creating..."
                  : "Convert to Invoice"}
            </button>
            <button
              className="rounded-xl bg-[#0F6BFF] px-2 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm"
              disabled={!canCollectPayment}
              onClick={() => onCollectPayment?.(initialEstimate)}
              type="button"
            >
              Collect Payment
            </button>
          </div>
        ) : estimateStatus === "sent" ? (
          <div className="grid grid-cols-3 gap-2">
            <button
              className="rounded-xl border border-[#D7E4FF] bg-white px-2 py-3 text-xs font-black text-[#0F6BFF] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
              disabled={!canAttemptSend}
              onClick={openSendEstimateModal}
              type="button"
            >
              {pendingAction === "send" || sendingEstimateId === savedEstimateId
                ? "Sending..."
                : "Resend"}
            </button>
            <button
              className="rounded-xl border border-amber-200 bg-white px-2 py-3 text-xs font-black text-amber-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
              disabled={!canReviseEstimate || pendingAction === "revise"}
              onClick={() => void reviseEstimate()}
              type="button"
            >
              {pendingAction === "revise" ? "Opening..." : "Revise"}
            </button>
            <button
              className="rounded-xl bg-[#0F6BFF] px-2 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm"
              disabled={!canApproveForCustomer}
              onClick={() => setIsApproveConfirmOpen(true)}
              type="button"
            >
              Mark Approved
            </button>
          </div>
        ) : estimateStatus === "declined" ? (
          <div className="grid grid-cols-1 gap-2">
            <button
              className="rounded-xl bg-[#0F6BFF] px-2 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm"
              disabled={!canReviseEstimate || pendingAction === "revise"}
              onClick={() => void reviseEstimate()}
              type="button"
            >
              {pendingAction === "revise"
                ? "Reopening..."
                : "Create Draft Revision"}
            </button>
          </div>
        ) : canShowDraftActions ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              className="rounded-xl border border-[#D7E4FF] bg-white px-2 py-3 text-xs font-black text-[#0F6BFF] disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
              disabled={!canAttemptSend}
              onClick={openSendEstimateModal}
              type="button"
            >
              {pendingAction === "send" || sendingEstimateId === savedEstimateId
                ? "Sending..."
                : "Send for Approval"}
            </button>
            <button
              className="rounded-xl bg-[#0F6BFF] px-2 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm"
              disabled={!canApproveForCustomer}
              onClick={() => setIsApproveConfirmOpen(true)}
              type="button"
            >
              Mark as Approved
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 text-center text-sm font-black text-[#64748B]">
            This estimate is read-only. Duplicate it to make changes.
          </div>
        )}
      </div>

      {itemDraft ? (
        <ManualEstimateItemSheet
          draft={itemDraft}
          onCancel={() => setItemDraft(null)}
          onChange={(line) =>
            setItemDraft((current) => (current ? { ...current, line } : null))
          }
          onSave={saveItemDraft}
        />
      ) : null}

      {isSendEstimateOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/55 px-3 py-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
                  Send estimate
                </p>
                <h3 className="mt-1 text-lg font-black text-[#0F172A]">
                  {savedEstimateNumber ?? "Estimate"}
                </h3>
                <p className="mt-1 text-xs font-bold text-[#64748B]">
                  Current revision link will be tied to this send attempt.
                </p>
              </div>
              <button
                className="rounded-full border border-[#E5E7EB] px-3 py-2 text-sm font-black text-[#64748B]"
                onClick={() => setIsSendEstimateOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-[#F8FAFC] p-1">
              {(["sms", "email"] as const).map((channel) => (
                <button
                  className={`rounded-xl px-3 py-2 text-sm font-black ${
                    deliveryChannel === channel
                      ? "bg-white text-[#0F6BFF] shadow-sm"
                      : "text-[#64748B]"
                  }`}
                  key={channel}
                  onClick={() => {
                    setDeliveryChannel(channel);
                    setAllowCustomerEmailReplacement(false);
                    if (!deliveryRecipientTouched) {
                      setDeliveryRecipient(
                        channel === "sms"
                          ? request.customerPhone ?? ""
                          : request.customerEmail ?? "",
                      );
                    }
                  }}
                  type="button"
                >
                  {channel === "sms" ? "SMS" : "Email"}
                </button>
              ))}
            </div>

            <label className="mt-4 block text-xs font-black uppercase tracking-[0.14em] text-[#64748B]">
              Recipient {deliveryChannel === "sms" ? "phone" : "email"}
            </label>
            <input
              className="mt-2 w-full rounded-2xl border border-[#D7E4FF] px-3 py-3 text-sm font-bold text-[#0F172A] outline-none focus:border-[#0F6BFF]"
              inputMode={deliveryChannel === "sms" ? "tel" : "email"}
              onChange={(event) => {
                setDeliveryRecipient(event.currentTarget.value);
                setDeliveryRecipientTouched(true);
                setAllowCustomerEmailReplacement(false);
              }}
              placeholder={
                deliveryChannel === "sms"
                  ? "(555) 123-4567"
                  : "customer@example.com"
              }
              type={deliveryChannel === "sms" ? "tel" : "email"}
              value={deliveryRecipient}
            />
            {!deliveryRecipientIsValid && normalizedDeliveryRecipient ? (
              <p className="mt-2 text-xs font-bold text-amber-700">
                {deliveryChannel === "sms"
                  ? "Enter a valid 10-digit US phone number."
                  : "Enter a valid email address."}
              </p>
            ) : null}
            {deliveryChannel === "email" && !request.customerEmail ? (
              <p className="mt-2 text-xs font-semibold leading-5 text-[#64748B]">
                This Customer does not have an email yet. After a successful provider send,
                HomeFixOS will save this email to the existing Customer record.
              </p>
            ) : null}
            {customerEmailReplacementRequired ? (
              <label className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
                <input
                  checked={allowCustomerEmailReplacement}
                  className="mt-1"
                  onChange={(event) =>
                    setAllowCustomerEmailReplacement(event.currentTarget.checked)
                  }
                  type="checkbox"
                />
                Replace the existing Customer email after this send is accepted by
                the provider.
              </label>
            ) : null}

            <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748B]">
                Message preview
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#334155]">
                {estimateDeliveryMessagePreview}
              </p>
            </div>

            {saveState.status === "error" && saveState.message ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                {saveState.message}
              </p>
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className="rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm font-black text-[#0F172A]"
                onClick={() => setIsSendEstimateOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!canConfirmEstimateDelivery || pendingAction === "send"}
                onClick={() => void sendToClient()}
                type="button"
              >
                {pendingAction === "send" ? "Sending..." : "Send Estimate"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isApproveConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/55 px-3 py-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-black text-[#0F172A]">
              Mark Estimate as Approved?
            </h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#475569]">
              Confirm that the customer has agreed to this Estimate.
            </p>
            <div className="mt-4 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748B]">
                Approval method
              </p>
              <p className="mt-1 text-sm font-black text-[#0F172A]">
                Technician / Manual
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#64748B]">
                This records technician manual approval and does not send a customer message.
              </p>
            </div>
            {saveState.status === "error" && saveState.message ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                {saveState.message}
              </p>
            ) : null}
            <p className="mt-3 text-sm font-black text-[#0F172A]">
              {formatServiceRequestMoney(estimateTotalForDisplay)}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className="rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm font-black text-[#0F172A]"
                onClick={() => setIsApproveConfirmOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white"
                onClick={() => void approveForCustomer()}
                type="button"
              >
                Confirm Approval
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isUndoApprovalConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/55 px-3 py-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-black text-[#0F172A]">
              Undo estimate approval?
            </h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#475569]">
              This returns the Estimate to Draft so it can be edited or deleted.
              Approval history is preserved for audit.
            </p>
            {saveState.status === "error" && saveState.message ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                {saveState.message}
              </p>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className="rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm font-black text-[#0F172A]"
                onClick={() => setIsUndoApprovalConfirmOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-black text-white"
                onClick={() => void undoApproval()}
                type="button"
              >
                Undo Approval
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isDeleteConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/55 px-3 py-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-black text-[#0F172A]">
              Delete this draft estimate?
            </h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#475569]">
              This estimate will be permanently deleted. This action cannot be undone.
            </p>
            {deleteState.status === "error" ? (
              <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                {deleteState.message}
              </p>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className="rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm font-black text-[#0F172A] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={deleteState.status === "deleting"}
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setDeleteState({ status: "idle", message: null });
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={deleteState.status === "deleting"}
                onClick={() => void deleteEstimate()}
                type="button"
              >
                {deleteState.status === "deleting" ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPreviewOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#F8FAFC]">
          <div className="min-h-full pb-[env(safe-area-inset-bottom)]">
            <CustomerEstimatePreview
              data={customerPreviewData}
              mode="technician-preview"
              onBack={() => setIsPreviewOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EditableTextSection({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onDictate?: () => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <section className="border-t border-[#E5E7EB] py-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-black">{label}</h3>
        {readOnly ? null : (
        <button
          className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-black text-[#0F6BFF]"
          onClick={() => setEditing((current) => !current)}
          type="button"
        >
          <EstimateIcon className="h-4 w-4" name="edit" />
          {editing ? "Done" : "Edit"}
        </button>
        )}
      </div>
      {editing && !readOnly ? (
        <textarea
          className="mt-3 min-h-24 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-sm font-semibold leading-6 outline-none focus:border-[#0F6BFF] focus:bg-white"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      ) : (
        <p className="mt-2 text-sm font-semibold leading-6 text-[#334155]">
          {value.trim() || "Not entered yet."}
        </p>
      )}
    </section>
  );
}

function ManualEstimateItemSheet({
  draft,
  onCancel,
  onChange,
  onSave,
}: {
  draft: NonNullable<ItemDraftState>;
  onCancel: () => void;
  onChange: (line: ManualEstimateLine) => void;
  onSave: () => void;
}) {
  const line = draft.line;
  const hasName = line.name.trim().length > 0;
  const hasValidQuantity = line.quantity > 0;
  const [customerPriceInput, setCustomerPriceInput] = useState(() =>
    draft.mode === "add" && line.customerUnitPrice === 0
      ? ""
      : formatMoneyInputValue(line.customerUnitPrice),
  );
  const [internalCostInput, setInternalCostInput] = useState(() =>
    draft.mode === "add" && line.internalUnitCost === 0
      ? ""
      : formatMoneyInputValue(line.internalUnitCost),
  );

  function updateLine(patch: Partial<ManualEstimateLine>) {
    onChange({ ...line, ...patch });
  }

  function updateMoneyInput(
    value: string,
    field: "customerUnitPrice" | "internalUnitCost",
    setInput: (nextValue: string) => void,
  ) {
    const nextValue = sanitizeMoneyInputValue(value);

    setInput(nextValue);
    updateLine({ [field]: parseMoneyInputValue(nextValue) });
  }

  function normalizeMoneyInput(
    value: string,
    field: "customerUnitPrice" | "internalUnitCost",
    setInput: (nextValue: string) => void,
  ) {
    const parsed = parseMoneyInputValue(value);

    if (value.trim() === "") {
      setInput("");
      updateLine({ [field]: 0 });
      return;
    }

    setInput(formatMoneyInputValue(parsed));
    updateLine({ [field]: parsed });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/55 px-3 py-4 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F6BFF]">
              Estimate Item
            </p>
            <h3 className="mt-2 text-2xl font-black text-[#0F172A]">
              {draft.mode === "edit" ? "Edit Item" : "Add Item"}
            </h3>
          </div>
          <button
            className="rounded-full border border-[#E5E7EB] px-3 py-1 text-sm font-black text-[#334155]"
            onClick={onCancel}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
              Item name
            </span>
            <input
              className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-black outline-none focus:border-[#0F6BFF]"
              onChange={(event) => updateLine({ name: event.target.value })}
              value={line.name}
            />
            {!hasName ? (
              <span className="mt-1 block text-xs font-bold text-amber-800">
                Item name required
              </span>
            ) : null}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
              Description
            </span>
            <textarea
              className="min-h-20 w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-semibold leading-6 outline-none focus:border-[#0F6BFF]"
              onChange={(event) => updateLine({ description: event.target.value })}
              value={line.description}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
              Type
            </span>
            <select
              className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-bold outline-none focus:border-[#0F6BFF]"
              onChange={(event) =>
                updateLine({
                  type: event.target.value as ManualEstimateLineType,
                  taxable:
                    event.target.value === "part" ? true : draft.line.taxable,
                })
              }
              value={line.type}
            >
              {lineTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
                Quantity
              </span>
              <input
                className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-right text-sm font-black outline-none focus:border-[#0F6BFF]"
                min="0.01"
                onChange={(event) =>
                  updateLine({ quantity: safeNumber(Number(event.target.value)) })
                }
                step="0.01"
                type="number"
                value={String(line.quantity)}
              />
              {!hasValidQuantity ? (
                <span className="mt-1 block text-xs font-bold text-amber-800">
                  Must be greater than zero
                </span>
              ) : null}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
                Customer price
              </span>
              <input
                className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-right text-sm font-black text-[#0F6BFF] outline-none focus:border-[#0F6BFF]"
                inputMode="decimal"
                onBlur={() =>
                  normalizeMoneyInput(
                    customerPriceInput,
                    "customerUnitPrice",
                    setCustomerPriceInput,
                  )
                }
                onChange={(event) =>
                  updateMoneyInput(
                    event.target.value,
                    "customerUnitPrice",
                    setCustomerPriceInput,
                  )
                }
                onFocus={(event) => event.currentTarget.select()}
                placeholder="$0.00"
                type="text"
                value={customerPriceInput}
              />
              {line.customerVisible && line.customerUnitPrice <= 0 ? (
                <span className="mt-1 block text-xs font-bold text-amber-800">
                  Price required before send
                </span>
              ) : null}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
                Internal cost
              </span>
              <input
                className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-right text-sm font-black outline-none focus:border-[#0F6BFF]"
                inputMode="decimal"
                onBlur={() =>
                  normalizeMoneyInput(
                    internalCostInput,
                    "internalUnitCost",
                    setInternalCostInput,
                  )
                }
                onChange={(event) =>
                  updateMoneyInput(
                    event.target.value,
                    "internalUnitCost",
                    setInternalCostInput,
                  )
                }
                onFocus={(event) => event.currentTarget.select()}
                placeholder="$0.00"
                type="text"
                value={internalCostInput}
              />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex min-h-12 items-center gap-2 rounded-xl border border-[#E5E7EB] px-3 text-xs font-black text-[#334155]">
              <input
                checked={line.taxable}
                className="h-4 w-4 accent-[#0F6BFF]"
                onChange={(event) => updateLine({ taxable: event.target.checked })}
                type="checkbox"
              />
              Taxable
            </label>
            <label className="flex min-h-12 items-center gap-2 rounded-xl border border-[#E5E7EB] px-3 text-xs font-black text-[#334155]">
              <input
                checked={line.customerVisible}
                className="h-4 w-4 accent-[#0F6BFF]"
                onChange={(event) =>
                  updateLine({ customerVisible: event.target.checked })
                }
                type="checkbox"
              />
              Customer visible
            </label>
            <label className="flex min-h-12 items-center gap-2 rounded-xl border border-[#E5E7EB] px-3 text-xs font-black text-[#334155]">
              <input
                checked={line.warrantyIncluded}
                className="h-4 w-4 accent-[#0F6BFF]"
                onChange={(event) =>
                  updateLine({ warrantyIncluded: event.target.checked })
                }
                type="checkbox"
              />
              Warranty included
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
                Part number
              </span>
              <input
                className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-bold outline-none focus:border-[#0F6BFF]"
                onChange={(event) => updateLine({ partNumber: event.target.value })}
                value={line.partNumber}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
                Vendor
              </span>
              <input
                className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-bold outline-none focus:border-[#0F6BFF]"
                onChange={(event) => updateLine({ vendor: event.target.value })}
                value={line.vendor}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
              Internal note
            </span>
            <textarea
              className="min-h-20 w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-semibold leading-6 outline-none focus:border-[#0F6BFF]"
              onChange={(event) => updateLine({ internalNote: event.target.value })}
              value={line.internalNote}
            />
          </label>
          <div className="sticky bottom-0 -mx-5 mt-2 grid grid-cols-2 gap-2 border-t border-[#E5E7EB] bg-white p-5">
            <button
              className="rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm font-black text-[#334155]"
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-xl bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!hasName || !hasValidQuantity}
              onClick={onSave}
              type="button"
            >
              Save Item
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
