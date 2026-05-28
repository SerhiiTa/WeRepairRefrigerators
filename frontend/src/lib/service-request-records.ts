import type {
  DatabaseEstimateStatus,
  DatabaseServiceRequestNoteType,
  DatabaseServiceRequestPhotoType,
  PricingCatalogItemRow,
  ServiceRequestEstimateItemRow,
  ServiceRequestEstimateRow,
  ServiceRequestNoteRow,
  ServiceRequestPhotoRow,
  ServiceRequestRow,
} from "@/lib/supabase/types";

export type DashboardServiceRequestStatus =
  | "new"
  | "contacted"
  | "scheduled"
  | "completed"
  | "canceled"
  | "reviewed"
  | "lead_created"
  | "archived"
  | "spam";

export const SERVICE_REQUEST_CRM_STATUSES = [
  "new",
  "contacted",
  "scheduled",
  "completed",
  "canceled",
] as const satisfies readonly DashboardServiceRequestStatus[];

export type ServiceRequestCrmStatus =
  (typeof SERVICE_REQUEST_CRM_STATUSES)[number];

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
  createdAt: string;
  updatedAt: string;
  items: DashboardServiceRequestEstimateItem[];
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
  zipCode: string;
  city: string | null;
  state: string;
  preferredTimeWindow: string | null;
  selectedTechnicianSlug: string | null;
  selectedTechnicianBusinessName: string | null;
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
  "zip_code",
  "city",
  "state",
  "preferred_time_window",
  "selected_technician_slug",
  "selected_technician_business_name",
  "request_source",
  "status",
  "created_at",
  "updated_at",
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
  "created_at",
  "updated_at",
  "service_request_estimate_items(id,estimate_id,pricing_catalog_item_id,item_title,quantity,unit_price,line_total,technician_cost,taxable,warranty_text,notes,created_at)",
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
    zipCode: row.zip_code,
    city: row.city,
    state: row.state,
    preferredTimeWindow: row.preferred_time_window,
    selectedTechnicianSlug: row.selected_technician_slug,
    selectedTechnicianBusinessName: row.selected_technician_business_name,
    requestSource: row.request_source,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: (row.service_request_estimate_items ?? []).map(
      mapServiceRequestEstimateItemRow,
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
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
