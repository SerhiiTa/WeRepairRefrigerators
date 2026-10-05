"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
import type { TelnyxRTC as TelnyxRTCClass } from "@telnyx/webrtc";
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
type ServiceRequestAttachmentRow =
  PublicSchema["Tables"]["service_request_attachments"]["Row"];
type ServiceRequestFinancialSnapshotRow =
  PublicSchema["Tables"]["service_request_financial_snapshots"]["Row"];
type ServiceRequestPaymentRow =
  PublicSchema["Tables"]["service_request_payments"]["Row"];
type ServiceRequestPhotoRow =
  PublicSchema["Tables"]["service_request_photos"]["Row"];

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
      payments: ServiceRequestPaymentRow[];
      financialSnapshots: ServiceRequestFinancialSnapshotRow[];
      servicePhotos: ServiceRequestPhotoRow[];
      servicePhotoUrls: Record<string, string>;
      attachments: ServiceRequestAttachmentRow[];
      attachmentUrls: Record<string, string>;
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

type CustomerDesktopFinancialDetail =
  | { type: "estimate"; estimate: ServiceRequestEstimateRow }
  | { type: "invoice"; invoice: ServiceRequestInvoiceRow }
  | { type: "payment"; payment: ServiceRequestPaymentRow }
  | null;

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

