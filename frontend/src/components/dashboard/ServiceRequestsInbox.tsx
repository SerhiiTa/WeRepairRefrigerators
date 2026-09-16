"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getAddressAutocompleteAdapter,
  type AddressSuggestion,
} from "@/lib/address-autocomplete";
import {
  COMMON_APPLIANCE_BRANDS,
  COMMON_APPLIANCE_TYPES,
} from "@/lib/appliance-options";
import {
  formatServiceRequestSource,
  mapServiceRequestRow,
  SERVICE_REQUEST_CRM_STATUSES,
  SERVICE_REQUEST_SELECT_COLUMNS,
  SERVICE_REQUEST_STATUS_TONES,
  type DashboardServiceRequest,
  type DashboardServiceRequestStatus,
} from "@/lib/service-request-records";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CustomerApplianceRow,
  CustomerAddressRow,
  CustomerRow,
  ServiceRequestRow,
  TechnicianProfileRow,
} from "@/lib/supabase/types";

type LoadState =
  | { status: "loading"; error: null }
  | { status: "ready"; error: null }
  | { status: "error"; error: string };

type DateFilter = "all" | "today" | "scheduled" | "unscheduled";
type StatusFilter = "all" | DashboardServiceRequestStatus;

type InvoiceSummaryRow = {
  created_at: string | null;
  invoice_status: string | null;
  paid_at: string | null;
  total: number | null;
};

type CustomerOption = {
  city: string | null;
  id: string;
  email: string | null;
  fullName: string;
  state: string | null;
  streetAddress: string | null;
  unit: string | null;
  phone: string | null;
  zipCode: string | null;
};

type TechnicianOption = {
  businessName: string | null;
  displayName: string | null;
  id: string;
};

type CommunicationCounts = Record<
  string,
  {
    messages: number;
    phone: number;
  }
>;

type NewJobForm = {
  assignedTechnicianId: string;
  appointmentDate: string;
  applianceType: string;
  brand: string;
  city: string;
  customerEmail: string;
  customerFirstName: string;
  customerLastName: string;
  customerSearch: string;
  customerPhone: string;
  modelNumber: string;
  problemDescription: string;
  scheduleMode: "later" | "now";
  selectedAssetId: string;
  selectedCustomerId: string;
  serialNumber: string;
  serviceAddress: string;
  state: string;
  unit: string;
  windowEndTime: string;
  windowStartTime: string;
  zipCode: string;
};

type NewJobState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type AssetJobPrefill = Pick<
  CustomerApplianceRow,
  | "appliance_type"
  | "brand"
  | "customer_address_id"
  | "id"
  | "model_number"
  | "serial_number"
>;

type AssetAddressPrefill = Pick<
  CustomerAddressRow,
  "city" | "state" | "street_address" | "unit" | "zip_code"
>;

const STATUS_FILTER_LABELS: Partial<Record<DashboardServiceRequestStatus, string>> = {
  canceled: "Cancelled",
  parts_needed: "Waiting Parts",
  return_visit_scheduled: "Return Visit",
};

const emptyNewJobForm: NewJobForm = {
  assignedTechnicianId: "",
  appointmentDate: "",
  applianceType: "Refrigerator",
  brand: "",
  city: "",
  customerEmail: "",
  customerFirstName: "",
  customerLastName: "",
  customerSearch: "",
  customerPhone: "",
  modelNumber: "",
  problemDescription: "",
  scheduleMode: "later",
  selectedAssetId: "",
  selectedCustomerId: "",
  serialNumber: "",
  serviceAddress: "",
  state: "TX",
  unit: "",
  windowEndTime: "",
  windowStartTime: "",
  zipCode: "",
};

function getReadErrorMessage(message: string): string {
  if (message.includes("permission denied") || message.includes("row-level security")) {
    return "This account cannot read jobs yet. Confirm the dashboard account has access to the selected technician or company workspace.";
  }

  if (message.includes("service_requests") && message.includes("schema cache")) {
    return "Job storage is not ready for this workspace yet.";
  }

  return message;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getCityZip(request: DashboardServiceRequest) {
  const cityZip = [request.city, request.zipCode].filter(Boolean).join(" ");

  if (cityZip) {
    return cityZip;
  }

  return request.state || "Location needed";
}

function getApplianceLabel(request: DashboardServiceRequest) {
  return [
    request.applianceBrand,
    request.applianceType,
    request.applianceModel ? `(${request.applianceModel})` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function formatAppointmentStartTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const [hourValue, minuteValue = "00"] = value.split(":");
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2026, 0, 1, hour, minute));
}

function formatLooseAppointmentStartTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timeMatch = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);

  if (timeMatch) {
    const rawHour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] ?? "0");
    const period = timeMatch[3]?.toUpperCase();
    const hour =
      period === "PM" && rawHour < 12
        ? rawHour + 12
        : period === "AM" && rawHour === 12
          ? 0
          : rawHour;

    return formatAppointmentStartTime(
      `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    );
  }

  return null;
}

function getAppointmentLabel(request: DashboardServiceRequest) {
  if (request.scheduledWindowStartTime) {
    return formatAppointmentStartTime(request.scheduledWindowStartTime) ?? "Scheduled";
  }

  return (
    formatLooseAppointmentStartTime(request.preferredTimeWindow) ||
    request.preferredTimeWindow ||
    "Not scheduled"
  );
}

function looksLikeInternalListText(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized) {
    return false;
  }

  return /\b(?:qa[-_\s]*addr|qa\d{4}|dedupe|address\s+workflow\s+test|whw[0-9a-z]+)\b/i.test(
    normalized,
  );
}

function getListCustomerName(request: DashboardServiceRequest) {
  if (looksLikeInternalListText(request.customerName)) {
    return "Customer name needed";
  }

  return request.customerName || "Customer name needed";
}

function getListProblemDescription(request: DashboardServiceRequest) {
  if (looksLikeInternalListText(request.issueDescription)) {
    return "Problem details needed";
  }

  return request.issueDescription || "Problem details needed";
}

function getTechnicianLabel(request: DashboardServiceRequest) {
  if (request.selectedTechnicianBusinessName) {
    return request.selectedTechnicianBusinessName;
  }

  if (request.assignedTechnicianProfileId) {
    return "Assigned technician";
  }

  return "Unassigned";
}

function getStatusFilterLabel(status: DashboardServiceRequestStatus) {
  return STATUS_FILTER_LABELS[status] ?? formatServiceRequestSource(status);
}

function getTechnicianOptionLabel(technician: TechnicianOption) {
  return (
    technician.businessName ||
    technician.displayName ||
    "Technician"
  );
}

function isActiveJob(request: DashboardServiceRequest) {
  return !["completed", "closed", "canceled"].includes(request.status);
}

async function getAccessToken() {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    throw new Error("Log in again before creating a job.");
  }

  return data.session.access_token;
}

function splitCustomerName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function cleanZip(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, 5);
}

function getPhoneDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeUSPhone(value: string) {
  const digits = getPhoneDigits(value);
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (national.length === 10) {
    return `+1${national}`;
  }

  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }

  return value.trim();
}

function formatUSPhone(value: string | null | undefined) {
  const digits = getPhoneDigits(value);
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (national.length !== 10) {
    if (digits.length >= 11 && digits.length <= 15) {
      return `+${digits}`;
    }

    return value ?? "";
  }

  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getRequestMonthKey(request: DashboardServiceRequest) {
  const sourceDate = request.scheduledDate || request.createdAt;
  return sourceDate.slice(0, 7);
}

function getMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function shiftMonth(monthKey: string, offset: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const nextDate = new Date(year, month - 1 + offset, 1);
  return getMonthKey(nextDate);
}

function getJobDateParts(request: DashboardServiceRequest) {
  const dateValue = request.scheduledDate || request.createdAt.slice(0, 10);
  const date = new Date(`${dateValue}T12:00:00`);
  const day = Number.isNaN(date.getTime())
    ? dateValue.slice(-2)
    : new Intl.DateTimeFormat("en-US", { day: "2-digit" }).format(date);
  const month = Number.isNaN(date.getTime())
    ? dateValue.slice(5, 7)
    : new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);

  return { day, month };
}

function requestMatchesDateFilter(
  request: DashboardServiceRequest,
  dateFilter: DateFilter,
) {
  if (dateFilter === "all") {
    return true;
  }

  if (dateFilter === "scheduled") {
    return Boolean(request.scheduledDate || request.appointmentId);
  }

  if (dateFilter === "unscheduled") {
    return !request.scheduledDate && !request.appointmentId;
  }

  return request.scheduledDate === getTodayKey();
}

export function ServiceRequestsInbox() {
  const [communicationCounts, setCommunicationCounts] = useState<CommunicationCounts>({});
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [invoiceSummaries, setInvoiceSummaries] = useState<InvoiceSummaryRow[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [requests, setRequests] = useState<DashboardServiceRequest[]>([]);
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    error: null,
  });
  const [newJobForm, setNewJobForm] = useState<NewJobForm>(emptyNewJobForm);
  const [newJobState, setNewJobState] = useState<NewJobState>({
    status: "idle",
    message: null,
  });
  const customerPrefillHandledRef = useRef<string | null>(null);
  const [addressFocused, setAddressFocused] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressState, setAddressState] = useState<
    { status: "idle" | "searching" | "error"; message: string | null }
  >({ status: "idle", message: null });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => getMonthKey(new Date()));
  const [showFilters, setShowFilters] = useState(false);
  const [showNewJobWizard, setShowNewJobWizard] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [technicianFilter, setTechnicianFilter] = useState("All technicians");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  useEffect(() => {
    let isMounted = true;

    async function loadRequests() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setLoadState({
            status: "error",
            error: "Job reads are not configured for this dashboard session.",
          });
        }
        return;
      }

      const { data, error } = await supabase
        .from("service_requests")
        .select(SERVICE_REQUEST_SELECT_COLUMNS)
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        setLoadState({
          status: "error",
          error: getReadErrorMessage(error.message),
        });
        return;
      }

      const [
        customersResult,
        customerAddressesResult,
        conversationsResult,
        techniciansResult,
        invoicesResult,
      ] = await Promise.all([
        supabase
          .from("customers")
          .select("id,full_name,phone,email")
          .order("updated_at", { ascending: false })
          .limit(100),
        supabase
          .from("customer_addresses")
          .select("customer_id,street_address,unit,city,state,zip_code,is_primary")
          .eq("is_primary", true)
          .limit(200),
        supabase
          .from("communication_conversations")
          .select("service_request_id,primary_source_type")
          .not("service_request_id", "is", null),
        supabase
          .from("technician_profiles")
          .select("id,display_name,business_name")
          .eq("technician_status", "verified")
          .order("updated_at", { ascending: false })
          .limit(50),
        supabase
          .from("service_request_invoices")
          .select("total,invoice_status,paid_at,created_at")
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);

      setRequests((data as unknown as ServiceRequestRow[]).map(mapServiceRequestRow));
      if (!customersResult.error) {
        const addressByCustomerId = new Map(
          ((customerAddressesResult.data ?? []) as Pick<
            CustomerAddressRow,
            | "city"
            | "customer_id"
            | "is_primary"
            | "state"
            | "street_address"
            | "unit"
            | "zip_code"
          >[]).map((address) => [address.customer_id, address]),
        );

        setCustomers(
          ((customersResult.data ?? []) as Pick<
            CustomerRow,
            "email" | "full_name" | "id" | "phone"
          >[]).map((customer) => ({
            city: addressByCustomerId.get(customer.id)?.city ?? null,
            id: customer.id,
            email: customer.email,
            fullName: customer.full_name,
            phone: customer.phone,
            state: addressByCustomerId.get(customer.id)?.state ?? null,
            streetAddress: addressByCustomerId.get(customer.id)?.street_address ?? null,
            unit: addressByCustomerId.get(customer.id)?.unit ?? null,
            zipCode: addressByCustomerId.get(customer.id)?.zip_code ?? null,
          })),
        );
      }
      if (!techniciansResult.error) {
        const nextTechnicians = ((techniciansResult.data ?? []) as Pick<
          TechnicianProfileRow,
          "business_name" | "display_name" | "id"
        >[]).map((technician) => ({
          businessName: technician.business_name,
          displayName: technician.display_name,
          id: technician.id,
        }));

        setTechnicians(nextTechnicians);
      }
      if (!conversationsResult.error) {
        const counts = ((conversationsResult.data ?? []) as {
          primary_source_type: string;
          service_request_id: string | null;
        }[]).reduce<CommunicationCounts>((nextCounts, conversation) => {
          if (!conversation.service_request_id) {
            return nextCounts;
          }

          const current = nextCounts[conversation.service_request_id] ?? {
            messages: 0,
            phone: 0,
          };
          const isPhone = conversation.primary_source_type === "phone";
          nextCounts[conversation.service_request_id] = {
            messages: current.messages + (isPhone ? 0 : 1),
            phone: current.phone + (isPhone ? 1 : 0),
          };
          return nextCounts;
        }, {});

        setCommunicationCounts(counts);
      }
      if (!invoicesResult.error) {
        setInvoiceSummaries((invoicesResult.data ?? []) as InvoiceSummaryRow[]);
      }
      setLoadState({ status: "ready", error: null });
    }

    void loadRequests();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const query = newJobForm.serviceAddress.trim();

    if (!addressFocused || query.length < 3) {
      const timeoutId = window.setTimeout(() => {
        setAddressSuggestions([]);
        setAddressState({ status: "idle", message: null });
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    const adapter = getAddressAutocompleteAdapter();

    if (!adapter.isConfigured) {
      const timeoutId = window.setTimeout(() => {
        setAddressSuggestions([]);
        setAddressState({ status: "idle", message: null });
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setAddressState({ status: "searching", message: "Searching addresses..." });
      adapter
        .search(query)
        .then((suggestions) => {
          if (!cancelled) {
            setAddressSuggestions(suggestions);
            setAddressState({ status: "idle", message: null });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setAddressSuggestions([]);
            setAddressState({
              status: "error",
              message: "Address search is unavailable. Manual entry still works.",
            });
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [addressFocused, newJobForm.serviceAddress]);

  const statusOptions = useMemo(() => {
    const statusesInUse = new Set(requests.map((request) => request.status));

    return SERVICE_REQUEST_CRM_STATUSES.filter((status) => statusesInUse.has(status));
  }, [requests]);

  const technicianOptions = useMemo(
    () => [
      "All technicians",
      ...Array.from(new Set(requests.map(getTechnicianLabel))).filter(
        (label) => label !== "Unassigned",
      ),
      "Unassigned",
    ],
    [requests],
  );

  const customerMatches = useMemo(() => {
    const query = newJobForm.customerSearch.trim().toLowerCase();

    const digitQuery = getPhoneDigits(query);

    if (query.length < 2 && digitQuery.length < 2) {
      return [];
    }

    return customers
      .filter((customer) =>
        [
          customer.fullName,
          customer.phone,
          formatUSPhone(customer.phone),
          customer.email,
          customer.streetAddress,
          customer.city,
          customer.zipCode,
        ]
          .filter(Boolean)
          .some((value) => {
            const normalizedValue = value?.toLowerCase() ?? "";
            const valueDigits = getPhoneDigits(value);
            return (
              normalizedValue.includes(query) ||
              (digitQuery.length >= 2 && valueDigits.includes(digitQuery))
            );
          }),
      )
      .slice(0, 6);
  }, [customers, newJobForm.customerSearch]);

  const monthRequests = useMemo(
    () => requests.filter((request) => getRequestMonthKey(request) === selectedMonth),
    [requests, selectedMonth],
  );

  const filteredRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const digitQuery = getPhoneDigits(query);

    return monthRequests.filter((request) => {
      const statusMatches =
        statusFilter === "all" ? true : request.status === statusFilter;
      const technicianMatches =
        technicianFilter === "All technicians"
          ? true
          : getTechnicianLabel(request) === technicianFilter;
      const dateMatches = requestMatchesDateFilter(request, dateFilter);
      const queryMatches =
        query.length === 0
          ? true
          : [
              request.customerName,
              request.customerEmail,
              request.customerPhone,
              request.applianceType,
              request.applianceBrand,
              request.applianceModel,
              request.issueDescription,
              request.fullAddress,
              request.streetAddress,
              request.unit,
              request.city,
              request.state,
              request.zipCode,
              getTechnicianLabel(request),
            ]
              .filter(Boolean)
              .some((value) => {
                const normalizedValue = value?.toLowerCase() ?? "";
                const valueDigits = getPhoneDigits(value);
                return (
                  normalizedValue.includes(query) ||
                  (digitQuery.length > 0 && valueDigits.includes(digitQuery))
                );
              });

      return statusMatches && technicianMatches && dateMatches && queryMatches;
    });
  }, [dateFilter, monthRequests, searchQuery, statusFilter, technicianFilter]);

  const summary = useMemo(() => {
    const gross = invoiceSummaries.reduce((sum, invoice) => {
      if (invoice.invoice_status !== "paid") {
        return sum;
      }

      const activityDate = invoice.paid_at ?? invoice.created_at;
      if (!activityDate || activityDate.slice(0, 7) !== selectedMonth) {
        return sum;
      }

      return sum + Number(invoice.total ?? 0);
    }, 0);

    return {
      jobs: monthRequests.length,
      active: monthRequests.filter(isActiveJob).length,
      gross,
    };
  }, [invoiceSummaries, monthRequests, selectedMonth]);

  useEffect(() => {
    if (typeof window === "undefined" || customers.length === 0) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const shouldOpenNewJob = params.get("newJob") === "1";
    const customerId = params.get("customerId");
    const assetId = params.get("assetId");
    const prefillKey = [customerId, assetId ?? ""].join(":");

    if (
      !shouldOpenNewJob ||
      !customerId ||
      customerPrefillHandledRef.current === prefillKey
    ) {
      return;
    }

    const matchingCustomer = customers.find((customer) => customer.id === customerId);

    if (!matchingCustomer) {
      return;
    }

    customerPrefillHandledRef.current = prefillKey;

    const timeoutId = window.setTimeout(() => {
      const supabase = getSupabaseBrowserClient();

      void (async () => {
        const nameParts = splitCustomerName(matchingCustomer.fullName);
        let asset: AssetJobPrefill | null = null;
        let assetAddress: AssetAddressPrefill | null = null;

        if (assetId && supabase) {
          const { data: assetData } = await supabase
            .from("customer_appliances")
            .select("id,customer_id,customer_address_id,appliance_type,brand,model_number,serial_number")
            .eq("id", assetId)
            .eq("customer_id", customerId)
            .maybeSingle();

          asset = (assetData ?? null) as AssetJobPrefill | null;

          if (asset?.customer_address_id) {
            const { data: addressData } = await supabase
              .from("customer_addresses")
              .select("street_address,unit,city,state,zip_code")
              .eq("id", asset.customer_address_id)
              .eq("customer_id", customerId)
              .maybeSingle();

            assetAddress = (addressData ?? null) as AssetAddressPrefill | null;
          }
        }

        setNewJobForm({
          ...emptyNewJobForm,
          applianceType: asset?.appliance_type || emptyNewJobForm.applianceType,
          brand: asset?.brand ?? "",
          city: assetAddress?.city ?? matchingCustomer.city ?? "",
          customerEmail: matchingCustomer.email ?? "",
          customerFirstName: nameParts.firstName,
          customerLastName: nameParts.lastName,
          customerPhone: formatUSPhone(matchingCustomer.phone),
          customerSearch: [
            matchingCustomer.fullName,
            matchingCustomer.phone,
            matchingCustomer.email,
          ]
            .filter(Boolean)
            .join(" · "),
          modelNumber: asset?.model_number ?? "",
          selectedAssetId: asset?.id ?? "",
          selectedCustomerId: customerId,
          serialNumber: asset?.serial_number ?? "",
          serviceAddress: assetAddress?.street_address ?? matchingCustomer.streetAddress ?? "",
          state: assetAddress?.state ?? matchingCustomer.state ?? "TX",
          unit: assetAddress?.unit ?? matchingCustomer.unit ?? "",
          zipCode: cleanZip(assetAddress?.zip_code ?? matchingCustomer.zipCode ?? ""),
        });
        setShowNewJobWizard(true);
        setNewJobState({ status: "idle", message: null });
      })();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [customers, technicians]);

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setTechnicianFilter("All technicians");
    setDateFilter("all");
    setShowFilters(false);
  }

  function closeNewJobWizard() {
    setShowNewJobWizard(false);
    setNewJobForm(emptyNewJobForm);
    setNewJobState({ status: "idle", message: null });
    setAddressFocused(false);
    setAddressSuggestions([]);
    setAddressState({ status: "idle", message: null });
  }

  function updateNewJobForm<K extends keyof NewJobForm>(
    key: K,
    value: NewJobForm[K],
  ) {
    setNewJobForm((current) => ({ ...current, [key]: value }));
    if (key === "serviceAddress") {
      setAddressFocused(true);
    }
    setNewJobState({ status: "idle", message: null });
  }

  function selectExistingCustomer(customerId: string) {
    const customer = customers.find((option) => option.id === customerId);
    const nameParts = customer ? splitCustomerName(customer.fullName) : null;

    setNewJobForm((current) => ({
      ...current,
      city: customer?.city ?? current.city,
      customerEmail: customer?.email ?? "",
      customerFirstName: nameParts?.firstName ?? "",
      customerLastName: nameParts?.lastName ?? "",
      customerPhone: formatUSPhone(customer?.phone),
      customerSearch: customer
        ? [customer.fullName, customer.phone, customer.email].filter(Boolean).join(" · ")
        : current.customerSearch,
      selectedCustomerId: customerId,
      serviceAddress: customer?.streetAddress ?? current.serviceAddress,
      state: customer?.state ?? current.state,
      unit: customer?.unit ?? current.unit,
      zipCode: cleanZip(customer?.zipCode ?? current.zipCode),
    }));
    setAddressSuggestions([]);
    setAddressFocused(false);
    setNewJobState({ status: "idle", message: null });
  }

  async function selectAddressSuggestion(suggestion: AddressSuggestion) {
    try {
      const adapter = getAddressAutocompleteAdapter();
      const resolved = adapter.resolve ? await adapter.resolve(suggestion) : suggestion;

      setNewJobForm((current) => ({
        ...current,
        city: resolved.city,
        serviceAddress: resolved.streetAddress || resolved.label,
        state: resolved.state || current.state,
        unit: resolved.unit ?? current.unit,
        zipCode: cleanZip(resolved.zipCode),
      }));
      setAddressFocused(false);
      setAddressSuggestions([]);
      setAddressState({ status: "idle", message: null });
    } catch {
      setAddressSuggestions([]);
      setAddressState({
        status: "error",
        message: "Could not fill that address. Manual entry still works.",
      });
    }
  }

  function validateNewJobForm(): string | null {
    const hasCustomer = Boolean(
      newJobForm.customerFirstName.trim() ||
        newJobForm.customerLastName.trim() ||
        newJobForm.customerPhone.trim() ||
        newJobForm.customerEmail.trim() ||
        newJobForm.selectedCustomerId,
    );

    if (!hasCustomer) {
      return "Enter or select a customer before creating a job.";
    }

    if (cleanZip(newJobForm.zipCode).length !== 5) {
      return "Enter a 5-digit service ZIP before creating a job.";
    }

    if (!newJobForm.applianceType.trim()) {
      return "Choose an appliance type.";
    }

    if (!newJobForm.problemDescription.trim()) {
      return "Describe the problem before creating a job.";
    }

    if (newJobForm.scheduleMode === "now") {
      if (!newJobForm.appointmentDate) {
        return "Choose an appointment date or switch Schedule now off.";
      }

      if (!newJobForm.windowStartTime || !newJobForm.windowEndTime) {
        return "Choose a start and end time or switch Schedule now off.";
      }
    }

    return null;
  }

  async function createJobFromWizard() {
    const firstError = validateNewJobForm();

    if (firstError) {
      setNewJobState({ status: "error", message: firstError });
      return;
    }

    setNewJobState({ status: "saving", message: "Creating job..." });

    try {
      const accessToken = await getAccessToken();
      const fullName = [newJobForm.customerFirstName, newJobForm.customerLastName]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" ");
      const appointmentWindow =
        newJobForm.scheduleMode === "now"
          ? `${newJobForm.appointmentDate} ${newJobForm.windowStartTime}-${newJobForm.windowEndTime}`
          : "Schedule later";

      const intakeResponse = await fetch("/api/intake", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          appointmentDate:
            newJobForm.scheduleMode === "now" ? newJobForm.appointmentDate : null,
          applianceType: newJobForm.applianceType,
          brand: newJobForm.brand,
          city: newJobForm.city,
          country: "US",
          customerEmail: newJobForm.customerEmail,
          customerFirstName: newJobForm.customerFirstName,
          customerLastName: newJobForm.customerLastName,
          customerName: fullName,
          customerPhone: normalizeUSPhone(newJobForm.customerPhone),
          duplicateConfirmed: true,
          customerApplianceId: newJobForm.selectedAssetId || null,
          modelNumber: newJobForm.modelNumber,
          problemDescription: newJobForm.problemDescription,
          preferredAppointmentWindow: appointmentWindow,
          rawMessage: [
            `Manual job created from Jobs Center: ${newJobForm.problemDescription}`,
            newJobForm.serialNumber ? `Serial: ${newJobForm.serialNumber}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          serviceAddress: newJobForm.serviceAddress,
          sourceName: "Jobs Center",
          sourceType: "manual",
          state: newJobForm.state || "TX",
          status: "ready_to_convert",
          unit: newJobForm.unit,
          assignedTechnicianId: newJobForm.assignedTechnicianId || null,
          windowEndTime:
            newJobForm.scheduleMode === "now" ? newJobForm.windowEndTime : null,
          windowStartTime:
            newJobForm.scheduleMode === "now" ? newJobForm.windowStartTime : null,
          zipCode: cleanZip(newJobForm.zipCode),
        }),
      });
      const intakePayload = (await intakeResponse.json().catch(() => null)) as {
        intakeRequest?: { id?: string };
        message?: string;
        ok?: boolean;
      } | null;

      if (!intakeResponse.ok || !intakePayload?.ok || !intakePayload.intakeRequest?.id) {
        throw new Error(intakePayload?.message ?? "Could not prepare this job.");
      }

      const conversionResponse = await fetch(
        `/api/intake/${intakePayload.intakeRequest.id}/convert`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ allowPossibleDuplicate: true }),
        },
      );
      const conversionPayload = (await conversionResponse.json().catch(() => null)) as {
        conversion?: { serviceRequestId?: string | null };
        message?: string;
        ok?: boolean;
      } | null;

      if (
        !conversionResponse.ok ||
        !conversionPayload?.ok ||
        !conversionPayload.conversion?.serviceRequestId
      ) {
        throw new Error(conversionPayload?.message ?? "Could not create this job.");
      }

      if (newJobForm.selectedAssetId) {
        const supabase = getSupabaseBrowserClient();
        const { error: linkError } = supabase
          ? await supabase
              .from("service_requests")
              .update({ customer_appliance_id: newJobForm.selectedAssetId })
              .eq("id", conversionPayload.conversion.serviceRequestId)
          : { error: null };

        if (linkError) {
          throw new Error("Job was created, but the asset link could not be saved.");
        }
      }

      setNewJobState({ status: "success", message: "Job created. Opening it now..." });
      window.location.assign(
        `/dashboard/leads/${conversionPayload.conversion.serviceRequestId}`,
      );
    } catch (error) {
      setNewJobState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not create this job.",
      });
    }
  }

  if (loadState.status === "loading") {
    return (
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 text-sm font-semibold text-[#64748B] shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        Loading jobs...
      </section>
    );
  }

  if (loadState.status === "error") {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-700">
          Jobs unavailable
        </p>
        <h2 className="mt-3 text-2xl font-black text-[#0F172A]">
          The job inbox could not load.
        </h2>
        <p className="mt-3 max-w-3xl leading-7 text-amber-800">
          {loadState.error}
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <button
            aria-label="Previous month"
            className="grid h-10 w-10 place-items-center rounded-full border border-[#E5E7EB] text-lg font-black text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
            onClick={() => setSelectedMonth((current) => shiftMonth(current, -1))}
            type="button"
          >
            ‹
          </button>
          <div className="min-w-0 text-center">
            <h2 className="truncate text-lg font-black text-[#0F172A] sm:text-xl">
              {getMonthLabel(selectedMonth)}
            </h2>
          </div>
          <button
            aria-label="Next month"
            className="grid h-10 w-10 place-items-center rounded-full border border-[#E5E7EB] text-lg font-black text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
            onClick={() => setSelectedMonth((current) => shiftMonth(current, 1))}
            type="button"
          >
            ›
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {[
            ["Jobs", summary.jobs],
            ["Active", summary.active],
            ["Gross", formatMoney(summary.gross)],
          ].map(([label, value]) => (
            <article
              className="flex items-center justify-between rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-1.5"
              key={label}
            >
              <span className="text-base font-black tracking-tight text-[#0F172A]">
                {value}
              </span>
              <span className="text-[11px] font-black uppercase tracking-[0.06em] text-[#64748B]">
                {label}
              </span>
            </article>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Search jobs</span>
            <input
              className="w-full rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-2.5 text-sm text-[#0F172A] outline-none transition placeholder:text-[#64748B] focus:border-[#0F6BFF]"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search jobs"
              value={searchQuery}
            />
          </label>
          <button
            aria-label="Open job filters"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#E5E7EB] bg-white text-lg font-black text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
            onClick={() => setShowFilters(true)}
            type="button"
          >
            ≡
          </button>
          <button
            aria-label="New Job"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0F6BFF] text-xl font-black text-white transition hover:bg-[#0057D9]"
            onClick={() => {
              setNewJobForm({
                ...emptyNewJobForm,
              });
              setShowNewJobWizard(true);
              setNewJobState({ status: "idle", message: null });
            }}
            type="button"
          >
            +
          </button>
        </div>
      </section>

      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
          {filteredRequests.length} of {monthRequests.length} job
          {monthRequests.length === 1 ? "" : "s"}
        </p>
        <p className="text-xs font-semibold text-[#64748B]">
          {statusFilter === "all" ? "All statuses" : getStatusFilterLabel(statusFilter)}
        </p>
      </div>

      {filteredRequests.length > 0 ? (
        <div className="grid gap-1">
          {filteredRequests.map((request) => (
            <article
              className="w-full rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_4px_12px_rgba(15,23,42,0.025)] transition hover:border-[#0F6BFF]/30 hover:shadow-[0_8px_20px_rgba(15,23,42,0.05)]"
              key={request.id}
            >
              <Link
                className="flex w-full items-stretch gap-1.5 p-1.5"
                href={`/dashboard/leads/${request.id}`}
              >
                <div className="flex w-[3.75rem] max-w-24 shrink-0 flex-col justify-center rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-1 py-0.5 text-center">
                  <p className="text-[9px] font-black uppercase tracking-[0.06em] text-[#64748B]">
                    {getJobDateParts(request).month}
                  </p>
                  <p className="text-lg font-black leading-none text-[#0F172A]">
                    {getJobDateParts(request).day}
                  </p>
                  <p className="mt-0.5 truncate text-[9px] font-bold leading-tight text-[#475569]">
                    {getAppointmentLabel(request)}
                  </p>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <div className="flex min-w-0 items-start gap-2">
                    <h2 className="min-w-0 flex-1 truncate text-sm font-black leading-tight text-[#0F172A]">
                      {getListCustomerName(request)}
                    </h2>
                    <div className="flex max-w-[52%] shrink-0 justify-end">
                      <span className="[&>span]:max-w-[8.5rem] [&>span]:whitespace-normal [&>span]:px-1.5 [&>span]:py-0.5 [&>span]:text-center [&>span]:text-[9px] [&>span]:leading-tight">
                        <StatusBadge tone={SERVICE_REQUEST_STATUS_TONES[request.status] ?? "slate"}>
                          {formatServiceRequestSource(request.status)}
                        </StatusBadge>
                      </span>
                    </div>
                  </div>
                  <p className="mt-0.5 min-w-0 truncate text-xs leading-tight text-[#334155]">
                    <span className="font-bold">
                      {getApplianceLabel(request) || "Appliance needed"}
                    </span>
                    <span className="px-1 text-[#94A3B8]">•</span>
                    <span>{getListProblemDescription(request)}</span>
                  </p>
                  <div className="mt-0.5 flex min-w-0 items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-[10px] font-bold leading-tight text-[#64748B]">
                      {getCityZip(request)}
                    </p>
                    <div className="flex shrink-0 items-center gap-1">
                      {communicationCounts[request.id]?.phone ? (
                        <span className="rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0 text-[9px] font-black leading-4 text-[#2563EB]">
                          📞 {communicationCounts[request.id].phone}
                        </span>
                      ) : null}
                      {communicationCounts[request.id]?.messages ? (
                        <span className="rounded-full border border-emerald-100 bg-emerald-50 px-1.5 py-0 text-[9px] font-black leading-4 text-emerald-700">
                          💬 {communicationCounts[request.id].messages}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No jobs in this view"
          description="Clear filters or adjust the search to bring the work back into view."
        />
      )}

      {showFilters ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4">
          <button
            aria-label="Close job filters"
            className="absolute inset-0"
            onClick={() => setShowFilters(false)}
            type="button"
          />
          <section className="relative z-10 w-full rounded-t-2xl bg-white p-4 shadow-2xl sm:max-w-md sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
                  Filters
                </p>
                <h2 className="mt-1 text-lg font-black text-[#0F172A]">
                  Narrow jobs
                </h2>
              </div>
              <button
                className="rounded-full border border-[#E5E7EB] px-3 py-1.5 text-sm font-black text-[#334155]"
                onClick={() => setShowFilters(false)}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-[#334155]">
                  Status
                </span>
                <select
                  className="mt-1.5 w-full rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none transition focus:border-[#0F6BFF]"
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                  value={statusFilter}
                >
                  <option value="all">All statuses</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {getStatusFilterLabel(status)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-[#334155]">
                  Tags
                </span>
                <select
                  className="mt-1.5 w-full rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#64748B] outline-none"
                  disabled
                  value="none"
                >
                  <option value="none">No job tags yet</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-[#334155]">
                  Team
                </span>
                <select
                  className="mt-1.5 w-full rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none transition focus:border-[#0F6BFF]"
                  onChange={(event) => setTechnicianFilter(event.target.value)}
                  value={technicianFilter}
                >
                  {technicianOptions.map((technician) => (
                    <option key={technician}>{technician}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.14em] text-[#334155]">
                  Schedule status
                </span>
                <select
                  className="mt-1.5 w-full rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none transition focus:border-[#0F6BFF]"
                  onChange={(event) => setDateFilter(event.target.value as DateFilter)}
                  value={dateFilter}
                >
                  <option value="all">All jobs</option>
                  <option value="today">Today</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="unscheduled">Unscheduled</option>
                </select>
              </label>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className="rounded-[10px] border border-[#E5E7EB] px-4 py-2.5 text-sm font-bold text-[#334155]"
                onClick={clearFilters}
                type="button"
              >
                Clear
              </button>
              <button
                className="rounded-[10px] bg-[#0F6BFF] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#0057D9]"
                onClick={() => setShowFilters(false)}
                type="button"
              >
                Apply
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showNewJobWizard ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4">
          <section className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:max-w-4xl sm:rounded-2xl sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#0F6BFF]">
                  New Job
                </p>
                <h2 className="mt-1 text-xl font-black text-[#0F172A]">
                  New Job
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#64748B]">
                  Add the customer, service address, appliance, schedule, and technician.
                </p>
              </div>
              <button
                className="rounded-[10px] border border-[#E5E7EB] px-3 py-2 text-sm font-bold text-[#334155]"
                onClick={closeNewJobWizard}
                type="button"
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-5">
              <section className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                <h3 className="text-sm font-black text-[#0F172A]">Customer</h3>
                <div className="mt-3">
                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.14em] text-[#334155]">
                      Search customer
                    </span>
                    <input
                      className="mt-1.5 w-full rounded-[8px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm text-[#0F172A] outline-none focus:border-[#0F6BFF]"
                      onChange={(event) =>
                        setNewJobForm((current) => ({
                          ...current,
                          customerSearch: event.target.value,
                          selectedCustomerId: "",
                        }))
                      }
                      placeholder="Name, phone, email, or address"
                      value={newJobForm.customerSearch}
                    />
                  </label>
                  {customerMatches.length > 0 ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {customerMatches.map((customer) => (
                        <button
                          className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                            newJobForm.selectedCustomerId === customer.id
                              ? "border-[#0F6BFF] bg-blue-50 text-[#0F6BFF]"
                              : "border-[#E5E7EB] bg-white text-[#334155] hover:border-[#0F6BFF]"
                          }`}
                          key={customer.id}
                          onClick={() => selectExistingCustomer(customer.id)}
                          type="button"
                        >
                          <span className="block truncate font-black">
                            {customer.fullName}
                          </span>
                          <span className="mt-0.5 block truncate text-xs font-semibold text-[#64748B]">
                            {[formatUSPhone(customer.phone), customer.email, customer.streetAddress]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <TextField
                    label="First name"
                    onChange={(value) => updateNewJobForm("customerFirstName", value)}
                    value={newJobForm.customerFirstName}
                  />
                  <TextField
                    label="Last name"
                    onChange={(value) => updateNewJobForm("customerLastName", value)}
                    value={newJobForm.customerLastName}
                  />
                  <TextField
                    label="Phone"
                    onChange={(value) => updateNewJobForm("customerPhone", formatUSPhone(value))}
                    value={newJobForm.customerPhone}
                  />
                  <TextField
                    label="Email"
                    onChange={(value) => updateNewJobForm("customerEmail", value)}
                    type="email"
                    value={newJobForm.customerEmail}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-[#E5E7EB] bg-white p-3">
                <h3 className="text-sm font-black text-[#0F172A]">Service Address</h3>
                <div className="mt-3">
                  <div className="relative">
                    <TextField
                      label="Street address"
                      onBlur={() => {
                        window.setTimeout(() => setAddressFocused(false), 160);
                      }}
                      onChange={(value) => updateNewJobForm("serviceAddress", value)}
                      onFocus={() => setAddressFocused(true)}
                      placeholder={
                        getAddressAutocompleteAdapter().isConfigured
                          ? "Start typing to search addresses"
                          : "Street address"
                      }
                      value={newJobForm.serviceAddress}
                    />
                    {getAddressAutocompleteAdapter().isConfigured && addressFocused ? (
                      <div className="absolute left-0 right-0 top-[4.6rem] z-20 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-[0_18px_48px_rgba(15,23,42,0.18)]">
                        {addressSuggestions.length > 0 ? (
                          addressSuggestions.map((suggestion) => (
                            <button
                              className="block w-full border-b border-slate-100 px-4 py-3 text-left text-sm font-bold text-[#334155] last:border-b-0 hover:bg-blue-50"
                              key={`${suggestion.provider}-${suggestion.placeId ?? suggestion.label}`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => void selectAddressSuggestion(suggestion)}
                              type="button"
                            >
                              {suggestion.label}
                            </button>
                          ))
                        ) : (
                          <p className="px-4 py-3 text-sm font-semibold text-[#64748B]">
                            {addressState.status === "searching"
                              ? "Searching addresses..."
                              : addressState.status === "error"
                                ? addressState.message
                                : "Type at least 3 characters to search."}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[0.8fr_1fr_0.6fr_0.7fr]">
                  <TextField
                    label="Apt / Unit"
                    onChange={(value) => updateNewJobForm("unit", value)}
                    value={newJobForm.unit}
                  />
                  <TextField
                    label="City"
                    onChange={(value) => updateNewJobForm("city", value)}
                    value={newJobForm.city}
                  />
                  <TextField
                    label="State"
                    maxLength={2}
                    onChange={(value) => updateNewJobForm("state", value.toUpperCase())}
                    value={newJobForm.state}
                  />
                  <TextField
                    label="ZIP"
                    maxLength={5}
                    onChange={(value) => updateNewJobForm("zipCode", cleanZip(value))}
                    value={newJobForm.zipCode}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-[#E5E7EB] bg-white p-3">
                <h3 className="text-sm font-black text-[#0F172A]">Appliance / Problem</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <TextField
                    label="Appliance"
                    list="jobs-center-appliance-types"
                    onChange={(value) => updateNewJobForm("applianceType", value)}
                    value={newJobForm.applianceType}
                  />
                  <TextField
                    label="Brand"
                    list="jobs-center-appliance-brands"
                    onChange={(value) => updateNewJobForm("brand", value)}
                    value={newJobForm.brand}
                  />
                  <TextField
                    label="Model"
                    onChange={(value) => updateNewJobForm("modelNumber", value)}
                    value={newJobForm.modelNumber}
                  />
                  <TextField
                    label="Serial"
                    onChange={(value) => updateNewJobForm("serialNumber", value)}
                    value={newJobForm.serialNumber}
                  />
                </div>
                <datalist id="jobs-center-appliance-types">
                  {COMMON_APPLIANCE_TYPES.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                <datalist id="jobs-center-appliance-brands">
                  {COMMON_APPLIANCE_BRANDS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                <label className="mt-3 block">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-[#334155]">
                    Problem
                  </span>
                  <textarea
                    className="mt-1.5 min-h-24 w-full rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none focus:border-[#0F6BFF]"
                    onChange={(event) =>
                      updateNewJobForm("problemDescription", event.target.value)
                    }
                    placeholder="Customer says the refrigerator is not cooling..."
                    value={newJobForm.problemDescription}
                  />
                </label>
              </section>

              <section className="rounded-2xl border border-[#E5E7EB] bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-[#0F172A]">Schedule</h3>
                  <label className="inline-flex items-center gap-2 text-sm font-bold text-[#334155]">
                    <input
                      checked={newJobForm.scheduleMode === "now"}
                      className="h-4 w-4"
                      onChange={(event) =>
                        updateNewJobForm(
                          "scheduleMode",
                          event.target.checked ? "now" : "later",
                        )
                      }
                      type="checkbox"
                    />
                    Schedule now
                  </label>
                </div>
                {newJobForm.scheduleMode === "now" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <TextField
                      label="Date"
                      onChange={(value) => updateNewJobForm("appointmentDate", value)}
                      type="date"
                      value={newJobForm.appointmentDate}
                    />
                    <TextField
                      label="Start"
                      onChange={(value) => updateNewJobForm("windowStartTime", value)}
                      type="time"
                      value={newJobForm.windowStartTime}
                    />
                    <TextField
                      label="End"
                      onChange={(value) => updateNewJobForm("windowEndTime", value)}
                      type="time"
                      value={newJobForm.windowEndTime}
                    />
                  </div>
                ) : (
                  <p className="mt-3 rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 text-sm font-semibold text-[#64748B]">
                    Create the job now and schedule it from the Job Workspace when ready.
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-[#E5E7EB] bg-white p-3">
                <h3 className="text-sm font-black text-[#0F172A]">Technician</h3>
                <label className="mt-3 block">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-[#334155]">
                    Assigned technician
                  </span>
                  <select
                    className="mt-1.5 w-full rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none transition focus:border-[#0F6BFF]"
                    onChange={(event) =>
                      updateNewJobForm("assignedTechnicianId", event.target.value)
                    }
                    value={newJobForm.assignedTechnicianId}
                  >
                    <option value="">Assign later</option>
                    {technicians.map((technician) => (
                      <option key={technician.id} value={technician.id}>
                        {getTechnicianOptionLabel(technician)}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
            </div>

            {newJobState.message ? (
              <p
                className={`mt-4 rounded-[10px] px-3 py-2 text-sm font-bold ${
                  newJobState.status === "error"
                    ? "border border-rose-200 bg-rose-50 text-rose-700"
                    : "border border-blue-100 bg-blue-50 text-[#0F6BFF]"
                }`}
              >
                {newJobState.message}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="rounded-[10px] border border-[#E5E7EB] px-4 py-2.5 text-sm font-bold text-[#334155]"
                onClick={closeNewJobWizard}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-[10px] bg-[#0F6BFF] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={newJobState.status === "saving"}
                onClick={createJobFromWizard}
                type="button"
              >
                {newJobState.status === "saving" ? "Creating..." : "Create Job"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  list,
  maxLength,
  onBlur,
  onChange,
  onFocus,
  placeholder,
  type = "text",
  value,
}: {
  label: string;
  list?: string;
  maxLength?: number;
  onBlur?: () => void;
  onChange: (value: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.14em] text-[#334155]">
        {label}
      </span>
      <input
        className="mt-1.5 w-full rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none focus:border-[#0F6BFF]"
        list={list}
        maxLength={maxLength}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}
