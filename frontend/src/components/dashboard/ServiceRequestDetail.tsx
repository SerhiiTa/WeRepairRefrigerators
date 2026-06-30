"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { StatusBadge } from "@/components/StatusBadge";
import {
  buildAppleMapsUrl,
  buildFormattedAddress,
  buildGoogleMapsUrl,
  getAddressAutocompleteAdapter,
  type AddressSuggestion,
} from "@/lib/address-autocomplete";
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
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
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

type ServiceRequestDetailProps = {
  requestId: string;
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

type AddressSaveState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

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
  detectedRepairType: string;
  applianceCategory: string;
  operationsCount: number;
  partsCount: number;
  materialsCount: number;
  confidence: "high" | "medium" | "low";
  pricingWarnings: string[];
};

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

const jobWorkspaceTabs = [
  { id: "overview", label: "Overview" },
  { id: "timeline", label: "Timeline" },
  { id: "notes", label: "Notes" },
  { id: "photos", label: "Photos" },
  { id: "estimate", label: "Estimate" },
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

export function ServiceRequestDetail({ requestId }: ServiceRequestDetailProps) {
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
  const [estimateDiagnosisText, setEstimateDiagnosisText] = useState("");
  const [estimateDraftAgentResult, setEstimateDraftAgentResult] =
    useState<EstimateDraftAgentResult | null>(null);
  const [estimateRepairPlanSummary, setEstimateRepairPlanSummary] =
    useState<EstimateRepairPlanSummary | null>(null);
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
  const [viewingEstimateId, setViewingEstimateId] = useState<string | null>(
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

  useEffect(() => {
    let isMounted = true;

    async function loadRequest() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setState({
            status: "error",
            request: null,
            error: "Job reads are not configured for this workspace.",
          });
        }
        return;
      }

      const { data, error } = await supabase
        .from("service_requests")
        .select(SERVICE_REQUEST_SELECT_COLUMNS)
        .eq("id", requestId)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

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
      setAddressForm(buildAddressFormState(request));
      setAddressSaveState({ status: "idle", message: null });
      setIsEditingAddress(false);
    }

    void loadRequest();

    return () => {
      isMounted = false;
    };
  }, [requestId]);

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
    let isActive = true;

    async function searchAddresses() {
      const adapter = getAddressAutocompleteAdapter();
      const query = addressSearchQuery.trim();

      if (!isEditingAddress || !adapter.isConfigured || query.length < 3) {
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
  }, [addressSearchQuery, isEditingAddress]);

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

  async function saveAddress() {
    if (state.status !== "ready") {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setAddressSaveState({
        status: "error",
        message: "Address updates are not available for this workspace.",
      });
      return;
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setAddressSaveState({
        status: "error",
        message: "Log in again before updating the service address.",
      });
      return;
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
    setIsEditingAddress(false);
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

    const result = await uploadTechnicianServiceRequestPhoto({
      requestId: state.request.id,
      file: photoFile,
      photoType,
    });

    if (!result.ok) {
      setPhotoSaveState({
        status: "error",
        message: result.message,
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
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${index}`;
  }

  function applyGeneratedEstimateDraft(draft: EstimateDraftAgentResult) {
    setEstimateDraftAgentResult(draft);
    setSelectedCatalogItemIds([]);
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
  }

  function summarizeEstimateRepairPlan(
    repairPlan: unknown,
    pricingWarnings: unknown,
  ): EstimateRepairPlanSummary | null {
    if (!repairPlan || typeof repairPlan !== "object") {
      return null;
    }

    const plan = repairPlan as {
      detectedRepairType?: unknown;
      applianceCategory?: unknown;
      requiredOperations?: unknown;
      likelyParts?: unknown;
      materials?: unknown;
      confidence?: unknown;
    };
    const confidence =
      plan.confidence === "high" ||
      plan.confidence === "medium" ||
      plan.confidence === "low"
        ? plan.confidence
        : "medium";

    return {
      detectedRepairType:
        typeof plan.detectedRepairType === "string" &&
        plan.detectedRepairType.trim()
          ? plan.detectedRepairType
          : "repair plan",
      applianceCategory:
        typeof plan.applianceCategory === "string" &&
        plan.applianceCategory.trim()
          ? plan.applianceCategory
          : "general",
      operationsCount: Array.isArray(plan.requiredOperations)
        ? plan.requiredOperations.length
        : 0,
      partsCount: Array.isArray(plan.likelyParts)
        ? plan.likelyParts.length
        : 0,
      materialsCount: Array.isArray(plan.materials) ? plan.materials.length : 0,
      confidence,
      pricingWarnings: Array.isArray(pricingWarnings)
        ? pricingWarnings
            .filter((warning): warning is string => typeof warning === "string")
            .slice(0, 3)
        : [],
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
        message:
          payload.message ??
          (source === "openai"
            ? "Generated with AI. Please review before sending."
            : "Generated locally. OpenAI estimate agent was not available."),
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
  }

  function removeCustomEstimateLine(lineId: string) {
    setCustomEstimateLines((current) =>
      current.filter((line) => line.id !== lineId),
    );
    setCreatedEstimateSummary(null);
    setEstimateSaveState({ status: "idle", message: null });
  }

  function resetEstimateBuilder() {
    setSelectedCatalogItemIds([]);
    setCustomEstimateLines([]);
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
    setExpandedEstimateLineIds([]);
    setEstimateGenerationState({ status: "idle", message: null, source: null });
    setEstimateSaveState({ status: "idle", message: null });
  }

  function beginNewDraft() {
    setSelectedCatalogItemIds([]);
    setCustomEstimateLines([]);
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
    setEstimateDiscountType("flat");
    setEstimateDiscountValue("0");
    setEstimateTaxRate("8.25");
    setShowEstimateAdjustments(false);
    setShowEstimateWarrantyEditor(false);
    setExpandedEstimateLineIds([]);
    setEstimateGenerationState({ status: "idle", message: null, source: null });
    setEstimateSaveState({
      status: "idle",
      message: null,
    });
  }

  async function createEstimate(options?: { sendAfterSave?: boolean }) {
    if (state.status !== "ready") {
      return null;
    }

    const pendingCustomLines = customEstimateLines;

    if (selectedCatalogItemIds.length === 0 && pendingCustomLines.length === 0) {
      setEstimateSaveState({
        status: "error",
        message: "Generate an estimate or add at least one line before sending.",
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
      estimateDecisionContext: {
        eventSource: "one_screen_estimate_agent",
        diagnosisText: estimateDiagnosisText.trim(),
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
          persistedEstimateTotalsCurrentlyUseLineSubtotalOnly: true,
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
          ? "Draft estimate updated. The builder was reset so the saved draft is now the source of truth."
          : "Estimate created and saved. The builder was reset so you can prepare another option if needed.",
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

  async function archiveEstimateDraft(estimate: DashboardServiceRequestEstimate) {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setEstimateSaveState({
        status: "error",
        message: "Estimates are not available for this workspace.",
      });
      return;
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setEstimateSaveState({
        status: "error",
        message: "Log in again before archiving an estimate.",
      });
      return;
    }

    setEstimateSaveState({ status: "saving", message: null });

    const response = await fetch(
      `/api/service-requests/${estimate.serviceRequestId}/estimates`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ estimateId: estimate.id }),
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
    } | null;

    if (!response.ok || !payload?.ok) {
      setEstimateSaveState({
        status: "error",
        message: payload?.message ?? "We could not archive this draft estimate yet.",
      });
      return;
    }

    if (editingEstimateId === estimate.id) {
      resetEstimateBuilder();
    }

    setViewingEstimateId(estimate.id);
    setViewingInvoiceId(null);
    setEstimateSaveState({
      status: "success",
      message: `${estimate.estimateNumber} was archived and remains in estimate history.`,
    });
    setEstimateApprovalLink(null);
    void loadEstimates();
    void loadNotes();
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
      return;
    }

    const sessionResult = await getDashboardActionSession(supabase);

    if (!sessionResult.ok) {
      setSendingEstimateId(null);
      setEstimateSaveState({
        status: "error",
        message: sessionResult.message,
      });
      return;
    }

    const { data: sessionData, error: sessionError } = sessionResult.response;
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setSendingEstimateId(null);
      setEstimateSaveState({
        status: "error",
        message: "Log in again before sending an estimate.",
      });
      return;
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
      return;
    }

    if (!response.ok || !payload?.ok || !payload.approvalUrl) {
      setSendingEstimateId(null);
      setEstimateSaveState({
        status: "error",
        message:
          payload?.message ?? "We could not create an approval link for this estimate.",
      });
      return;
    }

    setEstimateApprovalLink({
      estimateId,
      approvalUrl: payload.approvalUrl,
    });
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
                estimateStatus: "sent",
                sentAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : currentEstimate,
        ),
        error: null,
      };
    });
    if (payload.estimate?.service_request_status === "estimate_sent") {
      setState((current) =>
        current.status === "ready"
          ? {
              status: "ready",
              request: {
                ...current.request,
                status: "estimate_sent",
              },
              error: null,
            }
          : current,
      );
      setSelectedStatus("estimate_sent");
    }
    setSendingEstimateId(null);
    setEstimateSaveState({
      status: "success",
      message:
        "Estimate sent. Copy the approval link or open the customer view.",
    });
    void loadEstimates();
    void loadNotes();
  }

  async function sendEstimateToCustomer(estimate: DashboardServiceRequestEstimate) {
    await sendEstimateById(estimate.id, estimate.estimateNumber);
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
        <Link className="mt-5 inline-flex text-sm font-bold text-[#0F6BFF]" href="/dashboard/leads">
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
        <Link className="mt-5 inline-flex text-sm font-bold text-[#0F6BFF]" href="/dashboard/leads">
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
  const viewingEstimate =
    estimatesState.estimates.find((estimate) => estimate.id === viewingEstimateId) ??
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
  const assignedTechnicianLabel =
    request.selectedTechnicianBusinessName ??
    (request.assignedTechnicianProfileId ? "Assigned technician" : "Unassigned");
  const addressSummary = request.streetAddress
    ? fullAddress
    : `${request.city ? `${request.city}, ` : ""}${request.state} ${request.zipCode}`;
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
  const customEstimateLinesTotal = customEstimateLines.reduce(
    (total, line) => total + line.quantity * line.unitPrice,
    0,
  );
  const selectedCatalogItemsTotal = selectedCatalogItems.reduce(
    (total, item) => total + item.customerPrice,
    0,
  );
  const estimateSubtotal = selectedCatalogItemsTotal + customEstimateLinesTotal;
  const parsedDiscountValue = Math.max(0, Number(estimateDiscountValue) || 0);
  const estimateDiscountAmount =
    estimateDiscountType === "percent"
      ? Math.min(
          estimateSubtotal,
          estimateSubtotal * (Math.min(100, parsedDiscountValue) / 100),
        )
      : Math.min(estimateSubtotal, parsedDiscountValue);
  const estimateTaxableSubtotalBeforeDiscount =
    selectedCatalogItems.reduce(
      (total, item) => total + (item.taxable ? item.customerPrice : 0),
      0,
    ) +
    customEstimateLines.reduce(
      (total, line) =>
        total + (line.taxable ? line.quantity * line.unitPrice : 0),
      0,
    );
  const taxableDiscountShare =
    estimateSubtotal > 0
      ? estimateDiscountAmount *
        (estimateTaxableSubtotalBeforeDiscount / estimateSubtotal)
      : 0;
  const estimateTaxableSubtotal = Math.max(
    0,
    estimateTaxableSubtotalBeforeDiscount - taxableDiscountShare,
  );
  const parsedTaxRate = Math.max(0, Math.min(20, Number(estimateTaxRate) || 0));
  const estimateTaxTotal =
    Math.round(estimateTaxableSubtotal * (parsedTaxRate / 100) * 100) / 100;
  const estimateGrandTotal =
    Math.round(
      (estimateSubtotal - estimateDiscountAmount + estimateTaxTotal) * 100,
    ) / 100;
  const visibleCustomEstimateLines = customEstimateLines.filter(
    (line) => line.lineType !== "warranty",
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
    selectedCatalogItems.length + customEstimateLines.length;
  const estimatePreviewTotal = estimateGrandTotal;
  const hasEstimateSelection = selectedEstimateLineCount > 0;
  const activeDraftRequiresIntent =
    Boolean(activeDraftEstimate) &&
    !editingEstimateId &&
    !allowNewDraftWithActiveDraft;
  const canSaveEstimate =
    hasEstimateSelection &&
    estimateSaveState.status !== "saving" &&
    !activeDraftRequiresIntent;
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

  function toggleEstimateView(estimateId: string, isExpanded: boolean) {
    setViewingEstimateId(isExpanded ? null : estimateId);
    setViewingInvoiceId(null);
  }

  function toggleInvoiceView(invoiceId: string, isExpanded: boolean) {
    setViewingInvoiceId(isExpanded ? null : invoiceId);
    setViewingEstimateId(null);
  }

  function renderEstimateCard(estimate: DashboardServiceRequestEstimate) {
    const isExpanded = viewingEstimate?.id === estimate.id;
    const linkedInvoice = invoicesByEstimateId.get(estimate.id) ?? null;

    return (
      <article
        className={`rounded-md border p-4 transition ${
          isExpanded
            ? "border-[#0F6BFF] bg-blue-50"
            : "border-[#E5E7EB] bg-[#F8FAFC]"
        }`}
        key={estimate.id}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
          <div className="min-w-0">
            {isExpanded ? (
              <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
                Viewing estimate
              </p>
            ) : null}
            <p className="truncate text-sm font-bold text-[#0F172A]">
              {estimate.estimateNumber}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-[0.12em]">
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[#0F6BFF]">
                {formatServiceRequestSource(estimate.estimateStatus)}
              </span>
              <span className="rounded-full border border-[#E5E7EB] px-2 py-1 text-[#64748B]">
                {estimate.items.length} line{estimate.items.length === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-2 text-xs font-semibold text-[#64748B]">
              Created {formatServiceRequestDate(estimate.createdAt)}
            </p>
            {linkedInvoice ? (
              <p className="mt-2 text-xs leading-5 text-emerald-700">
                Source estimate for invoice {linkedInvoice.invoiceNumber}.
              </p>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-3 sm:items-end">
            <p className="text-2xl font-bold text-[#0F6BFF] sm:text-xl">
              {formatServiceRequestMoney(estimate.total)}
            </p>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                className="rounded-md border border-[#E5E7EB] px-3 py-2 text-xs font-bold text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
                onClick={() => toggleEstimateView(estimate.id, isExpanded)}
                type="button"
              >
                {isExpanded ? "Hide" : "View Estimate"}
              </button>
              {estimate.estimateStatus === "draft" ? (
                <>
                  <button
                    className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-[#0F6BFF] transition hover:bg-[#0F6BFF]/20"
                    disabled={estimateSaveState.status === "saving"}
                    onClick={() => void sendEstimateToCustomer(estimate)}
                    type="button"
                  >
                    {sendingEstimateId === estimate.id
                      ? "Sending..."
                      : "Send To Customer"}
                  </button>
                  <button
                    className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-300/20"
                    onClick={() => editEstimateDraft(estimate)}
                    type="button"
                  >
                    Edit Draft
                  </button>
                  <button
                    className="rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-300/20"
                    disabled={estimateSaveState.status === "saving"}
                    onClick={() => void archiveEstimateDraft(estimate)}
                    type="button"
                  >
                    Archive Draft
                  </button>
                </>
              ) : null}
              {estimate.estimateStatus === "approved" ? (
                linkedInvoice ? (
                  <button
                    className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-300/20"
                    onClick={() => toggleInvoiceView(linkedInvoice.id, false)}
                    type="button"
                  >
                    View Invoice
                  </button>
                ) : (
                  <button
                    className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={invoiceActionState.status === "saving"}
                    onClick={() => void createInvoiceFromEstimate(estimate)}
                    type="button"
                  >
                    {invoiceActionId === estimate.id
                      ? "Creating Invoice..."
                      : "Create Invoice"}
                  </button>
                )
              ) : null}
            </div>
          </div>
        </div>

        {isExpanded ? (
          <div className="mt-4">
            {estimateApprovalLink?.estimateId === estimate.id ? (
              <div className="mb-4 rounded-md border border-emerald-300/20 bg-emerald-300/10 p-3">
                <p className="text-sm font-black text-emerald-700">
                  Customer approval link ready
                </p>
                <p className="mt-1 break-all text-xs leading-5 text-emerald-700">
                  {estimateApprovalLink.approvalUrl}
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    className="rounded-md bg-emerald-300 px-3 py-2 text-xs font-black text-[#0F172A] transition hover:bg-emerald-200"
                    onClick={() => {
                      void navigator.clipboard?.writeText(
                        estimateApprovalLink.approvalUrl,
                      );
                    }}
                    type="button"
                  >
                    Copy Approval Link
                  </button>
                  <a
                    className="rounded-md border border-emerald-200/30 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-200/10"
                    href={estimateApprovalLink.approvalUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open Customer View
                  </a>
                </div>
              </div>
            ) : null}
            <div className="divide-y divide-[#E5E7EB] overflow-hidden rounded-md border border-[#E5E7EB]">
              {estimate.items.map((item) => (
                <div
                  className="flex flex-col gap-2 bg-[#F8FAFC] p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  key={item.id}
                >
                  <div>
                    <p className="font-bold text-[#0F172A]">
                      {item.quantity}x {item.customerName ?? item.itemTitle}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#64748B]">
                      {professionalEstimateLineTypeLabels[item.lineType]} · Internal:{" "}
                      {item.internalName ?? item.itemTitle}
                      {item.internalCost !== null
                        ? ` · Cost ${formatServiceRequestMoney(
                            item.internalCost,
                          )}`
                        : ""}
                    </p>
                    {item.publicDescription ? (
                      <p className="mt-1 text-xs text-[#64748B]">
                        {item.publicDescription}
                      </p>
                    ) : null}
                    {item.notes ? (
                      <p className="mt-1 text-xs text-[#64748B]">{item.notes}</p>
                    ) : null}
                  </div>
                  <p className="font-black text-[#0F6BFF]">
                    {formatServiceRequestMoney(item.lineTotal)}
                  </p>
                </div>
              ))}
            </div>
            {(estimate.warrantyText || estimate.disclaimerText) ? (
              <div className="mt-4 grid gap-3 text-xs leading-5 text-[#64748B] md:grid-cols-2">
                {estimate.warrantyText ? (
                  <p>
                    <span className="font-black text-[#0F172A]">Warranty: </span>
                    {estimate.warrantyText}
                  </p>
                ) : null}
                {estimate.disclaimerText ? (
                  <p>
                    <span className="font-black text-[#0F172A]">
                      Disclaimer:{" "}
                    </span>
                    {estimate.disclaimerText}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
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
      <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#64748B]">
              Job #{jobNumber}
            </span>
            <StatusBadge tone={SERVICE_REQUEST_STATUS_TONES[request.status] ?? "slate"}>
              {statusLabel}
            </StatusBadge>
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-[#0F172A] sm:text-3xl">
            {request.customerName} · {request.applianceType}
          </h1>
          <p className="mt-2 text-sm font-semibold text-[#64748B]">
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

      <dl className="mt-4 grid gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Customer", request.customerName],
          ["Address", addressSummary],
          ["Appliance", request.applianceType],
          ["Appointment", scheduledWindowLabel ?? "Not scheduled"],
          ["Technician", assignedTechnicianLabel],
        ].map(([label, value]) => (
          <div className="rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-2.5" key={label}>
            <dt className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#64748B]">
              {label}
            </dt>
            <dd className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-[#0F172A]">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <section className="mt-4 rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
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
        className="mt-4 flex gap-2 overflow-x-auto rounded-2xl border border-[#E5E7EB] bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.04)]"
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
      <section className="mt-4 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
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

      <section className="mt-6 rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F6BFF]">
              Service address
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
              Formatted address
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
                  : "Save Address"}
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
            Edit Address
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
      </section>
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

      {activeJobTab === "overview" ? (
        <>
      <dl className="mt-8 grid gap-4 lg:grid-cols-2">
        {[
          ["Customer", request.customerName],
          ["Platform phone action", request.customerPhone ? "Call via Platform" : "Not provided"],
          ["Customer email", request.customerEmail ?? "Not provided"],
          ["Location", `${request.city ? `${request.city}, ` : ""}${request.state} ${request.zipCode}`],
          ["Appliance", `${request.applianceBrand ?? "Unknown brand"} ${request.applianceType}`],
          ["Model", request.applianceModel ?? "Not provided"],
          ["Preferred window", request.preferredTimeWindow ?? "Not provided"],
          ["Scheduled window", scheduledWindowLabel ?? "Not scheduled"],
          ["Selected technician", request.selectedTechnicianBusinessName ?? "Unassigned"],
          ["Technician slug", request.selectedTechnicianSlug ?? "None"],
          ["Source", formatServiceRequestSource(request.requestSource)],
        ].map(([label, value]) => (
          <div className="rounded-md border border-[#E5E7EB] bg-white p-4" key={label}>
            <dt className="text-xs font-bold uppercase tracking-[0.18em] text-[#64748B]">
              {label}
            </dt>
            <dd className="mt-2 text-sm leading-6 text-[#334155]">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 rounded-md border border-[#E5E7EB] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#64748B]">
          Issue description
        </p>
        <p className="mt-2 leading-7 text-[#334155]">{request.issueDescription}</p>
      </div>
        </>
      ) : null}

      {activeJobTab === "estimate" ? (
      <section className="mt-6 rounded-2xl border border-[#E5E7EB] bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0F6BFF]">
              Estimate
            </p>
            <h2 className="mt-2 text-xl font-bold text-[#0F172A]">
              {editingEstimate
                ? `Editing draft ${editingEstimate.estimateNumber}`
                : "Create estimate draft"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#64748B]">
              {editingEstimate
                ? "Changes update the same estimate number. Sent, approved, declined, and void estimates stay read-only."
                : "Describe the diagnosis in plain language. WRA will draft the customer wording and estimate lines, then you can adjust prices before saving."}
            </p>
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-right">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0F6BFF]">
              {hasEstimateSelection ? "Preview total" : "Builder total"}
            </p>
            <p className="mt-1 text-2xl font-bold text-[#0F172A]">
              {formatServiceRequestMoney(estimatePreviewTotal)}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#64748B]">
              {hasEstimateSelection
                ? `${selectedEstimateLineCount} selected line${
                    selectedEstimateLineCount === 1 ? "" : "s"
                  }`
                : createdEstimateSummary
                  ? "Reset after save"
                  : "No jobs selected"}
            </p>
          </div>
        </div>

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

        <div className="mt-5 rounded-2xl border border-[#0F6BFF]/20 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F6BFF]">
                Create estimate
              </p>
              <h3 className="mt-1 text-xl font-black text-[#0F172A]">
                Diagnosis to sent estimate
              </h3>
              <p className="mt-1 text-sm leading-6 text-[#64748B]">
                Describe the repair, review the generated lines, then send.
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
              Diagnosis
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
              placeholder="Sub-Zero condenser fan is not running. Replace condenser fan assembly."
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
                : "Generate Estimate"}
            </button>
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
              {estimateGenerationState.message ? (
                <p className="text-sm font-bold text-[#0F172A]">
                  {estimateGenerationState.message}
                </p>
              ) : null}
              {estimateRepairPlanSummary ? (
                <div className="mt-2 rounded-lg border border-blue-100 bg-white/80 p-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0F6BFF]">
                        Repair plan
                      </p>
                      <p className="mt-1 text-sm font-black text-[#0F172A]">
                        {estimateRepairPlanSummary.detectedRepairType.replaceAll(
                          "_",
                          " ",
                        )}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[#64748B]">
                        {estimateRepairPlanSummary.applianceCategory} ·{" "}
                        {estimateRepairPlanSummary.operationsCount} operations ·{" "}
                        {estimateRepairPlanSummary.partsCount} parts ·{" "}
                        {estimateRepairPlanSummary.materialsCount} materials
                      </p>
                    </div>
                    <StatusBadge
                      tone={
                        estimateRepairPlanSummary.confidence === "high"
                          ? "emerald"
                          : estimateRepairPlanSummary.confidence === "medium"
                            ? "blue"
                            : "amber"
                      }
                    >
                      {formatServiceRequestSource(
                        estimateRepairPlanSummary.confidence,
                      )}{" "}
                      confidence
                    </StatusBadge>
                  </div>
                  {estimateRepairPlanSummary.confidence === "low" ? (
                    <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                      Low confidence. Review repair scope before sending.
                    </p>
                  ) : null}
                  {estimateRepairPlanSummary.pricingWarnings.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-semibold text-[#64748B]">
                      {estimateRepairPlanSummary.pricingWarnings.map(
                        (warning) => (
                          <li key={warning}>{warning}</li>
                        ),
                      )}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {process.env.NODE_ENV !== "production" ? (
                <details className="mt-2 text-xs text-[#64748B]">
                  <summary className="cursor-pointer font-black text-[#0F6BFF]">
                    Draft details
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-2 font-bold text-[#334155]">
                    <span className="rounded-full border border-blue-100 bg-white px-3 py-1">
                      Language:{" "}
                      {formatServiceRequestSource(
                        estimateDraftAgentResult.diagnosisNormalization
                          .detectedLanguage,
                      )}
                    </span>
                    {estimateDraftAgentResult.diagnosisNormalization.repairIntents.map(
                      (intent) => (
                        <span
                          className="rounded-full border border-blue-100 bg-white px-3 py-1"
                          key={intent}
                        >
                          {intent.replaceAll("_", " ")}
                        </span>
                      ),
                    )}
                  </div>
                  <p className="mt-2 leading-5">
                    Normalized diagnosis:{" "}
                    {
                      estimateDraftAgentResult.diagnosisNormalization
                        .normalizedEnglishDiagnosis
                    }
                  </p>
                </details>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 overflow-hidden rounded-2xl border border-[#E5E7EB]">
            <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] bg-[#F8FAFC] px-4 py-3">
              <div>
                <p className="text-sm font-black text-[#0F172A]">
                  Estimate lines
                </p>
                <p className="mt-1 text-xs font-semibold text-[#64748B]">
                  Customer-facing names and sell prices.
                </p>
              </div>
              <p className="text-right text-2xl font-black text-[#0F6BFF]">
                {formatServiceRequestMoney(estimatePreviewTotal)}
              </p>
            </div>
            {!hasEstimateSelection ? (
              <p className="p-4 text-sm font-semibold text-[#64748B]">
                Generate an estimate to review labor, parts, material, warranty,
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
                      <div className="grid gap-2 md:grid-cols-[7.5rem_minmax(0,1fr)_7.5rem_7.5rem_auto] md:items-center">
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
                          <span className="sr-only">Unit price</span>
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

                        <div className="flex items-center justify-between gap-3 md:block md:text-right">
                          <div>
                            <p className="text-sm font-black text-[#0F172A]">
                              {formatServiceRequestMoney(lineTotal)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-3">
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
                  href={estimateApprovalLink.approvalUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open customer approval link
                </a>
              ) : (
                <p className="mt-1 text-xs font-semibold text-[#64748B]">
                  Sends a saved draft to the customer in one action.
                </p>
              )}
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
                className="rounded-xl bg-[#0F6BFF] px-5 py-3 text-sm font-black text-white shadow-[0_8px_18px_rgba(15,107,255,0.22)] transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canSaveEstimate || sendingEstimateId !== null}
                onClick={() => void createEstimate({ sendAfterSave: true })}
                type="button"
              >
                {estimateSaveState.status === "saving" || sendingEstimateId
                  ? "Sending..."
                  : editingEstimateId
                    ? "Update & Send"
                    : "Send Estimate"}
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
        </div>

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
              <div className="mt-3 space-y-3">
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
              <div className="mt-3 space-y-3">
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
      </section>
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

      <Link className="mt-6 inline-flex text-sm font-bold text-[#0F6BFF]" href="/dashboard/leads">
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
