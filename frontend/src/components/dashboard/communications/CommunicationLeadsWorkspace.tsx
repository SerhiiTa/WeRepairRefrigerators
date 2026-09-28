"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { DashboardMobileDrawer } from "@/components/dashboard/DashboardMobileDrawer";
import type { AddressSuggestion } from "@/lib/address-autocomplete";
import { getAddressAutocompleteAdapter } from "@/lib/address-autocomplete";
import {
  WRA_ASSET_PLACEHOLDER_TYPES,
  getAssetPlaceholderLabel,
} from "@/lib/asset-placeholders";
import { formatServiceRequestDate } from "@/lib/service-request-records";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  IntakeRequestRow,
  PublicSchema,
  ServiceRequestRow,
} from "@/lib/supabase/types";

type CommunicationLeadRow = PublicSchema["Tables"]["communication_leads"]["Row"];
type CommunicationLeadNoteRow = PublicSchema["Tables"]["communication_lead_notes"]["Row"];
type ConversationRow = PublicSchema["Tables"]["communication_conversations"]["Row"];

type LeadEditFormState = {
  customerFirstName: string;
  customerLastName: string;
  customerPhone: string;
  customerEmail: string;
  serviceAddress: string;
  unit: string;
  city: string;
  state: string;
  zipCode: string;
  applianceType: string;
  applianceTypeMode: "preset" | "custom";
  brand: string;
  problemDescription: string;
  preferredAppointmentWindow: string;
};

type ActionState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type LeadDetailState =
  | {
      status: "loading" | "ready";
      lead: CommunicationLeadRow | null;
      intake: IntakeRequestRow | null;
      conversation: ConversationRow | null;
      job: ServiceRequestRow | null;
      notes: CommunicationLeadNoteRow[];
      history: CommunicationLeadRow[];
      error: null;
    }
  | {
      status: "error";
      lead: CommunicationLeadRow | null;
      intake: IntakeRequestRow | null;
      conversation: ConversationRow | null;
      job: ServiceRequestRow | null;
      notes: CommunicationLeadNoteRow[];
      history: CommunicationLeadRow[];
      error: string;
    };

const leadDetailInitialState: LeadDetailState = {
  status: "loading",
  lead: null,
  intake: null,
  conversation: null,
  job: null,
  notes: [],
  history: [],
  error: null,
};

const closeReasons = [
  "No response",
  "Price",
  "Outside service area",
  "Duplicate",
  "Spam",
  "Customer declined",
  "Other",
];

const LEAD_PAGE_SIZE = 50;
const CUSTOM_LEAD_APPLIANCE_TYPE_VALUE = "__custom_lead_appliance_type__";
const LEAD_APPLIANCE_TYPE_OPTIONS = [
  ...WRA_ASSET_PLACEHOLDER_TYPES.filter((type) => type !== "unknown_appliance").map(
    (type) => ({ label: getAssetPlaceholderLabel(type), value: type }),
  ),
  { label: "HVAC", value: "HVAC" },
  { label: "Air Conditioner", value: "Air Conditioner" },
  { label: "Furnace", value: "Furnace" },
  { label: "Heat Pump", value: "Heat Pump" },
  { label: "Water Heater", value: "Water Heater" },
  { label: "Tankless Water Heater", value: "Tankless Water Heater" },
  { label: "Generator", value: "Generator" },
  { label: "Water Softener", value: "Water Softener" },
  { label: "Pool Equipment", value: "Pool Equipment" },
  { label: "Pool Heater", value: "Pool Heater" },
  { label: "Garage Door Opener", value: "Garage Door Opener" },
  { label: "Electrical Panel", value: "Electrical Panel" },
  { label: "EV Charger", value: "EV Charger" },
  { label: "Solar / Inverter", value: "Solar / Inverter" },
  { label: "Pump", value: "Pump" },
].filter((option, index, options) =>
  options.findIndex((candidate) => candidate.value === option.value) === index,
);

function getLeadEditFormState(
  lead: CommunicationLeadRow,
  intake: IntakeRequestRow | null,
): LeadEditFormState {
  const applianceType = intake?.appliance_type ?? lead.appliance_type ?? "";
  const applianceTypeMode =
    applianceType &&
    !LEAD_APPLIANCE_TYPE_OPTIONS.some((option) => option.value === applianceType)
      ? "custom"
      : "preset";

  return {
    customerFirstName: intake?.customer_first_name ?? lead.customer_first_name ?? "",
    customerLastName: intake?.customer_last_name ?? lead.customer_last_name ?? "",
    customerPhone: intake?.customer_phone ?? lead.customer_phone ?? "",
    customerEmail: intake?.customer_email ?? lead.customer_email ?? "",
    serviceAddress: intake?.service_address ?? lead.service_address ?? "",
    unit: intake?.unit ?? lead.unit ?? "",
    city: intake?.city ?? lead.city ?? "",
    state: intake?.state ?? lead.state ?? "TX",
    zipCode: intake?.zip_code ?? lead.zip_code ?? "",
    applianceType,
    applianceTypeMode,
    brand: intake?.brand ?? lead.brand ?? "",
    problemDescription: intake?.problem_description ?? lead.problem_description ?? "",
    preferredAppointmentWindow: intake?.preferred_appointment_window ?? "",
  };
}

function buildLeadCustomerName(firstName: string, lastName: string) {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || null;
}

type IconProps = {
  className?: string;
};

function PhoneIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M7.5 5.5 9.4 9a1.5 1.5 0 0 1-.4 1.9l-1 1a11 11 0 0 0 4.1 4.1l1-1a1.5 1.5 0 0 1 1.9-.4l3.5 1.9a1.5 1.5 0 0 1 .8 1.6l-.3 2a1.6 1.6 0 0 1-1.7 1.3A16.5 16.5 0 0 1 2.6 6.7 1.6 1.6 0 0 1 4 5l2-.3a1.5 1.5 0 0 1 1.5.8Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function MessageIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M5 6.8A3.8 3.8 0 0 1 8.8 3h6.4A3.8 3.8 0 0 1 19 6.8v4.4a3.8 3.8 0 0 1-3.8 3.8h-4.8L6 19v-4.4a3.8 3.8 0 0 1-1-2.6V6.8Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CalendarIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M7 3v3m10-3v3M4 9h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <rect height="16" rx="3" stroke="currentColor" strokeWidth="1.8" width="16" x="4" y="5" />
    </svg>
  );
}

function BriefcaseIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1m-9 5h12M5 7h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function DotsIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function MailIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M4 7.5 12 13l8-5.5M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function LocationIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ApplianceIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <rect height="18" rx="2" stroke="currentColor" strokeWidth="1.8" width="12" x="6" y="3" />
      <path d="M10 7h4M9 12h.01M9 16h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function TagIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M4 12.5V5h7.5L20 13.5 13.5 20 4 12.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
    </svg>
  );
}

function NoteIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path d="M14 3v5h5M8 13h8M8 17h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function SearchIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="m20 20-4.2-4.2M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CopyIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <rect height="12" rx="2" stroke="currentColor" strokeWidth="1.8" width="10" x="9" y="7" />
      <path
        d="M6 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function getLeadName(lead: CommunicationLeadRow | null) {
  if (!lead) {
    return "Unknown contact";
  }

  return (
    [lead.customer_first_name, lead.customer_last_name].filter(Boolean).join(" ") ||
    lead.customer_name ||
    lead.customer_phone ||
    "Unknown contact"
  );
}

function getLeadInitials(lead: CommunicationLeadRow | null) {
  const name = getLeadName(lead);
  const [first, second] = name.split(/\s+/);
  return `${first?.[0] ?? "L"}${second?.[0] ?? ""}`.toUpperCase();
}

function getLeadStatusLabel(status: CommunicationLeadRow["status"]) {
  const labels: Record<CommunicationLeadRow["status"], string> = {
    open: "Open",
    reviewed: "Follow Up",
    converted: "Converted",
    closed: "Lost",
    spam: "Spam",
    archived: "Archived",
  };

  return labels[status] ?? status;
}

function getLeadStatusBadgeClass(status: CommunicationLeadRow["status"]) {
  if (status === "converted") {
    return "bg-[#ECFDF3] text-[#027A48]";
  }

  if (status === "closed" || status === "spam" || status === "archived") {
    return "bg-[#FEF3F2] text-[#D92D20]";
  }

  if (status === "reviewed") {
    return "bg-[#FFF4E5] text-[#F79009]";
  }

  return "bg-[#EAF3FF] text-[#1677FF]";
}

function formatPhone(phone: string | null) {
  if (!phone) {
    return "Not captured";
  }

  const digits = phone.replace(/\D/g, "");
  const tenDigit = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (tenDigit.length === 10) {
    return `(${tenDigit.slice(0, 3)}) ${tenDigit.slice(3, 6)}-${tenDigit.slice(6)}`;
  }

  return phone;
}

function formatAddress(lead: CommunicationLeadRow | null) {
  if (!lead?.service_address) {
    return "Not captured";
  }

  return [lead.service_address, lead.unit, lead.city, lead.state, lead.zip_code]
    .filter(Boolean)
    .join(", ");
}

function formatLeadApplianceType(applianceType: string | null) {
  if (!applianceType) {
    return null;
  }

  return (
    LEAD_APPLIANCE_TYPE_OPTIONS.find((option) => option.value === applianceType)?.label ??
    applianceType
  );
}

function getRequestTitle(lead: CommunicationLeadRow) {
  return [lead.brand, formatLeadApplianceType(lead.appliance_type)].filter(Boolean).join(" ") || "Service request";
}

function getJobBlockedReason(lead: CommunicationLeadRow | null, intake: IntakeRequestRow | null) {
  if (!lead || lead.service_request_id || intake?.linked_service_request_id) {
    return null;
  }

  const customerName =
    [
      intake?.customer_first_name ?? lead.customer_first_name,
      intake?.customer_last_name ?? lead.customer_last_name,
    ]
      .filter(Boolean)
      .join(" ") ||
    intake?.customer_name ||
    lead.customer_name;

  if (!customerName?.trim()) {
    return "Add customer name before creating a Job.";
  }

  if (!(intake?.customer_phone ?? lead.customer_phone)?.trim()) {
    return "Add phone number before creating a Job.";
  }

  if (!(intake?.service_address ?? lead.service_address)?.trim()) {
    return "Add service address before creating a Job.";
  }

  if (!(intake?.zip_code ?? lead.zip_code)?.trim()) {
    return "Add ZIP code before creating a Job.";
  }

  if (!(intake?.appliance_type ?? lead.appliance_type)?.trim()) {
    return "Add appliance or service type before creating a Job.";
  }

  if (!(intake?.problem_description ?? lead.problem_description)?.trim()) {
    return "Add problem description before creating a Job.";
  }

  return null;
}

