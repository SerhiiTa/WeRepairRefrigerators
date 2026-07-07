"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  getAddressAutocompleteAdapter,
  type AddressSuggestion,
} from "@/lib/address-autocomplete";
import {
  formatIntakeDateTime,
  INTAKE_SOURCE_TYPES,
  INTAKE_STATUSES,
  intakeSourceTypeLabels,
  intakeStatusLabels,
  type DashboardIntakeRequest,
} from "@/lib/intake-records";
import type {
  DatabaseIntakeSourceType,
  DatabaseIntakeStatus,
} from "@/lib/supabase/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type IntakeState =
  | { status: "loading"; requests: DashboardIntakeRequest[]; error: null }
  | { status: "ready"; requests: DashboardIntakeRequest[]; error: null }
  | { status: "error"; requests: DashboardIntakeRequest[]; error: string };

type ActionState =
  | { status: "idle"; message: null }
  | { status: "saving"; message: string | null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type IntakeStatusFilter =
  | DatabaseIntakeStatus
  | "active"
  | "duplicate_candidates"
  | "all";

type IntakeFormState = {
  sourceType: DatabaseIntakeSourceType;
  sourceName: string;
  sourceIdentifier: string;
  customerFirstName: string;
  customerLastName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  serviceAddress: string;
  unit: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude: string;
  longitude: string;
  placeId: string;
  applianceType: string;
  brand: string;
  modelNumber: string;
  serialNumber: string;
  problemDescription: string;
  preferredAppointmentWindow: string;
  appointmentDate: string;
  windowStartTime: string;
  windowEndTime: string;
  assignedTechnicianId: string;
  duplicateConfirmed: boolean;
  rawMessage: string;
  transcript: string;
  status: DatabaseIntakeStatus;
};

const emptyForm: IntakeFormState = {
  sourceType: "manual",
  sourceName: "",
  sourceIdentifier: "",
  customerFirstName: "",
  customerLastName: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  serviceAddress: "",
  unit: "",
  city: "",
  state: "TX",
  zipCode: "",
  country: "US",
  latitude: "",
  longitude: "",
  placeId: "",
  applianceType: "",
  brand: "",
  modelNumber: "",
  serialNumber: "",
  problemDescription: "",
  preferredAppointmentWindow: "",
  appointmentDate: "",
  windowStartTime: "",
  windowEndTime: "",
  assignedTechnicianId: "",
  duplicateConfirmed: false,
  rawMessage: "",
  transcript: "",
  status: "new",
};

const applianceSuggestions = [
  "Refrigerator",
  "Fridge",
  "Freezer",
  "Upright Freezer",
  "Chest Freezer",
  "Ice Maker",
  "Nugget Ice Maker",
  "Undercounter Ice Maker",
  "Wine Cooler",
  "Beverage Cooler",
  "Washer",
  "Front Load Washer",
  "Top Load Washer",
  "Dryer",
  "Gas Dryer",
  "Electric Dryer",
  "Heat Pump Dryer",
  "Dishwasher",
  "Range",
  "Stove",
  "Cooktop",
  "Gas Cooktop",
  "Electric Cooktop",
  "Induction Cooktop",
  "Oven",
  "Wall Oven",
  "Double Oven",
  "Microwave",
  "Built-In Microwave",
  "Microwave Drawer",
  "Range Hood",
  "Vent Hood",
  "Warming Drawer",
  "Garbage Disposal",
  "Other",
];

const brandAliases: Array<{ label: string; aliases: string[] }> = [
  { label: "Samsung", aliases: ["samsung", "самсунг", "самсун"] },
  { label: "LG", aliases: ["lg", "лж", "элджи", "елджи"] },
  { label: "Whirlpool", aliases: ["whirlpool", "вирпул"] },
  { label: "GE", aliases: ["ge", "general", "дженеръл", "дженерал"] },
  { label: "GE Monogram", aliases: ["ge monogram", "monogram"] },
  { label: "GE Profile", aliases: ["ge profile", "profile"] },
  { label: "Frigidaire", aliases: ["frigidaire"] },
  { label: "Electrolux", aliases: ["electrolux"] },
  { label: "Maytag", aliases: ["maytag", "майтаг"] },
  { label: "Amana", aliases: ["amana", "амана", "аманa"] },
  { label: "Kenmore", aliases: ["kenmore"] },
  { label: "KitchenAid", aliases: ["kitchenaid", "kitchen aid", "китченэйд"] },
  { label: "JennAir", aliases: ["jennair", "jenn-air", "дженэир", "дженнэйр"] },
  { label: "Bosch", aliases: ["bosch", "бош"] },
  { label: "Thermador", aliases: ["thermador", "термадор"] },
  { label: "Miele", aliases: ["miele"] },
  { label: "Sub-Zero", aliases: ["subzero", "sub-zero", "субзиро", "сабзиро"] },
  { label: "Wolf", aliases: ["wolf"] },
  { label: "Viking", aliases: ["viking", "викинг"] },
  { label: "Fisher & Paykel", aliases: ["fisher paykel", "fisher & paykel"] },
  { label: "Dacor", aliases: ["dacor"] },
  { label: "Scotsman", aliases: ["scotsman", "скотсман"] },
  { label: "Ice-O-Matic", aliases: ["ice-o-matic", "iceomatic"] },
  { label: "Hoshizaki", aliases: ["hoshizaki"] },
  { label: "U-Line", aliases: ["u-line", "uline"] },
  { label: "True", aliases: ["true"] },
  { label: "Marvel", aliases: ["marvel"] },
  { label: "Cafe", aliases: ["cafe", "café"] },
  { label: "Hotpoint", aliases: ["hotpoint"] },
  { label: "Speed Queen", aliases: ["speed queen"] },
  { label: "Asko", aliases: ["asko"] },
  { label: "Bertazzoni", aliases: ["bertazzoni"] },
  { label: "BlueStar", aliases: ["bluestar", "blue star"] },
  { label: "Fulgor Milano", aliases: ["fulgor", "fulgor milano"] },
  { label: "Liebherr", aliases: ["liebherr"] },
  { label: "Sharp", aliases: ["sharp"] },
  { label: "Panasonic", aliases: ["panasonic"] },
  { label: "Other", aliases: ["other"] },
];

function getSuggestedBrands(value: string) {
  const query = value.trim().toLowerCase();

  if (!query) {
    return brandAliases.slice(0, 6).map((brand) => brand.label);
  }

  return brandAliases
    .filter(
      (brand) =>
        brand.label.toLowerCase().includes(query) ||
        brand.aliases.some((alias) => alias.includes(query) || query.includes(alias)),
    )
    .slice(0, 6)
    .map((brand) => brand.label);
}

function hasPossibleDuplicate(request: DashboardIntakeRequest | null) {
  const candidate = request?.duplicateCandidate;

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return false;
  }

  const record = candidate as Record<string, unknown>;

  return (
    Number(record.intake_matches ?? 0) > 0 ||
    Number(record.service_request_matches ?? 0) > 0
  );
}