type CustomerAddressFormState = {
  id: string | null;
  label: string;
  streetAddress: string;
  unit: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
  isPrimary: boolean;
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
type CustomerWorkspaceTab = "overview" | "jobs" | "assets" | "more" | "activity";
type CustomerJobsFilter = "all" | "open" | "completed";
type CustomerDesktopTab =
  | "overview"
  | "serviceHistory"
  | "estimates"
  | "invoices"
  | "payments"
  | "notes"
  | "documents"
  | "communication";
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

const CUSTOMER_ADDRESS_TYPE_OPTIONS = [
  "Home",
  "Rental Property",
  "Vacation Home",
  "Business",
  "Other",
] as const;

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

const emptyCustomerAddressForm: CustomerAddressFormState = {
  id: null,
  label: "Home",
  streetAddress: "",
  unit: "",
  city: "",
  state: "TX",
  zipCode: "",
  country: "US",
  latitude: null,
  longitude: null,
  placeId: null,
  isPrimary: false,
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

function CustomerDesktopWorkspace({
  activeTab,
  addresses,
  appliances,
  attachmentAction,
  attachments,
  attachmentUrls,
  conversations,
  communicationEvents,
  customer,
  customerNotes,
  estimates,
  financialSnapshots,
  invoices,
  notes,
  onAddNote,
  onCallCustomer,
  onEditCustomer,
  onNewJob,
  onOpenActions,
  onOpenAssets,
  onSelectJob,
  onTabChange,
  onUploadFiles,
  payments,
  returnTo,
  selectedJobId,
  servicePhotoUrls,
  servicePhotos,
  serviceRequests,
}: {
  activeTab: CustomerDesktopTab;
  addresses: CustomerAddressRow[];
  appliances: CustomerApplianceRow[];
  attachmentAction: ActionState;
  attachments: ServiceRequestAttachmentRow[];
  attachmentUrls: Record<string, string>;
  conversations: CommunicationConversationRow[];
  communicationEvents: CommunicationTimelineEventRow[];
  customer: CustomerRow;
  customerNotes: CustomerInternalNoteRow[];
  estimates: ServiceRequestEstimateRow[];
  financialSnapshots: ServiceRequestFinancialSnapshotRow[];
  invoices: ServiceRequestInvoiceRow[];
  notes: ServiceRequestNoteRow[];
  onAddNote: () => void;
  onCallCustomer: () => void;
  onEditCustomer: () => void;
  onNewJob: () => void;
  onOpenActions: () => void;
  onOpenAssets: () => void;
  onSelectJob: (jobId: string) => void;
  onTabChange: (tab: CustomerDesktopTab) => void;
  onUploadFiles: (requestId: string | null, files: FileList | null) => void;
  payments: ServiceRequestPaymentRow[];
  returnTo: string;
  selectedJobId: string | null;
  servicePhotoUrls: Record<string, string>;
  servicePhotos: ServiceRequestPhotoRow[];
  serviceRequests: ServiceRequestRow[];
}) {
  const [financialDetail, setFinancialDetail] =
    useState<CustomerDesktopFinancialDetail>(null);
  const primaryAddress = getCustomerPrimaryAddress(addresses);
  const selectedJob =
    serviceRequests.find((request) => request.id === selectedJobId) ?? serviceRequests[0] ?? null;
  const selectedJobEstimates = selectedJob
    ? estimates.filter((estimate) => estimate.service_request_id === selectedJob.id)
    : [];
  const selectedJobInvoices = selectedJob
    ? invoices.filter((invoice) => invoice.service_request_id === selectedJob.id)
    : [];
  const selectedJobPayments = selectedJob
    ? payments.filter((payment) => payment.service_request_id === selectedJob.id)
    : [];
  const selectedJobPhotos = selectedJob
    ? servicePhotos.filter((photo) => photo.service_request_id === selectedJob.id)
    : [];
  const selectedJobAttachments = selectedJob
    ? attachments.filter((attachment) => attachment.service_request_id === selectedJob.id)
    : [];
  const selectedJobNotes = selectedJob
    ? notes.filter((note) => note.service_request_id === selectedJob.id)
    : [];
  const totalSpent = calculateCustomerTotalSpent({ invoices, payments });
  const customerSince = getCustomerSinceLabel(customer, serviceRequests);
  const customerType = readRecordString(customer.import_metadata, "customer_type") ?? "Customer";
  const isWorkizCustomer = customer.source_system === "workiz";
  const tabs: { id: CustomerDesktopTab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "serviceHistory", label: "Service History" },
    { id: "estimates", label: "Estimates", count: estimates.length },
    { id: "invoices", label: "Invoices", count: invoices.length },
    { id: "payments", label: "Payments", count: payments.length },
    { id: "notes", label: "Notes", count: customerNotes.length + notes.length },
    { id: "documents", label: "Documents", count: attachments.length + servicePhotos.length },
    { id: "communication", label: "Communication", count: conversations.length },
  ];

  return (
    <div className="dashboard-customer-detail-full-width w-full px-5 pb-6 pt-3 xl:px-6 2xl:px-8">
      <div className="mb-2 flex items-center justify-between gap-4">
        <Link className="inline-flex items-center gap-2 text-sm font-semibold text-[#0F6BFF]" href={returnTo}>
          <CustomerOverviewIcon className="h-4 w-4" name="back" />
          Back to customers
        </Link>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg bg-[#0F6BFF] px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-[#0057D9]"
            onClick={onEditCustomer}
            type="button"
          >
            Edit Customer
          </button>
          <button
            aria-label="More customer actions"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
            onClick={onOpenActions}
            type="button"
          >
            <CustomerOverviewIcon className="h-4 w-4" name="more" />
          </button>
        </div>
      </div>

      <section className="grid items-center gap-5 border-b border-slate-200 pb-3 xl:grid-cols-[minmax(0,1fr)_520px]">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-200 text-2xl font-black text-slate-900">
              {getCustomerInitials(customer)}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-3xl font-black tracking-[-0.01em] text-slate-950">
                {getCustomerName(customer)}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusPill value={customer.customer_status} />
                {isWorkizCustomer ? <WorkizBadge /> : null}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm font-semibold text-slate-700">
            <button
              className="inline-flex items-center gap-2 text-left transition hover:text-[#0F6BFF]"
              disabled={!customer.phone}
              onClick={customer.phone ? onCallCustomer : undefined}
              type="button"
            >
              <CustomerOverviewIcon className="h-4 w-4 text-[#0F6BFF]" name="phone" />
              {customer.phone || "No phone"}
            </button>
            <a className="inline-flex items-center gap-2 transition hover:text-[#0F6BFF]" href={customer.email ? `mailto:${customer.email}` : undefined}>
              <CustomerOverviewIcon className="h-4 w-4 text-[#0F6BFF]" name="mail" />
              {customer.email || "No email"}
            </a>
            <span className="inline-flex min-w-0 items-center gap-2">
              <CustomerOverviewIcon className="h-4 w-4 shrink-0 text-[#0F6BFF]" name="pin" />
              <span className="truncate">{primaryAddress ? getAddressLabel(primaryAddress) : "No primary address"}</span>
            </span>
            {primaryAddress ? (
              <a
                className="inline-flex items-center gap-1 text-[#0F6BFF]"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(getAddressLabel(primaryAddress))}`}
                rel="noreferrer"
                target="_blank"
              >
                <CustomerOverviewIcon className="h-4 w-4" name="map" />
                View on Map
              </a>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <CustomerDesktopKpi label="Total Jobs" value={serviceRequests.length.toString()} />
          <CustomerDesktopKpi label="Total Spent" value={formatMoney(totalSpent)} />
          <CustomerDesktopKpi label="Customer Since" value={customerSince.primary} detail={customerSince.secondary} />
          <CustomerDesktopKpi label="Customer Type" value={customerType} icon="home" />
        </div>
      </section>

      <nav className="flex gap-6 overflow-x-auto border-b border-slate-200 text-sm font-semibold text-slate-600">
        {tabs.map((tab) => (
          <button
            className={`flex shrink-0 items-center gap-2 border-b-2 px-1 py-3 transition ${
              activeTab === tab.id
                ? "border-[#0F6BFF] text-[#0F6BFF]"
                : "border-transparent hover:text-slate-950"
            }`}
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            type="button"
          >
            {tab.label}
            {typeof tab.count === "number" ? <span className="text-slate-400">({tab.count})</span> : null}
          </button>
        ))}
      </nav>

      {activeTab === "serviceHistory" ? (
        <div className="mt-3 grid gap-3">
          <div className="grid items-start gap-3 xl:grid-cols-[0.82fr_1.08fr]">
            <CustomerDesktopServiceHistory
              estimates={estimates}
              financialSnapshots={financialSnapshots}
              invoices={invoices}
              onNewJob={onNewJob}
              onSelectJob={onSelectJob}
              payments={payments}
              requests={serviceRequests}
              selectedJobId={selectedJob?.id ?? null}
            />
            <CustomerDesktopJobDetail
              appliances={appliances}
              estimates={selectedJobEstimates}
              financialSnapshots={financialSnapshots}
              invoices={selectedJobInvoices}
              job={selectedJob}
              notes={selectedJobNotes}
              onOpenInvoice={(invoice) => setFinancialDetail({ type: "invoice", invoice })}
              payments={selectedJobPayments}
              customerId={customer.id}
            />
          </div>
          <div className="grid items-start gap-3 xl:grid-cols-3">
            <CustomerDesktopEstimateCard
              estimates={selectedJobEstimates}
              onOpenEstimate={(estimate) => setFinancialDetail({ type: "estimate", estimate })}
              onViewAll={() => onTabChange("estimates")}
            />
            <CustomerDesktopInvoiceCard
              invoices={selectedJobInvoices}
              onOpenInvoice={(invoice) => setFinancialDetail({ type: "invoice", invoice })}
              onViewAll={() => onTabChange("invoices")}
            />
            <CustomerDesktopPaymentCard
              onOpenPayment={(payment) => setFinancialDetail({ type: "payment", payment })}
              payments={selectedJobPayments}
              onViewAll={() => onTabChange("payments")}
            />
          </div>
          <div className="grid items-start gap-3 xl:grid-cols-[1fr_0.9fr_0.7fr]">
            <CustomerDesktopDocumentsPanel
              actionState={attachmentAction}
              attachments={selectedJobAttachments}
              attachmentUrls={attachmentUrls}
              onUpload={(files) => onUploadFiles(selectedJob?.id ?? null, files)}
              photos={selectedJobPhotos}
              photoUrls={servicePhotoUrls}
            />
            <CustomerDesktopTimelinePanel
              communicationEvents={communicationEvents}
              estimates={selectedJobEstimates}
              invoices={selectedJobInvoices}
              job={selectedJob}
              notes={selectedJobNotes}
              payments={selectedJobPayments}
            />
            <CustomerDesktopQuickActions
              customer={customer}
              onAddNote={onAddNote}
              onCall={onCallCustomer}
              onCreateJob={onNewJob}
              onUpload={(files) => onUploadFiles(selectedJob?.id ?? null, files)}
            />
          </div>
        </div>
      ) : null}

      {activeTab === "overview" ? (
        <CustomerDesktopOverview
          addresses={addresses}
          appliances={appliances}
          conversations={conversations}
          customer={customer}
          customerNotes={customerNotes}
          onEditCustomer={onEditCustomer}
          onOpenAssets={onOpenAssets}
          serviceRequests={serviceRequests}
          timeline={buildCustomerTimeline({
            status: "ready",
            customer,
            serviceRequests,
            appliances,
            addresses,
            estimates,
            invoices,
            notes,
            customerNotes,
            conversations,
            communicationEvents,
            payments,
            financialSnapshots,
            servicePhotos,
            servicePhotoUrls,
            attachments,
            attachmentUrls,
            assetPhotos: [],
            assetCoverUrls: {},
            assetPhotoUrls: {},
            currentRole: null,
          })}
        />
      ) : null}

      {activeTab === "estimates" ? (
        <CustomerDesktopAllEstimates
          estimates={estimates}
          onOpenEstimate={(estimate) => setFinancialDetail({ type: "estimate", estimate })}
          requests={serviceRequests}
        />
      ) : null}
      {activeTab === "invoices" ? (
        <CustomerDesktopAllInvoices
          invoices={invoices}
          onOpenInvoice={(invoice) => setFinancialDetail({ type: "invoice", invoice })}
          requests={serviceRequests}
        />
      ) : null}
      {activeTab === "payments" ? (
        <CustomerDesktopAllPayments
          invoices={invoices}
          onOpenInvoice={(invoice) => setFinancialDetail({ type: "invoice", invoice })}
          onOpenPayment={(payment) => setFinancialDetail({ type: "payment", payment })}
          payments={payments}
          requests={serviceRequests}
        />
      ) : null}
      {activeTab === "notes" ? (
        <div className="mt-4">
          <CustomerNotesPanel
            actionState={{ status: "idle", message: null }}
            customerNotes={customerNotes}
            jobNotes={notes}
            noteBody=""
            onNoteBodyChange={() => undefined}
            onSubmit={onAddNote}
            serviceRequests={serviceRequests}
          />
        </div>
      ) : null}
      {activeTab === "documents" ? (
        <CustomerDesktopAllDocuments
          attachments={attachments}
          attachmentUrls={attachmentUrls}
          photos={servicePhotos}
          photoUrls={servicePhotoUrls}
          requests={serviceRequests}
        />
      ) : null}
      {activeTab === "communication" ? (
        <div className="mt-4">
          <ConversationList conversations={conversations} />
          <div className="mt-4">
            <TimelineList
              items={communicationEvents.map((event) => ({
                id: event.id,
                at: event.event_time,
                title: event.title,
                body: event.body,
                category: "call",
                href: "/dashboard/communications",
              }))}
            />
          </div>
        </div>
      ) : null}
      <CustomerDesktopFinancialDetailModal
        customer={customer}
        detail={financialDetail}
        estimates={estimates}
        invoices={invoices}
        onClose={() => setFinancialDetail(null)}
        onOpenEstimate={(estimate) => setFinancialDetail({ type: "estimate", estimate })}
        onOpenInvoice={(invoice) => setFinancialDetail({ type: "invoice", invoice })}
        requests={serviceRequests}
      />
    </div>
  );
}

function WorkizBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-black text-[#0F6BFF]">
      <CustomerOverviewIcon className="h-3.5 w-3.5" name="status" />
      Imported from Workiz
    </span>
  );
}

function CustomerDesktopKpi({
  detail,
  icon,
  label,
  value,
}: {
  detail?: string;
  icon?: CustomerOverviewIconName;
  label: string;
  value: string;
}) {
  return (
    <div className="min-h-[68px] rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        {icon ? <CustomerOverviewIcon className="h-4 w-4 text-slate-700" name={icon} /> : null}
        <p className="text-lg font-black leading-5 text-slate-950">{value}</p>
      </div>
      <p className="mt-1 text-xs font-medium text-slate-600">{label}</p>
      {detail ? <p className="mt-0.5 text-xs font-medium leading-4 text-slate-500">{detail}</p> : null}
    </div>
  );
}

function CustomerDesktopServiceHistory({
  estimates,
  financialSnapshots,
  invoices,
  onNewJob,
  onSelectJob,
  payments,
  requests,
  selectedJobId,
}: {
  estimates: ServiceRequestEstimateRow[];
  financialSnapshots: ServiceRequestFinancialSnapshotRow[];
  invoices: ServiceRequestInvoiceRow[];
  onNewJob: () => void;
  onSelectJob: (jobId: string) => void;
  payments: ServiceRequestPaymentRow[];
  requests: ServiceRequestRow[];
  selectedJobId: string | null;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-2.5">
        <h2 className="text-lg font-black text-slate-950">Service History ({requests.length})</h2>
        <div className="flex items-center gap-2">
          <select className="h-8 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
            <option>All Jobs</option>
          </select>
          <button className="h-8 rounded-md bg-[#0F6BFF] px-3 text-sm font-black text-white" onClick={onNewJob} type="button">
            + New Job
          </button>
        </div>
      </div>
      {requests.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black text-slate-600">
              <tr>
                <th className="px-4 py-1.5">Date</th>
                <th className="px-3 py-1.5">Job #</th>
                <th className="px-3 py-1.5">Appliance</th>
                <th className="px-3 py-1.5">Status</th>
                <th className="px-3 py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((request) => (
                <tr
                  className={`cursor-pointer transition hover:bg-blue-50 ${
                    selectedJobId === request.id ? "bg-blue-50" : ""
                  }`}
                  key={request.id}
                  onClick={() => onSelectJob(request.id)}
                >
                  <td className="whitespace-nowrap px-4 py-2 font-semibold text-slate-900">{formatDate(request.created_at)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-800">{getDesktopJobNumber(request)}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{request.appliance_type || "Appliance"}</td>
                  <td className="px-3 py-2"><StatusPill value={request.status} /></td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-slate-900">
                    {formatMoney(
                      getRequestDisplayedTotal(
                        request,
                        estimates,
                        invoices,
                        payments,
                        financialSnapshots.find(
                          (snapshot) => snapshot.service_request_id === request.id,
                        ),
                      ),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyMessage>No jobs for this customer yet.</EmptyMessage>
      )}
    </section>
  );
}

function CustomerDesktopJobDetail({
  appliances,
  customerId,
  estimates,
  financialSnapshots,
  invoices,
  job,
  notes,
  onOpenInvoice,
  payments,
}: {
  appliances: CustomerApplianceRow[];
  customerId: string;
  estimates: ServiceRequestEstimateRow[];
  financialSnapshots: ServiceRequestFinancialSnapshotRow[];
  invoices: ServiceRequestInvoiceRow[];
  job: ServiceRequestRow | null;
  notes: ServiceRequestNoteRow[];
  onOpenInvoice: (invoice: ServiceRequestInvoiceRow) => void;
  payments: ServiceRequestPaymentRow[];
}) {
  if (!job) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <EmptyMessage>Select a job to view service history details.</EmptyMessage>
      </section>
    );
  }

  const linkedAsset = job.customer_appliance_id
    ? appliances.find((asset) => asset.id === job.customer_appliance_id) ?? null
    : null;
  const snapshot = financialSnapshots.find(
    (item) => item.service_request_id === job.id,
  );
  const total = getRequestDisplayedTotal(job, estimates, invoices, payments, snapshot);
  const invoice = invoices[0] ?? null;
  const resolution = readRecordString(job.import_metadata, "resolution") ??
    readRecordString(job.import_metadata, "work_performed") ??
    readRecordString(job.import_metadata, "work_done");

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-black text-slate-950">
              Job {getDesktopJobNumber(job)}
            </h2>
            {job.source_system === "workiz" ? <WorkizBadge /> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600">
            <span>{formatDate(job.created_at)}</span>
            <span>•</span>
            <StatusPill value={job.status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-black text-slate-700 transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
            href={getCustomerJobHref(customerId, job.id)}
          >
            Open in New Tab
          </Link>
          <button
            aria-label="More job actions"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500"
            type="button"
          >
            <CustomerOverviewIcon className="h-4 w-4" name="more" />
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
        <div className="text-sm font-semibold text-slate-600">
          {getCustomerJobScheduleLabel(job)}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-base font-black text-slate-950">Total: {formatMoney(total)}</p>
          {invoice ? (
            invoice.source_system === "workiz" ? (
              <button
                className="rounded-md border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-black text-[#0F6BFF]"
                onClick={() => onOpenInvoice(invoice)}
                type="button"
              >
                View Invoice
              </button>
            ) : (
              <Link
                className="rounded-md border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-black text-[#0F6BFF]"
                href={`/dashboard/leads/${job.id}?tab=finance`}
              >
                View Invoice
              </Link>
            )
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <DesktopInfoCard
          icon="briefcase"
          label="Appliance"
          value={[
            job.appliance_type || linkedAsset?.appliance_type || "Not captured",
            [job.appliance_brand || linkedAsset?.brand, linkedAsset?.model_number]
              .filter(Boolean)
              .join(" "),
          ]
            .filter(Boolean)
            .join("\n")}
        />
        <DesktopInfoCard
          icon="tool"
          label="Problem"
          value={job.issue_description || "No problem description captured."}
        />
        <DesktopInfoCard icon="pin" label="Address" value={getJobAddress(job)} />
        <DesktopInfoCard
          icon="status"
          label="Resolution"
          value={resolution || "No resolution or work performed notes saved yet."}
        />
        <DesktopInfoCard
          icon="user"
          label="Assigned Technician"
          value={job.selected_technician_business_name || "Unassigned"}
        />
        <DesktopInfoCard
          icon="tag"
          label="Source"
          value={getJobSourceLabel(job)}
        />
        <div className="md:col-span-2">
          <DesktopInfoCard
            icon="edit"
            label={job.source_system === "workiz" ? "Job Notes (from Workiz)" : "Job Notes"}
            value={notes.length > 0 ? notes.map((note) => note.body).join("\n\n") : "No job notes saved."}
          />
        </div>
      </div>
    </section>
  );
}

function DesktopInfoCard({
  icon,
  label,
  value,
}: {
  icon: CustomerOverviewIconName;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <CustomerOverviewIcon className="mt-1 h-4 w-4 text-slate-700" name={icon} />
      <div>
        <p className="text-sm font-black leading-5 text-slate-950">{label}</p>
        <p className="mt-0.5 whitespace-pre-line text-sm leading-5 text-slate-700">{value || "—"}</p>
      </div>
    </div>
  );
}

function CustomerDesktopEstimateCard({
  estimates,
  onOpenEstimate,
  onViewAll,
}: {
  estimates: ServiceRequestEstimateRow[];
  onOpenEstimate: (estimate: ServiceRequestEstimateRow) => void;
  onViewAll: () => void;
}) {
  return (
    <DesktopDataCard title={`Estimates (${estimates.length})`} icon="document" onViewAll={onViewAll}>
      {estimates.length > 0 ? (
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
              <tr><th className="px-3 py-1.5">#</th><th>Date</th><th>Total</th><th>Status</th></tr>
          </thead>
          <tbody>
            {estimates.slice(0, 4).map((estimate) => (
              <tr className="border-t border-slate-100" key={estimate.id}>
                <td className="px-3 py-2">
                  {estimate.source_system === "workiz" ? (
                    <button
                      className="font-semibold text-[#0F6BFF] hover:underline"
                      onClick={() => onOpenEstimate(estimate)}
                      type="button"
                    >
                      {estimate.estimate_number || estimate.id.slice(0, 8)}
                    </button>
                  ) : (
                    <Link
                      className="font-semibold text-[#0F6BFF] hover:underline"
                      href={`/dashboard/leads/${estimate.service_request_id}?tab=finance&estimateId=${encodeURIComponent(estimate.id)}`}
                    >
                      {estimate.estimate_number || estimate.id.slice(0, 8)}
                    </Link>
                  )}
                </td>
                <td>{formatDate(estimate.created_at)}</td>
                <td>{formatMoney(estimate.total)}</td>
                <td><StatusPill value={estimate.estimate_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyMessage>No estimates for this job.</EmptyMessage>
      )}
    </DesktopDataCard>
  );
}

function CustomerDesktopInvoiceCard({
  invoices,
  onOpenInvoice,
  onViewAll,
}: {
  invoices: ServiceRequestInvoiceRow[];
  onOpenInvoice: (invoice: ServiceRequestInvoiceRow) => void;
  onViewAll: () => void;
}) {
  return (
    <DesktopDataCard title={`Invoices (${invoices.length})`} icon="document" onViewAll={onViewAll}>
      {invoices.length > 0 ? (
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr><th className="px-3 py-1.5">#</th><th>Date</th><th>Total</th><th>Status</th></tr>
          </thead>
          <tbody>
            {invoices.slice(0, 4).map((invoice) => (
              <tr className="border-t border-slate-100" key={invoice.id}>
                <td className="px-3 py-2">
                  {invoice.source_system === "workiz" ? (
                    <button
                      className="font-semibold text-[#0F6BFF] hover:underline"
                      onClick={() => onOpenInvoice(invoice)}
                      type="button"
                    >
                      {invoice.invoice_number}
                    </button>
                  ) : (
                    <Link
                      className="font-semibold text-[#0F6BFF] hover:underline"
                      href={`/dashboard/leads/${invoice.service_request_id}?tab=finance`}
                    >
                      {invoice.invoice_number}
                    </Link>
                  )}
                </td>
                <td>{formatDate(invoice.created_at)}</td>
                <td>{formatMoney(invoice.total)}</td>
                <td><StatusPill value={invoice.invoice_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyMessage>No invoices for this job.</EmptyMessage>
      )}
    </DesktopDataCard>
  );
}

function CustomerDesktopPaymentCard({
  onOpenPayment,
  payments,
  onViewAll,
}: {
  onOpenPayment: (payment: ServiceRequestPaymentRow) => void;
  payments: ServiceRequestPaymentRow[];
  onViewAll: () => void;
}) {
  return (
    <DesktopDataCard title={`Payments (${payments.length})`} icon="briefcase" onViewAll={onViewAll}>
      {payments.length > 0 ? (
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr><th className="px-3 py-1.5">Date</th><th>Amount</th><th>Method</th><th>Status</th></tr>
          </thead>
          <tbody>
            {payments.slice(0, 4).map((payment) => (
              <tr className="border-t border-slate-100" key={payment.id}>
                <td className="px-3 py-2">{formatDate(payment.paid_at ?? payment.payment_date ?? payment.created_at)}</td>
                <td>
                  <button
                    className="font-semibold text-[#0F6BFF] hover:underline"
                    onClick={() => onOpenPayment(payment)}
                    type="button"
                  >
                    {formatMoney(payment.amount)}
                  </button>
                </td>
                <td>{formatPaymentMethod(payment)}</td>
                <td><StatusPill value={payment.payment_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyMessage>No payment records for this job.</EmptyMessage>
      )}
    </DesktopDataCard>
  );
}

function DesktopDataCard({
  children,
  icon,
  onViewAll,
  title,
}: {
  children: ReactNode;
  icon: CustomerOverviewIconName;
  onViewAll?: () => void;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-black text-slate-950">
          <CustomerOverviewIcon className="h-4 w-4" name={icon} />
          {title}
        </h3>
        {onViewAll ? (
          <button className="text-sm font-black text-[#0F6BFF]" onClick={onViewAll} type="button">
            View All
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function CustomerDesktopDocumentsPanel({
  actionState,
  attachments,
  attachmentUrls,
  onUpload,
  photos,
  photoUrls,
}: {
  actionState: ActionState;
  attachments: ServiceRequestAttachmentRow[];
  attachmentUrls: Record<string, string>;
  onUpload: (files: FileList | null) => void;
  photos: ServiceRequestPhotoRow[];
  photoUrls: Record<string, string>;
}) {
  const items = [
    ...photos.map((photo) => ({
      id: `photo-${photo.id}`,
      name: photo.original_filename || photo.photo_type.replaceAll("_", " "),
      date: photo.created_at,
      href: photoUrls[photo.id] ?? null,
      isImage: true,
    })),
    ...attachments.map((attachment) => ({
      id: `attachment-${attachment.id}`,
      name: attachment.original_filename || attachment.attachment_category.replaceAll("_", " "),
      date: attachment.created_at,
      href: attachmentUrls[attachment.id] ?? null,
      isImage: (attachment.mime_type ?? "").startsWith("image/"),
    })),
  ];

  return (
    <DesktopDataCard title={`Photos & Documents (${items.length})`} icon="document">
      <div className="grid gap-3 md:grid-cols-[108px_minmax(0,1fr)]">
        <label className="flex min-h-[104px] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-blue-200 bg-blue-50 px-3 text-center text-sm font-black text-[#0F6BFF] transition hover:bg-blue-100">
          <CustomerOverviewIcon className="mb-1.5 h-5 w-5" name="upload" />
          Add Files
          <span className="mt-1 text-xs font-medium text-slate-500">Drag & drop or click</span>
          <input
            className="sr-only"
            multiple
            onChange={(event) => {
              onUpload(event.target.files);
              event.target.value = "";
            }}
            type="file"
          />
        </label>
        {items.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {items.slice(0, 6).map((item) => (
              <a
                className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white transition hover:border-[#0F6BFF]"
                href={item.href ?? undefined}
                key={item.id}
                rel="noreferrer"
                target="_blank"
              >
                {item.isImage && item.href ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={item.name} className="aspect-[4/3] w-full object-cover" src={item.href} />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-slate-100 text-slate-500">
                    <CustomerOverviewIcon className="h-8 w-8" name="document" />
                  </div>
                )}
                <p className="truncate px-2 pt-1.5 text-sm font-semibold text-slate-950">{item.name}</p>
                <p className="px-2 pb-1.5 text-xs text-slate-500">{formatDate(item.date)}</p>
              </a>
            ))}
          </div>
        ) : (
          <EmptyMessage>No photos or documents for this job yet.</EmptyMessage>
        )}
      </div>
      <div className="mt-3">
        <ActionMessage actionState={actionState} />
      </div>
    </DesktopDataCard>
  );
}

function CustomerDesktopTimelinePanel({
  estimates,
  invoices,
  job,
  notes,
  payments,
}: {
  communicationEvents: CommunicationTimelineEventRow[];
  estimates: ServiceRequestEstimateRow[];
  invoices: ServiceRequestInvoiceRow[];
  job: ServiceRequestRow | null;
  notes: ServiceRequestNoteRow[];
  payments: ServiceRequestPaymentRow[];
}) {
  const items: TimelineItem[] = [];
  if (job) {
    items.push({
      id: `job-${job.id}`,
      at: job.created_at,
      title: "Job created",
      body: job.issue_description,
      category: "job",
      href: `/dashboard/leads/${job.id}`,
    });
    if (CLOSED_JOB_STATUSES.has(job.status)) {
      items.push({
        id: `job-updated-${job.id}`,
        at: job.updated_at ?? job.created_at,
        title: "Status changed",
        body: job.status,
        category: "repair",
        href: `/dashboard/leads/${job.id}`,
      });
    }
  }
  for (const estimate of estimates) {
    items.push({
      id: `estimate-${estimate.id}`,
      at: estimate.sent_at ?? estimate.created_at,
      title: `Estimate ${estimate.estimate_status}`,
      body: `${estimate.estimate_number || "Estimate"} · ${formatMoney(estimate.total)}`,
      category: "estimate",
    });
  }
  for (const invoice of invoices) {
    items.push({
      id: `invoice-${invoice.id}`,
      at: invoice.paid_at ?? invoice.sent_at ?? invoice.created_at,
      title: invoice.paid_at ? "Invoice paid" : "Invoice created",
      body: `${invoice.invoice_number} · ${formatMoney(invoice.total)}`,
      category: "invoice",
    });
  }
  for (const payment of payments) {
    items.push({
      id: `payment-${payment.id}`,
      at: payment.paid_at ?? payment.payment_date ?? payment.created_at,
      title: "Payment recorded",
      body: `${formatMoney(payment.amount)} · ${payment.payment_status}`,
      category: "payment",
    });
  }
  for (const note of notes) {
    items.push({
      id: `note-${note.id}`,
      at: note.created_at,
      title: "Note added",
      body: note.body,
      category: "note",
    });
  }

  return (
    <DesktopDataCard title="Timeline" icon="calendar">
      <TimelineList items={items.sort((left, right) => Date.parse(right.at) - Date.parse(left.at)).slice(0, 8)} />
    </DesktopDataCard>
  );
}

function CustomerDesktopQuickActions({
  customer,
  onAddNote,
  onCall,
  onCreateJob,
  onUpload,
}: {
  customer: CustomerRow;
  onAddNote: () => void;
  onCall: () => void;
  onCreateJob: () => void;
  onUpload: (files: FileList | null) => void;
}) {
  return (
    <DesktopDataCard title="Quick Actions" icon="briefcase">
      <div className="grid grid-cols-3 gap-2">
        <button className="rounded-lg border border-slate-200 p-3 text-sm font-black text-[#0F6BFF] transition hover:bg-blue-50" onClick={onCall} type="button">
          <CustomerOverviewIcon className="mx-auto mb-1.5 h-5 w-5" name="phone" />
          Call Customer
        </button>
        <a className="rounded-lg border border-slate-200 p-3 text-center text-sm font-black text-emerald-700 transition hover:bg-emerald-50" href={customer.phone ? `sms:${cleanPhone(customer.phone)}` : undefined}>
          <CustomerOverviewIcon className="mx-auto mb-1.5 h-5 w-5" name="message" />
          Send SMS
        </a>
        <a className="rounded-lg border border-slate-200 p-3 text-center text-sm font-black text-[#0F6BFF] transition hover:bg-blue-50" href={customer.email ? `mailto:${customer.email}` : undefined}>
          <CustomerOverviewIcon className="mx-auto mb-1.5 h-5 w-5" name="mail" />
          Send Email
        </a>
        <button className="rounded-lg border border-slate-200 p-3 text-sm font-black text-slate-800 transition hover:bg-slate-50" onClick={onAddNote} type="button">
          <CustomerOverviewIcon className="mx-auto mb-1.5 h-5 w-5" name="edit" />
          Add Note
        </button>
        <label className="cursor-pointer rounded-lg border border-slate-200 p-3 text-center text-sm font-black text-slate-800 transition hover:bg-slate-50">
          <CustomerOverviewIcon className="mx-auto mb-1.5 h-5 w-5" name="upload" />
          Upload Files
          <input className="sr-only" multiple onChange={(event) => { onUpload(event.target.files); event.target.value = ""; }} type="file" />
        </label>
        <button className="rounded-lg border border-slate-200 p-3 text-sm font-black text-[#0F6BFF] transition hover:bg-blue-50" onClick={onCreateJob} type="button">
          <CustomerOverviewIcon className="mx-auto mb-1.5 h-5 w-5" name="plus" />
          Create Job
        </button>
      </div>
    </DesktopDataCard>
  );
}

function CustomerDesktopOverview({
  addresses,
  appliances,
  conversations,
  customer,
  customerNotes,
  onEditCustomer,
  onOpenAssets,
  serviceRequests,
  timeline,
}: {
  addresses: CustomerAddressRow[];
  appliances: CustomerApplianceRow[];
  conversations: CommunicationConversationRow[];
  customer: CustomerRow;
  customerNotes: CustomerInternalNoteRow[];
  onEditCustomer: () => void;
  onOpenAssets: () => void;
  serviceRequests: ServiceRequestRow[];
  timeline: TimelineItem[];
}) {
  return (
    <div className="mt-3 grid items-start gap-3 xl:grid-cols-[1fr_1fr]">
      <CustomerMoreWorkspace
        addresses={addresses}
        customer={customer}
        customerNotes={customerNotes}
        lastServiceDate={getLastServiceDate(serviceRequests)}
        noteAction={{ status: "idle", message: null }}
        noteBody=""
        onAddAddress={onEditCustomer}
        onAddNote={() => undefined}
        onEditAddress={onEditCustomer}
        onEditCustomer={onEditCustomer}
        onNoteBodyChange={() => undefined}
        serviceRequestCount={serviceRequests.length}
        totalAssets={appliances.length}
      />
      <div className="grid gap-3">
        <DesktopDataCard title={`Assets / Appliances (${appliances.length})`} icon="tool" onViewAll={onOpenAssets}>
          {appliances.length > 0 ? (
            <div className="grid gap-2">
              {appliances.slice(0, 5).map((asset) => (
                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-2.5" key={asset.id}>
                  <div>
                    <p className="font-black text-slate-950">{getAssetDisplayName(asset)}</p>
                    <p className="text-sm text-slate-500">
                      {getAssetPlaceholderLabel(asset.appliance_type)} · {getAssetAddressLabel(asset, addresses)}
                    </p>
                  </div>
                  <StatusPill value={getAssetStatusLabel(asset)} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyMessage>No assets saved yet.</EmptyMessage>
          )}
        </DesktopDataCard>
        <DesktopDataCard title={`Recent Jobs (${serviceRequests.length})`} icon="briefcase">
          <JobList requests={serviceRequests.slice(0, 4)} estimates={[]} empty="No jobs yet." />
        </DesktopDataCard>
        <DesktopDataCard title={`Communication (${conversations.length})`} icon="message">
          <ConversationList conversations={conversations.slice(0, 4)} />
        </DesktopDataCard>
        <DesktopDataCard title="Recent Activity" icon="calendar">
          <TimelineList items={timeline.slice(-6).reverse()} />
        </DesktopDataCard>
      </div>
    </div>
  );
}

function CustomerDesktopAllEstimates({
  estimates,
  onOpenEstimate,
  requests,
}: {
  estimates: ServiceRequestEstimateRow[];
  onOpenEstimate: (estimate: ServiceRequestEstimateRow) => void;
  requests: ServiceRequestRow[];
}) {
  return (
    <div className="mt-4">
      <DesktopDataCard title={`All Estimates (${estimates.length})`} icon="document">
        {estimates.length > 0 ? (
          <CustomerDesktopRecordTable
            headers={["Estimate #", "Job", "Date", "Total", "Status"]}
            rows={estimates.map((estimate) => {
              const request = requests.find((item) => item.id === estimate.service_request_id);
              return [
                estimate.source_system === "workiz" ? (
                  <button
                    className="font-semibold text-[#0F6BFF] hover:underline"
                    key={estimate.id}
                    onClick={() => onOpenEstimate(estimate)}
                    type="button"
                  >
                    {estimate.estimate_number || estimate.id.slice(0, 8)}
                  </button>
                ) : (
                  <Link
                    className="font-semibold text-[#0F6BFF] hover:underline"
                    href={`/dashboard/leads/${estimate.service_request_id}?tab=finance&estimateId=${encodeURIComponent(estimate.id)}`}
                    key={estimate.id}
                  >
                    {estimate.estimate_number || estimate.id.slice(0, 8)}
                  </Link>
                ),
                request ? getDesktopJobNumber(request) : "Linked job",
                formatDate(estimate.created_at),
                formatMoney(estimate.total),
                estimate.estimate_status,
              ];
            })}
          />
        ) : (
          <EmptyMessage>No estimates linked to this customer.</EmptyMessage>
        )}
      </DesktopDataCard>
    </div>
  );
}

function CustomerDesktopAllInvoices({
  invoices,
  onOpenInvoice,
  requests,
}: {
  invoices: ServiceRequestInvoiceRow[];
  onOpenInvoice: (invoice: ServiceRequestInvoiceRow) => void;
  requests: ServiceRequestRow[];
}) {
  return (
    <div className="mt-4">
      <DesktopDataCard title={`All Invoices (${invoices.length})`} icon="document">
        {invoices.length > 0 ? (
          <CustomerDesktopRecordTable
            headers={["Invoice #", "Job", "Date", "Total", "Amount Due", "Status"]}
            rows={invoices.map((invoice) => {
              const request = requests.find((item) => item.id === invoice.service_request_id);
              return [
                invoice.source_system === "workiz" ? (
                  <button
                    className="font-semibold text-[#0F6BFF] hover:underline"
                    key={invoice.id}
                    onClick={() => onOpenInvoice(invoice)}
                    type="button"
                  >
                    {invoice.invoice_number}
                  </button>
                ) : (
                  <Link
                    className="font-semibold text-[#0F6BFF] hover:underline"
                    href={`/dashboard/leads/${invoice.service_request_id}?tab=finance`}
                    key={invoice.id}
                  >
                    {invoice.invoice_number}
                  </Link>
                ),
                request ? getDesktopJobNumber(request) : "Linked job",
                formatDate(invoice.created_at),
                formatMoney(invoice.total),
                formatMoney(invoice.amount_due ?? null),
                invoice.invoice_status,
              ];
            })}
          />
        ) : (
          <EmptyMessage>No invoices linked to this customer.</EmptyMessage>
        )}
      </DesktopDataCard>
    </div>
  );
}

function CustomerDesktopAllPayments({
  invoices,
  onOpenInvoice,
  onOpenPayment,
  payments,
  requests,
}: {
  invoices: ServiceRequestInvoiceRow[];
  onOpenInvoice: (invoice: ServiceRequestInvoiceRow) => void;
  onOpenPayment: (payment: ServiceRequestPaymentRow) => void;
  payments: ServiceRequestPaymentRow[];
  requests: ServiceRequestRow[];
}) {
  return (
    <div className="mt-4">
      <DesktopDataCard title={`All Payments (${payments.length})`} icon="payment">
        {payments.length > 0 ? (
          <CustomerDesktopRecordTable
            headers={["Date", "Job", "Invoice", "Amount", "Method", "Status"]}
            rows={payments.map((payment) => {
              const request = requests.find((item) => item.id === payment.service_request_id);
              const invoice = invoices.find((item) => item.id === payment.invoice_id);
              return [
                formatDate(payment.paid_at ?? payment.payment_date ?? payment.created_at),
                request ? getDesktopJobNumber(request) : "Linked job",
                invoice ? (
                  invoice.source_system === "workiz" ? (
                    <button
                      className="font-semibold text-[#0F6BFF] hover:underline"
                      key={invoice.id}
                      onClick={() => onOpenInvoice(invoice)}
                      type="button"
                    >
                      {invoice.invoice_number}
                    </button>
                  ) : (
                    <Link
                      className="font-semibold text-[#0F6BFF] hover:underline"
                      href={`/dashboard/leads/${invoice.service_request_id}?tab=finance`}
                      key={invoice.id}
                    >
                      {invoice.invoice_number}
                    </Link>
                  )
                ) : (
                  "—"
                ),
                <button
                  className="font-semibold text-[#0F6BFF] hover:underline"
                  key={payment.id}
                  onClick={() => onOpenPayment(payment)}
                  type="button"
                >
                  {formatMoney(payment.amount)}
                </button>,
                formatPaymentMethod(payment),
                payment.payment_status,
              ];
            })}
          />
        ) : (
          <EmptyMessage>No payment records linked to this customer.</EmptyMessage>
        )}
      </DesktopDataCard>
    </div>
  );
}

function CustomerDesktopAllDocuments({
  attachments,
  attachmentUrls,
  photos,
  photoUrls,
  requests,
}: {
  attachments: ServiceRequestAttachmentRow[];
  attachmentUrls: Record<string, string>;
  photos: ServiceRequestPhotoRow[];
  photoUrls: Record<string, string>;
  requests: ServiceRequestRow[];
}) {
  const items = [
    ...photos.map((photo) => ({
      id: `photo-${photo.id}`,
      job: requests.find((request) => request.id === photo.service_request_id),
      name: photo.original_filename || photo.photo_type.replaceAll("_", " "),
      date: photo.created_at,
      href: photoUrls[photo.id] ?? null,
      type: photo.photo_type.replaceAll("_", " "),
    })),
    ...attachments.map((attachment) => ({
      id: `attachment-${attachment.id}`,
      job: requests.find((request) => request.id === attachment.service_request_id),
      name: attachment.original_filename || attachment.attachment_category.replaceAll("_", " "),
      date: attachment.created_at,
      href: attachmentUrls[attachment.id] ?? null,
      type: attachment.attachment_category.replaceAll("_", " "),
    })),
  ];

  return (
    <div className="mt-4">
      <DesktopDataCard title={`Documents (${items.length})`} icon="document">
        {items.length > 0 ? (
          <div className="grid gap-2">
            {items.map((item) => (
              <a
                className="grid grid-cols-[1fr_130px_120px_90px] items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm transition hover:border-[#0F6BFF]"
                href={item.href ?? undefined}
                key={item.id}
                rel="noreferrer"
                target="_blank"
              >
                <span className="font-black text-slate-950">{item.name}</span>
                <span>{item.job ? getDesktopJobNumber(item.job) : "Job"}</span>
                <span className="capitalize">{item.type}</span>
                <span>{formatDate(item.date)}</span>
              </a>
            ))}
          </div>
        ) : (
          <EmptyMessage>No photos or documents linked to this customer.</EmptyMessage>
        )}
      </DesktopDataCard>
    </div>
  );
}

function CustomerDesktopRecordTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-50 text-xs font-black text-slate-600">
          <tr>{headers.map((header) => <th className="px-3 py-2" key={header}>{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td className="px-3 py-2.5 font-semibold text-slate-800" key={`${cell}-${cellIndex}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomerDesktopFinancialDetailModal({
  customer,
  detail,
  estimates,
  invoices,
  onClose,
  onOpenEstimate,
  onOpenInvoice,
  requests,
}: {
  customer: CustomerRow;
  detail: CustomerDesktopFinancialDetail;
  estimates: ServiceRequestEstimateRow[];
  invoices: ServiceRequestInvoiceRow[];
  onClose: () => void;
  onOpenEstimate: (estimate: ServiceRequestEstimateRow) => void;
  onOpenInvoice: (invoice: ServiceRequestInvoiceRow) => void;
  requests: ServiceRequestRow[];
}) {
  if (!detail) {
    return null;
  }

  const serviceRequestId =
    detail.type === "estimate"
      ? detail.estimate.service_request_id
      : detail.type === "invoice"
        ? detail.invoice.service_request_id
        : detail.payment.service_request_id;
  const request = requests.find((item) => item.id === serviceRequestId) ?? null;
  const relatedInvoice =
    detail.type === "estimate"
      ? invoices.find((invoice) => invoice.estimate_id === detail.estimate.id) ??
        (invoices.filter((invoice) => invoice.service_request_id === detail.estimate.service_request_id).length === 1
          ? invoices.find((invoice) => invoice.service_request_id === detail.estimate.service_request_id) ?? null
          : null)
      : detail.type === "payment" && detail.payment.invoice_id
        ? invoices.find((invoice) => invoice.id === detail.payment.invoice_id) ?? null
        : null;
  const relatedEstimate =
    detail.type === "invoice" && detail.invoice.estimate_id
      ? estimates.find((estimate) => estimate.id === detail.invoice.estimate_id) ?? null
      : null;
  const title =
    detail.type === "estimate"
      ? "Historical Estimate Summary"
      : detail.type === "invoice"
        ? "Historical Invoice Summary"
        : "Payment Detail";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-black text-slate-950">{title}</h2>
              {detail.type !== "payment" &&
              (detail.type === "estimate"
                ? detail.estimate.source_system === "workiz"
                : detail.invoice.source_system === "workiz") ? (
                <WorkizBadge />
              ) : null}
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              {request ? `Job ${getDesktopJobNumber(request)}` : "Linked job"} · {getCustomerName(customer)}
            </p>
          </div>
          <button
            aria-label="Close financial detail"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        {detail.type === "estimate" ? (
          <div className="mt-4 space-y-4">
            <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm font-semibold leading-6 text-slate-700">
              Detailed line items were not included in the Workiz export.
            </p>
            <CustomerDesktopDetailGrid
              items={[
                ["Estimate #", detail.estimate.estimate_number || detail.estimate.external_estimate_id || detail.estimate.id],
                ["Status", formatHumanSourceLabel(detail.estimate.estimate_status)],
                ["Created", formatDate(detail.estimate.created_at)],
                ["Subtotal", formatMoney(detail.estimate.subtotal)],
                ["Discount", formatMoney(detail.estimate.discount_amount ?? null)],
                ["Tax", formatMoney(detail.estimate.tax)],
                ["Total", formatMoney(detail.estimate.total)],
                ["Workiz source", readRecordString(detail.estimate.import_metadata, "raw_source") ?? "Imported historical estimate"],
              ]}
            />
            <CustomerDesktopDetailActions
              invoice={relatedInvoice}
              onOpenInvoice={onOpenInvoice}
              request={request}
            />
          </div>
        ) : null}

        {detail.type === "invoice" ? (
          <div className="mt-4 space-y-4">
            <p className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm font-semibold leading-6 text-slate-700">
              Detailed line items were not included in the Workiz export.
            </p>
            <CustomerDesktopDetailGrid
              items={[
                ["Invoice #", detail.invoice.invoice_number],
                ["Status", formatHumanSourceLabel(detail.invoice.invoice_status)],
                ["Created", formatDate(detail.invoice.created_at)],
                ["Paid", detail.invoice.paid_at ? formatDate(detail.invoice.paid_at) : "Not recorded"],
                ["Subtotal", formatMoney(detail.invoice.subtotal)],
                ["Discount", formatMoney(detail.invoice.discount_amount ?? null)],
                ["Tax", formatMoney(detail.invoice.tax)],
                ["Total", formatMoney(detail.invoice.total)],
                ["Amount due", formatMoney(detail.invoice.amount_due ?? null)],
              ]}
            />
            <CustomerDesktopDetailActions
              estimate={relatedEstimate}
              onOpenEstimate={onOpenEstimate}
              request={request}
            />
          </div>
        ) : null}

        {detail.type === "payment" ? (
          <div className="mt-4 space-y-4">
            <CustomerDesktopDetailGrid
              items={[
                ["Amount", formatMoney(detail.payment.amount)],
                ["Date", formatDate(detail.payment.paid_at ?? detail.payment.payment_date ?? detail.payment.created_at)],
                ["Method", formatPaymentMethod(detail.payment)],
                ["Status", formatHumanSourceLabel(detail.payment.payment_status)],
                ["Type", detail.payment.payment_type || "Payment"],
                ["Card", detail.payment.card_last4 ? `•••• ${detail.payment.card_last4}` : "Not stored"],
                ["Confirmation", detail.payment.confirmation_code || detail.payment.reference_code || "—"],
                ["Service fee", formatMoney(detail.payment.service_fee)],
                ["Net", formatMoney(detail.payment.net_amount)],
                ["Tip", formatMoney(detail.payment.tip_amount)],
                ["Description", detail.payment.description || "—"],
                ["Related invoice", relatedInvoice?.invoice_number ?? "—"],
              ]}
            />
            <CustomerDesktopDetailActions
              invoice={relatedInvoice}
              onOpenInvoice={onOpenInvoice}
              request={request}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function CustomerDesktopDetailGrid({
  items,
}: {
  items: [string, string][];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" key={label}>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-1 text-sm font-bold text-slate-950">{value || "—"}</p>
        </div>
      ))}
    </div>
  );
}

function CustomerDesktopDetailActions({
  estimate,
  invoice,
  onOpenEstimate,
  onOpenInvoice,
  request,
}: {
  estimate?: ServiceRequestEstimateRow | null;
  invoice?: ServiceRequestInvoiceRow | null;
  onOpenEstimate?: (estimate: ServiceRequestEstimateRow) => void;
  onOpenInvoice?: (invoice: ServiceRequestInvoiceRow) => void;
  request: ServiceRequestRow | null;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
      {request ? (
        <Link
          className="rounded-md border border-slate-200 px-3 py-2 text-sm font-black text-slate-700 transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
          href={`/dashboard/leads/${request.id}?tab=finance`}
        >
          View Job
        </Link>
      ) : null}
      {invoice && onOpenInvoice ? (
        <button
          className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-black text-[#0F6BFF]"
          onClick={() => onOpenInvoice(invoice)}
          type="button"
        >
          View Invoice
        </button>
      ) : null}
      {estimate && onOpenEstimate ? (
        <button
          className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-black text-[#0F6BFF]"
          onClick={() => onOpenEstimate(estimate)}
          type="button"
        >
          View Estimate
        </button>
      ) : null}
    </div>
  );
}

function calculateCustomerTotalSpent({
  invoices,
  payments,
}: {
  invoices: ServiceRequestInvoiceRow[];
  payments: ServiceRequestPaymentRow[];
}) {
  if (payments.length > 0) {
    return payments.reduce((total, payment) => total + Number(payment.amount ?? 0), 0);
  }

  return invoices
    .filter((invoice) => invoice.invoice_status === "paid")
    .reduce((total, invoice) => total + Number(invoice.total ?? 0), 0);
}

function getCustomerSinceLabel(customer: CustomerRow, requests: ServiceRequestRow[]) {
  const dates = [
    customer.imported_at,
    customer.created_at,
    ...requests.map((request) => request.imported_at ?? request.created_at),
  ].filter((value): value is string => Boolean(value));
  const earliest = dates.sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? customer.created_at;
  const years = Math.max(0, Math.floor((Date.now() - Date.parse(earliest)) / (365.25 * 24 * 60 * 60 * 1000)));

  return {
    primary: years > 0 ? `${years} year${years === 1 ? "" : "s"}` : "New",
    secondary: formatDate(earliest),
  };
}

function getDesktopJobNumber(request: ServiceRequestRow): string {
  if (request.source_system === "workiz" && request.external_job_id) {
    return request.external_job_id;
  }

  return getShortJobNumber(request);
}

function getRequestDisplayedTotal(
  request: ServiceRequestRow,
  estimates: ServiceRequestEstimateRow[],
  invoices: ServiceRequestInvoiceRow[],
  payments: ServiceRequestPaymentRow[],
  snapshot?: ServiceRequestFinancialSnapshotRow | null,
) {
  if (snapshot?.total != null) {
    return Number(snapshot.total);
  }

  const requestPayments = payments.filter((payment) => payment.service_request_id === request.id);
  if (requestPayments.length > 0) {
    return requestPayments.reduce((total, payment) => total + Number(payment.amount ?? 0), 0);
  }

  const requestInvoices = invoices.filter((invoice) => invoice.service_request_id === request.id);
  if (requestInvoices.length > 0) {
    return requestInvoices.reduce((total, invoice) => total + Number(invoice.total ?? 0), 0);
  }

  const requestEstimates = estimates.filter((estimate) => estimate.service_request_id === request.id);
  if (requestEstimates.length > 0) {
    return requestEstimates.reduce((total, estimate) => total + Number(estimate.total ?? 0), 0);
  }

  return 0;
}

function getJobSourceLabel(request: ServiceRequestRow): string {
  if (request.source_system === "workiz") {
    return "Workiz";
  }

  const source = readRecordString(request.attribution, "source") ??
    readRecordString(request.attribution, "provider");

  if (source) {
    return formatHumanSourceLabel(source);
  }

  if (request.inbound_source_id && !isUuidLike(request.inbound_source_id)) {
    return formatHumanSourceLabel(request.inbound_source_id);
  }

  return "—";
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatHumanSourceLabel(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[_-]+/g, " ");
  const knownLabels: Record<string, string> = {
    google: "Google",
    manual: "Manual",
    other: "Other",
    phone: "Phone",
    referral: "Referral",
    "repeat customer": "Repeat Customer",
    website: "Website",
    workiz: "Workiz",
    wra: "WRA",
  };

  if (knownLabels[normalized]) {
    return knownLabels[normalized];
  }

  if (isUuidLike(value)) {
    return "—";
  }

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "—";
}

function formatPaymentMethod(payment: ServiceRequestPaymentRow): string {
  const method = payment.payment_method || payment.payment_type || "Payment";
  return payment.card_last4 ? `${method} •••• ${payment.card_last4}` : method;
}

function normalizeAddressText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeAddressState(value: string | null | undefined): string {
  return normalizeAddressText(value).toUpperCase().slice(0, 2) || "TX";
}

function normalizeAddressCountry(value: string | null | undefined): string {
  return normalizeAddressText(value).toUpperCase().slice(0, 2) || "US";
}

function hasPrimaryAddressChanges(
  form: CustomerFormState,
  address: CustomerAddressRow | undefined,
): boolean {
  if (!address) {
    return hasAddressFormData(form);
  }

  return (
    normalizeAddressText(form.streetAddress) !==
      normalizeAddressText(address.street_address) ||
    normalizeAddressText(form.unit) !== normalizeAddressText(address.unit) ||
    normalizeAddressText(form.city) !== normalizeAddressText(address.city) ||
    normalizeAddressState(form.state) !== normalizeAddressState(address.state) ||
    cleanZip(form.zipCode) !== cleanZip(address.zip_code ?? "") ||
    normalizeAddressCountry(form.country) !== normalizeAddressCountry(address.country) ||
    form.latitude !== (address.latitude ?? null) ||
    form.longitude !== (address.longitude ?? null) ||
    (form.placeId ?? null) !== (address.place_id ?? null)
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

function buildCustomerAddressPayload(form: CustomerAddressFormState): Record<string, Json> {
  return {
    label: normalizeCustomerAddressType(form.label),
    street_address: form.streetAddress.trim() || null,
    unit: form.unit.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim().toUpperCase() || "TX",
    zip_code: cleanZip(form.zipCode) || null,
    country: form.country.trim().toUpperCase() || "US",
    latitude: form.latitude,
    longitude: form.longitude,
    place_id: form.placeId,
    is_primary: form.isPrimary,
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

function getCustomerInfoClipboardText(customer: CustomerRow): string {
  const explicitName = [customer.first_name, customer.last_name].filter(Boolean).join(" ");

  return [explicitName || customer.full_name, customer.phone, customer.email]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function getCustomerAddressClipboardText(address: CustomerAddressRow): string {
  const streetLine = [address.street_address, address.unit].filter(Boolean).join(", ");
  const cityLine = [
    address.city,
    [address.state, address.zip_code].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return [streetLine, cityLine].filter(Boolean).join("\n");
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

function normalizeCustomerAddressType(label: string | null | undefined): string {
  const cleanLabel = label?.trim();

  if (!cleanLabel) {
    return "Home";
  }

  const matchedOption = CUSTOMER_ADDRESS_TYPE_OPTIONS.find(
    (option) => option.toLowerCase() === cleanLabel.toLowerCase(),
  );

  if (matchedOption) {
    return matchedOption;
  }

  const normalized = cleanLabel.toLowerCase();
  if (
    normalized === "primary" ||
    normalized === "saved address" ||
    normalized === "customer primary address" ||
    normalized === "primary address" ||
    normalized === "previous job address"
  ) {
    return "Home";
  }

  return "Other";
}

function buildCustomerAddressForm(address?: CustomerAddressRow): CustomerAddressFormState {
  if (!address) {
    return emptyCustomerAddressForm;
  }

  return {
    id: address.id,
    label: normalizeCustomerAddressType(address.label),
    streetAddress: address.street_address ?? "",
    unit: address.unit ?? "",
    city: address.city ?? "",
    state: address.state ?? "TX",
    zipCode: address.zip_code ?? "",
    country: address.country ?? "US",
    latitude: address.latitude ?? null,
    longitude: address.longitude ?? null,
    placeId: address.place_id ?? null,
    isPrimary: address.is_primary,
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

function formatPreferredContact(value: CustomerRow["preferred_contact_method"]): string {
  if (value === "sms") {
    return "SMS";
  }

  if (value === "email") {
    return "Email";
  }

  return "Phone";
}

function getLastServiceDate(requests: ServiceRequestRow[]): string | null {
  const newestRequest = [...requests]
    .filter((request) => Boolean(request.created_at))
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0];

  return newestRequest?.created_at ?? null;
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
  return "job_number" in request && request.job_number
    ? String(request.job_number)
    : "Pending";
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
  | "document"
  | "edit"
  | "home"
  | "mail"
  | "map"
  | "message"
  | "more"
  | "payment"
  | "phone"
  | "pin"
  | "plus"
  | "search"
  | "status"
  | "tag"
  | "tool"
  | "upload"
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

  if (name === "document") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3.5h7l3 3V20H7V3.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M14 3.8V7h3M9.5 11h5M9.5 14h5M9.5 17h3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (name === "upload") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15V4M8 8l4-4 4 4M5 16v3h14v-3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (name === "plus") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeWidth="2.1" />
      </svg>
    );
  }

  if (name === "home") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="m4 11 8-7 8 7v9h-5v-6H9v6H4v-9Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (name === "tag") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5v6.5L12.5 20 20 12.5 11.5 4H5a1 1 0 0 0-1 1Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M8 8h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
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
  onClick,
}: {
  href?: string;
  label: "Call" | "Text" | "Email" | "More";
  onClick?: () => void;
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
    <button className={className} disabled={!onClick} onClick={onClick} type="button">
      {content}
    </button>
  );
}

type BrowserCallStatus =
  | "idle"
  | "preparing"
  | "calling"
  | "ringing"
  | "connected"
  | "canceled"
  | "ended"
  | "failed";

type BrowserCallSession = {
  callId: string;
  conversationId: string;
  telnyxToken: string;
  callerNumber: string;
  destinationNumber: string;
};

export type BrowserCallTarget = {
  conversationId?: string | null;
  customerId?: string | null;
  displayName: string;
  phone: string | null;
};

type TelnyxBrowserCall = {
  cause?: string;
  causeCode?: number;
  hangup?: () => void;
  id?: string;
  localStream?: MediaStream;
  muteAudio?: () => void;
  prevState?: string;
  remoteStream?: MediaStream;
  sipCode?: number;
  sipReason?: string;
  state?: string;
  telnyxIDs?: {
    telnyxCallControlId?: string;
    telnyxLegId?: string;
    telnyxSessionId?: string;
  };
  unmuteAudio?: () => void;
  options?: { id?: string };
};

type TelnyxBrowserClient = {
  connect?: () => void;
  disconnect?: () => void;
  newCall: (options: {
    audio?: boolean;
    callerNumber: string;
    destinationNumber: string;
    onNotification?: (notification: unknown) => void;
    remoteElement?: HTMLMediaElement;
  }) => TelnyxBrowserCall;
  on: (eventName: string, handler: (...args: unknown[]) => void) => void;
};

type TelnyxRtcConstructor = typeof TelnyxRTCClass;

let telnyxRtcConstructorPromise: Promise<TelnyxRtcConstructor> | null = null;

type SanitizedTelnyxCallInfo = {
  cause?: string | null;
  causeCode?: number | null;
  id?: string | null;
  prevState?: string | null;
  sipCode?: number | null;
  sipReason?: string | null;
  state?: string | null;
  telnyxIDs?: {
    telnyxCallControlId?: string | null;
    telnyxLegId?: string | null;
    telnyxSessionId?: string | null;
  } | null;
};

type SanitizedTelnyxNotification = {
  call?: SanitizedTelnyxCallInfo | null;
  cause?: string | null;
  causeCode?: number | null;
  id?: string | null;
  message?: string | null;
  method?: string | null;
  name?: string | null;
  sipCode?: number | null;
  sipReason?: string | null;
  type?: string | null;
};

function formatBrowserCallPhone(value: string | null | undefined): string {
  const digits = cleanPhone(value ?? "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (national.length === 10) {
    return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  }

  return value || "No phone";
}

function extractTelnyxCallId(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    call?: {
      options?: { id?: unknown };
      id?: unknown;
      telnyxIDs?: {
        telnyxCallControlId?: unknown;
        telnyxLegId?: unknown;
        telnyxSessionId?: unknown;
      };
    };
    id?: unknown;
    options?: { id?: unknown };
    telnyxIDs?: {
      telnyxCallControlId?: unknown;
      telnyxLegId?: unknown;
      telnyxSessionId?: unknown;
    };
  };
  const id =
    record.call?.telnyxIDs?.telnyxCallControlId ??
    record.telnyxIDs?.telnyxCallControlId ??
    record.call?.options?.id ??
    record.call?.id ??
    record.options?.id ??
    record.id;

  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function extractTelnyxLifecycleIds(value: unknown): Record<string, string> {
  const record = asRecord(value);
  const call = asRecord(record?.call);
  const telnyxIDs = asRecord(call?.telnyxIDs) ?? asRecord(record?.telnyxIDs);
  const callControlId = readString(telnyxIDs, "telnyxCallControlId");
  const callLegId = readString(telnyxIDs, "telnyxLegId");
  const sessionId = readString(telnyxIDs, "telnyxSessionId");
  const patch: Record<string, string> = {};

  if (callControlId) {
    patch.telnyxCallControlId = callControlId;
    patch.providerCallId = callControlId;
  }
  if (callLegId) {
    patch.telnyxCallLegId = callLegId;
  }
  if (sessionId) {
    patch.telnyxSessionId = sessionId;
  }

  return patch;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(record: Record<string, unknown> | null, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeTelnyxCall(value: unknown): SanitizedTelnyxCallInfo | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const telnyxIDs = asRecord(record.telnyxIDs);

  return {
    cause: readString(record, "cause"),
    causeCode: readNumber(record, "causeCode"),
    id: readString(record, "id") ?? readString(asRecord(record.options), "id"),
    prevState: readString(record, "prevState"),
    sipCode: readNumber(record, "sipCode"),
    sipReason: readString(record, "sipReason"),
    state: readString(record, "state"),
    telnyxIDs: telnyxIDs
      ? {
          telnyxCallControlId: readString(telnyxIDs, "telnyxCallControlId"),
          telnyxLegId: readString(telnyxIDs, "telnyxLegId"),
          telnyxSessionId: readString(telnyxIDs, "telnyxSessionId"),
        }
      : null,
  };
}

function sanitizeTelnyxNotification(value: unknown): SanitizedTelnyxNotification {
  const record = asRecord(value);
  const call = sanitizeTelnyxCall(record?.call);

  return {
    call,
    cause: readString(record, "cause") ?? call?.cause ?? null,
    causeCode: readNumber(record, "causeCode") ?? call?.causeCode ?? null,
    id: readString(record, "id"),
    message: readString(record, "message"),
    method: readString(record, "method"),
    name: readString(record, "name"),
    sipCode: readNumber(record, "sipCode") ?? call?.sipCode ?? null,
    sipReason: readString(record, "sipReason") ?? call?.sipReason ?? null,
    type: readString(record, "type"),
  };
}

function describeTelnyxFailure(notification: SanitizedTelnyxNotification): string | null {
  const code = notification.sipCode ?? notification.causeCode;
  const reason = notification.sipReason ?? notification.cause ?? notification.message;

  if (!code && !reason) {
    return null;
  }

  return ["Browser call failed", code ? `code ${code}` : null, reason].filter(Boolean).join(": ");
}

function isNormalTelnyxClearing(notification: SanitizedTelnyxNotification): boolean {
  const reason = `${notification.sipReason ?? ""} ${notification.cause ?? ""}`.toUpperCase();
  return notification.causeCode === 16 || reason.includes("NORMAL_CLEARING");
}

function describeAudioTracks(stream: MediaStream | null | undefined) {
  return (stream?.getAudioTracks() ?? []).map((track) => ({
    enabled: track.enabled,
    label: track.label || "unlabeled audio device",
    muted: track.muted,
    readyState: track.readyState,
  }));
}

export function BrowserCallModal({
  onClose,
  target,
}: {
  onClose: () => void;
  target: BrowserCallTarget;
}) {
  const activeCallRef = useRef<TelnyxBrowserCall | null>(null);
  const callEndedRef = useRef(false);
  const clientRef = useRef<TelnyxBrowserClient | null>(null);
  const connectedAtRef = useRef<string | null>(null);
  const latestTelnyxLifecycleIdsRef = useRef<Record<string, string>>({});
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef<BrowserCallSession | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const hasDialedRef = useRef(false);
  const startInProgressRef = useRef(false);
  const userRequestedEndRef = useRef(false);
  const [session, setSession] = useState<BrowserCallSession | null>(null);
  const [status, setStatus] = useState<BrowserCallStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (status !== "connected") {
      return;
    }

    const timer = window.setInterval(() => {
      if (!connectedAtRef.current) {
        return;
      }

      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - Date.parse(connectedAtRef.current)) / 1000)),
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status]);

  async function patchCall(nextStatus: string, extra?: Record<string, unknown>) {
    const activeSession = sessionRef.current ?? session;
    if (!activeSession) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { data } = supabase ? await supabase.auth.getSession() : { data: null };
    const token = data?.session?.access_token;
    if (!token) {
      return;
    }

    await fetch(`/api/communications/browser-call/${activeSession.callId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: nextStatus, ...extra }),
    }).catch(() => null);
  }

  async function loadTelnyxRtcConstructor(): Promise<TelnyxRtcConstructor> {
    telnyxRtcConstructorPromise ??= import("@telnyx/webrtc")
      .then((module) => module.TelnyxRTC)
      .catch((error: unknown) => {
        telnyxRtcConstructorPromise = null;
        throw error;
      });

    return telnyxRtcConstructorPromise;
  }

  async function startCall() {
    if (startInProgressRef.current || sessionRef.current || hasDialedRef.current) {
      return;
    }

    startInProgressRef.current = true;
    setStatus("preparing");
    setMessage(null);
    setElapsedSeconds(0);
    callEndedRef.current = false;
    connectedAtRef.current = null;
    latestTelnyxLifecycleIdsRef.current = {};
    sessionRef.current = null;
    hasDialedRef.current = false;
    userRequestedEndRef.current = false;

    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = supabase ? await supabase.auth.getSession() : { data: null };
      const token = data?.session?.access_token;
      if (!token) {
        throw new Error("Log in again before calling.");
      }

      const response = await fetch("/api/communications/browser-call/session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: target.conversationId ?? undefined,
          customerId: target.customerId ?? undefined,
          destinationPhone: target.phone,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (BrowserCallSession & { ok?: boolean; message?: string })
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? "Could not prepare browser call.");
      }

      const nextSession: BrowserCallSession = {
        callId: payload.callId,
        conversationId: payload.conversationId,
        telnyxToken: payload.telnyxToken,
        callerNumber: payload.callerNumber,
        destinationNumber: payload.destinationNumber,
      };
      sessionRef.current = nextSession;
      setSession(nextSession);

      const TelnyxRTC = await loadTelnyxRtcConstructor();
      const client = new TelnyxRTC({ login_token: nextSession.telnyxToken });
      clientRef.current = client;
      startedAtRef.current = new Date().toISOString();

      const handleTelnyxNotification = (notification: unknown) => {
        const sanitized = sanitizeTelnyxNotification(notification);
        const providerCallId = extractTelnyxCallId(notification);
        const telnyxPatch = extractTelnyxLifecycleIds(notification);
        if (Object.keys(telnyxPatch).length > 0) {
          latestTelnyxLifecycleIdsRef.current = {
            ...latestTelnyxLifecycleIdsRef.current,
            ...telnyxPatch,
          };
        }
        const stateText = [
          sanitized.type,
          sanitized.method,
          sanitized.call?.state,
          sanitized.call?.prevState,
          sanitized.cause,
          sanitized.sipReason,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (stateText.includes("ringing") || stateText.includes("early")) {
          setStatus("ringing");
          void playRemoteAudio(activeCallRef.current);
          void patchCall("ringing", { providerCallId, ...telnyxPatch });
          return;
        }

        if (stateText.includes("active") || stateText.includes("answered")) {
          const answeredAt = connectedAtRef.current ?? new Date().toISOString();
          connectedAtRef.current = answeredAt;
          setStatus("connected");
          void playRemoteAudio(activeCallRef.current);
          void patchCall("connected", { answeredAt, providerCallId, ...telnyxPatch });
          return;
        }

        if (
          stateText.includes("hangup") ||
          stateText.includes("destroy") ||
          stateText.includes("ended") ||
          sanitized.sipCode != null ||
          sanitized.causeCode != null
        ) {
          callEndedRef.current = true;
          activeCallRef.current = null;
          const completedNormally = isNormalTelnyxClearing(sanitized) && connectedAtRef.current;
          const canceledByUser = userRequestedEndRef.current && !connectedAtRef.current;
          const failureMessage = describeTelnyxFailure(sanitized);
          setStatus(
            canceledByUser
              ? "canceled"
              : completedNormally || !failureMessage
                ? "ended"
                : "failed",
          );
          setMessage(completedNormally || canceledByUser ? null : failureMessage);
          void patchCall(
            canceledByUser
              ? "canceled"
              : completedNormally || !failureMessage
                ? "ended"
                : "failed",
            {
              endedAt: new Date().toISOString(),
              endReason:
                canceledByUser
                  ? "canceled_by_wra_user"
                  : completedNormally
                    ? "normal_clearing"
                    : failureMessage ??
                      sanitized.sipReason ??
                      sanitized.cause ??
                      "browser_call_ended",
              providerCallId,
              ...telnyxPatch,
            },
          );
        }
      };

      const playRemoteAudio = async (call: TelnyxBrowserCall | null) => {
        const audio = remoteAudioRef.current;
        if (!audio) {
          return;
        }

        if (!audio.srcObject && call?.remoteStream) {
          audio.srcObject = call.remoteStream;
        }

        try {
          await audio.play();
        } catch (error) {
          console.warn("[wra-browser-call-audio-play]", {
            ok: false,
            message: error instanceof Error ? error.message : "Remote audio play failed.",
            localAudioTracks: describeAudioTracks(call?.localStream),
            remoteAudioTracks: describeAudioTracks(call?.remoteStream),
          });
        }
      };

      client.on("telnyx.ready", () => {
        if (hasDialedRef.current || callEndedRef.current) {
          return;
        }

        hasDialedRef.current = true;
        setStatus("calling");
        const call = client.newCall({
          audio: true,
          callerNumber: nextSession.callerNumber,
          destinationNumber: nextSession.destinationNumber,
          onNotification: handleTelnyxNotification,
          ...(remoteAudioRef.current ? { remoteElement: remoteAudioRef.current } : {}),
        });
        activeCallRef.current = call;
        void patchCall("calling", {
          providerCallId: extractTelnyxCallId(call) ?? call.options?.id ?? null,
          startedAt: startedAtRef.current,
          ...extractTelnyxLifecycleIds(call),
        });
      });

      client.on("telnyx.notification", (notification) => {
        handleTelnyxNotification(notification);
      });

      client.on("telnyx.error", (error) => {
        if (callEndedRef.current) {
          return;
        }

        const sanitized = sanitizeTelnyxNotification(error);
        console.error("[wra-browser-call-telnyx-error]", sanitized);
        callEndedRef.current = true;
        activeCallRef.current = null;
        setStatus("failed");
        setMessage(
          describeTelnyxFailure(sanitized) ??
            (error instanceof Error ? error.message : "Browser call failed."),
        );
        void patchCall("failed", {
          endedAt: new Date().toISOString(),
          endReason:
            sanitized.sipReason ??
            sanitized.cause ??
            sanitized.message ??
            "browser_call_error",
        });
      });

      client.connect?.();
    } catch (error) {
      if (!sessionRef.current) {
        hasDialedRef.current = false;
      }
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Could not start browser call.");
    } finally {
      startInProgressRef.current = false;
    }
  }

  function endCall() {
    const telnyxPatch = {
      ...latestTelnyxLifecycleIdsRef.current,
      ...extractTelnyxLifecycleIds(activeCallRef.current),
    };
    const callWasConnected = Boolean(connectedAtRef.current) || status === "connected";
    userRequestedEndRef.current = true;
    if (!callEndedRef.current && status !== "ended" && status !== "failed") {
      activeCallRef.current?.hangup?.();
      clientRef.current?.disconnect?.();
      callEndedRef.current = true;
    }
    activeCallRef.current = null;
    setStatus(callWasConnected ? "ended" : "canceled");
    void patchCall(callWasConnected ? "ended" : "canceled", {
      endedAt: new Date().toISOString(),
      endReason: callWasConnected ? "ended_by_wra_user" : "canceled_by_wra_user",
      ...telnyxPatch,
    });
  }

  function toggleMute() {
    if (!activeCallRef.current) {
      return;
    }

    if (muted) {
      activeCallRef.current.unmuteAudio?.();
      setMuted(false);
    } else {
      activeCallRef.current.muteAudio?.();
      setMuted(true);
    }
  }

  const formattedElapsed = `${Math.floor(elapsedSeconds / 60)}:${String(
    elapsedSeconds % 60,
  ).padStart(2, "0")}`;
  const statusLabel =
    status === "preparing"
      ? "Preparing"
      : status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 px-4 py-5 sm:items-center">
      <div className="w-full max-w-sm rounded-[24px] bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
        <audio
          ref={remoteAudioRef}
          autoPlay
          className="hidden"
          playsInline
        />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
              WRA Browser Call
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {target.displayName}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">
              {formatBrowserCallPhone(target.phone)}
            </p>
          </div>
          <button
            aria-label="Close browser call"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-lg font-black text-slate-500"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-slate-50 p-4">
          <p className="text-sm font-black text-slate-950">Status: {statusLabel}</p>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            {status === "connected" ? `Connected · ${formattedElapsed}` : "MacBook microphone and speaker"}
          </p>
          {session ? (
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Caller ID {formatBrowserCallPhone(session.callerNumber)}
            </p>
          ) : null}
          {message ? <p className="mt-2 text-sm font-bold text-red-600">{message}</p> : null}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {(status === "idle" || status === "failed") && !session ? (
            <button
              className="col-span-2 rounded-2xl bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!target.phone}
              onClick={() => void startCall()}
              type="button"
            >
              Start browser call
            </button>
          ) : status === "ended" || status === "canceled" || (status === "failed" && session) ? (
            <button
              className="col-span-2 rounded-2xl bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white"
              onClick={onClose}
              type="button"
            >
              Close
            </button>
          ) : (
            <>
              <button
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800"
                onClick={toggleMute}
                type="button"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
              <button
                className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white"
                onClick={endCall}
                type="button"
              >
                End Call
              </button>
            </>
          )}
        </div>
      </div>
    </div>
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

    return tab === "jobs" || tab === "assets" || tab === "more" || tab === "activity"
      ? tab
      : "overview";
  });
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return new URLSearchParams(window.location.search).get("asset");
  });
  const [desktopTab, setDesktopTab] = useState<CustomerDesktopTab>("serviceHistory");
  const [selectedDesktopJobId, setSelectedDesktopJobId] = useState<string | null>(null);
  const [jobsFilter, setJobsFilter] = useState<CustomerJobsFilter>("all");
  const [showArchivedAssets, setShowArchivedAssets] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [profileForm, setProfileForm] = useState<CustomerFormState>(emptyCustomerForm);
  const [addressForm, setAddressForm] =
    useState<CustomerAddressFormState>(emptyCustomerAddressForm);
  const [applianceForm, setApplianceForm] =
    useState<ApplianceFormState>(emptyApplianceForm);
  const [noteBody, setNoteBody] = useState("");
  const [profileAction, setProfileAction] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [addressAction, setAddressAction] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [applianceAction, setApplianceAction] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [isAssetFormOpen, setIsAssetFormOpen] = useState(false);
  const [isAddressEditorOpen, setIsAddressEditorOpen] = useState(false);
  const [noteAction, setNoteAction] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [attachmentAction, setAttachmentAction] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [isCustomerActionsOpen, setIsCustomerActionsOpen] = useState(false);
  const [isQuickNoteComposerOpen, setIsQuickNoteComposerOpen] = useState(false);
  const [isBrowserCallOpen, setIsBrowserCallOpen] = useState(false);
  const [customerAction, setCustomerAction] = useState<ActionState>({
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

      const [
        estimatesResult,
        invoicesResult,
        notesResult,
        timelineResult,
        paymentsResult,
        financialSnapshotsResult,
        servicePhotosResult,
        attachmentsResult,
      ] =
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
              serviceRequestIds.length > 0
                ? supabase
                    .from("service_request_payments")
                    .select("*")
                    .in("service_request_id", serviceRequestIds)
                    .order("created_at", { ascending: false })
                : Promise.resolve({ data: [], error: null }),
              serviceRequestIds.length > 0
                ? supabase
                    .from("service_request_financial_snapshots")
                    .select("*")
                    .in("service_request_id", serviceRequestIds)
                    .order("created_at", { ascending: false })
                : Promise.resolve({ data: [], error: null }),
              serviceRequestIds.length > 0
                ? supabase
                    .from("service_request_photos")
                    .select("*")
                    .in("service_request_id", serviceRequestIds)
                    .order("created_at", { ascending: false })
                : Promise.resolve({ data: [], error: null }),
              serviceRequestIds.length > 0
                ? supabase
                    .from("service_request_attachments")
                    .select("*")
                    .in("service_request_id", serviceRequestIds)
                    .order("created_at", { ascending: false })
                : Promise.resolve({ data: [], error: null }),
            ])
          : [
              { data: [], error: null },
              { data: [], error: null },
              { data: [], error: null },
              { data: [], error: null },
              { data: [], error: null },
              { data: [], error: null },
              { data: [], error: null },
              { data: [], error: null },
            ];
      const coverPhotoUrls: Record<string, string> = {};
      const assetPhotoUrls: Record<string, string> = {};
      const servicePhotoUrls: Record<string, string> = {};
      const attachmentUrls: Record<string, string> = {};
      let loadedAssetPhotos: CustomerAppliancePhotoRow[] = [];
      const loadedServicePhotos = (servicePhotosResult.data ?? []) as ServiceRequestPhotoRow[];
      const loadedAttachments = (attachmentsResult.data ?? []) as ServiceRequestAttachmentRow[];

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

      if (loadedServicePhotos.length > 0) {
        await Promise.all(
          loadedServicePhotos.map(async (photo) => {
            const { data: signedUrlData } = await supabase.storage
              .from(SERVICE_REQUEST_PHOTO_BUCKET)
              .createSignedUrl(photo.storage_path, 60 * 30);

            if (signedUrlData?.signedUrl) {
              servicePhotoUrls[photo.id] = signedUrlData.signedUrl;
            }
          }),
        );
      }

      if (loadedAttachments.length > 0) {
        await Promise.all(
          loadedAttachments.map(async (attachment) => {
            const { data: signedUrlData } = await supabase.storage
              .from(attachment.storage_bucket)
              .createSignedUrl(attachment.storage_path, 60 * 30);

            if (signedUrlData?.signedUrl) {
              attachmentUrls[attachment.id] = signedUrlData.signedUrl;
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
          payments: (paymentsResult.data ?? []) as ServiceRequestPaymentRow[],
          financialSnapshots: (financialSnapshotsResult.data ?? []) as ServiceRequestFinancialSnapshotRow[],
          servicePhotos: loadedServicePhotos,
          servicePhotoUrls,
          attachments: loadedAttachments,
          attachmentUrls,
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
        tab === "jobs" || tab === "assets" || tab === "more" || tab === "activity"
          ? tab
          : "overview";

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

  function openCustomerActivity() {
    setActiveTab("activity");
    setSelectedAssetId(null);
    setIsProfileEditorOpen(false);

    if (typeof window !== "undefined") {
      window.history.pushState(null, "", `/dashboard/customers/${customerId}?tab=activity`);
    }
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

  function openAddressEditor(address?: CustomerAddressRow) {
    setAddressForm(
      address
        ? buildCustomerAddressForm(address)
        : {
            ...emptyCustomerAddressForm,
            isPrimary: state.status === "ready" ? state.addresses.length === 0 : false,
          },
    );
    setAddressAction({ status: "idle", message: null });
    setIsAddressEditorOpen(true);
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

    if (hasPrimaryAddressChanges(profileForm, primaryAddress)) {
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

  async function saveAddress() {
    if (!addressForm.streetAddress.trim() && !cleanZip(addressForm.zipCode)) {
      setAddressAction({ status: "error", message: "Add a street address or ZIP before saving." });
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAddressAction({ status: "error", message: "Customer CRM is not configured." });
      return;
    }

    setAddressAction({ status: "saving", message: "Saving address..." });

    const { error } = await supabase.rpc("upsert_customer_address_rpc", {
      p_customer_id: customerId,
      p_address_id: addressForm.id,
      p_payload: buildCustomerAddressPayload(addressForm),
    });

    if (error) {
      setAddressAction({
        status: "error",
        message: formatCustomerCrmSaveError(error.message),
      });
      return;
    }

    setAddressAction({ status: "success", message: "Address saved." });
    setIsAddressEditorOpen(false);
    setAddressForm(emptyCustomerAddressForm);
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

  async function addCustomerNote(): Promise<boolean> {
    const body = noteBody.trim();
    if (!body) {
      setNoteAction({ status: "error", message: "Note cannot be empty." });
      return false;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setNoteAction({ status: "error", message: "Customer CRM is not configured." });
      return false;
    }

    setNoteAction({ status: "saving", message: "Saving note..." });

    const { error } = await supabase.rpc("add_customer_internal_note_rpc", {
      p_customer_id: customerId,
      p_body: body,
      p_note_type: "general",
    });

    if (error) {
      setNoteAction({ status: "error", message: error.message });
      return false;
    }

    setNoteAction({ status: "success", message: "Customer note added." });
    setNoteBody("");
    refreshCustomer();
    return true;
  }

  async function uploadSelectedJobAttachments({
    requestId,
    files,
  }: {
    requestId: string | null;
    files: FileList | File[] | null | undefined;
  }) {
    const selectedFiles = Array.from(files ?? []);

    if (!requestId) {
      setAttachmentAction({ status: "error", message: "Select a job before uploading files." });
      return;
    }

    if (selectedFiles.length === 0) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAttachmentAction({ status: "error", message: "Attachment upload is not configured." });
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setAttachmentAction({ status: "error", message: "A logged-in dashboard session is required." });
      return;
    }

    const formData = new FormData();
    for (const file of selectedFiles) {
      formData.append("files", file);
    }

    setAttachmentAction({ status: "saving", message: "Uploading files..." });

    const response = await fetch(
      `/api/service-requests/${encodeURIComponent(requestId)}/attachments`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      },
    );
    const data = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      setAttachmentAction({
        status: "error",
        message: readRecordString(data, "message") ?? "Files could not be uploaded.",
      });
      return;
    }

    const uploadedCount = readNumber(asRecord(data), "uploadedCount") ?? selectedFiles.length;
    setAttachmentAction({
      status: "success",
      message: `${uploadedCount} file${uploadedCount === 1 ? "" : "s"} uploaded.`,
    });
    refreshCustomer();
  }

  function openCustomerActions() {
    setCustomerAction({ status: "idle", message: null });
    setIsQuickNoteComposerOpen(false);
    setIsCustomerActionsOpen(true);
  }

  async function copyToClipboard(value: string, successMessage: string): Promise<void> {
    if (!value.trim()) {
      setCustomerAction({ status: "error", message: "Nothing available to copy." });
      return;
    }

    if (!navigator.clipboard?.writeText) {
      setCustomerAction({
        status: "error",
        message: "Clipboard is not available in this browser.",
      });
      return;
    }

    setCustomerAction({ status: "saving", message: "Copying..." });

    try {
      await navigator.clipboard.writeText(value);
      setCustomerAction({ status: "success", message: successMessage });
      window.setTimeout(() => {
        setIsCustomerActionsOpen(false);
      }, 500);
    } catch {
      setCustomerAction({ status: "error", message: "Unable to copy right now." });
    }
  }

  async function addQuickCustomerNote(): Promise<void> {
    const saved = await addCustomerNote();

    if (saved) {
      setIsQuickNoteComposerOpen(false);
      setIsCustomerActionsOpen(false);
    }
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
  const explicitPrimaryAddressRecord =
    state.addresses.find((address) => address.is_primary) ?? null;
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
  const lastServiceDate = getLastServiceDate(state.serviceRequests);
  const lifetimeRevenue = state.invoices
    .filter((invoice) => invoice.invoice_status === "paid")
    .reduce((total, invoice) => total + Number(invoice.total ?? 0), 0);
  const outstandingBalance = state.invoices
    .filter((invoice) => !["paid", "void", "voided"].includes(invoice.invoice_status))
    .reduce((total, invoice) => total + Number(invoice.total ?? 0), 0);
  const averageTicket = completedJobs.length > 0 ? lifetimeRevenue / completedJobs.length : 0;
  const ownerCanViewMetrics = canViewOwnerMetrics(state.currentRole);
  const timeline = buildCustomerTimeline(state);
  const customerActivityTimeline = [...timeline].reverse();
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
  const customerSmsHref = customer.phone ? `sms:${cleanPhone(customer.phone)}` : undefined;
  const customerEmailHref = customer.email ? `mailto:${customer.email}` : undefined;
  const shouldRenderLegacyDetails = false;

  return (
    <>
      <div className="hidden lg:block">
        <CustomerDesktopWorkspace
          activeTab={desktopTab}
          addresses={state.addresses}
          appliances={state.appliances}
          attachmentAction={attachmentAction}
          attachments={state.attachments}
          attachmentUrls={state.attachmentUrls}
          conversations={state.conversations}
          communicationEvents={state.communicationEvents}
          customer={customer}
          customerNotes={state.customerNotes}
          estimates={state.estimates}
          financialSnapshots={state.financialSnapshots}
          invoices={state.invoices}
          notes={state.notes}
          onCallCustomer={() => setIsBrowserCallOpen(true)}
          onAddNote={() => void addCustomerNote()}
          onEditCustomer={() => setIsProfileEditorOpen(true)}
          onNewJob={() => {
            router.push(`/dashboard/leads?newJob=1&customerId=${encodeURIComponent(customer.id)}`);
          }}
          onOpenActions={openCustomerActions}
          onOpenAssets={() => selectWorkspaceTab("assets")}
          onSelectJob={setSelectedDesktopJobId}
          onTabChange={setDesktopTab}
          onUploadFiles={(requestId, files) =>
            void uploadSelectedJobAttachments({ requestId, files })
          }
          payments={state.payments}
          returnTo={returnTo}
          selectedJobId={selectedDesktopJobId}
          servicePhotoUrls={state.servicePhotoUrls}
          servicePhotos={state.servicePhotos}
          serviceRequests={state.serviceRequests}
        />
      </div>

    <div className="mx-auto w-full max-w-[430px] bg-[#F8FAFC] px-3 pb-6 pt-3 sm:px-4 lg:hidden">
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
              onClick={openCustomerActions}
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
        <CustomerQuickAction
          label="Call"
          onClick={customer.phone ? () => setIsBrowserCallOpen(true) : undefined}
        />
        <CustomerQuickAction href={customerSmsHref} label="Text" />
        <CustomerQuickAction href={customerEmailHref} label="Email" />
        <CustomerQuickAction label="More" onClick={openCustomerActions} />
      </section>

      {isBrowserCallOpen ? (
        <BrowserCallModal
          onClose={() => setIsBrowserCallOpen(false)}
          target={{
            customerId: customer.id,
            displayName: getCustomerName(customer),
            phone: customer.phone,
          }}
        />
      ) : null}

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
            key={tab.id}
            onClick={() => selectWorkspaceTab(tab.id as CustomerWorkspaceTab)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {isCustomerActionsOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 px-3 pb-3 sm:items-center sm:pb-0">
          <button
            aria-label="Close customer actions"
            className="absolute inset-0 cursor-default"
            onClick={() => {
              setIsCustomerActionsOpen(false);
              setIsQuickNoteComposerOpen(false);
            }}
            type="button"
          />
          <div className="relative w-full max-w-[430px] rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-slate-950">Customer Actions</h2>
                <p className="text-sm text-slate-500">{getCustomerName(customer)}</p>
              </div>
              <button
                aria-label="Close customer actions"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                onClick={() => {
                  setIsCustomerActionsOpen(false);
                  setIsQuickNoteComposerOpen(false);
                }}
                type="button"
              >
                <CustomerOverviewIcon className="h-4 w-4" name="close" />
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              <button
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-[#0F6BFF] hover:bg-blue-50/40"
                onClick={() =>
                  void copyToClipboard(
                    getCustomerInfoClipboardText(customer),
                    "Customer info copied.",
                  )
                }
                type="button"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-[#0F6BFF]">
                  <CustomerOverviewIcon className="h-4 w-4" name="user" />
                </span>
                <span>
                  <span className="block text-sm font-black text-slate-950">
                    Copy Customer Info
                  </span>
                  <span className="block text-xs font-semibold text-slate-500">
                    Name, phone, and email
                  </span>
                </span>
              </button>

              <button
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition enabled:hover:border-[#0F6BFF] enabled:hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!explicitPrimaryAddressRecord}
                onClick={() => {
                  if (!explicitPrimaryAddressRecord) {
                    return;
                  }

                  void copyToClipboard(
                    getCustomerAddressClipboardText(explicitPrimaryAddressRecord),
                    "Primary address copied.",
                  );
                }}
                type="button"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-[#0F6BFF]">
                  <CustomerOverviewIcon className="h-4 w-4" name="pin" />
                </span>
                <span>
                  <span className="block text-sm font-black text-slate-950">
                    Copy Primary Address
                  </span>
                  <span className="block text-xs font-semibold text-slate-500">
                    {explicitPrimaryAddressRecord
                      ? "Street, unit, city, state, and ZIP"
                      : "No primary address saved"}
                  </span>
                </span>
              </button>

              <button
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-[#0F6BFF] hover:bg-blue-50/40"
                onClick={() => {
                  setIsCustomerActionsOpen(false);
                  router.push(
                    `/dashboard/leads?newJob=1&customerId=${encodeURIComponent(customer.id)}`,
                  );
                }}
                type="button"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-[#0F6BFF]">
                  <CustomerOverviewIcon className="h-4 w-4" name="briefcase" />
                </span>
                <span>
                  <span className="block text-sm font-black text-slate-950">New Job</span>
                  <span className="block text-xs font-semibold text-slate-500">
                    Start a job for this customer
                  </span>
                </span>
              </button>

              <button
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-[#0F6BFF] hover:bg-blue-50/40"
                onClick={() => {
                  setCustomerAction({ status: "idle", message: null });
                  setIsQuickNoteComposerOpen(true);
                }}
                type="button"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-[#0F6BFF]">
                  <CustomerOverviewIcon className="h-4 w-4" name="edit" />
                </span>
                <span>
                  <span className="block text-sm font-black text-slate-950">
                    Add Internal Note
                  </span>
                  <span className="block text-xs font-semibold text-slate-500">
                    Save a customer-level CRM note
                  </span>
                </span>
              </button>
            </div>

            {isQuickNoteComposerOpen ? (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <label className="grid gap-1.5 text-sm font-black text-slate-700">
                  Internal note
                  <textarea
                    className="min-h-[92px] resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-950 outline-none transition focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
                    onChange={(event) => setNoteBody(event.target.value)}
                    placeholder="Add a private customer note..."
                    value={noteBody}
                  />
                </label>
                <div className="mt-3 flex gap-2">
                  <button
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-100"
                    onClick={() => {
                      setIsQuickNoteComposerOpen(false);
                      setNoteAction({ status: "idle", message: null });
                    }}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="flex-1 rounded-xl bg-[#0F6BFF] px-3 py-2 text-sm font-black text-white transition hover:bg-blue-700"
                    onClick={() => void addQuickCustomerNote()}
                    type="button"
                  >
                    Save Note
                  </button>
                </div>
                <div className="mt-3">
                  <ActionMessage actionState={noteAction} />
                </div>
              </div>
            ) : null}

            <div className="mt-3">
              <ActionMessage actionState={customerAction} />
            </div>
          </div>
        </div>
      ) : null}

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

      {activeTab === "more" ? (
        <CustomerMoreWorkspace
          addresses={state.addresses}
          customer={customer}
          customerNotes={state.customerNotes}
          lastServiceDate={lastServiceDate}
          noteAction={noteAction}
          noteBody={noteBody}
          onAddAddress={() => openAddressEditor()}
          onAddNote={() => void addCustomerNote()}
          onEditAddress={openAddressEditor}
          onEditCustomer={() => {
            setIsProfileEditorOpen(true);
          }}
          onNoteBodyChange={setNoteBody}
          serviceRequestCount={state.serviceRequests.length}
          totalAssets={state.appliances.length}
        />
      ) : null}

      {activeTab === "activity" ? (
        <CustomerActivityWorkspace
          items={customerActivityTimeline}
          onBack={() => selectWorkspaceTab("overview")}
        />
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
              onClick={openCustomerActivity}
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

      {isAddressEditorOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 px-3 pb-3 lg:items-center"
          role="dialog"
        >
          <button
            aria-label="Close address editor"
            className="absolute inset-0 cursor-default"
            onClick={() => setIsAddressEditorOpen(false)}
            type="button"
          />
          <div className="relative max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-[22px] bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-slate-950">
                {addressForm.id ? "Edit Address" : "Add Address"}
              </h2>
              <button
                aria-label="Close address editor"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100"
                onClick={() => setIsAddressEditorOpen(false)}
                type="button"
              >
                <CustomerOverviewIcon className="h-4 w-4" name="close" />
              </button>
            </div>
            <CustomerAddressEditForm
              actionState={addressAction}
              form={addressForm}
              onCancel={() => setIsAddressEditorOpen(false)}
              onChange={setAddressForm}
              onSubmit={() => void saveAddress()}
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
    </>
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

function CustomerMoreWorkspace({
  addresses,
  customer,
  customerNotes,
  lastServiceDate,
  noteAction,
  noteBody,
  onAddAddress,
  onAddNote,
  onEditAddress,
  onEditCustomer,
  onNoteBodyChange,
  serviceRequestCount,
  totalAssets,
}: {
  addresses: CustomerAddressRow[];
  customer: CustomerRow;
  customerNotes: CustomerInternalNoteRow[];
  lastServiceDate: string | null;
  noteAction: ActionState;
  noteBody: string;
  onAddAddress: () => void;
  onAddNote: () => void;
  onEditAddress: (address: CustomerAddressRow) => void;
  onEditCustomer: () => void;
  onNoteBodyChange: (value: string) => void;
  serviceRequestCount: number;
  totalAssets: number;
}) {
  return (
    <main className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
      <MoreCard
        actionLabel="Edit"
        icon="user"
        onAction={onEditCustomer}
        title="Contact Information"
      >
        <MoreInfoRow label="Full Name" value={getCustomerName(customer)} />
        <MoreInfoRow label="Phone" value={customer.phone || "No phone saved"} />
        <MoreInfoRow label="Email" value={customer.email || "No email saved"} />
      </MoreCard>

      <MoreCard
        actionLabel="+ Add Address"
        icon="pin"
        onAction={onAddAddress}
        title="Addresses"
      >
        {addresses.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {addresses.map((address) => (
              <button
                className="grid w-full grid-cols-[minmax(0,1fr)_18px] gap-3 py-3 text-left transition hover:text-[#0F6BFF]"
                key={address.id}
                onClick={() => onEditAddress(address)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-950">
                      {normalizeCustomerAddressType(address.label)}
                    </span>
                    {address.is_primary ? (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[0.68rem] font-black text-[#0F6BFF]">
                        Primary
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block break-words text-sm font-semibold leading-5 text-slate-800">
                    {[address.street_address, address.unit].filter(Boolean).join(", ") ||
                      "No street saved"}
                  </span>
                  <span className="mt-0.5 block break-words text-sm text-slate-500">
                    {[address.city, [address.state, address.zip_code].filter(Boolean).join(" ")]
                      .filter(Boolean)
                      .join(", ") || "No city saved"}
                  </span>
                </span>
                <CustomerOverviewIcon className="mt-5 h-4 w-4 text-slate-400" name="chevron" />
              </button>
            ))}
          </div>
        ) : (
          <EmptyMessage>No saved addresses</EmptyMessage>
        )}
      </MoreCard>

      <MoreCard
        actionLabel="Edit"
        icon="status"
        onAction={onEditCustomer}
        title="Customer Preferences"
      >
        <MoreInfoRow
          label="Preferred Contact Method"
          value={formatPreferredContact(customer.preferred_contact_method)}
        />
      </MoreCard>

      <MoreCard title="Internal Notes" icon="briefcase">
        <CustomerNotesPanel
          actionState={noteAction}
          customerNotes={customerNotes}
          jobNotes={[]}
          noteBody={noteBody}
          onNoteBodyChange={onNoteBodyChange}
          onSubmit={onAddNote}
          serviceRequests={[]}
          showJobNotes={false}
        />
      </MoreCard>

      <MoreCard title="Customer Information" icon="calendar">
        <MoreInfoRow label="Customer Since" value={formatDate(customer.created_at, "—")} />
        <MoreInfoRow label="Last Service" value={formatDate(lastServiceDate, "—")} />
        <MoreInfoRow label="Total Jobs" value={serviceRequestCount.toString()} />
        <MoreInfoRow label="Total Assets" value={totalAssets.toString()} />
      </MoreCard>
    </main>
  );
}

function MoreCard({
  actionLabel,
  children,
  icon,
  onAction,
  title,
}: {
  actionLabel?: string;
  children: ReactNode;
  icon: CustomerOverviewIconName;
  onAction?: () => void;
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-black text-slate-950">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#0F6BFF]">
            <CustomerOverviewIcon className="h-3.5 w-3.5" name={icon} />
          </span>
          <span className="truncate">{title}</span>
        </h2>
        {actionLabel && onAction ? (
          <button
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-[#0F6BFF] transition hover:bg-blue-50"
            onClick={onAction}
            type="button"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

function MoreInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-0.5 break-words text-sm font-bold leading-5 text-slate-950">
        {value || "—"}
      </p>
    </div>
  );
}

function CustomerAddressEditForm({
  actionState,
  form,
  onCancel,
  onChange,
  onSubmit,
}: {
  actionState: ActionState;
  form: CustomerAddressFormState;
  onCancel: () => void;
  onChange: (form: CustomerAddressFormState) => void;
  onSubmit: () => void;
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

  const update = <Key extends keyof CustomerAddressFormState>(
    key: Key,
    value: CustomerAddressFormState[Key],
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
      <label className="grid gap-2 text-sm font-bold text-slate-700">
        Address Type
        <select
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none focus:border-[#0F6BFF]"
          onChange={(event) => update("label", event.target.value)}
          value={normalizeCustomerAddressType(form.label)}
        >
          {CUSTOMER_ADDRESS_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-[#F8FAFC] px-3 py-3 text-sm font-bold text-slate-700">
        Set as Primary Address
        <input
          checked={form.isPrimary}
          className="h-5 w-5 accent-[#0F6BFF]"
          onChange={(event) => update("isPrimary", event.target.checked)}
          type="checkbox"
        />
      </label>
      <div className="relative grid gap-2 text-sm font-bold text-slate-700">
        <label htmlFor="customer-more-address">Street Address</label>
        <input
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
          id="customer-more-address"
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
      <div className="grid gap-3 md:grid-cols-2">
        <TextInput label="Apt / Unit / Suite" value={form.unit} onChange={(value) => update("unit", value)} />
        <TextInput label="City" value={form.city} onChange={(value) => update("city", value)} />
        <TextInput label="State" maxLength={2} value={form.state} onChange={(value) => update("state", value.toUpperCase())} />
        <TextInput label="ZIP" maxLength={5} value={form.zipCode} onChange={(value) => update("zipCode", cleanZip(value))} />
        <TextInput label="Country" maxLength={2} value={form.country} onChange={(value) => update("country", value.toUpperCase())} />
      </div>
      <ActionMessage actionState={actionState} />
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="rounded-xl bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={actionState.status === "saving"}
          onClick={onSubmit}
          type="button"
        >
          {actionState.status === "saving" ? "Saving..." : "Save Address"}
        </button>
      </div>
    </div>
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
  showJobNotes = true,
}: {
  customerNotes: CustomerInternalNoteRow[];
  jobNotes: ServiceRequestNoteRow[];
  serviceRequests: ServiceRequestRow[];
  noteBody: string;
  onNoteBodyChange: (value: string) => void;
  onSubmit: () => void;
  actionState: ActionState;
  showJobNotes?: boolean;
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

      {showJobNotes ? (
      <div>
        <h3 className="text-sm font-black uppercase tracking-[0.12em] text-slate-500">
          Job notes
        </h3>
        <div className="mt-3">
          <NotesList notes={jobNotes} serviceRequests={serviceRequests} />
        </div>
      </div>
      ) : null}
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

function CustomerActivityWorkspace({
  items,
  onBack,
}: {
  items: TimelineItem[];
  onBack: () => void;
}) {
  return (
    <main className="mt-3 grid gap-3">
      <section className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.045)]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <button
              className="inline-flex items-center gap-1 text-sm font-black text-[#0F6BFF]"
              onClick={onBack}
              type="button"
            >
              <CustomerOverviewIcon className="h-4 w-4" name="back" />
              Overview
            </button>
            <h2 className="mt-3 text-xl font-black text-slate-950">Customer Activity</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Complete customer timeline, newest first.
            </p>
          </div>
        </div>
      </section>

      <TimelineList items={items} />
    </main>
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
        href: `/dashboard/leads/${estimate.service_request_id}?tab=finance&estimateId=${encodeURIComponent(
          estimate.id,
        )}`,
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
        href: `/dashboard/leads/${estimate.service_request_id}?tab=finance&estimateId=${encodeURIComponent(
          estimate.id,
        )}`,
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
        href: `/dashboard/leads/${invoice.service_request_id}?tab=finance`,
      });
    }

    if (invoice.paid_at) {
      items.push({
        id: `invoice-paid-${invoice.id}`,
        at: invoice.paid_at,
        title: "Payment received",
        body: `${invoice.invoice_number} · ${formatMoney(invoice.total)}`,
        category: "payment",
        href: `/dashboard/leads/${invoice.service_request_id}?tab=finance`,
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
      href: `/dashboard/leads/${note.service_request_id}?tab=timeline`,
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
