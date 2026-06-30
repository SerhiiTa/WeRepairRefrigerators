import type {
  AppointmentRow,
  DatabaseAppointmentSource,
  DatabaseAppointmentStatus,
  DatabaseCalendarSyncStatus,
  DatabaseEstimateStatus,
  DatabaseInvoiceStatus,
  DatabaseServiceRequestNoteType,
  DatabaseServiceRequestPhotoType,
  DatabaseServiceRequestStatus,
  PricingCatalogItemRow,
  ServiceRequestEstimateItemRow,
  ServiceRequestEstimateRow,
  ServiceRequestInvoiceItemRow,
  ServiceRequestInvoiceRow,
  ServiceRequestNoteRow,
  ServiceRequestPhotoRow,
  ServiceRequestRow,
} from "@/lib/supabase/types";

export type DashboardServiceRequestStatus = DatabaseServiceRequestStatus;

export const SERVICE_REQUEST_CRM_STATUSES = [
  "new",
  "contacted",
  "scheduled",
  "diagnosed",
  "estimate_sent",
  "estimate_approved",
  "parts_needed",
  "parts_ordered",
  "parts_received",
  "return_visit_scheduled",
  "completed",
  "closed",
  "waiting_customer",
  "canceled",
] as const satisfies readonly DashboardServiceRequestStatus[];

export type ServiceRequestCrmStatus =
  (typeof SERVICE_REQUEST_CRM_STATUSES)[number];

export const SERVICE_REQUEST_STATUS_LABELS = {
  new: "New",
  contacted: "Contacted",
  scheduled: "Scheduled",
  diagnosed: "Diagnosed",
  estimate_sent: "Estimate Sent",
  estimate_approved: "Estimate Approved",
  parts_needed: "Parts Needed",
  parts_ordered: "Parts Ordered",
  parts_received: "Parts Received",
  return_visit_scheduled: "Return Visit Scheduled",
  completed: "Completed",
  closed: "Closed",
  waiting_customer: "Waiting Customer",
  canceled: "Canceled",
  estimate_declined: "Estimate Declined",
  reviewed: "Reviewed",
  lead_created: "Lead Created",
  archived: "Archived",
  spam: "Spam",
} as const satisfies Record<DashboardServiceRequestStatus, string>;

export type ServiceRequestStatusTone =
  | "gray"
  | "blue"
  | "cyan"
  | "emerald"
  | "amber"
  | "orange"
  | "purple"
  | "teal"
  | "indigo"
  | "yellow"
  | "red"
  | "slate";

export const SERVICE_REQUEST_STATUS_TONES = {
  new: "gray",
  contacted: "slate",
  scheduled: "blue",
  diagnosed: "orange",
  estimate_sent: "purple",
  estimate_approved: "emerald",
  parts_needed: "amber",
  parts_ordered: "amber",
  parts_received: "teal",
  return_visit_scheduled: "indigo",
  completed: "emerald",
  closed: "slate",
  waiting_customer: "yellow",
  canceled: "red",
  estimate_declined: "yellow",
  reviewed: "amber",
  lead_created: "emerald",
  archived: "slate",
  spam: "slate",
} as const satisfies Record<DashboardServiceRequestStatus, ServiceRequestStatusTone>;

export const SERVICE_REQUEST_NOTE_TYPES = [
  "internal_note",
  "diagnostic",
  "dispatcher_note",
  "parts_note",
] as const satisfies readonly DatabaseServiceRequestNoteType[];

export type ServiceRequestWritableNoteType =
  (typeof SERVICE_REQUEST_NOTE_TYPES)[number];

export type DashboardServiceRequestNote = {
  id: string;
  serviceRequestId: string;
  createdByProfileId: string | null;
  noteType: DatabaseServiceRequestNoteType;
  body: string;
  createdAt: string;
};

export type DashboardServiceRequestPhoto = {
  id: string;
  serviceRequestId: string;
  uploadedByProfileId: string | null;
  storagePath: string;
  originalFilename: string | null;
  photoType: DatabaseServiceRequestPhotoType;
  createdAt: string;
  signedUrl: string | null;
};

