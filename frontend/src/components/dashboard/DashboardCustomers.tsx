"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  getAddressAutocompleteAdapter,
  type AddressSuggestion,
} from "@/lib/address-autocomplete";
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

type ApplianceFormState = {
  id: string | null;
  applianceType: string;
  brand: string;
  modelNumber: string;
  serialNumber: string;
  purchaseYear: string;
  locationLabel: string;
  notes: string;
};

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
  brand: "",
  modelNumber: "",
  serialNumber: "",
  purchaseYear: "",
  locationLabel: "",
  notes: "",
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
    location_label: form.locationLabel.trim() || null,
    notes: form.notes.trim() || null,
  };
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

function getCustomerPrimaryAddress(addresses: CustomerAddressRow[]): CustomerAddressRow | undefined {
  const primary = addresses.find((address) => address.is_primary) ?? addresses[0];

  return primary;
}

function getCustomerPrimaryAddressLabel(addresses: CustomerAddressRow[]): string {
  const primary = getCustomerPrimaryAddress(addresses);

  return primary ? getAddressLabel(primary) : "No customer primary address saved yet.";
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

  return {
    id: appliance.id,
    applianceType: appliance.appliance_type,
    brand: appliance.brand ?? "",
    modelNumber: appliance.model_number ?? "",
    serialNumber: appliance.serial_number ?? "",
    purchaseYear: appliance.purchase_year?.toString() ?? "",
    locationLabel: appliance.location_label ?? "",
    notes: appliance.notes ?? "",
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
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${statusBadgeClass(
        value,
      )}`}
    >
      {value.replaceAll("_", " ")}
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

  const customers = useMemo(() => {
    if (state.status !== "ready") {
      return [];
    }

    const normalized = normalizeSearch(query);
    if (!normalized) {
      return state.customers;
    }

    return state.customers.filter((customer) => {
      const requests = state.serviceRequests.filter(
        (request) => request.customer_id === customer.id,
      );
      const addresses = state.addresses.filter(
        (address) => address.customer_id === customer.id,
      );

      return [
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
    });
  }, [query, state]);

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
    <div className="mx-auto grid max-w-7xl gap-5">
      <header className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#0F6BFF]">
              Customer CRM
            </p>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Customers</h1>
            <p className="mt-2 text-sm text-slate-600">
              Search by name, phone, or email and open a complete customer workspace.
            </p>
          </div>
          <div className="grid gap-3 lg:w-[28rem]">
            <label className="grid gap-2 text-sm font-semibold text-slate-700">
              Search customers
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, phone, email, address, ZIP"
                className="h-11 rounded-xl border border-slate-200 px-3 text-slate-950 outline-none focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <button
              className="rounded-xl bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white transition hover:bg-[#0057D9]"
              onClick={() => setShowCreateForm((current) => !current)}
              type="button"
            >
              {showCreateForm ? "Close Create Customer" : "Create Customer"}
            </button>
          </div>
        </div>
      </header>

      {showCreateForm ? (
        <SectionCard title="Create Customer" eyebrow="Manual CRM entry">
          <CustomerEditForm
            form={createForm}
            onChange={setCreateForm}
            onSubmit={() => void createCustomer()}
            submitLabel="Create Customer"
            actionState={createState}
          />
        </SectionCard>
      ) : null}

      {customers.length > 0 ? (
        <section className="grid gap-4">
          {customers.map((customer) => {
            const requests = state.serviceRequests.filter(
              (request) => request.customer_id === customer.id,
            );
            const addresses = state.addresses.filter(
              (address) => address.customer_id === customer.id,
            );
            const latestRequest = requests[0];
            const primaryAddress = getCustomerPrimaryAddressLabel(addresses);

            return (
              <Link
                key={customer.id}
                href={`/dashboard/customers/${customer.id}`}
                className="block rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)] transition hover:border-[#0F6BFF] hover:bg-blue-50"
              >
                <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-black text-slate-950">
                        {getCustomerName(customer)}
                      </h2>
                      <StatusPill value={customer.customer_status} />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-700">
                      {customer.phone || "No phone"}
                    </p>
                    <p className="mt-1 line-clamp-1 text-sm text-slate-500">
                      {primaryAddress}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                      Last job
                    </p>
                    <p className="mt-1 font-bold text-slate-950">
                      {latestRequest
                        ? [latestRequest.appliance_brand, latestRequest.appliance_type]
                            .filter(Boolean)
                            .join(" ") || "Linked job"
                        : "No jobs yet"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {latestRequest ? formatDate(latestRequest.created_at) : ""}
                    </p>
                  </div>

                  <span className="text-sm font-black text-[#0F6BFF]">
                    View customer
                  </span>
                </div>
              </Link>
            );
          })}
        </section>
      ) : (
        <section className="rounded-[24px] border border-dashed border-slate-300 bg-white p-6 text-center shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
          <h2 className="text-xl font-black text-slate-950">No customers found</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Customer profiles appear after customer-linked service requests are saved.
          </p>
        </section>
      )}
    </div>
  );
}

export function DashboardCustomerDetail({ customerId }: { customerId: string }) {
  const [state, setState] = useState<CustomerDetailState>({ status: "loading" });
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
  const [noteAction, setNoteAction] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [expandedSections, setExpandedSections] = useState<Record<CustomerSectionKey, boolean>>({
    profile: true,
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

      if (isMounted) {
        setState({
          status: "ready",
          customer: (customerResult.data as CustomerRow | null) ?? null,
          serviceRequests: (requestsResult.data ?? []) as ServiceRequestRow[],
          appliances: (appliancesResult.data ?? []) as CustomerApplianceRow[],
          addresses: (addressesResult.data ?? []) as CustomerAddressRow[],
          estimates: (estimatesResult.data ?? []) as ServiceRequestEstimateRow[],
          invoices: (invoicesResult.data ?? []) as ServiceRequestInvoiceRow[],
          notes: (notesResult.data ?? []) as ServiceRequestNoteRow[],
          customerNotes: (customerNotesResult.data ?? []) as CustomerInternalNoteRow[],
          conversations: (conversationsResult.data ?? []) as CommunicationConversationRow[],
          communicationEvents: (timelineResult.data ?? []) as CommunicationTimelineEventRow[],
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

  function refreshCustomer() {
    setReloadKey((value) => value + 1);
  }

  function toggleSection(section: CustomerSectionKey) {
    setExpandedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
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

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setApplianceAction({ status: "error", message: "Customer CRM is not configured." });
      return;
    }

    setApplianceAction({ status: "saving", message: "Saving appliance..." });

    const { error } = await supabase.rpc("upsert_customer_appliance_rpc", {
      p_customer_id: customerId,
      p_appliance_id: applianceForm.id,
      p_payload: buildAppliancePayload(applianceForm),
    });

    if (error) {
      setApplianceAction({ status: "error", message: error.message });
      return;
    }

    setApplianceAction({
      status: "success",
      message: applianceForm.id ? "Appliance saved." : "Appliance added.",
    });
    setApplianceForm(emptyApplianceForm);
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
  const latestJob = state.serviceRequests[0];
  const primaryAddress = getCustomerPrimaryAddressLabel(state.addresses);
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

  return (
    <div className="mx-auto grid max-w-7xl gap-5">
      <header className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
        <Link href="/dashboard/customers" className="text-sm font-bold text-[#0F6BFF]">
          Back to customers
        </Link>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-black text-slate-950">{getCustomerName(customer)}</h1>
              <StatusPill value={customer.customer_status} />
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {customer.phone || "No phone"} · {customer.email || "No email"}
            </p>
            <p className="mt-1 text-sm text-slate-500">{primaryAddress}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric label="Open jobs" value={openJobs.length.toString()} />
            <Metric label="Assets" value={state.appliances.length.toString()} />
            <Metric label="Last job" value={latestJob ? formatDate(latestJob.created_at) : "None"} />
            <Metric label="Customer since" value={formatDate(customer.created_at)} />
            {ownerCanViewMetrics ? (
              <>
                <Metric label="Lifetime revenue" value={formatShortMoney(lifetimeRevenue)} />
                <Metric label="Outstanding" value={formatShortMoney(outstandingBalance)} />
              </>
            ) : null}
          </div>
        </div>
      </header>

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
            form={applianceForm}
            onCancel={() => setApplianceForm(emptyApplianceForm)}
            onChange={setApplianceForm}
            onSubmit={() => void saveAppliance()}
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
    <label className="grid gap-2 text-sm font-bold text-slate-700">
      {label}
      <input
        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
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
                <div>
                  <p className="font-black text-slate-950">
                    {appliance.brand || "Brand not saved"} {appliance.appliance_type}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {appliance.location_label || "Location not saved"}
                  </p>
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
  form,
  onChange,
  onSubmit,
  onCancel,
  actionState,
}: {
  form: ApplianceFormState;
  onChange: (form: ApplianceFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  actionState: ActionState;
}) {
  const update = <Key extends keyof ApplianceFormState>(
    key: Key,
    value: ApplianceFormState[Key],
  ) => onChange({ ...form, [key]: value });

  return (
    <div className="mt-3 grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <TextInput label="Appliance type" value={form.applianceType} onChange={(value) => update("applianceType", value)} />
        <TextInput label="Brand" value={form.brand} onChange={(value) => update("brand", value)} />
        <TextInput label="Model" value={form.modelNumber} onChange={(value) => update("modelNumber", value)} />
        <TextInput label="Serial" value={form.serialNumber} onChange={(value) => update("serialNumber", value)} />
        <TextInput label="Purchase year" maxLength={4} value={form.purchaseYear} onChange={(value) => update("purchaseYear", value.replace(/[^0-9]/g, "").slice(0, 4))} />
        <TextInput label="Location" value={form.locationLabel} onChange={(value) => update("locationLabel", value)} />
      </div>
      <label className="grid gap-2 text-sm font-bold text-slate-700">
        Notes
        <textarea
          className="min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-950 outline-none transition focus:border-[#0F6BFF] focus:ring-4 focus:ring-blue-100"
          onChange={(event) => update("notes", event.target.value)}
          value={form.notes}
        />
      </label>
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
