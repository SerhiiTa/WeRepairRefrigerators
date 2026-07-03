import type {
  DatabaseIntakeSourceType,
  DatabaseIntakeStatus,
  IntakeRequestRow,
  Json,
} from "@/lib/supabase/types";

export const INTAKE_SOURCE_TYPES = [
  "phone",
  "sms",
  "website_form",
  "email",
  "yelp",
  "google",
  "retell_ai",
  "manual",
  "other",
] as const satisfies readonly DatabaseIntakeSourceType[];

export const INTAKE_STATUSES = [
  "new",
  "reviewed",
  "needs_info",
  "customer_matched",
  "ready_to_convert",
  "converted",
  "dismissed",
  "archived",
] as const satisfies readonly DatabaseIntakeStatus[];

export const intakeSourceTypeLabels = {
  phone: "Phone",
  sms: "SMS",
  website_form: "Website Form",
  email: "Email",
  yelp: "Yelp",
  google: "Google",
  retell_ai: "Retell AI",
  manual: "Manual",
  other: "Other",
} as const satisfies Record<DatabaseIntakeSourceType, string>;

export const intakeStatusLabels = {
  new: "New",
  reviewed: "Reviewed",
  needs_info: "Needs Info",
  customer_matched: "Customer Matched",
  ready_to_convert: "Ready To Convert",
  converted: "Converted",
  dismissed: "Dismissed",
  archived: "Archived",
} as const satisfies Record<DatabaseIntakeStatus, string>;

export type DashboardIntakeRequest = {
  id: string;
  companyId: string | null;
  ownerProfileId: string | null;
  sourceType: DatabaseIntakeSourceType;
  sourceName: string | null;
  sourceIdentifier: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  serviceAddress: string | null;
  unit: string | null;
  city: string | null;
  state: string;
  zipCode: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  applianceType: string | null;
  brand: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  problemDescription: string | null;
  preferredAppointmentWindow: string | null;
  appointmentDate: string | null;
  windowStartTime: string | null;
  windowEndTime: string | null;
  rawMessage: string | null;
  transcript: string | null;
  rawPayload: Json;
  extractedData: Json;
  duplicateCandidate: Json;
  extractionConfidence: number | null;
  status: DatabaseIntakeStatus;
  linkedCustomerId: string | null;
  linkedServiceRequestId: string | null;
  linkedAppointmentId: string | null;
  assignedTechnicianId: string | null;
  dismissalReason: string | null;
  duplicateConfirmedAt: string | null;
  duplicateConfirmedBy: string | null;
  archivedAt: string | null;
  archivedBy: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const INTAKE_REQUEST_SELECT_COLUMNS = [
  "id",
  "company_id",
  "owner_profile_id",
  "source_type",
  "source_name",
  "source_identifier",
  "customer_first_name",
  "customer_last_name",
  "customer_name",
  "customer_phone",
  "customer_email",
  "service_address",
  "unit",
  "city",
  "state",
  "zip_code",
  "country",
  "latitude",
  "longitude",
  "place_id",
  "appliance_type",
  "brand",
  "model_number",
  "serial_number",
  "problem_description",
  "preferred_appointment_window",
  "appointment_date",
  "window_start_time",
  "window_end_time",
  "raw_message",
  "transcript",
  "raw_payload",
  "extracted_data",
  "duplicate_candidate",
  "extraction_confidence",
  "status",
  "linked_customer_id",
  "linked_service_request_id",
  "linked_appointment_id",
  "assigned_technician_id",
  "dismissal_reason",
  "duplicate_confirmed_at",
  "duplicate_confirmed_by",
  "archived_at",
  "archived_by",
  "created_by",
  "updated_by",
  "converted_at",
  "created_at",
  "updated_at",
].join(",");

export function mapIntakeRequestRow(
  row: IntakeRequestRow,
): DashboardIntakeRequest {
  return {
    id: row.id,
    companyId: row.company_id,
    ownerProfileId: row.owner_profile_id,
    sourceType: row.source_type,
    sourceName: row.source_name,
    sourceIdentifier: row.source_identifier,
    customerFirstName: row.customer_first_name,
    customerLastName: row.customer_last_name,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    serviceAddress: row.service_address,
    unit: row.unit,
    city: row.city,
    state: row.state,
    zipCode: row.zip_code,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
    placeId: row.place_id,
    applianceType: row.appliance_type,
    brand: row.brand,
    modelNumber: row.model_number,
    serialNumber: row.serial_number,
    problemDescription: row.problem_description,
    preferredAppointmentWindow: row.preferred_appointment_window,
    appointmentDate: row.appointment_date,
    windowStartTime: row.window_start_time,
    windowEndTime: row.window_end_time,
    rawMessage: row.raw_message,
    transcript: row.transcript,
    rawPayload: row.raw_payload,
    extractedData: row.extracted_data,
    duplicateCandidate: row.duplicate_candidate,
    extractionConfidence: row.extraction_confidence,
    status: row.status,
    linkedCustomerId: row.linked_customer_id,
    linkedServiceRequestId: row.linked_service_request_id,
    linkedAppointmentId: row.linked_appointment_id,
    assignedTechnicianId: row.assigned_technician_id,
    dismissalReason: row.dismissal_reason,
    duplicateConfirmedAt: row.duplicate_confirmed_at,
    duplicateConfirmedBy: row.duplicate_confirmed_by,
    archivedAt: row.archived_at,
    archivedBy: row.archived_by,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    convertedAt: row.converted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function formatIntakeDate(value: string | null): string {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function formatIntakeDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