function ActionMessage({ state }: { state: ActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className={`rounded-xl border p-3 text-sm font-semibold ${
        state.status === "error"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {state.message}
    </p>
  );
}

function FieldInput({
  label,
  name,
  value,
  type = "text",
}: {
  label: string;
  name: string;
  value: string | null;
  type?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-[#475569]">
      {label}
      <input
        className="mt-1 h-11 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-base font-medium text-[#101828] outline-none focus:border-[#1677FF]"
        defaultValue={value ?? ""}
        name={name}
        type={type}
      />
    </label>
  );
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-[#E4E7EC] bg-white p-4 shadow-[0_6px_18px_rgba(16,24,40,0.04)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[#101828]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function DetailRow({ icon, value, trailing }: { icon: ReactNode; value: string; trailing?: ReactNode }) {
  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-3 text-sm">
      <span className="flex h-6 w-6 items-center justify-center text-[#667085]">
        {icon}
      </span>
      <span className="pt-0.5 font-medium text-[#101828]">{value}</span>
      {trailing}
    </div>
  );
}

async function fetchLeadDetail(leadId: string): Promise<LeadDetailState> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return {
      ...leadDetailInitialState,
      status: "error",
      error: "Supabase is not configured.",
    };
  }

  const { data: leadData, error: leadError } = await supabase
    .from("communication_leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (leadError || !leadData) {
    return {
      ...leadDetailInitialState,
      status: "error",
      error: "Lead is unavailable.",
    };
  }

  const lead = leadData as CommunicationLeadRow;
  const [intakeResult, conversationResult, jobResult, notesResult, historyResult] =
    await Promise.all([
      lead.intake_request_id
        ? supabase.from("intake_requests").select("*").eq("id", lead.intake_request_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      lead.conversation_id
        ? supabase.from("communication_conversations").select("*").eq("id", lead.conversation_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      lead.service_request_id
        ? supabase.from("service_requests").select("*").eq("id", lead.service_request_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("communication_lead_notes")
        .select("*")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false }),
      lead.canonical_phone
        ? supabase
            .from("communication_leads")
            .select("*")
            .eq("company_id", lead.company_id)
            .eq("canonical_phone", lead.canonical_phone)
            .neq("id", lead.id)
            .order("created_at", { ascending: false })
            .limit(6)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (
    intakeResult.error ||
    conversationResult.error ||
    jobResult.error ||
    notesResult.error ||
    historyResult.error
  ) {
    return {
      ...leadDetailInitialState,
      status: "error",
      lead,
      error: "Lead detail is unavailable right now.",
    };
  }

  return {
    status: "ready",
    lead,
    intake: (intakeResult.data ?? null) as IntakeRequestRow | null,
    conversation: (conversationResult.data ?? null) as ConversationRow | null,
    job: (jobResult.data ?? null) as ServiceRequestRow | null,
    notes: (notesResult.data ?? []) as CommunicationLeadNoteRow[],
    history: (historyResult.data ?? []) as CommunicationLeadRow[],
    error: null,
  };
}

export function CommunicationLeadsWorkspace() {
  const [leads, setLeads] = useState<CommunicationLeadRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [filter, setFilter] = useState<"open" | "follow_up" | "converted" | "closed" | "all">(
    "all",
  );
  const [page, setPage] = useState(0);
  const [hasMoreLeads, setHasMoreLeads] = useState(false);
  const [counts, setCounts] = useState<Record<typeof filter, number>>({
    open: 0,
    follow_up: 0,
    converted: 0,
    closed: 0,
    all: 0,
  });

  const applyLeadFilter = useCallback(
    <Query extends {
      eq: (column: string, value: string) => Query;
      or: (filters: string) => Query;
    }>(
      query: Query,
      nextFilter: typeof filter,
    ) => {
      if (nextFilter === "open") {
        return query.eq("status", "open");
      }
      if (nextFilter === "follow_up") {
        return query.or("status.eq.reviewed,follow_up_at.not.is.null");
      }
      if (nextFilter === "converted") {
        return query.eq("status", "converted");
      }
      if (nextFilter === "closed") {
        return query.eq("status", "closed");
      }
      return query;
    },
    [],
  );

  useEffect(() => {
    let mounted = true;

    async function loadLeadCounts() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        return;
      }

      const countFilters: Array<typeof filter> = [
        "open",
        "follow_up",
        "converted",
        "closed",
        "all",
      ];
      const results = await Promise.all(
        countFilters.map(async (countFilter) => {
          const query = applyLeadFilter(
            supabase
              .from("communication_leads")
              .select("id", { count: "exact", head: true }),
            countFilter,
          );
          const { count, error } = await query;
          return [countFilter, error ? 0 : count ?? 0] as const;
        }),
      );

      if (!mounted) {
        return;
      }

      setCounts(Object.fromEntries(results) as Record<typeof filter, number>);
    }

    void loadLeadCounts();

    return () => {
      mounted = false;
    };
  }, [applyLeadFilter, filter]);

  useEffect(() => {
    let mounted = true;

    async function loadLeads() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setStatus("error");
        return;
      }

      setStatus("loading");

      const upperRange = (page + 1) * LEAD_PAGE_SIZE;
      const query = applyLeadFilter(
        supabase
          .from("communication_leads")
          .select("*")
          .order("created_at", { ascending: false })
          .range(0, upperRange),
        filter,
      );
      const { data, error } = await query;

      if (!mounted) {
        return;
      }

      if (error) {
        setStatus("error");
        return;
      }

      const rows = (data ?? []) as CommunicationLeadRow[];
      setLeads(rows.slice(0, (page + 1) * LEAD_PAGE_SIZE));
      setHasMoreLeads(rows.length > (page + 1) * LEAD_PAGE_SIZE);
      setStatus("ready");
    }

    void loadLeads();

    return () => {
      mounted = false;
    };
  }, [applyLeadFilter, filter, page]);

  const filters: Array<[typeof filter, string]> = [
    ["all", "All"],
    ["open", "Open"],
    ["follow_up", "Follow Up"],
    ["converted", "Converted"],
    ["closed", "Lost"],
  ];

  return (
    <main className="-mx-4 -my-5 min-h-screen bg-[#F6F8FB] px-4 pb-20 sm:-mx-6 lg:mx-auto lg:my-0 lg:max-w-3xl lg:px-0">
      <div className="flex min-h-16 items-center justify-between gap-3">
        <DashboardMobileDrawer trigger="hamburger" />
        <p className="min-w-0 flex-1 truncate text-center text-[21px] font-bold text-[#101828]">
          Leads
        </p>
        <button
          aria-label="Search leads"
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#101828]"
          type="button"
        >
          <SearchIcon className="h-6 w-6" />
        </button>
      </div>

      <header className="space-y-3 pt-4">
        <h1 className="text-[32px] font-bold leading-tight tracking-normal text-[#101828]">Leads</h1>
        <p className="max-w-md text-base font-medium leading-6 text-[#667085]">
          Service opportunities from Communications and Intake.
        </p>
        <div className="flex flex-wrap gap-2">
          {filters.map(([value, label]) => (
            <button
              className={`h-11 rounded-xl border px-4 text-sm font-bold ${
                filter === value
                  ? value === "follow_up"
                    ? "border-[#F79009] bg-[#FFF4E5] text-[#F79009]"
                    : "border-[#1677FF] bg-[#EAF3FF] text-[#1677FF]"
                  : "border-[#E4E7EC] bg-white text-[#475467]"
              }`}
              key={value}
              onClick={() => {
                setFilter(value);
                setPage(0);
              }}
              type="button"
            >
              {label}{" "}
              <span className="ml-1 rounded-full bg-[#E4E7EC] px-2 py-0.5 text-xs text-[#667085]">
                {counts[value]}
              </span>
            </button>
          ))}
        </div>
      </header>

      <section className="mt-5 space-y-3">
        {status === "loading" ? (
          <p className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-sm font-semibold text-[#64748B]">
            Loading leads...
          </p>
        ) : status === "error" ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-800">
            Leads are unavailable right now.
          </p>
        ) : leads.length === 0 ? (
          <p className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-sm font-semibold text-[#64748B]">
            No leads in this view.
          </p>
        ) : (
          <>
            {leads.map((lead) => (
              <Link
                className="block rounded-2xl border border-[#E4E7EC] bg-white p-4 shadow-[0_6px_18px_rgba(16,24,40,0.04)] transition hover:border-[#1677FF] hover:bg-[#F2F7FF]"
                href={`/dashboard/communication-leads/${lead.id}`}
                key={lead.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold text-[#101828]">{getLeadName(lead)}</h2>
                    <p className="mt-1 text-base font-semibold text-[#344054]">{getRequestTitle(lead)}</p>
                    <p className="mt-1 line-clamp-2 text-base font-medium text-[#475467]">
                      {lead.problem_description ?? "No problem details captured."}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${getLeadStatusBadgeClass(lead.status)}`}>
                    {getLeadStatusLabel(lead.status)}
                  </span>
                </div>
                <div className="mt-3 space-y-2 text-sm font-medium text-[#667085]">
                  <p className="flex items-center gap-2">
                    <PhoneIcon className="h-4 w-4" />
                    {formatPhone(lead.customer_phone)}
                  </p>
                  <p className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    {formatServiceRequestDate(lead.created_at)}
                  </p>
                  <p className="flex items-center gap-2">
                    <LocationIcon className="h-4 w-4 shrink-0" />
                    <span className="line-clamp-1">{formatAddress(lead)}</span>
                    <span className="ml-auto text-xl leading-none text-[#1677FF]">›</span>
                  </p>
                </div>
              </Link>
            ))}
            {hasMoreLeads ? (
              <button
                className="h-12 w-full rounded-2xl border border-[#1677FF] bg-white text-sm font-black text-[#1677FF]"
                onClick={() => setPage((value) => value + 1)}
                type="button"
              >
                Load More
              </button>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}

export function CommunicationLeadDetail({ leadId }: { leadId: string }) {
  const [state, setState] = useState<LeadDetailState>(leadDetailInitialState);
  const [reloadToken, setReloadToken] = useState(0);
  const [jobState, setJobState] = useState<ActionState>({ status: "idle", message: null });
  const [followUpState, setFollowUpState] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [noteState, setNoteState] = useState<ActionState>({ status: "idle", message: null });
  const [closeState, setCloseState] = useState<ActionState>({ status: "idle", message: null });
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [showFollowUpEditor, setShowFollowUpEditor] = useState(false);
  const [showNoteEditor, setShowNoteEditor] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setState((current) => ({ ...current, status: "loading", error: null }));
      const nextState = await fetchLeadDetail(leadId);
      if (mounted) {
        setState(nextState);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [leadId, reloadToken]);

  const lead = state.lead;
  const jobId = lead?.service_request_id ?? state.intake?.linked_service_request_id ?? state.job?.id ?? null;
  const jobBlockedReason = getJobBlockedReason(lead, state.intake);
  const canCreateJob = Boolean(lead && (state.intake || lead.conversation_id) && !jobId && !jobBlockedReason);

  async function createJob() {
    if (!lead) {
      return;
    }

    if (jobId) {
      window.location.assign(`/dashboard/leads/${jobId}`);
      return;
    }

    if (!state.intake && !lead.conversation_id) {
      setJobState({
        status: "error",
        message: "This Lead is missing the communication context needed to create a Job.",
      });
      return;
    }

    setJobState({ status: "saving", message: "Creating job..." });

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Log in again to create this job.");
      }

      const response = await fetch(
        state.intake
          ? `/api/intake/${state.intake.id}/convert`
          : `/api/communications/conversations/${lead.conversation_id}/create-job`,
        {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ allowPossibleDuplicate: true }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        conversion?: { serviceRequestId?: string | null; alreadyConverted?: boolean };
        message?: string;
        ok?: boolean;
      } | null;

      if (!response.ok || !payload?.ok || !payload.conversion?.serviceRequestId) {
        throw new Error(payload?.message ?? "Could not create this job.");
      }

      setJobState({
        status: "success",
        message: payload.conversion.alreadyConverted ? "Job already existed." : "Job created.",
      });
      setReloadToken((value) => value + 1);
    } catch (error) {
      setJobState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not create this job.",
      });
    }
  }

  async function saveFollowUp(formData: FormData) {
    if (!lead) {
      return;
    }

    const date = String(formData.get("follow_up_date") ?? "");
    const time = String(formData.get("follow_up_time") ?? "");
    const note = String(formData.get("follow_up_note") ?? "");
    const followUpAt = date ? new Date(`${date}T${time || "09:00"}:00`).toISOString() : null;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    setFollowUpState({ status: "saving", message: "Saving follow-up..." });
    const { error } = await supabase.rpc("set_communication_lead_follow_up_rpc", {
      p_lead_id: lead.id,
      p_follow_up_at: followUpAt,
      p_note: note,
    });

    if (error) {
      setFollowUpState({ status: "error", message: error.message });
      return;
    }

    setFollowUpState({ status: "success", message: "Follow-up saved." });
    setShowFollowUpEditor(false);
    setReloadToken((value) => value + 1);
  }

  async function addNote(formData: FormData) {
    if (!lead) {
      return;
    }

    const body = String(formData.get("body") ?? "");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    setNoteState({ status: "saving", message: "Saving note..." });
    const { error } = await supabase.rpc("add_communication_lead_note_rpc", {
      p_lead_id: lead.id,
      p_body: body,
    });

    if (error) {
      setNoteState({ status: "error", message: error.message });
      return;
    }

    setNoteState({ status: "success", message: "Note added." });
    setShowNoteEditor(false);
    setReloadToken((value) => value + 1);
  }

  async function closeLead(formData: FormData) {
    if (!lead) {
      return;
    }

    const reason = String(formData.get("reason") ?? "");
    const note = String(formData.get("note") ?? "");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    setCloseState({ status: "saving", message: "Closing lead..." });
    const { error } = await supabase.rpc("close_communication_lead_with_reason_rpc", {
      p_lead_id: lead.id,
      p_reason: reason,
      p_note: note,
    });

    if (error) {
      setCloseState({ status: "error", message: error.message });
      return;
    }

    setCloseState({ status: "success", message: "Lead closed as lost." });
    setShowCloseForm(false);
    setReloadToken((value) => value + 1);
  }

  if (state.status === "loading" && !lead) {
    return (
      <main className="mx-auto max-w-3xl">
        <p className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-sm font-semibold text-[#64748B]">
          Loading lead...
        </p>
      </main>
    );
  }

  if (!lead || state.status === "error") {
    return (
      <main className="mx-auto max-w-3xl space-y-4">
        <Link className="text-sm font-bold text-[#0F6BFF]" href="/dashboard/communication-leads">
          Back to Leads
        </Link>
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-800">
          {state.error ?? "Lead is unavailable."}
        </p>
      </main>
    );
  }

  return (
    <main className="-mx-4 -my-5 min-h-screen max-w-none space-y-3 bg-[#F6F8FB] px-4 pb-20 pt-4 sm:-mx-6 lg:mx-auto lg:my-0 lg:max-w-3xl lg:px-0">
      <div className="flex h-10 items-center justify-between">
        <Link className="text-base font-medium text-[#1677FF]" href="/dashboard/communication-leads">
          ‹ Leads
        </Link>
        <button
          aria-label="More lead actions"
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#101828]"
          onClick={() => setShowCloseForm((value) => !value)}
          type="button"
        >
          <DotsIcon className="h-5 w-5" />
        </button>
      </div>

      <header className="pt-1">
        <div className="flex items-start gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#DDEEFF] text-xl font-bold text-[#1677FF]">
            {getLeadInitials(lead)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-2xl font-bold text-[#101828]">{getLeadName(lead)}</h1>
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${getLeadStatusBadgeClass(lead.status)}`}>
                {getLeadStatusLabel(lead.status)}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-[#667085]">
              {lead.source_name ?? lead.source_type ?? "Unknown source"} ·{" "}
              {formatServiceRequestDate(lead.created_at)}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2">
          <a
            className={`flex h-[68px] flex-col items-center justify-center gap-1 rounded-xl border text-center text-xs font-bold ${
              lead.customer_phone
                ? "border-[#E4E7EC] bg-white text-[#101828]"
                : "pointer-events-none border-[#E4E7EC] bg-white text-[#98A2B3]"
            }`}
            href={lead.customer_phone ? `tel:${lead.customer_phone}` : undefined}
          >
            <PhoneIcon className="h-6 w-6 text-[#12B76A]" />
            Call
          </a>
          <Link
            className={`flex h-[68px] flex-col items-center justify-center gap-1 rounded-xl border text-center text-xs font-bold ${
              lead.conversation_id
                ? "border-[#E4E7EC] bg-white text-[#101828]"
                : "pointer-events-none border-[#E4E7EC] bg-white text-[#98A2B3]"
            }`}
            href={
              lead.conversation_id
                ? `/dashboard/communications?conversation=${lead.conversation_id}&view=detail`
                : "#"
            }
          >
            <MessageIcon className="h-6 w-6 text-[#1677FF]" />
            Message
          </Link>
          {jobId ? (
            <Link
              className="flex h-[68px] flex-col items-center justify-center gap-1 rounded-xl border border-[#E4E7EC] bg-white text-center text-xs font-bold text-[#101828]"
              href={`/dashboard/leads/${jobId}`}
            >
              <BriefcaseIcon className="h-6 w-6 text-[#1677FF]" />
              Open Job
            </Link>
          ) : (
            <button
              className="flex h-[68px] flex-col items-center justify-center gap-1 rounded-xl border border-[#E4E7EC] bg-white text-center text-xs font-bold text-[#101828] disabled:cursor-not-allowed disabled:text-[#98A2B3]"
              disabled={!canCreateJob || jobState.status === "saving"}
              onClick={() => void createJob()}
              type="button"
            >
              <BriefcaseIcon className="h-6 w-6 text-[#1677FF]" />
              {jobState.status === "saving" ? "Creating..." : "Create Job"}
            </button>
          )}
          <button
            className="flex h-[68px] flex-col items-center justify-center gap-1 rounded-xl border border-[#E4E7EC] bg-white text-center text-xs font-bold text-[#101828]"
            onClick={() => setShowCloseForm((value) => !value)}
            type="button"
          >
            <DotsIcon className="h-6 w-6 text-[#667085]" />
            More
          </button>
        </div>
      </header>

      <ActionMessage state={jobState} />
      {jobBlockedReason ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          {jobBlockedReason}
        </p>
      ) : null}

      {showCloseForm && lead.status !== "closed" ? (
        <SectionCard title="Close / Lost Lead">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void closeLead(new FormData(event.currentTarget));
            }}
          >
            <label className="block text-sm font-semibold text-[#475569]">
              Reason
              <select
                className="mt-1 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-base font-medium text-[#101828]"
                name="reason"
                required
              >
                <option value="">Select reason</option>
                {closeReasons.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-[#475569]">
              Note
              <textarea
                className="mt-1 min-h-20 w-full rounded-lg border border-[#D8E0EA] bg-white px-3 py-2 text-base font-medium text-[#0F172A]"
                name="note"
              />
            </label>
            <button
              className="rounded-lg bg-[#D92D20] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              disabled={closeState.status === "saving"}
              type="submit"
            >
              {closeState.status === "saving" ? "Closing..." : "Close Lead"}
            </button>
            <ActionMessage state={closeState} />
          </form>
        </SectionCard>
      ) : null}

      <SectionCard
        action={
          <Link className="text-sm font-black text-[#0F6BFF]" href={`/dashboard/communication-leads/${lead.id}/edit`}>
            Edit
          </Link>
        }
        title="Contact"
      >
        <div className="space-y-3">
          <DetailRow
            icon={<PhoneIcon className="h-5 w-5" />}
            trailing={
              lead.customer_phone ? (
                <span className="text-[#667085]">
                  <CopyIcon className="h-5 w-5" />
                </span>
              ) : null
            }
            value={formatPhone(lead.customer_phone)}
          />
          <DetailRow icon={<MailIcon className="h-5 w-5" />} value={lead.customer_email ?? "Not captured"} />
          <DetailRow icon={<LocationIcon className="h-5 w-5" />} value={formatAddress(lead)} />
        </div>
      </SectionCard>

      <SectionCard
        action={
          <Link className="text-sm font-black text-[#0F6BFF]" href={`/dashboard/communication-leads/${lead.id}/edit`}>
            Edit
          </Link>
        }
        title="Request Details"
      >
        <div className="space-y-3">
          <DetailRow icon={<ApplianceIcon className="h-5 w-5" />} value={formatLeadApplianceType(lead.appliance_type) ?? "Not captured"} />
          <DetailRow icon={<TagIcon className="h-5 w-5" />} value={lead.brand ?? "Not captured"} />
          <DetailRow icon={<NoteIcon className="h-5 w-5" />} value={lead.problem_description ?? "Not captured"} />
        </div>
      </SectionCard>

      <SectionCard title="Follow Up">
        <div className="flex items-center gap-3">
          <CalendarIcon className="h-6 w-6 shrink-0 text-[#1677FF]" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#667085]">
              {lead.follow_up_at ? formatServiceRequestDate(lead.follow_up_at) : "No follow-up scheduled"}
            </p>
            {lead.follow_up_note ? (
              <p className="mt-1 text-sm font-medium text-[#101828]">{lead.follow_up_note}</p>
            ) : null}
          </div>
          <button
            className="rounded-lg border border-[#1677FF] px-3 py-2 text-sm font-bold text-[#1677FF]"
            onClick={() => setShowFollowUpEditor(true)}
            type="button"
          >
            {lead.follow_up_at ? "Edit" : "+ Add follow-up"}
          </button>
        </div>
        {showFollowUpEditor ? (
          <form
            className="mt-3 space-y-3 border-t border-[#E4E7EC] pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveFollowUp(new FormData(event.currentTarget));
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldInput label="Date" name="follow_up_date" type="date" value={null} />
              <FieldInput label="Time" name="follow_up_time" type="time" value={null} />
            </div>
            <FieldInput label="Follow-up note" name="follow_up_note" value={lead.follow_up_note} />
            <div className="flex gap-2">
              <button
                className="rounded-lg bg-[#1677FF] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                disabled={followUpState.status === "saving"}
                type="submit"
              >
                {followUpState.status === "saving" ? "Saving..." : "Save Follow-up"}
              </button>
              <button
                className="rounded-lg border border-[#E4E7EC] px-4 py-2 text-sm font-bold text-[#475467]"
                onClick={() => setShowFollowUpEditor(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
            <ActionMessage state={followUpState} />
          </form>
        ) : null}
      </SectionCard>

      <SectionCard title="Notes">
        <div className="space-y-3">
          {state.notes.length === 0 ? (
            <div className="flex items-center gap-3">
              <NoteIcon className="h-6 w-6 text-[#1677FF]" />
              <p className="min-w-0 flex-1 text-sm font-medium text-[#667085]">No notes yet</p>
              <button
                className="rounded-lg border border-[#1677FF] px-3 py-2 text-sm font-bold text-[#1677FF]"
                onClick={() => setShowNoteEditor(true)}
                type="button"
              >
                + Add note
              </button>
            </div>
          ) : (
            <>
              {state.notes.map((note) => (
                <div className="rounded-xl bg-[#F6F8FB] p-3" key={note.id}>
                  <p className="text-xs font-bold text-[#667085]">
                    {formatServiceRequestDate(note.created_at)}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[#101828]">{note.body}</p>
                </div>
              ))}
              <button
                className="rounded-lg border border-[#1677FF] px-3 py-2 text-sm font-bold text-[#1677FF]"
                onClick={() => setShowNoteEditor(true)}
                type="button"
              >
                + Add note
              </button>
            </>
          )}
          {showNoteEditor ? (
            <form
              className="space-y-2 border-t border-[#E4E7EC] pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                void addNote(new FormData(event.currentTarget));
                event.currentTarget.reset();
              }}
            >
              <textarea
                className="min-h-20 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-base font-medium text-[#101828]"
                name="body"
                placeholder="Add internal note"
              />
              <div className="flex gap-2">
                <button
                  className="rounded-lg bg-[#1677FF] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  disabled={noteState.status === "saving"}
                  type="submit"
                >
                  {noteState.status === "saving" ? "Saving..." : "Add Note"}
                </button>
                <button
                  className="rounded-lg border border-[#E4E7EC] px-4 py-2 text-sm font-bold text-[#475467]"
                  onClick={() => setShowNoteEditor(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
              <ActionMessage state={noteState} />
            </form>
          ) : null}
        </div>
      </SectionCard>

      {state.history.length > 0 ? (
        <SectionCard title="Previous Lead History">
          <div className="space-y-3">
            {state.history.map((historyLead) => (
              <Link
                className="block rounded-xl border border-[#E4E7EC] bg-[#F6F8FB] p-3"
                href={`/dashboard/communication-leads/${historyLead.id}`}
                key={historyLead.id}
              >
                <p className="text-sm font-bold text-[#101828]">{getLeadName(historyLead)}</p>
                <p className="text-xs font-bold text-[#667085]">
                  {getLeadStatusLabel(historyLead.status)} · {formatServiceRequestDate(historyLead.created_at)}
                </p>
              </Link>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Communication">
        {lead.conversation_id ? (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EAF3FF] text-[#1677FF]">
              <MessageIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-[#101828]">Communication</p>
              <p className="text-sm font-medium text-[#667085]">View full conversation and history</p>
            </div>
            <Link
              className="rounded-lg border border-[#1677FF] px-4 py-2 text-sm font-bold text-[#1677FF]"
              href={`/dashboard/communications?conversation=${lead.conversation_id}&view=detail`}
            >
              Open
            </Link>
          </div>
        ) : (
          <p className="text-sm font-semibold text-[#667085]">No linked conversation.</p>
        )}
      </SectionCard>
    </main>
  );
}

export function CommunicationLeadEdit({ leadId }: { leadId: string }) {
  const [state, setState] = useState<LeadDetailState>(leadDetailInitialState);
  const [saveState, setSaveState] = useState<ActionState>({ status: "idle", message: null });
  const [form, setForm] = useState<LeadEditFormState | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSearchState, setAddressSearchState] = useState<
    "idle" | "searching" | "error"
  >("idle");
  const [isAddressSearchActive, setIsAddressSearchActive] = useState(false);
  const addressAutocomplete = getAddressAutocompleteAdapter();
  const serviceAddressSearchText = form?.serviceAddress ?? "";

  useEffect(() => {
    let mounted = true;

    async function load() {
      const nextState = await fetchLeadDetail(leadId);
      if (mounted) {
        setState(nextState);
        if (nextState.lead) {
          setForm(getLeadEditFormState(nextState.lead, nextState.intake));
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [leadId]);

  useEffect(() => {
    if (!isAddressSearchActive || !addressAutocomplete.isConfigured) {
      return;
    }

    const query = serviceAddressSearchText.trim();
    if (query.length < 3) {
      return;
    }

    let isCancelled = false;
    const timeout = window.setTimeout(() => {
      setAddressSearchState("searching");
      addressAutocomplete
        .search(query)
        .then((suggestions) => {
          if (!isCancelled) {
            setAddressSuggestions(suggestions);
            setAddressSearchState("idle");
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setAddressSuggestions([]);
            setAddressSearchState("error");
          }
        });
    }, 250);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeout);
    };
  }, [addressAutocomplete, serviceAddressSearchText, isAddressSearchActive]);

  function updateForm<Key extends keyof LeadEditFormState>(
    key: Key,
    value: LeadEditFormState[Key],
  ) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  async function selectAddressSuggestion(suggestion: AddressSuggestion) {
    if (!form) {
      return;
    }

    setAddressSearchState("searching");

    try {
      const resolvedSuggestion = addressAutocomplete.resolve
        ? await addressAutocomplete.resolve(suggestion)
        : suggestion;

      setForm({
        ...form,
        serviceAddress: resolvedSuggestion.streetAddress,
        city: resolvedSuggestion.city,
        state: resolvedSuggestion.state || "TX",
        zipCode: resolvedSuggestion.zipCode.replace(/\D/g, "").slice(0, 5),
      });
      setAddressSuggestions([]);
      setIsAddressSearchActive(false);
      setAddressSearchState("idle");
    } catch {
      setAddressSearchState("error");
    }
  }

  async function saveLead() {
    if (!form) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    const payload = {
      customer_first_name: form.customerFirstName,
      customer_last_name: form.customerLastName,
      customer_name: buildLeadCustomerName(form.customerFirstName, form.customerLastName),
      customer_phone: form.customerPhone,
      customer_email: form.customerEmail,
      service_address: form.serviceAddress,
      unit: form.unit,
      city: form.city,
      state: form.state,
      zip_code: form.zipCode,
      appliance_type: form.applianceType,
      brand: form.brand,
      problem_description: form.problemDescription,
      preferred_appointment_window: form.preferredAppointmentWindow,
    };

    setSaveState({ status: "saving", message: "Saving Lead..." });
    const { error } = await supabase.rpc("update_communication_lead_operational_details_rpc", {
      p_lead_id: leadId,
      p_payload: payload,
    });

    if (error) {
      setSaveState({ status: "error", message: error.message });
      return;
    }

    setSaveState({ status: "success", message: "Lead saved." });
    window.location.assign(`/dashboard/communication-leads/${leadId}`);
  }

  const lead = state.lead;
  const applianceTypeSelectValue =
    form?.applianceTypeMode === "custom"
      ? CUSTOM_LEAD_APPLIANCE_TYPE_VALUE
      : form?.applianceType ?? "";

  if (state.status === "loading" && !lead) {
    return (
      <main className="-mx-4 -my-5 min-h-screen bg-[#F6F8FB] px-4 py-4 sm:-mx-6">
        <p className="rounded-2xl border border-[#E4E7EC] bg-white p-5 text-sm font-semibold text-[#667085]">
          Loading Lead...
        </p>
      </main>
    );
  }

  if (!lead || state.status === "error") {
    return (
      <main className="-mx-4 -my-5 min-h-screen space-y-4 bg-[#F6F8FB] px-4 py-4 sm:-mx-6">
        <Link className="text-sm font-bold text-[#1677FF]" href={`/dashboard/communication-leads/${leadId}`}>
          Back to Lead
        </Link>
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-800">
          {state.error ?? "Lead is unavailable."}
        </p>
      </main>
    );
  }

  return (
    <main className="-mx-4 -my-5 min-h-screen max-w-none space-y-3 bg-[#F6F8FB] px-4 pb-20 pt-4 sm:-mx-6 lg:mx-auto lg:my-0 lg:max-w-3xl lg:px-0">
      <div className="sticky top-0 z-10 -mx-4 flex h-14 items-center justify-between bg-[#F6F8FB]/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        <Link className="min-w-0 max-w-[34%] truncate text-base font-medium text-[#1677FF]" href={`/dashboard/communication-leads/${lead.id}`}>
          ‹ {getLeadName(lead)}
        </Link>
        <h1 className="text-lg font-bold text-[#101828]">Edit Lead</h1>
        <button
          className="rounded-[10px] bg-[#1677FF] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          disabled={saveState.status === "saving" || !form}
          form="lead-edit-form"
          type="submit"
        >
          {saveState.status === "saving" ? "Saving..." : "Save"}
        </button>
      </div>

      <form
        className="space-y-3 pt-1"
        id="lead-edit-form"
        onSubmit={(event) => {
          event.preventDefault();
          void saveLead();
        }}
      >
        <SectionCard title="Contact Information">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-[#475569]">
                First Name
                <input
                  className="mt-1 h-11 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-base font-medium text-[#101828] outline-none focus:border-[#1677FF]"
                  name="customer_first_name"
                  onChange={(event) => updateForm("customerFirstName", event.target.value)}
                  value={form?.customerFirstName ?? ""}
                />
              </label>
              <label className="block text-sm font-semibold text-[#475569]">
                Last Name
                <input
                  className="mt-1 h-11 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-base font-medium text-[#101828] outline-none focus:border-[#1677FF]"
                  name="customer_last_name"
                  onChange={(event) => updateForm("customerLastName", event.target.value)}
                  value={form?.customerLastName ?? ""}
                />
              </label>
            </div>
            <label className="block text-sm font-semibold text-[#475569]">
              Phone
              <input
                className="mt-1 h-11 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-base font-medium text-[#101828] outline-none focus:border-[#1677FF]"
                name="customer_phone"
                onChange={(event) => updateForm("customerPhone", event.target.value)}
                value={form?.customerPhone ?? ""}
              />
            </label>
            <label className="block text-sm font-semibold text-[#475569]">
              Email
              <input
                className="mt-1 h-11 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-base font-medium text-[#101828] outline-none focus:border-[#1677FF]"
                name="customer_email"
                onChange={(event) => updateForm("customerEmail", event.target.value)}
                value={form?.customerEmail ?? ""}
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard title="Service Address">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <div className="relative grid gap-2 text-sm font-semibold text-[#475569]">
                <label htmlFor="lead-service-address">Street Address</label>
                <input
                  className="h-11 rounded-lg border border-[#D0D5DD] bg-white px-3 text-base font-medium text-[#101828] outline-none transition focus:border-[#1677FF] focus:ring-4 focus:ring-blue-100"
                  id="lead-service-address"
                  name="service_address"
                  onBlur={() => {
                    window.setTimeout(() => setIsAddressSearchActive(false), 160);
                  }}
                  onChange={(event) => {
                    const value = event.target.value;
                    setIsAddressSearchActive(true);
                    if (value.trim().length < 3) {
                      setAddressSuggestions([]);
                      setAddressSearchState("idle");
                    }
                    updateForm("serviceAddress", value);
                  }}
                  onFocus={() => setIsAddressSearchActive(true)}
                  placeholder={
                    addressAutocomplete.isConfigured
                      ? "Start typing to search addresses"
                      : "Street address"
                  }
                  value={form?.serviceAddress ?? ""}
                />
              {addressAutocomplete.isConfigured && isAddressSearchActive ? (
                <div className="absolute left-0 right-0 top-[4.75rem] z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.18)]">
                  {addressSuggestions.length > 0 ? (
                    addressSuggestions.map((suggestion) => (
                      <button
                        className="block w-full border-b border-slate-100 px-4 py-3 text-left text-sm font-bold text-slate-800 last:border-b-0 hover:bg-blue-50"
                        key={`${suggestion.provider}-${suggestion.placeId ?? suggestion.label}`}
                        onClick={() => void selectAddressSuggestion(suggestion)}
                        onMouseDown={(event) => event.preventDefault()}
                        type="button"
                      >
                        {suggestion.label}
                      </button>
                    ))
                  ) : (
                    <p className="px-4 py-3 text-sm font-semibold text-[#667085]">
                      {addressSearchState === "searching"
                        ? "Searching addresses..."
                        : addressSearchState === "error"
                          ? "Address search is unavailable. Enter the address manually."
                          : "Type at least 3 characters to search."}
                    </p>
                  )}
                </div>
              ) : null}
              </div>
            </div>
            <label className="block text-sm font-semibold text-[#475569]">
              Unit
              <input
                className="mt-1 h-11 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-base font-medium text-[#101828] outline-none focus:border-[#1677FF]"
                name="unit"
                onChange={(event) => updateForm("unit", event.target.value)}
                value={form?.unit ?? ""}
              />
            </label>
            <label className="block text-sm font-semibold text-[#475569]">
              ZIP
              <input
                className="mt-1 h-11 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-base font-medium text-[#101828] outline-none focus:border-[#1677FF]"
                name="zip_code"
                onChange={(event) => updateForm("zipCode", event.target.value.replace(/\D/g, "").slice(0, 5))}
                value={form?.zipCode ?? ""}
              />
            </label>
            <label className="block text-sm font-semibold text-[#475569]">
              City
              <input
                className="mt-1 h-11 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-base font-medium text-[#101828] outline-none focus:border-[#1677FF]"
                name="city"
                onChange={(event) => updateForm("city", event.target.value)}
                value={form?.city ?? ""}
              />
            </label>
            <label className="block text-sm font-semibold text-[#475569]">
              State
              <input
                className="mt-1 h-11 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-base font-medium text-[#101828] outline-none focus:border-[#1677FF]"
                name="state"
                onChange={(event) => updateForm("state", event.target.value.toUpperCase().slice(0, 2))}
                value={form?.state ?? ""}
              />
            </label>
          </div>
        </SectionCard>

        <SectionCard title="Appliance / Service">
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-[#475569]">
              Appliance / Service Type
              <select
                className="mt-1 h-11 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-base font-medium text-[#101828] outline-none focus:border-[#1677FF]"
                name="appliance_type"
                onChange={(event) => {
                  const nextValue = event.target.value;

                  if (nextValue === CUSTOM_LEAD_APPLIANCE_TYPE_VALUE) {
                    updateForm("applianceTypeMode", "custom");
                    return;
                  }

                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          applianceType: nextValue,
                          applianceTypeMode: "preset",
                        }
                      : current,
                  );
                }}
                value={applianceTypeSelectValue}
              >
                <option value="">Select appliance or service</option>
                {LEAD_APPLIANCE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value={CUSTOM_LEAD_APPLIANCE_TYPE_VALUE}>Other / Custom</option>
              </select>
            </label>
            {applianceTypeSelectValue === CUSTOM_LEAD_APPLIANCE_TYPE_VALUE ? (
              <label className="block text-sm font-semibold text-[#475569]">
                Custom Appliance / Service Type
                <input
                  className="mt-1 h-11 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-base font-medium text-[#101828] outline-none focus:border-[#1677FF]"
                  name="custom_appliance_type"
                  onChange={(event) => updateForm("applianceType", event.target.value)}
                  value={form?.applianceType ?? ""}
                />
              </label>
            ) : null}
            <label className="block text-sm font-semibold text-[#475569]">
              Brand
              <input
                className="mt-1 h-11 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-base font-medium text-[#101828] outline-none focus:border-[#1677FF]"
                name="brand"
                onChange={(event) => updateForm("brand", event.target.value)}
                value={form?.brand ?? ""}
              />
            </label>
            <label className="block text-sm font-semibold text-[#475569]">
              Problem Description
              <textarea
                className="mt-1 min-h-24 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-base font-medium text-[#101828]"
                name="problem_description"
                onChange={(event) => updateForm("problemDescription", event.target.value)}
                value={form?.problemDescription ?? ""}
              />
            </label>
            <label className="block text-sm font-semibold text-[#475569]">
              Preferred Appointment Window
              <input
                className="mt-1 h-11 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-base font-medium text-[#101828] outline-none focus:border-[#1677FF]"
                name="preferred_appointment_window"
                onChange={(event) => updateForm("preferredAppointmentWindow", event.target.value)}
                value={form?.preferredAppointmentWindow ?? ""}
              />
            </label>
          </div>
        </SectionCard>
      </form>
      <ActionMessage state={saveState} />
    </main>
  );
}
