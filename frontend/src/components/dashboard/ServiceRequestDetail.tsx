"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ManualEstimateEditor } from "@/components/dashboard/ManualEstimateEditor";
import { StatusBadge } from "@/components/StatusBadge";
import {
  buildAppleMapsUrl,
  buildFormattedAddress,
  buildGoogleMapsUrl,
  getAddressAutocompleteAdapter,
  type AddressSuggestion,
} from "@/lib/address-autocomplete";
import {
  processServiceRequestPhotoForAssetIntelligence,
  setServiceRequestPhotoAsAssetCover,
} from "@/lib/asset-intelligence";
import {
  formatServiceRequestMoney,
  formatServiceRequestDate,
  formatServiceRequestSource,
  mapPricingCatalogItemRow,
  mapServiceRequestEstimateRow,
  mapServiceRequestInvoiceRow,
  mapServiceRequestNoteRow,
  mapServiceRequestPhotoRow,
  mapServiceRequestRow,
  PRICING_CATALOG_SELECT_COLUMNS,
  SERVICE_REQUEST_ESTIMATE_SELECT_COLUMNS,
  SERVICE_REQUEST_INVOICE_SELECT_COLUMNS,
  SERVICE_REQUEST_NOTE_SELECT_COLUMNS,
  SERVICE_REQUEST_NOTE_TYPES,
  SERVICE_REQUEST_PHOTO_SELECT_COLUMNS,
  SERVICE_REQUEST_CRM_STATUSES,
  SERVICE_REQUEST_SELECT_COLUMNS,
  SERVICE_REQUEST_STATUS_TONES,
  type DashboardPricingCatalogItem,
  type DashboardServiceRequestEstimate,
  type DashboardServiceRequestInvoice,
  type DashboardServiceRequestPhoto,
  type DashboardServiceRequestNote,
  type DashboardServiceRequest,
  type ServiceRequestWritableNoteType,
  type ServiceRequestCrmStatus,
} from "@/lib/service-request-records";
import {
  SERVICE_REQUEST_PHOTO_BUCKET,
  createSafePhotoStorageId,
  uploadTechnicianServiceRequestPhoto,
  validateServiceRequestPhotoFiles,
} from "@/lib/service-request-photos";
import {
  applyAvailabilityRulesToTechnicianInputs,
  buildSchedulingIntakeFromServiceRequest,
  getStaticDispatcherCompanyConfig,
  mapTechnicianAvailabilityRuleRow,
  matchTechnicianProfilesForScheduling,
  normalizeSchedulingIntake,
  runSchedulingOrchestrator,
  summarizeTechnicianAvailability,
  type TechnicianAvailabilityRule,
} from "@/lib/integrations/scheduling";
import type { EstimateDraftAgentResult } from "@/lib/estimate-draft-agent";
import type { PropertyIntelligence } from "@/lib/property-intelligence";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CustomerAddressRow,
  Database,
  DatabaseServiceRequestNoteType,
  DatabaseServiceRequestPhotoType,
  PricingCatalogItemRow,
  ServiceRequestEstimateRow,
  ServiceRequestInvoiceRow,
  ServiceRequestNoteRow,
  ServiceRequestPhotoRow,
  ServiceRequestRow,
  TechnicianAvailabilityRuleRow,
  TechnicianProfileRow,
} from "@/lib/supabase/types";
import { calculateRepairProposalTotals } from "@/server/finance/repair-proposal-calculations";

type ServiceRequestDetailProps = {
  requestId: string;
  returnTo?: string;
};

type DetailState =
  | { status: "loading"; request: null; error: null }
  | { status: "ready"; request: DashboardServiceRequest; error: null }
  | { status: "empty"; request: null; error: null }
  | { status: "error"; request: null; error: string };

type StatusUpdateState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type JobDeleteState =
  | { status: "idle"; message: null }
  | { status: "confirming"; message: null }
  | { status: "deleting"; message: null }
  | { status: "error"; message: string };

type AddressSaveState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type CustomerPrimaryAddressState =
  | { status: "idle"; address: null; error: null }
  | { status: "loading"; address: null; error: null }
  | { status: "ready"; address: CustomerAddressRow | null; error: null }
  | { status: "error"; address: null; error: string };

type PropertyPreviewState =
  | { status: "idle"; property: null }
  | { status: "loading"; property: null }
  | { status: "ready"; property: PropertyIntelligence | null };

type AddressFormState = {
  streetAddress: string;
  unit: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
};

type ClientDraftState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  streetAddress: string;
  unit: string;
  city: string;
  state: string;
  zipCode: string;
};

type ClientAvatarState = {
  storagePath: string | null;
  signedUrl: string | null;
  owner: "customer" | "service_request" | null;
};

type FinanceHomeIconName =
  | "approved"
  | "wallet"
  | "invoice"
  | "estimates"
  | "payments"
  | "expenses"
  | "create"
  | "sparkle"
  | "mic"
  | "note"
  | "photo"
  | "upload"
  | "more";

function FinanceHomeIcon({
  name,
  className,
}: {
  name: FinanceHomeIconName;
  className?: string;
}) {
  const commonProps = {
    className: className ?? "h-6 w-6",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2.2,
    viewBox: "0 0 24 24",
  };

  if (name === "approved") {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
        <path d="M21 12a9 9 0 1 1-3.1-6.8" />
      </svg>
    );
  }

  if (name === "wallet") {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H20v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" />
        <path d="M4 9h16" />
        <path d="M15 13h5v4h-5a2 2 0 0 1 0-4Z" />
      </svg>
    );
  }

  if (name === "invoice") {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M6 3h8l4 4v14H6V3Z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6" />
        <path d="M9 17h5" />
      </svg>
    );
  }

  if (name === "estimates") {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M8 5h9v14H8V5Z" />
        <path d="M5 8h3v11h9v2H5V8Z" />
        <path d="M11 9h3" />
        <path d="M11 13h3" />
      </svg>
    );
  }

  if (name === "payments") {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M4 7h16v10H4V7Z" />
        <path d="M4 10h16" />
        <path d="M15 15h2" />
      </svg>
    );
  }

  if (name === "sparkle") {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" />
        <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />
        <path d="M5 15l.7 1.8L7.5 17.5l-1.8.7L5 20l-.7-1.8-1.8-.7 1.8-.7L5 15Z" />
      </svg>
    );
  }

  if (name === "mic") {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Z" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v3" />
      </svg>
    );
  }

  if (name === "note") {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M6 4h9l3 3v13H6V4Z" />
        <path d="M15 4v4h4" />
        <path d="M9 13h5" />
        <path d="M9 16h4" />
      </svg>
    );
  }

  if (name === "photo") {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z" />
        <path d="M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      </svg>
    );
  }

  if (name === "upload") {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M12 16V5" />
        <path d="m7 10 5-5 5 5" />
        <path d="M5 19h14" />
      </svg>
    );
  }

  if (name === "more") {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M5 12h.01" />
        <path d="M12 12h.01" />
        <path d="M19 12h.01" />
      </svg>
    );
  }

  if (name === "expenses") {
    return (
      <svg {...commonProps} aria-hidden="true">
        <path d="M6 4h12v16H6V4Z" />
        <path d="M9 8h6" />
        <path d="M9 12h4" />
        <path d="M14 17c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2Z" />
      </svg>
    );
  }

  return (
    <svg {...commonProps} aria-hidden="true">
      <path d="M6 3h8l4 4v14H6V3Z" />
      <path d="M14 3v5h5" />
      <path d="M9 12h4" />
      <path d="M11 10v4" />
      <path d="M15 17h4" />
      <path d="M17 15v4" />
    </svg>
  );
}

function FinanceChevron({ open }: { open?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-5 w-5 transition-transform duration-200 ${
        open ? "rotate-180" : ""
      }`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

type ClientDistanceState = {
  label: string;
  status: "idle" | "ready" | "missing_origin" | "missing_destination" | "unavailable";
  originSource: string | null;
  originAddress: string | null;
  setupHref: string | null;
};

type JobDetailsCatalogItem = {
  id: string;
  name: string;
  applianceCategory?: string | null;
  category?: string | null;
  tone?: string | null;
  jobTypeId?: string | null;
};

type JobDetailsTag = {
  id: string;
  name: string;
  category: string;
  tone: string;
};

type JobDetailsSnapshot = {
  jobTypeId: string | null;
  jobName: string;
  problemTypeId: string | null;
  description: string;
  marketingSourceId: string | null;
  marketingSource: {
    id: string;
    name: string;
    category: string | null;
    code: string | null;
  } | null;
  technicalRequestSource: string;
  tags: JobDetailsTag[];
};

type JobDetailsState =
  | { status: "idle"; details: null; error: null }
  | { status: "loading"; details: JobDetailsPayload | null; error: null }
  | { status: "ready"; details: JobDetailsPayload; error: null }
  | { status: "error"; details: JobDetailsPayload | null; error: string };

type JobDetailsPayload = {
  job: JobDetailsSnapshot;
  jobTypes: JobDetailsCatalogItem[];
  problemTypes: JobDetailsCatalogItem[];
  marketingSources: JobDetailsCatalogItem[];
  tags: JobDetailsCatalogItem[];
};

type JobDetailsSheetKind = "jobType" | "problem" | "adSource" | "tags";
type JobDetailsExpandedSelector = "jobType" | "adSource";

type JobDetailsSaveState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type AvatarActionState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: string | null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type NotesState =
  | { status: "loading"; notes: DashboardServiceRequestNote[]; error: null }
  | { status: "ready"; notes: DashboardServiceRequestNote[]; error: null }
  | { status: "error"; notes: DashboardServiceRequestNote[]; error: string };

type PhotosState =
  | { status: "loading"; photos: DashboardServiceRequestPhoto[]; error: null }
  | { status: "ready"; photos: DashboardServiceRequestPhoto[]; error: null }
  | { status: "error"; photos: DashboardServiceRequestPhoto[]; error: string };

type CatalogState =
  | { status: "loading"; items: DashboardPricingCatalogItem[]; error: null }
  | { status: "ready"; items: DashboardPricingCatalogItem[]; error: null }
  | { status: "error"; items: DashboardPricingCatalogItem[]; error: string };

type EstimatesState =
  | { status: "loading"; estimates: DashboardServiceRequestEstimate[]; error: null }
  | { status: "ready"; estimates: DashboardServiceRequestEstimate[]; error: null }
  | { status: "error"; estimates: DashboardServiceRequestEstimate[]; error: string };

type InvoicesState =
  | { status: "loading"; invoices: DashboardServiceRequestInvoice[]; error: null }
  | { status: "ready"; invoices: DashboardServiceRequestInvoice[]; error: null }
  | { status: "error"; invoices: DashboardServiceRequestInvoice[]; error: string };

type TechnicianProfilesState =
  | { status: "loading"; profiles: TechnicianProfileRow[]; error: null }
  | { status: "ready"; profiles: TechnicianProfileRow[]; error: null }
  | { status: "error"; profiles: TechnicianProfileRow[]; error: string };

type TechnicianAvailabilityRulesState =
  | { status: "loading"; rules: TechnicianAvailabilityRule[]; error: null }
  | { status: "ready"; rules: TechnicianAvailabilityRule[]; error: null }
  | { status: "error"; rules: TechnicianAvailabilityRule[]; error: string };

type TechnicianAssignmentSaveState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type TechnicianAssignmentCandidate = {
  profile: TechnicianProfileRow;
  displayName: string;
  businessName: string | null;
  initials: string;
  availabilityLabel: string;
  eligibilityLabel: string;
  isAssigned: boolean;
  isSelectable: boolean;
  sortRank: number;
};

type NoteSaveState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type PhotoSaveState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type AssetAttachmentActionState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: string | null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type EstimateSaveState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: string | null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type EstimateApprovalLinkState = {
  estimateId: string;
  approvalUrl: string;
} | null;

type EstimateRepairPlanSummary = {
  understoodSummary: string;
  includedRepairs: string[];
  includedParts: string[];
  missingInformation: string[];
};

type WorkflowActionTone =
  | "blue"
  | "green"
  | "amber"
  | "purple"
  | "slate"
  | "red";

type InvoiceActionState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: string | null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type DispatcherPreviewSnapshot = {
  id: string;
  companyId: string | null;
  serviceRequestId: string;
  normalizedZip: string | null;
  normalizedServiceType: string | null;
  normalizedAppliance: string | null;
  normalizedBrand: string | null;
  normalizedIssue: string | null;
  requestedWindow: string | null;
  requestedDate: string | null;
  orchestratorStatus: string;
  recommendedTechnicianProfileId: string | null;
  recommendationSummary: Record<string, unknown>;
  backupOptionsCount: number;
  backupOptions: unknown[];
  safeCustomerResponseDraft: string | null;
  validationWarnings: unknown[];
  validationErrors: unknown[];
  createdBy: string | null;
  createdAt: string;
};

type DispatcherSnapshotState =
  | { status: "loading"; snapshot: DispatcherPreviewSnapshot | null; error: null }
  | { status: "ready"; snapshot: DispatcherPreviewSnapshot | null; error: null }
  | {
      status: "error";
      snapshot: DispatcherPreviewSnapshot | null;
      error: string;
    };

type DispatcherSnapshotSaveState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type AppointmentBookingState =
  | { status: "idle"; message: null }
  | { status: "booking"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type ScheduleSheetSaveState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type ScheduleDraftState = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

type CreatedEstimateSummary = {
  estimateNumber: string | null;
  lineCount: number;
  total: number;
} | null;

type CalendarSyncSummary = {
  provider: "google" | null;
  status: "not_configured" | "pending" | "synced" | "failed" | "canceled";
  eventId: string | null;
  error: string | null;
  migrationReady: boolean;
} | null;

type ProfessionalEstimateLineType =
  | "labor"
  | "part"
  | "material"
  | "custom"
  | "warranty";

type ProfessionalEstimateCustomLine = {
  id: string;
  lineType: ProfessionalEstimateLineType;
  itemTitle: string;
  customerName: string;
  internalName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  publicDescription: string | null;
  taxable: boolean;
  notes: string | null;
};

const professionalEstimateLineTypeLabels: Record<
  ProfessionalEstimateLineType,
  string
> = {
  labor: "Labor",
  part: "Part",
  material: "Service",
  custom: "Other",
  warranty: "Warranty",
};

const estimateQuickLineTypes = [
  { lineType: "labor", label: "Add Labor" },
  { lineType: "part", label: "Add Part" },
  { lineType: "material", label: "Add Service" },
  { lineType: "custom", label: "Add Other" },
] as const satisfies readonly {
  lineType: Exclude<ProfessionalEstimateLineType, "warranty">;
  label: string;
}[];

function getDefaultEstimateLineTitle(
  lineType: Exclude<ProfessionalEstimateLineType, "warranty">,
): string {
  if (lineType === "labor") {
    return "Repair labor";
  }

  if (lineType === "part") {
    return "Replacement part";
  }

  if (lineType === "material") {
    return "Repair service";
  }

  return "Additional estimate item";
}

function getDefaultLineTaxable(lineType: ProfessionalEstimateLineType): boolean {
  return lineType === "part";
}

type JobWorkspaceTab =
  | "overview"
  | "timeline"
  | "notes"
  | "photos"
  | "estimate"
  | "appointment";

type FinanceEstimateMode = "home" | "manual" | "ai" | "template" | "saved";

const jobWorkspaceTabs = [
  { id: "overview", label: "Details" },
  { id: "timeline", label: "Timeline" },
  { id: "notes", label: "Notes" },
  { id: "photos", label: "Photos" },
  { id: "estimate", label: "Finance" },
  { id: "appointment", label: "Appointment" },
] as const satisfies readonly { id: JobWorkspaceTab; label: string }[];

const noteTypeLabels: Record<DatabaseServiceRequestNoteType, string> = {
  internal_note: "Internal note",
  diagnostic: "Diagnostic",
  dispatcher_note: "Dispatcher note",
  parts_note: "Parts note",
  status_change: "Status change",
  estimate: "Estimate",
};

const photoTypeLabels: Record<DatabaseServiceRequestPhotoType, string> = {
  customer_upload: "Customer photo",
  technician_upload: "Technician photo",
  diagnostic: "Diagnostic photo",
  completed_repair: "Completed repair photo",
};

const technicianPhotoTypes = [
  "technician_upload",
  "diagnostic",
  "completed_repair",
] as const satisfies readonly Exclude<
  DatabaseServiceRequestPhotoType,
  "customer_upload"
>[];

function readAssetProcessingIdentityField(
  result: unknown,
  field: "brand" | "modelNumber" | "serialNumber",
): string | null {
  if (!result || typeof result !== "object" || !("identity" in result)) {
    return null;
  }

  const identity = (result as { identity?: unknown }).identity;

  if (!identity || typeof identity !== "object" || !(field in identity)) {
    return null;
  }

  const value = (identity as Record<string, unknown>)[field];

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

const DASHBOARD_ACTION_SESSION_TIMEOUT_MS = 6000;

const TECHNICIAN_PROFILE_MATCH_SELECT_COLUMNS = [
  "id",
  "profile_id",
  "company_id",
  "affiliation_type",
  "display_name",
  "business_name",
  "years_experience",
  "service_summary_public",
  "bio_private",
  "primary_city",
  "primary_state",
  "service_zip_codes",
  "service_cities",
  "appliance_categories",
  "brands_serviced",
  "specialties",
  "languages",
  "avatar_color",
  "technician_status",
  "marketplace_enabled",
  "public_profile_ready",
  "verification_submitted_at",
  "verified_at",
  "verified_by_profile_id",
  "rejected_at",
  "suspended_at",
  "archived_by_profile_id",
  "archived_at",
  "created_at",
  "updated_at",
].join(",");

const TECHNICIAN_AVAILABILITY_RULE_SELECT_COLUMNS = [
  "id",
  "company_id",
  "technician_profile_id",
  "day_of_week",
  "start_time",
  "end_time",
  "is_available",
  "created_at",
  "updated_at",
].join(",");

function getQuickActionClasses(variant?: string) {
  const base =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] border px-3 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-45";

  if (variant === "start") {
    return `${base} border-[#86EFAC] bg-[#DCFCE7] text-[#16A34A] hover:bg-emerald-100`;
  }

  if (variant === "eta") {
    return `${base} border-[#93C5FD] bg-[#DBEAFE] text-[#2563EB] hover:bg-blue-100`;
  }

  if (variant === "pay") {
    return `${base} border-[#C084FC] bg-[#F3E8FF] text-[#7E22CE] hover:bg-purple-100`;
  }

  if (variant === "note") {
    return `${base} border-[#FDBA74] bg-[#FFEDD5] text-[#EA580C] hover:bg-orange-100`;
  }

  return `${base} border-[#CBD5E1] bg-[#F8FAFC] text-[#334155] hover:bg-slate-100`;
}

function getWorkflowActionClasses(tone: WorkflowActionTone) {
  const base =
    "rounded-[10px] border px-3 py-2.5 text-left text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-45";

  if (tone === "green") {
    return `${base} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`;
  }

  if (tone === "amber") {
    return `${base} border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100`;
  }

  if (tone === "purple") {
    return `${base} border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100`;
  }

  if (tone === "red") {
    return `${base} border-red-200 bg-red-50 text-red-800 hover:bg-red-100`;
  }

  if (tone === "slate") {
    return `${base} border-[#CBD5E1] bg-[#F8FAFC] text-[#334155] hover:bg-slate-100`;
  }

  return `${base} border-blue-200 bg-blue-50 text-[#0F6BFF] hover:bg-blue-100`;
}

function getPhoneHref(value: string | null, scheme: "tel" | "sms") {
  const cleaned = value?.replace(/[^\d+]/g, "") ?? "";

  return cleaned.length >= 7 ? `${scheme}:${cleaned}` : null;
}

function getReadErrorMessage(message: string): string {
  if (message.includes("permission denied") || message.includes("row-level security")) {
    return "This account cannot open that job. Confirm the job is assigned to this workspace or use an authorized manager account.";
  }

  return message;
}

async function getDashboardActionSession(supabase: SupabaseClient<Database>) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const response = await Promise.race([
      supabase.auth.getSession(),
      new Promise<Awaited<ReturnType<typeof supabase.auth.getSession>>>(
        (_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error("Session check timed out before the dashboard action could continue."));
          }, DASHBOARD_ACTION_SESSION_TIMEOUT_MS);
        },
      ),
    ]);

    return {
      ok: true as const,
      response,
    };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof Error
          ? error.message
          : "Session check failed before the dashboard action could continue.",
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function buildAddressFormState(
  request: DashboardServiceRequest,
): AddressFormState {
  return {
    streetAddress: request.streetAddress ?? "",
    unit: request.unit ?? "",
    city: request.city ?? "",
    state: request.state ?? "TX",
    zipCode: request.zipCode,
    country: request.country ?? "US",
    latitude: request.latitude,
    longitude: request.longitude,
    placeId: request.placeId,
  };
}

function getRequestFullAddress(request: DashboardServiceRequest) {
  return (
    request.fullAddress ||
    buildFormattedAddress({
      streetAddress: request.streetAddress,
      unit: request.unit,
      city: request.city,
      state: request.state,
      zipCode: request.zipCode,
      country: request.country,
    })
  );
}

function getPropertyLookupAddress(request: DashboardServiceRequest): string | null {
  if (request.fullAddress?.trim()) {
    return request.fullAddress.trim();
  }

  if (!request.streetAddress?.trim()) {
    return null;
  }

  const address = buildFormattedAddress({
    streetAddress: request.streetAddress,
    unit: request.unit,
    city: request.city,
    state: request.state,
    zipCode: request.zipCode,
    country: request.country,
  });

  return address.trim().length > 0 ? address : null;
}

function hasSavedServiceAddress(request: DashboardServiceRequest): boolean {
  return Boolean(
    request.streetAddress?.trim() ||
      request.fullAddress?.trim() ||
      request.city?.trim() ||
      request.zipCode?.trim(),
  );
}

function formatCustomerAddressSaveError(message: string): string {
  if (
    message.includes("dashboard company context") ||
    message.includes("COMPANY_CONTEXT_MISSING") ||
    message.includes("current_dashboard_company_id")
  ) {
    return "Customer address could not be saved because this dashboard account is missing active company access.";
  }

  if (message.includes("Customer is not accessible")) {
    return "This customer is not available from the current dashboard account.";
  }

  if (message.includes("Address is not accessible")) {
    return "This saved address is no longer available.";
  }

  if (message.includes("ZIP") || message.includes("zip")) {
    return "Enter a valid 5-digit ZIP code before saving the customer address.";
  }

  return "Customer address could not be saved. Please try again.";
}

function normalizeAddressComparisonPart(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function getComparableServiceAddress(request: DashboardServiceRequest): string {
  return [
    request.streetAddress,
    request.unit,
    request.city,
    request.state,
    request.zipCode,
    request.country,
  ]
    .map(normalizeAddressComparisonPart)
    .join("|");
}

function getComparableCustomerAddress(address: CustomerAddressRow | null): string {
  if (!address) {
    return "";
  }

  return [
    address.street_address,
    address.unit,
    address.city,
    address.state,
    address.zip_code,
    address.country,
  ]
    .map(normalizeAddressComparisonPart)
    .join("|");
}

function shouldOfferSaveServiceAddressAsCustomerPrimary(
  request: DashboardServiceRequest,
  customerPrimaryAddress: CustomerAddressRow | null,
): boolean {
  if (!request.customerId || !hasSavedServiceAddress(request)) {
    return false;
  }

  return (
    !customerPrimaryAddress ||
    getComparableServiceAddress(request) !== getComparableCustomerAddress(customerPrimaryAddress)
  );
}

function mapDispatcherPreviewSnapshot(
  raw: unknown,
): DispatcherPreviewSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const row = raw as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : null;
  const serviceRequestId =
    typeof row.service_request_id === "string" ? row.service_request_id : null;
  const orchestratorStatus =
    typeof row.orchestrator_status === "string"
      ? row.orchestrator_status
      : null;
  const createdAt =
    typeof row.created_at === "string" ? row.created_at : null;

  if (!id || !serviceRequestId || !orchestratorStatus || !createdAt) {
    return null;
  }

  return {
    id,
    companyId: typeof row.company_id === "string" ? row.company_id : null,
    serviceRequestId,
    normalizedZip:
      typeof row.normalized_zip === "string" ? row.normalized_zip : null,
    normalizedServiceType:
      typeof row.normalized_service_type === "string"
        ? row.normalized_service_type
        : null,
    normalizedAppliance:
      typeof row.normalized_appliance === "string"
        ? row.normalized_appliance
        : null,
    normalizedBrand:
      typeof row.normalized_brand === "string" ? row.normalized_brand : null,
    normalizedIssue:
      typeof row.normalized_issue === "string" ? row.normalized_issue : null,
    requestedWindow:
      typeof row.requested_window === "string" ? row.requested_window : null,
    requestedDate:
      typeof row.requested_date === "string" ? row.requested_date : null,
    orchestratorStatus,
    recommendedTechnicianProfileId:
      typeof row.recommended_technician_profile_id === "string"
        ? row.recommended_technician_profile_id
        : null,
    recommendationSummary:
      row.recommendation_summary &&
      typeof row.recommendation_summary === "object" &&
      !Array.isArray(row.recommendation_summary)
        ? (row.recommendation_summary as Record<string, unknown>)
        : {},
    backupOptionsCount:
      typeof row.backup_options_count === "number"
        ? row.backup_options_count
        : Number(row.backup_options_count) || 0,
    backupOptions: Array.isArray(row.backup_options)
      ? row.backup_options
      : [],
    safeCustomerResponseDraft:
      typeof row.safe_customer_response_draft === "string"
        ? row.safe_customer_response_draft
        : null,
    validationWarnings: Array.isArray(row.validation_warnings)
      ? row.validation_warnings
      : [],
    validationErrors: Array.isArray(row.validation_errors)
      ? row.validation_errors
      : [],
    createdBy: typeof row.created_by === "string" ? row.created_by : null,
    createdAt,
  };
}

function getSnapshotText(
  snapshot: DispatcherPreviewSnapshot,
  key: string,
): string | null {
  const value = snapshot.recommendationSummary[key];

  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getSnapshotNumber(
  snapshot: DispatcherPreviewSnapshot,
  key: string,
): number | null {
  const value = snapshot.recommendationSummary[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getLocalTimeForAppointment(value: string): string | null {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toTimeString().slice(0, 8);
}

function formatScheduledWindow(
  date: string | null,
  startTime: string | null,
  endTime: string | null,
): string | null {
  if (!date || !startTime || !endTime) {
    return null;
  }

  return `${date} · ${startTime.slice(0, 5)}-${endTime.slice(0, 5)}`;
}

function formatScheduleDateDisplay(value: string | null): string {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatScheduleTimeDisplay(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(`2026-01-01T${value.slice(0, 8)}`);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 5);
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function normalizeAssignmentZip(value: string | null | undefined): string {
  return value?.replace(/[^0-9]/g, "").slice(0, 5) ?? "";
}

function getTechnicianProfileDisplayName(profile: TechnicianProfileRow): string {
  return (
    profile.display_name?.trim() ||
    profile.business_name?.trim() ||
    "Technician"
  );
}

function getTechnicianProfileInitials(profile: TechnicianProfileRow): string {
  const name = getTechnicianProfileDisplayName(profile);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "T";
}

function getAssignmentDayOfWeek(dateKey: string): number | null {
  const date = new Date(`${dateKey}T12:00:00`);

  return Number.isNaN(date.getTime()) ? null : date.getDay();
}

function getAssignmentMinutes(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const [rawHours, rawMinutes] = value.slice(0, 5).split(":");
  const hours = Number.parseInt(rawHours ?? "", 10);
  const minutes = Number.parseInt(rawMinutes ?? "", 10);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function doesRuleCoverWindow(
  rule: TechnicianAvailabilityRule,
  startTime: string,
  endTime: string,
): boolean {
  const ruleStart = getAssignmentMinutes(rule.startTime);
  const ruleEnd = getAssignmentMinutes(rule.endTime);
  const windowStart = getAssignmentMinutes(startTime);
  const windowEnd = getAssignmentMinutes(endTime);

  if (
    ruleStart === null ||
    ruleEnd === null ||
    windowStart === null ||
    windowEnd === null
  ) {
    return false;
  }

  return ruleStart <= windowStart && ruleEnd >= windowEnd;
}

function toScheduleInputTime(value: string | null): string {
  return value?.slice(0, 5) || "";
}

function normalizeScheduleInputTime(value: string): string {
  return value.length === 5 ? `${value}:00` : value;
}

function getTodayInputDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addMinutesToInputTime(value: string, minutesToAdd: number): string {
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return "10:00";
  }

  const totalMinutes = Math.min(23 * 60 + 59, hours * 60 + minutes + minutesToAdd);
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;

  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

function getScheduleDateTimeValue(date: string, time: string): number {
  return new Date(`${date}T${time}`).getTime();
}

function formatCompactCurrency(value: number | null): string {
  if (value === null) {
    return "Not available";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatCompactNumber(value: number | null): string {
  if (value === null) {
    return "Not available";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatLivingArea(value: number | null): string {
  if (value === null || value <= 0) {
    return "Sqft unavailable";
  }

  return `${formatCompactNumber(value)} sqft`;
}

function getBackgroundImageStyle(url: string) {
  return { backgroundImage: `url(${JSON.stringify(url)})` };
}

function formatClientPhoneDisplay(value: string | null | undefined): string {
  const raw = value?.trim();

  if (!raw) {
    return "No phone";
  }

  const digits = raw.replace(/\D/g, "");
  const localDigits =
    digits.length === 11 && digits.startsWith("1")
      ? digits.slice(1)
      : digits.length > 10
        ? digits.slice(-10)
        : digits;

  if (localDigits.length === 10) {
    return `(${localDigits.slice(0, 3)}) ${localDigits.slice(3, 6)}-${localDigits.slice(6)}`;
  }

  return raw;
}

function splitClientName(value: string): { firstName: string; lastName: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function getClientInitials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "W";
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function stripUsCountry(value: string): string {
  return value
    .replace(/,\s*(US|USA|United States)$/i, "")
    .replace(/\s+(US|USA|United States)$/i, "")
    .trim();
}

const fallbackJobTypes: JobDetailsCatalogItem[] = [
  { id: "fallback-refrigerator", name: "Refrigerator Repair", applianceCategory: "Refrigerator" },
  { id: "fallback-freezer", name: "Freezer Repair", applianceCategory: "Freezer" },
  { id: "fallback-wine-cooler", name: "Wine Cooler Repair", applianceCategory: "Wine Cooler" },
  { id: "fallback-ice-maker", name: "Ice Maker Repair", applianceCategory: "Ice Maker" },
  { id: "fallback-dishwasher", name: "Dishwasher Repair", applianceCategory: "Dishwasher" },
  { id: "fallback-washer", name: "Washer Repair", applianceCategory: "Washer" },
  { id: "fallback-dryer", name: "Dryer Repair", applianceCategory: "Dryer" },
  { id: "fallback-oven-range", name: "Oven / Range Repair", applianceCategory: "Oven / Range" },
  { id: "fallback-cooktop", name: "Cooktop Repair", applianceCategory: "Cooktop" },
  { id: "fallback-microwave", name: "Microwave Repair", applianceCategory: "Microwave" },
  { id: "fallback-other", name: "Other", applianceCategory: null },
];

const fallbackProblemsByJobType: Record<string, string[]> = {
  "Refrigerator Repair": [
    "Not cooling",
    "Cooling poorly",
    "Ice buildup",
    "Leaking",
    "Making noise",
    "Temperature fluctuates",
    "Freezer not freezing",
    "Refrigerator section warm",
  ],
  "Dishwasher Repair": [
    "Not draining",
    "Not cleaning",
    "Leaking",
    "Full of water",
    "Not starting",
    "Making noise",
    "Not drying",
    "Door not closing",
  ],
  "Dryer Repair": [
    "Not heating",
    "Not spinning",
    "Taking too long to dry",
    "Making noise",
    "Burning smell",
    "Not starting",
  ],
};

const fallbackMarketingSources: JobDetailsCatalogItem[] = [
  "Google Ads",
  "Google Organic",
  "Google Business Profile",
  "Website",
  "Reserve with Google",
  "Thumbtack",
  "Yelp",
  "Nextdoor",
  "Referral",
  "Returning Customer",
  "Direct Call",
  "Property Management",
  "Other",
].map((name) => ({ id: `fallback-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name }));

function deriveJobNameFromAppliance(applianceType: string): string {
  const cleaned = applianceType.trim();

  if (!cleaned) {
    return "Appliance Service";
  }

  if (/repair$/i.test(cleaned)) {
    return cleaned;
  }

  if (/^(oven|range)$/i.test(cleaned)) {
    return "Oven / Range Repair";
  }

  return `${cleaned} Repair`;
}

function normalizeCatalogText(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function getFallbackProblemItems(jobName: string): JobDetailsCatalogItem[] {
  const problems =
    fallbackProblemsByJobType[jobName] ??
    fallbackProblemsByJobType[
      fallbackJobTypes.find(
        (jobType) =>
          normalizeCatalogText(jobType.name) === normalizeCatalogText(jobName),
      )?.name ?? ""
    ] ??
    [
      "Not cooling",
      "Leaking",
      "Making noise",
      "Not heating",
      "Not draining",
      "Not turning on",
      "Error code",
    ];

  return problems.map((name) => ({
    id: `fallback-${normalizeCatalogText(jobName)}-${normalizeCatalogText(name)}`,
    name,
  }));
}

function toTagToneClass(tone: string | null | undefined): string {
  switch (tone) {
    case "blue":
      return "border-blue-100 bg-blue-50 text-blue-700";
    case "green":
      return "border-emerald-100 bg-emerald-50 text-emerald-700";
    case "yellow":
      return "border-yellow-100 bg-yellow-50 text-yellow-800";
    case "orange":
      return "border-orange-100 bg-orange-50 text-orange-700";
    case "red":
      return "border-red-100 bg-red-50 text-red-700";
    case "purple":
      return "border-purple-100 bg-purple-50 text-purple-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function PhoneHandsetIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-emerald-600"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        clipRule="evenodd"
        d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.251.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z"
        fillRule="evenodd"
      />
    </svg>
  );
}

function ScheduleCalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6 shrink-0 text-[#2563EB]"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M7 3.5v3M17 3.5v3M4.75 9.25h14.5M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function AttachmentCameraIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-7 w-7 text-[#2563EB]"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M8.25 7.25 9.5 5.5h5l1.25 1.75h2.5A2.25 2.25 0 0 1 20.5 9.5v6.75a2.25 2.25 0 0 1-2.25 2.25H5.75a2.25 2.25 0 0 1-2.25-2.25V9.5a2.25 2.25 0 0 1 2.25-2.25h2.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M12 15.75a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function AttachmentGalleryIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-7 w-7 text-[#2563EB]"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M5.75 4.5h12.5A2.25 2.25 0 0 1 20.5 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25H5.75A2.25 2.25 0 0 1 3.5 17.25V6.75A2.25 2.25 0 0 1 5.75 4.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="m4 16 4.1-4.1a1.5 1.5 0 0 1 2.12 0l2.03 2.03 1.53-1.53a1.5 1.5 0 0 1 2.12 0L20 16.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M15.5 9.25h.01"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}

export function ServiceRequestDetail({
  requestId,
  returnTo = "/dashboard/leads",
}: ServiceRequestDetailProps) {
  const [state, setState] = useState<DetailState>({
    status: "loading",
    request: null,
    error: null,
  });
  const [selectedStatus, setSelectedStatus] =
    useState<ServiceRequestCrmStatus>("new");
  const [activeJobTab, setActiveJobTab] =
    useState<JobWorkspaceTab>("overview");
  const [isDispatcherPreviewExpanded, setIsDispatcherPreviewExpanded] =
    useState(false);
  const [statusUpdateState, setStatusUpdateState] =
    useState<StatusUpdateState>({ status: "idle", message: null });
  const [jobDeleteState, setJobDeleteState] = useState<JobDeleteState>({
    status: "idle",
    message: null,
  });
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressFormState>({
    streetAddress: "",
    unit: "",
    city: "",
    state: "TX",
    zipCode: "",
    country: "US",
    latitude: null,
    longitude: null,
    placeId: null,
  });
  const [addressSaveState, setAddressSaveState] = useState<AddressSaveState>({
    status: "idle",
    message: null,
  });
  const [customerPrimaryAddressState, setCustomerPrimaryAddressState] =
    useState<CustomerPrimaryAddressState>({
      status: "idle",
      address: null,
      error: null,
    });
  const [propertyPreviewState, setPropertyPreviewState] =
    useState<PropertyPreviewState>({
      status: "idle",
      property: null,
    });
  const [addressSearchQuery, setAddressSearchQuery] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<
    AddressSuggestion[]
  >([]);
  const [addressSuggestionState, setAddressSuggestionState] = useState<
    | { status: "idle"; message: null }
    | { status: "loading"; message: null }
    | { status: "empty"; message: string }
    | { status: "error"; message: string }
  >({ status: "idle", message: null });
  const [notesState, setNotesState] = useState<NotesState>({
    status: "loading",
    notes: [],
    error: null,
  });
  const [photosState, setPhotosState] = useState<PhotosState>({
    status: "loading",
    photos: [],
    error: null,
  });
  const [catalogState, setCatalogState] = useState<CatalogState>({
    status: "loading",
    items: [],
    error: null,
  });
  const [estimatesState, setEstimatesState] = useState<EstimatesState>({
    status: "loading",
    estimates: [],
    error: null,
  });
  const [invoicesState, setInvoicesState] = useState<InvoicesState>({
    status: "loading",
    invoices: [],
    error: null,
  });
  const [technicianProfilesState, setTechnicianProfilesState] =
    useState<TechnicianProfilesState>({
      status: "loading",
      profiles: [],
      error: null,
    });
  const [technicianAvailabilityRulesState, setTechnicianAvailabilityRulesState] =
    useState<TechnicianAvailabilityRulesState>({
      status: "loading",
      rules: [],
      error: null,
    });
  const [noteType, setNoteType] =
    useState<ServiceRequestWritableNoteType>("internal_note");
  const [noteBody, setNoteBody] = useState("");
  const [noteSaveState, setNoteSaveState] = useState<NoteSaveState>({
    status: "idle",
    message: null,
  });
  const [technicianFindingsDraft, setTechnicianFindingsDraft] = useState("");
  const [technicianFindingsSaveState, setTechnicianFindingsSaveState] =
    useState<NoteSaveState>({
      status: "idle",
      message: null,
    });
  const technicianFindingsInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [isEditingJobSummary, setIsEditingJobSummary] = useState(false);
  const [isJobSummaryEditorVisible, setIsJobSummaryEditorVisible] =
    useState(false);
  const [isClosingJobSummaryEditor, setIsClosingJobSummaryEditor] =
    useState(false);
  const [jobSummaryDraft, setJobSummaryDraft] = useState({
    title: "",
    complaint: "",
  });
  const [isStatusSheetOpen, setIsStatusSheetOpen] = useState(false);
  const [isStatusSheetVisible, setIsStatusSheetVisible] = useState(false);
  const [isClosingStatusSheet, setIsClosingStatusSheet] = useState(false);
  const [jobDetailsState, setJobDetailsState] = useState<JobDetailsState>({
    status: "idle",
    details: null,
    error: null,
  });
  const [jobDetailsSheet, setJobDetailsSheet] =
    useState<JobDetailsSheetKind | null>(null);
  const [isJobDetailsSheetVisible, setIsJobDetailsSheetVisible] =
    useState(false);
  const [isClosingJobDetailsSheet, setIsClosingJobDetailsSheet] =
    useState(false);
  const [jobDetailsSearch, setJobDetailsSearch] = useState("");
  const [newCatalogValue, setNewCatalogValue] = useState("");
  const [selectedJobTypeId, setSelectedJobTypeId] = useState<string | null>(null);
  const [selectedProblemTypeId, setSelectedProblemTypeId] = useState<string | null>(null);
  const [selectedMarketingSourceId, setSelectedMarketingSourceId] =
    useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [expandedJobDetailsSelector, setExpandedJobDetailsSelector] =
    useState<JobDetailsExpandedSelector | null>(null);
  const [jobDetailsSaveState, setJobDetailsSaveState] =
    useState<JobDetailsSaveState>({ status: "idle", message: null });
  const [isScheduleSheetOpen, setIsScheduleSheetOpen] = useState(false);
  const [isScheduleSheetVisible, setIsScheduleSheetVisible] = useState(false);
  const [isClosingScheduleSheet, setIsClosingScheduleSheet] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraftState>({
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
  });
  const [scheduleSheetSaveState, setScheduleSheetSaveState] =
    useState<ScheduleSheetSaveState>({ status: "idle", message: null });
  const [isTechnicianSheetOpen, setIsTechnicianSheetOpen] = useState(false);
  const [isTechnicianSheetVisible, setIsTechnicianSheetVisible] =
    useState(false);
  const [isClosingTechnicianSheet, setIsClosingTechnicianSheet] =
    useState(false);
  const [technicianAssignmentSearch, setTechnicianAssignmentSearch] =
    useState("");
  const [selectedAssignmentTechnicianId, setSelectedAssignmentTechnicianId] =
    useState<string | null>(null);
  const [technicianAssignmentSaveState, setTechnicianAssignmentSaveState] =
    useState<TechnicianAssignmentSaveState>({
      status: "idle",
      message: null,
    });
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [isClientEditorVisible, setIsClientEditorVisible] = useState(false);
  const [isClosingClientEditor, setIsClosingClientEditor] = useState(false);
  const [clientDraft, setClientDraft] = useState<ClientDraftState>({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    streetAddress: "",
    unit: "",
    city: "",
    state: "TX",
    zipCode: "",
  });
  const [clientAvatar, setClientAvatar] = useState<ClientAvatarState>({
    storagePath: null,
    signedUrl: null,
    owner: null,
  });
  const [clientDistance, setClientDistance] = useState<ClientDistanceState>({
    label: "Distance unavailable",
    status: "idle",
    originSource: null,
    originAddress: null,
    setupHref: null,
  });
  const [isAvatarSheetOpen, setIsAvatarSheetOpen] = useState(false);
  const [avatarActionState, setAvatarActionState] =
    useState<AvatarActionState>({ status: "idle", message: null });
  const [avatarCaptureMode, setAvatarCaptureMode] = useState(false);
  const [isMapConfirmOpen, setIsMapConfirmOpen] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoType, setPhotoType] =
    useState<Exclude<DatabaseServiceRequestPhotoType, "customer_upload">>(
      "technician_upload",
    );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoFileError, setPhotoFileError] = useState<string | null>(null);
  const [photoSaveState, setPhotoSaveState] = useState<PhotoSaveState>({
    status: "idle",
    message: null,
  });
  const [assetAttachmentActionState, setAssetAttachmentActionState] =
    useState<AssetAttachmentActionState>({
      status: "idle",
      message: null,
    });
  const attachmentCameraInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentGalleryInputRef = useRef<HTMLInputElement | null>(null);
  const [isAttachmentGalleryOpen, setIsAttachmentGalleryOpen] = useState(false);
  const [activeAttachmentIndex, setActiveAttachmentIndex] = useState<number | null>(
    null,
  );
  const [estimateDiagnosisText, setEstimateDiagnosisText] = useState("");
  const [estimateDraftAgentResult, setEstimateDraftAgentResult] =
    useState<EstimateDraftAgentResult | null>(null);
  const [estimateRepairPlanSummary, setEstimateRepairPlanSummary] =
    useState<EstimateRepairPlanSummary | null>(null);
  const [isProposalPreviewOpen, setIsProposalPreviewOpen] = useState(false);
  const [isRepairProposalBuilderOpen, setIsRepairProposalBuilderOpen] =
    useState(false);
  const [isRepairScopeSheetOpen, setIsRepairScopeSheetOpen] = useState(false);
  const [isTemplateSheetOpen, setIsTemplateSheetOpen] = useState(false);
  const [editingProposalLineId, setEditingProposalLineId] = useState<
    string | null
  >(null);
  const [isAddProposalItemSheetOpen, setIsAddProposalItemSheetOpen] =
    useState(false);
  const [proposalEstimatedCompletion, setProposalEstimatedCompletion] =
    useState("After approval and parts availability are confirmed.");
  const [isDictatingRepairScope, setIsDictatingRepairScope] = useState(false);
  const [estimateGenerationState, setEstimateGenerationState] = useState<{
    status: "idle" | "generating" | "success" | "error";
    message: string | null;
    source: "openai" | "fallback" | null;
  }>({ status: "idle", message: null, source: null });
  const [selectedCatalogItemIds, setSelectedCatalogItemIds] = useState<
    string[]
  >([]);
  const [customEstimateLines, setCustomEstimateLines] = useState<
    ProfessionalEstimateCustomLine[]
  >([]);
  const [hiddenProposalLineIds, setHiddenProposalLineIds] = useState<string[]>(
    [],
  );
  const [estimateDiscountType, setEstimateDiscountType] = useState<
    "flat" | "percent"
  >("flat");
  const [estimateDiscountValue, setEstimateDiscountValue] = useState("0");
  const [estimateTaxRate, setEstimateTaxRate] = useState("8.25");
  const [showEstimateAdjustments, setShowEstimateAdjustments] = useState(false);
  const [showEstimateWarrantyEditor, setShowEstimateWarrantyEditor] =
    useState(false);
  const [expandedEstimateLineIds, setExpandedEstimateLineIds] = useState<
    string[]
  >([]);
  const [editingEstimateId, setEditingEstimateId] = useState<string | null>(
    null,
  );
  const [, setViewingEstimateId] = useState<string | null>(
    null,
  );
  const [allowNewDraftWithActiveDraft, setAllowNewDraftWithActiveDraft] =
    useState(false);
  const [createdEstimateSummary, setCreatedEstimateSummary] =
    useState<CreatedEstimateSummary>(null);
  const [estimateApprovalLink, setEstimateApprovalLink] =
    useState<EstimateApprovalLinkState>(null);
  const [sendingEstimateId, setSendingEstimateId] = useState<string | null>(
    null,
  );
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(
    null,
  );
  const [showEstimateHistory, setShowEstimateHistory] = useState(false);
  const [showInvoiceHistory, setShowInvoiceHistory] = useState(false);
  const [isFinanceEstimateWorkflowOpen, setIsFinanceEstimateWorkflowOpen] =
    useState(false);
  const [financeEstimateMode, setFinanceEstimateMode] =
    useState<FinanceEstimateMode>("home");
  const [manualEstimateId, setManualEstimateId] = useState<string | null>(null);
  const [isFinanceEstimatesOpen, setIsFinanceEstimatesOpen] = useState(false);
  const [isFinanceInvoiceOpen, setIsFinanceInvoiceOpen] = useState(false);
  const [isFinancePaymentsOpen, setIsFinancePaymentsOpen] = useState(false);
  const [isFinanceExpensesOpen, setIsFinanceExpensesOpen] = useState(false);
  const [invoiceActionId, setInvoiceActionId] = useState<string | null>(null);
  const [invoiceActionState, setInvoiceActionState] =
    useState<InvoiceActionState>({ status: "idle", message: null });
  const [estimateSaveState, setEstimateSaveState] = useState<EstimateSaveState>({
    status: "idle",
    message: null,
  });
  const [dispatcherSnapshotState, setDispatcherSnapshotState] =
    useState<DispatcherSnapshotState>({
      status: "loading",
      snapshot: null,
      error: null,
    });
  const [dispatcherSnapshotSaveState, setDispatcherSnapshotSaveState] =
    useState<DispatcherSnapshotSaveState>({
      status: "idle",
      message: null,
    });
  const [appointmentBookingState, setAppointmentBookingState] =
    useState<AppointmentBookingState>({
      status: "idle",
      message: null,
    });
  const [calendarSyncSummary, setCalendarSyncSummary] =
    useState<CalendarSyncSummary>(null);
  const readyRequestId = state.status === "ready" ? state.request.id : null;
  const propertyLookupAddress =
    state.status === "ready" ? getPropertyLookupAddress(state.request) : null;

  function getFinanceWorkspaceUrl() {
    return `/dashboard/leads/${requestId}?tab=finance`;
  }

  function getEstimateWorkspaceUrl(estimateId: string) {
    return `${getFinanceWorkspaceUrl()}&estimateId=${encodeURIComponent(
      estimateId,
    )}`;
  }

  function syncEstimateWorkspaceHistory(
    estimateId: string,
    mode: "push" | "replace" | "none",
  ) {
    if (mode === "none" || typeof window === "undefined") {
      return;
    }

    const nextUrl = getEstimateWorkspaceUrl(estimateId);
    const statePayload = { wraEstimateWorkspace: true, estimateId };

    if (mode === "replace") {
      window.history.replaceState(statePayload, "", nextUrl);
      return;
    }

    window.history.pushState(statePayload, "", nextUrl);
  }

  function closeEstimateWorkspaceToFinance() {
    if (typeof window !== "undefined") {
      window.history.replaceState(
        { wraFinanceWorkspace: true },
        "",
        getFinanceWorkspaceUrl(),
      );
    }

    setActiveJobTab("estimate");
    setIsFinanceEstimatesOpen(true);
    setManualEstimateId(null);
    setFinanceEstimateMode("home");
  }

  useEffect(() => {
    if (estimatesState.status !== "ready" || typeof window === "undefined") {
      return;
    }

    function applyEstimateRouteState() {
      const params = new URLSearchParams(window.location.search);
      const estimateId = params.get("estimateId");
      const tab = params.get("tab");

      if (estimateId) {
        const matchingEstimate = estimatesState.estimates.find(
          (estimate) => estimate.id === estimateId,
        );

        if (!matchingEstimate) {
          return;
        }

        setActiveJobTab("estimate");
        setIsFinanceEstimatesOpen(true);
        setManualEstimateId(matchingEstimate.id);
        setFinanceEstimateMode("saved");
        setIsFinanceEstimateWorkflowOpen(false);
        setIsRepairProposalBuilderOpen(false);
        setViewingInvoiceId(null);
        return;
      }

      if (tab === "finance") {
        setActiveJobTab("estimate");
        setIsFinanceEstimatesOpen(true);
        setManualEstimateId(null);
        setFinanceEstimateMode("home");
        return;
      }

      if (
        tab === "overview" ||
        tab === "timeline" ||
        tab === "notes" ||
        tab === "photos" ||
        tab === "appointment"
      ) {
        setActiveJobTab(tab);
        setManualEstimateId(null);
        setFinanceEstimateMode("home");
        return;
      }

      setManualEstimateId(null);
      setFinanceEstimateMode("home");
    }

    applyEstimateRouteState();
    window.addEventListener("popstate", applyEstimateRouteState);

    return () => {
      window.removeEventListener("popstate", applyEstimateRouteState);
    };
  }, [estimatesState.estimates, estimatesState.status]);

  const loadCustomerPrimaryAddress = useCallback(async (customerId: string | null) => {
    if (!customerId) {
      setCustomerPrimaryAddressState({ status: "ready", address: null, error: null });
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setCustomerPrimaryAddressState({
        status: "error",
        address: null,
        error: "Customer primary address is not available in this workspace.",
      });
      return;
    }

    setCustomerPrimaryAddressState({ status: "loading", address: null, error: null });

    const { data, error } = await supabase
      .from("customer_addresses")
      .select("*")
      .eq("customer_id", customerId)
      .eq("is_primary", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setCustomerPrimaryAddressState({
        status: "error",
        address: null,
        error: error.message,
      });
      return;
    }

    setCustomerPrimaryAddressState({
      status: "ready",
      address: (data as CustomerAddressRow | null) ?? null,
      error: null,
    });
  }, []);

  const refreshServiceRequest = useCallback(
    async (options?: { syncEditableFields?: boolean }) => {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        setState({
          status: "error",
          request: null,
          error: "Job reads are not configured for this workspace.",
        });
        return;
      }

      const { data, error } = await supabase
        .from("service_requests")
        .select(SERVICE_REQUEST_SELECT_COLUMNS)
        .eq("id", requestId)
        .maybeSingle();

      if (error) {
        setState({
          status: "error",
          request: null,
          error: getReadErrorMessage(error.message),
        });
        return;
      }

      if (!data) {
        setState({ status: "empty", request: null, error: null });
        return;
      }

      const request = mapServiceRequestRow(data as unknown as ServiceRequestRow);

      setState({
        status: "ready",
        request,
        error: null,
      });
      setSelectedStatus(
        SERVICE_REQUEST_CRM_STATUSES.includes(
          request.status as ServiceRequestCrmStatus,
        )
          ? (request.status as ServiceRequestCrmStatus)
          : "new",
      );

      if (options?.syncEditableFields) {
        setAddressForm(buildAddressFormState(request));
        setAddressSaveState({ status: "idle", message: null });
        setIsEditingAddress(false);
      }

      void loadCustomerPrimaryAddress(request.customerId);
    },
    [loadCustomerPrimaryAddress, requestId],
  );

  useEffect(() => {
    void Promise.resolve().then(() =>
      refreshServiceRequest({ syncEditableFields: true }),
    );
  }, [refreshServiceRequest]);

  useEffect(() => {
    void loadNotes();
    void loadPhotos();
    void loadPricingCatalog();
    void loadEstimates();
    void loadInvoices();
    void loadTechnicianProfilesForMatching();
    void loadTechnicianAvailabilityRules();
    void loadLatestDispatcherSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  useEffect(() => {
    function refreshExternalEstimateChanges() {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return;
      }

      void refreshServiceRequest();
      void loadEstimates();
      void loadNotes();
    }

    window.addEventListener("focus", refreshExternalEstimateChanges);
    document.addEventListener(
      "visibilitychange",
      refreshExternalEstimateChanges,
    );

    return () => {
      window.removeEventListener("focus", refreshExternalEstimateChanges);
      document.removeEventListener(
        "visibilitychange",
        refreshExternalEstimateChanges,
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshServiceRequest, requestId]);

  useEffect(() => {
    let isActive = true;

    async function searchAddresses() {
      const adapter = getAddressAutocompleteAdapter();
      const query = addressSearchQuery.trim();

      if (
        (!isEditingAddress && !isEditingClient) ||
        !adapter.isConfigured ||
        query.length < 3
      ) {
        setAddressSuggestions([]);
        setAddressSuggestionState({ status: "idle", message: null });
        return;
      }

      setAddressSuggestionState({ status: "loading", message: null });

      try {
        const suggestions = await adapter.search(query);

        if (!isActive) {
          return;
        }

        setAddressSuggestions(suggestions);
        setAddressSuggestionState(
          suggestions.length > 0
            ? { status: "idle", message: null }
            : {
                status: "empty",
                message: "No address suggestions found.",
              },
        );
      } catch (error) {
        if (!isActive) {
          return;
        }

        setAddressSuggestions([]);
        setAddressSuggestionState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Address autocomplete is unavailable. Use manual entry.",
        });
      }
    }

    const timeoutId = setTimeout(() => {
      void searchAddresses();
    }, 250);

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [addressSearchQuery, isEditingAddress, isEditingClient]);

  useEffect(() => {
    let isActive = true;

    async function loadPropertyPreview() {
      if (!propertyLookupAddress) {
        setPropertyPreviewState({ status: "ready", property: null });
        return;
      }

      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        setPropertyPreviewState({ status: "ready", property: null });
        return;
      }

      setPropertyPreviewState({ status: "loading", property: null });

      try {
        const sessionResult = await getDashboardActionSession(supabase);

        if (!sessionResult.ok) {
          throw new Error(sessionResult.message);
        }

        const accessToken = sessionResult.response.data.session?.access_token;

        if (!accessToken) {
          throw new Error("A dashboard session is required.");
        }

        const response = await fetch(
          `/api/property-intelligence?address=${encodeURIComponent(
            propertyLookupAddress,
          )}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        const payload = (await response.json().catch(() => null)) as {
          property?: PropertyIntelligence | null;
        } | null;

        if (!isActive) {
          return;
        }

        setPropertyPreviewState({
          status: "ready",
          property: response.ok ? payload?.property ?? null : null,
        });
      } catch {
        if (!isActive) {
          return;
        }

        setPropertyPreviewState({ status: "ready", property: null });
      }
    }

    void loadPropertyPreview();

    return () => {
      isActive = false;
    };
  }, [propertyLookupAddress]);

  useEffect(() => {
    let isActive = true;

    async function loadJobDetails() {
      if (!readyRequestId) {
        return;
      }

      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        return;
      }

      setJobDetailsState((current) => ({
        status: "loading",
        details: current.details,
        error: null,
      }));

      try {
        const sessionResult = await getDashboardActionSession(supabase);
        const accessToken = sessionResult.ok
          ? sessionResult.response.data.session?.access_token
          : null;

        if (!accessToken) {
          throw new Error("A dashboard session is required.");
        }

        const response = await fetch(
          `/api/service-requests/${readyRequestId}/details`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          details?: JobDetailsPayload;
          message?: string;
        } | null;

        if (!isActive) {
          return;
        }

        if (!response.ok || !payload?.ok || !payload.details) {
          throw new Error(payload?.message ?? "Job details are unavailable.");
        }

        setJobDetailsState({
          status: "ready",
          details: payload.details,
          error: null,
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        setJobDetailsState((current) => ({
          status: "error",
          details: current.details,
          error:
            error instanceof Error
              ? error.message
              : "Job details are unavailable.",
        }));
      }
    }

    void loadJobDetails();

    return () => {
      isActive = false;
    };
  }, [readyRequestId, propertyLookupAddress]);

  useEffect(() => {
    let isActive = true;

    async function loadClientCardContext() {
      if (!readyRequestId) {
        return;
      }

      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        return;
      }

      try {
        const sessionResult = await getDashboardActionSession(supabase);

        if (!sessionResult.ok) {
          throw new Error(sessionResult.message);
        }

        const accessToken = sessionResult.response.data.session?.access_token;

        if (!accessToken) {
          throw new Error("A dashboard session is required.");
        }

        const response = await fetch(
          `/api/service-requests/${readyRequestId}/client-card`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        const payload = (await response.json().catch(() => null)) as {
          ok?: boolean;
          clientAvatar?: ClientAvatarState;
          diagnostics?: {
            originSource?: string | null;
            originAddressAvailable?: boolean;
            destinationAddressAvailable?: boolean;
          };
          distance?: {
            label?: string;
            status?: ClientDistanceState["status"];
            originSource?: string | null;
            originAddress?: string | null;
            setupHref?: string | null;
            originAddressAvailable?: boolean;
            destinationAddressAvailable?: boolean;
          };
        } | null;

        if (!isActive || !response.ok || !payload?.ok) {
          return;
        }

        setClientAvatar({
          storagePath: payload.clientAvatar?.storagePath ?? null,
          signedUrl: payload.clientAvatar?.signedUrl ?? null,
          owner: payload.clientAvatar?.owner ?? null,
        });
        setClientDistance({
          label: payload.distance?.label ?? "Distance unavailable",
          status: payload.distance?.status ?? "unavailable",
          originSource: payload.distance?.originSource ?? null,
          originAddress: payload.distance?.originAddress ?? null,
          setupHref: payload.distance?.setupHref ?? null,
        });
      } catch {
        if (!isActive) {
          return;
        }

        setClientDistance((current) => ({
          ...current,
          label: "Distance unavailable",
          status: "unavailable",
        }));
      }
    }

    void loadClientCardContext();

    return () => {
      isActive = false;
    };
  }, [readyRequestId]);

  async function loadNotes() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setNotesState({
        status: "error",
        notes: [],
        error: "Job notes are not available for this workspace.",
      });
      return;
    }

    const { data, error } = await supabase
      .from("service_request_notes")
      .select(SERVICE_REQUEST_NOTE_SELECT_COLUMNS)
      .eq("service_request_id", requestId)
      .order("created_at", { ascending: false });

    if (error) {
      const message =
        error.message.includes("service_request_notes") &&
        (error.message.includes("schema cache") ||
          error.message.includes("Could not find"))
          ? "Internal notes are not ready for this workspace yet."
          : error.message;

      setNotesState({ status: "error", notes: [], error: message });
      return;
    }

    setNotesState({
      status: "ready",
      notes: (data as unknown as ServiceRequestNoteRow[]).map(
        mapServiceRequestNoteRow,
      ),
      error: null,
    });
  }

  async function loadPhotos() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setPhotosState({
        status: "error",
        photos: [],
        error: "Job photos are not available for this workspace.",
      });
      return;
    }

    const { data, error } = await supabase
      .from("service_request_photos")
      .select(SERVICE_REQUEST_PHOTO_SELECT_COLUMNS)
      .eq("service_request_id", requestId)
      .order("created_at", { ascending: false });

    if (error) {
      const message =
        error.message.includes("service_request_photos") &&
        (error.message.includes("schema cache") ||
          error.message.includes("Could not find"))
          ? "Photo uploads are not ready for this workspace yet."
          : error.message;

      setPhotosState({ status: "error", photos: [], error: message });
      return;
    }

    const photos = await Promise.all(
      (data as unknown as ServiceRequestPhotoRow[]).map(async (row) => {
        const photo = mapServiceRequestPhotoRow(row);
        const { data: signedUrlData } = await supabase.storage
          .from(SERVICE_REQUEST_PHOTO_BUCKET)
          .createSignedUrl(photo.storagePath, 60 * 30);

        return {
          ...photo,
          signedUrl: signedUrlData?.signedUrl ?? null,
        };
      }),
    );

    setPhotosState({
      status: "ready",
      photos,
      error: null,
    });
  }

  async function loadPricingCatalog() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setCatalogState({
        status: "error",
        items: [],
        error: "The price book is not available for this workspace.",
      });
      return;
    }

    const { data, error } = await supabase
      .from("pricing_catalog_items")
      .select(PRICING_CATALOG_SELECT_COLUMNS)
      .eq("active", true)
      .order("appliance_type", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("category", { ascending: true })
      .order("title", { ascending: true });

    if (error) {
      const message =
        error.message.includes("pricing_catalog_items") &&
        (error.message.includes("schema cache") ||
          error.message.includes("Could not find"))
          ? "The price book is not ready for this workspace yet."
          : error.message;

      setCatalogState({ status: "error", items: [], error: message });
      return;
    }

    setCatalogState({
      status: "ready",
      items: (data as unknown as PricingCatalogItemRow[]).map(
        mapPricingCatalogItemRow,
      ),
      error: null,
    });
  }

  async function loadEstimates() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setEstimatesState({
        status: "error",
        estimates: [],
        error: "Estimates are not available for this workspace.",
      });
      return;
    }

    const { data, error } = await supabase
      .from("service_request_estimates")
      .select(SERVICE_REQUEST_ESTIMATE_SELECT_COLUMNS)
      .eq("service_request_id", requestId)
      .order("created_at", { ascending: false });

    if (error) {
      const message =
        error.message.includes("service_request_estimates") &&
        (error.message.includes("schema cache") ||
          error.message.includes("Could not find"))
          ? "Estimates are not ready for this workspace yet."
          : error.message;

      setEstimatesState({ status: "error", estimates: [], error: message });
      return;
    }

    setEstimatesState({
      status: "ready",
      estimates: (data as unknown as ServiceRequestEstimateRow[]).map(
        mapServiceRequestEstimateRow,
      ),
      error: null,
    });
  }

  async function loadInvoices() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setInvoicesState({
        status: "error",
        invoices: [],
        error: "Invoices are not available for this workspace.",
      });
      return;
    }

    const { data, error } = await supabase
      .from("service_request_invoices")
      .select(SERVICE_REQUEST_INVOICE_SELECT_COLUMNS)
      .eq("service_request_id", requestId)
      .order("created_at", { ascending: false });

    if (error) {
      const message =
        error.message.includes("service_request_invoices") &&
        (error.message.includes("schema cache") ||
          error.message.includes("Could not find"))
          ? "Invoices are not ready for this workspace yet."
          : error.message;

      setInvoicesState({ status: "error", invoices: [], error: message });
      return;
    }

    setInvoicesState({
      status: "ready",
      invoices: (data as unknown as ServiceRequestInvoiceRow[]).map(
        mapServiceRequestInvoiceRow,
      ),
      error: null,
    });
  }

  async function deleteCurrentJob() {
    if (jobDeleteState.status === "deleting") {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setJobDeleteState({
        status: "error",
        message: "Job deletion is not available for this workspace.",
      });
      return;
    }

    const sessionResult = await getDashboardActionSession(supabase);

    if (!sessionResult.ok) {
      setJobDeleteState({
        status: "error",
        message: sessionResult.message,
      });
      return;
    }

    const { data: sessionData, error: sessionError } = sessionResult.response;
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setJobDeleteState({
        status: "error",
        message: "Log in again before deleting this job.",
      });
      return;
    }

    setJobDeleteState({ status: "deleting", message: null });

    let response: Response;
    let payload: { ok?: boolean; message?: string } | null;

    try {
      response = await fetch(`/api/service-requests/${requestId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      payload = (await response.json().catch(() => null)) as typeof payload;
    } catch {
      setJobDeleteState({
        status: "error",
        message: "Job could not be deleted. Please try again.",
      });
      return;
    }

    if (!response.ok || !payload?.ok) {
      setJobDeleteState({
        status: "error",
        message:
          payload?.message ??
          "This job can't be deleted because it already contains financial or customer history.",
      });
      return;
    }

    window.location.assign(returnTo);
  }

  async function loadTechnicianProfilesForMatching() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setTechnicianProfilesState({
        status: "error",
        profiles: [],
        error: "Technician matching is not available for this workspace.",
      });
      return;
    }

    const { data, error } = await supabase
      .from("technician_profiles")
      .select(TECHNICIAN_PROFILE_MATCH_SELECT_COLUMNS)
      .eq("technician_status", "verified")
      .eq("marketplace_enabled", true)
      .is("archived_at", null)
      .is("rejected_at", null)
      .is("suspended_at", null)
      .order("years_experience", { ascending: false });

    if (error) {
      const message =
        error.message.includes("technician_profiles") &&
        (error.message.includes("schema cache") ||
          error.message.includes("Could not find"))
          ? "Technician profiles are not ready for matching yet."
          : error.message;

      setTechnicianProfilesState({
        status: "error",
        profiles: [],
        error: message,
      });
      return;
    }

    setTechnicianProfilesState({
      status: "ready",
      profiles: data as unknown as TechnicianProfileRow[],
      error: null,
    });
  }

  async function loadTechnicianAvailabilityRules() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setTechnicianAvailabilityRulesState({
        status: "error",
        rules: [],
        error: "Technician availability is not available for this workspace.",
      });
      return;
    }

    const { data, error } = await supabase
      .from("technician_availability_rules")
      .select(TECHNICIAN_AVAILABILITY_RULE_SELECT_COLUMNS)
      .eq("is_available", true)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      const message =
        error.message.includes("technician_availability_rules") &&
        (error.message.includes("schema cache") ||
          error.message.includes("Could not find"))
          ? "Technician availability is not ready for this workspace yet."
          : error.message;

      setTechnicianAvailabilityRulesState({
        status: "error",
        rules: [],
        error: message,
      });
      return;
    }

    setTechnicianAvailabilityRulesState({
      status: "ready",
      rules: (data as unknown as TechnicianAvailabilityRuleRow[]).map(
        mapTechnicianAvailabilityRuleRow,
      ),
      error: null,
    });
  }

  async function loadLatestDispatcherSnapshot() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setDispatcherSnapshotState({
        status: "error",
        snapshot: null,
        error: "Saved scheduling previews are not available for this workspace.",
      });
      return;
    }

    const sessionResult = await getDashboardActionSession(supabase);

    if (!sessionResult.ok) {
      setDispatcherSnapshotState({
        status: "error",
        snapshot: null,
        error: sessionResult.message,
      });
      return;
    }

    const { data: sessionData, error: sessionError } = sessionResult.response;
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setDispatcherSnapshotState({
        status: "error",
        snapshot: null,
        error: "Log in again before loading dispatcher snapshots.",
      });
      return;
    }

    const response = await fetch(
      `/api/service-requests/${requestId}/dispatcher-preview`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      snapshot?: unknown;
    } | null;

    if (!response.ok || !payload?.ok) {
      setDispatcherSnapshotState({
        status: "error",
        snapshot: null,
        error:
          payload?.message ??
          "We could not load the saved dispatcher snapshot yet.",
      });
      return;
    }

    setDispatcherSnapshotState({
      status: "ready",
      snapshot: mapDispatcherPreviewSnapshot(payload.snapshot ?? null),
      error: null,
    });
  }

  async function updateStatus(nextStatus = selectedStatus) {
    if (state.status !== "ready") {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setStatusUpdateState({
        status: "error",
        message: "Status updates are not configured for this workspace.",
      });
      return;
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setStatusUpdateState({
        status: "error",
        message: "Log in again before updating this service request.",
      });
      return;
    }

    setStatusUpdateState({ status: "saving", message: null });

    const response = await fetch(`/api/service-requests/${state.request.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ status: nextStatus }),
    });

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      request?: {
        status?: string;
        updated_at?: string;
      };
    } | null;

    if (!response.ok || !payload?.ok) {
      setStatusUpdateState({
        status: "error",
        message:
          payload?.message ??
          "We could not update the service request status yet.",
      });
      return;
    }

    setState((current) => {
      if (current.status !== "ready") {
        return current;
      }

      return {
        status: "ready",
        request: {
          ...current.request,
          status: nextStatus,
          updatedAt: payload.request?.updated_at ?? current.request.updatedAt,
        },
        error: null,
      };
    });
    setStatusUpdateState({
      status: "success",
      message: "Service request status updated.",
    });
    setSelectedStatus(nextStatus);
    void loadNotes();
  }

  function updateAddressField<Key extends keyof AddressFormState>(
    key: Key,
    value: AddressFormState[Key],
  ) {
    setAddressForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "streetAddress" ||
      key === "unit" ||
      key === "city" ||
      key === "state" ||
      key === "zipCode" ||
      key === "country"
        ? { latitude: null, longitude: null, placeId: null }
        : {}),
    }));
    setAddressSaveState({ status: "idle", message: null });
  }

  async function selectAddressSuggestion(suggestion: AddressSuggestion) {
    const adapter = getAddressAutocompleteAdapter();

    setAddressSuggestionState({ status: "loading", message: null });

    try {
      const resolvedSuggestion = adapter.resolve
        ? await adapter.resolve(suggestion)
        : suggestion;

      setAddressForm((current) => ({
        ...current,
        streetAddress: resolvedSuggestion.streetAddress,
        city: resolvedSuggestion.city,
        state: resolvedSuggestion.state,
        zipCode: resolvedSuggestion.zipCode,
        country: resolvedSuggestion.country || "US",
        latitude: resolvedSuggestion.latitude ?? null,
        longitude: resolvedSuggestion.longitude ?? null,
        placeId: resolvedSuggestion.placeId ?? null,
      }));
      setAddressSearchQuery(resolvedSuggestion.label);
      setAddressSuggestions([]);
      setAddressSuggestionState({ status: "idle", message: null });
      setAddressSaveState({ status: "idle", message: null });
    } catch (error) {
      setAddressSuggestionState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not load that address. Use manual entry.",
      });
    }
  }

  function resetAddressForm() {
    if (state.status !== "ready") {
      return;
    }

    setAddressForm(buildAddressFormState(state.request));
    setAddressSearchQuery("");
    setAddressSuggestions([]);
    setAddressSuggestionState({ status: "idle", message: null });
    setAddressSaveState({ status: "idle", message: null });
    setIsEditingAddress(false);
  }

  async function saveAddressAsCustomerPrimary() {
    if (state.status !== "ready") {
      return;
    }

    if (!state.request.customerId) {
      setAddressSaveState({
        status: "error",
        message: "This job is not linked to a customer record yet.",
      });
      return;
    }

    if (!hasSavedServiceAddress(state.request)) {
      setAddressSaveState({
        status: "error",
        message: "Save a service address on this job before copying it to the customer profile.",
      });
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setAddressSaveState({
        status: "error",
        message: "Customer address updates are not available for this workspace.",
      });
      return;
    }

    setAddressSaveState({ status: "saving", message: null });

    const { error } = await supabase.rpc("upsert_customer_address_rpc", {
      p_customer_id: state.request.customerId,
      p_address_id: null,
      p_payload: {
        label: "Customer Primary Address",
        street_address: state.request.streetAddress?.trim() || null,
        unit: state.request.unit?.trim() || null,
        city: state.request.city?.trim() || null,
        state: state.request.state.trim().toUpperCase().slice(0, 2) || "TX",
        zip_code: state.request.zipCode.replace(/[^0-9]/g, "").slice(0, 5) || null,
        country: state.request.country.trim().toUpperCase().slice(0, 2) || "US",
        latitude: state.request.latitude,
        longitude: state.request.longitude,
        place_id: state.request.placeId,
        is_primary: true,
      },
    });

    if (error) {
      setAddressSaveState({
        status: "error",
        message: formatCustomerAddressSaveError(error.message),
      });
      return;
    }

    await loadCustomerPrimaryAddress(state.request.customerId);

    setAddressSaveState({
      status: "success",
      message: "Customer primary address saved. Historical job addresses were not changed.",
    });
  }

  async function saveAddress(options?: { closeAddressEditor?: boolean }) {
    if (state.status !== "ready") {
      return false;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setAddressSaveState({
        status: "error",
        message: "Address updates are not available for this workspace.",
      });
      return false;
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setAddressSaveState({
        status: "error",
        message: "Log in again before updating the service address.",
      });
      return false;
    }

    setAddressSaveState({ status: "saving", message: null });

    const response = await fetch(
      `/api/service-requests/${state.request.id}/address`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(addressForm),
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      address?: {
        full_address?: string | null;
        street_address?: string | null;
        unit?: string | null;
        city?: string | null;
        state?: string;
        zip_code?: string;
        country?: string;
        latitude?: number | null;
        longitude?: number | null;
        place_id?: string | null;
        updated_at?: string;
      };
    } | null;

    if (!response.ok || !payload?.ok || !payload.address) {
      setAddressSaveState({
        status: "error",
        message:
          payload?.message ??
          "We could not update the service address yet.",
      });
      return false;
    }

    setState((current) => {
      if (current.status !== "ready") {
        return current;
      }

      return {
        status: "ready",
        request: {
          ...current.request,
          fullAddress:
            payload.address?.full_address ?? current.request.fullAddress,
          streetAddress:
            payload.address?.street_address ?? current.request.streetAddress,
          unit: payload.address?.unit ?? null,
          city: payload.address?.city ?? null,
          state: payload.address?.state ?? current.request.state,
          zipCode: payload.address?.zip_code ?? current.request.zipCode,
          country: payload.address?.country ?? current.request.country,
          latitude: payload.address?.latitude ?? null,
          longitude: payload.address?.longitude ?? null,
          placeId: payload.address?.place_id ?? null,
          updatedAt: payload.address?.updated_at ?? current.request.updatedAt,
        },
        error: null,
      };
    });
    setAddressSaveState({
      status: "success",
      message: "Service address updated.",
    });
    if (options?.closeAddressEditor !== false) {
      setIsEditingAddress(false);
    }
    return true;
  }

  function handleTechnicianPhotoChange(files: File[]) {
    const file = files[0] ?? null;

    if (!file) {
      setPhotoFile(null);
      setPhotoFileError(null);
      return;
    }

    const validation = validateServiceRequestPhotoFiles([file]);

    if (!validation.ok) {
      setPhotoFile(null);
      setPhotoFileError(validation.message);
      return;
    }

    setPhotoFile(file);
    setPhotoFileError(null);
  }

  async function addTechnicianPhoto() {
    if (state.status !== "ready" || !photoFile) {
      return;
    }

    setPhotoSaveState({ status: "saving", message: null });

    try {
      const result = await uploadTechnicianServiceRequestPhoto({
        requestId: state.request.id,
        file: photoFile,
        photoType,
      });

      if (!result.ok) {
        setPhotoFile(null);
        setPhotoFileError(null);
        setPhotoSaveState({
          status: "error",
          message: result.message,
        });
        return;
      }
    } catch (error) {
      setPhotoFile(null);
      setPhotoFileError(null);
      setPhotoSaveState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Photo upload failed. Please try again.",
      });
      return;
    }

    setPhotoFile(null);
    setPhotoFileError(null);
    setPhotoSaveState({
      status: "success",
      message: "Photo attached to this service request.",
    });
    void loadPhotos();
  }

  function openAttachmentGalleryPicker() {
    if (photoSaveState.status === "saving") {
      return;
    }

    attachmentGalleryInputRef.current?.click();
  }

  function openAttachmentCameraPicker() {
    if (photoSaveState.status === "saving") {
      return;
    }

    attachmentCameraInputRef.current?.click();
  }

  async function uploadAttachmentFile(file: File | null) {
    if (!file || state.status !== "ready") {
      return;
    }

    const validation = validateServiceRequestPhotoFiles([file]);

    if (!validation.ok) {
      setPhotoFile(null);
      setPhotoFileError(validation.message);
      setPhotoSaveState({
        status: "error",
        message: validation.message,
      });
      return;
    }

    setPhotoFile(file);
    setPhotoFileError(null);
    setPhotoSaveState({ status: "saving", message: null });

    try {
      const result = await uploadTechnicianServiceRequestPhoto({
        requestId: state.request.id,
        file,
        photoType,
      });

      if (!result.ok) {
        setPhotoFile(null);
        setPhotoFileError(null);
        setPhotoSaveState({
          status: "error",
          message: result.message,
        });
        return;
      }

      if (result.photoId) {
        void processServiceRequestPhotoForAssetIntelligence({
          photoId: result.photoId,
          requestId: state.request.id,
        }).then(() => {
          void loadPhotos();
          void refreshServiceRequest();
        });
      }
    } catch (error) {
      setPhotoFile(null);
      setPhotoFileError(null);
      setPhotoSaveState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Photo upload failed. Please try again.",
      });
      return;
    }

    setPhotoFile(null);
    setPhotoFileError(null);
    setPhotoSaveState({
      status: "success",
      message: "Photo attached to this service request.",
    });
    void loadPhotos();
  }

  function openAttachmentGallery(selectedIndex: number | null = null) {
    setIsAttachmentGalleryOpen(true);
    setActiveAttachmentIndex(
      selectedIndex !== null && photosState.photos[selectedIndex]
        ? selectedIndex
        : null,
    );
  }

  function closeAttachmentGallery() {
    setIsAttachmentGalleryOpen(false);
    setActiveAttachmentIndex(null);
  }

  function showPreviousAttachment() {
    if (activeAttachmentIndex === null || photosState.photos.length === 0) {
      return;
    }

    setActiveAttachmentIndex(
      (activeAttachmentIndex - 1 + photosState.photos.length) %
        photosState.photos.length,
    );
  }

  function showNextAttachment() {
    if (activeAttachmentIndex === null || photosState.photos.length === 0) {
      return;
    }

    setActiveAttachmentIndex(
      (activeAttachmentIndex + 1) % photosState.photos.length,
    );
  }

  async function handleSetActiveAttachmentAsAssetCover() {
    if (!activeAttachment || assetAttachmentActionState.status === "saving") {
      return;
    }

    setAssetAttachmentActionState({
      status: "saving",
      message: "Setting asset cover...",
    });

    const result = await setServiceRequestPhotoAsAssetCover({
      photoId: activeAttachment.id,
    });

    if (!result.ok) {
      setAssetAttachmentActionState({
        status: "error",
        message: result.message,
      });
      return;
    }

    setAssetAttachmentActionState({
      status: "success",
      message: "Asset cover updated.",
    });
    void loadPhotos();
  }

  async function handleRetryActiveAttachmentAssetIdentification() {
    if (!activeAttachment || state.status !== "ready") {
      return;
    }

    setAssetAttachmentActionState({
      status: "saving",
      message: "Retrying identification...",
    });

    const result = await processServiceRequestPhotoForAssetIntelligence({
      photoId: activeAttachment.id,
      requestId: state.request.id,
      retry: true,
    });

    if (!result.ok) {
      setAssetAttachmentActionState({
        status: "error",
        message: result.message,
      });
      void loadPhotos();
      return;
    }

    setAssetAttachmentActionState({
      status: "success",
      message: "Asset identification updated.",
    });
    void loadPhotos();
    void refreshServiceRequest();
  }

  function toggleCatalogItem(itemId: string) {
    setCreatedEstimateSummary(null);
    setEstimateSaveState({ status: "idle", message: null });
    setSelectedCatalogItemIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  }

  function buildProfessionalLineId(index: number): string {
    return `${createSafePhotoStorageId()}-${index}`;
  }

  function applyGeneratedEstimateDraft(draft: EstimateDraftAgentResult) {
    setEstimateDraftAgentResult(draft);
    setSelectedCatalogItemIds([]);
    setHiddenProposalLineIds([]);
    setCustomEstimateLines(
      draft.lines.map((line, index) => ({
        id: buildProfessionalLineId(index),
        lineType: line.lineType,
        itemTitle: line.internalName,
        customerName: line.customerName,
        internalName: line.internalName,
        quantity: line.quantity ?? 1,
        unitPrice: line.unitPrice,
        unitCost: line.unitCost,
        publicDescription: line.publicDescription ?? line.notes,
        taxable: line.taxable ?? getDefaultLineTaxable(line.lineType),
        notes: line.notes,
      })),
    );
    setCreatedEstimateSummary(null);
    setEstimateSaveState({
      status: "idle",
      message: null,
    });
    setIsRepairProposalBuilderOpen(true);
  }

  function summarizeEstimateRepairPlan(
    repairPlan: unknown,
    pricingWarnings: unknown,
  ): EstimateRepairPlanSummary | null {
    if (!repairPlan || typeof repairPlan !== "object") {
      return null;
    }

    const plan = repairPlan as {
      requiredOperations?: unknown;
      likelyParts?: unknown;
      materials?: unknown;
      customerFacingExplanation?: unknown;
      problemSummary?: unknown;
      estimateStrategy?: {
        customerSummary?: unknown;
      };
    };
    const operationTitles = Array.isArray(plan.requiredOperations)
      ? plan.requiredOperations
          .map((operation) =>
            operation &&
            typeof operation === "object" &&
            "title" in operation &&
            typeof operation.title === "string"
              ? operation.title.trim()
              : "",
          )
          .filter(Boolean)
          .slice(0, 5)
      : [];
    const materialTitles = Array.isArray(plan.materials)
      ? plan.materials
          .map((material) =>
            material &&
            typeof material === "object" &&
            "customerName" in material &&
            typeof material.customerName === "string"
              ? material.customerName.trim()
              : "",
          )
          .filter(Boolean)
          .slice(0, 4)
      : [];
    const partTitles = Array.isArray(plan.likelyParts)
      ? plan.likelyParts
          .map((part) =>
            part &&
            typeof part === "object" &&
            "customerName" in part &&
            typeof part.customerName === "string"
              ? part.customerName.trim()
              : "",
          )
          .filter(Boolean)
          .slice(0, 5)
      : [];
    const missingInformation = Array.isArray(pricingWarnings)
      ? pricingWarnings
          .filter((warning): warning is string => typeof warning === "string")
          .map((warning) => warning.trim())
          .filter(Boolean)
          .slice(0, 4)
      : [];
    const understoodSummary =
      (typeof plan.estimateStrategy?.customerSummary === "string" &&
        plan.estimateStrategy.customerSummary.trim()) ||
      (typeof plan.customerFacingExplanation === "string" &&
        plan.customerFacingExplanation.trim()) ||
      (typeof plan.problemSummary === "string" && plan.problemSummary.trim()) ||
      "Estimate draft prepared from technician-provided repair scope.";

    return {
      understoodSummary,
      includedRepairs: [...operationTitles, ...materialTitles].slice(0, 6),
      includedParts: partTitles,
      missingInformation,
    };
  }

  async function generateEstimateDraftFromDiagnosis() {
    if (state.status !== "ready") {
      return;
    }

    const diagnosis = estimateDiagnosisText.trim();

    if (!diagnosis) {
      setEstimateSaveState({
        status: "error",
        message: "Describe the diagnosis or repair needed first.",
      });
      setEstimateGenerationState({
        status: "error",
        message: "Describe the diagnosis or repair needed first.",
        source: null,
      });
      return;
    }

    if (
      (customEstimateLines.length > 0 || selectedCatalogItemIds.length > 0) &&
      !window.confirm(
        "Replace the current estimate lines with a newly generated draft?",
      )
    ) {
      return;
    }

    setEstimateSaveState({ status: "idle", message: null });
    setEstimateGenerationState({
      status: "generating",
      message: null,
      source: null,
    });

    const diagnosticNotes = notesState.notes
      .filter((note) => note.noteType === "diagnostic")
      .slice(0, 3)
      .map((note) => note.body);

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setEstimateGenerationState({
        status: "error",
        message: "Estimate agent is not available for this workspace.",
        source: null,
      });
      return;
    }

    try {
      const sessionResult = await getDashboardActionSession(supabase);

      if (!sessionResult.ok) {
        throw new Error(sessionResult.message);
      }

      const accessToken = sessionResult.response.data.session?.access_token;

      if (!accessToken) {
        throw new Error("Log in again before generating an estimate draft.");
      }

      const response = await fetch("/api/estimate-agent/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          jobId: state.request.id,
          applianceType: state.request.applianceType,
          brand: state.request.applianceBrand,
          modelNumber: null,
          customerComplaint: state.request.issueDescription,
          technicianDiagnosis: diagnosis,
          existingNotes: diagnosticNotes,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        source?: "openai" | "fallback";
        provider?: "openai" | "local_fallback";
        repair_plan?: unknown;
        estimate_lines?: unknown;
        customer_summary?: unknown;
        warranty_text?: unknown;
        pricing_warnings?: unknown;
        confidence?: unknown;
        draft?: EstimateDraftAgentResult;
      } | null;

      if (!response.ok || !payload?.ok || !payload.draft) {
        throw new Error(
          payload?.message ?? "Estimate agent could not generate a draft.",
        );
      }

      applyGeneratedEstimateDraft(payload.draft);
      setEstimateRepairPlanSummary(
        summarizeEstimateRepairPlan(payload.repair_plan, payload.pricing_warnings),
      );
      const source =
        payload.source ?? (payload.provider === "openai" ? "openai" : "fallback");
      setEstimateGenerationState({
        status: "success",
        message: "Estimate draft prepared. Please review before sending.",
        source,
      });
    } catch (error) {
      setEstimateGenerationState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Estimate agent API request did not complete.",
        source: null,
      });
    }
  }

  function updateCustomEstimateLinePrice(lineId: string, value: string) {
    const nextPrice = Number(value);

    setCustomEstimateLines((current) =>
      current.map((line) =>
        line.id === lineId
          ? {
              ...line,
              unitPrice:
                Number.isFinite(nextPrice) && nextPrice >= 0 ? nextPrice : 0,
            }
          : line,
      ),
    );
    setCreatedEstimateSummary(null);
    setEstimateSaveState({ status: "idle", message: null });
  }

  function updateCustomEstimateLineCost(lineId: string, value: string) {
    const nextCost = Number(value);

    setCustomEstimateLines((current) =>
      current.map((line) =>
        line.id === lineId
          ? {
              ...line,
              unitCost:
                Number.isFinite(nextCost) && nextCost >= 0 ? nextCost : 0,
            }
          : line,
      ),
    );
    setCreatedEstimateSummary(null);
    setEstimateSaveState({ status: "idle", message: null });
  }

  function updateCustomEstimateLineQuantity(lineId: string, value: string) {
    const nextQuantity = Number(value);

    setCustomEstimateLines((current) =>
      current.map((line) =>
        line.id === lineId
          ? {
              ...line,
              quantity:
                Number.isFinite(nextQuantity) && nextQuantity > 0
                  ? Math.min(99, Math.round(nextQuantity * 100) / 100)
                  : 1,
            }
          : line,
      ),
    );
    setCreatedEstimateSummary(null);
    setEstimateSaveState({ status: "idle", message: null });
  }

  function updateCustomEstimateLineTitle(lineId: string, value: string) {
    const title = value.slice(0, 160);

    setCustomEstimateLines((current) =>
      current.map((line) =>
        line.id === lineId
          ? {
              ...line,
              customerName: title,
              itemTitle: line.internalName || title,
            }
          : line,
      ),
    );
    setCreatedEstimateSummary(null);
    setEstimateSaveState({ status: "idle", message: null });
  }

  function updateProposalRepairSolution(value: string) {
    const title = value.slice(0, 160);

    setEstimateDraftAgentResult((current) =>
      current
        ? {
            ...current,
            title,
            repairScope: {
              ...current.repairScope,
              repairItem: title || current.repairScope.repairItem,
            },
          }
        : current,
    );
    setEstimateSaveState({ status: "idle", message: null });
  }

  function updateProposalCustomerDescription(value: string) {
    const description = value.slice(0, 900);

    setEstimateDraftAgentResult((current) =>
      current
        ? {
            ...current,
            customerDescription: description,
            repairScope: {
              ...current.repairScope,
              customerSummary:
                description || current.repairScope.customerSummary,
            },
          }
        : current,
    );
    setEstimateSaveState({ status: "idle", message: null });
  }

  function updateCustomEstimateLineDescription(lineId: string, value: string) {
    const description = value.trim().slice(0, 500);

    setCustomEstimateLines((current) =>
      current.map((line) =>
        line.id === lineId
          ? {
              ...line,
              publicDescription: description || null,
              notes: description || null,
            }
          : line,
      ),
    );
    setCreatedEstimateSummary(null);
    setEstimateSaveState({ status: "idle", message: null });
  }

  function updateCustomEstimateLineType(
    lineId: string,
    lineType: Exclude<ProfessionalEstimateLineType, "warranty">,
  ) {
    setCustomEstimateLines((current) =>
      current.map((line) =>
        line.id === lineId
          ? {
              ...line,
              lineType,
              taxable: getDefaultLineTaxable(lineType),
            }
          : line,
      ),
    );
    setCreatedEstimateSummary(null);
    setEstimateSaveState({ status: "idle", message: null });
  }

  function updateCustomEstimateLineTaxable(lineId: string, taxable: boolean) {
    setCustomEstimateLines((current) =>
      current.map((line) =>
        line.id === lineId
          ? {
              ...line,
              taxable,
            }
          : line,
      ),
    );
    setCreatedEstimateSummary(null);
    setEstimateSaveState({ status: "idle", message: null });
  }

  function toggleEstimateLineDetails(lineId: string) {
    setExpandedEstimateLineIds((current) =>
      current.includes(lineId)
        ? current.filter((currentLineId) => currentLineId !== lineId)
        : [...current, lineId],
    );
  }

  function updateWarrantyFooterText(value: string) {
    const nextWarranty = value.slice(0, 1000);

    setCustomEstimateLines((current) =>
      current.map((line) =>
        line.lineType === "warranty"
          ? {
              ...line,
              customerName: nextWarranty || "Standard Repair Warranty",
              publicDescription: nextWarranty || null,
              notes: nextWarranty || null,
            }
          : line,
      ),
    );
    setCreatedEstimateSummary(null);
    setEstimateSaveState({ status: "idle", message: null });
  }

  function addEstimateItem(
    lineType: Exclude<ProfessionalEstimateLineType, "warranty"> = "custom",
  ) {
    const title = getDefaultEstimateLineTitle(lineType);

    setCustomEstimateLines((current) => [
      ...current,
      {
        id: buildProfessionalLineId(current.length),
        lineType,
        itemTitle: title,
        customerName: title,
        internalName: title,
        quantity: 1,
        unitPrice: 0,
        unitCost: 0,
        publicDescription: null,
        taxable: getDefaultLineTaxable(lineType),
        notes: null,
      },
    ]);
    setCreatedEstimateSummary(null);
    setEstimateSaveState({ status: "idle", message: null });
    setIsRepairProposalBuilderOpen(true);
  }

  function createManualRepairProposalDraft() {
    if (estimateDiagnosisText.trim().length === 0) {
      setEstimateDiagnosisText(
        state.status === "ready"
          ? state.request.issueDescription || "Manual repair proposal"
          : "Manual repair proposal",
      );
    }
    if (customEstimateLines.length === 0 && selectedCatalogItemIds.length === 0) {
      addEstimateItem("labor");
    } else {
      setIsRepairProposalBuilderOpen(true);
    }
    setEstimateSaveState({ status: "idle", message: null });
  }

  function createTemplateRepairProposalDraft(template: "standard" | "diagnostic") {
    const baseTitle =
      template === "diagnostic"
        ? "Diagnostic and repair labor"
        : "Repair solution";
    const draftDescription =
      template === "diagnostic"
        ? "Diagnose the appliance, verify the failed system, complete approved repair work, and test operation."
        : "Complete the approved repair, reinstall affected components, and test the appliance before completion.";

    setEstimateDiagnosisText((current) =>
      current.trim().length > 0 ? current : draftDescription,
    );
    setHiddenProposalLineIds([]);
    setCustomEstimateLines([
      {
        id: buildProfessionalLineId(0),
        lineType: "labor",
        itemTitle: baseTitle,
        customerName: baseTitle,
        internalName: baseTitle,
        quantity: 1,
        unitPrice: 0,
        unitCost: 0,
        publicDescription: draftDescription,
        taxable: getDefaultLineTaxable("labor"),
        notes: draftDescription,
      },
    ]);
    setEstimateDraftAgentResult((current) =>
      current ?? {
        title: baseTitle,
        customerDescription:
          "Review and customize this repair proposal before sending it to the customer.",
        warrantyText:
          "90 days labor and installed parts unless otherwise specified on the estimate.",
        lines: [],
        repairScope: {
          scopeKey: "manual_template",
          serviceCategory: "repair",
          repairGroup: "manual",
          repairItem: baseTitle,
          customerSummary:
            "Review and customize this repair proposal before sending it to the customer.",
        },
        diagnosisNormalization: {
          providerMode: "local",
          detectedLanguage: "english",
          normalizedEnglishDiagnosis: baseTitle,
          repairIntents: [],
          confidence: "low",
          matchedTerms: [],
        },
        internalNotes: "Created from technician-selected proposal template.",
        confidence: "low",
        sourceReason: "Manual template starter selected by technician.",
      },
    );
    setSelectedCatalogItemIds([]);
    setCreatedEstimateSummary(null);
    setEstimateSaveState({ status: "idle", message: null });
    setIsTemplateSheetOpen(false);
    setIsRepairProposalBuilderOpen(true);
  }

  function removeCustomEstimateLine(lineId: string) {
    setCustomEstimateLines((current) =>
      current.filter((line) => line.id !== lineId),
    );
    setHiddenProposalLineIds((current) =>
      current.filter((currentLineId) => currentLineId !== lineId),
    );
    setCreatedEstimateSummary(null);
    setEstimateSaveState({ status: "idle", message: null });
  }

  function updateCustomEstimateLineVisibility(
    lineId: string,
    customerVisible: boolean,
  ) {
    setHiddenProposalLineIds((current) =>
      customerVisible
        ? current.filter((currentLineId) => currentLineId !== lineId)
        : current.includes(lineId)
          ? current
          : [...current, lineId],
    );
    setCreatedEstimateSummary(null);
    setEstimateSaveState({ status: "idle", message: null });
  }

  function moveCustomEstimateLine(lineId: string, direction: "up" | "down") {
    setCustomEstimateLines((current) => {
      const currentIndex = current.findIndex((line) => line.id === lineId);

      if (currentIndex < 0) {
        return current;
      }

      const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [line] = next.splice(currentIndex, 1);
      next.splice(nextIndex, 0, line);

      return next;
    });
    setCreatedEstimateSummary(null);
    setEstimateSaveState({ status: "idle", message: null });
  }

  function startRepairScopeDictation() {
    const speechWindow = window as Window & {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: ((event: {
          results: ArrayLike<{ 0: { transcript: string } }>;
        }) => void) | null;
        onerror: ((event?: { error?: string }) => void) | null;
        onend: (() => void) | null;
        start: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: ((event: {
          results: ArrayLike<{ 0: { transcript: string } }>;
        }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
        start: () => void;
      };
    };
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setEstimateGenerationState({
        status: "error",
        message:
          "Voice dictation is not available in this browser. You can still type or paste the confirmed repair scope.",
        source: null,
      });
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      if (transcript) {
        setEstimateDiagnosisText((current) =>
          [current.trim(), transcript].filter(Boolean).join(" "),
        );
      }
    };
    recognition.onerror = (event) => {
      setIsDictatingRepairScope(false);
      setEstimateGenerationState({
        status: "error",
        message:
          event?.error === "not-allowed"
            ? "Microphone permission was not allowed. You can still type or paste the confirmed repair scope."
            : "Voice dictation could not start in this browser. You can still type or paste the confirmed repair scope.",
        source: null,
      });
    };
    recognition.onend = () => {
      setIsDictatingRepairScope(false);
    };

    try {
      setIsDictatingRepairScope(true);
      recognition.start();
    } catch {
      setIsDictatingRepairScope(false);
      setEstimateGenerationState({
        status: "error",
        message:
          "Voice dictation could not start in this browser. You can still type or paste the confirmed repair scope.",
        source: null,
      });
    }
  }

  function resetEstimateBuilder() {
    setSelectedCatalogItemIds([]);
    setCustomEstimateLines([]);
    setHiddenProposalLineIds([]);
    setEstimateDraftAgentResult(null);
    setEstimateRepairPlanSummary(null);
    setEstimateDiagnosisText("");
    setEditingEstimateId(null);
    setAllowNewDraftWithActiveDraft(false);
    setCreatedEstimateSummary(null);
    setEstimateApprovalLink(null);
    setEstimateDiscountType("flat");
    setEstimateDiscountValue("0");
    setEstimateTaxRate("8.25");
    setShowEstimateAdjustments(false);
    setShowEstimateWarrantyEditor(false);
    setIsProposalPreviewOpen(false);
    setExpandedEstimateLineIds([]);
    setEstimateGenerationState({ status: "idle", message: null, source: null });
    setEstimateSaveState({ status: "idle", message: null });
  }

  function beginNewDraft() {
    setSelectedCatalogItemIds([]);
    setCustomEstimateLines([]);
    setHiddenProposalLineIds([]);
    setEstimateDraftAgentResult(null);
    setEstimateRepairPlanSummary(null);
    setEstimateDiagnosisText("");
    setEditingEstimateId(null);
    setAllowNewDraftWithActiveDraft(true);
    setCreatedEstimateSummary(null);
    setEstimateApprovalLink(null);
    setEstimateDiscountType("flat");
    setEstimateDiscountValue("0");
    setEstimateTaxRate("8.25");
    setShowEstimateAdjustments(false);
    setShowEstimateWarrantyEditor(false);
    setIsProposalPreviewOpen(false);
    setExpandedEstimateLineIds([]);
    setEstimateGenerationState({ status: "idle", message: null, source: null });
    setEstimateSaveState({
      status: "idle",
      message: null,
    });
  }

  function editEstimateDraft(estimate: DashboardServiceRequestEstimate) {
    const catalogItemIds = estimate.items
      .map((item) => item.pricingCatalogItemId)
      .filter((itemId): itemId is string => itemId !== null);
    setSelectedCatalogItemIds(catalogItemIds);
    setHiddenProposalLineIds([]);
    setEstimateDraftAgentResult(null);
    setEstimateRepairPlanSummary(null);
    setCustomEstimateLines(
      estimate.items
        .filter((item) => item.pricingCatalogItemId === null)
        .map((item) => ({
          id: item.id,
          lineType: item.lineType,
          itemTitle: item.internalName ?? item.itemTitle,
          customerName: item.customerName ?? item.itemTitle,
          internalName: item.internalName ?? item.itemTitle,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unitCost: item.internalCost ?? item.technicianCost ?? 0,
          publicDescription: item.publicDescription,
          taxable: item.taxable,
          notes: item.notes,
        })),
    );
    setEditingEstimateId(estimate.id);
    setViewingEstimateId(estimate.id);
    setViewingInvoiceId(null);
    setAllowNewDraftWithActiveDraft(false);
    setCreatedEstimateSummary(null);
    setEstimateApprovalLink(null);
    setEstimateDiscountType(estimate.discountType);
    setEstimateDiscountValue(String(estimate.discountValue));
    setEstimateTaxRate(String(estimate.taxRate));
    setShowEstimateAdjustments(
      estimate.discountAmount > 0 || estimate.taxRate > 0,
    );
    setShowEstimateWarrantyEditor(false);
    setIsProposalPreviewOpen(false);
    setExpandedEstimateLineIds([]);
    setEstimateGenerationState({ status: "idle", message: null, source: null });
    setEstimateSaveState({
      status: "idle",
      message: null,
    });
  }

  function openSavedManualEstimateEditor(
    estimate: DashboardServiceRequestEstimate,
    options: { history?: "push" | "replace" | "none" } = {},
  ) {
    setManualEstimateId(estimate.id);
    setFinanceEstimateMode("saved");
    setActiveJobTab("estimate");
    setIsFinanceEstimatesOpen(true);
    setIsFinanceEstimateWorkflowOpen(false);
    setIsRepairProposalBuilderOpen(false);
    setEstimateDraftAgentResult(null);
    setEstimateRepairPlanSummary(null);
    setEditingEstimateId(null);
    setViewingEstimateId(null);
    setViewingInvoiceId(null);
    setCreatedEstimateSummary(null);
    setEstimateApprovalLink(null);
    setEstimateSaveState({ status: "idle", message: null });
    syncEstimateWorkspaceHistory(estimate.id, options.history ?? "push");
  }

  function closeManualEstimateEditor() {
    closeEstimateWorkspaceToFinance();
  }

  function openNewManualEstimateEditor() {
    setManualEstimateId(null);
    setFinanceEstimateMode("manual");
    setIsFinanceEstimateWorkflowOpen(false);
    setIsRepairProposalBuilderOpen(false);
    setEstimateDraftAgentResult(null);
    setEstimateRepairPlanSummary(null);
    setEditingEstimateId(null);
    setViewingEstimateId(null);
    setViewingInvoiceId(null);
    setCreatedEstimateSummary(null);
    setEstimateApprovalLink(null);
    setEstimateSaveState({ status: "idle", message: null });
  }

  async function createEstimate(options?: { sendAfterSave?: boolean }) {
    if (state.status !== "ready") {
      return null;
    }

    const pendingCustomLines = customEstimateLines.filter(
      (line) => line.lineType === "warranty" || !hiddenProposalLineIds.includes(line.id),
    );

    if (selectedCatalogItemIds.length === 0 && pendingCustomLines.length === 0) {
      setEstimateSaveState({
        status: "error",
        message: "Generate a Repair Proposal or add at least one line first.",
      });
      return null;
    }

    const proposalSendBlockers = [
      ...proposalBlockingErrors,
      ...proposalWarnings,
    ];

    if (options?.sendAfterSave && proposalSendBlockers.length > 0) {
      setEstimateSaveState({
        status: "error",
        message: proposalSendBlockers[0],
      });
      return null;
    }

    const activeDraftEstimate = estimatesState.estimates.find(
      (estimate) => estimate.estimateStatus === "draft",
    );

    if (
      activeDraftEstimate &&
      !editingEstimateId &&
      !allowNewDraftWithActiveDraft
    ) {
      setEstimateSaveState({
        status: "error",
        message:
          "A draft estimate already exists. Edit that draft or choose Create another draft before saving a new version.",
      });
      return null;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setEstimateSaveState({
        status: "error",
        message: "Estimates are not available for this workspace.",
      });
      return null;
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setEstimateSaveState({
        status: "error",
        message: "Log in again before creating an estimate.",
      });
      return null;
    }

    setEstimateSaveState({ status: "saving", message: null });

    const estimatePayload = {
      ...(editingEstimateId ? { estimateId: editingEstimateId } : {}),
      catalogItems: selectedCatalogItemIds.map((pricingCatalogItemId) => ({
        pricingCatalogItemId,
        quantity: 1,
      })),
      customItems: pendingCustomLines.map((line) => ({
        itemTitle: line.itemTitle,
        customerName: line.customerName,
        internalName: line.internalName,
        lineType: line.lineType,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unitCost: line.unitCost,
        technicianCost: line.unitCost,
        taxable: line.taxable,
        publicDescription: line.publicDescription,
        warrantyText:
          line.lineType === "warranty"
            ? line.notes ?? "Warranty coverage included with this estimate."
            : null,
        notes: line.notes,
      })),
      adjustments: {
        discountType: estimateCalculation.discountType,
        discountValue: estimateCalculation.discountValue,
        taxRate: estimateCalculation.taxRate,
      },
      estimateDecisionContext: {
        eventSource: "repair_proposal_builder_vertical_slice",
        diagnosisText: estimateDiagnosisText.trim(),
        confirmedRepairScope: estimateDiagnosisText.trim(),
        repairProposal: {
          repairSolution: proposalRepairSolution,
          customerDescription: proposalCustomerDescription,
          estimatedCompletion:
            proposalEstimatedCompletion.trim().length > 0
              ? proposalEstimatedCompletion.trim()
              : null,
          warnings: proposalWarnings,
          source: estimateGenerationState.source,
        },
        generatedAt: new Date().toISOString(),
        generatorVersion:
          estimateDraftAgentResult?.diagnosisNormalization.providerMode ===
          "cheap_ai"
            ? "openai-cheap-v1"
            : "local-deterministic-v1",
        diagnosisNormalization:
          estimateDraftAgentResult?.diagnosisNormalization ?? null,
        repairScope: estimateDraftAgentResult?.repairScope ?? null,
        repairPlanSummary: estimateRepairPlanSummary,
        generatedTitle: estimateDraftAgentResult?.title ?? null,
        customerDescription:
          estimateDraftAgentResult?.customerDescription ?? null,
        lineDecisions: pendingCustomLines.map((line) => ({
          lineType: line.lineType,
          customerName: line.customerName,
          internalName: line.internalName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitCost: line.unitCost,
          publicDescription: line.publicDescription,
          taxable: line.taxable,
          customerVisible: !hiddenProposalLineIds.includes(line.id),
          lineTotal: Math.round(line.quantity * line.unitPrice * 100) / 100,
          wasEdited: true,
        })),
        totals: {
          subtotal: estimateSubtotal,
          discountType: estimateDiscountType,
          discountValue: parsedDiscountValue,
          discountAmount: estimateDiscountAmount,
          taxableSubtotal: estimateTaxableSubtotal,
          taxRate: parsedTaxRate,
          tax: estimateTaxTotal,
          grandTotal: estimateGrandTotal,
          internalCostTotal: estimateInternalCostTotal,
          margin: estimateMargin,
          marginPercent: estimateMarginPercent,
          persistedAuthoritatively: true,
        },
        total: estimateGrandTotal,
      },
    };

    const response = await fetch(
      `/api/service-requests/${state.request.id}/estimates`,
      {
        method: editingEstimateId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(estimatePayload),
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      estimate?: {
        id?: string;
        estimate_number?: string | null;
        line_count?: number;
        total?: number | string | null;
        request_status?: string;
      };
    } | null;

    if (!response.ok || !payload?.ok) {
      setEstimateSaveState({
        status: "error",
        message: payload?.message ?? "We could not create this estimate yet.",
      });
      return null;
    }

    const createdTotal = Number(payload.estimate?.total);
    const lineCount =
      payload.estimate?.line_count ??
      selectedCatalogItemIds.length + pendingCustomLines.length;

    const savedEstimateId = editingEstimateId;
    const wasEditing = Boolean(editingEstimateId);
    const savedEstimate = {
      id: savedEstimateId ?? (payload.estimate?.id ? String(payload.estimate.id) : null),
      estimateNumber: payload.estimate?.estimate_number ?? "Estimate",
      lineCount,
      total: Number.isFinite(createdTotal) ? createdTotal : 0,
    };

    if (options?.sendAfterSave && savedEstimate.id) {
      setViewingEstimateId(savedEstimate.id);
      setViewingInvoiceId(null);
      setCreatedEstimateSummary({
        estimateNumber: payload.estimate?.estimate_number ?? null,
        lineCount,
        total: savedEstimate.total,
      });

      if (payload.estimate?.request_status === "contacted") {
        setState((current) =>
          current.status === "ready"
            ? {
                status: "ready",
                request: {
                  ...current.request,
                  status: "contacted",
                },
                error: null,
              }
            : current,
        );
        setSelectedStatus("contacted");
      }

      await sendEstimateById(savedEstimate.id, savedEstimate.estimateNumber);
      return savedEstimate;
    }

    resetEstimateBuilder();
    setCreatedEstimateSummary({
      estimateNumber: payload.estimate?.estimate_number ?? null,
      lineCount,
      total: Number.isFinite(createdTotal) ? createdTotal : 0,
    });
    setEstimateSaveState({
      status: "success",
      message:
        wasEditing
          ? "Repair Proposal draft updated. The builder was reset so the saved draft is now the source of truth."
          : "Repair Proposal draft saved. The builder was reset so you can prepare another option if needed.",
    });
    setViewingEstimateId(
      savedEstimate.id,
    );
    setViewingInvoiceId(null);

    if (payload.estimate?.request_status === "contacted") {
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              request: {
                ...current.request,
                status: "contacted",
              },
              error: null,
            }
          : current,
      );
      setSelectedStatus("contacted");
    }

    void loadEstimates();
    void loadNotes();
    return savedEstimate;
  }

  async function sendEstimateById(estimateId: string, estimateNumber: string) {
    if (process.env.NODE_ENV === "development") {
      console.debug("[Estimate Approval] Send To Customer clicked", {
        estimateId,
        estimateNumber,
      });
    }

    setSendingEstimateId(estimateId);
    setEstimateSaveState({
      status: "saving",
      message: `Sending ${estimateNumber} to customer...`,
    });

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setSendingEstimateId(null);
      setEstimateSaveState({
        status: "error",
        message: "Customer approval links are not available for this workspace.",
      });
      return false;
    }

    const sessionResult = await getDashboardActionSession(supabase);

    if (!sessionResult.ok) {
      setSendingEstimateId(null);
      setEstimateSaveState({
        status: "error",
        message: sessionResult.message,
      });
      return false;
    }

    const { data: sessionData, error: sessionError } = sessionResult.response;
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setSendingEstimateId(null);
      setEstimateSaveState({
        status: "error",
        message: "Log in again before sending a Repair Proposal.",
      });
      return false;
    }

    if (process.env.NODE_ENV === "development") {
      console.debug("[Estimate Approval] Calling send API", {
        estimateId,
        url: `/api/estimates/${estimateId}/send`,
      });
    }

    let response: Response;
    let payload: {
      ok?: boolean;
      message?: string;
      approvalUrl?: string;
      estimate?: {
        estimate_status?: DashboardServiceRequestEstimate["estimateStatus"];
        service_request_status?: string;
      };
    } | null;

    try {
      response = await fetch(`/api/estimates/${estimateId}/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        approvalUrl?: string;
        estimate?: {
          estimate_status?: DashboardServiceRequestEstimate["estimateStatus"];
          service_request_status?: string;
        };
      } | null;
    } catch (error) {
      setSendingEstimateId(null);
      setEstimateSaveState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "The estimate send request did not reach the server.",
      });
      return false;
    }

    if (!response.ok || !payload?.ok || !payload.approvalUrl) {
      setSendingEstimateId(null);
      setEstimateSaveState({
        status: "error",
        message:
          payload?.message ??
          "We could not create an approval link for this Repair Proposal.",
      });
      return false;
    }

    setEstimateApprovalLink({
      estimateId,
      approvalUrl: payload.approvalUrl,
    });
    setViewingEstimateId(estimateId);
    setViewingInvoiceId(null);
    const nextEstimateStatus =
      payload.estimate?.estimate_status === "approved" ? "approved" : "sent";

    setEstimatesState((current) => {
      if (current.status !== "ready") {
        return current;
      }

      return {
        status: "ready",
        estimates: current.estimates.map((currentEstimate) =>
          currentEstimate.id === estimateId
            ? {
                ...currentEstimate,
                estimateStatus: nextEstimateStatus,
                sentAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : currentEstimate,
        ),
        error: null,
      };
    });
    if (
      payload.estimate?.service_request_status === "estimate_sent" ||
      payload.estimate?.service_request_status === "estimate_approved"
    ) {
      const nextStatus =
        payload.estimate.service_request_status === "estimate_approved"
          ? "estimate_approved"
          : "estimate_sent";
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              request: {
                ...current.request,
                status: nextStatus,
              },
              error: null,
            }
          : current,
      );
      setSelectedStatus(nextStatus);
    }
    setSendingEstimateId(null);
    setEstimateSaveState({
      status: "success",
      message:
        "Repair Proposal sent. Copy the approval link or open the customer view.",
    });
    void loadEstimates();
    void loadNotes();
    return true;
  }

  async function approveEstimateForCustomer(
    estimateId: string,
    estimateNumber: string,
  ) {
    setEstimateSaveState({
      status: "saving",
      message: `Approving ${estimateNumber} for customer...`,
    });

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setEstimateSaveState({
        status: "error",
        message: "Manual approval is not available for this workspace.",
      });
      return false;
    }

    const sessionResult = await getDashboardActionSession(supabase);

    if (!sessionResult.ok) {
      setEstimateSaveState({
        status: "error",
        message: sessionResult.message,
      });
      return false;
    }

    const { data: sessionData, error: sessionError } = sessionResult.response;
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setEstimateSaveState({
        status: "error",
        message: "Log in again before approving this estimate.",
      });
      return false;
    }

    let response: Response;
    let payload: {
      ok?: boolean;
      message?: string;
      estimate?: {
        estimate_status?: DashboardServiceRequestEstimate["estimateStatus"];
        service_request_status?: string;
        customer_responded_at?: string | null;
        approval_source?: "customer" | "technician_manual";
      };
    } | null;

    try {
      response = await fetch(`/api/estimates/${estimateId}/approve-for-customer`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      payload = (await response.json().catch(() => null)) as typeof payload;
    } catch {
      setEstimateSaveState({
        status: "error",
        message: "Estimate could not be approved for the customer. Please try again.",
      });
      return false;
    }

    if (!response.ok || !payload?.ok) {
      setEstimateSaveState({
        status: "error",
        message:
          payload?.message ??
          "Estimate could not be approved for the customer. Please try again.",
      });
      return false;
    }

    const approvedAt =
      payload.estimate?.customer_responded_at ?? new Date().toISOString();

    setViewingEstimateId(estimateId);
    setViewingInvoiceId(null);
    setEstimatesState((current) => {
      if (current.status !== "ready") {
        return current;
      }

      return {
        status: "ready",
        estimates: current.estimates.map((currentEstimate) =>
          currentEstimate.id === estimateId
            ? {
                ...currentEstimate,
                estimateStatus: "approved",
                approvalSource: "technician_manual",
                customerRespondedAt: approvedAt,
                updatedAt: new Date().toISOString(),
              }
            : currentEstimate,
        ),
        error: null,
      };
    });
    setState((current) =>
      current.status === "ready"
        ? {
            status: "ready",
            request: {
              ...current.request,
              status: "estimate_approved",
            },
            error: null,
          }
        : current,
    );
    setSelectedStatus("estimate_approved");
    setEstimateSaveState({
      status: "success",
      message: "Estimate approved by technician on behalf of customer.",
    });
    void loadEstimates();
    void loadNotes();
    return true;
  }

  async function deleteDraftEstimateById(
    estimateId: string,
    estimateNumber: string,
  ) {
    setEstimateSaveState({
      status: "saving",
      message: `Deleting ${estimateNumber}...`,
    });

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setEstimateSaveState({
        status: "error",
        message: "Draft estimate deletion is not available for this workspace.",
      });
      return false;
    }

    const sessionResult = await getDashboardActionSession(supabase);

    if (!sessionResult.ok) {
      setEstimateSaveState({
        status: "error",
        message: sessionResult.message,
      });
      return false;
    }

    const { data: sessionData, error: sessionError } = sessionResult.response;
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setEstimateSaveState({
        status: "error",
        message: "Log in again before deleting this estimate.",
      });
      return false;
    }

    let response: Response;
    let payload: { ok?: boolean; message?: string } | null;

    try {
      response = await fetch(`/api/estimates/${estimateId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      payload = (await response.json().catch(() => null)) as typeof payload;
    } catch {
      setEstimateSaveState({
        status: "error",
        message: "Estimate could not be deleted. Please try again.",
      });
      return false;
    }

    if (!response.ok || !payload?.ok) {
      setEstimateSaveState({
        status: "error",
        message: payload?.message ?? "Estimate could not be deleted.",
      });
      return false;
    }

    setManualEstimateId(null);
    setFinanceEstimateMode("home");
    setActiveJobTab("estimate");
    setIsFinanceEstimatesOpen(true);
    setViewingEstimateId(null);
    setViewingInvoiceId(null);
    setEstimateSaveState({
      status: "success",
      message: "Draft estimate deleted.",
    });
    await loadEstimates();
    return true;
  }

  async function createInvoiceFromEstimate(
    estimate: DashboardServiceRequestEstimate,
  ) {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setInvoiceActionState({
        status: "error",
        message: "Invoices are not available for this workspace.",
      });
      return;
    }

    const sessionResult = await getDashboardActionSession(supabase);

    if (!sessionResult.ok) {
      setInvoiceActionState({
        status: "error",
        message: sessionResult.message,
      });
      return;
    }

    const { data: sessionData, error: sessionError } = sessionResult.response;
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setInvoiceActionState({
        status: "error",
        message: "Log in again before creating an invoice.",
      });
      return;
    }

    setInvoiceActionId(estimate.id);
    setInvoiceActionState({
      status: "saving",
      message: `Creating invoice from ${estimate.estimateNumber}...`,
    });

    const response = await fetch(`/api/estimates/${estimate.id}/invoice`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      invoice?: {
        id?: string;
        invoice_number?: string;
      };
    } | null;

    setInvoiceActionId(null);

    if (!response.ok || !payload?.ok) {
      setInvoiceActionState({
        status: "error",
        message: payload?.message ?? "We could not create this invoice yet.",
      });
      return;
    }

    setViewingInvoiceId(payload.invoice?.id ? String(payload.invoice.id) : null);
    setViewingEstimateId(null);
    setInvoiceActionState({
      status: "success",
      message: `Invoice ${payload.invoice?.invoice_number ?? ""} created from ${estimate.estimateNumber}.`,
    });
    void loadInvoices();
    void loadNotes();
  }

  async function updateInvoice(
    invoice: DashboardServiceRequestInvoice,
    action: "send" | "paid" | "void",
  ) {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setInvoiceActionState({
        status: "error",
        message: "Invoices are not available for this workspace.",
      });
      return;
    }

    const sessionResult = await getDashboardActionSession(supabase);

    if (!sessionResult.ok) {
      setInvoiceActionState({
        status: "error",
        message: sessionResult.message,
      });
      return;
    }

    const { data: sessionData, error: sessionError } = sessionResult.response;
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setInvoiceActionState({
        status: "error",
        message: "Log in again before updating this invoice.",
      });
      return;
    }

    const actionLabel =
      action === "send" ? "Sending" : action === "paid" ? "Marking paid" : "Voiding";

    setInvoiceActionId(invoice.id);
    setInvoiceActionState({
      status: "saving",
      message: `${actionLabel} ${invoice.invoiceNumber}...`,
    });

    const response = await fetch(`/api/invoices/${invoice.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action }),
    });

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      invoice?: {
        invoice_status?: string;
        service_request_status?: string;
      };
    } | null;

    setInvoiceActionId(null);

    if (!response.ok || !payload?.ok) {
      setInvoiceActionState({
        status: "error",
        message: payload?.message ?? "We could not update this invoice yet.",
      });
      return;
    }

    if (payload.invoice?.service_request_status === "completed") {
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              request: {
                ...current.request,
                status: "completed",
              },
              error: null,
            }
          : current,
      );
      setSelectedStatus("completed");
    }

    setViewingInvoiceId(invoice.id);
    setViewingEstimateId(null);
    setInvoiceActionState({
      status: "success",
      message:
        action === "send"
          ? `${invoice.invoiceNumber} marked sent.`
          : action === "paid"
            ? `${invoice.invoiceNumber} marked paid.`
            : `${invoice.invoiceNumber} voided.`,
    });
    void loadInvoices();
    void loadNotes();
  }

  async function addNote() {
    if (state.status !== "ready") {
      return;
    }

    const body = noteBody.trim();

    if (!body) {
      setNoteSaveState({
        status: "error",
        message: "Add a short note before saving.",
      });
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setNoteSaveState({
        status: "error",
        message: "Job notes are not available for this workspace.",
      });
      return;
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setNoteSaveState({
        status: "error",
        message: "Log in again before adding an internal note.",
      });
      return;
    }

    setNoteSaveState({ status: "saving", message: null });

    const response = await fetch(`/api/service-requests/${state.request.id}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ noteType, body }),
    });

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
    } | null;

    if (!response.ok || !payload?.ok) {
      setNoteSaveState({
        status: "error",
        message: payload?.message ?? "We could not save this internal note yet.",
      });
      return;
    }

    setNoteBody("");
    setNoteSaveState({
      status: "success",
      message: "Internal note added.",
    });
    void loadNotes();
  }

  async function saveTechnicianFindings() {
    if (state.status !== "ready") {
      return;
    }

    const body = technicianFindingsDraft.trim();

    if (!body) {
      setTechnicianFindingsSaveState({
        status: "error",
        message: "Add the technician findings before saving.",
      });
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setTechnicianFindingsSaveState({
        status: "error",
        message: "Job notes are not available for this workspace.",
      });
      return;
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setTechnicianFindingsSaveState({
        status: "error",
        message: "Log in again before saving technician findings.",
      });
      return;
    }

    setTechnicianFindingsSaveState({ status: "saving", message: null });

    const response = await fetch(`/api/service-requests/${state.request.id}/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ noteType: "diagnostic", body }),
    });

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
    } | null;

    if (!response.ok || !payload?.ok) {
      setTechnicianFindingsSaveState({
        status: "error",
        message:
          payload?.message ?? "We could not save the technician findings yet.",
      });
      return;
    }

    setTechnicianFindingsDraft("");
    setTechnicianFindingsSaveState({
      status: "success",
      message: "Technician findings saved.",
    });
    void loadNotes();
  }

  function openJobSummaryEditor() {
    if (state.status !== "ready") {
      return;
    }

    const snapshot = getCurrentJobDetailsSnapshot();

    setJobSummaryDraft({
      title:
        snapshot?.jobName ??
        state.request.jobName ??
        deriveJobNameFromAppliance(state.request.applianceType),
      complaint: snapshot?.description ?? state.request.issueDescription,
    });
    setJobDetailsSaveState({ status: "idle", message: null });
    setIsClosingJobSummaryEditor(false);
    setIsEditingJobSummary(true);
    setIsJobSummaryEditorVisible(false);
    window.requestAnimationFrame(() => {
      setIsJobSummaryEditorVisible(true);
    });
  }

  function closeJobSummaryEditor() {
    setIsJobSummaryEditorVisible(false);
    setIsClosingJobSummaryEditor(true);
    window.setTimeout(() => {
      setIsEditingJobSummary(false);
      setIsClosingJobSummaryEditor(false);
      setIsJobSummaryEditorVisible(false);
    }, 220);
  }

  async function saveJobSummaryDraft() {
    if (state.status !== "ready") {
      return;
    }

    const nextTitle = jobSummaryDraft.title.trim();
    const nextComplaint = jobSummaryDraft.complaint.trim();

    if (!nextTitle || !nextComplaint) {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setJobDetailsSaveState({
        status: "error",
        message: "Job details are not configured in this browser.",
      });
      return;
    }

    const sessionResult = await getDashboardActionSession(supabase);
    const accessToken = sessionResult.ok
      ? sessionResult.response.data.session?.access_token
      : null;

    if (!accessToken) {
      setJobDetailsSaveState({
        status: "error",
        message: "Log in again before updating job details.",
      });
      return;
    }

    setJobDetailsSaveState({ status: "saving", message: null });

    const snapshot = getCurrentJobDetailsSnapshot();
    const response = await fetch(
      `/api/service-requests/${state.request.id}/details`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobTypeId: snapshot?.jobTypeId ?? state.request.jobTypeId,
          jobName: nextTitle,
          problemTypeId: snapshot?.problemTypeId ?? state.request.problemTypeId,
          description: nextComplaint,
          marketingSourceId:
            snapshot?.marketingSourceId ?? state.request.marketingSourceId,
          tagIds: snapshot?.tags.map((tag) => tag.id) ?? [],
        }),
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      details?: JobDetailsPayload;
      message?: string;
    } | null;

    if (!response.ok || !payload?.ok || !payload.details) {
      setJobDetailsSaveState({
        status: "error",
        message: payload?.message ?? "Job details could not be saved.",
      });
      return;
    }

    applyJobDetailsPayload(payload.details);
    setJobDetailsSaveState({
      status: "success",
      message: "Job details saved.",
    });
    closeJobSummaryEditor();
  }

  function openClientEditor() {
    if (state.status !== "ready") {
      return;
    }

    const { firstName, lastName } = splitClientName(state.request.customerName);
    const requestAddressForm = buildAddressFormState(state.request);

    setClientDraft({
      firstName,
      lastName,
      phone: state.request.customerPhone ?? "",
      email: state.request.customerEmail ?? "",
      streetAddress: requestAddressForm.streetAddress,
      unit: requestAddressForm.unit,
      city: requestAddressForm.city,
      state: requestAddressForm.state,
      zipCode: requestAddressForm.zipCode,
    });
    setAddressForm(requestAddressForm);
    setAddressSearchQuery("");
    setAddressSuggestions([]);
    setAddressSuggestionState({ status: "idle", message: null });
    setAddressSaveState({ status: "idle", message: null });
    setIsClosingClientEditor(false);
    setIsEditingClient(true);
    setIsClientEditorVisible(false);
    window.requestAnimationFrame(() => {
      setIsClientEditorVisible(true);
    });
  }

  function closeClientEditor() {
    setIsClientEditorVisible(false);
    setIsClosingClientEditor(true);
    window.setTimeout(() => {
      setIsEditingClient(false);
      setIsClosingClientEditor(false);
      setIsClientEditorVisible(false);
      setAddressSearchQuery("");
      setAddressSuggestions([]);
      setAddressSuggestionState({ status: "idle", message: null });
    }, 220);
  }

  async function saveClientDraft() {
    if (state.status !== "ready") {
      return;
    }

    const nextCustomerName =
      [clientDraft.firstName.trim(), clientDraft.lastName.trim()]
        .filter(Boolean)
        .join(" ") || state.request.customerName;

    setState((current) => {
      if (current.status !== "ready") {
        return current;
      }

      return {
        ...current,
        request: {
          ...current.request,
          customerName: nextCustomerName,
          customerPhone: clientDraft.phone.trim() || null,
          customerEmail: clientDraft.email.trim() || null,
        },
      };
    });

    const didSaveAddress = await saveAddress({ closeAddressEditor: false });

    if (didSaveAddress) {
      closeClientEditor();
    }
  }

  function openAvatarFilePicker(capture: boolean) {
    setAvatarCaptureMode(capture);
    setAvatarActionState({ status: "idle", message: null });
    window.setTimeout(() => {
      avatarFileInputRef.current?.click();
    }, 0);
  }

  async function uploadClientAvatar(file: File | null) {
    if (state.status !== "ready" || !file) {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setAvatarActionState({
        status: "error",
        message: "Avatar uploads are not configured in this browser.",
      });
      return;
    }

    const sessionResult = await getDashboardActionSession(supabase);
    const accessToken = sessionResult.ok
      ? sessionResult.response.data.session?.access_token
      : null;

    if (!accessToken) {
      setAvatarActionState({
        status: "error",
        message: "Log in again before updating the client avatar.",
      });
      return;
    }

    setAvatarActionState({ status: "saving", message: "Uploading avatar..." });
    setIsAvatarSheetOpen(false);

    const formData = new FormData();
    formData.set("file", file);

    const response = await fetch(
      `/api/service-requests/${state.request.id}/client-avatar`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      message?: string;
      avatar?: ClientAvatarState;
      avatarUrl?: string | null;
      storagePath?: string | null;
      ownerType?: "customer" | "job" | null;
    } | null;

    const responseAvatar =
      payload?.avatar ??
      (payload?.ok
        ? {
            storagePath: payload.storagePath ?? null,
            signedUrl: payload.avatarUrl ?? null,
            owner:
              payload.ownerType === "job"
                ? ("service_request" as const)
                : payload.ownerType ?? null,
          }
        : null);

    if (!response.ok || !payload?.ok || !responseAvatar) {
      setAvatarActionState({
        status: "error",
        message:
          payload?.error ??
          payload?.message ??
          "Client avatar could not be saved yet.",
      });
      return;
    }

    setClientAvatar(responseAvatar);
    setAvatarActionState({
      status: "success",
      message: "Client avatar saved.",
    });
  }

  async function removeClientAvatar() {
    if (state.status !== "ready") {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    const sessionResult = await getDashboardActionSession(supabase);
    const accessToken = sessionResult.ok
      ? sessionResult.response.data.session?.access_token
      : null;

    if (!accessToken) {
      setAvatarActionState({
        status: "error",
        message: "Log in again before updating the client avatar.",
      });
      return;
    }

    setAvatarActionState({ status: "saving", message: "Removing avatar..." });

    const response = await fetch(
      `/api/service-requests/${state.request.id}/client-avatar`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      message?: string;
      avatar?: ClientAvatarState;
      avatarUrl?: string | null;
      storagePath?: string | null;
      ownerType?: "customer" | "job" | null;
    } | null;

    const responseAvatar =
      payload?.avatar ??
      (payload?.ok
        ? {
            storagePath: payload.storagePath ?? null,
            signedUrl: payload.avatarUrl ?? null,
            owner:
              payload.ownerType === "job"
                ? ("service_request" as const)
                : payload.ownerType ?? null,
          }
        : null);

    if (!response.ok || !payload?.ok || !responseAvatar) {
      setAvatarActionState({
        status: "error",
        message:
          payload?.error ??
          payload?.message ??
          "Client avatar could not be removed yet.",
      });
      return;
    }

    setClientAvatar(responseAvatar);
    setAvatarActionState({
      status: "success",
      message: "Client avatar removed.",
    });
    setIsAvatarSheetOpen(false);
  }

  function openServiceAddressInMaps() {
    if (!propertyPreviewMapsUrl) {
      return;
    }

    window.open(propertyPreviewMapsUrl, "_blank", "noopener,noreferrer");
    setIsMapConfirmOpen(false);
  }

  function openStatusSheet() {
    setIsClosingStatusSheet(false);
    setIsStatusSheetOpen(true);
    setIsStatusSheetVisible(false);
    window.requestAnimationFrame(() => {
      setIsStatusSheetVisible(true);
    });
  }

  function closeStatusSheet() {
    setIsStatusSheetVisible(false);
    setIsClosingStatusSheet(true);
    window.setTimeout(() => {
      setIsStatusSheetOpen(false);
      setIsClosingStatusSheet(false);
      setIsStatusSheetVisible(false);
    }, 240);
  }

  function selectStatusFromSheet(nextStatus: ServiceRequestCrmStatus) {
    closeStatusSheet();

    if (state.status === "ready" && nextStatus !== state.request.status) {
      void updateStatus(nextStatus);
    }
  }

  function applyJobDetailsPayload(details: JobDetailsPayload) {
    setJobDetailsState({
      status: "ready",
      details,
      error: null,
    });
    setState((current) => {
      if (current.status !== "ready") {
        return current;
      }

      return {
        ...current,
        request: {
          ...current.request,
          jobTypeId: details.job.jobTypeId,
          jobName: details.job.jobName,
          problemTypeId: details.job.problemTypeId,
          marketingSourceId: details.job.marketingSourceId,
          issueDescription: details.job.description,
        },
      };
    });
  }

  function getCurrentJobDetailsSnapshot(): JobDetailsSnapshot | null {
    if (state.status !== "ready") {
      return null;
    }

    return (
      jobDetailsState.details?.job ?? {
        jobTypeId: state.request.jobTypeId,
        jobName:
          state.request.jobName ??
          deriveJobNameFromAppliance(state.request.applianceType),
        problemTypeId: state.request.problemTypeId,
        description: state.request.issueDescription,
        marketingSourceId: state.request.marketingSourceId,
        marketingSource: null,
        technicalRequestSource: state.request.requestSource,
        tags: [],
      }
    );
  }

  function openJobDetailsSheet(kind: JobDetailsSheetKind) {
    const snapshot = getCurrentJobDetailsSnapshot();

    if (!snapshot) {
      return;
    }

    const matchingJobType =
      (jobDetailsState.details?.jobTypes ?? fallbackJobTypes).find(
        (jobType) => jobType.id === snapshot.jobTypeId,
      ) ??
      (jobDetailsState.details?.jobTypes ?? fallbackJobTypes).find(
        (jobType) =>
          normalizeCatalogText(jobType.name) ===
          normalizeCatalogText(snapshot.jobName),
      ) ??
      null;

    setSelectedJobTypeId(matchingJobType?.id ?? snapshot.jobTypeId);
    setSelectedProblemTypeId(snapshot.problemTypeId);
    setSelectedMarketingSourceId(snapshot.marketingSourceId);
    setSelectedTagIds(snapshot.tags.map((tag) => tag.id));
    setExpandedJobDetailsSelector(null);
    setJobDetailsSearch("");
    setNewCatalogValue("");
    setJobDetailsSaveState({ status: "idle", message: null });
    setIsClosingJobDetailsSheet(false);
    setJobDetailsSheet(kind);
    setIsJobDetailsSheetVisible(false);
    window.requestAnimationFrame(() => {
      setIsJobDetailsSheetVisible(true);
    });
  }

  function closeJobDetailsSheet() {
    setIsJobDetailsSheetVisible(false);
    setIsClosingJobDetailsSheet(true);
    window.setTimeout(() => {
      setJobDetailsSheet(null);
      setIsClosingJobDetailsSheet(false);
      setIsJobDetailsSheetVisible(false);
      setJobDetailsSearch("");
      setNewCatalogValue("");
      setExpandedJobDetailsSelector(null);
    }, 260);
  }

  async function saveJobDetailsFromSheet(options?: {
    newJobTypeName?: string | null;
    newProblemName?: string | null;
    newMarketingSourceName?: string | null;
    newTagName?: string | null;
  }) {
    if (state.status !== "ready") {
      return;
    }

    const snapshot = getCurrentJobDetailsSnapshot();

    if (!snapshot) {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setJobDetailsSaveState({
        status: "error",
        message: "Job details are not configured in this browser.",
      });
      return;
    }

    const sessionResult = await getDashboardActionSession(supabase);
    const accessToken = sessionResult.ok
      ? sessionResult.response.data.session?.access_token
      : null;

    if (!accessToken) {
      setJobDetailsSaveState({
        status: "error",
        message: "Log in again before updating job details.",
      });
      return;
    }

    setJobDetailsSaveState({ status: "saving", message: null });

    const selectedJobType = (jobDetailsState.details?.jobTypes ?? fallbackJobTypes).find(
      (item) => item.id === selectedJobTypeId,
    );
    const selectedProblem = [
      ...(jobDetailsState.details?.problemTypes ?? []),
      ...getFallbackProblemItems(snapshot.jobName),
    ].find((item) => item.id === selectedProblemTypeId);

    const response = await fetch(
      `/api/service-requests/${state.request.id}/details`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobTypeId: selectedJobTypeId?.startsWith("fallback-")
            ? null
            : selectedJobTypeId,
          jobName:
            options?.newJobTypeName ??
            selectedJobType?.name ??
            snapshot.jobName,
          problemTypeId: selectedProblemTypeId?.startsWith("fallback-")
            ? null
            : selectedProblemTypeId,
          description:
            options?.newProblemName ??
            selectedProblem?.name ??
            snapshot.description,
          marketingSourceId: selectedMarketingSourceId?.startsWith("fallback-")
            ? null
            : selectedMarketingSourceId,
          tagIds: selectedTagIds.filter((id) => !id.startsWith("fallback-")),
          newJobTypeName: options?.newJobTypeName ?? null,
          newProblemName: options?.newProblemName ?? null,
          newMarketingSourceName: options?.newMarketingSourceName ?? null,
          newTagName: options?.newTagName ?? null,
          newTagCategory: "custom",
          newTagTone: "gray",
        }),
      },
    );
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      details?: JobDetailsPayload;
      message?: string;
    } | null;

    if (!response.ok || !payload?.ok || !payload.details) {
      setJobDetailsSaveState({
        status: "error",
        message: payload?.message ?? "Job details could not be saved.",
      });
      return;
    }

    applyJobDetailsPayload(payload.details);
    setJobDetailsSaveState({
      status: "success",
      message: "Job details saved.",
    });
    closeJobDetailsSheet();
  }

  function openScheduleSheet() {
    if (state.status !== "ready") {
      return;
    }

    const startDate = state.request.scheduledDate ?? getTodayInputDate();
    const startTime =
      toScheduleInputTime(state.request.scheduledWindowStartTime) || "09:00";
    const endDate = state.request.scheduledDate ?? startDate;
    const endTime =
      toScheduleInputTime(state.request.scheduledWindowEndTime) ||
      addMinutesToInputTime(startTime, 60);

    setScheduleDraft({
      startDate,
      startTime,
      endDate,
      endTime,
    });
    setScheduleSheetSaveState({ status: "idle", message: null });
    setIsClosingScheduleSheet(false);
    setIsScheduleSheetOpen(true);
    setIsScheduleSheetVisible(false);
    window.requestAnimationFrame(() => {
      setIsScheduleSheetVisible(true);
    });
  }

  function closeScheduleSheet() {
    setIsScheduleSheetVisible(false);
    setIsClosingScheduleSheet(true);
    window.setTimeout(() => {
      setIsScheduleSheetOpen(false);
      setIsClosingScheduleSheet(false);
      setIsScheduleSheetVisible(false);
    }, 300);
  }

  function openTechnicianSheet() {
    if (state.status !== "ready") {
      return;
    }

    setSelectedAssignmentTechnicianId(
      state.request.assignedTechnicianProfileId ??
        bestTechnicianMatch?.technicianProfileId ??
        technicianProfilesState.profiles[0]?.id ??
        null,
    );
    setTechnicianAssignmentSearch("");
    setTechnicianAssignmentSaveState({ status: "idle", message: null });
    setIsClosingTechnicianSheet(false);
    setIsTechnicianSheetOpen(true);
    setIsTechnicianSheetVisible(false);
    window.requestAnimationFrame(() => {
      setIsTechnicianSheetVisible(true);
    });
  }

  function closeTechnicianSheet() {
    setIsTechnicianSheetVisible(false);
    setIsClosingTechnicianSheet(true);
    window.setTimeout(() => {
      setIsTechnicianSheetOpen(false);
      setIsClosingTechnicianSheet(false);
      setIsTechnicianSheetVisible(false);
      setTechnicianAssignmentSearch("");
    }, 300);
  }

  async function saveTechnicianAssignment() {
    if (state.status !== "ready" || !selectedAssignmentTechnicianId) {
      setTechnicianAssignmentSaveState({
        status: "error",
        message: "Choose a technician first.",
      });
      return;
    }

    const currentRequest = state.request;
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setTechnicianAssignmentSaveState({
        status: "error",
        message: "Technician assignment is not available for this workspace.",
      });
      return;
    }

    const sessionResult = await getDashboardActionSession(supabase);

    if (!sessionResult.ok) {
      setTechnicianAssignmentSaveState({
        status: "error",
        message: sessionResult.message,
      });
      return;
    }

    const { data: sessionData, error: sessionError } = sessionResult.response;
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setTechnicianAssignmentSaveState({
        status: "error",
        message: "Log in again before assigning a technician.",
      });
      return;
    }

    setTechnicianAssignmentSaveState({ status: "saving", message: null });

    const response = await fetch(
      `/api/service-requests/${currentRequest.id}/appointments`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          operation: "assign_technician",
          appointmentId: currentRequest.appointmentId ?? null,
          technicianProfileId: selectedAssignmentTechnicianId,
        }),
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      appointment?: {
        id?: string;
        technician_profile_id?: string | null;
        appointment_date?: string;
        window_start_time?: string;
        window_end_time?: string;
        updated_at?: string;
      } | null;
      technician?: {
        id?: string;
        displayName?: string | null;
        businessName?: string | null;
        avatarColor?: string | null;
      };
    } | null;

    if (!response.ok || !payload?.ok || !payload.technician?.id) {
      setTechnicianAssignmentSaveState({
        status: "error",
        message:
          payload?.message ??
          "Technician assignment could not be saved.",
      });
      return;
    }

    setState((current) => {
      if (current.status !== "ready") {
        return current;
      }

      return {
        status: "ready",
        request: {
          ...current.request,
          assignedTechnicianProfileId: payload.technician?.id ?? current.request.assignedTechnicianProfileId,
          selectedTechnicianBusinessName:
            payload.technician?.displayName ??
            payload.technician?.businessName ??
            current.request.selectedTechnicianBusinessName,
          appointmentId: payload.appointment?.id ?? current.request.appointmentId,
          scheduledDate:
            payload.appointment?.appointment_date ?? current.request.scheduledDate,
          scheduledWindowStartTime:
            payload.appointment?.window_start_time ??
            current.request.scheduledWindowStartTime,
          scheduledWindowEndTime:
            payload.appointment?.window_end_time ??
            current.request.scheduledWindowEndTime,
          updatedAt: payload.appointment?.updated_at ?? current.request.updatedAt,
        },
        error: null,
      };
    });

    setTechnicianAssignmentSaveState({
      status: "success",
      message: payload.appointment?.id
        ? "Technician assigned and appointment updated."
        : "Technician assigned.",
    });
    closeTechnicianSheet();
  }

  function updateScheduleDraft(nextDraft: Partial<ScheduleDraftState>) {
    setScheduleDraft((current) => {
      const draft = { ...current, ...nextDraft };
      const startValue = getScheduleDateTimeValue(
        draft.startDate,
        draft.startTime,
      );
      const endValue = getScheduleDateTimeValue(draft.endDate, draft.endTime);

      if (
        Number.isFinite(startValue) &&
        Number.isFinite(endValue) &&
        endValue <= startValue
      ) {
        return {
          ...draft,
          endDate: draft.startDate,
          endTime: addMinutesToInputTime(draft.startTime, 60),
        };
      }

      return draft;
    });
  }

  async function saveScheduleFromSheet() {
    if (state.status !== "ready") {
      return;
    }

    const currentRequest = state.request;
    const startValue = getScheduleDateTimeValue(
      scheduleDraft.startDate,
      scheduleDraft.startTime,
    );
    const endValue = getScheduleDateTimeValue(
      scheduleDraft.endDate,
      scheduleDraft.endTime,
    );

    if (
      !scheduleDraft.startDate ||
      !scheduleDraft.startTime ||
      !scheduleDraft.endDate ||
      !scheduleDraft.endTime ||
      !Number.isFinite(startValue) ||
      !Number.isFinite(endValue) ||
      endValue <= startValue
    ) {
      setScheduleSheetSaveState({
        status: "error",
        message: "Choose a valid start and end window.",
      });
      return;
    }

    if (scheduleDraft.endDate !== scheduleDraft.startDate) {
      setScheduleSheetSaveState({
        status: "error",
        message:
          "This scheduler supports same-day appointment windows only right now.",
      });
      return;
    }

    const technicianProfileId =
      currentRequest.assignedTechnicianProfileId ??
      bestTechnicianMatch?.technicianProfileId ??
      null;

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setScheduleSheetSaveState({
        status: "error",
        message: "Scheduling is not available for this workspace.",
      });
      return;
    }

    const sessionResult = await getDashboardActionSession(supabase);

    if (!sessionResult.ok) {
      setScheduleSheetSaveState({
        status: "error",
        message: sessionResult.message,
      });
      return;
    }

    const { data: sessionData, error: sessionError } = sessionResult.response;
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setScheduleSheetSaveState({
        status: "error",
        message: "Log in again before updating the appointment.",
      });
      return;
    }

    setScheduleSheetSaveState({ status: "saving", message: null });
    const response = await fetch(
      `/api/service-requests/${currentRequest.id}/appointments`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          appointmentId: currentRequest.appointmentId ?? null,
          technicianProfileId,
          appointmentDate: scheduleDraft.startDate,
          windowStartTime: normalizeScheduleInputTime(scheduleDraft.startTime),
          windowEndTime: normalizeScheduleInputTime(scheduleDraft.endTime),
          dispatcherSnapshotId: dispatcherSnapshotState.snapshot?.id ?? null,
        }),
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      operation?: "created" | "updated";
      message?: string;
      appointment?: {
        id?: string;
        technician_profile_id?: string | null;
        appointment_date?: string;
        window_start_time?: string;
        window_end_time?: string;
        updated_at?: string;
      };
      calendarSync?: {
        provider?: "google" | null;
        status?: "not_configured" | "pending" | "synced" | "failed" | "canceled";
        eventId?: string | null;
        error?: string | null;
        migrationReady?: boolean;
      } | null;
    } | null;

    if (!response.ok || !payload?.ok || !payload.appointment?.id) {
      setScheduleSheetSaveState({
        status: "error",
        message:
          payload?.message ??
          "We could not update this appointment yet.",
      });
      return;
    }

    setState((current) => {
      if (current.status !== "ready") {
        return current;
      }

      return {
        status: "ready",
        request: {
          ...current.request,
          status:
            payload.operation === "created" ? "scheduled" : current.request.status,
          assignedTechnicianProfileId:
            payload.appointment?.technician_profile_id ??
            current.request.assignedTechnicianProfileId ??
            technicianProfileId,
          appointmentId: payload.appointment?.id ?? current.request.appointmentId,
          scheduledDate:
            payload.appointment?.appointment_date ?? scheduleDraft.startDate,
          scheduledWindowStartTime:
            payload.appointment?.window_start_time ??
            normalizeScheduleInputTime(scheduleDraft.startTime),
          scheduledWindowEndTime:
            payload.appointment?.window_end_time ??
            normalizeScheduleInputTime(scheduleDraft.endTime),
          updatedAt: payload.appointment?.updated_at ?? current.request.updatedAt,
        },
        error: null,
      };
    });
    if (payload.operation === "created") {
      setSelectedStatus("scheduled");
    }
    setCalendarSyncSummary(
      payload.calendarSync?.status
        ? {
            provider: payload.calendarSync.provider ?? null,
            status: payload.calendarSync.status,
            eventId: payload.calendarSync.eventId ?? null,
            error: payload.calendarSync.error ?? null,
            migrationReady: payload.calendarSync.migrationReady ?? false,
          }
        : null,
    );
    setScheduleSheetSaveState({
      status: "success",
      message:
        payload.operation === "created"
          ? "Appointment created."
          : "Schedule updated.",
    });
    closeScheduleSheet();
  }

  if (state.status === "loading") {
    return (
      <section className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-6 text-[#334155]">
        Loading job...
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-6">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-800">
          Job unavailable
        </p>
        <h1 className="mt-3 text-2xl font-bold text-[#0F172A]">Unable to load this job.</h1>
        <p className="mt-3 leading-7 text-amber-800">{state.error}</p>
        <Link className="mt-5 inline-flex text-sm font-bold text-[#0F6BFF]" href={returnTo}>
          Back to jobs
        </Link>
      </section>
    );
  }

  if (state.status === "empty") {
    return (
      <section className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-6">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#0F6BFF]">
          Job detail
        </p>
        <h1 className="mt-3 text-2xl font-bold text-[#0F172A]">Job not found.</h1>
        <Link className="mt-5 inline-flex text-sm font-bold text-[#0F6BFF]" href={returnTo}>
          Back to jobs
        </Link>
      </section>
    );
  }

  const request = state.request;
  const timelineItems = [
    ...notesState.notes.map((note) => ({
      id: `note-${note.id}`,
      body: note.body,
      createdAt: note.createdAt,
      label: noteTypeLabels[note.noteType],
    })),
    ...photosState.photos.map((photo) => ({
      id: `photo-${photo.id}`,
      body: photo.originalFilename
        ? `${photo.originalFilename} attached to the service request.`
        : "Photo attached to the service request.",
      createdAt: photo.createdAt,
      label: photoTypeLabels[photo.photoType],
    })),
  ].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
  const selectedCatalogItems = catalogState.items.filter((item) =>
    selectedCatalogItemIds.includes(item.id),
  );
  const activeDraftEstimate =
    estimatesState.estimates.find(
      (estimate) => estimate.estimateStatus === "draft",
    ) ?? null;
  const editingEstimate =
    estimatesState.estimates.find((estimate) => estimate.id === editingEstimateId) ??
    null;
  const manualEstimate =
    manualEstimateId === null
      ? null
      : estimatesState.estimates.find((estimate) => estimate.id === manualEstimateId) ??
        null;
  const invoicesByEstimateId = new Map(
    invoicesState.invoices.map((invoice) => [invoice.estimateId, invoice]),
  );
  const viewingInvoice =
    invoicesState.invoices.find((invoice) => invoice.id === viewingInvoiceId) ??
    null;
  const currentEstimates = estimatesState.estimates.filter(
    (estimate) =>
      estimate.estimateStatus === "draft" ||
      estimate.estimateStatus === "sent" ||
      (estimate.estimateStatus === "approved" &&
        !invoicesByEstimateId.has(estimate.id)),
  );
  const estimateHistory = estimatesState.estimates.filter(
    (estimate) => !currentEstimates.some((current) => current.id === estimate.id),
  );
  const visibleEstimateHistory = showEstimateHistory
    ? estimateHistory
    : estimateHistory.filter((estimate) => estimate.estimateStatus !== "void");
  const hiddenEstimateHistoryCount =
    estimateHistory.length - visibleEstimateHistory.length;
  const currentInvoices = invoicesState.invoices.filter(
    (invoice) =>
      invoice.invoiceStatus === "draft" || invoice.invoiceStatus === "sent",
  );
  const invoiceHistory = invoicesState.invoices.filter(
    (invoice) => !currentInvoices.some((current) => current.id === invoice.id),
  );
  const visibleInvoiceHistory = showInvoiceHistory
    ? invoiceHistory
    : invoiceHistory.filter((invoice) => invoice.invoiceStatus !== "void");
  const hiddenInvoiceHistoryCount =
    invoiceHistory.length - visibleInvoiceHistory.length;
  const financeApprovedEstimates = estimatesState.estimates.filter(
    (estimate) =>
      estimate.estimateStatus === "approved" && estimate.archivedAt === null,
  );
  const financeApprovedTotal = financeApprovedEstimates.reduce(
    (total, estimate) => total + estimate.total,
    0,
  );
  const financePaidInvoices = invoicesState.invoices.filter(
    (invoice) => invoice.invoiceStatus === "paid" && invoice.voidedAt === null,
  );
  const financePaidTotal = financePaidInvoices.reduce(
    (total, invoice) => total + invoice.total,
    0,
  );
  const financeOpenInvoices = invoicesState.invoices.filter(
    (invoice) =>
      invoice.voidedAt === null &&
      (invoice.invoiceStatus === "draft" || invoice.invoiceStatus === "sent"),
  );
  const financeBalanceDueTotal = Math.max(
    0,
    financeOpenInvoices.reduce((total, invoice) => total + invoice.total, 0),
  );
  const financeEstimates = [...estimatesState.estimates].sort((left, right) => {
    const getStatusPriority = (
      status: DashboardServiceRequestEstimate["estimateStatus"],
    ) =>
      status === "approved"
        ? 0
        : status === "draft"
          ? 1
          : status === "sent"
            ? 2
            : status === "declined"
              ? 3
              : 4;
    const priorityDelta =
      getStatusPriority(left.estimateStatus) -
      getStatusPriority(right.estimateStatus);

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return (
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
  });
  const financePrimaryInvoice =
    currentInvoices[0] ??
    [...invoicesState.invoices].sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )[0] ??
    null;
  const addressAutocomplete = getAddressAutocompleteAdapter();
  const fullAddress = getRequestFullAddress(request);
  const hasRoutableAddress = fullAddress.length > 0;
  const hasCoordinates =
    request.latitude !== null && request.longitude !== null;
  const googleMapsUrl = buildGoogleMapsUrl({
    fullAddress,
    latitude: request.latitude,
    longitude: request.longitude,
  });
  const propertyPreviewMapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        fullAddress,
      )}`
    : googleMapsUrl;
  const appleMapsUrl = buildAppleMapsUrl({
    fullAddress,
    latitude: request.latitude,
    longitude: request.longitude,
  });
  const schedulingIntake = buildSchedulingIntakeFromServiceRequest(request);
  const normalizedSchedulingIntake = normalizeSchedulingIntake(schedulingIntake);
  const schedulingRequestedDate =
    normalizedSchedulingIntake.preferences.requestedDate ?? "2026-06-01";
  const technicianMatching = matchTechnicianProfilesForScheduling(
    technicianProfilesState.profiles,
    normalizedSchedulingIntake,
  );
  const bestTechnicianMatch = technicianMatching.bestMatch;
  const backupTechnicianMatches = technicianMatching.backupMatches;
  const availabilityAwareTechnicians = applyAvailabilityRulesToTechnicianInputs(
    technicianMatching.matches.map((match) => match.schedulingInput),
    technicianAvailabilityRulesState.rules,
    schedulingRequestedDate,
  );
  const bestTechnicianAvailability = bestTechnicianMatch
    ? summarizeTechnicianAvailability(
        technicianAvailabilityRulesState.rules,
        bestTechnicianMatch.technicianProfileId,
        schedulingRequestedDate,
      )
    : null;
  const schedulingPreview = runSchedulingOrchestrator({
    intake: schedulingIntake,
    companyConfig: getStaticDispatcherCompanyConfig(),
    technicians: availabilityAwareTechnicians,
    now: new Date("2026-06-01T15:00:00.000Z"),
    maxRecommendations: 3,
    maxSlotsPerTechnician: 4,
    maxCandidates: 8,
    companyDisplayName: "Refrigerator Houston Repair",
    showTechnicianDisplayName: false,
  });
  const schedulingBestRecommendation =
    schedulingPreview.recommendationResponse?.bestRecommendation ?? null;
  const schedulingBackupRecommendations =
    schedulingPreview.recommendationResponse?.backupRecommendations ?? [];
  const canBookRecommendedAppointment =
    Boolean(bestTechnicianMatch) &&
    Boolean(schedulingBestRecommendation) &&
    Boolean(bestTechnicianAvailability?.hasAvailability) &&
    appointmentBookingState.status !== "booking" &&
    !request.appointmentId;
  const scheduledWindowLabel = formatScheduledWindow(
    request.scheduledDate,
    request.scheduledWindowStartTime,
    request.scheduledWindowEndTime,
  );
  const jobNumber = request.id.slice(0, 8).toUpperCase();
  const statusLabel = formatServiceRequestSource(request.status);
  const latestEstimateStatusSignal = estimatesState.estimates.find(
    (estimate) =>
      estimate.estimateStatus === "approved" ||
      estimate.estimateStatus === "sent" ||
      estimate.estimateStatus === "declined",
  );
  const expectedStatusFromEstimate =
    latestEstimateStatusSignal?.estimateStatus === "approved"
      ? "estimate_approved"
      : latestEstimateStatusSignal?.estimateStatus === "sent"
        ? "estimate_sent"
        : latestEstimateStatusSignal?.estimateStatus === "declined"
          ? "waiting_customer"
          : null;
  const estimateStatusMismatchMessage =
    latestEstimateStatusSignal &&
    expectedStatusFromEstimate &&
    request.status !== expectedStatusFromEstimate
      ? `${formatServiceRequestSource(
          latestEstimateStatusSignal.estimateStatus,
        )} estimate ${latestEstimateStatusSignal.estimateNumber}, but job status was manually changed to ${statusLabel}.`
      : null;
  const assignedTechnicianProfile =
    technicianProfilesState.profiles.find(
      (profile) => profile.id === request.assignedTechnicianProfileId,
    ) ?? null;
  const assignedTechnicianLabel =
    assignedTechnicianProfile
      ? getTechnicianProfileDisplayName(assignedTechnicianProfile)
      : request.selectedTechnicianBusinessName ??
        (request.assignedTechnicianProfileId
          ? "Assigned technician"
          : "Not assigned");
  const assignedTechnicianInitials = assignedTechnicianProfile
    ? getTechnicianProfileInitials(assignedTechnicianProfile)
    : "T";
  const assignedTechnicianAvatarColor =
    assignedTechnicianProfile?.avatar_color ?? "#2563EB";
  const assignedTechnicianMeta = request.assignedTechnicianProfileId
    ? request.appointmentId
      ? "Assigned to appointment"
      : "Assigned, not scheduled"
    : "Tap to assign";
  const mobileAssignedTechnicianLabel = request.assignedTechnicianProfileId
    ? assignedTechnicianLabel
    : "Not assigned";
  const assignmentJobZip = normalizeAssignmentZip(request.zipCode);
  const assignmentHasScheduledWindow = Boolean(
    request.scheduledDate &&
      request.scheduledWindowStartTime &&
      request.scheduledWindowEndTime,
  );
  const assignmentDayOfWeek = request.scheduledDate
    ? getAssignmentDayOfWeek(request.scheduledDate)
    : null;
  const technicianAssignmentCandidates = technicianProfilesState.profiles
    .map<TechnicianAssignmentCandidate>((profile) => {
      const displayName = getTechnicianProfileDisplayName(profile);
      const technicianZips = profile.service_zip_codes.map(normalizeAssignmentZip);
      const coversZip =
        !assignmentJobZip || technicianZips.includes(assignmentJobZip);
      const isActive =
        profile.technician_status === "verified" &&
        profile.marketplace_enabled &&
        !profile.archived_at &&
        !profile.rejected_at &&
        !profile.suspended_at;
      let availabilityLabel = request.appointmentId
        ? "Available"
        : "Assignment only";
      let isSelectable = isActive && coversZip;

      if (!isActive) {
        availabilityLabel = "Inactive";
        isSelectable = false;
      } else if (!coversZip) {
        availabilityLabel = "Outside service area";
        isSelectable = false;
      } else if (
        assignmentHasScheduledWindow &&
        request.scheduledDate &&
        request.scheduledWindowStartTime &&
        request.scheduledWindowEndTime
      ) {
        const scheduledWindowStartTime = request.scheduledWindowStartTime;
        const scheduledWindowEndTime = request.scheduledWindowEndTime;
        const profileRules = technicianAvailabilityRulesState.rules.filter(
          (rule) => rule.technicianProfileId === profile.id && rule.isAvailable,
        );
        const rulesForDay =
          assignmentDayOfWeek === null
            ? []
            : profileRules.filter(
                (rule) => rule.dayOfWeek === assignmentDayOfWeek,
              );

        if (profileRules.length > 0) {
          const coversWindow = rulesForDay.some((rule) =>
            doesRuleCoverWindow(
              rule,
              scheduledWindowStartTime,
              scheduledWindowEndTime,
            ),
          );

          if (!coversWindow) {
            availabilityLabel =
              rulesForDay.length > 0
                ? "Not working this window"
                : "Not working this day";
            isSelectable = false;
          }
        } else {
          const startMinutes = getAssignmentMinutes(scheduledWindowStartTime);
          const endMinutes = getAssignmentMinutes(scheduledWindowEndTime);
          const isDefaultWorkingDay =
            assignmentDayOfWeek !== null &&
            assignmentDayOfWeek >= 1 &&
            assignmentDayOfWeek <= 5;
          const isDefaultWorkingWindow =
            startMinutes !== null &&
            endMinutes !== null &&
            startMinutes >= 8 * 60 &&
            endMinutes <= 17 * 60;

          if (!isDefaultWorkingDay || !isDefaultWorkingWindow) {
            availabilityLabel = "Not working this day";
            isSelectable = false;
          }
        }
      }

      const isAssigned = profile.id === request.assignedTechnicianProfileId;

      return {
        profile,
        displayName,
        businessName: profile.business_name?.trim() || null,
        initials: getTechnicianProfileInitials(profile),
        availabilityLabel: isAssigned ? "Current assignment" : availabilityLabel,
        eligibilityLabel: coversZip ? "ZIP covered" : "Outside service area",
        isAssigned,
        isSelectable,
        sortRank: isAssigned ? 0 : isSelectable ? 1 : coversZip ? 2 : 3,
      };
    })
    .sort((first, second) => {
      if (first.sortRank !== second.sortRank) {
        return first.sortRank - second.sortRank;
      }

      return first.displayName.localeCompare(second.displayName);
    });
  const technicianAssignmentSearchTerm = technicianAssignmentSearch
    .trim()
    .toLowerCase();
  const filteredTechnicianAssignmentCandidates =
    technicianAssignmentSearchTerm.length === 0
      ? technicianAssignmentCandidates
      : technicianAssignmentCandidates.filter((candidate) => {
          const profile = candidate.profile;
          const haystack = [
            candidate.displayName,
            candidate.businessName,
            profile.primary_city,
            profile.primary_state,
            ...profile.service_zip_codes,
            ...profile.service_cities,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(technicianAssignmentSearchTerm);
        });
  const addressSummary = request.streetAddress
    ? fullAddress
    : `${request.city ? `${request.city}, ` : ""}${request.state} ${request.zipCode}`;
  const propertyPreview = propertyPreviewState.property;
  const propertyPreviewPhotoUrl = propertyPreview?.photo ?? null;
  const hasPropertyPreviewData = Boolean(
    propertyPreview &&
      (propertyPreview.photo ||
        propertyPreview.mapImage ||
        propertyPreview.zestimate !== null ||
        propertyPreview.livingArea !== null ||
        propertyPreview.yearBuilt !== null),
  );
  const customerPrimaryAddress =
    customerPrimaryAddressState.status === "ready"
      ? customerPrimaryAddressState.address
      : null;
  const showSaveServiceAddressAsCustomerPrimary =
    customerPrimaryAddressState.status === "ready" &&
    shouldOfferSaveServiceAddressAsCustomerPrimary(request, customerPrimaryAddress);
  const quickActions = [
    {
      label: request.status === "diagnosed" ? "STARTED" : "START",
      variant: "start",
      disabled:
        request.status === "diagnosed" ||
        statusUpdateState.status === "saving",
      onClick: () => void updateStatus("diagnosed"),
    },
    {
      label: "ETA",
      variant: "eta",
      disabled: false,
      onClick: () => setActiveJobTab("appointment"),
    },
    {
      label: "PAY",
      variant: "pay",
      disabled: false,
      onClick: () => setActiveJobTab("estimate"),
    },
    {
      label: "NOTE",
      variant: "note",
      disabled: false,
      onClick: () => setActiveJobTab("notes"),
    },
    {
      label: "ATTACH",
      variant: "attach",
      disabled: false,
      onClick: () => setActiveJobTab("photos"),
    },
  ];
  const callCustomerHref = getPhoneHref(request.customerPhone, "tel");
  const textCustomerHref = getPhoneHref(request.customerPhone, "sms");
  const customerProfileHref = request.customerId
    ? `/dashboard/customers/${request.customerId}?returnTo=${encodeURIComponent(
        `/dashboard/leads/${request.id}`,
      )}`
    : null;
  const estimateCustomerProfileHref = request.customerId
    ? `/dashboard/customers/${request.customerId}?returnTo=${encodeURIComponent(
        manualEstimateId
          ? getEstimateWorkspaceUrl(manualEstimateId)
          : getFinanceWorkspaceUrl(),
      )}`
    : null;
  const clientInitials = getClientInitials(request.customerName);
  const clientPhoneDisplay = formatClientPhoneDisplay(request.customerPhone);
  const clientStreetLine = stripUsCountry(
    [request.streetAddress, request.unit].filter(Boolean).join(", ") ||
      request.fullAddress ||
      addressSummary,
  );
  const clientCityLine = [
    request.city,
    [request.state, request.zipCode].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const clientDistanceLabel = clientDistance.label;
  const clientMapAddressLabel = stripUsCountry(fullAddress || addressSummary);
  const scheduledDateLabel = request.scheduledDate ?? "Not scheduled";
  const scheduledTimeLabel =
    request.scheduledWindowStartTime && request.scheduledWindowEndTime
      ? `${request.scheduledWindowStartTime.slice(0, 5)}-${request.scheduledWindowEndTime.slice(0, 5)}`
      : request.preferredTimeWindow ?? "Window not set";
  const mobileScheduleDateLabel = formatScheduleDateDisplay(request.scheduledDate);
  const mobileScheduleTimeLabel =
    request.scheduledWindowStartTime && request.scheduledWindowEndTime
      ? `${formatScheduleTimeDisplay(request.scheduledWindowStartTime)} – ${formatScheduleTimeDisplay(
          request.scheduledWindowEndTime,
        )}`
      : request.preferredTimeWindow ?? "Not scheduled";
  const shortLocation = [
    request.city,
    request.zipCode,
  ].filter(Boolean).join(" ");
  const recentPhotos = photosState.photos
    .filter((photo) => Boolean(photo.signedUrl))
    .slice(0, 3);
  const attachmentPreviewPhotos = photosState.photos.slice(0, 3);
  const attachmentOverflowCount = Math.max(photosState.photos.length - 3, 0);
  const attachmentCountLabel =
    photosState.status === "loading"
      ? "Loading..."
      : photosState.photos.length === 0
        ? "No files"
        : `${photosState.photos.length} ${
            photosState.photos.length === 1 ? "photo" : "photos"
          }`;
  const activeAttachment =
    activeAttachmentIndex === null
      ? null
      : photosState.photos[activeAttachmentIndex] ?? null;
  const activeAttachmentAssetBrand = readAssetProcessingIdentityField(
    activeAttachment?.assetProcessingResult,
    "brand",
  );
  const activeAttachmentAssetModel = readAssetProcessingIdentityField(
    activeAttachment?.assetProcessingResult,
    "modelNumber",
  );
  const activeAttachmentAssetSerial = readAssetProcessingIdentityField(
    activeAttachment?.assetProcessingResult,
    "serialNumber",
  );
  const activeAttachmentIdentifiedAssetId =
    activeAttachment?.linkedCustomerApplianceId ??
    (activeAttachment?.assetProcessingStatus === "processed"
      ? request.customerApplianceId
      : null);
  const activeAttachmentIsIdentifiedLabel =
    activeAttachment?.assetProcessingStatus === "processed" &&
    Boolean(activeAttachmentIdentifiedAssetId);
  const activeAttachmentAssetHref =
    request.customerId && activeAttachmentIdentifiedAssetId
      ? `/dashboard/customers/${request.customerId}?tab=assets&asset=${activeAttachmentIdentifiedAssetId}&returnTo=${encodeURIComponent(
          `/dashboard/leads/${request.id}?tab=overview`,
        )}`
      : null;
  const jobDetailsSnapshot =
    jobDetailsState.details?.job ?? {
      jobTypeId: request.jobTypeId,
      jobName:
        request.jobName ??
        deriveJobNameFromAppliance(request.applianceType),
      problemTypeId: request.problemTypeId,
      description: request.issueDescription,
      marketingSourceId: request.marketingSourceId,
      marketingSource: null,
      technicalRequestSource: request.requestSource,
      tags: [],
    };
  const jobSummaryTitle = jobDetailsSnapshot.jobName || "Service Job";
  const jobSummaryComplaint =
    jobDetailsSnapshot.description.trim() || "No customer complaint recorded.";
  const availableJobTypes =
    jobDetailsState.details?.jobTypes && jobDetailsState.details.jobTypes.length > 0
      ? jobDetailsState.details.jobTypes
      : fallbackJobTypes;
  const activeJobType =
    availableJobTypes.find((jobType) => jobType.id === selectedJobTypeId) ??
    availableJobTypes.find((jobType) => jobType.id === jobDetailsSnapshot.jobTypeId) ??
    availableJobTypes.find(
      (jobType) =>
        normalizeCatalogText(jobType.name) ===
        normalizeCatalogText(jobDetailsSnapshot.jobName),
    ) ??
    null;
  const availableProblems = [
    ...(jobDetailsState.details?.problemTypes ?? []).filter((problem) => {
      if (!activeJobType) {
        return false;
      }

      return (
        !problem.jobTypeId ||
        problem.jobTypeId === activeJobType.id ||
        (problem.applianceCategory &&
          activeJobType.applianceCategory &&
          normalizeCatalogText(problem.applianceCategory) ===
            normalizeCatalogText(activeJobType.applianceCategory))
      );
    }),
    ...(activeJobType && !jobDetailsState.details?.problemTypes?.length
      ? getFallbackProblemItems(activeJobType.name)
      : []),
  ];
  const availableMarketingSources =
    jobDetailsState.details?.marketingSources &&
    jobDetailsState.details.marketingSources.length > 0
      ? jobDetailsState.details.marketingSources
      : fallbackMarketingSources;
  const selectedMarketingSource =
    availableMarketingSources.find((source) => source.id === selectedMarketingSourceId) ??
    jobDetailsSnapshot.marketingSource ??
    null;
  const availableTags = jobDetailsState.details?.tags ?? [];
  const visibleTags = jobDetailsSnapshot.tags.slice(0, 2);
  const hiddenTagsCount = Math.max(0, jobDetailsSnapshot.tags.length - visibleTags.length);
  const normalizedJobDetailsSearch = normalizeCatalogText(jobDetailsSearch);
  const filteredJobTypes = availableJobTypes.filter((item) =>
    normalizeCatalogText(item.name).includes(normalizedJobDetailsSearch),
  );
  const filteredProblems = availableProblems.filter((item) =>
    normalizeCatalogText(item.name).includes(normalizedJobDetailsSearch),
  );
  const descriptionMatchesSelectedJobType =
    !activeJobType ||
    !jobDetailsSnapshot.description.trim() ||
    availableProblems.some(
      (problem) =>
        normalizeCatalogText(problem.name) ===
        normalizeCatalogText(jobDetailsSnapshot.description),
    );
  const filteredMarketingSources = availableMarketingSources.filter((item) =>
    normalizeCatalogText(item.name).includes(normalizedJobDetailsSearch),
  );
  const filteredTags = availableTags.filter((item) =>
    normalizeCatalogText(item.name).includes(normalizedJobDetailsSearch),
  );
  const latestDiagnosticNote =
    notesState.notes.find((note) => note.noteType === "diagnostic") ?? null;
  const latestPartsNote =
    notesState.notes.find((note) => note.noteType === "parts_note") ?? null;
  const latestEstimate =
    [...estimatesState.estimates].sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    )[0] ?? null;
  const latestInvoice =
    [...invoicesState.invoices].sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    )[0] ?? null;
  const workflowActions = [
    {
      label: "Arrived",
      status: "diagnosed",
      helper: "Start on-site workflow",
      tone: "blue",
    },
    {
      label: "Diagnosing",
      status: "diagnosed",
      helper: "Record findings",
      tone: "purple",
    },
    {
      label: "Estimate Sent",
      status: "estimate_sent",
      helper: "Customer review",
      tone: "purple",
    },
    {
      label: "Waiting Approval",
      status: "waiting_customer",
      helper: "Customer decision",
      tone: "amber",
    },
    {
      label: "Parts Ordered",
      status: "parts_ordered",
      helper: "Return may be needed",
      tone: "amber",
    },
    {
      label: "Parts Received",
      status: "parts_received",
      helper: "Ready to schedule",
      tone: "green",
    },
    {
      label: "Return Visit",
      status: "return_visit_scheduled",
      helper: "Follow-up booked",
      tone: "blue",
    },
    {
      label: "Completed",
      status: "completed",
      helper: "Repair complete",
      tone: "green",
    },
    {
      label: "Closed",
      status: "closed",
      helper: "No more action",
      tone: "slate",
    },
  ] as const satisfies readonly {
    label: string;
    status: ServiceRequestCrmStatus;
    helper: string;
    tone: WorkflowActionTone;
  }[];
  const operationalNextStep =
    !request.appointmentId && request.status !== "completed" && request.status !== "closed"
      ? {
          title: "Book the appointment",
          body: "Choose a technician and window before dispatching this job.",
          actionLabel: "Open Appointment",
          tab: "appointment" as JobWorkspaceTab,
        }
      : request.status === "scheduled"
        ? {
            title: "Arrive and diagnose",
            body: "Confirm access, inspect the appliance, and record technician findings.",
            actionLabel: "Mark Diagnosing",
            status: "diagnosed" as ServiceRequestCrmStatus,
          }
        : !latestDiagnosticNote && request.status !== "completed" && request.status !== "closed"
          ? {
              title: "Record findings",
              body: "Add the diagnosis so Repair Intelligence, estimates, and history stay useful.",
              actionLabel: "Add Findings",
              tab: "overview" as JobWorkspaceTab,
            }
          : !latestEstimate && request.status !== "completed" && request.status !== "closed"
            ? {
                title: "Create the estimate",
                body: "Generate or build the repair estimate from the diagnosis and send it to the customer.",
                actionLabel: "Open Estimate",
                tab: "estimate" as JobWorkspaceTab,
              }
            : latestEstimate?.estimateStatus === "draft"
              ? {
                  title: "Send the estimate",
                  body: `${latestEstimate.estimateNumber} is still a draft and needs customer review.`,
                  actionLabel: "Open Estimate",
                  tab: "estimate" as JobWorkspaceTab,
                }
              : request.status === "parts_needed"
                ? {
                    title: "Order required parts",
                    body: "Move the job to Parts Ordered when the order is placed.",
                    actionLabel: "Mark Parts Ordered",
                    status: "parts_ordered" as ServiceRequestCrmStatus,
                  }
                : request.status === "parts_received"
                  ? {
                      title: "Schedule return visit",
                      body: "Parts are ready. Set the return visit or update the appointment.",
                      actionLabel: "Return Visit",
                      status:
                        "return_visit_scheduled" as ServiceRequestCrmStatus,
                    }
                  : latestInvoice?.invoiceStatus === "paid" ||
                      request.status === "completed" ||
                      request.status === "closed"
                    ? {
                        title: "Close out the job",
                        body: "Verify photos, notes, invoice status, and warranty details before closing.",
                        actionLabel: "Close Job",
                        status: "closed" as ServiceRequestCrmStatus,
                      }
                    : {
                        title: "Continue the repair workflow",
                        body: "Use the workflow actions below to keep job status, notes, estimates, parts, and invoices current.",
                        actionLabel: "Review Timeline",
                        tab: "timeline" as JobWorkspaceTab,
                      };
  const partsWorkflowLabel =
    request.status === "parts_needed"
      ? "Parts required"
      : request.status === "parts_ordered"
        ? "Parts ordered"
        : request.status === "parts_received"
          ? "Parts received"
          : request.status === "return_visit_scheduled"
            ? "Return visit scheduled"
            : "No active parts hold";
  const proposalCustomEstimateLines = customEstimateLines.filter(
    (line) => line.lineType !== "warranty",
  );
  const customerVisibleCustomEstimateLines = customEstimateLines.filter(
    (line) => line.lineType === "warranty" || !hiddenProposalLineIds.includes(line.id),
  );
  const estimateCalculation = calculateRepairProposalTotals({
    lines: [
      ...selectedCatalogItems.map((item) => ({
        lineType: "labor",
        quantity: 1,
        unitPrice: item.customerPrice,
        unitCost: item.technicianCost ?? 0,
        taxable: item.taxable,
      })),
      ...customerVisibleCustomEstimateLines.map((line) => ({
        lineType: line.lineType,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unitCost: line.unitCost,
        taxable: line.taxable,
      })),
    ],
    discountType: estimateDiscountType,
    discountValue: Number(estimateDiscountValue),
    taxRate: Number(estimateTaxRate),
  });
  const estimateSubtotal = estimateCalculation.subtotal;
  const parsedDiscountValue = estimateCalculation.discountValue;
  const estimateDiscountAmount = estimateCalculation.discountAmount;
  const estimateTaxableSubtotal = estimateCalculation.taxableAmount;
  const parsedTaxRate = estimateCalculation.taxRate;
  const estimateTaxTotal = estimateCalculation.tax;
  const estimateGrandTotal = estimateCalculation.total;
  const estimateInternalCostTotal = estimateCalculation.internalCostTotal;
  const estimateMargin = estimateCalculation.grossProfit;
  const estimateMarginPercent = estimateCalculation.marginPercent;
  const visibleCustomEstimateLines = proposalCustomEstimateLines.filter(
    (line) => !hiddenProposalLineIds.includes(line.id),
  );
  const editingProposalLine =
    editingProposalLineId !== null
      ? proposalCustomEstimateLines.find((line) => line.id === editingProposalLineId) ??
        null
      : null;
  const laborProposalLines = visibleCustomEstimateLines.filter(
    (line) => line.lineType === "labor",
  );
  const partProposalLines = visibleCustomEstimateLines.filter(
    (line) => line.lineType === "part",
  );
  const materialProposalLines = visibleCustomEstimateLines.filter(
    (line) => line.lineType === "material",
  );
  const feeProposalLines = visibleCustomEstimateLines.filter(
    (line) => line.lineType === "custom",
  );
  const warrantyEstimateLines = customEstimateLines.filter(
    (line) => line.lineType === "warranty",
  );
  const warrantyFooterText =
    warrantyEstimateLines
      .map((line) => line.notes || line.customerName)
      .filter((line) => line.trim().length > 0)
      .join("\n") ||
    estimateDraftAgentResult?.warrantyText ||
    "90 days labor and installed parts unless otherwise specified on the estimate.";
  const selectedEstimateLineCount =
    selectedCatalogItems.length + customerVisibleCustomEstimateLines.length;
  const estimatePreviewTotal = estimateGrandTotal;
  const hasEstimateSelection = selectedEstimateLineCount > 0;
  const shouldShowRepairProposalBuilder =
    isRepairProposalBuilderOpen ||
    hasEstimateSelection ||
    Boolean(estimateDraftAgentResult);
  const proposalRepairSolution =
    estimateDraftAgentResult?.title?.trim() ||
    visibleCustomEstimateLines[0]?.customerName ||
    "Repair proposal";
  const proposalCustomerDescription =
    estimateDraftAgentResult?.customerDescription?.trim() ||
    estimateRepairPlanSummary?.understoodSummary ||
    "Review the confirmed repair scope, pricing, warranty, and included work before sending.";
  const proposalWarnings = [
    ...(estimateRepairPlanSummary?.missingInformation ?? []),
    ...visibleCustomEstimateLines
      .filter((line) => line.unitPrice <= 0)
      .map((line) => `${line.customerName || "Line item"} needs customer price.`),
  ].slice(0, 6);
  const proposalBlockingErrors = [
    proposalRepairSolution.trim().length === 0
      ? "Repair Solution is required before sending."
      : null,
    proposalCustomerDescription.trim().length === 0 &&
    visibleCustomEstimateLines.every(
      (line) =>
        !line.customerName.trim() && !(line.publicDescription ?? "").trim(),
    )
      ? "Add customer-facing proposal content before sending."
      : null,
    !hasEstimateSelection ? "Add at least one proposal line." : null,
    visibleCustomEstimateLines.some((line) => !line.customerName.trim())
      ? "Every line needs a customer-facing title."
      : null,
    visibleCustomEstimateLines.some((line) => line.quantity <= 0)
      ? "Every line needs a valid quantity."
      : null,
    visibleCustomEstimateLines.some((line) => line.unitPrice <= 0)
      ? "Every customer-facing line needs a customer price before sending."
      : null,
  ].filter((error): error is string => Boolean(error));
  const proposalSendBlockers = [
    ...proposalBlockingErrors,
    ...proposalWarnings,
  ];
  const activeDraftRequiresIntent =
    Boolean(activeDraftEstimate) &&
    !editingEstimateId &&
    !allowNewDraftWithActiveDraft;
  const canSaveEstimate =
    hasEstimateSelection &&
    estimateSaveState.status !== "saving" &&
    !activeDraftRequiresIntent;
  const canSendProposal =
    canSaveEstimate &&
    proposalSendBlockers.length === 0 &&
    estimateGenerationState.status !== "generating" &&
    sendingEstimateId === null;
  async function saveDispatcherPreviewSnapshot() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setDispatcherSnapshotSaveState({
        status: "error",
        message: "Saved scheduling previews are not available for this workspace.",
      });
      return;
    }

    const sessionResult = await getDashboardActionSession(supabase);

    if (!sessionResult.ok) {
      setDispatcherSnapshotSaveState({
        status: "error",
        message: sessionResult.message,
      });
      return;
    }

    const { data: sessionData, error: sessionError } = sessionResult.response;
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setDispatcherSnapshotSaveState({
        status: "error",
        message: "Log in again before saving this dispatcher preview.",
      });
      return;
    }

    setDispatcherSnapshotSaveState({ status: "saving", message: null });

    const response = await fetch(
      `/api/service-requests/${request.id}/dispatcher-preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          normalizedZip: schedulingPreview.normalizedIntake.location.zipCode,
          normalizedServiceType:
            schedulingPreview.normalizedIntake.service.applianceType,
          normalizedAppliance:
            schedulingPreview.normalizedIntake.service.applianceType,
          normalizedBrand: schedulingPreview.normalizedIntake.service.brand,
          normalizedIssue:
            schedulingPreview.normalizedIntake.service.issueDescription,
          requestedWindow:
            schedulingPreview.normalizedIntake.preferences.preferredTimeWindow,
          requestedDate:
            schedulingPreview.normalizedIntake.preferences.requestedDate,
          orchestratorStatus: schedulingPreview.status,
          recommendedTechnicianProfileId:
            bestTechnicianMatch?.technicianProfileId ?? null,
          recommendationSummary: bestTechnicianMatch || schedulingBestRecommendation
            ? {
                recommendedTechnicianProfileId:
                  bestTechnicianMatch?.technicianProfileId ?? null,
                recommendedTechnicianName:
                  bestTechnicianMatch?.displayName ?? null,
                recommendedTechnicianBusinessName:
                  bestTechnicianMatch?.businessName ?? null,
                rankingScore: bestTechnicianMatch?.score ?? null,
                confidence: bestTechnicianMatch?.confidence ?? null,
                availabilityConfigured:
                  bestTechnicianAvailability?.hasAvailability ?? false,
                availabilityWindowsForDate:
                  bestTechnicianAvailability?.activeWindowCountForDate ?? 0,
                availabilityDays:
                  bestTechnicianAvailability?.configuredDays ?? [],
                rankingReasons:
                  bestTechnicianMatch?.reasons.map((reason) => ({
                    code: reason.code,
                    label: reason.label,
                    points: reason.points,
                  })) ?? [],
                technicianId: schedulingBestRecommendation?.technicianId ?? null,
                technicianDisplayName:
                  schedulingBestRecommendation?.technicianDisplayName ?? null,
                startsAt: schedulingBestRecommendation?.startsAt ?? null,
                endsAt: schedulingBestRecommendation?.endsAt ?? null,
                timeWindowLabel:
                  schedulingBestRecommendation?.timeWindowLabel ?? null,
                customerWindowLabel:
                  schedulingBestRecommendation?.customerWindowLabel ?? null,
                conflictCount: schedulingBestRecommendation?.conflictCount ?? null,
                reasonCodes: schedulingBestRecommendation?.reasonCodes ?? [],
              }
            : {},
          backupOptionsCount: schedulingBackupRecommendations.length,
          backupOptions: schedulingBackupRecommendations.map(
            (recommendation) => ({
              technicianId: recommendation.technicianId,
              technicianDisplayName:
                recommendation.technicianDisplayName ?? null,
              startsAt: recommendation.startsAt,
              endsAt: recommendation.endsAt,
              timeWindowLabel: recommendation.timeWindowLabel,
              customerWindowLabel: recommendation.customerWindowLabel,
              conflictCount: recommendation.conflictCount,
              reasonCodes: recommendation.reasonCodes,
            }),
          ),
          safeCustomerResponseDraft:
            schedulingPreview.responseDraft?.primaryResponseText ?? null,
          validationWarnings: schedulingPreview.warnings,
          validationErrors: schedulingPreview.errors,
        }),
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      snapshot?: unknown;
    } | null;

    if (!response.ok || !payload?.ok) {
      setDispatcherSnapshotSaveState({
        status: "error",
        message:
          payload?.message ??
          "We could not save this dispatcher preview snapshot yet.",
      });
      return;
    }

    const snapshot = mapDispatcherPreviewSnapshot(payload.snapshot ?? null);

    setDispatcherSnapshotState({
      status: "ready",
      snapshot,
      error: null,
    });
    setDispatcherSnapshotSaveState({
      status: "success",
      message: snapshot
        ? "Dispatcher preview snapshot saved."
        : "Dispatcher preview saved, but the response did not include snapshot details.",
    });
  }

  async function bookRecommendedAppointment() {
    if (!bestTechnicianMatch || !schedulingBestRecommendation) {
      setAppointmentBookingState({
        status: "error",
        message: "Choose a matched technician and available window first.",
      });
      return;
    }

    if (!bestTechnicianAvailability?.hasAvailability) {
      setAppointmentBookingState({
        status: "error",
        message:
          "Availability rules are required before booking an appointment.",
      });
      return;
    }

    const windowStartTime = getLocalTimeForAppointment(
      schedulingBestRecommendation.startsAt,
    );
    const windowEndTime = getLocalTimeForAppointment(
      schedulingBestRecommendation.endsAt,
    );

    if (!windowStartTime || !windowEndTime) {
      setAppointmentBookingState({
        status: "error",
        message: "The recommended window could not be converted for booking.",
      });
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setAppointmentBookingState({
        status: "error",
        message: "Appointment booking is not available for this workspace.",
      });
      return;
    }

    const sessionResult = await getDashboardActionSession(supabase);

    if (!sessionResult.ok) {
      setAppointmentBookingState({
        status: "error",
        message: sessionResult.message,
      });
      return;
    }

    const { data: sessionData, error: sessionError } = sessionResult.response;
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setAppointmentBookingState({
        status: "error",
        message: "Log in again before booking this appointment.",
      });
      return;
    }

    setAppointmentBookingState({ status: "booking", message: null });

    const response = await fetch(
      `/api/service-requests/${request.id}/appointments`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          technicianProfileId: bestTechnicianMatch.technicianProfileId,
          appointmentDate: schedulingRequestedDate,
          windowStartTime,
          windowEndTime,
          dispatcherSnapshotId: dispatcherSnapshotState.snapshot?.id ?? null,
        }),
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      appointment?: {
        id?: string;
        technician_profile_id?: string;
        appointment_date?: string;
        window_start_time?: string;
        window_end_time?: string;
        updated_at?: string;
      };
      calendarSync?: {
        provider?: "google" | null;
        status?: "not_configured" | "pending" | "synced" | "failed" | "canceled";
        eventId?: string | null;
        error?: string | null;
        migrationReady?: boolean;
      } | null;
    } | null;

    if (!response.ok || !payload?.ok || !payload.appointment?.id) {
      setAppointmentBookingState({
        status: "error",
        message:
          payload?.message ??
          "We could not book this appointment yet.",
      });
      return;
    }

    setState((current) => {
      if (current.status !== "ready") {
        return current;
      }

      return {
        status: "ready",
        request: {
          ...current.request,
          status: "scheduled",
          assignedTechnicianProfileId:
            payload.appointment?.technician_profile_id ??
            bestTechnicianMatch.technicianProfileId,
          appointmentId: payload.appointment?.id ?? current.request.appointmentId,
          scheduledDate:
            payload.appointment?.appointment_date ?? schedulingRequestedDate,
          scheduledWindowStartTime:
            payload.appointment?.window_start_time ?? windowStartTime,
          scheduledWindowEndTime:
            payload.appointment?.window_end_time ?? windowEndTime,
          updatedAt: payload.appointment?.updated_at ?? current.request.updatedAt,
        },
        error: null,
      };
    });
    setSelectedStatus("scheduled");
    setCalendarSyncSummary(
      payload.calendarSync?.status
        ? {
            provider: payload.calendarSync.provider ?? null,
            status: payload.calendarSync.status,
            eventId: payload.calendarSync.eventId ?? null,
            error: payload.calendarSync.error ?? null,
            migrationReady: payload.calendarSync.migrationReady ?? false,
          }
        : null,
    );
    setAppointmentBookingState({
      status: "success",
      message:
        payload.calendarSync?.status === "synced"
          ? "Appointment booked and synced to Google Calendar. No customer message or phone call was sent."
        : payload.calendarSync?.status === "failed"
          ? "Appointment booked. Google Calendar sync failed and can be retried later."
            : "Appointment booked. Calendar sync is unavailable; no customer message or phone call was sent.",
    });
  }

  function toggleInvoiceView(invoiceId: string, isExpanded: boolean) {
    setViewingInvoiceId(isExpanded ? null : invoiceId);
    setViewingEstimateId(null);
  }

  function openEstimateFromList(estimate: DashboardServiceRequestEstimate) {
    openSavedManualEstimateEditor(estimate);
  }

  function renderEstimateCard(estimate: DashboardServiceRequestEstimate) {
    const linkedInvoice = invoicesByEstimateId.get(estimate.id) ?? null;

    return (
      <article
        className="cursor-pointer border-b border-[#E5E7EB] bg-white px-0 py-2.5 transition last:border-b-0 hover:bg-blue-50/40 sm:py-3"
        key={estimate.id}
        onClick={() => openEstimateFromList(estimate)}
      >
        <div className="px-1.5 sm:px-2">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-black leading-5 text-[#0F172A]">
              {estimate.estimateNumber}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <p className="whitespace-nowrap text-sm font-black text-[#0F6BFF] sm:text-base">
                {formatServiceRequestMoney(estimate.total)}
              </p>
              <span className="text-lg font-semibold leading-none text-[#64748B]">
                ›
              </span>
            </div>
          </div>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[0.68rem] font-bold text-[#64748B]">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[0.65rem] font-black text-[#0F6BFF]">
              {formatServiceRequestSource(estimate.estimateStatus)}
            </span>
            <span>
              {estimate.items.length} line{estimate.items.length === 1 ? "" : "s"}
            </span>
            <span aria-hidden="true">·</span>
            <span className="min-w-0 truncate">
              {formatServiceRequestDate(estimate.createdAt)}
            </span>
            {linkedInvoice ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="min-w-0 truncate text-emerald-700">
                  Invoice {linkedInvoice.invoiceNumber}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  function renderInvoiceCard(invoice: DashboardServiceRequestInvoice) {
    const isExpanded = viewingInvoice?.id === invoice.id;
    const sourceEstimate = estimatesState.estimates.find(
      (estimate) => estimate.id === invoice.estimateId,
    );

    return (
      <article
        className={`rounded-md border p-4 transition ${
          isExpanded
            ? "border-emerald-300/40 bg-emerald-300/10"
            : "border-[#E5E7EB] bg-white"
        }`}
        key={invoice.id}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
          <div className="min-w-0">
            {isExpanded ? (
              <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-700">
                Viewing invoice
              </p>
            ) : null}
            <p className="truncate text-sm font-bold text-[#0F172A]">
              {invoice.invoiceNumber}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.12em]">
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-emerald-700">
                {formatServiceRequestSource(invoice.invoiceStatus)}
              </span>
              <span className="rounded-full border border-[#E5E7EB] px-2 py-1 text-[#64748B]">
                {invoice.items.length} line{invoice.items.length === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-2 text-xs font-semibold text-[#64748B]">
              Created {formatServiceRequestDate(invoice.createdAt)}
              {sourceEstimate ? ` from ${sourceEstimate.estimateNumber}` : ""}
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-3 sm:items-end">
            <p className="text-2xl font-bold text-emerald-700 sm:text-xl">
              {formatServiceRequestMoney(invoice.total)}
            </p>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                className="rounded-md border border-[#E5E7EB] px-3 py-2 text-xs font-bold text-[#334155] transition hover:border-emerald-300/50 hover:text-emerald-700"
                onClick={() => toggleInvoiceView(invoice.id, isExpanded)}
                type="button"
              >
                {isExpanded ? "Hide" : "View Invoice"}
              </button>
              {invoice.invoiceStatus === "draft" ? (
                <button
                  className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-[#0F6BFF] transition hover:bg-[#0F6BFF]/20 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={invoiceActionState.status === "saving"}
                  onClick={() => void updateInvoice(invoice, "send")}
                  type="button"
                >
                  {invoiceActionId === invoice.id ? "Sending..." : "Send Invoice"}
                </button>
              ) : null}
              {invoice.invoiceStatus === "draft" ||
              invoice.invoiceStatus === "sent" ? (
                <button
                  className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={invoiceActionState.status === "saving"}
                  onClick={() => void updateInvoice(invoice, "paid")}
                  type="button"
                >
                  {invoiceActionId === invoice.id ? "Saving..." : "Mark Paid"}
                </button>
              ) : null}
              {invoice.invoiceStatus !== "paid" &&
              invoice.invoiceStatus !== "void" ? (
                <button
                  className="rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-300/20 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={invoiceActionState.status === "saving"}
                  onClick={() => void updateInvoice(invoice, "void")}
                  type="button"
                >
                  {invoiceActionId === invoice.id ? "Voiding..." : "Void Invoice"}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {isExpanded ? (
          <div className="mt-4">
            <div className="grid gap-3 text-xs leading-5 text-[#64748B] sm:grid-cols-3">
              <p>
                <span className="font-black text-[#334155]">Sent: </span>
                {invoice.sentAt
                  ? formatServiceRequestDate(invoice.sentAt)
                  : "Not sent"}
              </p>
              <p>
                <span className="font-black text-[#334155]">Paid: </span>
                {invoice.paidAt
                  ? formatServiceRequestDate(invoice.paidAt)
                  : "Not paid"}
              </p>
              <p>
                <span className="font-black text-[#334155]">
                  Source estimate:{" "}
                </span>
                {sourceEstimate?.estimateNumber ?? "Unknown"}
              </p>
            </div>
            <div className="mt-4 divide-y divide-[#E5E7EB] overflow-hidden rounded-md border border-[#E5E7EB]">
              {invoice.items.map((item) => (
                <div
                  className="flex flex-col gap-2 bg-[#F8FAFC] p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  key={item.id}
                >
                  <div>
                    <p className="font-bold text-[#0F172A]">
                      {item.quantity}x {item.itemTitle}
                    </p>
                    {item.notes ? (
                      <p className="mt-1 text-xs text-[#64748B]">{item.notes}</p>
                    ) : null}
                  </div>
                  <p className="font-black text-emerald-700">
                    {formatServiceRequestMoney(item.lineTotal)}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[#E5E7EB] pt-4">
              <p className="text-sm font-black text-[#0F172A]">Total</p>
              <p className="text-2xl font-black text-emerald-700">
                {formatServiceRequestMoney(invoice.total)}
              </p>
            </div>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <article className="rounded-2xl border border-[#E5E7EB] bg-white p-4 text-[#0F172A] shadow-[0_8px_24px_rgba(15,23,42,0.06)] sm:p-5">
      <header className="lg:hidden">
        <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
          <Link
            aria-label="Back to jobs"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E5E7EB] bg-[#F8FAFC] text-xl font-black text-[#0F172A] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
            href={returnTo}
          >
            ←
          </Link>
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-semibold text-[#334155]">
              Job #{jobNumber}
            </p>
            <p className="mt-0.5 truncate text-xs font-bold text-[#64748B]">
              {statusLabel}
            </p>
          </div>
          <details className="relative">
            <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-[#E5E7EB] bg-[#F8FAFC] text-xl font-black text-[#0F172A] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF] [&::-webkit-details-marker]:hidden">
              ⋯
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-44 rounded-2xl border border-[#E5E7EB] bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.16)]">
              {callCustomerHref ? (
                <a
                  className="block rounded-[10px] px-3 py-2 text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
                  href={callCustomerHref}
                >
                  Call customer
                </a>
              ) : null}
              {textCustomerHref ? (
                <a
                  className="block rounded-[10px] px-3 py-2 text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
                  href={textCustomerHref}
                >
                  SMS customer
                </a>
              ) : null}
              <button
                className="block w-full rounded-[10px] px-3 py-2 text-left text-sm font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
                onClick={() => setActiveJobTab("photos")}
                type="button"
              >
                Photos
              </button>
              <button
                className="block w-full rounded-[10px] px-3 py-2 text-left text-sm font-bold text-red-600 hover:bg-red-50"
                onClick={() =>
                  setJobDeleteState({ status: "confirming", message: null })
                }
                type="button"
              >
                Delete Job
              </button>
            </div>
          </details>
        </div>

        <nav
          aria-label="Mobile job workspace sections"
          className="mt-3 grid grid-cols-3 border-b border-[#E5E7EB]"
        >
          {[
            { id: "overview", label: "Details" },
            { id: "estimate", label: "Finance" },
            { id: "timeline", label: "Timeline" },
          ].map((tab) => (
            <button
              className={`border-b-2 px-3 py-2 text-sm font-black transition ${
                activeJobTab === tab.id
                  ? "border-[#2563EB] text-[#2563EB]"
                  : "border-transparent text-[#475569] hover:text-[#0F172A]"
              }`}
              key={tab.id}
              onClick={() => setActiveJobTab(tab.id as JobWorkspaceTab)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="hidden gap-3 lg:grid xl:grid-cols-[1fr_auto] xl:items-start">
        <div className="min-w-0">
          <Link
            className="mb-2 inline-flex text-xs font-black text-[#0F6BFF] transition hover:text-[#0057D9]"
            href={returnTo}
          >
            Back to jobs
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#64748B]">
              Job #{jobNumber}
            </span>
            <StatusBadge tone={SERVICE_REQUEST_STATUS_TONES[request.status] ?? "slate"}>
              {statusLabel}
            </StatusBadge>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-[#0F172A] sm:text-3xl">
            {request.customerName} · {request.applianceType}
          </h1>
          <p className="mt-1 text-sm font-semibold text-[#64748B]">
            {request.applianceBrand ?? "Unknown brand"} ·{" "}
            {scheduledWindowLabel ?? "Not scheduled"} ·{" "}
            {assignedTechnicianLabel}
          </p>
        </div>
        <label className="block min-w-56">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
            Status
          </span>
          <select
            className="mt-2 w-full rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm font-bold text-[#0F172A] outline-none transition focus:border-[#0F6BFF]"
            disabled={statusUpdateState.status === "saving"}
            onChange={(event) => {
              const nextStatus = event.target.value as ServiceRequestCrmStatus;
              setSelectedStatus(nextStatus);
              if (nextStatus !== request.status) {
                void updateStatus(nextStatus);
              }
            }}
            value={selectedStatus}
          >
            {SERVICE_REQUEST_CRM_STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatServiceRequestSource(status)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="mt-3 hidden rounded-2xl border border-[#E5E7EB] bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.04)] lg:block">
        <div className="grid grid-cols-5 gap-1.5">
          {quickActions.map((action) => (
            <button
              className={getQuickActionClasses(action.variant)}
              disabled={action.disabled}
              key={action.label}
              onClick={action.onClick}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>

      <nav
        aria-label="Job workspace sections"
        className="mt-4 hidden gap-2 overflow-x-auto rounded-2xl border border-[#E5E7EB] bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.04)] lg:flex"
      >
        {jobWorkspaceTabs.map((tab) => (
          <button
            className={`shrink-0 rounded-[10px] px-4 py-2 text-sm font-bold transition ${
              activeJobTab === tab.id
                ? "bg-[#0F6BFF] text-white"
                : "text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
            }`}
            key={tab.id}
            onClick={() => setActiveJobTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeJobTab === "overview" ? (
        <>
      {statusUpdateState.message || estimateStatusMismatchMessage ? (
      <section className="border-b border-[#E5E7EB] py-2 lg:mt-4 lg:rounded-2xl lg:border lg:bg-[#F8FAFC] lg:p-3">
        {statusUpdateState.message ? (
          <p
            className={`text-sm font-semibold ${
              statusUpdateState.status === "error"
                ? "text-amber-700"
                : "text-[#0F6BFF]"
            }`}
          >
            {statusUpdateState.message}
          </p>
        ) : null}
        {estimateStatusMismatchMessage ? (
          <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
            {estimateStatusMismatchMessage}
          </p>
        ) : null}
      </section>
      ) : null}

      <section className="relative py-3 lg:mt-4 lg:rounded-2xl lg:border lg:border-[#E5E7EB] lg:bg-white lg:p-3 lg:shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
        <div className="grid grid-cols-[42%_1fr] gap-3 sm:grid-cols-[96px_96px_1fr] sm:items-center">
          <div className="min-w-0 sm:hidden">
            <div className="aspect-[4/3] overflow-hidden rounded-xl border border-[#E5E7EB] bg-[#F8FAFC]">
            {propertyPreviewPhotoUrl ? (
              <div
                aria-label="Property"
                className="h-full w-full bg-cover bg-center"
                role="img"
                style={getBackgroundImageStyle(propertyPreviewPhotoUrl)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs font-black uppercase tracking-[0.12em] text-[#94A3B8]">
                Property image unavailable
              </div>
            )}
            </div>
            <div className="mt-2">
              {hasPropertyPreviewData ? (
                <p className="text-[10px] font-bold text-[#64748B]">
                  Source: Zillow
                </p>
              ) : null}
            </div>
          </div>

          <div className="hidden aspect-square overflow-hidden rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] sm:block">
            {propertyPreview?.mapImage ? (
              <div
                aria-label="Property map"
                className="h-full w-full bg-cover bg-center"
                role="img"
                style={getBackgroundImageStyle(propertyPreview.mapImage)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] font-black uppercase tracking-[0.12em] text-[#94A3B8]">
                Map
              </div>
            )}
          </div>
          <div className="hidden aspect-square overflow-hidden rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] sm:block">
            {propertyPreview?.photo ? (
              <div
                aria-label="Property"
                className="h-full w-full bg-cover bg-center"
                role="img"
                style={getBackgroundImageStyle(propertyPreview.photo)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] font-black uppercase tracking-[0.12em] text-[#94A3B8]">
                Photo
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="hidden flex-wrap items-center gap-2 sm:flex">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
                Property Preview
              </p>
              {hasPropertyPreviewData ? (
                <span className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-bold text-[#64748B]">
                  Source: Zillow
                </span>
              ) : null}
            </div>
            {propertyPreviewState.status === "loading" ? (
              <p className="mt-2 text-sm font-semibold text-[#64748B]">
                Loading property context...
              </p>
            ) : hasPropertyPreviewData ? (
              <>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#0F6BFF] sm:hidden">
                  Zestimate
                </p>
                <p className="truncate text-lg font-black text-[#0F172A] sm:mt-1 sm:text-xl">
                  {formatCompactCurrency(propertyPreview?.zestimate ?? null)}
                </p>
                <div className="mt-1 grid gap-1 text-xs font-bold text-[#64748B] sm:flex sm:flex-wrap sm:gap-x-3 sm:gap-y-1 sm:text-sm">
                  <span>Estimated Value</span>
                  <span>{formatLivingArea(propertyPreview?.livingArea ?? null)}</span>
                  <span>
                    Built{" "}
                    {propertyPreview?.yearBuilt
                      ? Math.trunc(propertyPreview.yearBuilt)
                      : "not available"}
                  </span>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm font-black text-[#0F172A]">
                  Property details unavailable
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-[#64748B]">
                  {propertyLookupAddress
                    ? "Property information is not available for this service address yet."
                    : "Add or confirm the service address to show photo, Zestimate, square footage, and year built."}
                </p>
              </>
            )}
            {hasRoutableAddress ? (
              <a
                className="absolute bottom-3 right-3 inline-flex min-h-9 items-center border-b border-[#2563EB] px-0 pb-0.5 pt-2 text-sm font-bold text-[#2563EB] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF] sm:hidden"
                href={propertyPreviewMapsUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open in Maps
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="border-y border-[#E5E7EB] bg-white lg:hidden">
        <button
          aria-label="Edit job summary"
          className="grid w-full grid-cols-[minmax(0,1fr)_44px] items-center gap-2 px-1 py-3 text-left transition active:bg-[#F8FAFC]"
          onClick={openJobSummaryEditor}
          type="button"
        >
          <div className="min-w-0">
            <h2 className="break-words text-lg font-black leading-6 text-[#0F172A]">
              {jobSummaryTitle}
            </h2>
            <p className="mt-1 break-words text-sm font-semibold leading-5 text-[#64748B]">
              {jobSummaryComplaint}
            </p>
          </div>
          <span
            aria-hidden="true"
            className="flex min-h-11 w-11 items-center justify-end pr-1 text-xl font-black leading-none text-[#2563EB]"
          >
            ✎
          </span>
        </button>
      </section>

      <section className="border-b border-[#E5E7EB] bg-white lg:hidden">
        <button
          aria-label="Change job status"
          className="flex min-h-12 w-full items-center gap-2 px-1 py-2 text-left transition active:bg-[#F8FAFC]"
          onClick={openStatusSheet}
          type="button"
        >
          <span className="shrink-0 text-sm font-black text-[#0F172A]">
            Status
          </span>
          <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
            <StatusBadge tone={SERVICE_REQUEST_STATUS_TONES[request.status] ?? "slate"}>
              <span className="block max-w-[150px] truncate">
                {statusLabel}
              </span>
            </StatusBadge>
            <span
              aria-hidden="true"
              className="flex min-h-10 w-7 shrink-0 items-center justify-end text-xl font-black leading-none text-[#2563EB]"
            >
              ✎
            </span>
          </div>
        </button>
      </section>

      {jobDetailsSheet ? (
        <div
          aria-modal="true"
          className={`fixed inset-0 z-50 flex items-end bg-[#0F172A]/45 transition-opacity duration-200 ease-out lg:hidden ${
            isJobDetailsSheetVisible && !isClosingJobDetailsSheet
              ? "opacity-100"
              : "opacity-0"
          }`}
          role="dialog"
        >
          <button
            aria-label="Close job details sheet"
            className="absolute inset-0 cursor-default"
            onClick={closeJobDetailsSheet}
            type="button"
          />
          <div
            className={`relative z-10 max-h-[84dvh] w-full overflow-hidden rounded-t-[28px] bg-white shadow-[0_-18px_50px_rgba(15,23,42,0.22)] transition-transform duration-300 ease-out ${
              isJobDetailsSheetVisible && !isClosingJobDetailsSheet
                ? "translate-y-0"
                : "translate-y-full"
            }`}
          >
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-[#CBD5E1]" />
            <div className="flex items-center justify-between px-4 pb-3 pt-4">
              <h2 className="text-xl font-black text-[#0F172A]">
                {jobDetailsSheet === "jobType"
                  ? "Job Details"
                  : jobDetailsSheet === "problem"
                    ? "Problem / Complaint"
                    : jobDetailsSheet === "adSource"
                      ? "Ad Source"
                      : "Tags"}
              </h2>
              <button
                className="flex min-h-10 min-w-10 items-center justify-center text-2xl font-bold text-[#334155]"
                onClick={closeJobDetailsSheet}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="max-h-[calc(84dvh-82px)] overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {jobDetailsSheet === "jobType" ? (
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <span className="text-sm font-black text-[#0F172A]">
                      Job Type
                    </span>
                    <button
                      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-left transition active:bg-[#EEF2FF]"
                      onClick={() => {
                        setExpandedJobDetailsSelector((current) =>
                          current === "jobType" ? null : "jobType",
                        );
                        setJobDetailsSearch("");
                        setNewCatalogValue("");
                      }}
                      type="button"
                    >
                      <span className="min-w-0 truncate text-base font-black text-[#0F172A]">
                        {activeJobType?.name ?? "Choose job type"}
                      </span>
                      <span className="text-lg font-black text-[#64748B]">⌄</span>
                    </button>
                    {expandedJobDetailsSelector === "jobType" ? (
                      <div className="rounded-[16px] border border-[#E5E7EB] bg-white p-2">
                        <input
                          className="w-full rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-base font-bold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                          onChange={(event) =>
                            setJobDetailsSearch(event.target.value)
                          }
                          placeholder="Search job types"
                          value={jobDetailsSearch}
                        />
                        <div className="mt-2 max-h-[34dvh] touch-pan-y overflow-y-auto overscroll-contain pr-1">
                          <div className="grid gap-2">
                            {filteredJobTypes.map((item) => {
                              const isSelected = selectedJobTypeId === item.id;

                              return (
                                <button
                                  className="flex min-h-11 w-full items-center gap-3 rounded-[12px] border border-[#E5E7EB] bg-white px-3 py-2 text-left transition active:bg-[#F8FAFC]"
                                  key={item.id}
                                  onClick={() => {
                                    setSelectedJobTypeId(item.id);
                                    setSelectedProblemTypeId(null);
                                  }}
                                  type="button"
                                >
                                  <span
                                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-xs font-black ${
                                      isSelected
                                        ? "border-[#2563EB] bg-[#2563EB] text-white"
                                        : "border-[#CBD5E1] text-transparent"
                                    }`}
                                  >
                                    ✓
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-sm font-black text-[#0F172A]">
                                    {item.name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <label className="mt-3 grid gap-2">
                          <span className="text-sm font-black text-[#0F172A]">
                            Add new job type
                          </span>
                          <input
                            className="w-full rounded-[12px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-base font-bold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                            onChange={(event) =>
                              setNewCatalogValue(event.target.value)
                            }
                            placeholder="Type a new reusable job type"
                            value={newCatalogValue}
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-2">
                    <span className="text-sm font-black text-[#0F172A]">
                      Ad Source
                    </span>
                    <button
                      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-left transition active:bg-[#EEF2FF]"
                      onClick={() => {
                        setExpandedJobDetailsSelector((current) =>
                          current === "adSource" ? null : "adSource",
                        );
                        setJobDetailsSearch("");
                        setNewCatalogValue("");
                      }}
                      type="button"
                    >
                      <span className="min-w-0 truncate text-base font-black text-[#0F172A]">
                        {selectedMarketingSource?.name ?? "Not set"}
                      </span>
                      <span className="text-lg font-black text-[#64748B]">⌄</span>
                    </button>
                    {expandedJobDetailsSelector === "adSource" ? (
                      <div className="rounded-[16px] border border-[#E5E7EB] bg-white p-2">
                        <input
                          className="w-full rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-base font-bold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                          onChange={(event) =>
                            setJobDetailsSearch(event.target.value)
                          }
                          placeholder="Search ad sources"
                          value={jobDetailsSearch}
                        />
                        <button
                          className="mt-2 flex min-h-10 w-full items-center justify-between rounded-[12px] border border-[#E5E7EB] bg-white px-3 text-sm font-black text-[#334155] transition active:bg-[#F8FAFC]"
                          onClick={() => setSelectedMarketingSourceId(null)}
                          type="button"
                        >
                          Clear source
                          {!selectedMarketingSourceId ? (
                            <span className="text-[#2563EB]">✓</span>
                          ) : null}
                        </button>
                        <div className="mt-2 max-h-[30dvh] touch-pan-y overflow-y-auto overscroll-contain pr-1">
                          <div className="grid gap-2">
                            {filteredMarketingSources.map((item) => {
                              const isSelected =
                                selectedMarketingSourceId === item.id;

                              return (
                                <button
                                  className="flex min-h-11 w-full items-center gap-3 rounded-[12px] border border-[#E5E7EB] bg-white px-3 py-2 text-left transition active:bg-[#F8FAFC]"
                                  key={item.id}
                                  onClick={() => setSelectedMarketingSourceId(item.id)}
                                  type="button"
                                >
                                  <span
                                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-xs font-black ${
                                      isSelected
                                        ? "border-[#2563EB] bg-[#2563EB] text-white"
                                        : "border-[#CBD5E1] text-transparent"
                                    }`}
                                  >
                                    ✓
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-sm font-black text-[#0F172A]">
                                    {item.name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <label className="mt-3 grid gap-2">
                          <span className="text-sm font-black text-[#0F172A]">
                            Add new source
                          </span>
                          <input
                            className="w-full rounded-[12px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-base font-bold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                            onChange={(event) =>
                              setNewCatalogValue(event.target.value)
                            }
                            placeholder="Type a new reusable source"
                            value={newCatalogValue}
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <>
                  <input
                    className="w-full rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 text-base font-bold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                    onChange={(event) => setJobDetailsSearch(event.target.value)}
                    placeholder="Search"
                    value={jobDetailsSearch}
                  />

                  {jobDetailsSheet === "problem" && !activeJobType ? (
                    <p className="mt-4 rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 text-sm font-bold text-[#64748B]">
                      Choose Job Name first.
                    </p>
                  ) : null}

                  {jobDetailsSheet === "problem" &&
                  activeJobType &&
                  !descriptionMatchesSelectedJobType ? (
                    <p className="mt-4 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                      Current description is kept. Choose a matching problem or add
                      a new one for this job type.
                    </p>
                  ) : null}

                  <div className="mt-4 grid max-h-[42dvh] touch-pan-y gap-2 overflow-y-auto overscroll-contain pr-1">
                    {(jobDetailsSheet === "problem"
                      ? filteredProblems
                      : jobDetailsSheet === "adSource"
                        ? filteredMarketingSources
                        : filteredTags
                    ).map((item) => {
                      const isSelected =
                        jobDetailsSheet === "problem"
                          ? selectedProblemTypeId === item.id
                          : jobDetailsSheet === "adSource"
                            ? selectedMarketingSourceId === item.id
                            : selectedTagIds.includes(item.id);

                      return (
                        <button
                          className="flex min-h-11 w-full items-center gap-3 rounded-[12px] border border-[#E5E7EB] bg-white px-3 py-2 text-left transition active:bg-[#F8FAFC]"
                          key={item.id}
                          onClick={() => {
                            if (jobDetailsSheet === "problem") {
                              setSelectedProblemTypeId(item.id);
                            } else if (jobDetailsSheet === "adSource") {
                              setSelectedMarketingSourceId(item.id);
                            } else {
                              setSelectedTagIds((current) =>
                                current.includes(item.id)
                                  ? current.filter((id) => id !== item.id)
                                  : [...current, item.id],
                              );
                            }
                          }}
                          type="button"
                        >
                          <span
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-xs font-black ${
                              isSelected
                                ? "border-[#2563EB] bg-[#2563EB] text-white"
                                : "border-[#CBD5E1] text-transparent"
                            }`}
                          >
                            ✓
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-black text-[#0F172A]">
                            {item.name}
                          </span>
                          {jobDetailsSheet === "tags" ? (
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${toTagToneClass(item.tone)}`}
                            >
                              {item.category ?? "custom"}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  {jobDetailsSheet === "problem" && activeJobType ? (
                    <label className="mt-4 grid gap-2">
                      <span className="text-sm font-black text-[#0F172A]">
                        Add new problem
                      </span>
                      <input
                        className="w-full rounded-[14px] border border-[#E5E7EB] bg-white px-3 py-3 text-base font-bold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                        onChange={(event) => setNewCatalogValue(event.target.value)}
                        placeholder={`Add problem for ${activeJobType.name}`}
                        value={newCatalogValue}
                      />
                    </label>
                  ) : jobDetailsSheet === "tags" ? (
                    <label className="mt-4 grid gap-2">
                      <span className="text-sm font-black text-[#0F172A]">
                        Add new tag
                      </span>
                      <input
                        className="w-full rounded-[14px] border border-[#E5E7EB] bg-white px-3 py-3 text-base font-bold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                        onChange={(event) => setNewCatalogValue(event.target.value)}
                        placeholder="Type a new reusable value"
                        value={newCatalogValue}
                      />
                    </label>
                  ) : null}
                </>
              )}

              {jobDetailsSaveState.status === "error" ? (
                <p className="mt-3 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                  {jobDetailsSaveState.message}
                </p>
              ) : null}

              <div className="sticky bottom-0 mt-4 grid grid-cols-2 gap-2 bg-white pb-1 pt-3">
                <button
                  className="min-h-11 rounded-[12px] border border-[#CBD5E1] bg-white px-4 text-sm font-black text-[#334155]"
                  onClick={closeJobDetailsSheet}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="min-h-11 rounded-[12px] bg-[#2563EB] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={jobDetailsSaveState.status === "saving"}
                  onClick={() => {
                    const newValue = newCatalogValue.trim();

                    void saveJobDetailsFromSheet(
                      newValue
                        ? {
                            newJobTypeName:
                              jobDetailsSheet === "jobType" &&
                              expandedJobDetailsSelector === "jobType"
                                ? newValue
                                : null,
                            newProblemName:
                              jobDetailsSheet === "problem" ? newValue : null,
                            newMarketingSourceName:
                              jobDetailsSheet === "jobType" &&
                              expandedJobDetailsSelector === "adSource"
                                ? newValue
                                : null,
                            newTagName:
                              jobDetailsSheet === "tags" ? newValue : null,
                          }
                        : undefined,
                    );
                  }}
                  type="button"
                >
                  {jobDetailsSaveState.status === "saving" ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isEditingJobSummary ? (
        <div
          aria-modal="true"
          className={`fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/45 px-4 py-6 transition-opacity duration-200 ease-out lg:hidden ${
            isJobSummaryEditorVisible && !isClosingJobSummaryEditor
              ? "opacity-100"
              : "opacity-0"
          }`}
          role="dialog"
        >
          <button
            aria-label="Close edit job modal"
            className="absolute inset-0 cursor-default"
            onClick={closeJobSummaryEditor}
            type="button"
          />
          <div
            className={`relative z-10 w-[calc(100%-32px)] max-w-[420px] rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.24)] transition-transform duration-300 ease-out ${
              isJobSummaryEditorVisible && !isClosingJobSummaryEditor
                ? "translate-y-0 scale-100"
                : "translate-y-3 scale-[0.98]"
            }`}
          >
            <div className="max-h-[84dvh] overflow-y-auto px-4 py-4">
              <button
                aria-label="Close edit job"
                className="absolute right-3 top-3 flex min-h-10 min-w-10 items-center justify-center text-2xl font-bold leading-none text-[#334155]"
                onClick={closeJobSummaryEditor}
                type="button"
              >
                ×
              </button>
              <h2 className="pr-10 text-xl font-black text-[#0F172A]">
                Edit Job
              </h2>
              <div className="mt-3 grid gap-3">
                <label className="grid gap-2">
                  <span className="text-sm font-black text-[#0F172A]">
                    Job Name
                  </span>
                  <input
                    className="w-full rounded-[12px] border border-[#CBD5E1] bg-white px-3 py-2.5 text-base font-bold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                    onChange={(event) =>
                      setJobSummaryDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    value={jobSummaryDraft.title}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-black text-[#0F172A]">
                    Customer Complaint
                  </span>
                  <textarea
                    className="min-h-[108px] w-full rounded-[12px] border border-[#CBD5E1] bg-white px-3 py-2.5 text-base font-semibold leading-6 text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                    onChange={(event) =>
                      setJobSummaryDraft((current) => ({
                        ...current,
                        complaint: event.target.value,
                      }))
                    }
                    value={jobSummaryDraft.complaint}
                  />
                </label>
              </div>
              {jobDetailsSaveState.status === "error" ? (
                <p className="mt-3 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                  {jobDetailsSaveState.message}
                </p>
              ) : null}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className="min-h-11 rounded-[12px] border border-[#CBD5E1] bg-white px-4 text-sm font-black text-[#334155]"
                  onClick={closeJobSummaryEditor}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="min-h-11 rounded-[12px] bg-[#2563EB] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    jobDetailsSaveState.status === "saving" ||
                    !jobSummaryDraft.title.trim() ||
                    !jobSummaryDraft.complaint.trim()
                  }
                  onClick={() => void saveJobSummaryDraft()}
                  type="button"
                >
                  {jobDetailsSaveState.status === "saving" ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isEditingClient ? (
        <div
          aria-modal="true"
          className={`fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/45 px-4 py-6 transition-opacity duration-200 ease-out lg:hidden ${
            isClientEditorVisible && !isClosingClientEditor
              ? "opacity-100"
              : "opacity-0"
          }`}
          role="dialog"
        >
          <button
            aria-label="Close edit client modal"
            className="absolute inset-0 cursor-default"
            onClick={closeClientEditor}
            type="button"
          />
          <div
            className={`relative z-10 w-[calc(100%-32px)] max-w-[430px] rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_20px_60px_rgba(15,23,42,0.24)] transition-transform duration-300 ease-out ${
              isClientEditorVisible && !isClosingClientEditor
                ? "translate-y-0 scale-100"
                : "translate-y-3 scale-[0.98]"
            }`}
          >
            <div className="max-h-[84dvh] overflow-y-auto px-4 py-4">
              <button
                aria-label="Close edit client"
                className="absolute right-3 top-3 flex min-h-10 min-w-10 items-center justify-center text-2xl font-bold leading-none text-[#334155]"
                onClick={closeClientEditor}
                type="button"
              >
                ×
              </button>
              <h2 className="pr-10 text-xl font-black text-[#0F172A]">
                Edit Client
              </h2>
              <div className="mt-3 grid gap-3">
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-[#0F172A]">
                      First Name
                    </span>
                    <input
                      className="w-full rounded-[12px] border border-[#CBD5E1] bg-white px-3 py-2.5 text-base font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                      onChange={(event) =>
                        setClientDraft((current) => ({
                          ...current,
                          firstName: event.target.value,
                        }))
                      }
                      value={clientDraft.firstName}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-[#0F172A]">
                      Last Name
                    </span>
                    <input
                      className="w-full rounded-[12px] border border-[#CBD5E1] bg-white px-3 py-2.5 text-base font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                      onChange={(event) =>
                        setClientDraft((current) => ({
                          ...current,
                          lastName: event.target.value,
                        }))
                      }
                      value={clientDraft.lastName}
                    />
                  </label>
                </div>
                <label className="grid gap-2">
                  <span className="text-sm font-black text-[#0F172A]">
                    Phone
                  </span>
                  <input
                    className="w-full rounded-[12px] border border-[#CBD5E1] bg-white px-3 py-2.5 text-base font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                    inputMode="tel"
                    onChange={(event) =>
                      setClientDraft((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    value={clientDraft.phone}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-black text-[#0F172A]">
                    Email
                  </span>
                  <input
                    className="w-full rounded-[12px] border border-[#CBD5E1] bg-white px-3 py-2.5 text-base font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                    inputMode="email"
                    onChange={(event) =>
                      setClientDraft((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    value={clientDraft.email}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-black text-[#0F172A]">
                    Service Address
                  </span>
                  <div className="relative">
                    <input
                      className="w-full rounded-[12px] border border-[#CBD5E1] bg-white px-3 py-2.5 text-base font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                      onChange={(event) => {
                        const nextAddress = event.target.value;
                        updateAddressField("streetAddress", nextAddress);
                        setAddressSearchQuery(nextAddress);
                      }}
                      value={addressForm.streetAddress}
                    />
                    {addressAutocomplete.isConfigured &&
                    (addressSuggestions.length > 0 ||
                      addressSuggestionState.status !== "idle") ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-[12px] border border-[#D7DEEA] bg-white text-sm shadow-[0_18px_38px_rgba(15,23,42,0.14)]">
                        {addressSuggestionState.status === "loading" ? (
                          <p className="px-3 py-2 text-xs font-bold text-[#64748B]">
                            Searching addresses...
                          </p>
                        ) : null}
                        {addressSuggestionState.status === "error" ? (
                          <p className="px-3 py-2 text-xs font-bold text-[#B42318]">
                            {addressSuggestionState.message}
                          </p>
                        ) : null}
                        {addressSuggestions.map((suggestion) => (
                          <button
                            className="block w-full px-3 py-2 text-left font-semibold text-[#0F172A] transition hover:bg-[#F1F5F9]"
                            key={suggestion.placeId || suggestion.label}
                            onClick={() =>
                              void selectAddressSuggestion(suggestion)
                            }
                            type="button"
                          >
                            {suggestion.label}
                          </button>
                        ))}
                        {addressSuggestionState.status === "empty" ? (
                          <p className="px-3 py-2 text-xs font-bold text-[#64748B]">
                            No matches found. Continue with manual entry.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-black text-[#0F172A]">
                    Unit / Apartment
                  </span>
                  <input
                    className="w-full rounded-[12px] border border-[#CBD5E1] bg-white px-3 py-2.5 text-base font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                    onChange={(event) =>
                      updateAddressField("unit", event.target.value)
                    }
                    value={addressForm.unit}
                  />
                </label>
                <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-[#0F172A]">
                      City
                    </span>
                    <input
                      className="w-full rounded-[12px] border border-[#CBD5E1] bg-white px-3 py-2.5 text-base font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                      onChange={(event) =>
                        updateAddressField("city", event.target.value)
                      }
                      value={addressForm.city}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-[#0F172A]">
                      State
                    </span>
                    <input
                      className="w-full rounded-[12px] border border-[#CBD5E1] bg-white px-3 py-2.5 text-base font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                      onChange={(event) =>
                        updateAddressField(
                          "state",
                          event.target.value.toUpperCase(),
                        )
                      }
                      value={addressForm.state}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-[#0F172A]">
                      ZIP
                    </span>
                    <input
                      className="w-full rounded-[12px] border border-[#CBD5E1] bg-white px-3 py-2.5 text-base font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                      inputMode="numeric"
                      onChange={(event) =>
                        updateAddressField("zipCode", event.target.value)
                      }
                      value={addressForm.zipCode}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-black text-[#0F172A]">
                      Country
                    </span>
                    <input
                      className="w-full rounded-[12px] border border-[#CBD5E1] bg-white px-3 py-2.5 text-base font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                      onChange={(event) =>
                        updateAddressField(
                          "country",
                          event.target.value.toUpperCase(),
                        )
                      }
                      value={addressForm.country}
                    />
                  </label>
                </div>
              </div>
              {addressSaveState.message ? (
                <p
                  className={`mt-3 text-xs font-bold ${
                    addressSaveState.status === "error"
                      ? "text-[#B42318]"
                      : "text-[#047857]"
                  }`}
                >
                  {addressSaveState.message}
                </p>
              ) : null}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className="min-h-11 rounded-[12px] border border-[#CBD5E1] bg-white px-4 text-sm font-black text-[#334155]"
                  onClick={closeClientEditor}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="min-h-11 rounded-[12px] bg-[#2563EB] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    addressSaveState.status === "saving" ||
                    (!clientDraft.firstName.trim() &&
                      !clientDraft.lastName.trim())
                  }
                  onClick={() => void saveClientDraft()}
                  type="button"
                >
                  {addressSaveState.status === "saving" ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isAvatarSheetOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/45 px-3 transition-opacity duration-200 ease-out lg:hidden"
          role="dialog"
        >
          <button
            aria-label="Close avatar actions"
            className="absolute inset-0 cursor-default"
            onClick={() => setIsAvatarSheetOpen(false)}
            type="button"
          />
          <div className="relative z-10 w-full max-w-md rounded-t-[24px] border border-[#E5E7EB] bg-white shadow-[0_-18px_50px_rgba(15,23,42,0.22)]">
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-[#CBD5E1]" />
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4">
              <h2 className="text-lg font-black text-[#0F172A]">
                Client Photo
              </h2>
              <div className="mt-3 overflow-hidden border-y border-[#E5E7EB]">
                <button
                  className="flex min-h-12 w-full items-center justify-between border-b border-[#E5E7EB] py-3 text-left text-sm font-bold text-[#0F172A]"
                  disabled={avatarActionState.status === "saving"}
                  onClick={() => openAvatarFilePicker(true)}
                  type="button"
                >
                  Take Photo
                  <span aria-hidden="true" className="text-[#94A3B8]">›</span>
                </button>
                <button
                  className="flex min-h-12 w-full items-center justify-between border-b border-[#E5E7EB] py-3 text-left text-sm font-bold text-[#0F172A]"
                  disabled={avatarActionState.status === "saving"}
                  onClick={() => openAvatarFilePicker(false)}
                  type="button"
                >
                  Choose from Library
                  <span aria-hidden="true" className="text-[#94A3B8]">›</span>
                </button>
                <button
                  className="flex min-h-12 w-full items-center justify-between border-b border-[#E5E7EB] py-3 text-left text-sm font-bold text-[#0F172A]"
                  disabled={avatarActionState.status === "saving"}
                  onClick={() => openAvatarFilePicker(false)}
                  type="button"
                >
                  Upload File
                  <span aria-hidden="true" className="text-[#94A3B8]">›</span>
                </button>
                {clientAvatar.storagePath ? (
                  <button
                    className="flex min-h-12 w-full items-center justify-between border-b border-[#E5E7EB] py-3 text-left text-sm font-bold text-red-600"
                    disabled={avatarActionState.status === "saving"}
                    onClick={() => void removeClientAvatar()}
                    type="button"
                  >
                    Remove Photo
                  </button>
                ) : null}
                <button
                  className="flex min-h-12 w-full items-center justify-between py-3 text-left text-sm font-bold text-[#475569]"
                  onClick={() => setIsAvatarSheetOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
              {avatarActionState.message ? (
                <p
                  className={`mt-3 text-sm font-semibold ${
                    avatarActionState.status === "error"
                      ? "text-red-600"
                      : "text-[#64748B]"
                  }`}
                >
                  {avatarActionState.message}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isMapConfirmOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/45 px-4 py-6 transition-opacity duration-200 ease-out lg:hidden"
          role="dialog"
        >
          <button
            aria-label="Cancel opening maps"
            className="absolute inset-0 cursor-default"
            onClick={() => setIsMapConfirmOpen(false)}
            type="button"
          />
          <div className="relative z-10 w-[calc(100%-32px)] max-w-[360px] rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.24)]">
            <h2 className="text-lg font-black text-[#0F172A]">
              Open Google Maps?
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#475569]">
              {clientMapAddressLabel || "Service address unavailable"}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                className="min-h-11 rounded-[12px] border border-[#CBD5E1] bg-white px-4 text-sm font-black text-[#334155]"
                onClick={() => setIsMapConfirmOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="min-h-11 rounded-[12px] bg-[#2563EB] px-4 text-sm font-black text-white"
                onClick={openServiceAddressInMaps}
                type="button"
              >
                Open Maps
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isStatusSheetOpen ? (
        <div
          aria-modal="true"
          className={`fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/45 px-3 transition-opacity duration-200 ease-out lg:hidden ${
            isStatusSheetVisible && !isClosingStatusSheet
              ? "opacity-100"
              : "opacity-0"
          }`}
          role="dialog"
        >
          <button
            aria-label="Close status picker"
            className="absolute inset-0 cursor-default"
            onClick={closeStatusSheet}
            type="button"
          />
          <div
            className={`relative z-10 w-full max-w-md rounded-t-[24px] border border-[#E5E7EB] bg-white shadow-[0_-18px_50px_rgba(15,23,42,0.22)] transition-transform duration-300 ease-out ${
              isStatusSheetVisible && !isClosingStatusSheet
                ? "translate-y-0"
                : "translate-y-full"
            }`}
          >
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-[#CBD5E1]" />
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4">
              <h2 className="text-lg font-black text-[#0F172A]">
                Select Status
              </h2>
              <div className="mt-3 max-h-[48dvh] overflow-y-auto border-y border-[#E5E7EB]">
                {SERVICE_REQUEST_CRM_STATUSES.map((status) => {
                  const isCurrentStatus = status === request.status;

                  return (
                    <button
                      className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[#E5E7EB] py-3 text-left last:border-b-0 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={statusUpdateState.status === "saving"}
                      key={status}
                      onClick={() => selectStatusFromSheet(status)}
                      type="button"
                    >
                      <span
                        className={`text-sm font-bold ${
                          isCurrentStatus ? "text-[#2563EB]" : "text-[#0F172A]"
                        }`}
                      >
                        {formatServiceRequestSource(status)}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs font-black ${
                          isCurrentStatus
                            ? "border-[#2563EB] bg-[#2563EB] text-white"
                            : "border-[#CBD5E1] text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isTechnicianSheetOpen ? (
        <div
          aria-modal="true"
          className={`fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/45 px-3 transition-opacity duration-200 ease-out lg:hidden ${
            isTechnicianSheetVisible && !isClosingTechnicianSheet
              ? "opacity-100"
              : "opacity-0"
          }`}
          role="dialog"
        >
          <button
            aria-label="Close technician assignment"
            className="absolute inset-0 cursor-default"
            onClick={closeTechnicianSheet}
            type="button"
          />
          <div
            className={`relative z-10 max-h-[84dvh] w-full max-w-md rounded-t-[24px] border border-[#E5E7EB] bg-white shadow-[0_-18px_50px_rgba(15,23,42,0.22)] transition-transform duration-300 ease-out ${
              isTechnicianSheetVisible && !isClosingTechnicianSheet
                ? "translate-y-0"
                : "translate-y-full"
            }`}
          >
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-[#CBD5E1]" />
            <div className="flex items-center justify-between gap-3 px-4 pt-4">
              <h2 className="text-lg font-black text-[#0F172A]">
                Assign Technician
              </h2>
              <button
                aria-label="Close technician assignment"
                className="flex h-9 w-9 items-center justify-center rounded-full text-xl font-black text-[#64748B] transition active:bg-[#F1F5F9]"
                onClick={closeTechnicianSheet}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
              <input
                className="w-full rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 text-base font-bold text-[#0F172A] outline-none transition focus:border-[#2563EB]"
                onChange={(event) =>
                  setTechnicianAssignmentSearch(event.target.value)
                }
                placeholder="Search technicians"
                value={technicianAssignmentSearch}
              />

              {technicianProfilesState.status === "loading" ? (
                <p className="mt-3 rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 text-sm font-bold text-[#64748B]">
                  Loading technicians...
                </p>
              ) : null}

              {technicianProfilesState.status === "error" ? (
                <p className="mt-3 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-bold text-amber-800">
                  {technicianProfilesState.error}
                </p>
              ) : null}

              <div className="mt-3 max-h-[46dvh] touch-pan-y overflow-y-auto overscroll-contain border-y border-[#E5E7EB]">
                {filteredTechnicianAssignmentCandidates.length > 0 ? (
                  filteredTechnicianAssignmentCandidates.map((candidate) => {
                    const isSelected =
                      selectedAssignmentTechnicianId === candidate.profile.id;

                    return (
                      <button
                        className="flex min-h-14 w-full items-center gap-3 border-b border-[#E5E7EB] py-2.5 text-left last:border-b-0 disabled:cursor-not-allowed disabled:opacity-55"
                        disabled={
                          !candidate.isSelectable ||
                          technicianAssignmentSaveState.status === "saving"
                        }
                        key={candidate.profile.id}
                        onClick={() =>
                          setSelectedAssignmentTechnicianId(candidate.profile.id)
                        }
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-black text-white"
                          style={{
                            backgroundColor:
                              candidate.profile.avatar_color ?? "#2563EB",
                          }}
                        >
                          {candidate.initials}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-[#0F172A]">
                            {candidate.displayName}
                          </span>
                          <span className="mt-0.5 block truncate text-xs font-bold text-[#64748B]">
                            {candidate.businessName ?? candidate.eligibilityLabel}
                          </span>
                          <span
                            className={`mt-1 inline-flex max-w-full rounded-full px-2 py-0.5 text-[11px] font-black ${
                              candidate.isSelectable
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-amber-50 text-amber-800"
                            }`}
                          >
                            <span className="truncate">
                              {candidate.availabilityLabel}
                              {candidate.isAssigned ? "" : ` · ${candidate.eligibilityLabel}`}
                            </span>
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-xs font-black ${
                            isSelected
                              ? "border-[#2563EB] bg-[#2563EB] text-white"
                              : "border-[#CBD5E1] text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                      </button>
                    );
                  })
                ) : technicianProfilesState.status === "ready" ? (
                  <p className="py-5 text-center text-sm font-bold text-[#64748B]">
                    No technicians match this search.
                  </p>
                ) : null}
              </div>

              {technicianAssignmentSaveState.status === "error" ? (
                <p className="mt-3 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                  {technicianAssignmentSaveState.message}
                </p>
              ) : null}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className="min-h-11 rounded-[12px] border border-[#CBD5E1] bg-white px-4 text-sm font-black text-[#334155]"
                  onClick={closeTechnicianSheet}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="min-h-11 rounded-[12px] bg-[#2563EB] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    technicianAssignmentSaveState.status === "saving" ||
                    !selectedAssignmentTechnicianId
                  }
                  onClick={() => void saveTechnicianAssignment()}
                  type="button"
                >
                  {technicianAssignmentSaveState.status === "saving"
                    ? "Saving..."
                    : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isScheduleSheetOpen ? (
        <div
          aria-modal="true"
          className={`fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/45 px-3 transition-opacity duration-200 ease-out lg:hidden ${
            isScheduleSheetVisible && !isClosingScheduleSheet
              ? "opacity-100"
              : "opacity-0"
          }`}
          role="dialog"
        >
          <button
            aria-label="Close schedule editor"
            className="absolute inset-0 cursor-default"
            onClick={closeScheduleSheet}
            type="button"
          />
          <div
            className={`relative z-10 max-h-[70dvh] w-full max-w-md rounded-t-[24px] border border-[#E5E7EB] bg-white shadow-[0_-18px_50px_rgba(15,23,42,0.22)] transition-transform duration-300 ease-out ${
              isScheduleSheetVisible && !isClosingScheduleSheet
                ? "translate-y-0"
                : "translate-y-full"
            }`}
          >
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-[#CBD5E1]" />
            <div className="flex items-center justify-between gap-3 px-4 pt-4">
              <h2 className="text-lg font-black text-[#0F172A]">Reschedule</h2>
              <button
                aria-label="Close schedule editor"
                className="flex h-9 w-9 items-center justify-center rounded-full text-xl font-black text-[#64748B] transition active:bg-[#F1F5F9]"
                onClick={closeScheduleSheet}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="max-h-[calc(70dvh-68px)] overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
              <div className="grid gap-3">
                <label className="grid gap-1 text-sm font-black text-[#0F172A]">
                  Start date
                  <input
                    className="h-11 rounded-[12px] border border-[#CBD5E1] bg-white px-3 text-sm font-bold text-[#0F172A] outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100"
                    onChange={(event) =>
                      updateScheduleDraft({ startDate: event.target.value })
                    }
                    onInput={(event) =>
                      updateScheduleDraft({
                        startDate: event.currentTarget.value,
                      })
                    }
                    type="date"
                    value={scheduleDraft.startDate}
                  />
                </label>
                <label className="grid gap-1 text-sm font-black text-[#0F172A]">
                  Start time
                  <input
                    className="h-11 rounded-[12px] border border-[#CBD5E1] bg-white px-3 text-sm font-bold text-[#0F172A] outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100"
                    onChange={(event) =>
                      updateScheduleDraft({ startTime: event.target.value })
                    }
                    onInput={(event) =>
                      updateScheduleDraft({
                        startTime: event.currentTarget.value,
                      })
                    }
                    type="time"
                    value={scheduleDraft.startTime}
                  />
                </label>
                <label className="grid gap-1 text-sm font-black text-[#0F172A]">
                  End date
                  <input
                    className="h-11 rounded-[12px] border border-[#CBD5E1] bg-white px-3 text-sm font-bold text-[#0F172A] outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100"
                    onChange={(event) =>
                      updateScheduleDraft({ endDate: event.target.value })
                    }
                    onInput={(event) =>
                      updateScheduleDraft({
                        endDate: event.currentTarget.value,
                      })
                    }
                    type="date"
                    value={scheduleDraft.endDate}
                  />
                </label>
                <label className="grid gap-1 text-sm font-black text-[#0F172A]">
                  End time
                  <input
                    className="h-11 rounded-[12px] border border-[#CBD5E1] bg-white px-3 text-sm font-bold text-[#0F172A] outline-none transition focus:border-[#2563EB] focus:ring-4 focus:ring-blue-100"
                    onChange={(event) =>
                      updateScheduleDraft({ endTime: event.target.value })
                    }
                    onInput={(event) =>
                      updateScheduleDraft({
                        endTime: event.currentTarget.value,
                      })
                    }
                    type="time"
                    value={scheduleDraft.endTime}
                  />
                </label>
              </div>
              {scheduleSheetSaveState.message ? (
                <p
                  className={`mt-3 text-sm font-bold ${
                    scheduleSheetSaveState.status === "error"
                      ? "text-red-600"
                      : "text-emerald-700"
                  }`}
                >
                  {scheduleSheetSaveState.message}
                </p>
              ) : null}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className="min-h-11 rounded-[12px] border border-[#CBD5E1] bg-white px-4 text-sm font-black text-[#334155] transition active:bg-[#F8FAFC]"
                  disabled={scheduleSheetSaveState.status === "saving"}
                  onClick={closeScheduleSheet}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="min-h-11 rounded-[12px] bg-[#2563EB] px-4 text-sm font-black text-white transition active:bg-[#1D4ED8] disabled:cursor-wait disabled:opacity-70"
                  disabled={scheduleSheetSaveState.status === "saving"}
                  onClick={() => void saveScheduleFromSheet()}
                  type="button"
                >
                  {scheduleSheetSaveState.status === "saving" ? "Saving..." : "Save"}
                </button>
              </div>
              <p className="mt-3 text-xs font-semibold leading-5 text-[#64748B]">
                Schedule later is not available yet because this job can only
                have one active appointment window.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <section className="mt-3 hidden rounded-2xl border border-blue-100 bg-blue-50 p-4 lg:block">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
              Next action
            </p>
            <h2 className="mt-1 text-xl font-black text-[#0F172A]">
              {operationalNextStep.title}
            </h2>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-[#334155]">
              {operationalNextStep.body}
            </p>
          </div>
          <button
            className="rounded-[12px] bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={statusUpdateState.status === "saving"}
            onClick={() => {
              if ("status" in operationalNextStep) {
                void updateStatus(operationalNextStep.status);
                return;
              }

              if ("tab" in operationalNextStep) {
                setActiveJobTab(operationalNextStep.tab);
              }
            }}
            type="button"
          >
            {operationalNextStep.actionLabel}
          </button>
        </div>
      </section>

      <section className="mt-3 grid gap-0 xl:grid-cols-[1.1fr_0.9fr] xl:gap-3">
        <div className="border-y border-[#E5E7EB] bg-white py-3 lg:hidden">
          <div className="flex min-h-9 items-center justify-between gap-3">
            <h2 className="text-base font-black text-[#0F172A]">Client</h2>
            {customerProfileHref ? (
              <Link
                className="inline-flex min-h-9 items-center text-sm font-bold text-[#2563EB]"
                href={customerProfileHref}
              >
                View Client Details <span aria-hidden="true" className="ml-1">›</span>
              </Link>
            ) : (
              <span className="text-xs font-bold text-[#94A3B8]">
                Client details unavailable
              </span>
            )}
          </div>

          <div className="mt-2 grid grid-cols-[60px_minmax(0,1fr)_36px] items-start gap-3">
            <button
              aria-label="Change client avatar"
              className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[#E0F2FE] text-base font-black text-[#0369A1] transition active:scale-[0.98] disabled:cursor-wait"
              disabled={avatarActionState.status === "saving"}
              onClick={() => {
                setAvatarActionState({ status: "idle", message: null });
                setIsAvatarSheetOpen(true);
              }}
              type="button"
            >
              {clientAvatar.signedUrl ? (
                <span
                  aria-hidden="true"
                  className="h-full w-full bg-cover bg-center"
                  style={getBackgroundImageStyle(clientAvatar.signedUrl)}
                />
              ) : (
                clientInitials
              )}
              {!clientAvatar.signedUrl ? (
                <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full border border-white bg-[#2563EB] text-[11px] text-white">
                  📷
                </span>
              ) : null}
              {avatarActionState.status === "saving" ? (
                <span className="absolute inset-0 flex items-center justify-center bg-[#0F172A]/45 text-[10px] font-black uppercase tracking-[0.08em] text-white">
                  Uploading
                </span>
              ) : null}
            </button>
            <input
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              capture={avatarCaptureMode ? "environment" : undefined}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                void uploadClientAvatar(file);
              }}
              ref={avatarFileInputRef}
              type="file"
            />
            <div className="min-w-0">
              {avatarActionState.status === "error" && avatarActionState.message ? (
                <p className="mb-1 text-xs font-bold text-red-600">
                  {avatarActionState.message}
                </p>
              ) : null}
              {customerProfileHref ? (
                <Link
                  className="block truncate text-base font-black leading-5 text-[#0F172A]"
                  href={customerProfileHref}
                >
                  {request.customerName}
                </Link>
              ) : (
                <p className="truncate text-base font-black leading-5 text-[#0F172A]">
                  {request.customerName}
                </p>
              )}
              <button
                aria-label="Open service address in Google Maps"
                className="mt-1 block w-full rounded-[8px] py-0.5 text-left transition active:bg-[#F8FAFC] disabled:cursor-default"
                disabled={!hasRoutableAddress}
                onClick={() => setIsMapConfirmOpen(true)}
                type="button"
              >
                <span className="block break-words text-sm font-semibold leading-5 text-[#475569]">
                  {clientStreetLine || "No service address recorded"}
                </span>
                {clientCityLine ? (
                  <span className="block break-words text-sm font-semibold leading-5 text-[#475569]">
                    {clientCityLine}
                  </span>
                ) : null}
              </button>
              {clientDistance.status === "missing_origin" && clientDistance.setupHref ? (
                <Link
                  className="mt-1 inline-flex text-xs font-bold text-[#2563EB]"
                  href={clientDistance.setupHref}
                >
                  {clientDistanceLabel}
                </Link>
              ) : (
                <p className="mt-1 text-xs font-bold text-[#94A3B8]">
                  {clientDistanceLabel}
                </p>
              )}
            </div>
            <button
              aria-label="Edit client for this job"
              className="flex min-h-11 w-9 items-start justify-end pt-0.5 text-xl font-black leading-none text-[#2563EB]"
              onClick={openClientEditor}
              type="button"
            >
              ✎
            </button>
          </div>

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_52px] gap-2">
            {callCustomerHref ? (
              <a
                className="grid min-h-11 min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-center gap-1 rounded-[12px] border border-emerald-200 bg-white px-3 text-sm font-black text-[#0F172A] transition active:bg-emerald-50"
                href={callCustomerHref}
              >
                <PhoneHandsetIcon />
                <span className="min-w-0 justify-self-center truncate pr-3">{clientPhoneDisplay}</span>
              </a>
            ) : (
              <button
                className="grid min-h-11 min-w-0 cursor-not-allowed grid-cols-[1rem_minmax(0,1fr)] items-center gap-1 rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 text-sm font-black text-[#94A3B8]"
                disabled
                type="button"
              >
                <PhoneHandsetIcon />
                <span className="min-w-0 justify-self-center truncate pr-3">{clientPhoneDisplay}</span>
              </button>
            )}
            {textCustomerHref ? (
              <a
                aria-label="Message client"
                className="flex min-h-11 items-center justify-center rounded-[12px] border border-blue-200 bg-white text-xl font-black text-[#2563EB] transition active:bg-blue-50"
                href={textCustomerHref}
              >
                💬
              </a>
            ) : (
              <button
                aria-label="Message client unavailable"
                className="flex min-h-11 cursor-not-allowed items-center justify-center rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] text-xl font-black text-[#CBD5E1]"
                disabled
                type="button"
              >
                💬
              </button>
            )}
          </div>
        </div>

        <div className="hidden rounded-2xl border border-[#E5E7EB] bg-white p-4 lg:block">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
                Customer
              </p>
              <h2 className="mt-1 truncate text-lg font-black text-[#0F172A]">
                {request.customerName}
              </h2>
              <p className="mt-1 text-sm font-semibold text-[#64748B]">
                {request.customerPhone ?? "No phone recorded"}
                {request.customerEmail ? ` · ${request.customerEmail}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {callCustomerHref ? (
                <a
                  className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-black text-emerald-800 transition hover:bg-emerald-100"
                  href={callCustomerHref}
                >
                  Call
                </a>
              ) : null}
              {textCustomerHref ? (
                <a
                  className="rounded-[10px] border border-blue-200 bg-blue-50 px-3 py-2 text-center text-xs font-black text-[#0F6BFF] transition hover:bg-blue-100"
                  href={textCustomerHref}
                >
                  SMS
                </a>
              ) : null}
              {customerProfileHref ? (
                <Link
                  className="rounded-[10px] border border-[#E5E7EB] px-3 py-2 text-center text-xs font-black text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
                  href={customerProfileHref}
                >
                  View Customer
                </Link>
              ) : null}
              {hasRoutableAddress ? (
                <a
                  className="rounded-[10px] border border-[#E5E7EB] px-3 py-2 text-center text-xs font-black text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
                  href={googleMapsUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Navigate
                </a>
              ) : null}
            </div>
          </div>
          <div className="mt-3 rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
              Service Address
            </p>
            <p className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-[#334155]">
              {fullAddress || addressSummary}
            </p>
          </div>
        </div>

        <section className="border-b border-[#E5E7EB] bg-white lg:hidden">
          <button
            aria-label="Reschedule job"
            className="flex min-h-[68px] w-full items-center gap-3 px-1 py-2.5 text-left transition active:bg-[#F8FAFC]"
            onClick={openScheduleSheet}
            type="button"
          >
            <span className="w-[74px] shrink-0 text-sm font-black text-[#0F172A]">
              Schedule
            </span>
            <ScheduleCalendarIcon />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-black text-[#0F172A]">
                {mobileScheduleDateLabel}
              </span>
              <span className="mt-0.5 block truncate text-xs font-bold text-[#64748B]">
                {mobileScheduleTimeLabel}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="flex min-h-10 w-7 shrink-0 items-center justify-end text-xl font-black leading-none text-[#2563EB]"
            >
              ✎
            </span>
          </button>
        </section>

        <section className="border-b border-[#E5E7EB] bg-white lg:hidden">
          <button
            className="grid min-h-12 w-full grid-cols-[94px_minmax(0,1fr)] items-center gap-3 px-1 text-left transition active:bg-[#F8FAFC]"
            onClick={() => openJobDetailsSheet("jobType")}
            type="button"
          >
            <span className="py-3 text-sm font-black text-[#0F172A]">
              Job Name
            </span>
            <span className="flex min-w-0 items-center gap-3 border-b border-[#E5E7EB] py-3">
              <span className="min-w-0 flex-1 truncate text-right text-sm font-bold text-[#334155]">
                {jobSummaryTitle}
              </span>
              <span aria-hidden="true" className="w-7 shrink-0 text-right text-xl font-black text-[#2563EB]">
                ✎
              </span>
            </span>
          </button>
          <button
            className="grid min-h-12 w-full grid-cols-[94px_minmax(0,1fr)] items-center gap-3 px-1 text-left transition active:bg-[#F8FAFC]"
            onClick={() => openJobDetailsSheet("problem")}
            type="button"
          >
            <span className="py-3 text-sm font-black text-[#0F172A]">
              Description
            </span>
            <span className="flex min-w-0 items-center gap-3 border-b border-[#E5E7EB] py-3">
              <span className="min-w-0 flex-1 truncate text-right text-sm font-bold text-[#334155]">
                {jobSummaryComplaint}
              </span>
              <span aria-hidden="true" className="w-7 shrink-0 text-right text-xl font-black text-[#2563EB]">
                ✎
              </span>
            </span>
          </button>
          <button
            className="grid min-h-12 w-full grid-cols-[94px_minmax(0,1fr)] items-center gap-3 px-1 text-left transition active:bg-[#F8FAFC]"
            onClick={() => openJobDetailsSheet("tags")}
            type="button"
          >
            <span className="py-3 text-sm font-black text-[#0F172A]">
              Tags
            </span>
            <span className="flex min-w-0 items-center gap-3 py-3">
              <span className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden">
                {visibleTags.length > 0 ? (
                  visibleTags.map((tag) => (
                    <span
                      className={`max-w-[92px] truncate rounded-full border px-2 py-0.5 text-[11px] font-black ${toTagToneClass(tag.tone)}`}
                      key={tag.id}
                    >
                      {tag.name}
                    </span>
                  ))
                ) : (
                  <span className="text-sm font-bold text-[#94A3B8]">No tags</span>
                )}
                {hiddenTagsCount > 0 ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-black text-slate-700">
                    +{hiddenTagsCount}
                  </span>
                ) : null}
              </span>
              <span aria-hidden="true" className="w-7 shrink-0 text-right text-xl font-black text-[#2563EB]">
                +
              </span>
            </span>
          </button>
          {jobDetailsState.status === "error" ? (
            <p className="border-t border-[#E5E7EB] px-1 py-2 text-xs font-bold text-amber-700">
              {jobDetailsState.error}
            </p>
          ) : null}
        </section>

        <section className="border-b border-[#E5E7EB] bg-white lg:hidden">
          <button
            aria-label="Assign technician"
            className="grid min-h-12 w-full grid-cols-[94px_minmax(0,1fr)] items-center gap-3 px-1 text-left transition active:bg-[#F8FAFC]"
            onClick={openTechnicianSheet}
            type="button"
          >
            <span className="py-3 text-sm font-black text-[#0F172A]">
              Technician
            </span>
            <span className="flex min-w-0 items-center gap-2 py-3">
              {request.assignedTechnicianProfileId ? (
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black text-white"
                  style={{ backgroundColor: assignedTechnicianAvatarColor }}
                >
                  {assignedTechnicianInitials}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 text-right">
                <span className="block truncate text-sm font-bold text-[#334155]">
                  {mobileAssignedTechnicianLabel}
                </span>
                <span className="mt-0.5 block truncate text-xs font-bold text-[#94A3B8]">
                  {assignedTechnicianMeta}
                </span>
              </span>
              <span aria-hidden="true" className="w-7 shrink-0 text-right text-xl font-black text-[#2563EB]">
                ✎
              </span>
            </span>
          </button>
          {technicianAssignmentSaveState.status === "error" ? (
            <p className="border-t border-[#E5E7EB] px-1 py-2 text-xs font-bold text-amber-700">
              {technicianAssignmentSaveState.message}
            </p>
          ) : null}
        </section>

        <section className="border-b border-[#E5E7EB] bg-white lg:hidden">
          <div
            className="grid min-h-12 w-full grid-cols-[minmax(0,1fr)_96px] items-center gap-3 px-1 text-left transition active:bg-[#F8FAFC]"
            onClick={() => openAttachmentGallery()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openAttachmentGallery();
              }
            }}
          >
            <span className="flex min-w-0 items-center gap-3 py-3">
              <span className="text-sm font-black text-[#0F172A]">
                Attachments
              </span>
              <span className="min-w-0 truncate text-xs font-bold text-[#64748B]">
                {attachmentCountLabel}
              </span>
            </span>
            <span className="flex items-center justify-end gap-1">
              <button
                aria-label="Take attachment photo"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-[#2563EB] transition active:bg-blue-50 disabled:cursor-wait disabled:opacity-50"
                disabled={photoSaveState.status === "saving"}
                onClick={(event) => {
                  event.stopPropagation();
                  openAttachmentCameraPicker();
                }}
                type="button"
              >
                <AttachmentCameraIcon />
              </button>
              <button
                aria-label="Choose attachment from gallery"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-[#2563EB] transition active:bg-blue-50 disabled:cursor-wait disabled:opacity-50"
                disabled={photoSaveState.status === "saving"}
                onClick={(event) => {
                  event.stopPropagation();
                  openAttachmentGalleryPicker();
                }}
                type="button"
              >
                <AttachmentGalleryIcon />
              </button>
            </span>
          </div>
          {photosState.photos.length > 0 ? (
            <div className="flex items-center gap-2 px-1 pb-3">
              {attachmentPreviewPhotos.map((photo, index) => (
                <button
                  aria-label={`Open attachment ${index + 1} of ${photosState.photos.length}`}
                  className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9] text-xs font-bold text-[#64748B] transition active:scale-[0.98]"
                  key={photo.id}
                  onClick={() => openAttachmentGallery(index)}
                  type="button"
                >
                  {photo.signedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={photo.originalFilename ?? photoTypeLabels[photo.photoType]}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      src={photo.signedUrl}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center px-1 text-center">
                      Preview unavailable
                    </span>
                  )}
                </button>
              ))}
              {attachmentOverflowCount > 0 ? (
                <button
                  aria-label={`Open ${attachmentOverflowCount} more attachments`}
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#F1F5F9] text-sm font-black text-[#334155] transition active:scale-[0.98]"
                  onClick={() => openAttachmentGallery(3)}
                  type="button"
                >
                  +{attachmentOverflowCount}
                </button>
              ) : null}
            </div>
          ) : null}
          <input
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              void uploadAttachmentFile(file);
            }}
            ref={attachmentCameraInputRef}
            type="file"
          />
          <input
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              void uploadAttachmentFile(file);
            }}
            ref={attachmentGalleryInputRef}
            type="file"
          />
          {photoSaveState.status === "saving" ? (
            <p className="border-t border-[#E5E7EB] px-1 py-2 text-xs font-bold text-[#64748B]">
              Uploading photo...
            </p>
          ) : photoSaveState.status === "error" && photoSaveState.message ? (
            <p className="border-t border-[#E5E7EB] px-1 py-2 text-xs font-bold text-amber-700">
              {photoSaveState.message}
            </p>
          ) : null}
        </section>

        <div className="hidden rounded-2xl border border-[#E5E7EB] bg-white p-4 lg:block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
                Schedule
              </p>
              <h2 className="mt-1 text-lg font-black text-[#0F172A]">
                {scheduledDateLabel}
              </h2>
              <p className="mt-1 text-sm font-semibold text-[#64748B]">
                {scheduledTimeLabel}
              </p>
            </div>
            <button
              className="rounded-[10px] border border-[#E5E7EB] px-3 py-2 text-xs font-black text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
              onClick={() => setActiveJobTab("appointment")}
              type="button"
            >
              Edit
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
                Assigned
              </p>
              <p className="mt-1 text-sm font-semibold text-[#334155]">
                {assignedTechnicianLabel}
              </p>
            </div>
            <div className="rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
                Location
              </p>
              <p className="mt-1 text-sm font-semibold text-[#334155]">
                {shortLocation || "Location not set"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="hidden lg:mt-3 lg:grid lg:gap-3 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
                Appliance / Problem
              </p>
              <h2 className="mt-1 text-lg font-black text-[#0F172A]">
                {request.applianceBrand ?? "Unknown brand"} {request.applianceType}
              </h2>
              <p className="mt-1 text-sm font-semibold text-[#64748B]">
                Model: {request.applianceModel ?? "Not recorded"} · Serial: Not recorded
              </p>
            </div>
            <button
              className="rounded-[10px] border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-[#0F6BFF] transition hover:bg-blue-100"
              onClick={() => setActiveJobTab("estimate")}
              type="button"
            >
              Estimate
            </button>
          </div>
          <div className="mt-3 rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
              Customer complaint
            </p>
            <p className="mt-1 text-sm font-semibold leading-6 text-[#334155]">
              {request.issueDescription}
            </p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-[12px] border border-[#E5E7EB] bg-white p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
                Estimate
              </p>
              <p className="mt-1 text-sm font-semibold text-[#334155]">
                {latestEstimate
                  ? `${latestEstimate.estimateNumber} · ${formatServiceRequestSource(
                      latestEstimate.estimateStatus,
                    )} · ${formatServiceRequestMoney(latestEstimate.total)}`
                  : "No estimate yet"}
              </p>
            </div>
            <div className="rounded-[12px] border border-[#E5E7EB] bg-white p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
                Invoice
              </p>
              <p className="mt-1 text-sm font-semibold text-[#334155]">
                {latestInvoice
                  ? `${latestInvoice.invoiceNumber} · ${formatServiceRequestSource(
                      latestInvoice.invoiceStatus,
                    )} · ${formatServiceRequestMoney(latestInvoice.total)}`
                  : "No invoice yet"}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
            Technician findings
          </p>
          <h2 className="mt-1 text-lg font-black text-[#0F172A]">
            Diagnosis notes
          </h2>
          {latestDiagnosticNote ? (
            <p className="mt-2 rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] p-3 text-sm font-semibold leading-6 text-[#334155]">
              {latestDiagnosticNote.body}
            </p>
          ) : null}
          <textarea
            ref={technicianFindingsInputRef}
            className="mt-3 min-h-28 w-full rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 text-sm font-semibold text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#0F6BFF]"
            disabled={technicianFindingsSaveState.status === "saving"}
            onChange={(event) => {
              setTechnicianFindingsDraft(event.target.value);
              setTechnicianFindingsSaveState({ status: "idle", message: null });
            }}
            placeholder="Type or dictate findings. Example: Evaporator packed with ice. Fan not spinning."
            value={technicianFindingsDraft}
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              className="rounded-[10px] bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                technicianFindingsSaveState.status === "saving" ||
                !technicianFindingsDraft.trim()
              }
              onClick={() => void saveTechnicianFindings()}
              type="button"
            >
              {technicianFindingsSaveState.status === "saving"
                ? "Saving..."
                : "Save Findings"}
            </button>
            <button
              className="rounded-[10px] border border-[#E5E7EB] px-4 py-3 text-sm font-black text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
              onClick={() => setActiveJobTab("notes")}
              type="button"
            >
              Notes
            </button>
          </div>
          {technicianFindingsSaveState.message ? (
            <p
              className={`mt-3 text-sm font-semibold ${
                technicianFindingsSaveState.status === "error"
                  ? "text-amber-800"
                  : "text-[#0F6BFF]"
              }`}
            >
              {technicianFindingsSaveState.message}
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-3 hidden rounded-2xl border border-[#E5E7EB] bg-white p-4 lg:block">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
              Photos / Attachments
            </p>
            <h2 className="mt-1 text-lg font-black text-[#0F172A]">
              Add repair photos fast
            </h2>
            <p className="mt-1 text-sm font-semibold text-[#64748B]">
              {photosState.photos.length} photo{photosState.photos.length === 1 ? "" : "s"} attached
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-[10px] bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white transition hover:bg-[#0057D9]"
              onClick={() => setActiveJobTab("photos")}
              type="button"
            >
              Add Photo
            </button>
            <button
              className="rounded-[10px] border border-[#E5E7EB] px-4 py-3 text-sm font-black text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
              onClick={() => setActiveJobTab("photos")}
              type="button"
            >
              Gallery
            </button>
          </div>
        </div>
        {recentPhotos.length > 0 ? (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:max-w-md">
            {recentPhotos.map((photo) => (
              <div
                className="aspect-square overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC]"
                key={photo.id}
              >
                <div
                  aria-label={photo.originalFilename ?? "Service request photo"}
                  className="h-full w-full bg-cover bg-center"
                  role="img"
                  style={getBackgroundImageStyle(photo.signedUrl ?? "")}
                />
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <details className="mt-3 hidden rounded-2xl border border-[#E5E7EB] bg-white p-4 lg:block">
        <summary className="cursor-pointer text-sm font-black text-[#0F172A]">
          More job controls
        </summary>
        <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
              Status workflow
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {workflowActions.map((action) => (
                <button
                  className={getWorkflowActionClasses(action.tone)}
                  disabled={
                    statusUpdateState.status === "saving" ||
                    request.status === action.status
                  }
                  key={action.label}
                  onClick={() => void updateStatus(action.status)}
                  type="button"
                >
                  <span className="block">{action.label}</span>
                  <span className="mt-0.5 block text-[11px] font-bold opacity-75">
                    {action.helper}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
              Parts
            </p>
            <h2 className="mt-1 text-lg font-black text-[#0F172A]">
              {partsWorkflowLabel}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#64748B]">
              {latestPartsNote?.body ??
                "Use parts statuses only when ordering, receiving, or scheduling a return visit."}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                ["Parts Needed", "parts_needed"],
                ["Parts Ordered", "parts_ordered"],
                ["Parts Received", "parts_received"],
                ["Return Visit", "return_visit_scheduled"],
              ].map(([label, status]) => (
                <button
                  className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-left text-xs font-black text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={
                    statusUpdateState.status === "saving" ||
                    request.status === status
                  }
                  key={status}
                  onClick={() => void updateStatus(status as ServiceRequestCrmStatus)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
            <p className="text-xl font-black text-[#0F172A]">
              {notesState.notes.length}
            </p>
            <p className="text-xs font-bold text-[#64748B]">Notes</p>
          </div>
          <div className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
            <p className="text-xl font-black text-[#0F172A]">
              {photosState.photos.length}
            </p>
            <p className="text-xs font-bold text-[#64748B]">Photos</p>
          </div>
          <div className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
            <p className="text-xl font-black text-[#0F172A]">
              {timelineItems.length}
            </p>
            <p className="text-xs font-bold text-[#64748B]">Timeline</p>
          </div>
        </div>
      </details>

      <details className="mt-3 hidden rounded-2xl border border-[#E5E7EB] bg-white p-4 lg:block">
        <summary className="cursor-pointer text-sm font-black text-[#0F172A]">
          Service address details
        </summary>
        <div className="mt-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F6BFF]">
              Service Address
            </p>
            <h2 className="mt-2 text-xl font-bold text-[#0F172A]">
              {request.streetAddress
                ? fullAddress
                : "Address needs street details"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64748B]">
              {request.streetAddress
                ? "Use the map buttons for navigation and confirm the address before dispatch."
                : `Current request has ZIP-level location only: ${request.city ? `${request.city}, ` : ""}${request.state} ${request.zipCode}. Add the street address before dispatch.`}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <a
              className={`rounded-md border px-3 py-2 text-center text-xs font-bold transition ${
                hasRoutableAddress
                  ? "border-blue-200 text-[#0F6BFF] hover:bg-blue-50"
                  : "pointer-events-none border-[#E5E7EB] text-[#64748B]"
              }`}
              href={hasRoutableAddress ? googleMapsUrl : "#"}
              rel="noreferrer"
              target="_blank"
            >
              Open in Google Maps
            </a>
            <a
              className={`rounded-md border px-3 py-2 text-center text-xs font-bold transition ${
                hasRoutableAddress
                  ? "border-[#E5E7EB] text-[#334155] hover:bg-[#F8FAFC]"
                  : "pointer-events-none border-[#E5E7EB] text-[#64748B]"
              }`}
              href={hasRoutableAddress ? appleMapsUrl : "#"}
              rel="noreferrer"
              target="_blank"
            >
              Open in Apple Maps
            </a>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#64748B]">
              Service Address
            </p>
            <p className="mt-2 font-semibold text-[#334155]">
              {fullAddress || "Not provided"}
            </p>
          </div>
          <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#64748B]">
              Navigation data
            </p>
            <p className="mt-2 font-semibold text-[#334155]">
              {hasCoordinates
                ? `${request.latitude}, ${request.longitude}`
                : "Coordinates not set yet"}
            </p>
          </div>
        </div>

        {showSaveServiceAddressAsCustomerPrimary ? (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-black text-emerald-900">
                  Use this service address as the customer&apos;s primary address?
                </p>
                <p className="mt-1 text-sm font-semibold leading-6 text-emerald-800">
                  This copies the current job service address to the customer profile. It does not change this job or any historical jobs.
                </p>
              </div>
              <button
                className="rounded-md bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={addressSaveState.status === "saving"}
                onClick={() => void saveAddressAsCustomerPrimary()}
                type="button"
              >
                Save as Customer Primary Address
              </button>
            </div>
          </div>
        ) : null}

        {isEditingAddress ? (
          <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 p-4">
            {addressAutocomplete.isConfigured ? (
              <div className="mb-4">
                <label className="block">
                  <span className="text-sm font-bold text-[#0F172A]">
                    Search address
                  </span>
                  <input
                    className="mt-2 w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-3 text-sm text-[#0F172A] outline-none transition placeholder:text-[#64748B] focus:border-[#0F6BFF]"
                    onChange={(event) =>
                      setAddressSearchQuery(event.target.value)
                    }
                    placeholder="Start typing a Houston or Katy address"
                    value={addressSearchQuery}
                  />
                </label>
                <div className="mt-2 overflow-hidden rounded-md border border-[#E5E7EB] bg-white">
                  {addressSuggestionState.status === "loading" ? (
                    <p className="px-3 py-3 text-sm font-semibold text-[#0F6BFF]">
                      Searching addresses...
                    </p>
                  ) : null}
                  {addressSuggestionState.status === "empty" ? (
                    <p className="px-3 py-3 text-sm font-semibold text-[#64748B]">
                      {addressSuggestionState.message}
                    </p>
                  ) : null}
                  {addressSuggestionState.status === "error" ? (
                    <p className="px-3 py-3 text-sm font-semibold text-amber-800">
                      {addressSuggestionState.message}
                    </p>
                  ) : null}
                  {addressSuggestions.map((suggestion) => (
                    <button
                      className="block w-full border-t border-[#E5E7EB] px-3 py-3 text-left text-sm font-semibold text-[#334155] transition first:border-t-0 hover:bg-blue-50 hover:text-[#0F6BFF]"
                      key={suggestion.placeId ?? suggestion.label}
                      onClick={() => void selectAddressSuggestion(suggestion)}
                      type="button"
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs font-semibold leading-5 text-[#64748B]">
                  Google Places suggestions fill the structured fields below.
                  You can still edit any field manually before saving.
                </p>
              </div>
            ) : (
              <p className="mb-4 rounded-md border border-[#E5E7EB] bg-white p-3 text-xs font-semibold leading-5 text-[#64748B]">
                Address autocomplete is unavailable. Manual entry remains
                available.
              </p>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-sm font-bold text-[#0F172A]">
                  Street address
                </span>
                <input
                  className="mt-2 w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-3 text-sm text-[#0F172A] outline-none transition placeholder:text-[#64748B] focus:border-[#0F6BFF]"
                  onChange={(event) =>
                    updateAddressField("streetAddress", event.target.value)
                  }
                  placeholder="1234 Main St"
                  value={addressForm.streetAddress}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-[#0F172A]">
                  Unit / gate / access
                </span>
                <input
                  className="mt-2 w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-3 text-sm text-[#0F172A] outline-none transition placeholder:text-[#64748B] focus:border-[#0F6BFF]"
                  onChange={(event) =>
                    updateAddressField("unit", event.target.value)
                  }
                  placeholder="Apt 1204, gate code, building"
                  value={addressForm.unit}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-[#0F172A]">City</span>
                <input
                  className="mt-2 w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-3 text-sm text-[#0F172A] outline-none transition placeholder:text-[#64748B] focus:border-[#0F6BFF]"
                  onChange={(event) =>
                    updateAddressField("city", event.target.value)
                  }
                  placeholder="Houston"
                  value={addressForm.city}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-[#0F172A]">State</span>
                <input
                  className="mt-2 w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-3 text-sm text-[#0F172A] outline-none transition placeholder:text-[#64748B] focus:border-[#0F6BFF]"
                  maxLength={2}
                  onChange={(event) =>
                    updateAddressField(
                      "state",
                      event.target.value.toUpperCase(),
                    )
                  }
                  placeholder="TX"
                  value={addressForm.state}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-[#0F172A]">ZIP</span>
                <input
                  className="mt-2 w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-3 text-sm text-[#0F172A] outline-none transition placeholder:text-[#64748B] focus:border-[#0F6BFF]"
                  inputMode="numeric"
                  maxLength={5}
                  onChange={(event) =>
                    updateAddressField(
                      "zipCode",
                      event.target.value.replace(/[^0-9]/g, "").slice(0, 5),
                    )
                  }
                  placeholder="77024"
                  value={addressForm.zipCode}
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-[#0F172A]">Country</span>
                <input
                  className="mt-2 w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-3 text-sm text-[#0F172A] outline-none transition placeholder:text-[#64748B] focus:border-[#0F6BFF]"
                  maxLength={2}
                  onChange={(event) =>
                    updateAddressField(
                      "country",
                      event.target.value.toUpperCase(),
                    )
                  }
                  placeholder="US"
                  value={addressForm.country}
                />
              </label>
              <div className="rounded-md border border-[#E5E7EB] bg-white p-3 md:col-span-2">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#64748B]">
                  Selected place details
                </p>
                <p className="mt-2 text-xs font-semibold leading-5 text-[#334155]">
                  {addressForm.placeId
                    ? `Google place ID captured. ${
                        addressForm.latitude !== null &&
                        addressForm.longitude !== null
                          ? `Coordinates: ${addressForm.latitude}, ${addressForm.longitude}`
                          : "Coordinates not available."
                      }`
                    : "No saved place selected. Manual address can still be saved."}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                className="rounded-md bg-[#0F6BFF] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={addressSaveState.status === "saving"}
                onClick={() => void saveAddress()}
                type="button"
              >
                {addressSaveState.status === "saving"
                  ? "Saving..."
                  : "Save Service Address"}
              </button>
              <button
                className="rounded-md border border-[#E5E7EB] px-4 py-3 text-sm font-bold text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
                disabled={addressSaveState.status === "saving"}
                onClick={resetAddressForm}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="mt-4 rounded-md border border-[#E5E7EB] px-4 py-3 text-sm font-bold text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
            onClick={() => {
              setAddressForm(buildAddressFormState(request));
              setAddressSearchQuery("");
              setAddressSuggestions([]);
              setAddressSuggestionState({ status: "idle", message: null });
              setAddressSaveState({ status: "idle", message: null });
              setIsEditingAddress(true);
            }}
            type="button"
          >
            Edit Service Address
          </button>
        )}

        {addressSaveState.message ? (
          <p
            className={`mt-3 text-sm font-semibold ${
              addressSaveState.status === "error"
                ? "text-amber-800"
                : "text-[#0F172A]"
            }`}
          >
            {addressSaveState.message}
          </p>
        ) : null}
        </div>
      </details>
        </>
      ) : null}

      {activeJobTab === "appointment" ? (
      <section className="mt-6 rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F6BFF]">
              Scheduling assistant
            </p>
            <h2 className="mt-2 text-xl font-bold text-[#0F172A]">
              Recommended technician and window
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64748B]">
              Review the recommended technician, window, and customer-safe
              response before booking.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
            <StatusBadge
              tone={
                schedulingPreview.status === "success"
                  ? "emerald"
                  : schedulingPreview.status === "partial"
                    ? "amber"
                    : "slate"
              }
            >
              {formatServiceRequestSource(schedulingPreview.status)}
            </StatusBadge>
            <button
              className="rounded-md bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={dispatcherSnapshotSaveState.status === "saving"}
              onClick={() => void saveDispatcherPreviewSnapshot()}
              type="button"
            >
              {dispatcherSnapshotSaveState.status === "saving"
                ? "Saving..."
                : "Save dispatcher preview"}
            </button>
            <button
              className="rounded-md bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canBookRecommendedAppointment}
              onClick={() => void bookRecommendedAppointment()}
              type="button"
            >
              {appointmentBookingState.status === "booking"
                ? "Booking..."
                : request.appointmentId
                  ? "Appointment booked"
                  : "Book Appointment"}
            </button>
          </div>
        </div>

        {dispatcherSnapshotSaveState.message ? (
          <p
            className={`mt-3 text-sm font-semibold ${
              dispatcherSnapshotSaveState.status === "error"
                ? "text-amber-800"
                : "text-[#0F172A]"
            }`}
          >
            {dispatcherSnapshotSaveState.message}
          </p>
        ) : null}

        {appointmentBookingState.message ? (
          <p
            className={`mt-3 text-sm font-semibold ${
              appointmentBookingState.status === "error"
                ? "text-amber-800"
                : "text-[#0F172A]"
            }`}
          >
            {appointmentBookingState.message}
          </p>
        ) : null}

        <div className="mt-4 rounded-md border border-[#E5E7EB] bg-white p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-[#0F172A]">
                {bestTechnicianMatch?.displayName ?? "No technician matched"} ·{" "}
                {schedulingBestRecommendation?.customerWindowLabel ??
                  scheduledWindowLabel ??
                  "No window selected"}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#64748B]">
                Scheduling details are collapsed by default. Expand when
                reviewing technician match, availability, or customer response.
              </p>
            </div>
            <button
              className="rounded-md border border-[#E5E7EB] px-3 py-2 text-xs font-bold text-[#0F6BFF] transition hover:bg-[#0F6BFF]/10"
              onClick={() =>
                setIsDispatcherPreviewExpanded((current) => !current)
              }
              type="button"
            >
              {isDispatcherPreviewExpanded
                ? "Hide details"
                : "Show details"}
            </button>
          </div>
        </div>

        {isDispatcherPreviewExpanded ? (
          <>
        {technicianProfilesState.status === "loading" ? (
          <p className="mt-3 text-sm font-semibold text-[#64748B]">
            Loading real technician profiles for matching...
          </p>
        ) : null}

        {technicianProfilesState.status === "error" ? (
          <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-800">
            Technician matching unavailable: {technicianProfilesState.error}
          </p>
        ) : null}

        {technicianAvailabilityRulesState.status === "loading" ? (
          <p className="mt-3 text-sm font-semibold text-[#64748B]">
            Loading technician availability rules...
          </p>
        ) : null}

        {technicianAvailabilityRulesState.status === "error" ? (
          <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-800">
            Availability awareness unavailable:{" "}
            {technicianAvailabilityRulesState.error}
          </p>
        ) : null}

        {technicianProfilesState.status === "ready" &&
        technicianProfilesState.profiles.length > 0 &&
        !bestTechnicianMatch ? (
          <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-800">
            No eligible real technician matched this ZIP and profile status.
            Check service ZIP coverage, technician status, and availability.
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <div className="rounded-md border border-[#E5E7EB] bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#64748B]">
              Normalized request
            </p>
            <p className="mt-2 text-sm font-semibold text-[#334155]">
              ZIP {schedulingPreview.normalizedIntake.location.zipCode ?? "missing"}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#64748B]">
              {schedulingPreview.normalizedIntake.service.applianceType ??
                "No appliance"}{" "}
              · {schedulingPreview.normalizedIntake.service.brand ?? "No brand"}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#64748B]">
              Window:{" "}
              {schedulingPreview.normalizedIntake.preferences.preferredTimeWindow ??
                "not provided"}
            </p>
          </div>

          <div className="rounded-md border border-[#E5E7EB] bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#64748B]">
              Recommended technician
            </p>
            <p className="mt-2 text-sm font-semibold text-[#334155]">
              {bestTechnicianMatch?.displayName ?? "No technician matched"}
            </p>
            {bestTechnicianMatch?.businessName ? (
              <p className="mt-1 text-xs leading-5 text-[#64748B]">
                {bestTechnicianMatch.businessName}
              </p>
            ) : null}
            {bestTechnicianMatch ? (
              <>
                <p className="mt-1 text-xs leading-5 text-[#64748B]">
                  {bestTechnicianMatch.yearsExperience ?? 0} years experience ·{" "}
                  {formatServiceRequestSource(bestTechnicianMatch.confidence)} confidence
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-[#334155]">
                  {bestTechnicianMatch.reasons.slice(0, 4).map((reason) => (
                    <li key={reason.code}>{reason.label}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-1 text-xs leading-5 text-[#64748B]">
                Real technician matching uses workspace-accessible CRM profiles only;
                no static fallback is used.
              </p>
            )}
          </div>

          <div className="rounded-md border border-[#E5E7EB] bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#64748B]">
              Window recommendation
            </p>
            <p className="mt-2 text-sm font-semibold text-[#334155]">
              {schedulingBestRecommendation?.customerWindowLabel ??
                "No available recommendation"}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#64748B]">
              {schedulingBestRecommendation
                ? bestTechnicianAvailability?.hasAvailability
                  ? "Uses technician availability rules; no exact arrival promise."
                  : "No availability windows are saved for this technician."
                : "Review warnings/errors before contacting the customer."}
            </p>
          </div>

          <div className="rounded-md border border-[#E5E7EB] bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#64748B]">
              Backups
            </p>
            <p className="mt-2 text-sm font-semibold text-[#334155]">
              {backupTechnicianMatches.length} technician ·{" "}
              {schedulingBackupRecommendations.length} window backup option
              {schedulingBackupRecommendations.length === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#64748B]">
              {technicianMatching.eligibleTechnicians} eligible from{" "}
              {technicianMatching.techniciansEvaluated} workspace-accessible profile
              {technicianMatching.techniciansEvaluated === 1 ? "" : "s"}.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {backupTechnicianMatches.slice(0, 2).map((match) => (
                <span
                  className="rounded-full border border-[#E5E7EB] px-2 py-1 text-xs font-bold text-[#334155]"
                  key={match.technicianProfileId}
                >
                  {match.displayName}
                </span>
              ))}
              {schedulingBackupRecommendations.slice(0, 2).map((recommendation) => (
                <span
                  className="rounded-full border border-[#E5E7EB] px-2 py-1 text-xs font-bold text-[#334155]"
                  key={`${recommendation.technicianId}-${recommendation.startsAt}`}
                >
                  {recommendation.timeWindowLabel}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-[#E5E7EB] bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#64748B]">
            Technician ranking explanation
          </p>
          {bestTechnicianMatch ? (
            <div className="mt-2 grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
              <div>
                <p className="text-sm font-semibold text-[#334155]">
                  {bestTechnicianMatch.displayName} scored{" "}
                  {bestTechnicianMatch.score} points.
                </p>
                <p className="mt-1 text-xs leading-5 text-[#64748B]">
                  ZIP coverage is weighted highest, appliance specialty is high
                  priority, brand experience and years of experience improve the
                  rank, and profile completeness is a tie-breaker.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 md:justify-end">
                {bestTechnicianMatch.reasons.map((reason) => (
                  <span
                    className="rounded-full border border-blue-200 bg-[#0F6BFF]/10 px-2 py-1 text-xs font-bold text-[#0F172A]"
                    key={reason.code}
                  >
                    +{reason.points} {reason.label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-[#64748B]">
              No ranking explanation is available until at least one verified,
              eligible technician profile covers the request ZIP.
            </p>
          )}
        </div>

        <div className="mt-4 rounded-md border border-[#E5E7EB] bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#64748B]">
            Technician availability rules
          </p>
          {bestTechnicianMatch && bestTechnicianAvailability ? (
            bestTechnicianAvailability.hasAvailability ? (
              <div className="mt-2">
                <p className="text-sm font-semibold text-[#334155]">
                  {bestTechnicianMatch.displayName} has{" "}
                  {bestTechnicianAvailability.configuredDays.length} available
                  day
                  {bestTechnicianAvailability.configuredDays.length === 1
                    ? ""
                    : "s"}
                  .
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {bestTechnicianAvailability.configuredDays.map((day) => (
                    <span
                      className="rounded-full border border-[#E5E7EB] px-2 py-1 text-xs font-bold text-[#334155]"
                      key={`${day.dayOfWeek}-${day.windows.join("-")}`}
                    >
                      {day.label}: {day.windows.join(", ")}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs leading-5 text-[#64748B]">
                  {bestTechnicianAvailability.activeWindowCountForDate} window
                  {bestTechnicianAvailability.activeWindowCountForDate === 1
                    ? ""
                    : "s"}{" "}
                  match the requested dispatcher date.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm leading-6 text-amber-800">
                No availability windows are saved for this technician.
              </p>
            )
          ) : (
            <p className="mt-2 text-sm leading-6 text-[#64748B]">
              Availability rules appear after a real technician match is found.
            </p>
          )}
        </div>

        <div className="mt-4 rounded-md border border-blue-200 bg-[#0F6BFF]/10 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0F6BFF]">
                Appointment booking
              </p>
              <p className="mt-2 text-sm leading-6 text-[#0F172A]">
                {scheduledWindowLabel
                  ? `Booked for ${scheduledWindowLabel}.`
                  : schedulingBestRecommendation
                    ? `Recommended window: ${schedulingBestRecommendation.customerWindowLabel}.`
                    : "No bookable window yet."}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#0F6BFF]/80">
                Booking creates an internal appointment only. It does not send
                SMS, email, phone calls, or calendar invites.
              </p>
            </div>
            <StatusBadge tone={request.appointmentId ? "emerald" : "cyan"}>
              {request.appointmentId ? "Scheduled" : "Ready when available"}
            </StatusBadge>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              className="cursor-not-allowed rounded-md border border-blue-200 px-3 py-2 text-sm font-bold text-[#0F6BFF]/60"
              disabled
              type="button"
            >
              Call via Platform
            </button>
            <button
              className="cursor-not-allowed rounded-md border border-blue-200 px-3 py-2 text-sm font-bold text-[#0F6BFF]/60"
              disabled
              type="button"
            >
              Message via Platform
            </button>
          </div>

          <div className="mt-3 rounded-md border border-blue-200 bg-[#F8FAFC] p-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
              Calendar sync
            </p>
            <p className="mt-2 text-sm font-bold text-[#0F172A]">
              {calendarSyncSummary?.status === "synced"
                ? "Synced"
                : calendarSyncSummary?.status === "failed"
                  ? "Failed"
                  : calendarSyncSummary?.status === "pending"
                    ? "Pending"
                    : calendarSyncSummary?.status === "canceled"
                      ? "Canceled"
                      : "Unavailable"}
            </p>
            {calendarSyncSummary?.eventId ? (
              <p className="mt-1 text-xs leading-5 text-[#0F6BFF]/80">
                Google event reference: {calendarSyncSummary.eventId}
              </p>
            ) : null}
            {calendarSyncSummary?.error ? (
              <p className="mt-1 text-xs leading-5 text-amber-800">
                {calendarSyncSummary.error}
              </p>
            ) : null}
            {calendarSyncSummary?.migrationReady === false ? (
              <p className="mt-1 text-xs leading-5 text-amber-800">
                Calendar sync details are not available for this appointment yet.
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 rounded-md border border-[#E5E7EB] bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#64748B]">
            Safe customer response draft
          </p>
          <p className="mt-2 text-sm leading-6 text-[#334155]">
            {schedulingPreview.responseDraft?.primaryResponseText ??
              "No response draft generated."}
          </p>
          {schedulingPreview.responseDraft?.backupResponseText ? (
            <p className="mt-2 text-sm leading-6 text-[#64748B]">
              {schedulingPreview.responseDraft.backupResponseText}
            </p>
          ) : null}
        </div>

        <div className="mt-4 rounded-md border border-[#E5E7EB] bg-white p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#64748B]">
                Latest saved dispatcher snapshot
              </p>
              <p className="mt-2 text-sm leading-6 text-[#64748B]">
                Internal-only record of the preview at the time it was saved.
                This is not a booking, appointment, customer message, or
                calendar event.
              </p>
            </div>
            {dispatcherSnapshotState.status === "ready" &&
            dispatcherSnapshotState.snapshot ? (
              <StatusBadge
                tone={
                  dispatcherSnapshotState.snapshot.orchestratorStatus ===
                  "success"
                    ? "emerald"
                    : dispatcherSnapshotState.snapshot.orchestratorStatus ===
                        "partial"
                      ? "amber"
                      : "slate"
                }
              >
                {formatServiceRequestSource(
                  dispatcherSnapshotState.snapshot.orchestratorStatus,
                )}
              </StatusBadge>
            ) : null}
          </div>

          {dispatcherSnapshotState.status === "loading" ? (
            <p className="mt-3 text-sm font-semibold text-[#334155]">
              Loading saved dispatcher snapshot...
            </p>
          ) : null}

          {dispatcherSnapshotState.status === "error" ? (
            <p className="mt-3 text-sm font-semibold text-amber-800">
              {dispatcherSnapshotState.error}
            </p>
          ) : null}

          {dispatcherSnapshotState.status === "ready" &&
          !dispatcherSnapshotState.snapshot ? (
            <p className="mt-3 text-sm font-semibold text-[#334155]">
              No saved dispatcher snapshot yet.
            </p>
          ) : null}

          {dispatcherSnapshotState.status === "ready" &&
          dispatcherSnapshotState.snapshot ? (
            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#64748B]">
                  Saved request context
                </p>
                <p className="mt-2 text-sm font-semibold text-[#334155]">
                  ZIP{" "}
                  {dispatcherSnapshotState.snapshot.normalizedZip ??
                    "missing"}{" "}
                  ·{" "}
                  {dispatcherSnapshotState.snapshot.normalizedAppliance ??
                    "No appliance"}
                </p>
                <p className="mt-1 text-xs leading-5 text-[#64748B]">
                  Brand:{" "}
                  {dispatcherSnapshotState.snapshot.normalizedBrand ??
                    "not provided"}
                  {" · "}Window:{" "}
                  {dispatcherSnapshotState.snapshot.requestedWindow ??
                    "not provided"}
                </p>
                <p className="mt-1 text-xs leading-5 text-[#64748B]">
                  Saved{" "}
                  {formatServiceRequestDate(
                    dispatcherSnapshotState.snapshot.createdAt,
                  )}
                </p>
              </div>
              <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#64748B]">
                  Saved recommendation
                </p>
                <p className="mt-2 text-sm font-semibold text-[#334155]">
                  {getSnapshotText(
                    dispatcherSnapshotState.snapshot,
                    "recommendedTechnicianName",
                  ) ?? "No technician saved"}{" "}
                  {getSnapshotText(
                    dispatcherSnapshotState.snapshot,
                    "confidence",
                  )
                    ? `· ${formatServiceRequestSource(
                        getSnapshotText(
                          dispatcherSnapshotState.snapshot,
                          "confidence",
                        ) ?? "",
                      )} confidence`
                    : ""}
                </p>
                {getSnapshotNumber(
                  dispatcherSnapshotState.snapshot,
                  "rankingScore",
                ) !== null ? (
                  <p className="mt-1 text-xs leading-5 text-[#64748B]">
                    Ranking score:{" "}
                    {getSnapshotNumber(
                      dispatcherSnapshotState.snapshot,
                      "rankingScore",
                    )}
                  </p>
                ) : null}
                <p className="mt-2 text-sm leading-6 text-[#334155]">
                  {dispatcherSnapshotState.snapshot.safeCustomerResponseDraft ??
                    "No customer response draft was saved."}
                </p>
                <p className="mt-2 text-xs leading-5 text-[#64748B]">
                  {dispatcherSnapshotState.snapshot.backupOptionsCount} backup
                  option
                  {dispatcherSnapshotState.snapshot.backupOptionsCount === 1
                    ? ""
                    : "s"}
                  {" · "}
                  {dispatcherSnapshotState.snapshot.validationWarnings.length}{" "}
                  warning
                  {dispatcherSnapshotState.snapshot.validationWarnings.length ===
                  1
                    ? ""
                    : "s"}
                  {" · "}
                  {dispatcherSnapshotState.snapshot.validationErrors.length}{" "}
                  error
                  {dispatcherSnapshotState.snapshot.validationErrors.length === 1
                    ? ""
                    : "s"}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {schedulingPreview.warnings.length > 0 ||
        schedulingPreview.errors.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-800">
                Warnings
              </p>
              {schedulingPreview.warnings.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-amber-800">
                  {schedulingPreview.warnings.map((warning) => (
                    <li key={`${warning.step}-${warning.message}`}>
                      {warning.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs leading-5 text-amber-800">
                  No warnings.
                </p>
              )}
            </div>
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-700">
                Errors
              </p>
              {schedulingPreview.errors.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-red-700">
                  {schedulingPreview.errors.map((error) => (
                    <li key={`${error.step}-${error.message}`}>
                      {error.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs leading-5 text-red-700">
                  No blocking errors.
                </p>
              )}
            </div>
          </div>
        ) : null}
          </>
        ) : null}
      </section>

      ) : null}

      {activeJobTab === "estimate" ? (
        financeEstimateMode === "manual" || financeEstimateMode === "saved" ? (
          <ManualEstimateEditor
            activeEstimateId={manualEstimateId}
            estimates={financeEstimates}
            initialEstimate={financeEstimateMode === "saved" ? manualEstimate : null}
            isCreatingInvoice={invoiceActionState.status === "saving"}
            key={`${financeEstimateMode}:${manualEstimateId ?? "new"}`}
            customerHref={estimateCustomerProfileHref}
            linkedInvoiceNumber={
              manualEstimate ? invoicesByEstimateId.get(manualEstimate.id)?.invoiceNumber ?? null : null
            }
            onClose={closeManualEstimateEditor}
            onCreateInvoice={(estimate) => createInvoiceFromEstimate(estimate)}
            onSaved={loadEstimates}
            onSwitchEstimate={(estimate) =>
              openSavedManualEstimateEditor(estimate, { history: "replace" })
            }
            onApproveForCustomer={(estimate) =>
              approveEstimateForCustomer(estimate.id, estimate.estimateNumber)
            }
            onSendEstimate={(estimate) =>
              sendEstimateById(estimate.id, estimate.estimateNumber)
            }
            onDeleteEstimate={(estimate) =>
              deleteDraftEstimateById(estimate.id, estimate.estimateNumber)
            }
            request={state.request}
            sendingEstimateId={sendingEstimateId}
          />
        ) : (
      <section className="mt-4 bg-[#F8FAFE] px-3 pb-6 pt-4 sm:rounded-[2rem] sm:px-5 sm:pt-5">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            {
              label: "Approved",
              value: formatServiceRequestMoney(financeApprovedTotal),
              detail:
                financeApprovedEstimates.length > 0
                  ? `${financeApprovedEstimates.length} approved`
                  : "No approved estimates",
              valueTone: "text-emerald-700",
            },
            {
              label: "Paid",
              value: formatServiceRequestMoney(financePaidTotal),
              detail:
                financePaidInvoices.length > 0
                  ? `${financePaidInvoices.length} payment${
                      financePaidInvoices.length === 1 ? "" : "s"
                    }`
                  : "No payments",
              valueTone: "text-[#0F6BFF]",
            },
            {
              label: "Balance Due",
              value: formatServiceRequestMoney(financeBalanceDueTotal),
              detail:
                financeOpenInvoices.length > 0
                  ? `${financeOpenInvoices.length} open invoice${
                      financeOpenInvoices.length === 1 ? "" : "s"
                    }`
                  : "No open invoices",
              valueTone: "text-orange-700",
            },
          ].map((card) => (
            <div
              className="flex min-h-[92px] min-w-0 flex-col justify-start gap-2.5 rounded-[1rem] border border-[#DCE3EF] bg-white px-3 py-3.5 shadow-none sm:min-h-[100px] sm:rounded-[1.15rem] sm:px-4"
              key={card.label}
            >
              <span className="block truncate text-[0.74rem] font-bold text-[#657089] sm:text-sm">
                {card.label}
              </span>
              <span
                className={`block whitespace-nowrap text-[clamp(0.82rem,3.35vw,1.04rem)] font-black leading-[1.08] tracking-[-0.035em] sm:text-lg ${card.valueTone}`}
              >
                {card.value}
              </span>
              <span className="block whitespace-nowrap text-[0.62rem] font-bold text-[#657089] sm:text-xs">
                {card.detail}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-0 border-y border-[#E3E8F0]">
          <div className="border-b border-[#E3E8F0] bg-transparent last:border-b-0">
            <div className="flex items-center justify-between gap-3 py-4 sm:py-4">
              <button
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => setIsFinanceEstimatesOpen((current) => !current)}
                type="button"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] bg-blue-50 text-[#0F6BFF] sm:h-10 sm:w-10">
                  <FinanceHomeIcon className="h-5 w-5" name="estimates" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-lg font-black text-[#0B1228]">
                    Estimates
                  </span>
                  <span className="mt-0.5 block truncate text-[0.82rem] font-semibold text-[#657089]">
                    {estimatesState.estimates.length > 0
                      ? `${estimatesState.estimates.length} total · Approved first`
                      : "No estimates yet"}
                  </span>
                </span>
              </button>
              <button
                className="shrink-0 rounded-full border border-[#D7E4FF] px-3 py-1.5 text-xs font-black text-[#0F6BFF] transition hover:bg-blue-50"
                onClick={openNewManualEstimateEditor}
                type="button"
              >
                {financeEstimates.length > 0 ? "New Estimate" : "Create Estimate"}
              </button>
              <button
                aria-label={isFinanceEstimatesOpen ? "Collapse estimates" : "Expand estimates"}
                className="shrink-0 text-[#0B1A33]"
                onClick={() => setIsFinanceEstimatesOpen((current) => !current)}
                type="button"
              >
                <FinanceChevron open={isFinanceEstimatesOpen} />
              </button>
            </div>
            {isFinanceEstimatesOpen ? (
              <div className="border-t border-[#EEF2F7] px-4 py-2">
                {estimatesState.status === "loading" ? (
                  <p className="text-sm font-semibold text-[#64748B]">
                    Loading estimates...
                  </p>
                ) : null}
                {estimatesState.status === "error" ? (
                  <p className="rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                    {estimatesState.error}
                  </p>
                ) : null}
                {estimatesState.status === "ready" && financeEstimates.length === 0 ? (
                  <p className="rounded-2xl bg-[#F8FAFC] p-4 text-sm font-semibold text-[#64748B]">
                    No estimates yet.
                  </p>
                ) : null}
                {financeEstimates.map(renderEstimateCard)}
              </div>
            ) : null}
          </div>

          <div className="border-b border-[#E3E8F0] bg-transparent last:border-b-0">
            <button
              className="flex w-full items-center justify-between gap-3 py-4 text-left sm:py-4"
              onClick={() => setIsFinanceInvoiceOpen((current) => !current)}
              type="button"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] bg-emerald-50 text-emerald-700 sm:h-10 sm:w-10">
                  <FinanceHomeIcon className="h-5 w-5" name="invoice" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-lg font-black text-[#0B1228]">
                    Invoice
                  </span>
                  <span className="mt-0.5 block truncate text-[0.82rem] font-semibold text-[#657089]">
                    {financePrimaryInvoice
                      ? `${currentInvoices.length} open · ${invoiceHistory.length} history`
                      : "No invoice yet"}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {financePrimaryInvoice ? (
                  <span className="whitespace-nowrap text-sm font-black text-emerald-700 sm:text-base">
                    {formatServiceRequestMoney(financePrimaryInvoice.total)}
                  </span>
                ) : null}
                <span className="text-[#0B1A33]">
                  <FinanceChevron open={isFinanceInvoiceOpen} />
                </span>
              </span>
            </button>
            {isFinanceInvoiceOpen ? (
            <div className="border-t border-[#EEF2F7] p-4">
              {invoicesState.status === "loading" ? (
                <p className="text-sm font-semibold text-[#64748B]">
                  Loading invoices...
                </p>
              ) : null}
              {invoicesState.status === "error" ? (
                <p className="rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                  {invoicesState.error}
                </p>
              ) : null}
              {financePrimaryInvoice ? (
                renderInvoiceCard(financePrimaryInvoice)
              ) : invoicesState.status === "ready" ? (
                <p className="rounded-2xl bg-[#F8FAFC] p-4 text-sm font-semibold text-[#64748B]">
                  No invoice yet. Create one from an approved estimate.
                </p>
              ) : null}
            </div>
            ) : null}
          </div>

          <div className="border-b border-[#E3E8F0] bg-transparent last:border-b-0">
            <button
              className="flex w-full items-center justify-between gap-3 py-4 text-left sm:py-4"
              onClick={() => setIsFinancePaymentsOpen((current) => !current)}
              type="button"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] bg-purple-50 text-purple-700 sm:h-10 sm:w-10">
                  <FinanceHomeIcon className="h-5 w-5" name="payments" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-lg font-black text-[#0B1228]">
                    Payments
                  </span>
                  <span className="mt-0.5 block truncate text-[0.82rem] font-semibold text-[#657089]">
                    {financePaidInvoices.length > 0
                      ? `${financePaidInvoices.length} recorded paid invoice${financePaidInvoices.length === 1 ? "" : "s"}`
                      : "No payments yet"}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-[#0B1A33]">
                <FinanceChevron open={isFinancePaymentsOpen} />
              </span>
            </button>
            {isFinancePaymentsOpen ? (
              <div className="border-t border-[#EEF2F7] p-4">
                {financePaidInvoices.length > 0 ? (
                  <div className="space-y-3">
                    {financePaidInvoices.map(renderInvoiceCard)}
                  </div>
                ) : (
                  <p className="rounded-2xl bg-[#F8FAFC] p-4 text-sm font-semibold text-[#64748B]">
                    No payments recorded yet.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className="border-b border-[#E3E8F0] bg-transparent last:border-b-0">
            <button
              className="flex w-full items-center justify-between gap-3 py-4 text-left sm:py-4"
              onClick={() => setIsFinanceExpensesOpen((current) => !current)}
              type="button"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.7rem] bg-orange-50 text-orange-700 sm:h-10 sm:w-10">
                  <FinanceHomeIcon className="h-5 w-5" name="expenses" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-lg font-black text-[#0B1228]">
                    Technician Expenses
                  </span>
                  <span className="mt-0.5 block truncate text-[0.82rem] font-semibold text-[#657089]">
                    Track expenses for this job
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-[#0B1A33]">
                <FinanceChevron open={isFinanceExpensesOpen} />
              </span>
            </button>
            {isFinanceExpensesOpen ? (
              <div className="border-t border-[#EEF2F7] p-4">
                <p className="rounded-2xl bg-[#F8FAFC] p-4 text-sm font-semibold text-[#64748B]">
                  No technician expenses yet.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-7 px-3 sm:px-7">
          <div className="pt-3">
            <h3 className="text-lg font-black text-[#0B1228]">Quick Actions</h3>
            <div className="mt-3 grid grid-cols-4 gap-2.5">
              <button
                className="flex min-h-[46px] min-w-0 items-center justify-center gap-1.5 rounded-[0.9rem] bg-white px-1.5 py-2 text-center text-[0.68rem] font-black leading-4 text-[#0F5BFF] shadow-[0_7px_18px_rgba(15,23,42,0.045)] ring-1 ring-[#D7E4FF] transition hover:-translate-y-0.5 sm:min-h-[60px] sm:flex-col sm:gap-1.5 sm:text-xs"
                onClick={() => setActiveJobTab("notes")}
                type="button"
              >
                <FinanceHomeIcon className="h-6 w-6 shrink-0 sm:h-8 sm:w-8" name="note" />
                <span className="min-w-0">Add Note</span>
              </button>
              <button
                className="flex min-h-[46px] min-w-0 items-center justify-center gap-1.5 rounded-[0.9rem] bg-white px-1.5 py-2 text-center text-[0.68rem] font-black leading-4 text-[#0F5BFF] shadow-[0_7px_18px_rgba(15,23,42,0.045)] ring-1 ring-[#E7ECF5] transition hover:-translate-y-0.5 sm:min-h-[60px] sm:flex-col sm:gap-1.5 sm:text-xs"
                onClick={openAttachmentCameraPicker}
                type="button"
              >
                <FinanceHomeIcon className="h-6 w-6 shrink-0 sm:h-8 sm:w-8" name="photo" />
                <span className="min-w-0">Add Photo</span>
              </button>
              <button
                className="flex min-h-[46px] min-w-0 items-center justify-center gap-1.5 rounded-[0.9rem] bg-white px-1.5 py-2 text-center text-[0.68rem] font-black leading-4 text-[#0F5BFF] shadow-[0_7px_18px_rgba(15,23,42,0.045)] ring-1 ring-[#E7ECF5] transition hover:-translate-y-0.5 sm:min-h-[60px] sm:flex-col sm:gap-1.5 sm:text-xs"
                onClick={openAttachmentGalleryPicker}
                type="button"
              >
                <FinanceHomeIcon className="h-6 w-6 shrink-0 sm:h-8 sm:w-8" name="upload" />
                <span className="min-w-0">Upload Document</span>
              </button>
              <button
                className="flex min-h-[46px] min-w-0 items-center justify-center gap-1.5 rounded-[0.9rem] bg-white px-1.5 py-2 text-center text-[0.68rem] font-black leading-4 text-[#0F5BFF] shadow-[0_7px_18px_rgba(15,23,42,0.045)] ring-1 ring-[#E7ECF5] transition hover:-translate-y-0.5 sm:min-h-[60px] sm:flex-col sm:gap-1.5 sm:text-xs"
                onClick={() => setActiveJobTab("photos")}
                type="button"
              >
                <FinanceHomeIcon className="h-6 w-6 shrink-0 sm:h-8 sm:w-8" name="more" />
                <span className="min-w-0">More</span>
              </button>
            </div>
          </div>
        </div>

        {isFinanceEstimateWorkflowOpen ? (
          <div className="mt-6">

        {catalogState.status === "loading" ? (
          <p className="mt-4 text-sm text-[#64748B]">Loading pricing catalog...</p>
        ) : null}
        {catalogState.status === "error" ? (
          <p className="mt-4 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-800">
            {catalogState.error}
          </p>
        ) : null}
        {activeDraftEstimate && !editingEstimate ? (
          <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4">
            <p className="text-sm font-black text-amber-800">
              Active draft already exists: {activeDraftEstimate.estimateNumber}
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-800">
              Edit the current draft to avoid accidental duplicates. Create
              another draft only when you intentionally need a separate version.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                className="rounded-md bg-amber-200 px-3 py-2 text-sm font-black text-[#0F172A] transition hover:bg-amber-100"
                onClick={() => editEstimateDraft(activeDraftEstimate)}
                type="button"
              >
                Edit Existing Draft
              </button>
              <button
                className="rounded-md border border-amber-200/30 px-3 py-2 text-sm font-black text-amber-800 transition hover:bg-amber-200/10"
                onClick={beginNewDraft}
                type="button"
              >
                Create Another Draft
              </button>
            </div>
          </div>
        ) : null}
        {editingEstimate ? (
          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-bold text-emerald-700">
              Editing {editingEstimate.estimateNumber}. Saving will update this
              draft instead of creating a duplicate.
            </p>
            <button
              className="rounded-md border border-emerald-200/30 px-3 py-2 text-sm font-black text-emerald-700 transition hover:bg-emerald-200/10"
              onClick={resetEstimateBuilder}
              type="button"
            >
              Cancel Editing
            </button>
          </div>
        ) : null}

        <div className="mt-5 rounded-[2rem] border border-[#E5E7EB] bg-[#F8FAFC] p-3 shadow-[0_12px_32px_rgba(15,23,42,0.06)] sm:p-5">
          <div className="rounded-[1.5rem] bg-white p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-2xl font-black text-[#0F172A]">
                  Repair Proposal
                </h3>
              </div>
              <div className="rounded-2xl bg-[#F8FAFC] px-4 py-3 text-sm">
                <p className="font-black text-[#0F172A]">
                  {hasEstimateSelection ? "Draft in progress" : "No draft yet"}
                </p>
                <p className="mt-1 text-xs font-semibold text-[#64748B]">
                  {editingEstimate
                    ? `Editing ${editingEstimate.estimateNumber}`
                    : activeDraftEstimate
                      ? `Active draft ${activeDraftEstimate.estimateNumber}`
                      : "Start with AI, manual entry, or a template."}
                </p>
              </div>
            </div>

            {!shouldShowRepairProposalBuilder ? (
              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <button
                  className="rounded-3xl bg-[#0F6BFF] px-5 py-5 text-left text-white shadow-[0_14px_28px_rgba(15,107,255,0.22)] transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={
                    estimateSaveState.status === "saving" ||
                    estimateGenerationState.status === "generating"
                  }
                  onClick={() =>
                    estimateDiagnosisText.trim()
                      ? void generateEstimateDraftFromDiagnosis()
                      : setIsRepairScopeSheetOpen(true)
                  }
                  type="button"
                >
                  <span className="block text-lg font-black">
                    {estimateGenerationState.status === "generating"
                      ? "Generating..."
                      : "Generate with AI"}
                  </span>
                  <span className="mt-2 block text-sm font-semibold leading-6 text-blue-50">
                    Turn confirmed technician scope into a proposal draft.
                  </span>
                </button>
                <button
                  className="rounded-3xl border border-[#E5E7EB] bg-white px-5 py-5 text-left transition hover:border-[#0F6BFF]"
                  disabled={estimateSaveState.status === "saving"}
                  onClick={createManualRepairProposalDraft}
                  type="button"
                >
                  <span className="block text-lg font-black text-[#0F172A]">
                    Create Manually
                  </span>
                  <span className="mt-2 block text-sm font-semibold leading-6 text-[#64748B]">
                    Start with an empty technician-controlled proposal.
                  </span>
                </button>
                <button
                  className="rounded-3xl border border-[#E5E7EB] bg-white px-5 py-5 text-left transition hover:border-[#0F6BFF]"
                  disabled={estimateSaveState.status === "saving"}
                  onClick={() => setIsTemplateSheetOpen(true)}
                  type="button"
                >
                  <span className="block text-lg font-black text-[#0F172A]">
                    Use Template
                  </span>
                  <span className="mt-2 block text-sm font-semibold leading-6 text-[#64748B]">
                    Use a lightweight starter and customize every line.
                  </span>
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-4 pb-24 sm:pb-0">
                <details className="rounded-3xl border border-[#E5E7EB] bg-white p-4" open>
                  <summary className="cursor-pointer text-lg font-black text-[#0F172A]">
                    What we found
                  </summary>
                  <textarea
                    className="mt-4 min-h-28 w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm font-semibold leading-6 text-[#334155] outline-none transition focus:border-[#0F6BFF] focus:bg-white"
                    disabled={estimateSaveState.status === "saving"}
                    maxLength={1200}
                    onChange={(event) => {
                      setEstimateDiagnosisText(event.target.value);
                      updateProposalCustomerDescription(event.target.value);
                    }}
                    placeholder="Confirmed diagnosis or technician findings."
                    value={estimateDiagnosisText || proposalCustomerDescription}
                  />
                </details>

                <details className="rounded-3xl border border-[#E5E7EB] bg-white p-4" open>
                  <summary className="cursor-pointer text-lg font-black text-[#0F172A]">
                    Repair Solution
                  </summary>
                  <input
                    className="mt-4 w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-base font-black text-[#0F172A] outline-none transition focus:border-[#0F6BFF] focus:bg-white"
                    disabled={estimateSaveState.status === "saving"}
                    onChange={(event) => updateProposalRepairSolution(event.target.value)}
                    value={proposalRepairSolution}
                  />
                </details>

                <details className="rounded-3xl border border-[#E5E7EB] bg-white p-4" open>
                  <summary className="cursor-pointer text-lg font-black text-[#0F172A]">
                    What we will do
                  </summary>
                  {proposalCustomEstimateLines.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {proposalCustomEstimateLines.map((line, index) => {
                        const isCustomerVisible = !hiddenProposalLineIds.includes(line.id);

                        return (
                        <div
                          className="flex items-center gap-3 rounded-2xl bg-[#F8FAFC] px-3 py-3"
                          key={line.id}
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0F6BFF] text-xs font-black text-white">
                            {index + 1}
                          </span>
                          <input
                            className="min-w-0 flex-1 bg-transparent text-sm font-black text-[#0F172A] outline-none"
                            disabled={estimateSaveState.status === "saving"}
                            onChange={(event) =>
                              updateCustomEstimateLineTitle(line.id, event.target.value)
                            }
                            value={line.customerName}
                          />
                          {!isCustomerVisible ? (
                            <span className="shrink-0 rounded-full bg-slate-200 px-2 py-1 text-[10px] font-black uppercase text-[#64748B]">
                              Hidden
                            </span>
                          ) : null}
                          <button
                            className="text-xs font-black text-[#64748B] transition hover:text-[#0F6BFF]"
                            disabled={estimateSaveState.status === "saving"}
                            onClick={() => setEditingProposalLineId(line.id)}
                            type="button"
                          >
                            Edit
                          </button>
                          <button
                            className="text-xs font-black text-red-600 transition hover:text-red-700"
                            disabled={estimateSaveState.status === "saving"}
                            onClick={() => removeCustomEstimateLine(line.id)}
                            type="button"
                          >
                            Delete
                          </button>
                        </div>
                        );
                      })}
                      <button
                        className="w-full rounded-2xl border border-dashed border-[#0F6BFF]/40 bg-blue-50 px-4 py-3 text-sm font-black text-[#0F6BFF] transition hover:bg-blue-100"
                        disabled={estimateSaveState.status === "saving"}
                        onClick={() => setIsAddProposalItemSheetOpen(true)}
                        type="button"
                      >
                        + Add checklist item
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl bg-[#F8FAFC] p-4">
                      <p className="text-sm font-semibold text-[#64748B]">
                        Add proposal items to build the work checklist.
                      </p>
                      <button
                        className="mt-3 rounded-2xl border border-dashed border-[#0F6BFF]/40 bg-blue-50 px-4 py-3 text-sm font-black text-[#0F6BFF] transition hover:bg-blue-100"
                        disabled={estimateSaveState.status === "saving"}
                        onClick={() => setIsAddProposalItemSheetOpen(true)}
                        type="button"
                      >
                        + Add checklist item
                      </button>
                    </div>
                  )}
                </details>

                <details className="rounded-3xl border border-[#E5E7EB] bg-white p-4" open>
                  <summary className="cursor-pointer text-lg font-black text-[#0F172A]">
                    Included Items
                  </summary>
                  <div className="mt-4 space-y-3">
                    {selectedCatalogItems.map((item) => (
                      <div
                        className="rounded-3xl border border-[#E5E7EB] bg-[#F8FAFC] p-4"
                        key={item.id}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-[#0F172A]">{item.title}</p>
                            <p className="mt-1 text-xs font-bold text-[#64748B]">
                              Price Book labor · Qty 1
                            </p>
                          </div>
                          <p className="font-black text-[#0F6BFF]">
                            {formatServiceRequestMoney(item.customerPrice)}
                          </p>
                        </div>
                        <button
                          className="mt-3 text-xs font-black text-[#64748B] transition hover:text-amber-800"
                          disabled={estimateSaveState.status === "saving"}
                          onClick={() => toggleCatalogItem(item.id)}
                          type="button"
                        >
                          Remove
                        </button>
                        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                          <div>
                            <dt className="font-black uppercase text-[#94A3B8]">
                              Customer Price
                            </dt>
                            <dd className="mt-1 font-black text-[#0F172A]">
                              {formatServiceRequestMoney(item.customerPrice)}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-black uppercase text-[#94A3B8]">
                              Internal Cost
                            </dt>
                            <dd className="mt-1 font-black text-[#0F172A]">
                              {formatServiceRequestMoney(item.technicianCost ?? 0)}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-black uppercase text-[#94A3B8]">
                              Quantity
                            </dt>
                            <dd className="mt-1 font-black text-[#0F172A]">1</dd>
                          </div>
                          <div>
                            <dt className="font-black uppercase text-[#94A3B8]">
                              Type
                            </dt>
                            <dd className="mt-1 font-black text-[#0F172A]">Labor</dd>
                          </div>
                          <div>
                            <dt className="font-black uppercase text-[#94A3B8]">
                              Customer Visible
                            </dt>
                            <dd className="mt-1 font-black text-[#0F172A]">Yes</dd>
                          </div>
                          <div>
                            <dt className="font-black uppercase text-[#94A3B8]">
                              Taxable
                            </dt>
                            <dd className="mt-1 font-black text-[#0F172A]">
                              {item.taxable ? "Yes" : "No"}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    ))}
                    {proposalCustomEstimateLines.map((line) => {
                      const isCustomerVisible = !hiddenProposalLineIds.includes(line.id);
                      const lineTotal =
                        Math.round(line.quantity * line.unitPrice * 100) / 100;

                      return (
                        <button
                          className="block w-full rounded-3xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-left transition hover:border-[#0F6BFF]"
                          disabled={estimateSaveState.status === "saving"}
                          key={line.id}
                          onClick={() => setEditingProposalLineId(line.id)}
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-black text-[#0F172A]">
                                {line.customerName || "Untitled proposal item"}
                              </p>
                              <p className="mt-1 text-xs font-bold text-[#64748B]">
                                {professionalEstimateLineTypeLabels[line.lineType]} · Qty{" "}
                                {line.quantity}
                                {!isCustomerVisible ? " · Hidden from customer" : ""}
                              </p>
                            </div>
                            <p className="shrink-0 font-black text-[#0F6BFF]">
                              {formatServiceRequestMoney(lineTotal)}
                            </p>
                          </div>
                          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-6">
                            <div>
                              <dt className="font-black uppercase text-[#94A3B8]">
                                Customer Price
                              </dt>
                              <dd className="mt-1 font-black text-[#0F172A]">
                                {formatServiceRequestMoney(line.unitPrice)}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-black uppercase text-[#94A3B8]">
                                Internal Cost
                              </dt>
                              <dd className="mt-1 font-black text-[#0F172A]">
                                {formatServiceRequestMoney(line.unitCost)}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-black uppercase text-[#94A3B8]">
                                Quantity
                              </dt>
                              <dd className="mt-1 font-black text-[#0F172A]">
                                {line.quantity}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-black uppercase text-[#94A3B8]">
                                Type
                              </dt>
                              <dd className="mt-1 font-black text-[#0F172A]">
                                {professionalEstimateLineTypeLabels[line.lineType]}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-black uppercase text-[#94A3B8]">
                                Taxable
                              </dt>
                              <dd className="mt-1 font-black text-[#0F172A]">
                                {line.taxable ? "Yes" : "No"}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-black uppercase text-[#94A3B8]">
                                Customer Visible
                              </dt>
                              <dd className="mt-1 font-black text-[#0F172A]">
                                {isCustomerVisible ? "Yes" : "No"}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-black uppercase text-[#94A3B8]">
                                Warranty
                              </dt>
                              <dd className="mt-1 font-black text-[#0F172A]">
                                Included
                              </dd>
                            </div>
                          </dl>
                        </button>
                      );
                    })}
                    <button
                      className="w-full rounded-3xl border border-dashed border-[#0F6BFF]/40 bg-blue-50 px-4 py-4 text-sm font-black text-[#0F6BFF] transition hover:bg-blue-100"
                      disabled={estimateSaveState.status === "saving"}
                      onClick={() => setIsAddProposalItemSheetOpen(true)}
                      type="button"
                    >
                      + Add Item
                    </button>
                  </div>
                </details>

                <div className="grid gap-4 lg:grid-cols-2">
                  <details className="rounded-3xl border border-[#E5E7EB] bg-white p-4" open>
                    <summary className="cursor-pointer text-lg font-black text-[#0F172A]">
                      Warranty
                    </summary>
                    <label className="mt-4 block">
                      <span className="text-xs font-black uppercase tracking-[0.12em] text-[#64748B]">
                        Parts / Labor Warranty
                      </span>
                      <textarea
                        className="mt-2 min-h-24 w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm font-semibold leading-6 text-[#334155] outline-none transition focus:border-[#0F6BFF] focus:bg-white"
                        disabled={estimateSaveState.status === "saving"}
                        maxLength={1000}
                        onChange={(event) => updateWarrantyFooterText(event.target.value)}
                        value={warrantyFooterText}
                      />
                    </label>
                  </details>

                  <details className="rounded-3xl border border-[#E5E7EB] bg-white p-4" open>
                    <summary className="cursor-pointer text-lg font-black text-[#0F172A]">
                      Estimated Completion
                    </summary>
                    <textarea
                      className="mt-4 min-h-24 w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm font-semibold leading-6 text-[#334155] outline-none transition focus:border-[#0F6BFF] focus:bg-white"
                      disabled={estimateSaveState.status === "saving"}
                      maxLength={400}
                      onChange={(event) =>
                        setProposalEstimatedCompletion(event.target.value.slice(0, 400))
                      }
                      value={proposalEstimatedCompletion}
                    />
                  </details>
                </div>

                <details className="rounded-3xl border border-[#E5E7EB] bg-white p-4" open>
                  <summary className="cursor-pointer text-lg font-black text-[#0F172A]">
                    Totals
                  </summary>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="font-bold text-[#64748B]">Subtotal</dt>
                      <dd className="font-black text-[#0F172A]">
                        {formatServiceRequestMoney(estimateSubtotal)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="font-bold text-[#64748B]">Discount</dt>
                      <dd className="font-black text-[#0F172A]">
                        -{formatServiceRequestMoney(estimateDiscountAmount)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="font-bold text-[#64748B]">Tax</dt>
                      <dd className="font-black text-[#0F172A]">
                        {formatServiceRequestMoney(estimateTaxTotal)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between border-t border-[#E5E7EB] pt-4">
                      <dt className="text-lg font-black text-[#0F172A]">Total</dt>
                      <dd className="text-2xl font-black text-[#0F6BFF]">
                        {formatServiceRequestMoney(estimateGrandTotal)}
                      </dd>
                    </div>
                    <div className="grid gap-2 pt-2 text-xs sm:grid-cols-2">
                      <div className="rounded-2xl bg-[#F8FAFC] p-3">
                        <dt className="font-black uppercase text-[#64748B]">
                          Gross Profit
                        </dt>
                        <dd className="mt-1 font-black text-[#0F172A]">
                          {formatServiceRequestMoney(estimateMargin)}
                        </dd>
                      </div>
                      <div className="rounded-2xl bg-[#F8FAFC] p-3">
                        <dt className="font-black uppercase text-[#64748B]">
                          Margin
                        </dt>
                        <dd className="mt-1 font-black text-[#0F172A]">
                          {estimateMarginPercent.toFixed(2)}%
                        </dd>
                      </div>
                    </div>
                  </dl>
                  <button
                    className="mt-4 text-sm font-black text-[#0F6BFF] transition hover:text-[#0057D9]"
                    onClick={() => setShowEstimateAdjustments((current) => !current)}
                    type="button"
                  >
                    {showEstimateAdjustments ? "Hide discount and tax" : "Edit discount and tax"}
                  </button>
                  {showEstimateAdjustments ? (
                    <div className="mt-3 grid gap-3 rounded-2xl bg-[#F8FAFC] p-3 sm:grid-cols-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
                          Discount type
                        </span>
                        <select
                          className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-bold text-[#0F172A] outline-none focus:border-[#0F6BFF]"
                          disabled={estimateSaveState.status === "saving"}
                          onChange={(event) =>
                            setEstimateDiscountType(
                              event.target.value === "percent" ? "percent" : "flat",
                            )
                          }
                          value={estimateDiscountType}
                        >
                          <option value="flat">Dollar</option>
                          <option value="percent">Percent</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
                          Discount
                        </span>
                        <input
                          className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-right text-sm font-black text-[#0F172A] outline-none focus:border-[#0F6BFF]"
                          disabled={estimateSaveState.status === "saving"}
                          min="0"
                          onChange={(event) => setEstimateDiscountValue(event.target.value)}
                          step="0.01"
                          type="number"
                          value={estimateDiscountValue}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
                          Tax rate %
                        </span>
                        <input
                          className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-right text-sm font-black text-[#0F172A] outline-none focus:border-[#0F6BFF]"
                          disabled={estimateSaveState.status === "saving"}
                          min="0"
                          onChange={(event) => setEstimateTaxRate(event.target.value)}
                          step="0.01"
                          type="number"
                          value={estimateTaxRate}
                        />
                      </label>
                    </div>
                  ) : null}
                </details>

                {proposalWarnings.length > 0 || proposalBlockingErrors.length > 0 ? (
                  <div className="space-y-2">
                    {proposalWarnings.map((warning) => (
                      <p
                        className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold leading-6 text-amber-900"
                        key={warning}
                      >
                        {warning}
                      </p>
                    ))}
                    {proposalBlockingErrors.map((error) => (
                      <p
                        className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold leading-6 text-red-800"
                        key={error}
                      >
                        {error}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            <div className="mt-5 rounded-2xl bg-[#F8FAFC] px-4 py-3 text-xs font-bold leading-5 text-[#64748B]">
              <p>
                Draft status:{" "}
                <span className="text-[#0F172A]">
                  {hasEstimateSelection ? "Ready for review" : "Not started"}
                </span>
              </p>
              <p>
                Last updated:{" "}
                <span className="text-[#0F172A]">
                  {editingEstimate
                    ? formatServiceRequestDate(editingEstimate.updatedAt)
                    : activeDraftEstimate
                      ? formatServiceRequestDate(activeDraftEstimate.updatedAt)
                      : "Not saved yet"}
                </span>
              </p>
              <p>
                Warnings:{" "}
                <span className="text-[#0F172A]">
                  {[...proposalWarnings, ...proposalBlockingErrors].length || "None"}
                </span>
              </p>
            </div>
          </div>

          {shouldShowRepairProposalBuilder ? (
            <div className="sticky bottom-3 z-20 mt-4 rounded-3xl border border-[#E5E7EB] bg-white/95 p-3 shadow-[0_16px_40px_rgba(15,23,42,0.16)] backdrop-blur">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black text-[#0F172A]">
                    Total {formatServiceRequestMoney(estimatePreviewTotal)}
                  </p>
                  {estimateSaveState.message ? (
                    <p
                      className={`mt-1 text-xs font-bold ${
                        estimateSaveState.status === "error"
                          ? "text-amber-800"
                          : "text-[#0F6BFF]"
                      }`}
                    >
                      {estimateSaveState.message}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs font-semibold text-[#64748B]">
                      Preview, save the draft, or send to the customer.
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:flex">
                  <button
                    className="rounded-2xl border border-[#0F6BFF]/30 bg-blue-50 px-4 py-3 text-sm font-black text-[#0F6BFF] transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!hasEstimateSelection}
                    onClick={() => setIsProposalPreviewOpen(true)}
                    type="button"
                  >
                    Preview
                  </button>
                  <button
                    className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-black text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!canSaveEstimate}
                    onClick={() => void createEstimate({ sendAfterSave: false })}
                    type="button"
                  >
                    {estimateSaveState.status === "saving" ? "Saving..." : "Save Draft"}
                  </button>
                  <button
                    className="rounded-2xl bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white shadow-[0_8px_18px_rgba(15,107,255,0.22)] transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!canSendProposal}
                    onClick={() => void createEstimate({ sendAfterSave: true })}
                    type="button"
                  >
                    {estimateSaveState.status === "saving" || sendingEstimateId
                      ? "Sending..."
                      : "Send"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {isRepairScopeSheetOpen ? (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/55 px-3 py-4 backdrop-blur-sm sm:items-center">
              <div className="w-full max-w-xl rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F6BFF]">
                      Confirmed Scope
                    </p>
                    <h3 className="mt-2 text-2xl font-black text-[#0F172A]">
                      Generate with AI
                    </h3>
                  </div>
                  <button
                    className="rounded-full border border-[#E5E7EB] px-3 py-1 text-sm font-black text-[#334155]"
                    onClick={() => setIsRepairScopeSheetOpen(false)}
                    type="button"
                  >
                    Close
                  </button>
                </div>
                <textarea
                  className="mt-4 min-h-36 w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm font-semibold leading-6 text-[#334155] outline-none transition placeholder:text-[#94A3B8] focus:border-[#0F6BFF] focus:bg-white"
                  maxLength={1200}
                  onChange={(event) => {
                    setEstimateDiagnosisText(event.target.value);
                    setEstimateSaveState({ status: "idle", message: null });
                  }}
                  placeholder="Confirmed repair scope from technician. AI will format language, not decide the repair."
                  value={estimateDiagnosisText}
                />
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <button
                    className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-black text-[#334155]"
                    onClick={startRepairScopeDictation}
                    type="button"
                  >
                    {isDictatingRepairScope ? "Listening..." : "Dictate"}
                  </button>
                  <button
                    className="rounded-2xl bg-[#0F6BFF] px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      estimateGenerationState.status === "generating" ||
                      estimateDiagnosisText.trim().length === 0
                    }
                    onClick={() => {
                      setIsRepairScopeSheetOpen(false);
                      void generateEstimateDraftFromDiagnosis();
                    }}
                    type="button"
                  >
                    {estimateGenerationState.status === "generating"
                      ? "Generating..."
                      : "Generate Draft"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {isTemplateSheetOpen ? (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/55 px-3 py-4 backdrop-blur-sm sm:items-center">
              <div className="w-full max-w-lg rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F6BFF]">
                      Templates
                    </p>
                    <h3 className="mt-2 text-2xl font-black text-[#0F172A]">
                      Use Template
                    </h3>
                  </div>
                  <button
                    className="rounded-full border border-[#E5E7EB] px-3 py-1 text-sm font-black text-[#334155]"
                    onClick={() => setIsTemplateSheetOpen(false)}
                    type="button"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  <button
                    className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-left transition hover:border-[#0F6BFF]"
                    onClick={() => createTemplateRepairProposalDraft("standard")}
                    type="button"
                  >
                    <span className="block font-black text-[#0F172A]">
                      Standard Repair Solution
                    </span>
                    <span className="mt-1 block text-sm font-semibold text-[#64748B]">
                      Starter for a technician-approved repair.
                    </span>
                  </button>
                  <button
                    className="w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-left transition hover:border-[#0F6BFF]"
                    onClick={() => createTemplateRepairProposalDraft("diagnostic")}
                    type="button"
                  >
                    <span className="block font-black text-[#0F172A]">
                      Diagnostic + Repair Labor
                    </span>
                    <span className="mt-1 block text-sm font-semibold text-[#64748B]">
                      Starter when final parts/prices still need confirmation.
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {isAddProposalItemSheetOpen ? (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/55 px-3 py-4 backdrop-blur-sm sm:items-center">
              <div className="w-full max-w-lg rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F6BFF]">
                      Included Item
                    </p>
                    <h3 className="mt-2 text-2xl font-black text-[#0F172A]">
                      Add Item
                    </h3>
                  </div>
                  <button
                    className="rounded-full border border-[#E5E7EB] px-3 py-1 text-sm font-black text-[#334155]"
                    onClick={() => setIsAddProposalItemSheetOpen(false)}
                    type="button"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-4 grid gap-2">
                  {estimateQuickLineTypes.map((item) => (
                    <button
                      className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-left text-sm font-black text-[#0F172A] transition hover:border-[#0F6BFF]"
                      key={item.lineType}
                      onClick={() => {
                        addEstimateItem(item.lineType);
                        setIsAddProposalItemSheetOpen(false);
                      }}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {editingProposalLine ? (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/55 px-3 py-4 backdrop-blur-sm sm:items-center">
              <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F6BFF]">
                      Included Item
                    </p>
                    <h3 className="mt-2 text-2xl font-black text-[#0F172A]">
                      Edit Item
                    </h3>
                  </div>
                  <button
                    className="rounded-full border border-[#E5E7EB] px-3 py-1 text-sm font-black text-[#334155]"
                    onClick={() => setEditingProposalLineId(null)}
                    type="button"
                  >
                    Done
                  </button>
                </div>
                <div className="mt-4 grid gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
                      Item type
                    </span>
                    <select
                      className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-bold text-[#0F172A] outline-none focus:border-[#0F6BFF]"
                      disabled={estimateSaveState.status === "saving"}
                      onChange={(event) =>
                        updateCustomEstimateLineType(
                          editingProposalLine.id,
                          event.target.value as Exclude<
                            ProfessionalEstimateLineType,
                            "warranty"
                          >,
                        )
                      }
                      value={editingProposalLine.lineType}
                    >
                      {estimateQuickLineTypes.map((item) => (
                        <option key={item.lineType} value={item.lineType}>
                          {professionalEstimateLineTypeLabels[item.lineType]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
                      Title
                    </span>
                    <input
                      className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-black text-[#0F172A] outline-none focus:border-[#0F6BFF]"
                      disabled={estimateSaveState.status === "saving"}
                      onChange={(event) =>
                        updateCustomEstimateLineTitle(
                          editingProposalLine.id,
                          event.target.value,
                        )
                      }
                      value={editingProposalLine.customerName}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
                      Description
                    </span>
                    <textarea
                      className="min-h-24 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-semibold leading-6 text-[#334155] outline-none focus:border-[#0F6BFF]"
                      disabled={estimateSaveState.status === "saving"}
                      maxLength={500}
                      onChange={(event) =>
                        updateCustomEstimateLineDescription(
                          editingProposalLine.id,
                          event.target.value,
                        )
                      }
                      value={editingProposalLine.publicDescription ?? ""}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
                        Customer Price
                      </span>
                      <input
                        className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-right text-sm font-black text-[#0F6BFF] outline-none focus:border-[#0F6BFF]"
                        disabled={estimateSaveState.status === "saving"}
                        min="0"
                        onChange={(event) =>
                          updateCustomEstimateLinePrice(
                            editingProposalLine.id,
                            event.target.value,
                          )
                        }
                        step="0.01"
                        type="number"
                        value={String(editingProposalLine.unitPrice)}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
                        Internal Cost
                      </span>
                      <input
                        className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-right text-sm font-black text-[#0F172A] outline-none focus:border-[#0F6BFF]"
                        disabled={estimateSaveState.status === "saving"}
                        min="0"
                        onChange={(event) =>
                          updateCustomEstimateLineCost(
                            editingProposalLine.id,
                            event.target.value,
                          )
                        }
                        step="0.01"
                        type="number"
                        value={String(editingProposalLine.unitCost)}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-black uppercase text-[#64748B]">
                        Quantity
                      </span>
                      <input
                        className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-right text-sm font-black text-[#0F172A] outline-none focus:border-[#0F6BFF]"
                        disabled={estimateSaveState.status === "saving"}
                        min="1"
                        onChange={(event) =>
                          updateCustomEstimateLineQuantity(
                            editingProposalLine.id,
                            event.target.value,
                          )
                        }
                        step="0.01"
                        type="number"
                        value={String(editingProposalLine.quantity)}
                      />
                    </label>
                    <label className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-black text-[#334155]">
                      <input
                        checked={editingProposalLine.taxable}
                        className="h-4 w-4 accent-[#0F6BFF]"
                        disabled={estimateSaveState.status === "saving"}
                        onChange={(event) =>
                          updateCustomEstimateLineTaxable(
                            editingProposalLine.id,
                            event.target.checked,
                          )
                        }
                        type="checkbox"
                      />
                      Taxable
                    </label>
                    <label className="mt-6 inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-black text-[#334155]">
                      <input
                        checked={!hiddenProposalLineIds.includes(editingProposalLine.id)}
                        className="h-4 w-4 accent-[#0F6BFF]"
                        disabled={estimateSaveState.status === "saving"}
                        onChange={(event) =>
                          updateCustomEstimateLineVisibility(
                            editingProposalLine.id,
                            event.target.checked,
                          )
                        }
                        type="checkbox"
                      />
                      Customer Visible
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-black text-[#334155] disabled:opacity-40"
                      disabled={
                        estimateSaveState.status === "saving" ||
                        customEstimateLines[0]?.id === editingProposalLine.id
                      }
                      onClick={() => moveCustomEstimateLine(editingProposalLine.id, "up")}
                      type="button"
                    >
                      Move Up
                    </button>
                    <button
                      className="flex-1 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-black text-[#334155] disabled:opacity-40"
                      disabled={
                        estimateSaveState.status === "saving" ||
                        customEstimateLines[customEstimateLines.length - 1]?.id ===
                          editingProposalLine.id
                      }
                      onClick={() =>
                        moveCustomEstimateLine(editingProposalLine.id, "down")
                      }
                      type="button"
                    >
                      Move Down
                    </button>
                  </div>
                  <button
                    className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700 disabled:opacity-40"
                    disabled={estimateSaveState.status === "saving"}
                    onClick={() => {
                      removeCustomEstimateLine(editingProposalLine.id);
                      setEditingProposalLineId(null);
                    }}
                    type="button"
                  >
                    Delete Item
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {isProposalPreviewOpen ? (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/55 px-3 py-4 backdrop-blur-sm sm:items-center">
              <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F6BFF]">
                      Customer Preview
                    </p>
                    <h3 className="mt-2 text-2xl font-black text-[#0F172A]">
                      Repair Proposal
                    </h3>
                  </div>
                  <button
                    className="rounded-full border border-[#E5E7EB] px-3 py-1 text-sm font-black text-[#334155]"
                    onClick={() => setIsProposalPreviewOpen(false)}
                    type="button"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-5 rounded-2xl bg-[#F8FAFC] p-4">
                  <p className="text-sm font-black text-[#0F172A]">
                    {proposalRepairSolution}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#475569]">
                    {proposalCustomerDescription}
                  </p>
                  <div className="mt-4 rounded-2xl bg-white p-4">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
                      Proposal Total
                    </p>
                    <p className="mt-1 text-4xl font-black text-[#0F6BFF]">
                      {formatServiceRequestMoney(estimatePreviewTotal)}
                    </p>
                  </div>
                </div>
                <details className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-black text-[#0F6BFF]">
                    View Itemized Estimate
                  </summary>
                  <div className="divide-y divide-[#E5E7EB] border-t border-[#E5E7EB]">
                    {selectedCatalogItems.map((item) => (
                      <div
                        className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
                        key={item.id}
                      >
                        <div>
                          <p className="font-black text-[#0F172A]">
                            1x {item.title}
                          </p>
                        </div>
                        <p className="shrink-0 font-black text-[#0F172A]">
                          {formatServiceRequestMoney(item.customerPrice)}
                        </p>
                      </div>
                    ))}
                    {visibleCustomEstimateLines.map((line) => (
                      <div
                        className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
                        key={line.id}
                      >
                        <div>
                          <p className="font-black text-[#0F172A]">
                            {line.quantity}x {line.customerName}
                          </p>
                          {line.publicDescription ? (
                            <p className="mt-1 text-xs leading-5 text-[#64748B]">
                              {line.publicDescription}
                            </p>
                          ) : null}
                        </div>
                        <p className="shrink-0 font-black text-[#0F172A]">
                          {formatServiceRequestMoney(
                            line.quantity * line.unitPrice,
                          )}
                        </p>
                      </div>
                    ))}
                    <div className="px-4 py-3 text-sm">
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span>{formatServiceRequestMoney(estimateSubtotal)}</span>
                      </div>
                      <div className="mt-1 flex justify-between">
                        <span>Tax</span>
                        <span>{formatServiceRequestMoney(estimateTaxTotal)}</span>
                      </div>
                      <div className="mt-3 flex justify-between border-t border-[#E5E7EB] pt-3 font-black">
                        <span>Total</span>
                        <span>{formatServiceRequestMoney(estimateGrandTotal)}</span>
                      </div>
                    </div>
                  </div>
                </details>
                <p className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm leading-6 text-[#334155]">
                  <span className="font-black text-[#0F172A]">Warranty: </span>
                  {warrantyFooterText}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {estimateDraftAgentResult && estimateRepairPlanSummary && false ? (
        <div className="mt-5 rounded-2xl border border-[#0F6BFF]/20 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F6BFF]">
                Repair Proposal Builder
              </p>
              <h3 className="mt-1 text-xl font-black text-[#0F172A]">
                Confirmed repair to customer approval
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#64748B]">
                Describe the confirmed repair scope. WRA drafts the proposal,
                you review every line, then send it to the customer.
              </p>
            </div>
            <div className="rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3 text-sm text-[#334155]">
              <p className="font-black text-[#0F172A]">
                {request.applianceBrand ?? "Brand"} {request.applianceType}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#64748B]">
                {request.issueDescription}
              </p>
            </div>
          </div>

          <label className="mt-4 block">
            <span className="text-sm font-bold text-[#0F172A]">
              Describe confirmed repair
            </span>
            <textarea
              className="mt-2 min-h-24 w-full rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-4 text-base text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#0F6BFF] focus:bg-white"
              disabled={estimateSaveState.status === "saving"}
              maxLength={1200}
              onChange={(event) => {
                setEstimateDiagnosisText(event.target.value);
                setEstimateSaveState({ status: "idle", message: null });
                setEstimateGenerationState({
                  status: "idle",
                  message: null,
                  source: null,
                });
              }}
              placeholder="Example: Надо менять компрессор. Or: Not getting water. Replace water valve."
              value={estimateDiagnosisText}
            />
          </label>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2 text-xs font-black text-[#64748B]">
              <span className="rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1">
                1. Describe
              </span>
              <span className="rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1">
                2. Review
              </span>
              <span className="rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1">
                3. Send
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-black text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isDictatingRepairScope || estimateSaveState.status === "saving"}
                onClick={startRepairScopeDictation}
                type="button"
              >
                {isDictatingRepairScope ? "Listening..." : "Dictate"}
              </button>
              <button
                className="rounded-xl bg-[#0F6BFF] px-5 py-3 text-sm font-black text-white shadow-[0_8px_18px_rgba(15,107,255,0.22)] transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={
                  estimateSaveState.status === "saving" ||
                  estimateGenerationState.status === "generating" ||
                  estimateDiagnosisText.trim().length === 0
                }
                onClick={() => void generateEstimateDraftFromDiagnosis()}
                type="button"
              >
                {estimateGenerationState.status === "generating"
                  ? "Generating..."
                  : "Generate Repair Proposal"}
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {estimateQuickLineTypes.map((item) => (
              <button
                className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-black text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={estimateSaveState.status === "saving"}
                key={item.lineType}
                onClick={() => addEstimateItem(item.lineType)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          {estimateDraftAgentResult ? (
            <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0F6BFF]">
                Repair Proposal Draft
              </p>
              <p className="mt-1 text-sm font-black text-[#0F172A]">
                Please review before sending.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[0.68rem] font-black uppercase tracking-[0.14em] text-[#64748B]">
                    Repair Solution
                  </span>
                  <input
                    className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm font-black text-[#0F172A] outline-none transition focus:border-[#0F6BFF]"
                    disabled={estimateSaveState.status === "saving"}
                    onChange={(event) =>
                      updateProposalRepairSolution(event.target.value)
                    }
                    value={estimateDraftAgentResult?.title ?? ""}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[0.68rem] font-black uppercase tracking-[0.14em] text-[#64748B]">
                    Customer Summary
                  </span>
                  <textarea
                    className="min-h-20 w-full rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm font-semibold leading-5 text-[#334155] outline-none transition focus:border-[#0F6BFF]"
                    disabled={estimateSaveState.status === "saving"}
                    onChange={(event) =>
                      updateProposalCustomerDescription(event.target.value)
                    }
                    value={estimateDraftAgentResult?.customerDescription ?? ""}
                  />
                </label>
              </div>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#475569]">
                {estimateRepairPlanSummary?.understoodSummary ||
                  estimateDraftAgentResult?.customerDescription ||
                  "The draft is ready for technician review."}
              </p>
              {estimateRepairPlanSummary ? (
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div className="rounded-lg border border-blue-100 bg-white/85 p-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#64748B]">
                      Repairs included
                    </p>
                    {(estimateRepairPlanSummary?.includedRepairs.length ?? 0) > 0 ? (
                      <ul className="mt-1 space-y-1 text-xs font-semibold leading-5 text-[#0F172A]">
                        {estimateRepairPlanSummary?.includedRepairs.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs font-semibold text-[#64748B]">
                        Confirm repair work before sending.
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-white/85 p-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#64748B]">
                      Parts included
                    </p>
                    {(estimateRepairPlanSummary?.includedParts.length ?? 0) > 0 ? (
                      <ul className="mt-1 space-y-1 text-xs font-semibold leading-5 text-[#0F172A]">
                        {estimateRepairPlanSummary?.includedParts.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs font-semibold text-[#64748B]">
                        No specific parts listed yet.
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg border border-amber-100 bg-white/85 p-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#64748B]">
                      Needs confirmation
                    </p>
                    {(estimateRepairPlanSummary?.missingInformation.length ?? 0) > 0 ? (
                      <ul className="mt-1 space-y-1 text-xs font-semibold leading-5 text-amber-800">
                        {estimateRepairPlanSummary?.missingInformation.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs font-semibold text-emerald-700">
                        No missing estimate information flagged.
                      </p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 overflow-hidden rounded-2xl border border-[#E5E7EB]">
            <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3">
              <div>
                <p className="text-sm font-black text-[#0F172A]">
                  Proposal lines
                </p>
                <p className="mt-1 text-xs font-semibold text-[#64748B]">
                  Technician can edit every customer-facing line before sending.
                </p>
              </div>
              <p className="text-right text-2xl font-black text-[#0F6BFF]">
                {formatServiceRequestMoney(estimatePreviewTotal)}
              </p>
            </div>
            {!hasEstimateSelection ? (
              <p className="p-4 text-sm font-semibold text-[#64748B]">
                Generate a Repair Proposal to review labor, parts, material, warranty,
                and custom lines here.
              </p>
            ) : (
              <div className="divide-y divide-[#E5E7EB]">
                {selectedCatalogItems.map((item) => (
                  <div
                    className="flex flex-col gap-3 bg-white p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
                    key={item.id}
                  >
                    <div>
                      <p className="font-black text-[#0F172A]">{item.title}</p>
                      <p className="mt-1 text-xs font-semibold text-[#64748B]">
                        Labor · {item.applianceType}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-[#0F6BFF]">
                        {formatServiceRequestMoney(item.customerPrice)}
                      </span>
                      <button
                        className="text-xs font-bold text-[#64748B] transition hover:text-amber-800"
                        disabled={estimateSaveState.status === "saving"}
                        onClick={() => toggleCatalogItem(item.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                {visibleCustomEstimateLines.map((line) => {
                  const lineTotal =
                    Math.round(line.quantity * line.unitPrice * 100) / 100;
                  const lineDetailsExpanded = expandedEstimateLineIds.includes(
                    line.id,
                  );

                  return (
                    <div className="bg-white px-3 py-2 text-sm" key={line.id}>
                      <div className="grid gap-2 md:grid-cols-[7.5rem_minmax(0,1fr)_7.5rem_7.5rem_7.5rem_auto] md:items-center">
                        <label className="block">
                          <span className="sr-only">Type</span>
                          <select
                            className="w-full rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1.5 text-xs font-black text-[#334155] outline-none transition focus:border-[#0F6BFF] focus:bg-white"
                            disabled={estimateSaveState.status === "saving"}
                            onChange={(event) =>
                              updateCustomEstimateLineType(
                                line.id,
                                event.target
                                  .value as Exclude<
                                  ProfessionalEstimateLineType,
                                  "warranty"
                                >,
                              )
                            }
                            value={line.lineType}
                          >
                            {estimateQuickLineTypes.map((item) => (
                              <option key={item.lineType} value={item.lineType}>
                                {
                                  professionalEstimateLineTypeLabels[
                                    item.lineType
                                  ]
                                }
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="sr-only">Line title</span>
                          <input
                            className="w-full rounded-lg border border-transparent bg-transparent px-1 py-1.5 text-sm font-black text-[#0F172A] outline-none transition focus:border-[#0F6BFF] focus:bg-[#F8FAFC] focus:px-3"
                            disabled={estimateSaveState.status === "saving"}
                            onChange={(event) =>
                              updateCustomEstimateLineTitle(
                                line.id,
                                event.target.value,
                              )
                            }
                            value={line.customerName}
                          />
                          {line.quantity !== 1 ? (
                            <span className="ml-1 rounded-full bg-[#F8FAFC] px-2 py-0.5 text-[0.68rem] font-black text-[#64748B]">
                              Qty {line.quantity}
                            </span>
                          ) : null}
                        </label>

                        <label className="block">
                          <span className="sr-only">Customer price</span>
                          <input
                            className="w-full rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1.5 text-right text-sm font-black text-[#0F6BFF] outline-none transition focus:border-[#0F6BFF] focus:bg-white"
                            disabled={estimateSaveState.status === "saving"}
                            min="0"
                            onChange={(event) =>
                              updateCustomEstimateLinePrice(
                                line.id,
                                event.target.value,
                              )
                            }
                            step="0.01"
                            type="number"
                            value={String(line.unitPrice)}
                          />
                        </label>

                        <label className="block">
                          <span className="sr-only">Internal cost</span>
                          <input
                            className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 text-right text-sm font-bold text-[#334155] outline-none transition focus:border-[#0F6BFF]"
                            disabled={estimateSaveState.status === "saving"}
                            min="0"
                            onChange={(event) =>
                              updateCustomEstimateLineCost(
                                line.id,
                                event.target.value,
                              )
                            }
                            step="0.01"
                            type="number"
                            value={String(line.unitCost)}
                          />
                        </label>

                        <div className="flex items-center justify-between gap-3 md:block md:text-right">
                          <div>
                            <p className="text-sm font-black text-[#0F172A]">
                              {formatServiceRequestMoney(lineTotal)}
                            </p>
                            <p className="text-[0.68rem] font-bold text-[#64748B]">
                              Margin{" "}
                              {formatServiceRequestMoney(
                                lineTotal - line.quantity * line.unitCost,
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-3">
                          <button
                            className="text-xs font-black text-[#64748B] transition hover:text-[#0F6BFF] disabled:opacity-40"
                            disabled={
                              estimateSaveState.status === "saving" ||
                              customEstimateLines[0]?.id === line.id
                            }
                            onClick={() => moveCustomEstimateLine(line.id, "up")}
                            type="button"
                          >
                            Up
                          </button>
                          <button
                            className="text-xs font-black text-[#64748B] transition hover:text-[#0F6BFF] disabled:opacity-40"
                            disabled={
                              estimateSaveState.status === "saving" ||
                              customEstimateLines[customEstimateLines.length - 1]
                                ?.id === line.id
                            }
                            onClick={() =>
                              moveCustomEstimateLine(line.id, "down")
                            }
                            type="button"
                          >
                            Down
                          </button>
                          <button
                            className="text-xs font-black text-[#0F6BFF] transition hover:text-[#0057D9]"
                            onClick={() => toggleEstimateLineDetails(line.id)}
                            type="button"
                          >
                            {lineDetailsExpanded ? "Hide" : "Details"}
                          </button>
                          <button
                            className="text-xs font-bold text-[#64748B] transition hover:text-amber-800"
                            disabled={estimateSaveState.status === "saving"}
                            onClick={() => removeCustomEstimateLine(line.id)}
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      {lineDetailsExpanded ? (
                        <div className="mt-2 grid gap-2 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 md:grid-cols-[minmax(0,1fr)_5rem_7rem] md:items-end">
                          <label className="block">
                            <span className="mb-1 block text-[0.68rem] font-black uppercase tracking-[0.14em] text-[#64748B]">
                              Description
                            </span>
                            <input
                              className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold text-[#334155] outline-none transition placeholder:text-[#94A3B8] focus:border-[#0F6BFF]"
                              disabled={estimateSaveState.status === "saving"}
                              maxLength={500}
                              onChange={(event) =>
                                updateCustomEstimateLineDescription(
                                  line.id,
                                  event.target.value,
                                )
                              }
                              placeholder="Optional customer-facing description"
                              value={line.publicDescription ?? ""}
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-[0.68rem] font-black uppercase tracking-[0.14em] text-[#64748B]">
                              Qty
                            </span>
                            <input
                              className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-right text-sm font-black text-[#0F172A] outline-none transition focus:border-[#0F6BFF]"
                              disabled={estimateSaveState.status === "saving"}
                              min="1"
                              onChange={(event) =>
                                updateCustomEstimateLineQuantity(
                                  line.id,
                                  event.target.value,
                                )
                              }
                              step="0.01"
                              type="number"
                              value={String(line.quantity)}
                            />
                          </label>
                          <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 text-xs font-black text-[#334155]">
                            <input
                              checked={line.taxable}
                              className="h-4 w-4 accent-[#0F6BFF]"
                              disabled={estimateSaveState.status === "saving"}
                              onChange={(event) =>
                                updateCustomEstimateLineTaxable(
                                  line.id,
                                  event.target.checked,
                                )
                              }
                              type="checkbox"
                            />
                            Taxable
                          </label>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <div className="bg-[#F8FAFC] px-4 py-3 text-xs font-semibold text-[#64748B]">
                  Labor {laborProposalLines.length} · Parts{" "}
                  {partProposalLines.length} · Materials{" "}
                  {materialProposalLines.length} · Service Fees{" "}
                  {feeProposalLines.length}
                </div>
              </div>
            )}
          </div>

          {hasEstimateSelection ? (
            <div className="mt-3 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="line-clamp-2 text-xs font-semibold leading-5 text-[#334155]">
                  <span className="font-black text-[#0F172A]">Warranty: </span>
                  {warrantyFooterText}
                </p>
                <button
                  className="shrink-0 text-xs font-black text-[#0F6BFF] transition hover:text-[#0057D9]"
                  onClick={() =>
                    setShowEstimateWarrantyEditor((current) => !current)
                  }
                  type="button"
                >
                  {showEstimateWarrantyEditor ? "Hide warranty" : "Edit warranty"}
                </button>
              </div>
              {showEstimateWarrantyEditor ? (
                <textarea
                  className="mt-2 min-h-20 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-semibold text-[#334155] outline-none transition focus:border-[#0F6BFF]"
                  disabled={estimateSaveState.status === "saving"}
                  maxLength={1000}
                  onChange={(event) =>
                    updateWarrantyFooterText(event.target.value)
                  }
                  value={warrantyFooterText}
                />
              ) : null}
            </div>
          ) : null}

          {hasEstimateSelection ? (
            <div className="mt-3 rounded-2xl border border-[#E5E7EB] bg-white p-3">
              <dl className="grid gap-2 text-sm sm:grid-cols-4">
                <div className="rounded-xl bg-[#F8FAFC] px-3 py-2">
                  <dt className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-[#64748B]">
                    Subtotal
                  </dt>
                  <dd className="mt-1 font-black text-[#0F172A]">
                    {formatServiceRequestMoney(estimateSubtotal)}
                  </dd>
                </div>
                <div className="rounded-xl bg-[#F8FAFC] px-3 py-2">
                  <dt className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-[#64748B]">
                    Discount
                  </dt>
                  <dd className="mt-1 font-black text-[#0F172A]">
                    -{formatServiceRequestMoney(estimateDiscountAmount)}
                  </dd>
                </div>
                <div className="rounded-xl bg-[#F8FAFC] px-3 py-2">
                  <dt className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-[#64748B]">
                    Tax
                  </dt>
                  <dd className="mt-1 font-black text-[#0F172A]">
                    {formatServiceRequestMoney(estimateTaxTotal)}
                  </dd>
                </div>
                <div className="rounded-xl bg-blue-50 px-3 py-2">
                  <dt className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-[#0F6BFF]">
                    Total
                  </dt>
                  <dd className="mt-1 text-lg font-black text-[#0F6BFF]">
                    {formatServiceRequestMoney(estimateGrandTotal)}
                  </dd>
                </div>
              </dl>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-xl bg-[#F8FAFC] px-3 py-2">
                  <dt className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-[#64748B]">
                    Internal Cost
                  </dt>
                  <dd className="mt-1 font-black text-[#0F172A]">
                    {formatServiceRequestMoney(estimateInternalCostTotal)}
                  </dd>
                </div>
                <div className="rounded-xl bg-[#F8FAFC] px-3 py-2">
                  <dt className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-[#64748B]">
                    Margin
                  </dt>
                  <dd className="mt-1 font-black text-[#0F172A]">
                    {formatServiceRequestMoney(estimateMargin)} ·{" "}
                    {estimateMarginPercent.toFixed(2)}%
                  </dd>
                </div>
              </dl>
              {proposalWarnings.length > 0 ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
                  <p className="font-black">Warnings</p>
                  <ul className="mt-1 space-y-1">
                    {proposalWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <button
                className="mt-2 text-xs font-black text-[#0F6BFF] transition hover:text-[#0057D9]"
                onClick={() =>
                  setShowEstimateAdjustments((current) => !current)
                }
                type="button"
              >
                {showEstimateAdjustments
                  ? "Hide tax / discount"
                  : "Adjust tax / discount"}
              </button>
              {showEstimateAdjustments ? (
                <div className="mt-3 grid gap-3 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="mb-1 block text-[0.68rem] font-black uppercase tracking-[0.14em] text-[#64748B]">
                      Discount type
                    </span>
                    <select
                      className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-bold text-[#0F172A] outline-none transition focus:border-[#0F6BFF]"
                      disabled={estimateSaveState.status === "saving"}
                      onChange={(event) =>
                        setEstimateDiscountType(
                          event.target.value === "percent" ? "percent" : "flat",
                        )
                      }
                      value={estimateDiscountType}
                    >
                      <option value="flat">Dollar</option>
                      <option value="percent">Percent</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[0.68rem] font-black uppercase tracking-[0.14em] text-[#64748B]">
                      Discount
                    </span>
                    <input
                      className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-right text-sm font-black text-[#0F172A] outline-none transition focus:border-[#0F6BFF]"
                      disabled={estimateSaveState.status === "saving"}
                      min="0"
                      onChange={(event) =>
                        setEstimateDiscountValue(event.target.value)
                      }
                      step="0.01"
                      type="number"
                      value={estimateDiscountValue}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[0.68rem] font-black uppercase tracking-[0.14em] text-[#64748B]">
                      Tax rate %
                    </span>
                    <input
                      className="w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-right text-sm font-black text-[#0F172A] outline-none transition focus:border-[#0F6BFF]"
                      disabled={estimateSaveState.status === "saving"}
                      min="0"
                      onChange={(event) => setEstimateTaxRate(event.target.value)}
                      step="0.01"
                      type="number"
                      value={estimateTaxRate}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-[#0F172A]">
                Total: {formatServiceRequestMoney(estimatePreviewTotal)}
              </p>
              {estimateApprovalLink ? (
                <a
                  className="mt-1 inline-flex text-xs font-black text-[#0F6BFF] hover:text-[#0057D9]"
                  href={estimateApprovalLink?.approvalUrl ?? "#"}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open customer approval link
                </a>
              ) : (
                <p className="mt-1 text-xs font-semibold text-[#64748B]">
                  Save a draft, preview the customer view, then send when ready.
                </p>
              )}
              {proposalBlockingErrors.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs font-semibold text-amber-800">
                  {proposalBlockingErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-black text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={
                  estimateSaveState.status === "saving" ||
                  estimateGenerationState.status === "generating" ||
                  estimateDiagnosisText.trim().length === 0
                }
                onClick={() => void generateEstimateDraftFromDiagnosis()}
                type="button"
              >
                {estimateGenerationState.status === "generating"
                  ? "Generating..."
                  : "Regenerate"}
              </button>
              <button
                className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-black text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canSaveEstimate}
                onClick={() => void createEstimate({ sendAfterSave: false })}
                type="button"
              >
                {estimateSaveState.status === "saving"
                  ? "Saving..."
                  : editingEstimateId
                    ? "Update Draft"
                    : "Save Draft"}
              </button>
              <button
                className="rounded-xl border border-[#0F6BFF]/30 bg-blue-50 px-4 py-3 text-sm font-black text-[#0F6BFF] transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!hasEstimateSelection}
                onClick={() => setIsProposalPreviewOpen(true)}
                type="button"
              >
                Preview
              </button>
              <button
                className="rounded-xl bg-[#0F6BFF] px-5 py-3 text-sm font-black text-white shadow-[0_8px_18px_rgba(15,107,255,0.22)] transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canSendProposal}
                onClick={() => void createEstimate({ sendAfterSave: true })}
                type="button"
              >
                {estimateSaveState.status === "saving" || sendingEstimateId
                  ? "Sending..."
                  : editingEstimateId
                    ? "Update & Send"
                    : "Send"}
              </button>
            </div>
          </div>
          {estimateSaveState.message ? (
            <p
              className={`mt-3 text-sm font-semibold ${
                estimateSaveState.status === "error"
                  ? "text-amber-800"
                  : "text-[#0F6BFF]"
              }`}
            >
              {estimateSaveState.message}
            </p>
          ) : null}
          {isProposalPreviewOpen ? (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/55 px-3 py-4 backdrop-blur-sm sm:items-center">
              <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F6BFF]">
                      Customer Preview
                    </p>
                    <h3 className="mt-2 text-2xl font-black text-[#0F172A]">
                      Repair Proposal
                    </h3>
                  </div>
                  <button
                    className="rounded-full border border-[#E5E7EB] px-3 py-1 text-sm font-black text-[#334155]"
                    onClick={() => setIsProposalPreviewOpen(false)}
                    type="button"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-5 rounded-2xl bg-[#F8FAFC] p-4">
                  <p className="text-sm font-black text-[#0F172A]">
                    {proposalRepairSolution}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#475569]">
                    {proposalCustomerDescription}
                  </p>
                  <div className="mt-4 rounded-2xl bg-white p-4">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
                      Proposal Total
                    </p>
                    <p className="mt-1 text-4xl font-black text-[#0F6BFF]">
                      {formatServiceRequestMoney(estimatePreviewTotal)}
                    </p>
                  </div>
                </div>
                <details className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-black text-[#0F6BFF]">
                    View Itemized Estimate
                  </summary>
                  <div className="divide-y divide-[#E5E7EB] border-t border-[#E5E7EB]">
                    {visibleCustomEstimateLines.map((line) => (
                      <div
                        className="flex items-start justify-between gap-3 px-4 py-3 text-sm"
                        key={line.id}
                      >
                        <div>
                          <p className="font-black text-[#0F172A]">
                            {line.quantity}x {line.customerName}
                          </p>
                          {line.publicDescription ? (
                            <p className="mt-1 text-xs leading-5 text-[#64748B]">
                              {line.publicDescription}
                            </p>
                          ) : null}
                        </div>
                        <p className="shrink-0 font-black text-[#0F172A]">
                          {formatServiceRequestMoney(
                            line.quantity * line.unitPrice,
                          )}
                        </p>
                      </div>
                    ))}
                    <div className="px-4 py-3 text-sm">
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span>{formatServiceRequestMoney(estimateSubtotal)}</span>
                      </div>
                      <div className="mt-1 flex justify-between">
                        <span>Tax</span>
                        <span>{formatServiceRequestMoney(estimateTaxTotal)}</span>
                      </div>
                      <div className="mt-3 flex justify-between border-t border-[#E5E7EB] pt-3 font-black">
                        <span>Total</span>
                        <span>{formatServiceRequestMoney(estimateGrandTotal)}</span>
                      </div>
                    </div>
                  </div>
                </details>
                <p className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm leading-6 text-[#334155]">
                  <span className="font-black text-[#0F172A]">Warranty: </span>
                  {warrantyFooterText}
                </p>
              </div>
            </div>
          ) : null}
        </div>
        ) : null}
        </div>
        ) : null}

        {false ? (
        <div>
        <div className="mt-6 space-y-6">
          <div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#64748B]">
                  Saved estimates
                </p>
                <h3 className="mt-2 text-lg font-bold text-[#0F172A]">
                  Active / Current
                </h3>
              </div>
              <p className="text-xs font-semibold text-[#64748B]">
                {currentEstimates.length} current · {estimateHistory.length} history
              </p>
            </div>
            {estimatesState.status === "loading" ? (
              <p className="mt-3 text-sm text-[#64748B]">Loading estimates...</p>
            ) : null}
            {estimatesState.status === "error" ? (
              <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-800">
                {estimatesState.error}
              </p>
            ) : null}
            {estimatesState.status === "ready" &&
            estimatesState.estimates.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm leading-6 text-[#64748B]">
                No estimates yet.
              </p>
            ) : null}
            {currentEstimates.length > 0 ? (
              <div className="mt-3">
                {currentEstimates.map(renderEstimateCard)}
              </div>
            ) : estimatesState.status === "ready" &&
              estimatesState.estimates.length > 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm leading-6 text-[#64748B]">
                No active estimates. Review history for prior estimate documents.
              </p>
            ) : null}
          </div>

          <div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-bold text-[#0F172A]">Estimate history</h3>
              {estimateHistory.length > 0 ? (
                <button
                  className="rounded-md border border-[#E5E7EB] px-3 py-2 text-xs font-bold text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
                  onClick={() => setShowEstimateHistory((current) => !current)}
                  type="button"
                >
                  {showEstimateHistory ? "Hide history" : "Show history"}
                </button>
              ) : null}
            </div>
            {estimateHistory.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm leading-6 text-[#64748B]">
                No history.
              </p>
            ) : visibleEstimateHistory.length > 0 ? (
              <div className="mt-3">
                {visibleEstimateHistory.map(renderEstimateCard)}
              </div>
            ) : (
              <p className="mt-3 rounded-md border border-dashed border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm leading-6 text-[#64748B]">
                {hiddenEstimateHistoryCount} archived estimate
                {hiddenEstimateHistoryCount === 1 ? "" : "s"} hidden.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                Invoices
              </p>
              <h3 className="mt-2 text-lg font-bold text-[#0F172A]">
                Open / Current
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#64748B]">
                Invoices are independent documents copied from approved
                estimates. Manual send, paid, and void actions are available.
              </p>
            </div>
            <p className="text-xs font-semibold text-[#64748B]">
              {currentInvoices.length} open · {invoiceHistory.length} history
            </p>
          </div>

          {invoiceActionState.message ? (
            <p
              className={`mt-3 text-sm font-semibold ${
                invoiceActionState.status === "error"
                  ? "text-amber-800"
                  : "text-emerald-700"
              }`}
            >
              {invoiceActionState.message}
            </p>
          ) : null}

          {invoicesState.status === "loading" ? (
            <p className="mt-4 text-sm text-[#64748B]">Loading invoices...</p>
          ) : null}
          {invoicesState.status === "error" ? (
            <p className="mt-4 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-800">
              {invoicesState.error}
            </p>
          ) : null}
          {invoicesState.status === "ready" && invoicesState.invoices.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-[#E5E7EB] bg-white p-4 text-sm leading-6 text-[#64748B]">
              No invoices yet. Create one from an approved estimate.
            </p>
          ) : null}
          {currentInvoices.length > 0 ? (
            <div className="mt-4 space-y-3">
              {currentInvoices.map(renderInvoiceCard)}
            </div>
          ) : invoicesState.status === "ready" &&
            invoicesState.invoices.length > 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-[#E5E7EB] bg-white p-4 text-sm leading-6 text-[#64748B]">
              No open invoices. Review history for paid or void invoices.
            </p>
          ) : null}

          <div className="mt-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-bold text-[#0F172A]">Invoice history</h3>
              {invoiceHistory.length > 0 ? (
                <button
                  className="rounded-md border border-[#E5E7EB] px-3 py-2 text-xs font-bold text-[#334155] transition hover:border-emerald-300/50 hover:text-emerald-700"
                  onClick={() => setShowInvoiceHistory((current) => !current)}
                  type="button"
                >
                  {showInvoiceHistory ? "Hide history" : "Show history"}
                </button>
              ) : null}
            </div>
            {invoiceHistory.length === 0 ? (
              <p className="mt-3 rounded-md border border-dashed border-[#E5E7EB] bg-white p-4 text-sm leading-6 text-[#64748B]">
                No history.
              </p>
            ) : visibleInvoiceHistory.length > 0 ? (
              <div className="mt-3 space-y-3">
                {visibleInvoiceHistory.map(renderInvoiceCard)}
              </div>
            ) : (
              <p className="mt-3 rounded-md border border-dashed border-[#E5E7EB] bg-white p-4 text-sm leading-6 text-[#64748B]">
                {hiddenInvoiceHistoryCount} void invoice
                {hiddenInvoiceHistoryCount === 1 ? "" : "s"} hidden.
              </p>
            )}
          </div>
        </div>
        </div>
        ) : null}
      </section>
        )
      ) : null}

      {activeJobTab === "notes" ||
      activeJobTab === "photos" ||
      activeJobTab === "timeline" ? (
      <section className="mt-6 grid gap-5 xl:grid-cols-[0.8fr_0.8fr_1.1fr]">
        {activeJobTab === "notes" ? (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F6BFF]">
            Internal note
          </p>
          <label className="mt-4 block">
            <span className="text-sm font-bold text-[#0F172A]">Note type</span>
            <select
              className="mt-2 w-full rounded-md border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 text-sm text-[#0F172A] outline-none transition focus:border-[#0F6BFF]"
              disabled={noteSaveState.status === "saving"}
              onChange={(event) =>
                setNoteType(event.target.value as ServiceRequestWritableNoteType)
              }
              value={noteType}
            >
              {SERVICE_REQUEST_NOTE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {noteTypeLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-bold text-[#0F172A]">Quick note</span>
            <textarea
              className="mt-2 min-h-32 w-full rounded-md border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 text-sm leading-6 text-[#0F172A] outline-none transition placeholder:text-[#64748B] focus:border-[#0F6BFF]"
              disabled={noteSaveState.status === "saving"}
              maxLength={2000}
              onChange={(event) => setNoteBody(event.target.value)}
              placeholder="Diagnostics, parts reminder, dispatcher note..."
              value={noteBody}
            />
          </label>
          <button
            className="mt-4 w-full rounded-md bg-[#0F6BFF] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={noteSaveState.status === "saving" || !noteBody.trim()}
            onClick={() => void addNote()}
            type="button"
          >
            {noteSaveState.status === "saving" ? "Saving..." : "Add Note"}
          </button>
          {noteSaveState.message ? (
            <p
              className={`mt-3 text-sm font-semibold ${
                noteSaveState.status === "error"
                  ? "text-amber-800"
                  : "text-[#0F6BFF]"
              }`}
            >
            {noteSaveState.message}
          </p>
        ) : null}
        </div>
        ) : null}

        {activeJobTab === "photos" ? (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F6BFF]">
            Photos
          </p>
          <label className="mt-4 block">
            <span className="text-sm font-bold text-[#0F172A]">Photo type</span>
            <select
              className="mt-2 w-full rounded-md border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 text-sm text-[#0F172A] outline-none transition focus:border-[#0F6BFF]"
              disabled={photoSaveState.status === "saving"}
              onChange={(event) =>
                setPhotoType(
                  event.target.value as Exclude<
                    DatabaseServiceRequestPhotoType,
                    "customer_upload"
                  >,
                )
              }
              value={photoType}
            >
              {technicianPhotoTypes.map((type) => (
                <option key={type} value={type}>
                  {photoTypeLabels[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-4 block">
            <span className="text-sm font-bold text-[#0F172A]">
              Upload image
            </span>
            <input
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="mt-2 block w-full rounded-md border border-dashed border-[#E5E7EB] bg-[#F8FAFC] px-3 py-4 text-xs font-semibold text-[#334155] file:mr-3 file:rounded-md file:border-0 file:bg-[#0F6BFF] file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
              disabled={photoSaveState.status === "saving"}
              onChange={(event) =>
                handleTechnicianPhotoChange(
                  Array.from(event.target.files ?? []),
                )
              }
              type="file"
            />
          </label>
          {photoFile ? (
            <p className="mt-3 text-xs font-bold text-[#334155]">
              Selected: {photoFile.name}
            </p>
          ) : null}
          {photoFileError ? (
            <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-800">
              {photoFileError}
            </p>
          ) : null}
          <button
            className="mt-4 w-full rounded-md bg-[#0F6BFF] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={photoSaveState.status === "saving" || !photoFile}
            onClick={() => void addTechnicianPhoto()}
            type="button"
          >
            {photoSaveState.status === "saving" ? "Uploading..." : "Add Photo"}
          </button>
          {photoSaveState.message ? (
            <p
              className={`mt-3 text-sm font-semibold ${
                photoSaveState.status === "error"
                  ? "text-amber-800"
                  : "text-[#0F6BFF]"
              }`}
            >
              {photoSaveState.message}
            </p>
          ) : null}

          <div className="mt-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#64748B]">
              Gallery
            </p>
            {photosState.status === "loading" ? (
              <p className="mt-3 text-sm text-[#64748B]">Loading photos...</p>
            ) : null}
            {photosState.status === "error" ? (
              <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-800">
                {photosState.error}
              </p>
            ) : null}
            {photosState.status === "ready" && photosState.photos.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-[#64748B]">
                No photos attached yet.
              </p>
            ) : null}
            {photosState.photos.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {photosState.photos.map((photo) => (
                  <a
                    className="group overflow-hidden rounded-md border border-[#E5E7EB] bg-[#F8FAFC]"
                    href={photo.signedUrl ?? "#"}
                    key={photo.id}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {photo.signedUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={photo.originalFilename ?? photoTypeLabels[photo.photoType]}
                        className="aspect-square w-full object-cover transition group-hover:scale-105"
                        src={photo.signedUrl}
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center p-3 text-center text-xs font-bold text-[#64748B]">
                        Signed URL unavailable
                      </div>
                    )}
                    <p className="truncate px-2 py-2 text-xs font-bold text-[#334155]">
                      {photoTypeLabels[photo.photoType]}
                    </p>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        ) : null}

        {activeJobTab === "timeline" ? (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F6BFF]">
            Service timeline
          </p>
          <div className="mt-4 space-y-3">
            {notesState.status === "loading" ? (
              <p className="text-sm text-[#64748B]">Loading timeline...</p>
            ) : null}
            {notesState.status === "error" ? (
              <p className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-800">
                {notesState.error}
              </p>
            ) : null}
            {photosState.status === "error" ? (
              <p className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-800">
                {photosState.error}
              </p>
            ) : null}
            {timelineItems.map((item) => (
              <TimelineItem
                key={item.id}
                body={item.body}
                createdAt={item.createdAt}
                label={item.label}
              />
            ))}
            <TimelineItem
              body="Job submitted from public intake."
              createdAt={request.createdAt}
              label="Job created"
            />
          </div>
        </div>
        ) : null}
      </section>
      ) : null}

      {isAttachmentGalleryOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-white lg:hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-[#E5E7EB] px-4 py-3">
            <div>
              <p className="text-lg font-black text-[#0F172A]">Attachments</p>
              <p className="text-xs font-bold text-[#64748B]">
                {attachmentCountLabel}
              </p>
            </div>
            <button
              aria-label="Close attachments"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-2xl font-light text-[#334155] transition active:bg-[#F1F5F9]"
              onClick={closeAttachmentGallery}
              type="button"
            >
              ×
            </button>
          </div>

          {activeAttachment ? (
            <div className="flex min-h-0 flex-1 flex-col bg-[#0F172A] text-white">
              <div className="flex shrink-0 items-center justify-between px-4 py-3">
                <button
                  className="text-sm font-bold text-white/80"
                  onClick={() => setActiveAttachmentIndex(null)}
                  type="button"
                >
                  Gallery
                </button>
                <p className="text-sm font-black">
                  {(activeAttachmentIndex ?? 0) + 1} of {photosState.photos.length}
                </p>
                <button
                  aria-label="Close attachment viewer"
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-2xl font-light text-white transition active:bg-white/10"
                  onClick={closeAttachmentGallery}
                  type="button"
                >
                  ×
                </button>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center px-3">
                {activeAttachment.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={
                      activeAttachment.originalFilename ??
                      photoTypeLabels[activeAttachment.photoType]
                    }
                    className="max-h-full max-w-full object-contain"
                    src={activeAttachment.signedUrl}
                  />
                ) : (
                  <div className="rounded-2xl bg-white/10 px-4 py-6 text-center text-sm font-bold text-white/80">
                    Photo uploaded, but preview could not be loaded.
                  </div>
                )}
              </div>
              <div className="shrink-0 px-4 pb-5 pt-3">
                <div className="flex items-center justify-between">
                  <button
                    aria-label="Previous attachment"
                    className="flex min-h-11 min-w-20 items-center justify-center rounded-full bg-white/10 px-4 text-sm font-black text-white disabled:opacity-35"
                    disabled={photosState.photos.length < 2}
                    onClick={showPreviousAttachment}
                    type="button"
                  >
                    Previous
                  </button>
                  <button
                    aria-label="Next attachment"
                    className="flex min-h-11 min-w-20 items-center justify-center rounded-full bg-white/10 px-4 text-sm font-black text-white disabled:opacity-35"
                    disabled={photosState.photos.length < 2}
                    onClick={showNextAttachment}
                    type="button"
                  >
                    Next
                  </button>
                </div>
                <div className="mt-4 rounded-2xl bg-white/10 p-3">
                  <p className="truncate text-sm font-black">
                    {activeAttachment.originalFilename ??
                      photoTypeLabels[activeAttachment.photoType]}
                  </p>
                  <p className="mt-1 text-xs font-bold text-white/70">
                    Uploaded {formatServiceRequestDate(activeAttachment.createdAt)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-white/70">
                    {photoTypeLabels[activeAttachment.photoType]}
                  </p>
                  <div className="mt-3 rounded-xl bg-white/10 p-3">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-white/60">
                      Asset Intelligence
                    </p>
                    <p className="mt-1 text-sm font-bold text-white">
                      {activeAttachment.assetProcessingStatus === "processed"
                        ? "Asset identified"
                        : activeAttachment.assetProcessingStatus === "needs_review"
                          ? "Possible asset needs review"
                          : activeAttachment.assetProcessingStatus === "failed"
                            ? "Asset processing failed"
                            : activeAttachment.assetProcessingStatus === "pending"
                              ? "Analyzing..."
                            : activeAttachment.assetProcessingStatus === "no_asset"
                              ? "No asset identified"
                              : "Eligible for processing"}
                    </p>
                    {activeAttachmentAssetBrand ||
                    activeAttachmentAssetModel ||
                    activeAttachmentAssetSerial ? (
                      <p className="mt-1 text-xs font-semibold leading-5 text-white/75">
                        {[activeAttachmentAssetBrand, activeAttachmentAssetModel]
                          .filter(Boolean)
                          .join(" ")}
                        {activeAttachmentAssetSerial
                          ? ` · SN ${activeAttachmentAssetSerial}`
                          : ""}
                      </p>
                    ) : null}
                    {activeAttachment.assetProcessingError ? (
                      <p className="mt-1 text-xs font-semibold text-amber-100">
                        {activeAttachment.assetProcessingError}
                      </p>
                    ) : null}
                    {activeAttachment.assetProcessingStatus === "failed" ? (
                      <button
                        className="mt-3 rounded-full bg-white/15 px-3 py-2 text-xs font-black text-white disabled:cursor-wait disabled:opacity-60"
                        disabled={assetAttachmentActionState.status === "saving"}
                        onClick={handleRetryActiveAttachmentAssetIdentification}
                        type="button"
                      >
                        Retry identification
                      </button>
                    ) : null}
                    {activeAttachmentAssetHref ? (
                      <Link
                        className="mt-3 inline-flex rounded-full bg-white px-3 py-2 text-xs font-black text-[#2563EB]"
                        href={activeAttachmentAssetHref}
                      >
                        View Asset
                      </Link>
                    ) : null}
                    {request.customerApplianceId ||
                    activeAttachment.linkedCustomerApplianceId ? (
                      !activeAttachmentIsIdentifiedLabel ? (
                        <button
                          className="mt-3 rounded-full bg-white px-3 py-2 text-xs font-black text-[#2563EB] disabled:cursor-wait disabled:opacity-60"
                          disabled={assetAttachmentActionState.status === "saving"}
                          onClick={handleSetActiveAttachmentAsAssetCover}
                          type="button"
                        >
                          {assetAttachmentActionState.status === "saving"
                            ? "Saving..."
                            : "Set as Asset Cover"}
                        </button>
                      ) : null
                    ) : null}
                    {assetAttachmentActionState.message ? (
                      <p
                        className={`mt-2 text-xs font-bold ${
                          assetAttachmentActionState.status === "error"
                            ? "text-amber-100"
                            : "text-white/80"
                        }`}
                      >
                        {assetAttachmentActionState.message}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="grid grid-cols-2 gap-2 border-b border-[#E5E7EB] px-4 py-3">
                <button
                  className="flex min-h-11 items-center justify-center rounded-xl bg-[#EEF6FF] px-3 text-sm font-black text-[#2563EB] disabled:cursor-wait disabled:opacity-50"
                  disabled={photoSaveState.status === "saving"}
                  onClick={openAttachmentCameraPicker}
                  type="button"
                >
                  Camera
                </button>
                <button
                  className="flex min-h-11 items-center justify-center rounded-xl bg-[#EEF6FF] px-3 text-sm font-black text-[#2563EB] disabled:cursor-wait disabled:opacity-50"
                  disabled={photoSaveState.status === "saving"}
                  onClick={openAttachmentGalleryPicker}
                  type="button"
                >
                  Add from Gallery
                </button>
              </div>
              {photoSaveState.status === "saving" ? (
                <p className="px-4 py-3 text-sm font-bold text-[#64748B]">
                  Uploading photo...
                </p>
              ) : photoSaveState.status === "error" && photoSaveState.message ? (
                <p className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">
                  {photoSaveState.message}
                </p>
              ) : null}
              {photosState.status === "loading" ? (
                <div className="grid grid-cols-3 gap-2 p-4">
                  {[0, 1, 2, 3, 4, 5].map((item) => (
                    <div
                      className="aspect-square animate-pulse rounded-2xl bg-[#F1F5F9]"
                      key={item}
                    />
                  ))}
                </div>
              ) : null}
              {photosState.status === "error" ? (
                <div className="m-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-bold text-amber-800">
                    Attachment list could not be loaded.
                  </p>
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    {photosState.error}
                  </p>
                  <button
                    className="mt-3 text-sm font-black text-[#2563EB]"
                    onClick={() => void loadPhotos()}
                    type="button"
                  >
                    Retry
                  </button>
                </div>
              ) : null}
              {photosState.status === "ready" && photosState.photos.length === 0 ? (
                <div className="flex flex-1 items-center justify-center px-6 text-center">
                  <div>
                    <p className="text-lg font-black text-[#0F172A]">
                      No attachments yet
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[#64748B]">
                      Add a photo from the camera or gallery when the job needs
                      visual documentation.
                    </p>
                  </div>
                </div>
              ) : null}
              {photosState.photos.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 overflow-y-auto p-4">
                  {photosState.photos.map((photo, index) => (
                    <button
                      aria-label={`Open attachment ${index + 1} of ${photosState.photos.length}`}
                      className="overflow-hidden rounded-2xl bg-[#F1F5F9] text-xs font-bold text-[#64748B] transition active:scale-[0.98]"
                      key={photo.id}
                      onClick={() => setActiveAttachmentIndex(index)}
                      type="button"
                    >
                      {photo.signedUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt={photo.originalFilename ?? photoTypeLabels[photo.photoType]}
                          className="aspect-square w-full object-cover"
                          loading="lazy"
                          src={photo.signedUrl}
                        />
                      ) : (
                        <span className="flex aspect-square w-full items-center justify-center px-2 text-center">
                          Preview unavailable
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {jobDeleteState.status !== "idle" ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/55 px-3 py-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-black text-[#0F172A]">Delete this job?</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#475569]">
              This job will be permanently deleted. This action cannot be undone.
            </p>
            {jobDeleteState.status === "error" ? (
              <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                {jobDeleteState.message}
              </p>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className="rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm font-black text-[#0F172A] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={jobDeleteState.status === "deleting"}
                onClick={() => setJobDeleteState({ status: "idle", message: null })}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={jobDeleteState.status === "deleting"}
                onClick={() => void deleteCurrentJob()}
                type="button"
              >
                {jobDeleteState.status === "deleting" ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Link className="mt-6 inline-flex text-sm font-bold text-[#0F6BFF]" href={returnTo}>
        Back to jobs
      </Link>
    </article>
  );
}

function TimelineItem({
  body,
  createdAt,
  label,
}: {
  body: string;
  createdAt: string;
  label: string;
}) {
  return (
    <article className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-[#0F172A]">{label}</p>
        <time className="text-xs font-semibold text-[#64748B]">
          {formatServiceRequestDate(createdAt)}
        </time>
      </div>
      <p className="mt-2 text-sm leading-6 text-[#334155]">{body}</p>
    </article>
  );
}