export type DashboardPricingCatalogItem = {
  id: string;
  applianceType: string;
  category: string;
  title: string;
  description: string | null;
  defaultLaborPrice: number;
  customerPrice: number;
  technicianCost: number | null;
  taxable: boolean;
  defaultWarrantyText: string | null;
  defaultDisclaimerText: string | null;
  sortOrder: number;
  estimatedDurationMinutes: number | null;
  active: boolean;
  createdAt: string;
};

export type DashboardServiceRequestEstimateItem = {
  id: string;
  estimateId: string;
  pricingCatalogItemId: string | null;
  itemTitle: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  technicianCost: number | null;
  taxable: boolean;
  warrantyText: string | null;
  lineType: "labor" | "part" | "material" | "custom" | "warranty";
  internalName: string | null;
  customerName: string | null;
  publicDescription: string | null;
  internalCost: number | null;
  sellPrice: number | null;
  serviceCatalogRepairItemId: string | null;
  estimateTemplateLineId: string | null;
  notes: string | null;
  createdAt: string;
};

export type DashboardServiceRequestEstimate = {
  id: string;
  serviceRequestId: string;
  createdByProfileId: string | null;
  subtotal: number;
  tax: number | null;
  total: number;
  estimateStatus: DatabaseEstimateStatus;
  estimateNumber: string;
  customerPreviewNotes: string | null;
  warrantyText: string | null;
  disclaimerText: string | null;
  publicApprovalTokenHash: string | null;
  sentAt: string | null;
  customerRespondedAt: string | null;
  archivedAt: string | null;
  archivedByProfileId: string | null;
  archiveReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: DashboardServiceRequestEstimateItem[];
};

export type DashboardServiceRequestInvoiceItem = {
  id: string;
  invoiceId: string;
  sourceEstimateItemId: string | null;
  itemTitle: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes: string | null;
  createdAt: string;
};

export type DashboardServiceRequestInvoice = {
  id: string;
  serviceRequestId: string;
  estimateId: string;
  createdByProfileId: string | null;
  invoiceNumber: string;
  subtotal: number;
  tax: number | null;
  total: number;
  invoiceStatus: DatabaseInvoiceStatus;
  sentAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: DashboardServiceRequestInvoiceItem[];
};

export type DashboardServiceRequestAppointment = {
  id: string;
  companyId: string | null;
  serviceRequestId: string;
  technicianProfileId: string;
  appointmentDate: string;
  windowStartTime: string;
  windowEndTime: string;
  status: DatabaseAppointmentStatus;
  source: DatabaseAppointmentSource;
  dispatcherSnapshotId: string | null;
  externalCalendarProvider: string | null;
  externalCalendarEventId: string | null;
  externalCalendarStatus: DatabaseCalendarSyncStatus;
  externalCalendarLastSyncedAt: string | null;
  externalCalendarError: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  request?: {
    id: string;
    customerName: string;
    applianceType: string;
    applianceBrand: string | null;
    issueDescription: string;
    zipCode: string;
    city: string | null;
    state: string;
    status: DashboardServiceRequestStatus;
  } | null;
};

export function isServiceRequestCrmStatus(
  value: string,
): value is ServiceRequestCrmStatus {
  return SERVICE_REQUEST_CRM_STATUSES.includes(
    value as ServiceRequestCrmStatus,
  );
}