function getIntakeCustomerDisplayName(request: DashboardIntakeRequest) {
  return (
    [request.customerFirstName, request.customerLastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ") ||
    request.customerName ||
    "Unknown customer"
  );
}

function getWindowValidation(form: IntakeFormState) {
  if (!form.windowStartTime || !form.windowEndTime) {
    return { error: null, warning: null };
  }

  if (form.windowStartTime >= form.windowEndTime) {
    return {
      error: "Appointment end time must be after start time.",
      warning: null,
    };
  }

  const [startHour] = form.windowStartTime.split(":").map(Number);
  const [endHour, endMinute] = form.windowEndTime.split(":").map(Number);
  const outsideWorkingHours =
    startHour < 7 || endHour > 19 || (endHour === 19 && endMinute > 0);

  return {
    error: null,
    warning: outsideWorkingHours
      ? "This window is outside the default 7 AM - 7 PM operating hours. Confirm before conversion."
      : null,
  };
}

function hasLocalDuplicateCandidate(
  requests: DashboardIntakeRequest[],
  form: IntakeFormState,
  selectedId: string | null,
) {
  const phone = form.customerPhone.trim();
  const address = form.serviceAddress.trim().toLowerCase();
  const appliance = form.applianceType.trim().toLowerCase();
  const zip = form.zipCode.trim();

  if (!phone && (!address || !appliance) && (!zip || !appliance)) {
    return false;
  }

  return requests.some((request) => {
    if (request.id === selectedId || request.status === "converted") {
      return false;
    }

    const requestPhone = request.customerPhone?.trim();
    const requestAddress = request.serviceAddress?.trim().toLowerCase();
    const requestAppliance = request.applianceType?.trim().toLowerCase();
    const requestZip = request.zipCode?.trim();

    return (
      (phone && requestPhone === phone) ||
      (address && appliance && requestAddress === address && requestAppliance === appliance) ||
      (zip && appliance && requestZip === zip && requestAppliance === appliance)
    );
  });
}

function buildFormFromRequest(request: DashboardIntakeRequest): IntakeFormState {
  const fallbackNameParts = request.customerName?.trim().split(/\s+/) ?? [];
  const fallbackFirstName = fallbackNameParts[0] ?? "";
  const fallbackLastName = fallbackNameParts.slice(1).join(" ");

  return {
    sourceType: request.sourceType,
    sourceName: request.sourceName ?? "",
    sourceIdentifier: request.sourceIdentifier ?? "",
    customerFirstName: request.customerFirstName ?? fallbackFirstName,
    customerLastName: request.customerLastName ?? fallbackLastName,
    customerName: request.customerName ?? "",
    customerPhone: request.customerPhone ?? "",
    customerEmail: request.customerEmail ?? "",
    serviceAddress: request.serviceAddress ?? "",
    unit: request.unit ?? "",
    city: request.city ?? "",
    state: request.state,
    zipCode: request.zipCode ?? "",
    country: request.country,
    latitude: request.latitude?.toString() ?? "",
    longitude: request.longitude?.toString() ?? "",
    placeId: request.placeId ?? "",
    applianceType: request.applianceType ?? "",
    brand: request.brand ?? "",
    modelNumber: request.modelNumber ?? "",
    serialNumber: request.serialNumber ?? "",
    problemDescription: request.problemDescription ?? "",
    preferredAppointmentWindow: request.preferredAppointmentWindow ?? "",
    appointmentDate: request.appointmentDate ?? "",
    windowStartTime: request.windowStartTime?.slice(0, 5) ?? "",
    windowEndTime: request.windowEndTime?.slice(0, 5) ?? "",
    assignedTechnicianId: request.assignedTechnicianId ?? "",
    duplicateConfirmed: Boolean(request.duplicateConfirmedAt),
    rawMessage: request.rawMessage ?? "",
    transcript: request.transcript ?? "",
    status: request.status,
  };
}

function formToPayload(form: IntakeFormState) {
  const generatedCustomerName = [form.customerFirstName, form.customerLastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");

  return {
    sourceType: form.sourceType,
    sourceName: form.sourceName,
    sourceIdentifier: form.sourceIdentifier,
    customerFirstName: form.customerFirstName,
    customerLastName: form.customerLastName,
    customerName: generatedCustomerName || form.customerName,
    customerPhone: form.customerPhone,
    customerEmail: form.customerEmail,
    serviceAddress: form.serviceAddress,
    unit: form.unit,
    city: form.city,
    state: form.state,
    zipCode: form.zipCode,
    country: form.country,
    latitude: form.latitude,
    longitude: form.longitude,
    placeId: form.placeId,
    applianceType: form.applianceType,
    brand: form.brand,
    modelNumber: form.modelNumber,
    serialNumber: form.serialNumber,
    problemDescription: form.problemDescription,
    preferredAppointmentWindow: form.preferredAppointmentWindow,
    appointmentDate: form.appointmentDate,
    windowStartTime: form.windowStartTime,
    windowEndTime: form.windowEndTime,
    assignedTechnicianId: form.assignedTechnicianId,
    duplicateConfirmed: form.duplicateConfirmed,
    rawMessage: form.rawMessage,
    transcript: form.transcript,
    status: form.status,
  };
}

function getStatusTone(status: DatabaseIntakeStatus) {
  if (status === "converted") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (status === "archived") {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  if (status === "ready_to_convert" || status === "customer_matched") {
    return "border-blue-200 bg-blue-50 text-[#0F6BFF]";
  }

  if (status === "needs_info") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (status === "dismissed") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  return "border-[#E5E7EB] bg-[#F8FAFC] text-[#334155]";
}

function isConvertedIntake(request: DashboardIntakeRequest | null) {
  return Boolean(
    request?.linkedServiceRequestId || request?.status === "converted",
  );
}

function isReadOnlyIntake(request: DashboardIntakeRequest | null) {
  return Boolean(
    request?.status === "archived" ||
      request?.linkedServiceRequestId ||
      request?.status === "converted",
  );
}

async function getAccessToken() {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    throw new Error("Log in again before managing intake.");
  }

  return data.session.access_token;
}

export function IntakeInbox() {
  const [state, setState] = useState<IntakeState>({
    status: "loading",
    requests: [],
    error: null,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<IntakeFormState>(emptyForm);
  const [statusFilter, setStatusFilter] = useState<IntakeStatusFilter>("active");
  const [sourceFilter, setSourceFilter] =
    useState<DatabaseIntakeSourceType | "all">("all");
  const [createState, setCreateState] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [saveState, setSaveState] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [convertState, setConvertState] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [customerMatchState, setCustomerMatchState] = useState<ActionState>({
    status: "idle",
    message: null,
  });
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressFocused, setAddressFocused] = useState(false);
  const [acceptedAddressLabel, setAcceptedAddressLabel] = useState("");
  const [applianceFocused, setApplianceFocused] = useState(false);
  const [brandFocused, setBrandFocused] = useState(false);
  const [addressState, setAddressState] = useState<ActionState>({
    status: "idle",
    message: null,
  });

  const selectedRequest =
    state.requests.find((request) => request.id === selectedId) ?? null;
  const windowValidation = getWindowValidation(form);
  const localDuplicateCandidate = hasLocalDuplicateCandidate(
    state.requests,
    form,
    selectedId,
  );
  const duplicateReviewRequired =
    (hasPossibleDuplicate(selectedRequest) || localDuplicateCandidate) &&
    !form.duplicateConfirmed;
  const selectedReadOnly = isReadOnlyIntake(selectedRequest);
  const selectedConverted = isConvertedIntake(selectedRequest);
  const brandSuggestions = brandFocused ? getSuggestedBrands(form.brand) : [];
  const filteredApplianceSuggestions = applianceFocused
    ? applianceSuggestions
        .filter((appliance) =>
          appliance.toLowerCase().includes(form.applianceType.toLowerCase()),
        )
        .slice(0, 8)
    : [];

  const filteredRequests = useMemo(
    () =>
      state.requests.filter((request) => {
        const statusMatches =
          statusFilter === "all"
            ? true
            : statusFilter === "active"
              ? request.status !== "dismissed" && request.status !== "archived"
              : statusFilter === "duplicate_candidates"
                ? hasPossibleDuplicate(request)
                : request.status === statusFilter;
        const sourceMatches =
          sourceFilter === "all" || request.sourceType === sourceFilter;

        return statusMatches && sourceMatches;
      }),
    [sourceFilter, state.requests, statusFilter],
  );

  async function loadIntakeRequests() {
    setState((current) => ({
      status: current.status === "ready" ? "ready" : "loading",
      requests: current.requests,
      error: null,
    }));

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/intake", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        requests?: DashboardIntakeRequest[];
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? "Intake Inbox is unavailable.");
      }

      const requests = payload.requests ?? [];

      setState({ status: "ready", requests, error: null });

      if (!selectedId && requests[0]) {
        setSelectedId(requests[0].id);
        setForm(buildFormFromRequest(requests[0]));
      }
    } catch (error) {
      setState({
        status: "error",
        requests: [],
        error:
          error instanceof Error
            ? error.message
            : "Intake Inbox is unavailable.",
      });
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadIntakeRequests();
    }, 0);

    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const query = form.serviceAddress.trim();

    if (!addressFocused || query.length < 3 || query === acceptedAddressLabel) {
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
      setAddressState({ status: "saving", message: "Searching addresses..." });
      adapter
        .search(query)
        .then((suggestions) => {
          if (!cancelled) {
            setAddressSuggestions(suggestions);
            setAddressState(
              suggestions.length > 0
                ? { status: "idle", message: null }
                : {
                    status: "success",
                    message: "No address suggestions found.",
                  },
            );
          }
        })
        .catch(() => {
          if (!cancelled) {
            setAddressSuggestions([]);
            setAddressState({
              status: "error",
              message: "Address suggestions unavailable. Manual entry still works.",
            });
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [acceptedAddressLabel, addressFocused, form.serviceAddress]);

  function selectRequest(request: DashboardIntakeRequest) {
    setSelectedId(request.id);
    setForm(buildFormFromRequest(request));
    setAcceptedAddressLabel(request.serviceAddress ?? "");
    setAddressFocused(false);
    setAddressSuggestions([]);
    setSaveState({ status: "idle", message: null });
    setConvertState({ status: "idle", message: null });
    setCustomerMatchState({ status: "idle", message: null });
  }

  async function createManualIntake() {
    if (localDuplicateCandidate && !form.duplicateConfirmed) {
      setCreateState({
        status: "error",
        message: "Possible duplicate found. Confirm duplicate review before creating.",
      });
      return;
    }

    setCreateState({ status: "saving", message: "Creating intake..." });

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/intake", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formToPayload(form)),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        intakeRequest?: DashboardIntakeRequest;
      } | null;

      if (!response.ok || !payload?.ok || !payload.intakeRequest) {
        throw new Error(payload?.message ?? "Could not create intake.");
      }

      setCreateState({
        status: "success",
        message: "Intake request created.",
      });
      setState((current) => ({
        status: "ready",
        requests: [payload.intakeRequest!, ...current.requests],
        error: null,
      }));
      selectRequest(payload.intakeRequest);
    } catch (error) {
      setCreateState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not create intake.",
      });
    }
  }

  async function saveSelectedIntake() {
    if (!selectedRequest) {
      return;
    }

    if (selectedReadOnly) {
      setSaveState({
        status: "error",
        message:
          "This intake is read-only. Make job changes in the linked Job Workspace.",
      });
      return;
    }

    setSaveState({ status: "saving", message: "Saving intake..." });

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(`/api/intake/${selectedRequest.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formToPayload(form)),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        intakeRequest?: DashboardIntakeRequest;
      } | null;

      if (!response.ok || !payload?.ok || !payload.intakeRequest) {
        throw new Error(payload?.message ?? "Could not save intake.");
      }

      setState((current) => ({
        status: "ready",
        requests: current.requests.map((request) =>
          request.id === payload.intakeRequest!.id
            ? payload.intakeRequest!
            : request,
        ),
        error: null,
      }));
      setForm(buildFormFromRequest(payload.intakeRequest));
      setSaveState({ status: "success", message: "Intake saved." });
    } catch (error) {
      setSaveState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not save intake.",
      });
    }
  }

  async function dismissSelectedIntake() {
    if (!selectedRequest) {
      return;
    }

    if (selectedRequest.linkedServiceRequestId) {
      setSaveState({
        status: "error",
        message: "This intake is already linked to a job and cannot be dismissed from the inbox.",
      });
      return;
    }

    setSaveState({ status: "saving", message: "Dismissing intake..." });

    try {
      const reason =
        window.prompt(
          "Optional dismissal reason (spam, wrong number, duplicate, customer canceled):",
          selectedRequest.dismissalReason ?? "",
        ) ?? "";
      const accessToken = await getAccessToken();
      const response = await fetch(`/api/intake/${selectedRequest.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formToPayload(form),
          status: "dismissed",
          dismissalReason: reason,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        intakeRequest?: DashboardIntakeRequest;
      } | null;

      if (!response.ok || !payload?.ok || !payload.intakeRequest) {
        throw new Error(payload?.message ?? "Could not dismiss intake.");
      }

      setState((current) => ({
        status: "ready",
        requests: current.requests.map((request) =>
          request.id === payload.intakeRequest!.id
            ? payload.intakeRequest!
            : request,
        ),
        error: null,
      }));
      selectRequest(payload.intakeRequest);
      setSaveState({ status: "success", message: "Intake dismissed." });
    } catch (error) {
      setSaveState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not dismiss intake.",
      });
    }
  }

  async function archiveSelectedIntake() {
    if (!selectedRequest) {
      return;
    }

    if (
      !window.confirm(
        selectedRequest.linkedServiceRequestId
          ? "Archive this intake history record? The linked job will not be deleted."
          : "Archive this intake? It will be hidden from Active but kept in history.",
      )
    ) {
      return;
    }

    setSaveState({ status: "saving", message: "Archiving intake..." });

    try {
      const reason =
        window.prompt(
          "Optional archive note:",
          selectedRequest.dismissalReason ?? "",
        ) ?? "";
      const accessToken = await getAccessToken();
      const response = await fetch(`/api/intake/${selectedRequest.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formToPayload(form),
          status: "archived",
          dismissalReason: reason,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        intakeRequest?: DashboardIntakeRequest;
      } | null;

      if (!response.ok || !payload?.ok || !payload.intakeRequest) {
        throw new Error(payload?.message ?? "Could not archive intake.");
      }

      setState((current) => ({
        status: "ready",
        requests: current.requests.map((request) =>
          request.id === payload.intakeRequest!.id
            ? payload.intakeRequest!
            : request,
        ),
        error: null,
      }));
      selectRequest(payload.intakeRequest);
      setSaveState({ status: "success", message: "Intake archived." });
    } catch (error) {
      setSaveState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not archive intake.",
      });
    }
  }

  async function matchSelectedCustomer() {
    if (!selectedRequest) {
      return;
    }

    if (selectedRequest.linkedCustomerId) {
      setCustomerMatchState({
        status: "success",
        message: "This intake is already linked to a customer.",
      });
      return;
    }

    const hasCustomerSignal = Boolean(
      form.customerFirstName.trim() ||
        form.customerLastName.trim() ||
        form.customerName.trim() ||
        form.customerPhone.trim() ||
        form.customerEmail.trim() ||
        form.serviceAddress.trim() ||
        form.zipCode.trim(),
    );

    if (!hasCustomerSignal) {
      setCustomerMatchState({
        status: "error",
        message: "Add a customer name, phone, email, address, or ZIP before matching.",
      });
      return;
    }

    setCustomerMatchState({ status: "saving", message: "Matching customer..." });

    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        throw new Error("Customer matching is not configured.");
      }

      const { data, error } = await supabase.rpc(
        "match_or_create_customer_for_intake_rpc",
        {
          p_intake_request_id: selectedRequest.id,
          p_payload: {
            first_name: form.customerFirstName,
            last_name: form.customerLastName,
            full_name:
              [form.customerFirstName, form.customerLastName]
                .map((part) => part.trim())
                .filter(Boolean)
                .join(" ") || form.customerName,
            phone: form.customerPhone,
            email: form.customerEmail,
            service_address: form.serviceAddress,
            unit: form.unit,
            city: form.city,
            state: form.state,
            zip_code: form.zipCode,
            country: form.country,
          },
        },
      );

      if (error) {
        throw error;
      }

      const result = data as { customer_id?: string; action?: string } | null;
      setCustomerMatchState({
        status: "success",
        message:
          result?.action === "created"
            ? "Customer created and linked to this intake."
            : "Customer matched and linked to this intake.",
      });
      await loadIntakeRequests();
    } catch (error) {
      setCustomerMatchState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Could not match customer.",
      });
    }
  }

  async function convertSelectedIntake() {
    if (!selectedRequest) {
      return;
    }

    if (selectedConverted) {
      setConvertState({
        status: "success",
        message: "This intake is already converted. Open the linked job.",
      });
      return;
    }

    if (windowValidation.error) {
      setConvertState({ status: "error", message: windowValidation.error });
      return;
    }

    if (duplicateReviewRequired) {
      setConvertState({
        status: "error",
        message: "Review the possible duplicate warning before converting.",
      });
      return;
    }

    setConvertState({ status: "saving", message: "Converting intake..." });

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(`/api/intake/${selectedRequest.id}/convert`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allowPossibleDuplicate: form.duplicateConfirmed,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        conversion?: {
          serviceRequestId: string | null;
          appointmentId: string | null;
          alreadyConverted?: boolean;
        };
      } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.message ?? "Could not convert intake.");
      }

      setConvertState({
        status: "success",
        message: payload.conversion?.serviceRequestId
          ? payload.conversion.alreadyConverted
            ? "This intake was already converted. Open the linked job."
            : "Converted into a real job."
          : "Intake converted.",
      });
      await loadIntakeRequests();
    } catch (error) {
      setConvertState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Could not convert intake.",
      });
    }
  }

  function updateForm<K extends keyof IntakeFormState>(
    key: K,
    value: IntakeFormState[K],
  ) {
    if (selectedReadOnly) {
      return;
    }

    setForm((current) => ({ ...current, [key]: value }));
    if (key === "serviceAddress") {
      setAcceptedAddressLabel("");
      setAddressFocused(true);
    }
    setSaveState({ status: "idle", message: null });
    setCreateState({ status: "idle", message: null });
    setCustomerMatchState({ status: "idle", message: null });
  }

  async function selectAddressSuggestion(suggestion: AddressSuggestion) {
    try {
      const adapter = getAddressAutocompleteAdapter();
      const resolved = adapter.resolve
        ? await adapter.resolve(suggestion)
        : suggestion;

      setForm((current) => ({
        ...current,
        serviceAddress: resolved.streetAddress || resolved.label,
        city: resolved.city,
        state: resolved.state,
        zipCode: resolved.zipCode,
        country: resolved.country,
        latitude: resolved.latitude?.toString() ?? "",
        longitude: resolved.longitude?.toString() ?? "",
        placeId: resolved.placeId ?? "",
      }));
      setAcceptedAddressLabel(resolved.streetAddress || resolved.label);
      setAddressFocused(false);
      setAddressSuggestions([]);
      setAddressState({ status: "success", message: "Address selected." });
    } catch {
      setAddressSuggestions([]);
      setAddressState({
        status: "error",
        message: "Could not fill that address. Manual entry still works.",
      });
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F6BFF]">
              Unified intake
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-[#0F172A]">
              Intake Inbox
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#64748B]">
              Review incoming requests from every channel and convert qualified
              requests into real WRA jobs.
            </p>
          </div>
          <button
            className="rounded-[10px] border border-[#E5E7EB] bg-white px-4 py-3 text-sm font-black text-[#334155] transition hover:border-[#0F6BFF] hover:text-[#0F6BFF]"
            onClick={() => {
              setSelectedId(null);
              setForm(emptyForm);
              setAcceptedAddressLabel("");
              setAddressSuggestions([]);
              setAddressFocused(false);
              setSaveState({ status: "idle", message: null });
              setConvertState({ status: "idle", message: null });
              setCustomerMatchState({ status: "idle", message: null });
              setCreateState({ status: "idle", message: null });
            }}
            type="button"
          >
            New Intake
          </button>
        </div>
        {createState.message ? (
          <p
            className={`mt-3 text-sm font-semibold ${
              createState.status === "error" ? "text-amber-800" : "text-[#0F6BFF]"
            }`}
          >
            {createState.message}
          </p>
        ) : null}
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.3fr]">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
                Status
              </span>
              <select
                className="mt-2 w-full rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm font-bold text-[#0F172A] outline-none focus:border-[#0F6BFF]"
                onChange={(event) =>
                  setStatusFilter(event.target.value as IntakeStatusFilter)
                }
                value={statusFilter}
              >
                <option value="active">Active intakes</option>
                <option value="new">New</option>
                <option value="needs_info">Needs Review</option>
                <option value="ready_to_convert">Ready to Convert</option>
                <option value="converted">Converted</option>
                <option value="dismissed">Dismissed</option>
                <option value="archived">Archived</option>
                <option value="duplicate_candidates">Duplicate Candidates</option>
                <option value="all">All</option>
                {INTAKE_STATUSES.map((status) => (
                  <option
                    hidden={[
                      "new",
                      "needs_info",
                      "ready_to_convert",
                      "converted",
                      "dismissed",
                      "archived",
                    ].includes(status)}
                    key={status}
                    value={status}
                  >
                    {intakeStatusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
                Source
              </span>
              <select
                className="mt-2 w-full rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm font-bold text-[#0F172A] outline-none focus:border-[#0F6BFF]"
                onChange={(event) =>
                  setSourceFilter(event.target.value as DatabaseIntakeSourceType | "all")
                }
                value={sourceFilter}
              >
                <option value="all">All sources</option>
                {INTAKE_SOURCE_TYPES.map((source) => (
                  <option key={source} value={source}>
                    {intakeSourceTypeLabels[source]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 space-y-3">
            {state.status === "loading" ? (
              <p className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm font-semibold text-[#64748B]">
                Loading intake requests...
              </p>
            ) : null}
            {state.status === "error" ? (
              <p className="rounded-[10px] border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                {state.error}
              </p>
            ) : null}
            {state.status === "ready" && filteredRequests.length === 0 ? (
              <p className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] p-4 text-sm font-semibold text-[#64748B]">
                No intake requests match these filters.
              </p>
            ) : null}
            {filteredRequests.map((request) => (
              <button
                className={`block w-full rounded-2xl border p-4 text-left transition ${
                  selectedId === request.id
                    ? "border-[#0F6BFF] bg-blue-50"
                    : "border-[#E5E7EB] bg-white hover:border-blue-200 hover:bg-[#F8FAFC]"
                }`}
                key={request.id}
                onClick={() => selectRequest(request)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-[#0F172A]">
                      {getIntakeCustomerDisplayName(request)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-[#64748B]">
                      {request.applianceType ?? "Appliance not set"} ·{" "}
                      {request.problemDescription ?? request.rawMessage ?? "No problem summary"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black ${getStatusTone(
                      request.status,
                    )}`}
                  >
                    {intakeStatusLabels[request.status]}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-[#64748B]">
                  <span>{intakeSourceTypeLabels[request.sourceType]}</span>
                  <span>{formatIntakeDateTime(request.createdAt)}</span>
                  <span>
                    Confidence{" "}
                    {request.extractionConfidence !== null
                      ? `${Math.round(request.extractionConfidence * 100)}%`
                      : "n/a"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0F6BFF]">
                Intake review
              </p>
              <h2 className="mt-1 text-2xl font-black text-[#0F172A]">
                {selectedRequest ? "Review request" : "Create manual intake"}
              </h2>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {selectedRequest?.linkedCustomerId ? (
                <Link
                  className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-black text-emerald-800 transition hover:bg-emerald-100"
                  href={`/dashboard/customers/${selectedRequest.linkedCustomerId}`}
                >
                  Open Customer
                </Link>
              ) : selectedRequest ? (
                <button
                  className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={customerMatchState.status === "saving"}
                  onClick={() => void matchSelectedCustomer()}
                  type="button"
                >
                  {customerMatchState.status === "saving"
                    ? "Matching..."
                    : "Create / Match Customer"}
                </button>
              ) : null}
              {selectedRequest?.linkedServiceRequestId ? (
                <Link
                  className="rounded-[10px] border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm font-black text-[#0F6BFF] transition hover:bg-blue-100"
                  href={`/dashboard/leads/${selectedRequest.linkedServiceRequestId}`}
                >
                  Open Job
                </Link>
              ) : null}
            </div>
          </div>

          {selectedReadOnly ? (
            <div className="mt-4 rounded-[10px] border border-blue-100 bg-blue-50 p-3">
              <p className="text-sm font-black text-[#0F172A]">
                {selectedConverted
                  ? "Converted intake is protected"
                  : "Archived intake is read-only"}
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#475569]">
                {selectedConverted
                  ? "This request already created a job. Update customer, appointment, estimate, invoice, and status details from the linked Job Workspace."
                  : "Archived intake records are kept for history and hidden from the Active queue."}
              </p>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="First name" value={form.customerFirstName} onChange={(value) => updateForm("customerFirstName", value)} />
            <Field label="Last name" value={form.customerLastName} onChange={(value) => updateForm("customerLastName", value)} />
            <Field label="Phone" value={form.customerPhone} onChange={(value) => updateForm("customerPhone", value)} />
            <Field label="Email" value={form.customerEmail} onChange={(value) => updateForm("customerEmail", value)} />
            <label className="relative md:col-span-2">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
                Service address
              </span>
              <input
                className="mt-2 w-full rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm font-bold text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#0F6BFF]"
                onChange={(event) => updateForm("serviceAddress", event.target.value)}
                onFocus={() => setAddressFocused(true)}
                value={form.serviceAddress}
              />
              {addressState.message ? (
                <p
                  className={`mt-1 text-xs font-semibold ${
                    addressState.status === "error"
                      ? "text-amber-800"
                      : "text-[#64748B]"
                  }`}
                >
                  {addressState.message}
                </p>
              ) : null}
              {addressSuggestions.length > 0 ? (
                <div className="absolute z-20 mt-2 max-h-56 w-full overflow-auto rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
                  {addressSuggestions.map((suggestion) => (
                    <button
                      className="block w-full rounded-[10px] px-3 py-2 text-left text-sm font-bold text-[#0F172A] transition hover:bg-blue-50"
                      key={`${suggestion.provider}-${suggestion.placeId ?? suggestion.label}`}
                      onClick={() => void selectAddressSuggestion(suggestion)}
                      type="button"
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
            <Field label="Apt / Unit / Suite" value={form.unit} onChange={(value) => updateForm("unit", value)} />
            <Field label="City" value={form.city} onChange={(value) => updateForm("city", value)} />
            <Field label="State" maxLength={2} value={form.state} onChange={(value) => updateForm("state", value.toUpperCase())} />
            <Field label="ZIP" maxLength={5} value={form.zipCode} onChange={(value) => updateForm("zipCode", value.replace(/[^0-9]/g, "").slice(0, 5))} />
            <Field label="Country" value={form.country} onChange={(value) => updateForm("country", value.toUpperCase().slice(0, 2))} />
            <div>
              <Field
                label="Appliance"
                onBlur={() => window.setTimeout(() => setApplianceFocused(false), 150)}
                onChange={(value) => updateForm("applianceType", value)}
                onFocus={() => setApplianceFocused(true)}
                value={form.applianceType}
              />
              <SuggestionChips
                items={filteredApplianceSuggestions}
                onSelect={(value) => {
                  updateForm("applianceType", value);
                  setApplianceFocused(false);
                }}
              />
            </div>
            <div>
              <Field
                label="Brand"
                onBlur={() => window.setTimeout(() => setBrandFocused(false), 150)}
                onChange={(value) => updateForm("brand", value)}
                onFocus={() => setBrandFocused(true)}
                value={form.brand}
              />
              <SuggestionChips
                items={brandSuggestions}
                onSelect={(value) => {
                  updateForm("brand", value);
                  setBrandFocused(false);
                }}
              />
            </div>
            <Field label="Model" value={form.modelNumber} onChange={(value) => updateForm("modelNumber", value)} />
            <Field label="Serial" value={form.serialNumber} onChange={(value) => updateForm("serialNumber", value)} />
            <Field label="Preferred window" value={form.preferredAppointmentWindow} onChange={(value) => updateForm("preferredAppointmentWindow", value)} />
            <Field label="Appointment date" type="date" value={form.appointmentDate} onChange={(value) => updateForm("appointmentDate", value)} />
            <Field label="Window start" type="time" value={form.windowStartTime} onChange={(value) => updateForm("windowStartTime", value)} />
            <Field label="Window end" type="time" value={form.windowEndTime} onChange={(value) => updateForm("windowEndTime", value)} />
            <Field label="Assigned technician profile ID" value={form.assignedTechnicianId} onChange={(value) => updateForm("assignedTechnicianId", value)} />
            <label>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
                Source
              </span>
              <select
                className="mt-2 w-full rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm font-bold text-[#0F172A] outline-none focus:border-[#0F6BFF]"
                onChange={(event) =>
                  updateForm("sourceType", event.target.value as DatabaseIntakeSourceType)
                }
                value={form.sourceType}
              >
                {INTAKE_SOURCE_TYPES.map((source) => (
                  <option key={source} value={source}>
                    {intakeSourceTypeLabels[source]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
                Status
              </span>
              <select
                className="mt-2 w-full rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm font-bold text-[#0F172A] outline-none focus:border-[#0F6BFF]"
                onChange={(event) =>
                  updateForm("status", event.target.value as DatabaseIntakeStatus)
                }
                value={form.status}
              >
                {INTAKE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {intakeStatusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Source name" value={form.sourceName} onChange={(value) => updateForm("sourceName", value)} />
            <Field label="Source ID" value={form.sourceIdentifier} onChange={(value) => updateForm("sourceIdentifier", value)} />
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
              Problem description
            </span>
            <textarea
              className="mt-2 min-h-24 w-full rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 text-sm font-semibold text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#0F6BFF]"
              onChange={(event) => updateForm("problemDescription", event.target.value)}
              placeholder="Describe what the customer needs repaired"
              value={form.problemDescription}
            />
          </label>

          {windowValidation.error || windowValidation.warning ? (
            <div
              className={`mt-4 rounded-[10px] border p-3 text-sm font-semibold ${
                windowValidation.error
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {windowValidation.error ?? windowValidation.warning}
            </div>
          ) : null}

          {hasPossibleDuplicate(selectedRequest) || localDuplicateCandidate ? (
            <div className="mt-4 rounded-[10px] border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-black text-amber-900">
                Possible duplicate found
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-amber-800">
                This intake matches an active intake or job by phone, address, appliance, or recent request data. Review before converting.
              </p>
              <label className="mt-3 flex items-center gap-2 text-sm font-bold text-amber-900">
                <input
                  checked={form.duplicateConfirmed}
                  className="h-4 w-4 rounded border-amber-300"
                  onChange={(event) =>
                    updateForm("duplicateConfirmed", event.target.checked)
                  }
                  type="checkbox"
                />
                I reviewed the possible duplicate and still want to allow conversion.
              </label>
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
                Raw message
              </span>
              <textarea
                className="mt-2 min-h-28 w-full rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 text-sm font-semibold text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#0F6BFF]"
                onChange={(event) => updateForm("rawMessage", event.target.value)}
                placeholder="Paste website form, email, SMS, or manual request text"
                value={form.rawMessage}
              />
            </label>
            <label>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
                Transcript
              </span>
              <textarea
                className="mt-2 min-h-28 w-full rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-3 text-sm font-semibold text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#0F6BFF]"
                onChange={(event) => updateForm("transcript", event.target.value)}
                placeholder="Call or message transcript"
                value={form.transcript}
              />
            </label>
          </div>

          {selectedRequest ? (
            <div className="mt-4 rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
                    Extraction
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#334155]">
                    Confidence:{" "}
                    {selectedRequest.extractionConfidence !== null
                      ? `${Math.round(selectedRequest.extractionConfidence * 100)}%`
                      : "Not available"}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[#64748B]">
                    Extracted details can prefill fields, but dispatchers should review before conversion.
                  </p>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
                    Conversion foundation
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#334155]">
                    {selectedRequest.linkedServiceRequestId
                      ? "Linked to a real job."
                      : "Ready to become a job after required fields are reviewed."}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[#64748B]">
                    Appointment creation requires date, window, and assigned technician.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              className="rounded-[10px] bg-[#0F6BFF] px-4 py-3 text-sm font-black text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                selectedRequest
                  ? saveState.status === "saving" || selectedReadOnly
                  : createState.status === "saving"
              }
              onClick={() =>
                selectedRequest
                  ? void saveSelectedIntake()
                  : void createManualIntake()
              }
              type="button"
            >
              {selectedRequest
                ? saveState.status === "saving"
                  ? "Saving..."
                  : "Save Intake"
                : createState.status === "saving"
                  ? "Creating..."
                  : "Create Intake"}
            </button>
            {selectedRequest ? (
              selectedRequest.linkedServiceRequestId ? (
                <Link
                  className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-black text-emerald-800 transition hover:bg-emerald-100"
                  href={`/dashboard/leads/${selectedRequest.linkedServiceRequestId}`}
                >
                  Open Job
                </Link>
              ) : (
                <button
                  className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={
                    convertState.status === "saving" ||
                    selectedReadOnly ||
                    Boolean(windowValidation.error) ||
                    duplicateReviewRequired
                  }
                  onClick={() => void convertSelectedIntake()}
                  type="button"
                >
                  {convertState.status === "saving" ? "Converting..." : "Convert To Job"}
                </button>
              )
            ) : null}
            {selectedRequest &&
            selectedRequest.status !== "converted" &&
            selectedRequest.status !== "dismissed" &&
            selectedRequest.status !== "archived" ? (
              <button
                className="rounded-[10px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saveState.status === "saving"}
                onClick={() => void dismissSelectedIntake()}
                type="button"
              >
                Dismiss Intake
              </button>
            ) : null}
            {selectedRequest && selectedRequest.status !== "archived" ? (
              <button
                className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saveState.status === "saving"}
                onClick={() => void archiveSelectedIntake()}
                type="button"
              >
                Archive Intake
              </button>
            ) : null}
          </div>
          {[createState, saveState, convertState, customerMatchState].map((item, index) =>
            item.message ? (
              <p
                className={`mt-3 text-sm font-semibold ${
                  item.status === "error" ? "text-amber-800" : "text-[#0F6BFF]"
                }`}
                key={index}
              >
                {item.message}
              </p>
            ) : null,
          )}
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  maxLength,
  onBlur,
  onChange,
  onFocus,
  type = "text",
  value,
}: {
  label: string;
  maxLength?: number;
  onBlur?: () => void;
  onChange: (value: string) => void;
  onFocus?: () => void;
  type?: "date" | "text" | "time";
  value: string;
}) {
  return (
    <label>
      <span className="text-xs font-black uppercase tracking-[0.16em] text-[#64748B]">
        {label}
      </span>
      <input
        className="mt-2 w-full rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2.5 text-sm font-bold text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#0F6BFF]"
        maxLength={maxLength}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        type={type}
        value={value}
      />
    </label>
  );
}

function SuggestionChips({
  items,
  onSelect,
}: {
  items: string[];
  onSelect: (value: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <button
          className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-black text-[#0F6BFF] transition hover:border-[#0F6BFF] hover:bg-blue-100"
          key={item}
          onClick={() => onSelect(item)}
          type="button"
        >
          {item}
        </button>
      ))}
    </div>
  );
}
