"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  getAddressAutocompleteAdapter,
  type AddressSuggestion,
} from "@/lib/address-autocomplete";
import {
  AssetImage,
  WRA_ASSET_PLACEHOLDER_TYPES,
  getAssetPlaceholderLabel,
} from "@/lib/asset-placeholders";
import { SERVICE_REQUEST_PHOTO_BUCKET } from "@/lib/service-request-photos";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CustomerApplianceRow,
  CustomerAddressRow,
  CustomerInternalNoteRow,
  CustomerRow,
  DatabaseAppRole,
  Json,
  PublicSchema,
  ServiceRequestEstimateRow,
  ServiceRequestInvoiceRow,
  ServiceRequestNoteRow,
  ServiceRequestRow,
} from "@/lib/supabase/types";

type CommunicationConversationRow =
  PublicSchema["Tables"]["communication_conversations"]["Row"];
type CommunicationTimelineEventRow =
  PublicSchema["Tables"]["communication_timeline_events"]["Row"];
type CustomerAppliancePhotoRow =
  PublicSchema["Tables"]["customer_appliance_photos"]["Row"];

type CustomerListState =
  | { status: "loading" }
  | {
      status: "ready";
      customers: CustomerRow[];
      serviceRequests: ServiceRequestRow[];
      appliances: CustomerApplianceRow[];
      addresses: CustomerAddressRow[];
      conversations: CommunicationConversationRow[];
    }
  | { status: "unavailable"; message: string };

type CustomerDetailState =
  | { status: "loading" }
  | {
      status: "ready";
      customer: CustomerRow | null;
      serviceRequests: ServiceRequestRow[];
      appliances: CustomerApplianceRow[];
      addresses: CustomerAddressRow[];
      estimates: ServiceRequestEstimateRow[];
      invoices: ServiceRequestInvoiceRow[];
      notes: ServiceRequestNoteRow[];
      customerNotes: CustomerInternalNoteRow[];
      conversations: CommunicationConversationRow[];
      communicationEvents: CommunicationTimelineEventRow[];
      assetPhotos: CustomerAppliancePhotoRow[];
      assetCoverUrls: Record<string, string>;
      assetPhotoUrls: Record<string, string>;
      currentRole: DatabaseAppRole | null;
    }
  | { status: "unavailable"; message: string };

type TimelineItem = {
  id: string;
  at: string;
  title: string;
  body: string | null;
  category: "call" | "job" | "estimate" | "invoice" | "payment" | "note" | "repair";
  href?: string;
};

const CLOSED_JOB_STATUSES = new Set(["completed", "closed", "canceled"]);