export type DashboardServiceRequest = {
  id: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  applianceType: string;
  applianceBrand: string | null;
  applianceModel: string | null;
  issueDescription: string;
  fullAddress: string | null;
  streetAddress: string | null;
  unit: string | null;
  zipCode: string;
  city: string | null;
  state: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  preferredTimeWindow: string | null;
  selectedTechnicianSlug: string | null;
  selectedTechnicianBusinessName: string | null;
  assignedTechnicianProfileId: string | null;
  appointmentId: string | null;
  scheduledDate: string | null;
  scheduledWindowStartTime: string | null;
  scheduledWindowEndTime: string | null;
  requestSource: string;
  status: DashboardServiceRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export const SERVICE_REQUEST_SELECT_COLUMNS = [
  "id",
  "customer_name",
  "customer_email",
  "customer_phone",
  "appliance_type",
  "appliance_brand",
  "appliance_model",
  "issue_description",
  "full_address",
  "street_address",
  "unit",
  "zip_code",
  "city",
  "state",
  "country",
  "latitude",
  "longitude",
  "place_id",
  "preferred_time_window",
  "selected_technician_slug",
  "selected_technician_business_name",
  "assigned_technician_profile_id",
  "appointment_id",
  "scheduled_date",
  "scheduled_window_start_time",
  "scheduled_window_end_time",
  "request_source",
  "status",
  "created_at",
  "updated_at",
].join(",");

export const APPOINTMENT_SELECT_COLUMNS = [
  "id",
  "company_id",
  "service_request_id",
  "technician_profile_id",
  "appointment_date",
  "window_start_time",
  "window_end_time",
  "status",
  "source",
  "dispatcher_snapshot_id",
  "created_by",
  "created_at",
  "updated_at",
  "service_requests(id,customer_name,appliance_type,appliance_brand,issue_description,zip_code,city,state,status)",
].join(",");

export const APPOINTMENT_WITH_CALENDAR_SELECT_COLUMNS = [
  "id",
  "company_id",
  "service_request_id",
  "technician_profile_id",
  "appointment_date",
  "window_start_time",
  "window_end_time",
  "status",
  "source",
  "dispatcher_snapshot_id",
  "external_calendar_provider",
  "external_calendar_event_id",
  "external_calendar_status",
  "external_calendar_last_synced_at",
  "external_calendar_error",
  "created_by",
  "created_at",
  "updated_at",
  "service_requests(id,customer_name,appliance_type,appliance_brand,issue_description,zip_code,city,state,status)",
].join(",");

export const SERVICE_REQUEST_NOTE_SELECT_COLUMNS = [
  "id",
  "service_request_id",
  "created_by_profile_id",
  "note_type",
  "body",
  "created_at",
].join(",");

export const PRICING_CATALOG_SELECT_COLUMNS = [
  "id",
  "appliance_type",
  "category",
  "title",
  "description",
  "default_labor_price",
  "customer_price",
  "technician_cost",
  "taxable",
  "default_warranty_text",
  "default_disclaimer_text",
  "sort_order",
  "estimated_duration_minutes",
  "service_category_id",
  "repair_group_id",
  "repair_item_id",
  "default_labor_hours",
  "internal_name",
  "public_description",
  "active",
  "created_at",
].join(",");

export const SERVICE_REQUEST_ESTIMATE_SELECT_COLUMNS = [
  "id",
  "service_request_id",
  "created_by_profile_id",
  "subtotal",
  "tax",
  "total",
  "estimate_status",
  "estimate_number",
  "customer_preview_notes",
  "warranty_text",
  "disclaimer_text",
  "sent_at",
  "customer_responded_at",
  "created_at",
  "updated_at",
  "service_request_estimate_items(id,estimate_id,pricing_catalog_item_id,item_title,quantity,unit_price,line_total,technician_cost,taxable,warranty_text,line_type,internal_name,customer_name,public_description,internal_cost,sell_price,service_catalog_repair_item_id,estimate_template_line_id,notes,created_at)",
].join(",");

export const SERVICE_REQUEST_INVOICE_SELECT_COLUMNS = [
  "id",
  "service_request_id",
  "estimate_id",
  "created_by_profile_id",
  "invoice_number",
  "subtotal",
  "tax",
  "total",
  "invoice_status",
  "sent_at",
  "paid_at",
  "voided_at",
  "created_at",
  "updated_at",
  "service_request_invoice_items(id,invoice_id,source_estimate_item_id,item_title,quantity,unit_price,line_total,notes,created_at)",
].join(",");

export const SERVICE_REQUEST_PHOTO_SELECT_COLUMNS = [
  "id",
  "service_request_id",
  "uploaded_by_profile_id",
  "storage_path",
  "original_filename",
  "photo_type",
  "created_at",
].join(",");

export function mapServiceRequestRow(
  row: ServiceRequestRow,
): DashboardServiceRequest {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    applianceType: row.appliance_type,
    applianceBrand: row.appliance_brand,
    applianceModel: row.appliance_model,
    issueDescription: row.issue_description,
    fullAddress: row.full_address ?? null,
    streetAddress: row.street_address ?? null,
    unit: row.unit ?? null,
    zipCode: row.zip_code,
    city: row.city,
    state: row.state,
    country: row.country ?? "US",
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    placeId: row.place_id ?? null,
    preferredTimeWindow: row.preferred_time_window,
    selectedTechnicianSlug: row.selected_technician_slug,
    selectedTechnicianBusinessName: row.selected_technician_business_name,
    assignedTechnicianProfileId: row.assigned_technician_profile_id ?? null,
    appointmentId: row.appointment_id ?? null,
    scheduledDate: row.scheduled_date ?? null,
    scheduledWindowStartTime: row.scheduled_window_start_time ?? null,
    scheduledWindowEndTime: row.scheduled_window_end_time ?? null,
    requestSource: row.request_source,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAppointmentRow(
  row: AppointmentRow & {
    service_requests?: ServiceRequestRow | null;
  },
): DashboardServiceRequestAppointment {
  return {
    id: row.id,
    companyId: row.company_id,
    serviceRequestId: row.service_request_id,
    technicianProfileId: row.technician_profile_id,
    appointmentDate: row.appointment_date,
    windowStartTime: row.window_start_time,
    windowEndTime: row.window_end_time,
    status: row.status,
    source: row.source,
    dispatcherSnapshotId: row.dispatcher_snapshot_id,
    externalCalendarProvider: row.external_calendar_provider ?? null,
    externalCalendarEventId: row.external_calendar_event_id ?? null,
    externalCalendarStatus: row.external_calendar_status ?? "not_configured",
    externalCalendarLastSyncedAt: row.external_calendar_last_synced_at ?? null,
    externalCalendarError: row.external_calendar_error ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    request: row.service_requests
      ? {
          id: row.service_requests.id,
          customerName: row.service_requests.customer_name,
          applianceType: row.service_requests.appliance_type,
          applianceBrand: row.service_requests.appliance_brand,
          issueDescription: row.service_requests.issue_description,
          zipCode: row.service_requests.zip_code,
          city: row.service_requests.city,
          state: row.service_requests.state,
          status: row.service_requests.status,
        }
      : null,
  };
}

export function mapServiceRequestNoteRow(
  row: ServiceRequestNoteRow,
): DashboardServiceRequestNote {
  return {
    id: row.id,
    serviceRequestId: row.service_request_id,
    createdByProfileId: row.created_by_profile_id,
    noteType: row.note_type,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function mapServiceRequestPhotoRow(
  row: ServiceRequestPhotoRow,
): DashboardServiceRequestPhoto {
  return {
    id: row.id,
    serviceRequestId: row.service_request_id,
    uploadedByProfileId: row.uploaded_by_profile_id,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    photoType: row.photo_type,
    createdAt: row.created_at,
    signedUrl: null,
  };
}

export function mapPricingCatalogItemRow(
  row: PricingCatalogItemRow,
): DashboardPricingCatalogItem {
  return {
    id: row.id,
    applianceType: row.appliance_type,
    category: row.category,
    title: row.title,
    description: row.description,
    defaultLaborPrice: Number(row.default_labor_price),
    customerPrice: Number(row.customer_price ?? row.default_labor_price),
    technicianCost: row.technician_cost === null ? null : Number(row.technician_cost),
    taxable: row.taxable ?? true,
    defaultWarrantyText: row.default_warranty_text ?? null,
    defaultDisclaimerText: row.default_disclaimer_text ?? null,
    sortOrder: row.sort_order ?? 0,
    estimatedDurationMinutes: row.estimated_duration_minutes,
    active: row.active,
    createdAt: row.created_at,
  };
}

export function mapServiceRequestEstimateItemRow(
  row: ServiceRequestEstimateItemRow,
): DashboardServiceRequestEstimateItem {
  return {
    id: row.id,
    estimateId: row.estimate_id,
    pricingCatalogItemId: row.pricing_catalog_item_id,
    itemTitle: row.item_title,
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    lineTotal: Number(row.line_total),
    technicianCost: row.technician_cost === null ? null : Number(row.technician_cost),
    taxable: row.taxable ?? true,
    warrantyText: row.warranty_text ?? null,
    lineType: row.line_type ?? "custom",
    internalName: row.internal_name ?? null,
    customerName: row.customer_name ?? row.item_title,
    publicDescription: row.public_description ?? null,
    internalCost:
      row.internal_cost === null || row.internal_cost === undefined
        ? row.technician_cost === null
          ? null
          : Number(row.technician_cost)
        : Number(row.internal_cost),
    sellPrice:
      row.sell_price === null || row.sell_price === undefined
        ? Number(row.unit_price)
        : Number(row.sell_price),
    serviceCatalogRepairItemId: row.service_catalog_repair_item_id ?? null,
    estimateTemplateLineId: row.estimate_template_line_id ?? null,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function mapServiceRequestEstimateRow(
  row: ServiceRequestEstimateRow & {
    service_request_estimate_items?: ServiceRequestEstimateItemRow[];
  },
): DashboardServiceRequestEstimate {
  return {
    id: row.id,
    serviceRequestId: row.service_request_id,
    createdByProfileId: row.created_by_profile_id,
    subtotal: Number(row.subtotal),
    tax: row.tax === null ? null : Number(row.tax),
    total: Number(row.total),
    estimateStatus: row.estimate_status,
    estimateNumber:
      row.estimate_number ??
      `EST-${new Date(row.created_at).getFullYear()}-${row.id.slice(0, 8).toUpperCase()}`,
    customerPreviewNotes: row.customer_preview_notes ?? null,
    warrantyText: row.warranty_text ?? null,
    disclaimerText: row.disclaimer_text ?? null,
    publicApprovalTokenHash: row.public_approval_token_hash ?? null,
    sentAt: row.sent_at ?? null,
    customerRespondedAt: row.customer_responded_at ?? null,
    archivedAt: row.archived_at ?? null,
    archivedByProfileId: row.archived_by_profile_id ?? null,
    archiveReason: row.archive_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: (row.service_request_estimate_items ?? []).map(
      mapServiceRequestEstimateItemRow,
    ),
  };
}

export function mapServiceRequestInvoiceItemRow(
  row: ServiceRequestInvoiceItemRow,
): DashboardServiceRequestInvoiceItem {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    sourceEstimateItemId: row.source_estimate_item_id,
    itemTitle: row.item_title,
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    lineTotal: Number(row.line_total),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function mapServiceRequestInvoiceRow(
  row: ServiceRequestInvoiceRow & {
    service_request_invoice_items?: ServiceRequestInvoiceItemRow[];
  },
): DashboardServiceRequestInvoice {
  return {
    id: row.id,
    serviceRequestId: row.service_request_id,
    estimateId: row.estimate_id,
    createdByProfileId: row.created_by_profile_id,
    invoiceNumber: row.invoice_number,
    subtotal: Number(row.subtotal),
    tax: row.tax === null ? null : Number(row.tax),
    total: Number(row.total),
    invoiceStatus: row.invoice_status,
    sentAt: row.sent_at,
    paidAt: row.paid_at,
    voidedAt: row.voided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: (row.service_request_invoice_items ?? []).map(
      mapServiceRequestInvoiceItemRow,
    ),
  };
}

export function formatServiceRequestDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatServiceRequestMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatServiceRequestSource(value: string): string {
  if (value in SERVICE_REQUEST_STATUS_LABELS) {
    return SERVICE_REQUEST_STATUS_LABELS[
      value as DashboardServiceRequestStatus
    ];
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