type ActionState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: string | null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type AssetPhotoScanState =
  | { status: "idle"; message: null }
  | { status: "processing"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type CustomerFormState = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  preferredContactMethod: "phone" | "email" | "sms";
  customerStatus: "active" | "inactive" | "blocked";
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

type CustomerSectionKey =
  | "profile"
  | "addresses"
  | "serviceAddresses"
  | "assets"
  | "estimates"
  | "invoices"
  | "communications"
  | "notes"
  | "timeline"
  | "repairHistory";

type CustomerStatusFilter = "all" | "active" | "inactive";
type CustomerExtraFilter = "all" | "hasOpenJobs" | "hasAssets" | "hasAddress" | "noAddress";
type CustomerWorkspaceTab = "overview" | "jobs" | "assets" | "more";
type CustomerJobsFilter = "all" | "open" | "completed";
type CustomerSortOption =
  | "lastJobNewest"
  | "lastJobOldest"
  | "nameAsc"
  | "nameDesc"
  | "customerSinceNewest";

type ApplianceFormState = {
  id: string | null;
  applianceType: string;
  applianceTypeMode: "preset" | "custom";
  brand: string;
  modelNumber: string;
  serialNumber: string;
  purchaseYear: string;
  customerAddressId: string;
  locationLabel: string;
  locationLabelMode: "preset" | "custom";
  notes: string;
  coverPhotoId: string | null;
  assetPhotoId: string | null;
  labelPhotoId: string | null;
  mainPhotoId: string | null;
  additionalPhotoIds: string[];
};

type AssetLocationOption = {
  key: string;
  label: string;
  sourceLabel: "Primary" | "Saved Address" | "Previous Job";
  addressId: string | null;
  requestId: string | null;
  payload: Record<string, Json> | null;
};

const CUSTOM_ASSET_TYPE_VALUE = "__custom_asset_type__";
const CUSTOM_ASSET_AREA_VALUE = "__custom_asset_area__";
const CUSTOMER_APPLIANCE_PHOTO_BUCKET = "customer-appliance-photos";

const ADD_ASSET_TYPE_OPTIONS = [
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

const ADD_ASSET_AREA_OPTIONS = [
  "Kitchen",
  "Laundry Room",
  "Garage",
  "Attic",
  "Basement",
  "Utility Room",
  "Mechanical Room",
  "Living Room",
  "Bedroom",
  "Bathroom",
  "Outdoor",
  "Backyard",
  "Roof",
  "Pool Area",
];

const emptyCustomerForm: CustomerFormState = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  preferredContactMethod: "phone",
  customerStatus: "active",
  streetAddress: "",
  unit: "",
  city: "",
  state: "TX",
  zipCode: "",
  country: "US",
  latitude: null,
  longitude: null,
  placeId: null,
};

const emptyApplianceForm: ApplianceFormState = {
  id: null,
  applianceType: "",
  applianceTypeMode: "preset",
  brand: "",
  modelNumber: "",
  serialNumber: "",
  purchaseYear: "",
  customerAddressId: "",
  locationLabel: "",
  locationLabelMode: "preset",
  notes: "",
  coverPhotoId: null,
  assetPhotoId: null,
  labelPhotoId: null,
  mainPhotoId: null,
  additionalPhotoIds: [],
};

function cleanPhone(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

function cleanZip(value: string): string {
  return value.replace(/[^0-9]/g, "").slice(0, 5);
}

function getFullNameFromForm(form: CustomerFormState): string {
  return [form.firstName, form.lastName].map((part) => part.trim()).filter(Boolean).join(" ");
}

function buildCustomerPayload(form: CustomerFormState): Record<string, Json> {
  return {
    first_name: form.firstName.trim() || null,
    last_name: form.lastName.trim() || null,
    full_name: getFullNameFromForm(form) || null,
    phone: cleanPhone(form.phone) || null,
    email: form.email.trim().toLowerCase() || null,
    preferred_contact_method: form.preferredContactMethod,
    customer_status: form.customerStatus,
  };
}

function hasAddressFormData(form: CustomerFormState): boolean {
  return Boolean(
    form.streetAddress.trim() ||
      form.unit.trim() ||
      form.city.trim() ||
      form.zipCode.trim(),
  );
}

function buildAddressPayload(form: CustomerFormState): Record<string, Json> {
  return {
    label: "Customer Primary Address",
    street_address: form.streetAddress.trim() || null,
    unit: form.unit.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim().toUpperCase().slice(0, 2) || "TX",
    zip_code: cleanZip(form.zipCode) || null,
    country: form.country.trim().toUpperCase().slice(0, 2) || "US",
    latitude: form.latitude,
    longitude: form.longitude,
    place_id: form.placeId,
    is_primary: true,
  };
}

function formatCustomerCrmSaveError(message: string): string {
  if (
    message.includes("dashboard company context") ||
    message.includes("COMPANY_CONTEXT_MISSING") ||
    message.includes("current_dashboard_company_id")
  ) {
    return "Customer changes could not be saved because this dashboard account is missing active company access.";
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

  return "Customer changes could not be saved. Please try again.";
}

function buildAppliancePayload(form: ApplianceFormState): Record<string, Json> {
  return {
    appliance_type: form.applianceType.trim() || null,
    brand: form.brand.trim() || null,
    model_number: form.modelNumber.trim() || null,
    serial_number: form.serialNumber.trim() || null,
    purchase_year: form.purchaseYear.trim() || null,
    customer_address_id: form.customerAddressId || null,
    location_label: form.locationLabel.trim() || null,
    notes: form.notes.trim() || null,
    cover_photo_id: form.coverPhotoId,
    asset_photo_id: form.assetPhotoId,
    label_photo_id: form.labelPhotoId,
    main_photo_id: form.mainPhotoId,
    additional_photo_ids: form.additionalPhotoIds,
  };
}

function readRecordObject(source: unknown, field: string): Record<string, unknown> | null {
  if (!source || typeof source !== "object" || !(field in source)) {
    return null;
  }

  const value = (source as Record<string, unknown>)[field];

  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readRecordString(source: unknown, field: string): string | null {
  if (!source || typeof source !== "object" || !(field in source)) {
    return null;
  }

  const value = (source as Record<string, unknown>)[field];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatDate(value: string | null | undefined, fallback = "Not available"): string {
  if (!value) {
    return fallback;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatActivityDate(value: string | null | undefined): string {
  if (!value) {
    return "Now";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatShortMoney(value: number | null | undefined): string {
  const amount = Number(value ?? 0);

  if (Math.abs(amount) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  return formatMoney(amount);
}

function formatMoney(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));
}

function canViewOwnerMetrics(role: DatabaseAppRole | null): boolean {
  return role === "company_owner" || role === "admin";
}

function getCustomerName(customer: CustomerRow): string {
  return customer.full_name || customer.email || customer.phone || "Customer";
}

function getCustomerInitials(customer: CustomerRow): string {
  const nameParts = getCustomerName(customer).split(/\s+/).filter(Boolean);
  const initials = nameParts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return initials || "C";
}

function getJobAddress(request: ServiceRequestRow | undefined): string {
  if (!request) {
    return "No address saved";
  }

  if (request.full_address) {
    return request.full_address;
  }

  return [request.street_address, request.unit, request.city, request.state, request.zip_code]
    .filter(Boolean)
    .join(", ");
}

function getCustomerJobHref(customerId: string, requestId: string): string {
  const returnTo = `/dashboard/customers/${customerId}?tab=jobs`;

  return `/dashboard/leads/${requestId}?returnTo=${encodeURIComponent(returnTo)}`;
}

function getAddressLabel(address: CustomerAddressRow | undefined): string {
  if (!address) {
    return "No address saved";
  }

  return [
    address.street_address,
    address.unit,
    address.city,
    address.state,
    address.zip_code,
  ]
    .filter(Boolean)
    .join(", ");
}

function normalizeAssetLocationPart(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getAssetLocationDedupeKey(source: {
  city?: string | null;
  place_id?: string | null;
  state?: string | null;
  street_address?: string | null;
  unit?: string | null;
  zip_code?: string | null;
}) {
  const placeId = source.place_id?.trim();

  if (placeId) {
    return `place:${placeId}`;
  }

  return [
    source.street_address,
    source.unit,
    source.city,
    source.state,
    source.zip_code,
  ]
    .map(normalizeAssetLocationPart)
    .join("|");
}

function buildAssetLocationOptions({
  addresses,
  requests,
}: {
  addresses: CustomerAddressRow[];
  requests: ServiceRequestRow[];
}): AssetLocationOption[] {
  const options: AssetLocationOption[] = [];
  const seen = new Set<string>();

  addresses.forEach((address) => {
    const key = getAssetLocationDedupeKey(address);

    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    options.push({
      key: address.id,
      label: getAddressLabel(address),
      sourceLabel: address.is_primary ? "Primary" : "Saved Address",
      addressId: address.id,
      requestId: null,
      payload: null,
    });
  });

  requests.forEach((request) => {
    const hasServiceAddress = Boolean(
      request.street_address || request.city || request.zip_code || request.full_address,
    );

    if (!hasServiceAddress) {
      return;
    }

    const key = getAssetLocationDedupeKey(request);

    if (!key || seen.has(key)) {
      return;
    }

    seen.add(key);
    options.push({
      key: `job:${request.id}`,
      label: getJobAddress(request),
      sourceLabel: "Previous Job",
      addressId: null,
      requestId: request.id,
      payload: {
        label: "Previous Job Address",
        street_address: request.street_address ?? null,
        unit: request.unit ?? null,
        city: request.city ?? null,
        state: request.state ?? null,
        zip_code: request.zip_code ?? null,
        country: request.country ?? "US",
        latitude: request.latitude ?? null,
        longitude: request.longitude ?? null,
        place_id: request.place_id ?? null,
        is_primary: false,
      },
    });
  });

  return options;
}

function getAssetAddressLabel(
  asset: Pick<CustomerApplianceRow, "customer_address_id">,
  addresses: CustomerAddressRow[],
): string {
  const address = addresses.find((item) => item.id === asset.customer_address_id);

  return address ? getAddressLabel(address) : "Location not saved";
}

function getCustomerPrimaryAddress(addresses: CustomerAddressRow[]): CustomerAddressRow | undefined {
  const primary = addresses.find((address) => address.is_primary) ?? addresses[0];

  return primary;
}

function getCustomerCityLabel(addresses: CustomerAddressRow[]): string {
  const primary = getCustomerPrimaryAddress(addresses);

  if (!primary) {
    return "No address yet";
  }

  return [primary.city, primary.state, primary.zip_code].filter(Boolean).join(", ") ||
    "No address yet";
}

function getCustomerLastJobDate(requests: ServiceRequestRow[]): string | null {
  return requests[0]?.created_at ?? null;
}

function buildCustomerForm(
  customer: CustomerRow,
  address?: CustomerAddressRow,
): CustomerFormState {
  return {
    firstName: customer.first_name ?? "",
    lastName: customer.last_name ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    preferredContactMethod: customer.preferred_contact_method ?? "phone",
    customerStatus: customer.customer_status ?? "active",
    streetAddress: address?.street_address ?? "",
    unit: address?.unit ?? "",
    city: address?.city ?? "",
    state: address?.state ?? "TX",
    zipCode: address?.zip_code ?? "",
    country: address?.country ?? "US",
    latitude: address?.latitude ?? null,
    longitude: address?.longitude ?? null,
    placeId: address?.place_id ?? null,
  };
}

function buildApplianceForm(appliance?: CustomerApplianceRow): ApplianceFormState {
  if (!appliance) {
    return emptyApplianceForm;
  }

  const applianceTypeMode = ADD_ASSET_TYPE_OPTIONS.some(
    (option) => option.value === appliance.appliance_type,
  )
    ? "preset"
    : "custom";
  const locationLabelMode =
    appliance.location_label && !ADD_ASSET_AREA_OPTIONS.includes(appliance.location_label)
      ? "custom"
      : "preset";

  return {
    id: appliance.id,
    applianceType: appliance.appliance_type,
    applianceTypeMode,
    brand: appliance.brand ?? "",
    modelNumber: appliance.model_number ?? "",
    serialNumber: appliance.serial_number ?? "",
    purchaseYear: appliance.purchase_year?.toString() ?? "",
    customerAddressId: appliance.customer_address_id ?? "",
    locationLabel: appliance.location_label ?? "",
    locationLabelMode,
    notes: appliance.notes ?? "",
    coverPhotoId: appliance.cover_photo_id ?? null,
    assetPhotoId: null,
    labelPhotoId: null,
    mainPhotoId: null,
    additionalPhotoIds: [],
  };
}

function getAppointmentLabel(request: ServiceRequestRow): string {
  if (!request.scheduled_date) {
    return request.preferred_time_window || "No appointment scheduled";
  }

  const date = formatDate(request.scheduled_date);
  const window = [request.scheduled_window_start_time, request.scheduled_window_end_time]
    .filter(Boolean)
    .join(" - ");

  return window ? `${date}, ${window}` : date;
}

function getCustomerJobScheduleLabel(request: ServiceRequestRow): string {
  if (!request.scheduled_date) {
    return "Not scheduled";
  }

  const date = formatDate(request.scheduled_date);
  const window = [request.scheduled_window_start_time, request.scheduled_window_end_time]
    .filter(Boolean)
    .join(" - ");

  return window ? `${date} · ${window}` : date;
}

function getCustomerJobTitle(request: ServiceRequestRow): string {
  return (
    request.job_name ||
    [request.appliance_brand, request.appliance_type].filter(Boolean).join(" ") ||
    request.appliance_type ||
    "Service job"
  );
}

function getShortJobNumber(request: ServiceRequestRow): string {
  return request.id.slice(0, 8).toUpperCase();
}

function normalizeSearch(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/gi, "");
}

function getLastContact(
  customer: CustomerRow,
  requests: ServiceRequestRow[],
  conversations: CommunicationConversationRow[],
): string | null {
  const dates = [
    customer.updated_at,
    ...requests.map((request) => request.updated_at ?? request.created_at),
    ...conversations.map(
      (conversation) => conversation.last_event_at ?? conversation.call_started_at ?? conversation.created_at,
    ),
  ].filter(Boolean);

  return dates.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function getEstimateBadge(estimates: ServiceRequestEstimateRow[]): string {
  if (estimates.some((estimate) => estimate.estimate_status === "approved")) {
    return "Estimate approved";
  }

  if (estimates.some((estimate) => estimate.estimate_status === "sent")) {
    return "Estimate sent";
  }

  if (estimates.some((estimate) => estimate.estimate_status === "draft")) {
    return "Draft estimate";
  }

  return "No estimate";
}

function statusBadgeClass(status: string): string {
  const normalized = status.toLowerCase();

  if (["approved", "paid", "completed", "closed", "active"].includes(normalized)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (["sent", "scheduled", "in_progress"].includes(normalized)) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (["canceled", "void", "voided"].includes(normalized)) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function StatusPill({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${statusBadgeClass(
        value,
      )}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}

type CustomerOverviewIconName =
  | "back"
  | "briefcase"
  | "calendar"
  | "chevron"
  | "close"
  | "edit"
  | "mail"
  | "map"
  | "message"
  | "more"
  | "payment"
  | "phone"
  | "pin"
  | "search"
  | "status"
  | "tool"
  | "user";

function CustomerOverviewIcon({
  className = "h-4 w-4",
  name,
}: {
  className?: string;
  name: CustomerOverviewIconName;
}) {
  if (name === "back") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 18 9 12l6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
      </svg>
    );
  }

  if (name === "edit") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m14.5 5.5 4 4M4 20h4.2L19 9.2a2.8 2.8 0 0 0-4-4L4 16.2V20Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (name === "close") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  if (name === "more") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h.01M12 12h.01M19 12h.01" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      </svg>
    );
  }

  if (name === "phone") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.2 4.8 9 8.9l-1.5 1.2c1 2.1 2.5 3.7 4.6 4.6L13.4 13l4.2 1.9-.4 3.3c-.1.8-.8 1.4-1.6 1.3C9.4 19 5 14.6 4.5 8.4c-.1-.8.5-1.5 1.3-1.6l1.4-.2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (name === "message") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6.8A3 3 0 0 1 8 4h8a3 3 0 0 1 3 2.8v5.6a3 3 0 0 1-3 2.8h-4.3L7 19v-3.8a3 3 0 0 1-2-2.8V6.8Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M8.8 9.5h6.4M8.8 12.2h3.7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (name === "mail") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 7h14v10H5V7Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="m5.5 7.5 6.5 5 6.5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (name === "pin") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s6-5.4 6-11a6 6 0 0 0-12 0c0 5.6 6 11 6 11Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" stroke="currentColor" strokeWidth="1.9" />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m20 20-4.2-4.2M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (name === "map") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 18 4 20V6l5-2 6 2 5-2v14l-5 2-6-2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M9 4v14M15 6v14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (name === "calendar") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 5h12a2 2 0 0 1 2 2v11H4V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (name === "tool") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m14.7 6.3 3-3a5 5 0 0 1-6.4 6.4L5.6 15.4a2 2 0 0 0 3 3l5.7-5.7a5 5 0 0 1 6.4-6.4l-3 3-3-3Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (name === "briefcase") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 7V5h6v2M5 8h14v10H5V8Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (name === "payment") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16v10H4V7Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M4 10h16M15 14h2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (name === "status") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12.5 9.2 17 19 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.1" />
      </svg>
    );
  }

  if (name === "chevron") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m9 6 6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.8 20a7.2 7.2 0 0 1 14.4 0" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
    </svg>
  );
}

function CustomerQuickAction({
  href,
  label,
}: {
  href?: string;
  label: "Call" | "Text" | "Email" | "More";
}) {
  const iconName: Record<typeof label, CustomerOverviewIconName> = {
    Call: "phone",
    Text: "message",
    Email: "mail",
    More: "more",
  };
  const content = (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0F6BFF] shadow-[0_8px_20px_rgba(15,23,42,0.06)]">
        <CustomerOverviewIcon className="h-[18px] w-[18px]" name={iconName[label]} />
      </span>
      <span className="text-xs font-black text-slate-700">{label}</span>
    </>
  );
  const className =
    "flex flex-col items-center justify-center gap-1.5 transition hover:text-[#0F6BFF]";

  if (href) {
    return (
      <a className={className} href={href}>
        {content}
      </a>
    );
  }

  return (
    <button className={className} type="button">
      {content}
    </button>
  );
}

function CustomerActivityContent({ item }: { item: TimelineItem }) {
  const iconName: CustomerOverviewIconName =
    item.category === "estimate"
      ? "briefcase"
      : item.category === "invoice" || item.category === "payment"
        ? "payment"
        : item.category === "call"
          ? "message"
          : item.category === "note"
            ? "mail"
            : item.category === "repair"
              ? "tool"
              : "briefcase";

  return (
    <span className="grid grid-cols-[34px_76px_minmax(0,1fr)_16px] items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[#0F6BFF]">
        <CustomerOverviewIcon className="h-4 w-4" name={iconName} />
      </span>
      <span className="text-xs font-bold text-slate-500">{formatActivityDate(item.at)}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-slate-950">
          {item.title}
        </span>
        {item.body ? (
          <span className="block truncate text-xs font-semibold text-slate-500">
            {item.body}
          </span>
        ) : null}
      </span>
      {item.href ? (
        <CustomerOverviewIcon className="h-4 w-4 text-slate-400" name="chevron" />
      ) : null}
    </span>
  );
}

function SectionCard({
  title,
  eyebrow,
  children,
  action,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow ? (
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#0F6BFF]">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function DashboardCustomersIndex() {
  const router = useRouter();
  const [state, setState] = useState<CustomerListState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CustomerStatusFilter>("all");
  const [extraFilter, setExtraFilter] = useState<CustomerExtraFilter>("all");
  const [sortOption, setSortOption] =
    useState<CustomerSortOption>("lastJobNewest");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [createForm, setCreateForm] = useState<CustomerFormState>(emptyCustomerForm);
  const [createState, setCreateState] = useState<ActionState>({
    status: "idle",
    message: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadCustomers() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setState({
            status: "unavailable",
            message: "Customer records are not configured in this environment.",
          });
        }
        return;
      }

      const [
        customersResult,
        requestsResult,
        appliancesResult,
        addressesResult,
        conversationsResult,
      ] =
        await Promise.all([
          supabase.from("customers").select("*").order("updated_at", { ascending: false }),
          supabase
            .from("service_requests")
            .select("*")
            .not("customer_id", "is", null)
            .order("created_at", { ascending: false }),
          supabase.from("customer_appliances").select("*").order("updated_at", { ascending: false }),
          supabase
            .from("customer_addresses")
            .select("*")
            .order("updated_at", { ascending: false }),
          supabase
            .from("communication_conversations")
            .select("*")
            .not("customer_id", "is", null)
            .order("last_event_at", { ascending: false }),
        ]);

      if (customersResult.error) {
        if (isMounted) {
          setState({
            status: "unavailable",
            message: "Customer records are not ready in this environment yet.",
          });
        }
        return;
      }

      if (isMounted) {
        setState({
          status: "ready",
          customers: (customersResult.data ?? []) as CustomerRow[],
          serviceRequests: (requestsResult.data ?? []) as ServiceRequestRow[],
          appliances: (appliancesResult.data ?? []) as CustomerApplianceRow[],
          addresses: (addressesResult.data ?? []) as CustomerAddressRow[],
          conversations: (conversationsResult.data ?? []) as CommunicationConversationRow[],
        });
      }
    }

    void loadCustomers();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    function openCreateCustomer() {
      setShowCreateForm(true);
    }

    window.addEventListener("wra:create-customer", openCreateCustomer);

    return () => {
      window.removeEventListener("wra:create-customer", openCreateCustomer);
    };
  }, []);

  const customerCounts = useMemo(() => {
    if (state.status !== "ready") {
      return { active: 0, all: 0, inactive: 0 };
    }

    return state.customers.reduce(
      (counts, customer) => {
        const status = customer.customer_status?.toLowerCase();
        counts.all += 1;
        if (status === "inactive") {
          counts.inactive += 1;
        } else if (status === "active") {
          counts.active += 1;
        }
        return counts;
      },
      { active: 0, all: 0, inactive: 0 },
    );
  }, [state]);

  const customers = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    const normalized = normalizeSearch(query);
    const filteredCustomers = state.customers.filter((customer) => {
      const requests = state.serviceRequests.filter(
        (request) => request.customer_id === customer.id,
      );
      const addresses = state.addresses.filter(
        (address) => address.customer_id === customer.id,
      );
      const appliances = state.appliances.filter(
        (appliance) => appliance.customer_id === customer.id,
      );
      const matchesQuery =
        !normalized ||
        [
          customer.full_name,
          customer.first_name,
          customer.last_name,
          customer.email,
          customer.phone,
          ...addresses.flatMap((address) => [
            address.street_address,
            address.unit,
            address.city,
            address.state,
            address.zip_code,
          ]),
          ...requests.flatMap((request) => [
            request.full_address,
            request.street_address,
            request.unit,
            request.city,
            request.state,
            request.zip_code,
          ]),
        ].some((value) => normalizeSearch(value).includes(normalized));

      if (!matchesQuery) {
        return false;
      }

      if (statusFilter !== "all" && customer.customer_status !== statusFilter) {
        return false;
      }

      if (extraFilter === "hasOpenJobs") {
        return requests.some((request) => !CLOSED_JOB_STATUSES.has(request.status));
      }

      if (extraFilter === "hasAssets") {
        return appliances.length > 0;
      }

      if (extraFilter === "hasAddress") {
        return addresses.length > 0;
      }

      if (extraFilter === "noAddress") {
        return addresses.length === 0;
      }

      return true;
    });

    return filteredCustomers.sort((left, right) => {
      const leftRequests = state.serviceRequests.filter(
        (request) => request.customer_id === left.id,
      );
      const rightRequests = state.serviceRequests.filter(
        (request) => request.customer_id === right.id,
      );
      const leftName = getCustomerName(left);
      const rightName = getCustomerName(right);
      const leftLastJob = getCustomerLastJobDate(leftRequests);
      const rightLastJob = getCustomerLastJobDate(rightRequests);

      if (sortOption === "nameAsc") {
        return leftName.localeCompare(rightName);
      }

      if (sortOption === "nameDesc") {
        return rightName.localeCompare(leftName);
      }

      if (sortOption === "customerSinceNewest") {
        return Date.parse(right.created_at) - Date.parse(left.created_at);
      }

      if (sortOption === "lastJobOldest") {
        if (!leftLastJob && !rightLastJob) {
          return leftName.localeCompare(rightName);
        }
        if (!leftLastJob) {
          return 1;
        }
        if (!rightLastJob) {
          return -1;
        }
        return Date.parse(leftLastJob) - Date.parse(rightLastJob);
      }

      if (!leftLastJob && !rightLastJob) {
        return leftName.localeCompare(rightName);
      }
      if (!leftLastJob) {
        return 1;
      }
      if (!rightLastJob) {
        return -1;
      }

      return Date.parse(rightLastJob) - Date.parse(leftLastJob);
    });
  }, [extraFilter, query, sortOption, state, statusFilter]);

  async function createCustomer() {
    if (
      !getFullNameFromForm(createForm) &&
      !cleanPhone(createForm.phone) &&
      !createForm.email.trim() &&
      !createForm.streetAddress.trim()
    ) {
      setCreateState({
        status: "error",
        message: "Add at least a name, phone, email, or address before creating a customer.",
      });
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setCreateState({ status: "error", message: "Customer CRM is not configured." });
      return;
    }

    setCreateState({ status: "saving", message: "Creating customer..." });

    const { data, error } = await supabase.rpc("upsert_dashboard_customer_rpc", {
      p_customer_id: null,
      p_payload: buildCustomerPayload(createForm),
    });

    if (error) {
      setCreateState({ status: "error", message: formatCustomerCrmSaveError(error.message) });
      return;
    }

    const payload = data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, Json>)
      : {};
    const customerId = typeof payload.customer_id === "string" ? payload.customer_id : null;

    if (!customerId) {
      setCreateState({ status: "error", message: "Customer was not returned." });
      return;
    }

    if (createForm.streetAddress.trim() || cleanZip(createForm.zipCode)) {
      const addressResult = await supabase.rpc("upsert_customer_address_rpc", {
        p_customer_id: customerId,
        p_address_id: null,
        p_payload: buildAddressPayload(createForm),
      });

      if (addressResult.error) {
        setCreateState({
          status: "error",
          message: `Customer created, but address could not be saved: ${formatCustomerCrmSaveError(addressResult.error.message)}`,
        });
        return;
      }
    }

    setCreateState({
      status: "success",
      message: payload.matched_existing ? "Existing customer opened." : "Customer created.",
    });
    router.push(`/dashboard/customers/${customerId}`);
  }

  if (state.status === "loading") {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
        <p className="text-sm font-bold text-slate-600">Loading customers...</p>
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
        <h1 className="text-2xl font-black text-slate-950">Customers unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[540px] bg-[#F8FAFC] px-0 pb-8 pt-3 lg:max-w-7xl lg:px-6 lg:pt-4">
      <header className="grid gap-3 px-3 lg:px-0">
        <label className="relative block">
          <span className="sr-only">Search customers</span>
          <CustomerOverviewIcon
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
            name="search"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, phone, email, or address"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 text-base font-medium text-slate-950 shadow-[0_8px_24px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-500 focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100 lg:text-sm"
          />
        </label>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { count: customerCounts.all, label: "All", value: "all" },
            { count: customerCounts.active, label: "Active", value: "active" },
            { count: customerCounts.inactive, label: "Inactive", value: "inactive" },
          ].map((filter) => (
            <button
              className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                statusFilter === filter.value
                  ? "bg-[#0F6BFF] text-white shadow-[0_10px_22px_rgba(15,107,255,0.24)]"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
              key={filter.value}
              onClick={() => setStatusFilter(filter.value as CustomerStatusFilter)}
              type="button"
            >
              {filter.label} ({filter.count})
            </button>
          ))}
          <button
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              extraFilter !== "all" || showFilterPanel
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-700"
            }`}
            onClick={() => setShowFilterPanel((current) => !current)}
            type="button"
          >
            <CustomerOverviewIcon className="h-4 w-4" name="status" />
            Filters
          </button>
        </div>

        {showFilterPanel ? (
          <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_26px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Quick filters
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Any", value: "all" },
                { label: "Has open jobs", value: "hasOpenJobs" },
                { label: "Has assets", value: "hasAssets" },
                { label: "Has address", value: "hasAddress" },
                { label: "No address", value: "noAddress" },
              ].map((filter) => (
                <button
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    extraFilter === filter.value
                      ? "border-[#0F6BFF] bg-blue-50 text-[#0F6BFF]"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                  key={filter.value}
                  onClick={() => setExtraFilter(filter.value as CustomerExtraFilter)}
                  type="button"
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 px-1">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            Sort by
            <select
              className="max-w-[13rem] rounded-lg border-0 bg-transparent py-1 text-sm font-semibold text-slate-900 outline-none"
              onChange={(event) =>
                setSortOption(event.target.value as CustomerSortOption)
              }
              value={sortOption}
            >
              <option value="lastJobNewest">Last Job - newest</option>
              <option value="lastJobOldest">Last Job - oldest</option>
              <option value="nameAsc">Customer Name - A to Z</option>
              <option value="nameDesc">Customer Name - Z to A</option>
              <option value="customerSinceNewest">Customer Since - newest</option>
            </select>
          </label>
        </div>
      </header>

      {showCreateForm ? (
        <section className="mx-3 mt-4 rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_10px_26px_rgba(15,23,42,0.06)] lg:mx-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0F6BFF]">
                Manual CRM entry
              </p>
              <h2 className="text-lg font-black text-slate-950">Create Customer</h2>
            </div>
            <button
              className="rounded-full px-2 py-1 text-sm font-black text-slate-500"
              onClick={() => setShowCreateForm(false)}
              type="button"
            >
              Close
            </button>
          </div>
          <CustomerEditForm
            form={createForm}
            onChange={setCreateForm}
            onSubmit={() => void createCustomer()}
            submitLabel="Create Customer"
            actionState={createState}
          />
        </section>
      ) : null}

      {customers.length > 0 ? (
        <section className="mt-3 overflow-hidden border-y border-slate-200 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)] sm:mx-3 sm:rounded-[22px] sm:border lg:mx-0">
          {customers.map((customer) => {
            const requests = state.serviceRequests.filter(
              (request) => request.customer_id === customer.id,
            );
            const addresses = state.addresses.filter(
              (address) => address.customer_id === customer.id,
            );
            const latestRequest = requests[0];
            const cityLabel = getCustomerCityLabel(addresses);

            return (
              <Link
                key={customer.id}
                href={`/dashboard/customers/${customer.id}`}
                className="grid grid-cols-[54px_minmax(0,1fr)_96px_14px] items-center gap-2 border-b border-slate-100 px-3 py-2.5 transition last:border-b-0 hover:bg-blue-50"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-lg font-semibold text-[#0F6BFF]">
                  {getCustomerInitials(customer)}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold leading-5 text-slate-950">
                    {getCustomerName(customer)}
                  </h2>
                  <p className="mt-1 truncate text-sm font-medium leading-5 text-slate-700">
                    {customer.phone || "No phone"}
                  </p>
                  <p className="truncate text-sm leading-5 text-slate-500">
                    {cityLabel}
                  </p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="text-xs font-medium leading-4 text-slate-500">
                    Last job
                  </p>
                  <p className="mt-0.5 truncate text-sm font-semibold leading-5 text-slate-950">
                    {latestRequest ? formatDate(latestRequest.created_at) : "No jobs yet"}
                  </p>
                  <span className="mt-1 inline-flex">
                    <StatusPill value={customer.customer_status} />
                  </span>
                </div>
                <CustomerOverviewIcon className="h-4 w-4 text-slate-900" name="chevron" />
              </Link>
            );
          })}
        </section>
      ) : (
        <section className="mx-3 mt-4 rounded-[24px] border border-dashed border-slate-300 bg-white p-6 text-center shadow-[0_12px_32px_rgba(15,23,42,0.06)] lg:mx-0">
          <h2 className="text-xl font-black text-slate-950">No customers found</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Customer profiles appear after customer-linked service requests are saved.
          </p>
        </section>
      )}
    </div>
  );
}

export function DashboardCustomerDetail({
  customerId,
  returnTo = "/dashboard/customers",
}: {
  customerId: string;
  returnTo?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<CustomerDetailState>({ status: "loading" });
  const [activeTab, setActiveTab] = useState<CustomerWorkspaceTab>(() => {
    if (typeof window === "undefined") {
      return "overview";
    }

    const tab = new URLSearchParams(window.location.search).get("tab");

    return tab === "jobs" || tab === "assets" || tab === "more"
      ? tab
      : "overview";
  });
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return new URLSearchParams(window.location.search).get("asset");
  });
  const [jobsFilter, setJobsFilter] = useState<CustomerJobsFilter>("all");
  const [showArchivedAssets, setShowArchivedAssets] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [profileForm, setProfileForm] = useState<CustomerFormState>(emptyCustomerForm);
  const [applianceForm, setApplianceForm] =
    useState<ApplianceFormState>(emptyApplianceForm);
  const [noteBody, setNoteBody] = useState("");
  const [profileAction, setProfileAction] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [applianceAction, setApplianceAction] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [isAssetFormOpen, setIsAssetFormOpen] = useState(false);
  const [noteAction, setNoteAction] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [expandedSections, setExpandedSections] = useState<Record<CustomerSectionKey, boolean>>({
    profile: false,
    addresses: false,
    serviceAddresses: false,
    assets: false,
    estimates: false,
    invoices: false,
    communications: false,
    notes: false,
    timeline: false,
    repairHistory: false,
  });
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadCustomer() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setState({
            status: "unavailable",
            message: "Customer records are not configured in this environment.",
          });
        }
        return;
      }

      const [
        customerResult,
        requestsResult,
        appliancesResult,
        addressesResult,
        customerNotesResult,
        conversationsResult,
        profileResult,
      ] =
        await Promise.all([
          supabase.from("customers").select("*").eq("id", customerId).maybeSingle(),
          supabase
            .from("service_requests")
            .select("*")
            .eq("customer_id", customerId)
            .order("created_at", { ascending: false }),
          supabase
            .from("customer_appliances")
            .select("*")
            .eq("customer_id", customerId)
            .order("updated_at", { ascending: false }),
          supabase
            .from("customer_addresses")
            .select("*")
            .eq("customer_id", customerId)
            .order("is_primary", { ascending: false })
            .order("updated_at", { ascending: false }),
          supabase
            .from("customer_internal_notes")
            .select("*")
            .eq("customer_id", customerId)
            .is("archived_at", null)
            .order("created_at", { ascending: false }),
          supabase
            .from("communication_conversations")
            .select("*")
            .eq("customer_id", customerId)
            .order("last_event_at", { ascending: false }),
          supabase.rpc("current_app_role"),
        ]);

      if (customerResult.error) {
        if (isMounted) {
          setState({
            status: "unavailable",
            message: "Customer record could not be loaded.",
          });
        }
        return;
      }

      const serviceRequestIds = ((requestsResult.data ?? []) as ServiceRequestRow[]).map(
        (request) => request.id,
      );
      const loadedAppliances = (appliancesResult.data ?? []) as CustomerApplianceRow[];
      const coverPhotoIds = loadedAppliances
        .map((appliance) => appliance.cover_photo_id)
        .filter((id): id is string => Boolean(id));
      const assetIds = loadedAppliances.map((appliance) => appliance.id);
      const conversationIds = (
        (conversationsResult.data ?? []) as CommunicationConversationRow[]
      ).map((conversation) => conversation.id);

      const [estimatesResult, invoicesResult, notesResult, timelineResult] =
        serviceRequestIds.length > 0 || conversationIds.length > 0
          ? await Promise.all([
              serviceRequestIds.length > 0
                ? supabase
                    .from("service_request_estimates")
                    .select("*")
                    .in("service_request_id", serviceRequestIds)
                    .order("created_at", { ascending: false })
                : Promise.resolve({ data: [], error: null }),
              serviceRequestIds.length > 0
                ? supabase
                    .from("service_request_invoices")
                    .select("*")
                    .in("service_request_id", serviceRequestIds)
                    .order("created_at", { ascending: false })
                : Promise.resolve({ data: [], error: null }),
              serviceRequestIds.length > 0
                ? supabase
                    .from("service_request_notes")
                    .select("*")
                    .in("service_request_id", serviceRequestIds)
                    .order("created_at", { ascending: false })
                : Promise.resolve({ data: [], error: null }),
              conversationIds.length > 0
                ? supabase
                    .from("communication_timeline_events")
                    .select("*")
                    .in("conversation_id", conversationIds)
                    .order("event_time", { ascending: true })
                : Promise.resolve({ data: [], error: null }),
            ])
          : [
              { data: [], error: null },
              { data: [], error: null },
              { data: [], error: null },
              { data: [], error: null },
            ];
      const coverPhotoUrls: Record<string, string> = {};
      const assetPhotoUrls: Record<string, string> = {};
      let loadedAssetPhotos: CustomerAppliancePhotoRow[] = [];

      if (coverPhotoIds.length > 0) {
        const { data: coverPhotos } = await supabase
          .from("service_request_photos")
          .select("id,storage_path")
          .in("id", coverPhotoIds);

        await Promise.all(
          (coverPhotos ?? []).map(async (photo) => {
            const { data: signedUrlData } = await supabase.storage
              .from(SERVICE_REQUEST_PHOTO_BUCKET)
              .createSignedUrl(photo.storage_path, 60 * 30);

            if (signedUrlData?.signedUrl) {
              coverPhotoUrls[photo.id] = signedUrlData.signedUrl;
            }
          }),
        );
      }

      if (assetIds.length > 0) {
        const { data: assetPhotos } = await supabase
          .from("customer_appliance_photos")
          .select("*")
          .in("customer_appliance_id", assetIds)
          .order("created_at", { ascending: false });
        loadedAssetPhotos = (assetPhotos ?? []) as CustomerAppliancePhotoRow[];

        await Promise.all(
          loadedAssetPhotos.map(async (photo) => {
            if (!photo.customer_appliance_id) {
              return;
            }

            const { data: signedUrlData } = await supabase.storage
              .from(CUSTOMER_APPLIANCE_PHOTO_BUCKET)
              .createSignedUrl(photo.storage_path, 60 * 30);

            if (signedUrlData?.signedUrl) {
              assetPhotoUrls[photo.id] = signedUrlData.signedUrl;
              if (
                photo.photo_type === "asset_photo" &&
                photo.is_cover &&
                !coverPhotoUrls[photo.customer_appliance_id]
              ) {
                coverPhotoUrls[photo.customer_appliance_id] = signedUrlData.signedUrl;
              }
            }
          }),
        );
      }

      if (isMounted) {
        setState({
          status: "ready",
          customer: (customerResult.data as CustomerRow | null) ?? null,
          serviceRequests: (requestsResult.data ?? []) as ServiceRequestRow[],
          appliances: loadedAppliances,
          addresses: (addressesResult.data ?? []) as CustomerAddressRow[],
          estimates: (estimatesResult.data ?? []) as ServiceRequestEstimateRow[],
          invoices: (invoicesResult.data ?? []) as ServiceRequestInvoiceRow[],
          notes: (notesResult.data ?? []) as ServiceRequestNoteRow[],
          customerNotes: (customerNotesResult.data ?? []) as CustomerInternalNoteRow[],
          conversations: (conversationsResult.data ?? []) as CommunicationConversationRow[],
          communicationEvents: (timelineResult.data ?? []) as CommunicationTimelineEventRow[],
          assetPhotos: loadedAssetPhotos,
          assetCoverUrls: coverPhotoUrls,
          assetPhotoUrls,
          currentRole: (profileResult.data as DatabaseAppRole | null) ?? null,
        });

        const loadedCustomer = (customerResult.data as CustomerRow | null) ?? null;
        const loadedAddresses = (addressesResult.data ?? []) as CustomerAddressRow[];
        if (loadedCustomer) {
          setProfileForm(
            buildCustomerForm(
              loadedCustomer,
              loadedAddresses.find((address) => address.is_primary) ?? loadedAddresses[0],
            ),
          );
        }
      }
    }

    void loadCustomer();

    return () => {
      isMounted = false;
    };
  }, [customerId, reloadKey]);

  useEffect(() => {
    function syncWorkspaceRoute() {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      const nextTab =
        tab === "jobs" || tab === "assets" || tab === "more" ? tab : "overview";

      setActiveTab(nextTab);
      setSelectedAssetId(nextTab === "assets" ? params.get("asset") : null);
    }

    window.addEventListener("popstate", syncWorkspaceRoute);

    return () => {
      window.removeEventListener("popstate", syncWorkspaceRoute);
    };
  }, []);

  function refreshCustomer() {
    setReloadKey((value) => value + 1);
  }

  function getDefaultAssetAddressId() {
    if (state.status !== "ready") {
      return "";
    }

    return (
      state.addresses.find((address) => address.is_primary)?.id ??
      state.addresses[0]?.id ??
      ""
    );
  }

  function toggleSection(section: CustomerSectionKey) {
    setExpandedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function selectWorkspaceTab(tab: CustomerWorkspaceTab) {
    setActiveTab(tab);
    if (tab === "assets") {
      setSelectedAssetId(null);
      setShowArchivedAssets(false);
      setIsAssetFormOpen(false);
      setApplianceForm(emptyApplianceForm);
    } else {
      setSelectedAssetId(null);
    }
    if (typeof window === "undefined") {
      return;
    }

    const nextUrl =
      tab === "overview"
        ? `/dashboard/customers/${customerId}`
        : `/dashboard/customers/${customerId}?tab=${tab}`;

    window.history.replaceState(null, "", nextUrl);
  }

  function openAssetDetail(assetId: string) {
    setActiveTab("assets");
    setSelectedAssetId(assetId);

    if (typeof window !== "undefined") {
      window.history.pushState(
        null,
        "",
        `/dashboard/customers/${customerId}?tab=assets&asset=${encodeURIComponent(assetId)}`,
      );
    }
  }

  function closeAssetDetail() {
    setSelectedAssetId(null);

    if (typeof window !== "undefined") {
      window.history.pushState(
        null,
        "",
        `/dashboard/customers/${customerId}?tab=assets`,
      );
    }
  }

  function returnToActiveAssetsList() {
    setActiveTab("assets");
    setSelectedAssetId(null);
    setShowArchivedAssets(false);
    setIsAssetFormOpen(false);
    setApplianceForm(emptyApplianceForm);

    if (typeof window !== "undefined") {
      window.history.pushState(null, "", `/dashboard/customers/${customerId}?tab=assets`);
    }
  }

  async function saveProfile() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setProfileAction({ status: "error", message: "Customer CRM is not configured." });
      return;
    }

    setProfileAction({ status: "saving", message: "Saving customer..." });

    const customerResult = await supabase.rpc("upsert_dashboard_customer_rpc", {
      p_customer_id: customerId,
      p_payload: buildCustomerPayload(profileForm),
    });

    if (customerResult.error) {
      setProfileAction({
        status: "error",
        message: formatCustomerCrmSaveError(customerResult.error.message),
      });
      return;
    }

    const primaryAddress =
      state.status === "ready"
        ? state.addresses.find((address) => address.is_primary) ?? state.addresses[0]
        : undefined;

    if (primaryAddress || hasAddressFormData(profileForm)) {
      const addressResult = await supabase.rpc("upsert_customer_address_rpc", {
        p_customer_id: customerId,
        p_address_id: primaryAddress?.id ?? null,
        p_payload: buildAddressPayload(profileForm),
      });

      if (addressResult.error) {
        setProfileAction({
          status: "error",
          message: formatCustomerCrmSaveError(addressResult.error.message),
        });
        return;
      }
    }

    setProfileAction({ status: "success", message: "Customer profile saved." });
    refreshCustomer();
  }

  async function saveAppliance() {
    if (!applianceForm.applianceType.trim()) {
      setApplianceAction({ status: "error", message: "Appliance type is required." });
      return;
    }
    if (!applianceForm.brand.trim()) {
      setApplianceAction({ status: "error", message: "Brand is required." });
      return;
    }
    if (!applianceForm.customerAddressId) {
      setApplianceAction({ status: "error", message: "Choose the asset's physical address." });
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setApplianceAction({ status: "error", message: "Customer CRM is not configured." });
      return;
    }

    setApplianceAction({ status: "saving", message: "Saving appliance..." });

    let appliancePayload = buildAppliancePayload(applianceForm);

    if (applianceForm.customerAddressId.startsWith("job:")) {
      const locationOption = state.status === "ready"
        ? buildAssetLocationOptions({
            addresses: state.addresses,
            requests: state.serviceRequests,
          }).find((option) => option.key === applianceForm.customerAddressId)
        : null;

      if (!locationOption?.payload) {
        setApplianceAction({
          status: "error",
          message: "That previous job address is no longer available.",
        });
        return;
      }

      const addressResult = await supabase.rpc("upsert_customer_address_rpc", {
        p_customer_id: customerId,
        p_address_id: null,
        p_payload: locationOption.payload,
      });

      if (addressResult.error) {
        setApplianceAction({
          status: "error",
          message: formatCustomerCrmSaveError(addressResult.error.message),
        });
        return;
      }

      const returnedAddressId =
        addressResult.data &&
        typeof addressResult.data === "object" &&
        "address_id" in addressResult.data &&
        typeof addressResult.data.address_id === "string"
          ? addressResult.data.address_id
          : null;

      if (!returnedAddressId) {
        setApplianceAction({
          status: "error",
          message: "Previous job address could not be saved for this asset.",
        });
        return;
      }

      appliancePayload = {
        ...appliancePayload,
        customer_address_id: returnedAddressId,
      };
    }

    const { error } = await supabase.rpc("upsert_customer_appliance_rpc", {
      p_customer_id: customerId,
      p_appliance_id: applianceForm.id,
      p_payload: appliancePayload,
    });

    if (error) {
      setApplianceAction({
        status: "error",
        message:
          error.message.includes("not accessible") ||
          error.message.includes("permission denied")
            ? "This account is not allowed to save assets for this customer."
            : error.message.includes("Brand is required")
              ? "Brand is required."
              : "Asset could not be saved.",
      });
      return;
    }

    setApplianceAction({
      status: "success",
      message: applianceForm.id ? "Appliance saved." : "Appliance added.",
    });
    setApplianceForm(emptyApplianceForm);
    setIsAssetFormOpen(false);
    refreshCustomer();
  }

  async function runAssetLifecycleAction({
    action,
    asset,
    linkedJobCount,
  }: {
    action: "delete" | "archive" | "restore";
    asset: CustomerApplianceRow;
    linkedJobCount: number;
  }) {
    const confirmation =
      action === "delete"
        ? "Delete Asset?\n\nThis asset has no service history and will be permanently deleted, including its standalone photos. This action cannot be undone."
        : action === "archive"
          ? "Archive Asset?\n\nThis asset has existing service history and cannot be permanently deleted. It will be hidden from active assets while its jobs and service history remain available."
          : "Restore Asset?\n\nThis asset will be restored to active assets.";

    if (!window.confirm(confirmation)) {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setApplianceAction({ status: "error", message: "Customer CRM is not configured." });
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setApplianceAction({ status: "error", message: "A logged-in dashboard session is required." });
      return;
    }

    if (action === "delete" && linkedJobCount > 0) {
      setApplianceAction({
        status: "error",
        message: "This asset has service history. Archive it instead of deleting it.",
      });
      return;
    }

    setApplianceAction({ status: "saving", message: "Updating asset..." });

    const endpoint = `/api/customers/${encodeURIComponent(customerId)}/assets/${encodeURIComponent(asset.id)}/lifecycle`;
    const response = await fetch(endpoint, {
      method: action === "delete" ? "DELETE" : "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: action === "delete" ? undefined : JSON.stringify({ action }),
    });
    const data = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      setApplianceAction({
        status: "error",
        message:
          readRecordString(data, "message") ??
          (action === "delete" ? "Asset could not be deleted." : "Asset could not be updated."),
      });
      return;
    }

    setApplianceAction({
      status: "success",
      message:
        action === "delete"
          ? "Asset deleted."
          : action === "archive"
            ? "Asset archived."
            : "Asset restored.",
    });

    returnToActiveAssetsList();

    refreshCustomer();
  }

  async function addCustomerNote() {
    const body = noteBody.trim();
    if (!body) {
      setNoteAction({ status: "error", message: "Note cannot be empty." });
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNoteAction({ status: "error", message: "Customer CRM is not configured." });
      return;
    }

    setNoteAction({ status: "saving", message: "Saving note..." });

    const { error } = await supabase.rpc("add_customer_internal_note_rpc", {
      p_customer_id: customerId,
      p_body: body,
      p_note_type: "general",
    });

    if (error) {
      setNoteAction({ status: "error", message: error.message });
      return;
    }

    setNoteAction({ status: "success", message: "Customer note added." });
    setNoteBody("");
    refreshCustomer();
  }

  if (state.status === "loading") {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
        Loading customer...
      </div>
    );
  }

  if (state.status === "unavailable") {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-black text-slate-950">Customer unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">{state.message}</p>
      </div>
    );
  }

  const customer = state.customer;

  if (!customer) {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-black text-slate-950">Customer not found</h1>
      </div>
    );
  }

  const openJobs = state.serviceRequests.filter(
    (request) => !CLOSED_JOB_STATUSES.has(request.status),
  );
  const pastJobs = state.serviceRequests.filter((request) =>
    CLOSED_JOB_STATUSES.has(request.status),
  );
  const customerJobsForFilter =
    jobsFilter === "open"
      ? openJobs
      : jobsFilter === "completed"
        ? pastJobs
        : state.serviceRequests;
  const primaryAddressRecord = getCustomerPrimaryAddress(state.addresses);
  const primaryAddressStreet = primaryAddressRecord
    ? [primaryAddressRecord.street_address, primaryAddressRecord.unit]
        .filter(Boolean)
        .join(", ")
    : "No customer primary address saved yet.";
  const primaryAddressCityLine = primaryAddressRecord
    ? [
        primaryAddressRecord.city,
        [primaryAddressRecord.state, primaryAddressRecord.zip_code]
          .filter(Boolean)
          .join(" "),
        primaryAddressRecord.country,
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  const primaryAddressMapsUrl =
    primaryAddressRecord && getAddressLabel(primaryAddressRecord) !== "No address saved"
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          getAddressLabel(primaryAddressRecord),
        )}`
      : null;
  const completedJobs = state.serviceRequests.filter((request) =>
    ["completed", "closed"].includes(request.status),
  );
  const lifetimeRevenue = state.invoices
    .filter((invoice) => invoice.invoice_status === "paid")
    .reduce((total, invoice) => total + Number(invoice.total ?? 0), 0);
  const outstandingBalance = state.invoices
    .filter((invoice) => !["paid", "void", "voided"].includes(invoice.invoice_status))
    .reduce((total, invoice) => total + Number(invoice.total ?? 0), 0);
  const averageTicket = completedJobs.length > 0 ? lifetimeRevenue / completedJobs.length : 0;
  const ownerCanViewMetrics = canViewOwnerMetrics(state.currentRole);
  const timeline = buildCustomerTimeline(state);
  const recentActivity = [...timeline]
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, 3);
  const customerMetrics = [
    { label: "Jobs", value: state.serviceRequests.length.toString() },
    { label: "Assets", value: state.appliances.length.toString() },
    { label: "Estimates", value: state.estimates.length.toString() },
    { label: "Invoices", value: state.invoices.length.toString() },
  ];
  const activeAssets = state.appliances.filter(
    (appliance) => appliance.asset_status !== "archived",
  );
  const archivedAssets = state.appliances.filter(
    (appliance) => appliance.asset_status === "archived",
  );
  const visibleAssets = showArchivedAssets ? archivedAssets : activeAssets;
  const selectedAsset =
    selectedAssetId !== null
      ? state.appliances.find((appliance) => appliance.id === selectedAssetId) ?? null
      : null;
  const customerPhoneHref = customer.phone ? `tel:${cleanPhone(customer.phone)}` : undefined;
  const customerSmsHref = customer.phone ? `sms:${cleanPhone(customer.phone)}` : undefined;
  const customerEmailHref = customer.email ? `mailto:${customer.email}` : undefined;
  const shouldRenderLegacyDetails = false;

  return (
    <div className="mx-auto w-full max-w-[430px] bg-[#F8FAFC] px-3 pb-6 pt-3 sm:px-4 lg:max-w-3xl lg:rounded-[28px] lg:border lg:border-slate-200 lg:p-6 lg:shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
      <header className="rounded-[22px] bg-white px-3 pb-4 pt-3 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/80">
        <div className="flex items-center justify-between gap-3">
          <Link
            aria-label="Back to previous context"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-950 transition hover:bg-slate-100"
            href={returnTo}
          >
            <CustomerOverviewIcon className="h-5 w-5" name="back" />
          </Link>
          <div className="flex items-center gap-2">
            <button
            className="flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
            onClick={() => {
              setIsProfileEditorOpen(true);
            }}
            type="button"
            >
              <CustomerOverviewIcon className="h-3.5 w-3.5" name="edit" />
              Edit
            </button>
            <button
              aria-label="More customer actions"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100"
              type="button"
            >
              <CustomerOverviewIcon className="h-4 w-4" name="more" />
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xl font-black text-[#0F6BFF]">
            {getCustomerInitials(customer)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="min-w-0">
              <h1 className="min-w-0 text-xl font-black leading-tight text-slate-950">
                {getCustomerName(customer)}
              </h1>
              <div className="mt-1">
              <StatusPill value={customer.customer_status} />
              </div>
            </div>
            <p className="mt-2 flex items-center gap-2 truncate text-sm font-semibold text-slate-700">
              <CustomerOverviewIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" name="phone" />
              <span className="truncate">{customer.phone || "No phone"}</span>
            </p>
            <p className="mt-1 flex items-center gap-2 truncate text-sm text-slate-500">
              <CustomerOverviewIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" name="mail" />
              <span className="truncate">{customer.email || "No email"}</span>
            </p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-4 gap-2 px-2 py-3">
        <CustomerQuickAction href={customerPhoneHref} label="Call" />
        <CustomerQuickAction href={customerSmsHref} label="Text" />
        <CustomerQuickAction href={customerEmailHref} label="Email" />
        <CustomerQuickAction label="More" />
      </section>

      <nav className="grid grid-cols-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 text-center text-sm font-black text-slate-600">
        {[
          { id: "overview", label: "Overview" },
          { id: "jobs", label: "Jobs" },
          { id: "assets", label: "Assets" },
          { id: "more", label: "More" },
        ].map((tab) => (
          <button
            className={`rounded-lg py-2 transition ${
              activeTab === tab.id
                ? "bg-[#0F6BFF] text-white shadow-sm"
                : "hover:bg-slate-50 hover:text-slate-950"
            }`}
            disabled={tab.id === "more"}
            key={tab.id}
            onClick={() => selectWorkspaceTab(tab.id as CustomerWorkspaceTab)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "jobs" ? (
        <CustomerJobsWorkspace
          customer={customer}
          filter={jobsFilter}
          onBack={() => selectWorkspaceTab("overview")}
          onFilterChange={setJobsFilter}
          onNewJob={() => {
            router.push(`/dashboard/leads?newJob=1&customerId=${encodeURIComponent(customer.id)}`);
          }}
          openCount={openJobs.length}
          requests={customerJobsForFilter}
          totalCount={state.serviceRequests.length}
          completedCount={pastJobs.length}
        />
      ) : null}

      {activeTab === "assets" ? (
        selectedAsset ? (
          <CustomerAssetDetailWorkspace
            asset={selectedAsset}
            addresses={state.addresses}
            coverUrl={
              state.assetCoverUrls[selectedAsset.id] ??
              (selectedAsset.cover_photo_id
                ? state.assetCoverUrls[selectedAsset.cover_photo_id] ?? null
                : null)
            }
            assetPhotos={state.assetPhotos.filter(
              (photo) => photo.customer_appliance_id === selectedAsset.id,
            )}
            assetPhotoUrls={state.assetPhotoUrls}
            customerId={customer.id}
            onNewJob={(asset) => {
              if (asset.asset_status === "archived") {
                return;
              }

              const params = new URLSearchParams({
                newJob: "1",
                customerId: customer.id,
                assetId: asset.id,
              });

              router.push(`/dashboard/leads?${params.toString()}`);
            }}
            onLifecycleAction={(action, asset, linkedJobCount) => {
              void runAssetLifecycleAction({ action, asset, linkedJobCount });
            }}
            onBack={closeAssetDetail}
            onEdit={(asset) => {
              setApplianceForm(buildApplianceForm(asset));
              setApplianceAction({ status: "idle", message: null });
              setIsAssetFormOpen(true);
            }}
            onSave={() => void saveAppliance()}
            actionState={applianceAction}
            form={applianceForm}
            isEditing={isAssetFormOpen}
            onCancelEdit={() => {
              setApplianceForm(emptyApplianceForm);
              setApplianceAction({ status: "idle", message: null });
              setIsAssetFormOpen(false);
            }}
            onFormChange={setApplianceForm}
            requests={state.serviceRequests}
          />
        ) : (
          <CustomerAssetsWorkspace
            actionState={applianceAction}
            addresses={state.addresses}
            appliances={visibleAssets}
            archivedCount={archivedAssets.length}
            coverUrls={state.assetCoverUrls}
            customerId={customer.id}
            form={applianceForm}
            isFormOpen={isAssetFormOpen}
            showArchived={showArchivedAssets}
            onAdd={() => {
              setApplianceForm({
                ...emptyApplianceForm,
                customerAddressId: getDefaultAssetAddressId(),
              });
              setApplianceAction({ status: "idle", message: null });
              setIsAssetFormOpen(true);
            }}
            onCancelForm={() => {
              setApplianceForm(emptyApplianceForm);
              setApplianceAction({ status: "idle", message: null });
              setIsAssetFormOpen(false);
            }}
            onFormChange={setApplianceForm}
            onOpenAsset={openAssetDetail}
            onSave={() => void saveAppliance()}
            onShowArchivedChange={setShowArchivedAssets}
            requests={state.serviceRequests}
          />
        )
      ) : null}

      {activeTab === "overview" ? (
      <main className="mt-3 grid gap-2.5">
        <section className="grid grid-cols-4 overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          {customerMetrics.map((metric, index) => (
            <div
              className={`px-2 py-2.5 text-center ${
                index > 0 ? "border-l border-slate-100" : ""
              }`}
              key={metric.label}
            >
              <p className="text-lg font-black leading-none text-slate-950">
                {metric.value}
              </p>
              <p className="mt-1 text-[0.68rem] font-bold leading-none text-slate-500">
                {metric.label}
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-black text-slate-950">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-[#0F6BFF]">
                  <CustomerOverviewIcon className="h-3.5 w-3.5" name="pin" />
                </span>
                Primary Address
              </p>
              <p className="mt-2 line-clamp-2 text-sm font-bold leading-5 text-slate-800">
                {primaryAddressStreet}
              </p>
              {primaryAddressCityLine ? (
                <p className="mt-0.5 truncate text-sm text-slate-500">
                  {primaryAddressCityLine}
                </p>
              ) : null}
            </div>
            <button
              aria-label="Edit primary address"
              className="shrink-0 rounded-full px-2 py-1 text-sm font-black text-[#0F6BFF] transition hover:bg-blue-50"
              onClick={() => {
                setIsProfileEditorOpen(true);
              }}
              type="button"
            >
              Edit
            </button>
          </div>
          {primaryAddressMapsUrl ? (
            <a
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-black text-[#0F6BFF]"
              href={primaryAddressMapsUrl}
              rel="noreferrer"
              target="_blank"
            >
              <CustomerOverviewIcon className="h-3.5 w-3.5" name="map" />
              Open in Maps
            </a>
          ) : null}
        </section>

        <section className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-950">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-[#0F6BFF]">
                <CustomerOverviewIcon className="h-3.5 w-3.5" name="status" />
              </span>
              Recent Activity
            </h2>
            <button
              className="text-sm font-black text-[#0F6BFF]"
              onClick={() => {
                setIsProfileEditorOpen(false);
                setExpandedSections((current) => ({ ...current, timeline: true }));
              }}
              type="button"
            >
              View all
            </button>
          </div>
          {recentActivity.length > 0 ? (
            <ol className="mt-2 divide-y divide-slate-100">
              {recentActivity.map((item) => (
                <li key={item.id}>
                  {item.href ? (
                    <Link
                      className="block py-2 transition hover:text-[#0F6BFF]"
                      href={item.href}
                    >
                      <CustomerActivityContent item={item} />
                    </Link>
                  ) : (
                    <div className="py-2">
                      <CustomerActivityContent item={item} />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No recent activity yet.</p>
          )}
        </section>

        <section className="pt-1">
          <Link
            className="flex min-h-11 w-full items-center justify-center rounded-xl bg-[#0F6BFF] px-3 text-sm font-black text-white transition hover:bg-[#0057D9]"
            href="/dashboard/leads"
          >
            + New Job
          </Link>
        </section>
      </main>
      ) : null}

      {isProfileEditorOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-3 pb-3 lg:items-center"
          role="dialog"
        >
          <button
            aria-label="Close customer editor"
            className="absolute inset-0 cursor-default"
            onClick={() => setIsProfileEditorOpen(false)}
            type="button"
          />
          <div className="relative max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-[22px] bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-slate-950">Edit Customer</h2>
              <button
                aria-label="Close customer editor"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100"
                onClick={() => setIsProfileEditorOpen(false)}
                type="button"
              >
                <CustomerOverviewIcon className="h-4 w-4" name="close" />
              </button>
            </div>
            <CustomerEditForm
              actionState={profileAction}
              form={profileForm}
              onChange={setProfileForm}
              onSubmit={() => void saveProfile()}
              submitLabel="Save Customer"
            />
          </div>
        </div>
      ) : null}

      {shouldRenderLegacyDetails ? (
        <div className="mt-5 grid gap-5 border-t border-slate-200 pt-5">
          <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <SectionCard title="Customer Summary" eyebrow="Operational context">
              <CustomerSummary
                customer={customer}
                appliances={state.appliances}
                serviceRequests={state.serviceRequests}
                estimates={state.estimates}
                conversations={state.conversations}
                ownerCanViewMetrics={ownerCanViewMetrics}
                lifetimeRevenue={lifetimeRevenue}
                outstandingBalance={outstandingBalance}
                averageTicket={averageTicket}
                completedJobs={completedJobs.length}
              />
            </SectionCard>

            <CollapsibleSection
              title="Profile"
              eyebrow="Contact"
              expanded={expandedSections.profile}
              onToggle={() => toggleSection("profile")}
            >
              <CustomerEditForm
                actionState={profileAction}
                form={profileForm}
                onChange={setProfileForm}
                onSubmit={() => void saveProfile()}
                submitLabel="Save Customer"
              />
            </CollapsibleSection>
          </section>

          <CollapsibleSection
            title="Previous Service Addresses"
            eyebrow="Job service locations"
            expanded={expandedSections.serviceAddresses}
            onToggle={() => toggleSection("serviceAddresses")}
          >
            <ServiceAddressList requests={state.serviceRequests} />
          </CollapsibleSection>

          <SectionCard title="Open Jobs" eyebrow="Current work">
            <JobList requests={openJobs} estimates={state.estimates} empty="No open jobs." />
          </SectionCard>

          <CollapsibleSection
            title="Assets"
            eyebrow="Appliances"
            expanded={expandedSections.assets}
            onToggle={() => toggleSection("assets")}
          >
            <ApplianceList
              appliances={state.appliances}
              requests={state.serviceRequests}
              onEdit={(appliance) => setApplianceForm(buildApplianceForm(appliance))}
            />
            <div className="mt-5 rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4">
              <h3 className="font-black text-slate-950">
                {applianceForm.id ? "Edit appliance" : "Add appliance"}
              </h3>
              <ApplianceEditForm
                actionState={applianceAction}
                addresses={state.addresses}
                customerId={customerId}
                form={applianceForm}
                onCancel={() => setApplianceForm(emptyApplianceForm)}
                onChange={setApplianceForm}
                onSubmit={() => void saveAppliance()}
                requests={state.serviceRequests}
              />
            </div>
          </CollapsibleSection>

          <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <CollapsibleSection
              title="Estimates"
              eyebrow="Quotes"
              expanded={expandedSections.estimates}
              onToggle={() => toggleSection("estimates")}
            >
              <EstimateList estimates={state.estimates} serviceRequests={state.serviceRequests} />
            </CollapsibleSection>

            <CollapsibleSection
              title="Invoices"
              eyebrow="Billing"
              expanded={expandedSections.invoices}
              onToggle={() => toggleSection("invoices")}
            >
              <InvoiceList invoices={state.invoices} serviceRequests={state.serviceRequests} />
            </CollapsibleSection>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <CollapsibleSection
              title="Communication History"
              eyebrow="Conversations"
              expanded={expandedSections.communications}
              onToggle={() => toggleSection("communications")}
            >
              <ConversationList conversations={state.conversations} />
            </CollapsibleSection>

            <CollapsibleSection
              title="Internal Notes"
              eyebrow="Team only"
              expanded={expandedSections.notes}
              onToggle={() => toggleSection("notes")}
            >
              <CustomerNotesPanel
                actionState={noteAction}
                customerNotes={state.customerNotes}
                jobNotes={state.notes}
                noteBody={noteBody}
                onNoteBodyChange={setNoteBody}
                onSubmit={() => void addCustomerNote()}
                serviceRequests={state.serviceRequests}
              />
            </CollapsibleSection>
          </section>

          <CollapsibleSection
            title="Customer Timeline"
            eyebrow="Chronological history"
            expanded={expandedSections.timeline}
            onToggle={() => toggleSection("timeline")}
          >
            <TimelineList items={timeline} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Repair History"
            eyebrow="Past jobs"
            expanded={expandedSections.repairHistory}
            onToggle={() => toggleSection("repairHistory")}
          >
            <JobList requests={pastJobs} estimates={state.estimates} empty="No past jobs yet." />
          </CollapsibleSection>
        </div>
      ) : null}
    </div>
  );
}

function CollapsibleSection({
  title,
  eyebrow,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  eyebrow?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
      <button
        className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
        onClick={onToggle}
        type="button"
      >
        <span>
          {eyebrow ? (
            <span className="block text-xs font-black uppercase tracking-[0.14em] text-[#0F6BFF]">
              {eyebrow}
            </span>
          ) : null}
          <span className="block text-xl font-black text-slate-950">{title}</span>
        </span>
        <span className="rounded-full border border-slate-200 bg-[#F7F9FC] px-3 py-1 text-xs font-black text-slate-600">
          {expanded ? "Hide" : "Show"}
        </span>
      </button>
      {expanded ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#F7F9FC] p-3">
      <p className="text-xl font-black text-slate-950">{value}</p>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-2xl border border-slate-200 bg-[#F7F9FC] p-3">
      <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className="font-bold text-slate-900">{value}</p>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  maxLength,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  type?: string;
}) {
  return (
    <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-700">
      {label}
      <input
        className="h-11 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function ActionMessage({ actionState }: { actionState: ActionState }) {
  if (actionState.status === "idle" || !actionState.message) {
    return null;
  }

  return (
    <p
      className={`rounded-xl border px-3 py-2 text-sm font-bold ${
        actionState.status === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : actionState.status === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-blue-200 bg-blue-50 text-blue-700"
      }`}
    >
      {actionState.message}
    </p>
  );
}

function CustomerEditForm({
  form,
  onChange,
  onSubmit,
  submitLabel,
  actionState,
}: {
  form: CustomerFormState;
  onChange: (form: CustomerFormState) => void;
  onSubmit: () => void;
  submitLabel: string;
  actionState: ActionState;
}) {
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSearchState, setAddressSearchState] = useState<
    "idle" | "searching" | "error"
  >("idle");
  const [isAddressSearchActive, setIsAddressSearchActive] = useState(false);
  const addressAutocomplete = getAddressAutocompleteAdapter();

  useEffect(() => {
    if (!isAddressSearchActive || !addressAutocomplete.isConfigured) {
      return;
    }

    const query = form.streetAddress.trim();
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
  }, [addressAutocomplete, form.streetAddress, isAddressSearchActive]);

  const update = <Key extends keyof CustomerFormState>(
    key: Key,
    value: CustomerFormState[Key],
  ) => {
    const shouldClearResolvedAddress = [
      "streetAddress",
      "unit",
      "city",
      "state",
      "zipCode",
      "country",
    ].includes(key);

    onChange({
      ...form,
      [key]: value,
      ...(shouldClearResolvedAddress
        ? { latitude: null, longitude: null, placeId: null }
        : {}),
    });
  };

  async function selectAddressSuggestion(suggestion: AddressSuggestion) {
    setAddressSearchState("searching");

    try {
      const resolvedSuggestion = addressAutocomplete.resolve
        ? await addressAutocomplete.resolve(suggestion)
        : suggestion;

      onChange({
        ...form,
        streetAddress: resolvedSuggestion.streetAddress,
        unit: resolvedSuggestion.unit ?? "",
        city: resolvedSuggestion.city,
        state: resolvedSuggestion.state,
        zipCode: cleanZip(resolvedSuggestion.zipCode),
        country: resolvedSuggestion.country || "US",
        latitude: resolvedSuggestion.latitude ?? null,
        longitude: resolvedSuggestion.longitude ?? null,
        placeId: resolvedSuggestion.placeId ?? null,
      });
      setAddressSuggestions([]);
      setIsAddressSearchActive(false);
      setAddressSearchState("idle");
    } catch {
      setAddressSearchState("error");
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <TextInput label="First name" value={form.firstName} onChange={(value) => update("firstName", value)} />
        <TextInput label="Last name" value={form.lastName} onChange={(value) => update("lastName", value)} />
        <TextInput label="Phone" value={form.phone} onChange={(value) => update("phone", value)} />
        <TextInput label="Email" type="email" value={form.email} onChange={(value) => update("email", value)} />
        <label className="grid gap-2 text-sm font-bold text-slate-700">
          Preferred contact
          <select
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none focus:border-[#0F6BFF]"
            onChange={(event) =>
              update("preferredContactMethod", event.target.value as CustomerFormState["preferredContactMethod"])
            }
            value={form.preferredContactMethod}
          >
            <option value="phone">Phone</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold text-slate-700">
          Status
          <select
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none focus:border-[#0F6BFF]"
            onChange={(event) =>
              update("customerStatus", event.target.value as CustomerFormState["customerStatus"])
            }
            value={form.customerStatus}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="blocked">Blocked</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <div className="relative grid gap-2 text-sm font-bold text-slate-700">
            <label htmlFor="customer-primary-address">Customer Primary Address</label>
            <input
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
              id="customer-primary-address"
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
                update("streetAddress", value);
              }}
              onFocus={() => setIsAddressSearchActive(true)}
              placeholder={
                addressAutocomplete.isConfigured
                  ? "Start typing to search addresses"
                  : "Street address"
              }
              value={form.streetAddress}
            />
            {addressAutocomplete.isConfigured && isAddressSearchActive ? (
              <div className="absolute left-0 right-0 top-[4.75rem] z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.18)]">
                {addressSuggestions.length > 0 ? (
                  addressSuggestions.map((suggestion) => (
                    <button
                      className="block w-full border-b border-slate-100 px-4 py-3 text-left text-sm font-bold text-slate-800 last:border-b-0 hover:bg-blue-50"
                      key={`${suggestion.provider}-${suggestion.placeId ?? suggestion.label}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void selectAddressSuggestion(suggestion)}
                      type="button"
                    >
                      {suggestion.label}
                    </button>
                  ))
                ) : (
                  <p className="px-4 py-3 text-sm font-semibold text-slate-500">
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
        <TextInput label="Apt / Unit / Suite" value={form.unit} onChange={(value) => update("unit", value)} />
        <TextInput label="City" value={form.city} onChange={(value) => update("city", value)} />
        <TextInput label="State" maxLength={2} value={form.state} onChange={(value) => update("state", value.toUpperCase())} />
        <TextInput label="ZIP" maxLength={5} value={form.zipCode} onChange={(value) => update("zipCode", cleanZip(value))} />
        <TextInput label="Country" maxLength={2} value={form.country} onChange={(value) => update("country", value.toUpperCase())} />
      </div>
      <ActionMessage actionState={actionState} />
      <button
        className="rounded-xl bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={actionState.status === "saving"}
        onClick={onSubmit}
        type="button"
      >
        {actionState.status === "saving" ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}

function ServiceAddressList({ requests }: { requests: ServiceRequestRow[] }) {
  const entries = requests.reduce<
    { request: ServiceRequestRow; address: string; key: string }[]
  >((list, request) => {
    const address = getJobAddress(request);
    const key = normalizeSearch(address);

    if (!key || address === "No address saved" || list.some((entry) => entry.key === key)) {
      return list;
    }

    return [...list, { request, address, key }];
  }, []);

  if (entries.length === 0) {
    return <EmptyMessage>No previous service addresses saved from jobs yet.</EmptyMessage>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {entries.map(({ request, address }) => (
        <Link
          key={request.id}
          href={`/dashboard/leads/${request.id}`}
          className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4 transition hover:border-[#0F6BFF] hover:bg-blue-50"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-black text-slate-950">Service Address</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{address}</p>
              <p className="mt-2 text-xs font-bold text-slate-500">
                Job: {[request.appliance_brand, request.appliance_type].filter(Boolean).join(" ") ||
                  "Linked repair"}{" "}
                · {formatDate(request.created_at)}
              </p>
            </div>
            <StatusPill value={request.status} />
          </div>
        </Link>
      ))}
    </div>
  );
}

function CustomerSummary({
  customer,
  appliances,
  serviceRequests,
  estimates,
  conversations,
  ownerCanViewMetrics,
  lifetimeRevenue,
  outstandingBalance,
  averageTicket,
  completedJobs,
}: {
  customer: CustomerRow;
  appliances: CustomerApplianceRow[];
  serviceRequests: ServiceRequestRow[];
  estimates: ServiceRequestEstimateRow[];
  conversations: CommunicationConversationRow[];
  ownerCanViewMetrics: boolean;
  lifetimeRevenue: number;
  outstandingBalance: number;
  averageTicket: number;
  completedJobs: number;
}) {
  const applianceTypes = [...new Set(appliances.map((appliance) => appliance.appliance_type))];
  const openJobs = serviceRequests.filter((request) => !CLOSED_JOB_STATUSES.has(request.status));
  const latestContact = getLastContact(customer, serviceRequests, conversations);
  const pendingEstimates = estimates.filter((estimate) =>
    ["draft", "sent"].includes(estimate.estimate_status),
  ).length;

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="Open jobs" value={openJobs.length.toString()} />
        <Metric label="Assets" value={appliances.length.toString()} />
        <Metric label="Pending estimates" value={pendingEstimates.toString()} />
        <Metric label="Last contact" value={latestContact ? formatDate(latestContact) : "None"} />
        {ownerCanViewMetrics ? (
          <>
            <Metric label="Lifetime revenue" value={formatShortMoney(lifetimeRevenue)} />
            <Metric label="Outstanding balance" value={formatShortMoney(outstandingBalance)} />
            <Metric label="Average ticket" value={formatShortMoney(averageTicket)} />
            <Metric label="Completed jobs" value={completedJobs.toString()} />
          </>
        ) : null}
      </div>
      <div className="rounded-2xl bg-[#F7F9FC] p-4 text-sm leading-6 text-slate-700">
        <p>
          {applianceTypes.length > 0
            ? `Known assets: ${applianceTypes.slice(0, 4).join(", ")}.`
            : "No saved appliance profile yet."}
        </p>
        <p className="mt-1">
          {openJobs.length > 0
            ? `${openJobs.length} active job${openJobs.length === 1 ? "" : "s"} need attention.`
            : "No active jobs are open right now."}
        </p>
      </div>
    </div>
  );
}

function CustomerJobsWorkspace({
  completedCount,
  customer,
  filter,
  onBack,
  onFilterChange,
  onNewJob,
  openCount,
  requests,
  totalCount,
}: {
  completedCount: number;
  customer: CustomerRow;
  filter: CustomerJobsFilter;
  onBack: () => void;
  onFilterChange: (filter: CustomerJobsFilter) => void;
  onNewJob: () => void;
  openCount: number;
  requests: ServiceRequestRow[];
  totalCount: number;
}) {
  const filters: { label: string; value: CustomerJobsFilter; count: number }[] = [
    { label: "All", value: "all", count: totalCount },
    { label: "Open", value: "open", count: openCount },
    { label: "Completed", value: "completed", count: completedCount },
  ];

  return (
    <main className="mt-3 grid gap-3">
      <header className="flex items-center justify-between gap-3 rounded-[18px] bg-white px-3 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.045)] ring-1 ring-slate-200/80">
        <button
          aria-label="Back to customer overview"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-950 transition hover:bg-slate-100"
          onClick={onBack}
          type="button"
        >
          <CustomerOverviewIcon className="h-5 w-5" name="back" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-base font-black text-slate-950">
          {getCustomerName(customer)}
        </h2>
        <button
          className="flex h-9 shrink-0 items-center justify-center rounded-xl bg-[#0F6BFF] px-3 text-sm font-black text-white transition hover:bg-[#0057D9]"
          onClick={onNewJob}
          type="button"
        >
          + New Job
        </button>
      </header>

      <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1 text-center text-xs font-black text-slate-600">
        {filters.map((option) => (
          <button
            className={`rounded-lg px-2 py-2 transition ${
              filter === option.value
                ? "bg-[#0F6BFF] text-white shadow-sm"
                : "hover:bg-slate-50 hover:text-slate-950"
            }`}
            key={option.value}
            onClick={() => onFilterChange(option.value)}
            type="button"
          >
            {option.label} ({option.count})
          </button>
        ))}
      </div>

      {requests.length > 0 ? (
        <div className="grid gap-2.5">
          {requests.map((request) => (
            <CustomerJobCard
              customerId={customer.id}
              key={request.id}
              request={request}
            />
          ))}
        </div>
      ) : (
        <EmptyMessage>
          {filter === "completed"
            ? "No completed jobs for this customer yet."
            : filter === "open"
              ? "No open jobs for this customer."
              : "No jobs for this customer yet."}
        </EmptyMessage>
      )}
    </main>
  );
}

function CustomerJobCard({
  customerId,
  request,
}: {
  customerId: string;
  request: ServiceRequestRow;
}) {
  return (
    <Link
      className="block rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.045)] transition hover:border-[#0F6BFF] hover:bg-blue-50"
      href={getCustomerJobHref(customerId, request.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-[#0F6BFF]">
            #{getShortJobNumber(request)}
          </p>
          <h3 className="mt-1 line-clamp-1 text-base font-black leading-tight text-slate-950">
            {getCustomerJobTitle(request)}
          </h3>
          <p className="mt-1 line-clamp-1 text-sm font-semibold text-slate-500">
            {request.issue_description || "No complaint entered"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill value={request.status} />
          <CustomerOverviewIcon className="h-4 w-4 text-slate-400" name="chevron" />
        </div>
      </div>

      <div className="mt-3 grid gap-1.5 text-xs font-bold leading-5 text-slate-600">
        <p className="flex items-start gap-2">
          <CustomerOverviewIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" name="pin" />
          <span className="line-clamp-2">{getJobAddress(request)}</span>
        </p>
        <p className="flex items-center gap-2">
          <CustomerOverviewIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" name="calendar" />
          <span className="truncate">{getCustomerJobScheduleLabel(request)}</span>
        </p>
        <p className="flex items-center gap-2">
          <CustomerOverviewIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" name="user" />
          <span className="truncate">
            Technician: {request.selected_technician_business_name || "Unassigned"}
          </span>
        </p>
      </div>
    </Link>
  );
}

function JobList({
  requests,
  estimates,
  empty,
}: {
  requests: ServiceRequestRow[];
  estimates: ServiceRequestEstimateRow[];
  empty: string;
}) {
  if (requests.length === 0) {
    return <EmptyMessage>{empty}</EmptyMessage>;
  }

  return (
    <div className="grid gap-3">
      {requests.map((request) => {
        const jobEstimates = estimates.filter(
          (estimate) => estimate.service_request_id === request.id,
        );

        return (
          <Link
            key={request.id}
            href={`/dashboard/leads/${request.id}`}
            className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4 transition hover:border-[#0F6BFF] hover:bg-blue-50"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-black text-slate-950">
                  {request.appliance_brand || "Appliance"} {request.appliance_type}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {getAppointmentLabel(request)}
                </p>
              </div>
              <StatusPill value={request.status} />
            </div>
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
              {request.issue_description}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
              <span>{getJobAddress(request)}</span>
              <span>Technician: {request.selected_technician_business_name || "Unassigned"}</span>
              <span>{getEstimateBadge(jobEstimates)}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function getAssetDisplayName(asset: CustomerApplianceRow): string {
  return [asset.brand, asset.model_number].filter(Boolean).join(" ") ||
    asset.brand ||
    getAssetPlaceholderLabel(asset.appliance_type);
}

function getAssetStatusLabel(asset: CustomerApplianceRow): string {
  return (asset.asset_status ?? "active").replaceAll("_", " ");
}

function getAssetServiceHistory(
  asset: CustomerApplianceRow,
  requests: ServiceRequestRow[],
) {
  return requests.filter((request) => request.customer_appliance_id === asset.id);
}

function CustomerAssetsWorkspace({
  addresses,
  appliances,
  archivedCount,
  requests,
  coverUrls,
  customerId,
  actionState,
  form,
  isFormOpen,
  showArchived,
  onAdd,
  onCancelForm,
  onFormChange,
  onOpenAsset,
  onSave,
  onShowArchivedChange,
}: {
  addresses: CustomerAddressRow[];
  appliances: CustomerApplianceRow[];
  archivedCount: number;
  requests: ServiceRequestRow[];
  coverUrls: Record<string, string>;
  customerId: string;
  actionState: ActionState;
  form: ApplianceFormState;
  isFormOpen: boolean;
  showArchived: boolean;
  onAdd: () => void;
  onCancelForm: () => void;
  onFormChange: (form: ApplianceFormState) => void;
  onOpenAsset: (assetId: string) => void;
  onSave: () => void;
  onShowArchivedChange: (showArchived: boolean) => void;
}) {
  return (
    <main className="mt-3 grid min-w-0 gap-3">
      <section className="min-w-0 overflow-hidden rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-950">
            {showArchived ? "Archived Assets" : "Assets"} ({appliances.length})
          </h2>
          <div className="flex items-center gap-2">
            {archivedCount > 0 ? (
              <button
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
                onClick={() => onShowArchivedChange(!showArchived)}
                type="button"
              >
                {showArchived ? "Active" : `Archived (${archivedCount})`}
              </button>
            ) : null}
            {!showArchived ? (
              <button
                className="rounded-full bg-[#0F6BFF] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#0057D9]"
                onClick={onAdd}
                type="button"
              >
                + Add Asset
              </button>
            ) : null}
          </div>
        </div>

        {isFormOpen && !showArchived ? (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-[#F8FAFC] p-3">
            <p className="text-sm font-semibold text-slate-950">Add Asset</p>
            <ApplianceEditForm
              actionState={actionState}
              addresses={addresses}
              customerId={customerId}
              form={form}
              onCancel={onCancelForm}
              onChange={onFormChange}
              onSubmit={onSave}
              requests={requests}
            />
          </div>
        ) : null}

        {appliances.length === 0 && !isFormOpen ? (
          <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-[#F8FAFC] p-4 text-center">
            <p className="text-sm font-semibold text-slate-950">
              {showArchived ? "No archived assets" : "No assets yet"}
            </p>
            <p className="mt-1 text-sm leading-5 text-slate-500">
              {showArchived
                ? "Archived assets will appear here while preserving their service history."
                : "Assets can be added manually or identified automatically from model/serial label photos in Jobs."}
            </p>
            {!showArchived ? (
              <button
                className="mt-3 rounded-full bg-[#0F6BFF] px-4 py-2 text-sm font-semibold text-white"
                onClick={onAdd}
                type="button"
              >
                + Add Asset
              </button>
            ) : null}
          </div>
        ) : null}

        {appliances.length > 0 ? (
          <div className="mt-3 divide-y divide-slate-100">
            {appliances.map((asset) => {
              const history = getAssetServiceHistory(asset, requests);
              const lastService = history[0]?.created_at ?? null;
              const coverUrl = asset.cover_photo_id
                ? coverUrls[asset.id] ?? coverUrls[asset.cover_photo_id] ?? null
                : coverUrls[asset.id] ?? null;

              return (
                <button
                  className="grid w-full grid-cols-[54px_minmax(0,1fr)_18px] gap-3 py-3 text-left transition hover:bg-slate-50"
                  key={asset.id}
                  onClick={() => onOpenAsset(asset.id)}
                  type="button"
                >
                  <AssetImage
                    applianceType={asset.appliance_type}
                    className="h-12 w-12 rounded-xl"
                    coverUrl={coverUrl}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-950">
                      {getAssetDisplayName(asset)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">
                      {getAssetPlaceholderLabel(asset.appliance_type)}
                      {asset.customer_address_id
                        ? ` · ${getAssetAddressLabel(asset, addresses)}`
                        : ""}
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {asset.model_number ? `Model: ${asset.model_number}` : ""}
                      {asset.model_number && asset.serial_number ? " · " : ""}
                      {asset.serial_number ? `SN: ${asset.serial_number}` : ""}
                    </span>
                    <span className="mt-2 flex items-center gap-2 text-[11px] font-medium text-slate-500">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                        {getAssetStatusLabel(asset)}
                      </span>
                      <span>
                        {history.length} {history.length === 1 ? "Job" : "Jobs"}
                      </span>
                      {lastService ? <span>Last {formatDate(lastService)}</span> : null}
                    </span>
                  </span>
                  <CustomerOverviewIcon className="mt-4 h-4 w-4 text-slate-400" name="chevron" />
                </button>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function CustomerAssetDetailWorkspace({
  addresses,
  asset,
  assetPhotos,
  assetPhotoUrls,
  coverUrl,
  customerId,
  requests,
  actionState,
  form,
  isEditing,
  onBack,
  onCancelEdit,
  onEdit,
  onFormChange,
  onLifecycleAction,
  onNewJob,
  onSave,
}: {
  addresses: CustomerAddressRow[];
  asset: CustomerApplianceRow;
  assetPhotos: CustomerAppliancePhotoRow[];
  assetPhotoUrls: Record<string, string>;
  coverUrl: string | null;
  customerId: string;
  requests: ServiceRequestRow[];
  actionState: ActionState;
  form: ApplianceFormState;
  isEditing: boolean;
  onBack: () => void;
  onCancelEdit: () => void;
  onEdit: (asset: CustomerApplianceRow) => void;
  onFormChange: (form: ApplianceFormState) => void;
  onLifecycleAction: (
    action: "delete" | "archive" | "restore",
    asset: CustomerApplianceRow,
    linkedJobCount: number,
  ) => void;
  onNewJob: (asset: CustomerApplianceRow) => void;
  onSave: () => void;
}) {
  const history = getAssetServiceHistory(asset, requests);
  const returnTo = `/dashboard/customers/${customerId}?tab=assets&asset=${asset.id}`;
  const labelPhotos = assetPhotos.filter((photo) => photo.photo_type === "asset_label");
  const mainPhotos = assetPhotos.filter((photo) => photo.photo_type === "asset_photo");
  const coverPhoto = mainPhotos.find((photo) => photo.is_cover) ?? mainPhotos[0] ?? null;
  const additionalPhotos = mainPhotos.filter((photo) => photo.id !== coverPhoto?.id);

  return (
    <main className="mt-3 grid min-w-0 gap-3">
      <section className="min-w-0 overflow-hidden rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
        <div className="flex items-center justify-between gap-3">
          <button
            className="flex items-center gap-1 text-sm font-semibold text-[#0F6BFF]"
            onClick={onBack}
            type="button"
          >
            <CustomerOverviewIcon className="h-4 w-4" name="back" />
            Assets
          </button>
          <button
            className="rounded-full bg-[#0F6BFF] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={asset.asset_status === "archived"}
            onClick={() => onNewJob(asset)}
            type="button"
          >
            + New Job
          </button>
          <button
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
            onClick={() => onEdit(asset)}
            type="button"
          >
            Edit
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <AssetImage
            applianceType={asset.appliance_type}
            className="h-16 w-16 shrink-0 rounded-2xl"
            coverUrl={coverUrl}
          />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-950">
              {getAssetDisplayName(asset)}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {getAssetPlaceholderLabel(asset.appliance_type)}
            </p>
            {asset.identity_review_status === "needs_review" ||
            asset.identity_review_status === "unreviewed" ? (
              <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                Needs review
              </span>
            ) : null}
            {asset.asset_status === "archived" ? (
              <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                Archived
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <ActionMessage actionState={actionState} />

      <section className="rounded-[18px] border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-950">Lifecycle</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {asset.asset_status === "archived"
            ? "Restore this asset to use it for new jobs."
            : history.length > 0
              ? "This asset has service history, so it can be archived but not deleted."
              : "This asset has no service history and can be permanently deleted."}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {asset.asset_status === "archived" ? (
            <button
              className="rounded-xl bg-[#0F6BFF] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={actionState.status === "saving"}
              onClick={() => onLifecycleAction("restore", asset, history.length)}
              type="button"
            >
              Restore Asset
            </button>
          ) : history.length > 0 ? (
            <button
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={actionState.status === "saving"}
              onClick={() => onLifecycleAction("archive", asset, history.length)}
              type="button"
            >
              Archive Asset
            </button>
          ) : (
            <button
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={actionState.status === "saving"}
              onClick={() => onLifecycleAction("delete", asset, history.length)}
              type="button"
            >
              Delete Asset
            </button>
          )}
        </div>
      </section>

      {isEditing ? (
        <section className="min-w-0 overflow-hidden rounded-[18px] border border-slate-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-950">Edit Asset</p>
          <ApplianceEditForm
            actionState={actionState}
            addresses={addresses}
            assetPhotoUrls={assetPhotoUrls}
            existingAdditionalPhotos={additionalPhotos}
            existingLabelPhotos={labelPhotos}
            existingMainPhoto={coverPhoto}
            customerId={customerId}
            form={form}
            onCancel={onCancelEdit}
            onChange={onFormChange}
            onSubmit={onSave}
            requests={requests}
          />
        </section>
      ) : null}

      <section className="rounded-[18px] border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-950">Identity</h3>
        <div className="mt-2 divide-y divide-slate-200 border-t border-slate-200 text-sm">
          <AssetDetailInfoRow
            icon="status"
            label="Brand"
            value={asset.brand || "Not saved"}
          />
          <AssetDetailInfoRow
            icon="tool"
            label="Type"
            value={getAssetPlaceholderLabel(asset.appliance_type)}
          />
          <AssetDetailInfoRow
            icon="briefcase"
            label="Model"
            value={asset.model_number || "Not saved"}
          />
          <AssetDetailInfoRow
            icon="calendar"
            label="Serial"
            value={asset.serial_number || "Not saved"}
          />
        </div>

        <h3 className="mt-4 text-sm font-semibold text-slate-950">Location</h3>
        <div className="mt-2 divide-y divide-slate-200 border-t border-slate-200 text-sm">
          <AssetDetailInfoRow
            icon="pin"
            label="Address"
            value={getAssetAddressLabel(asset, addresses)}
          />
          {asset.location_label ? (
            <AssetDetailInfoRow
              icon="map"
              label="Area / Room"
              value={asset.location_label}
            />
          ) : null}
        </div>

        <h3 className="mt-4 text-sm font-semibold text-slate-950">Status</h3>
        <div className="mt-2 border-y border-slate-200 text-sm">
          <AssetDetailInfoRow
            icon="status"
            label="Status"
            value={
              <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold capitalize text-emerald-800">
                {getAssetStatusLabel(asset)}
              </span>
            }
          />
        </div>
      </section>

      <section className="rounded-[18px] border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-950">Photo</h3>
        <AssetImage
          applianceType={asset.appliance_type}
          className="mt-3 aspect-[4/3] w-full rounded-2xl"
          coverUrl={coverUrl}
        />
      </section>

      {labelPhotos.length > 0 ? (
        <section className="rounded-[18px] border border-slate-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-slate-950">Label Photo</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {labelPhotos.slice(0, 2).map((photo) => (
              <PhotoPreviewCard
                alt="Asset label photo"
                key={photo.id}
                label="Model / serial label"
                src={assetPhotoUrls[photo.id] ?? null}
              />
            ))}
          </div>
        </section>
      ) : null}

      {additionalPhotos.length > 0 ? (
        <section className="rounded-[18px] border border-slate-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-slate-950">Additional Photos</h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {additionalPhotos.slice(0, 6).map((photo) => (
              <PhotoPreviewCard
                alt="Asset photo"
                key={photo.id}
                label="Asset photo"
                src={assetPhotoUrls[photo.id] ?? null}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[18px] border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-semibold text-slate-950">
          Service History ({history.length})
        </h3>
        {history.length > 0 ? (
          <div className="mt-2 divide-y divide-slate-100">
            {history.map((request) => (
              <Link
                className="grid grid-cols-[minmax(0,1fr)_18px] gap-3 py-3 text-sm transition hover:text-[#0F6BFF]"
                href={`/dashboard/leads/${request.id}?returnTo=${encodeURIComponent(returnTo)}`}
                key={request.id}
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-950">
                    Job #{getShortJobNumber(request)}
                  </span>
                  <span className="mt-0.5 block truncate text-slate-500">
                    {getCustomerJobTitle(request)}
                    {request.issue_description ? ` · ${request.issue_description}` : ""}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {formatDate(request.created_at)} · {request.status.replaceAll("_", " ")}
                  </span>
                </span>
                <CustomerOverviewIcon className="mt-4 h-4 w-4 text-slate-400" name="chevron" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No linked jobs yet.</p>
        )}
      </section>
    </main>
  );
}

function PhotoPreviewCard({
  alt,
  label,
  src,
}: {
  alt: string;
  label: string;
  src: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={alt} className="aspect-[4/3] w-full object-cover" src={src} />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-slate-100 text-xs font-medium text-slate-400">
          No photo
        </div>
      )}
      <p className="truncate px-2 py-1.5 text-xs font-medium text-slate-600">{label}</p>
    </div>
  );
}

function AssetDetailInfoRow({
  icon,
  label,
  value,
}: {
  icon: CustomerOverviewIconName;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[32px_110px_minmax(0,1fr)] items-center gap-2 py-3">
      <CustomerOverviewIcon className="h-5 w-5 text-slate-500" name={icon} />
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className="min-w-0 text-sm font-medium text-slate-950">{value}</span>
    </div>
  );
}

function ApplianceList({
  appliances,
  requests,
  onEdit,
}: {
  appliances: CustomerApplianceRow[];
  requests: ServiceRequestRow[];
  onEdit: (appliance: CustomerApplianceRow) => void;
}) {
  if (appliances.length === 0) {
    return <EmptyMessage>No appliances saved yet.</EmptyMessage>;
  }

  return (
    <div className="grid gap-3">
      {appliances.map((appliance) => {
        const repairHistory = requests.filter(
          (request) => request.customer_appliance_id === appliance.id,
        );

        return (
          <details
            key={appliance.id}
            className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4 open:bg-white"
          >
            <summary className="cursor-pointer list-none">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <AssetImage
                    applianceType={appliance.appliance_type}
                    className="h-12 w-12 shrink-0 rounded-xl"
                  />
                  <div className="min-w-0">
                  <p className="font-black text-slate-950">
                    {appliance.brand || "Brand not saved"} {appliance.appliance_type}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {appliance.location_label || "Location not saved"}
                  </p>
                  </div>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">
                  Open details
                </span>
              </div>
            </summary>
            <div className="mt-4 grid gap-2 text-sm text-slate-700">
              <ProfileRow label="Model" value={appliance.model_number || "Not saved"} />
              <ProfileRow label="Serial" value={appliance.serial_number || "Not saved"} />
              <ProfileRow
                label="Purchase year"
                value={appliance.purchase_year ? appliance.purchase_year.toString() : "Not saved"}
              />
              <ProfileRow label="Notes" value={appliance.notes || "No appliance notes"} />
              <button
                className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-black text-[#0F6BFF] transition hover:bg-blue-100"
                onClick={() => onEdit(appliance)}
                type="button"
              >
                Edit appliance
              </button>
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-500">
                  Repair history
                </p>
                {repairHistory.length > 0 ? (
                  <div className="mt-2 grid gap-2">
                    {repairHistory.map((request) => (
                      <Link
                        key={request.id}
                        href={`/dashboard/leads/${request.id}`}
                        className="text-sm font-bold text-[#0F6BFF]"
                      >
                        {formatDate(request.created_at)} · {request.status.replaceAll("_", " ")}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">No repair history yet.</p>
                )}
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}

function ApplianceEditForm({
  addresses,
  assetPhotoUrls = {},
  customerId,
  existingAdditionalPhotos = [],
  existingLabelPhotos = [],
  existingMainPhoto = null,
  form,
  onChange,
  onSubmit,
  onCancel,
  actionState,
  requests,
}: {
  addresses: CustomerAddressRow[];
  assetPhotoUrls?: Record<string, string>;
  customerId: string;
  existingAdditionalPhotos?: CustomerAppliancePhotoRow[];
  existingLabelPhotos?: CustomerAppliancePhotoRow[];
  existingMainPhoto?: CustomerAppliancePhotoRow | null;
  form: ApplianceFormState;
  onChange: (form: ApplianceFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  actionState: ActionState;
  requests: ServiceRequestRow[];
}) {
  const [entryMode, setEntryMode] = useState<"scan" | "manual">(
    form.id ? "manual" : "scan",
  );
  const [scanState, setScanState] = useState<AssetPhotoScanState>({
    status: "idle",
    message: null,
  });
  const [labelPreviewUrl, setLabelPreviewUrl] = useState<string | null>(null);
  const [mainPreviewUrl, setMainPreviewUrl] = useState<string | null>(null);
  const [additionalPreviewUrls, setAdditionalPreviewUrls] = useState<string[]>([]);
  const update = <Key extends keyof ApplianceFormState>(
    key: Key,
    value: ApplianceFormState[Key],
  ) => onChange({ ...form, [key]: value });
  const locationOptions = buildAssetLocationOptions({ addresses, requests });
  const isCustomAssetType = form.applianceTypeMode === "custom";
  const assetTypeSelectValue = isCustomAssetType
    ? CUSTOM_ASSET_TYPE_VALUE
    : form.applianceType;
  const isCustomArea = form.locationLabelMode === "custom";
  const areaSelectValue = isCustomArea
    ? CUSTOM_ASSET_AREA_VALUE
    : form.locationLabel;

  async function scanAssetPhoto(file: File | null | undefined) {
    if (!file) {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setScanState({ status: "error", message: "Asset scanning is not configured." });
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setScanState({ status: "error", message: "A logged-in dashboard session is required." });
      return;
    }

    if (labelPreviewUrl) {
      URL.revokeObjectURL(labelPreviewUrl);
    }
    setLabelPreviewUrl(URL.createObjectURL(file));
    setScanState({ status: "processing", message: "Analyzing photo..." });

    const body = new FormData();
    body.set("photo", file);
    body.set("photoType", "asset_label");

    const response = await fetch(
      `/api/customers/${encodeURIComponent(customerId)}/asset-intelligence`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body,
      },
    );
    const data = (await response.json().catch(() => null)) as unknown;

    if (!response.ok || !data || typeof data !== "object") {
      setScanState({
        status: "error",
        message:
          readRecordString(data, "message") ??
          "Asset photo saved, but identification is temporarily unavailable.",
      });
      setEntryMode("manual");
      return;
    }

    const identity = readRecordObject(data, "identity");
    const photoId = readRecordString(data, "photoId");
    const nextApplianceType = readRecordString(identity, "applianceType");
    const nextBrand = readRecordString(identity, "brand");
    const nextModel = readRecordString(identity, "modelNumber");
    const nextSerial = readRecordString(identity, "serialNumber");
    const nextTypeKnown = nextApplianceType
      ? ADD_ASSET_TYPE_OPTIONS.some((option) => option.value === nextApplianceType)
      : false;

    onChange({
      ...form,
      applianceType: nextApplianceType ?? form.applianceType,
      applianceTypeMode: nextApplianceType && !nextTypeKnown ? "custom" : form.applianceTypeMode,
      brand: nextBrand ?? form.brand,
      modelNumber: nextModel ?? form.modelNumber,
      serialNumber: nextSerial ?? form.serialNumber,
      assetPhotoId: photoId ?? form.assetPhotoId,
      labelPhotoId: photoId ?? form.labelPhotoId,
    });

    setEntryMode("manual");
    setScanState({
      status: "success",
      message:
        readRecordString(data, "message") ??
        "AI detected — please verify.",
    });
  }

  async function uploadAssetPhoto({
    file,
    role,
  }: {
    file: File | null | undefined;
    role: "main" | "additional";
  }) {
    if (!file) {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setScanState({ status: "error", message: "Asset photo upload is not configured." });
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setScanState({ status: "error", message: "A logged-in dashboard session is required." });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    if (role === "main") {
      if (mainPreviewUrl) URL.revokeObjectURL(mainPreviewUrl);
      setMainPreviewUrl(previewUrl);
    } else {
      setAdditionalPreviewUrls((urls) => [...urls, previewUrl]);
    }

    setScanState({ status: "processing", message: "Uploading photo..." });

    const body = new FormData();
    body.set("photo", file);
    body.set("photoType", "asset_photo");

    const response = await fetch(
      `/api/customers/${encodeURIComponent(customerId)}/asset-intelligence`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body,
      },
    );
    const data = (await response.json().catch(() => null)) as unknown;

    if (!response.ok || !data || typeof data !== "object") {
      setScanState({
        status: "error",
        message: readRecordString(data, "message") ?? "Asset photo could not be uploaded.",
      });
      return;
    }

    const photoId = readRecordString(data, "photoId");

    if (!photoId) {
      setScanState({ status: "error", message: "Asset photo could not be saved." });
      return;
    }

    onChange(
      role === "main"
        ? { ...form, mainPhotoId: photoId }
        : { ...form, additionalPhotoIds: [...form.additionalPhotoIds, photoId] },
    );
    setScanState({
      status: "success",
      message: role === "main" ? "Main photo ready." : "Additional photo ready.",
    });
  }

  return (
    <div className="mt-3 grid min-w-0 gap-3">
      {!form.id ? (
        <div className="grid gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0F6BFF]">
            Add Asset
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`rounded-xl px-3 py-2 text-center text-xs font-semibold ring-1 ring-blue-100 ${
                entryMode === "scan" ? "bg-[#0F6BFF] text-white" : "bg-white text-slate-700"
              }`}
              onClick={() => setEntryMode("scan")}
              type="button"
            >
              Scan Label Photo
            </button>
            <button
              className={`rounded-xl px-3 py-2 text-center text-xs font-semibold ring-1 ring-blue-100 ${
                entryMode === "manual" ? "bg-[#0F6BFF] text-white" : "bg-white text-slate-700"
              }`}
              onClick={() => setEntryMode("manual")}
              type="button"
            >
              Enter Manually
            </button>
          </div>
          {entryMode === "scan" ? (
            <div className="grid gap-2">
              <PhotoPreviewCard
                alt="Selected asset label"
                label="Label photo"
                src={labelPreviewUrl ?? assetPhotoUrls[existingLabelPhotos[0]?.id ?? ""] ?? null}
              />
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-blue-200 bg-white px-3 py-4 text-center text-sm font-semibold text-[#0F6BFF] transition hover:bg-blue-50">
                {scanState.status === "processing" ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-[#0F6BFF]" />
                    Analyzing photo...
                  </span>
                ) : (
                  "Choose Label Photo"
                )}
                <input
                  accept="image/*"
                  className="sr-only"
                  disabled={scanState.status === "processing"}
                  onChange={(event) => {
                    void scanAssetPhoto(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                  type="file"
                />
              </label>
              <p className="text-xs leading-5 text-slate-600">
                Scan the model/serial label, then compare it with the detected fields below.
              </p>
            </div>
          ) : null}
          {scanState.message ? (
            <p
              className={`text-xs leading-5 ${
                scanState.status === "error"
                  ? "text-red-700"
                  : scanState.status === "success"
                    ? "text-emerald-700"
                    : "text-slate-600"
              }`}
            >
              {scanState.message}
            </p>
          ) : null}
          {form.assetPhotoId ? (
            <p className="text-xs font-medium text-slate-600">
              Label photo will be attached when this asset is saved.
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Main Photo</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Normal equipment photo used for the Asset card and detail image.
          </p>
        </div>
        <PhotoPreviewCard
          alt="Main asset photo"
          label="Main asset photo"
          src={mainPreviewUrl ?? assetPhotoUrls[existingMainPhoto?.id ?? ""] ?? null}
        />
        <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-[#0F6BFF] transition hover:bg-blue-50">
          Select Main Photo
          <input
            accept="image/*"
            className="sr-only"
            disabled={scanState.status === "processing"}
            onChange={(event) => {
              void uploadAssetPhoto({ file: event.target.files?.[0], role: "main" });
              event.target.value = "";
            }}
            type="file"
          />
        </label>
      </div>
      {(labelPreviewUrl || existingLabelPhotos.length > 0) ? (
        <div className="grid gap-3 rounded-xl border border-amber-100 bg-amber-50 p-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <PhotoPreviewCard
            alt="Asset label comparison"
            label="Label reference"
            src={labelPreviewUrl ?? assetPhotoUrls[existingLabelPhotos[0]?.id ?? ""] ?? null}
          />
          <div className="text-xs leading-5 text-amber-800">
            <p className="font-semibold text-amber-950">
              {scanState.status === "success" ? "AI detected — please verify" : "Compare label to fields"}
            </p>
            <p className="mt-1">
              Keep the photo nearby while checking Type, Brand, Model, and Serial.
            </p>
          </div>
        </div>
      ) : null}
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <label className="grid min-w-0 gap-2 text-sm font-medium text-slate-700">
          Asset type
          <select
            className="min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-950 outline-none transition focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
            onChange={(event) => {
              const nextValue = event.target.value;

              if (nextValue === CUSTOM_ASSET_TYPE_VALUE) {
                onChange({
                  ...form,
                  applianceTypeMode: "custom",
                });
                return;
              }

              onChange({
                ...form,
                applianceType: nextValue,
                applianceTypeMode: "preset",
              });
            }}
            value={assetTypeSelectValue}
          >
            <option value="">Select asset type</option>
            {ADD_ASSET_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            <option value={CUSTOM_ASSET_TYPE_VALUE}>Other / Custom</option>
          </select>
        </label>
        {assetTypeSelectValue === CUSTOM_ASSET_TYPE_VALUE ? (
          <TextInput
            label="Custom asset type"
            value={form.applianceType}
            onChange={(value) => update("applianceType", value)}
          />
        ) : null}
        <TextInput label="Brand" value={form.brand} onChange={(value) => update("brand", value)} />
        <TextInput label="Model" value={form.modelNumber} onChange={(value) => update("modelNumber", value)} />
        <TextInput label="Serial" value={form.serialNumber} onChange={(value) => update("serialNumber", value)} />
        <label className="grid min-w-0 gap-2 text-sm font-medium text-slate-700">
          Physical location
          <select
            className="min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-950 outline-none transition focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
            onChange={(event) => update("customerAddressId", event.target.value)}
            value={form.customerAddressId}
          >
            <option value="">Select customer address</option>
            {locationOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label} — {option.sourceLabel}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-2 text-sm font-medium text-slate-700">
          Area / placement
          <select
            className="min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-950 outline-none transition focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
            onChange={(event) => {
              const nextValue = event.target.value;

              if (nextValue === CUSTOM_ASSET_AREA_VALUE) {
                onChange({
                  ...form,
                  locationLabelMode: "custom",
                });
                return;
              }

              onChange({
                ...form,
                locationLabel: nextValue,
                locationLabelMode: "preset",
              });
            }}
            value={areaSelectValue}
          >
            <option value="">Select area</option>
            {ADD_ASSET_AREA_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value={CUSTOM_ASSET_AREA_VALUE}>Other / Custom</option>
          </select>
        </label>
        {areaSelectValue === CUSTOM_ASSET_AREA_VALUE ? (
          <TextInput
            label="Custom area / placement"
            value={form.locationLabel}
            onChange={(value) => update("locationLabel", value)}
          />
        ) : null}
      </div>
      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Additional Photos</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Optional normal equipment photos. These are not sent through Vision.
          </p>
        </div>
        {[...existingAdditionalPhotos.map((photo) => assetPhotoUrls[photo.id] ?? null), ...additionalPreviewUrls]
          .filter((url): url is string => Boolean(url))
          .length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {[...existingAdditionalPhotos.map((photo) => assetPhotoUrls[photo.id] ?? null), ...additionalPreviewUrls]
              .filter((url): url is string => Boolean(url))
              .slice(0, 6)
              .map((url, index) => (
                <PhotoPreviewCard
                  alt="Additional asset photo"
                  key={`${url}-${index}`}
                  label="Asset photo"
                  src={url}
                />
              ))}
          </div>
        ) : null}
        <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-[#0F6BFF] transition hover:bg-blue-50">
          Add Photo
          <input
            accept="image/*"
            className="sr-only"
            disabled={scanState.status === "processing"}
            onChange={(event) => {
              void uploadAssetPhoto({ file: event.target.files?.[0], role: "additional" });
              event.target.value = "";
            }}
            type="file"
          />
        </label>
      </div>
      <ActionMessage actionState={actionState} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          className="rounded-xl bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={actionState.status === "saving"}
          onClick={onSubmit}
          type="button"
        >
          {actionState.status === "saving" ? "Saving..." : form.id ? "Save Appliance" : "Add Appliance"}
        </button>
        {form.id ? (
          <button
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
            onClick={onCancel}
            type="button"
          >
            Cancel edit
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EstimateList({
  estimates,
  serviceRequests,
}: {
  estimates: ServiceRequestEstimateRow[];
  serviceRequests: ServiceRequestRow[];
}) {
  if (estimates.length === 0) {
    return <EmptyMessage>No estimates linked yet.</EmptyMessage>;
  }

  return (
    <div className="grid gap-3">
      {estimates.map((estimate) => {
        const request = serviceRequests.find(
          (serviceRequest) => serviceRequest.id === estimate.service_request_id,
        );

        return (
          <Link
            key={estimate.id}
            href={`/dashboard/leads/${estimate.service_request_id}`}
            className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4 transition hover:border-[#0F6BFF] hover:bg-blue-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-slate-950">
                  {estimate.estimate_number || `Estimate ${estimate.id.slice(0, 8)}`}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {request?.appliance_type || "Linked job"} · {formatDate(estimate.created_at)}
                </p>
              </div>
              <StatusPill value={estimate.estimate_status} />
            </div>
            <p className="mt-3 text-lg font-black text-slate-950">
              {formatMoney(estimate.total)}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

function InvoiceList({
  invoices,
  serviceRequests,
}: {
  invoices: ServiceRequestInvoiceRow[];
  serviceRequests: ServiceRequestRow[];
}) {
  if (invoices.length === 0) {
    return <EmptyMessage>No invoices linked yet. Payments remain a future workflow.</EmptyMessage>;
  }

  return (
    <div className="grid gap-3">
      {invoices.map((invoice) => {
        const request = serviceRequests.find(
          (serviceRequest) => serviceRequest.id === invoice.service_request_id,
        );

        return (
          <Link
            key={invoice.id}
            href={`/dashboard/leads/${invoice.service_request_id}`}
            className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4 transition hover:border-[#0F6BFF] hover:bg-blue-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-slate-950">{invoice.invoice_number}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {request?.appliance_type || "Linked job"} · {formatDate(invoice.created_at)}
                </p>
              </div>
              <StatusPill value={invoice.invoice_status} />
            </div>
            <p className="mt-3 text-lg font-black text-slate-950">
              {formatMoney(invoice.total)}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

function ConversationList({ conversations }: { conversations: CommunicationConversationRow[] }) {
  if (conversations.length === 0) {
    return <EmptyMessage>No communication history linked yet.</EmptyMessage>;
  }

  return (
    <div className="grid gap-3">
      {conversations.map((conversation) => (
        <Link
          key={conversation.id}
          href="/dashboard/communications"
          className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4 transition hover:border-[#0F6BFF] hover:bg-blue-50"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-black text-slate-950">
                {conversation.primary_source_type.replaceAll("_", " ")} ·{" "}
                {conversation.provider_name || "WRA"}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {formatDateTime(conversation.last_event_at ?? conversation.created_at)}
              </p>
            </div>
            <StatusPill value={conversation.status} />
          </div>
          <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
            {conversation.summary || conversation.next_action || "Conversation captured."}
          </p>
          {conversation.intake_request_id ? (
            <p className="mt-2 text-xs font-bold text-emerald-700">Intake linked</p>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

function CustomerNotesPanel({
  customerNotes,
  jobNotes,
  serviceRequests,
  noteBody,
  onNoteBodyChange,
  onSubmit,
  actionState,
}: {
  customerNotes: CustomerInternalNoteRow[];
  jobNotes: ServiceRequestNoteRow[];
  serviceRequests: ServiceRequestRow[];
  noteBody: string;
  onNoteBodyChange: (value: string) => void;
  onSubmit: () => void;
  actionState: ActionState;
}) {
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4">
        <label className="grid gap-2 text-sm font-bold text-slate-700">
          Add customer note
          <textarea
            className="min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
            onChange={(event) => onNoteBodyChange(event.target.value)}
            placeholder="Preference, gate code, parking, contact rules, repeat-customer context..."
            value={noteBody}
          />
        </label>
        <div className="mt-3 grid gap-2">
          <ActionMessage actionState={actionState} />
          <button
            className="rounded-xl bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={actionState.status === "saving"}
            onClick={onSubmit}
            type="button"
          >
            {actionState.status === "saving" ? "Saving..." : "Add Customer Note"}
          </button>
        </div>
      </div>

      <div className="grid gap-3">
        {customerNotes.length > 0 ? (
          customerNotes.map((note) => (
            <div key={note.id} className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-black text-slate-950">{note.note_type.replaceAll("_", " ")}</p>
                <span className="text-xs font-bold text-slate-500">
                  {formatDate(note.created_at)}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{note.body}</p>
            </div>
          ))
        ) : (
          <EmptyMessage>No customer-level notes yet.</EmptyMessage>
        )}
      </div>

      <div>
        <h3 className="text-sm font-black uppercase tracking-[0.12em] text-slate-500">
          Job notes
        </h3>
        <div className="mt-3">
          <NotesList notes={jobNotes} serviceRequests={serviceRequests} />
        </div>
      </div>
    </div>
  );
}

function NotesList({
  notes,
  serviceRequests,
}: {
  notes: ServiceRequestNoteRow[];
  serviceRequests: ServiceRequestRow[];
}) {
  if (notes.length === 0) {
    return <EmptyMessage>No internal notes linked yet.</EmptyMessage>;
  }

  return (
    <div className="grid gap-3">
      {notes.map((note) => {
        const request = serviceRequests.find(
          (serviceRequest) => serviceRequest.id === note.service_request_id,
        );

        return (
          <Link
            key={note.id}
            href={`/dashboard/leads/${note.service_request_id}`}
            className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4 transition hover:border-[#0F6BFF] hover:bg-blue-50"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-black text-slate-950">{note.note_type.replaceAll("_", " ")}</p>
              <span className="text-xs font-bold text-slate-500">
                {formatDate(note.created_at)}
              </span>
            </div>
            <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{note.body}</p>
            <p className="mt-2 text-xs font-bold text-slate-500">
              Job: {request?.appliance_type || "Open job"}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

function TimelineList({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <EmptyMessage>No customer timeline events yet.</EmptyMessage>;
  }

  return (
    <ol className="grid gap-3">
      {items.map((item) => {
        const content = (
          <div className="rounded-2xl border border-slate-200 bg-[#F7F9FC] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-black text-slate-950">{item.title}</p>
                {item.body ? (
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
                    {item.body}
                  </p>
                ) : null}
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">
                {formatDateTime(item.at)}
              </span>
            </div>
          </div>
        );

        return (
          <li key={item.id}>
            {item.href ? (
              <Link href={item.href} className="block transition hover:opacity-90">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}

function EmptyMessage({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 bg-[#F7F9FC] p-4 text-sm text-slate-600">
      {children}
    </p>
  );
}

function buildCustomerTimeline(state: Extract<CustomerDetailState, { status: "ready" }>) {
  const items: TimelineItem[] = [
    {
      id: `customer-${state.customer?.id}`,
      at: state.customer?.created_at ?? new Date().toISOString(),
      title: "Customer profile created",
      body: "Customer record became available in WRA.",
      category: "job",
    },
  ];

  for (const conversation of state.conversations) {
    items.push({
      id: `conversation-${conversation.id}`,
      at: conversation.call_started_at ?? conversation.last_event_at ?? conversation.created_at,
      title: conversation.primary_source_type === "phone" ? "Incoming call" : "Customer contact",
      body: conversation.summary ?? conversation.next_action,
      category: "call",
      href: "/dashboard/communications",
    });
  }

  for (const event of state.communicationEvents) {
    items.push({
      id: `communication-event-${event.id}`,
      at: event.event_time,
      title: event.title,
      body: event.body,
      category: "call",
      href: "/dashboard/communications",
    });
  }

  for (const request of state.serviceRequests) {
    items.push({
      id: `job-${request.id}`,
      at: request.created_at,
      title: "Job created",
      body: `${request.appliance_brand || ""} ${request.appliance_type}: ${
        request.issue_description
      }`.trim(),
      category: "job",
      href: `/dashboard/leads/${request.id}`,
    });

    if (CLOSED_JOB_STATUSES.has(request.status)) {
      items.push({
        id: `job-closed-${request.id}`,
        at: request.updated_at ?? request.created_at,
        title: "Repair completed or closed",
        body: request.status.replaceAll("_", " "),
        category: "repair",
        href: `/dashboard/leads/${request.id}`,
      });
    }
  }

  for (const estimate of state.estimates) {
    if (estimate.sent_at) {
      items.push({
        id: `estimate-sent-${estimate.id}`,
        at: estimate.sent_at,
        title: "Estimate sent",
        body: `${estimate.estimate_number || "Estimate"} · ${formatMoney(estimate.total)}`,
        category: "estimate",
        href: `/dashboard/leads/${estimate.service_request_id}`,
      });
    }

    if (estimate.customer_responded_at) {
      items.push({
        id: `estimate-response-${estimate.id}`,
        at: estimate.customer_responded_at,
        title:
          estimate.estimate_status === "approved"
            ? "Estimate approved"
            : "Estimate response received",
        body: `${estimate.estimate_number || "Estimate"} · ${estimate.estimate_status}`,
        category: "estimate",
        href: `/dashboard/leads/${estimate.service_request_id}`,
      });
    }
  }

  for (const invoice of state.invoices) {
    if (invoice.sent_at) {
      items.push({
        id: `invoice-sent-${invoice.id}`,
        at: invoice.sent_at,
        title: "Invoice sent",
        body: `${invoice.invoice_number} · ${formatMoney(invoice.total)}`,
        category: "invoice",
        href: `/dashboard/leads/${invoice.service_request_id}`,
      });
    }

    if (invoice.paid_at) {
      items.push({
        id: `invoice-paid-${invoice.id}`,
        at: invoice.paid_at,
        title: "Payment received",
        body: `${invoice.invoice_number} · ${formatMoney(invoice.total)}`,
        category: "payment",
        href: `/dashboard/leads/${invoice.service_request_id}`,
      });
    }
  }

  for (const note of state.notes) {
    items.push({
      id: `note-${note.id}`,
      at: note.created_at,
      title: "Internal note added",
      body: note.body,
      category: "note",
      href: `/dashboard/leads/${note.service_request_id}`,
    });
  }

  for (const note of state.customerNotes) {
    items.push({
      id: `customer-note-${note.id}`,
      at: note.created_at,
      title: "Customer note added",
      body: note.body,
      category: "note",
    });
  }

  return items.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}
