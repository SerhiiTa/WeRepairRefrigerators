"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import {
  formatServiceRequestMoney,
  formatServiceRequestDate,
  formatServiceRequestSource,
  mapPricingCatalogItemRow,
  mapServiceRequestEstimateRow,
  mapServiceRequestNoteRow,
  mapServiceRequestPhotoRow,
  mapServiceRequestRow,
  PRICING_CATALOG_SELECT_COLUMNS,
  SERVICE_REQUEST_ESTIMATE_SELECT_COLUMNS,
  SERVICE_REQUEST_NOTE_SELECT_COLUMNS,
  SERVICE_REQUEST_NOTE_TYPES,
  SERVICE_REQUEST_PHOTO_SELECT_COLUMNS,
  SERVICE_REQUEST_CRM_STATUSES,
  SERVICE_REQUEST_SELECT_COLUMNS,
  type DashboardPricingCatalogItem,
  type DashboardServiceRequestEstimate,
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
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  DatabaseServiceRequestNoteType,
  DatabaseServiceRequestPhotoType,
  PricingCatalogItemRow,
  ServiceRequestEstimateRow,
  ServiceRequestNoteRow,
  ServiceRequestPhotoRow,
  ServiceRequestRow,
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
  | { status: "saving"; message: null }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const statusTone: Record<string, "cyan" | "emerald" | "amber" | "slate"> = {
  new: "cyan",
  contacted: "amber",
  scheduled: "cyan",
  completed: "emerald",
  canceled: "slate",
  reviewed: "amber",
  lead_created: "emerald",
  archived: "slate",
  spam: "slate",
};

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

function getReadErrorMessage(message: string): string {
  if (message.includes("permission denied") || message.includes("row-level security")) {
    return "This account cannot read that service request. Apply migration 0018 and confirm the request is selected for this technician profile, or use an admin account.";
  }

  return message;
}

export function ServiceRequestDetail({ requestId }: ServiceRequestDetailProps) {
  const [state, setState] = useState<DetailState>({
    status: "loading",
    request: null,
    error: null,
  });
  const [selectedStatus, setSelectedStatus] =
    useState<ServiceRequestCrmStatus>("new");
  const [statusUpdateState, setStatusUpdateState] =
    useState<StatusUpdateState>({ status: "idle", message: null });
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
  const [selectedCatalogItemIds, setSelectedCatalogItemIds] = useState<
    string[]
  >([]);
  const [selectedEstimateApplianceType, setSelectedEstimateApplianceType] =
    useState("");
  const [customItemTitle, setCustomItemTitle] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("");
  const [estimateSaveState, setEstimateSaveState] = useState<EstimateSaveState>({
    status: "idle",
    message: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadRequest() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setState({
            status: "error",
            request: null,
            error: "Supabase is not configured for dashboard service request reads.",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  async function loadNotes() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setNotesState({
        status: "error",
        notes: [],
        error: "Supabase is not configured for internal notes.",
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
          ? "Internal notes are not ready yet. Apply migration 0020 in Supabase."
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
        error: "Supabase is not configured for service request photos.",
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
          ? "Photo uploads are not ready yet. Apply migration 0021 in Supabase."
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
        error: "Supabase is not configured for pricing catalog reads.",
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
          ? "Pricing catalog v2 is not ready yet. Apply migration 0024 in Supabase."
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
        error: "Supabase is not configured for estimates.",
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
          ? "Estimate v2 fields are not ready yet. Apply migration 0024 in Supabase."
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

  async function updateStatus() {
    if (state.status !== "ready") {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setStatusUpdateState({
        status: "error",
        message: "Supabase is not configured for status updates.",
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
      body: JSON.stringify({ status: selectedStatus }),
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
          status: selectedStatus,
          updatedAt: payload.request?.updated_at ?? current.request.updatedAt,
        },
        error: null,
      };
    });
    setStatusUpdateState({
      status: "success",
      message: "Service request status updated.",
    });
    void loadNotes();
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
    setSelectedCatalogItemIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  }

  async function createEstimate() {
    if (state.status !== "ready") {
      return;
    }

    const customPrice = Number(customItemPrice);
    const hasCustomItem =
      customItemTitle.trim().length > 0 &&
      Number.isFinite(customPrice) &&
      customPrice > 0;

    if (selectedCatalogItemIds.length === 0 && !hasCustomItem) {
      setEstimateSaveState({
        status: "error",
        message: "Select a catalog job or add a custom line item.",
      });
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setEstimateSaveState({
        status: "error",
        message: "Supabase is not configured for estimates.",
      });
      return;
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      setEstimateSaveState({
        status: "error",
        message: "Log in again before creating an estimate.",
      });
      return;
    }

    setEstimateSaveState({ status: "saving", message: null });

    const response = await fetch(
      `/api/service-requests/${state.request.id}/estimates`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          catalogItems: selectedCatalogItemIds.map((pricingCatalogItemId) => ({
            pricingCatalogItemId,
            quantity: 1,
          })),
          customItems: hasCustomItem
            ? [
                {
                  itemTitle: customItemTitle,
                  quantity: 1,
                  unitPrice: customPrice,
                },
              ]
            : [],
        }),
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      estimate?: {
        request_status?: string;
      };
    } | null;

    if (!response.ok || !payload?.ok) {
      setEstimateSaveState({
        status: "error",
        message: payload?.message ?? "We could not create this estimate yet.",
      });
      return;
    }

    setSelectedCatalogItemIds([]);
    setCustomItemTitle("");
    setCustomItemPrice("");
    setEstimateSaveState({
      status: "success",
      message: "Estimate created.",
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

    void loadEstimates();
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
        message: "Supabase is not configured for internal notes.",
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
      <section className="rounded-lg border border-white/10 bg-slate-900 p-6 text-slate-300">
        Loading service request...
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-6">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-100">
          Request unavailable
        </p>
        <h1 className="mt-3 text-2xl font-bold text-white">Unable to load this request.</h1>
        <p className="mt-3 leading-7 text-amber-50/90">{state.error}</p>
        <Link className="mt-5 inline-flex text-sm font-bold text-cyan-200" href="/dashboard/leads">
          Back to service requests
        </Link>
      </section>
    );
  }

  if (state.status === "empty") {
    return (
      <section className="rounded-lg border border-white/10 bg-slate-900 p-6">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
          Request detail
        </p>
        <h1 className="mt-3 text-2xl font-bold text-white">Service request not found.</h1>
        <Link className="mt-5 inline-flex text-sm font-bold text-cyan-200" href="/dashboard/leads">
          Back to service requests
        </Link>
      </section>
    );
  }

  const request = state.request;
  const availableApplianceTypes = Array.from(
    new Set(catalogState.items.map((item) => item.applianceType)),
  ).sort((left, right) => left.localeCompare(right));
  const requestApplianceMatch =
    availableApplianceTypes.find(
      (type) => type.toLowerCase() === request.applianceType.toLowerCase(),
    ) ?? null;
  const activeEstimateApplianceType =
    selectedEstimateApplianceType ||
    requestApplianceMatch ||
    availableApplianceTypes[0] ||
    "";
  const filteredCatalogItems = catalogState.items
    .filter((item) => item.applianceType === activeEstimateApplianceType)
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.category.localeCompare(right.category) ||
        left.title.localeCompare(right.title),
    );
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
  const customPrice = Number(customItemPrice);
  const validCustomPrice =
    Number.isFinite(customPrice) && customPrice > 0 ? customPrice : 0;
  const estimatePreviewTotal =
    selectedCatalogItems.reduce(
      (total, item) => total + item.customerPrice,
      0,
    ) + (customItemTitle.trim() ? validCustomPrice : 0);
  const previewWarranty =
    selectedCatalogItems.find((item) => item.defaultWarrantyText)
      ?.defaultWarrantyText ??
    "Standard workmanship warranty applies to completed repair labor. Manufacturer part warranties may vary.";
  const previewDisclaimer =
    selectedCatalogItems.find((item) => item.defaultDisclaimerText)
      ?.defaultDisclaimerText ??
    "This draft estimate is based on visible symptoms and selected repair scope. Final pricing may change if additional failed components are found during diagnosis.";

  return (
    <article className="rounded-lg border border-white/10 bg-slate-900 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
            Service request detail
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
            {request.customerName} · {request.applianceBrand ?? "Unknown brand"}{" "}
            {request.applianceType}
          </h1>
          <p className="mt-3 text-slate-400">Submitted {formatServiceRequestDate(request.createdAt)}</p>
        </div>
        <StatusBadge tone={statusTone[request.status] ?? "slate"}>
          {formatServiceRequestSource(request.status)}
        </StatusBadge>
      </div>

      <section className="mt-6 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-4">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <label className="block">
            <span className="text-sm font-bold text-cyan-50">
              CRM status
            </span>
            <select
              className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
              disabled={statusUpdateState.status === "saving"}
              onChange={(event) =>
                setSelectedStatus(event.target.value as ServiceRequestCrmStatus)
              }
              value={selectedStatus}
            >
              {SERVICE_REQUEST_CRM_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatServiceRequestSource(status)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded-md bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              statusUpdateState.status === "saving" ||
              selectedStatus === request.status
            }
            onClick={() => void updateStatus()}
            type="button"
          >
            {statusUpdateState.status === "saving"
              ? "Updating..."
              : "Update Status"}
          </button>
        </div>
        {statusUpdateState.message ? (
          <p
            className={`mt-3 text-sm font-semibold ${
              statusUpdateState.status === "error"
                ? "text-amber-100"
                : "text-cyan-50"
            }`}
          >
            {statusUpdateState.message}
          </p>
        ) : null}
        <p className="mt-3 text-xs leading-5 text-cyan-50/70">
          Status updates use a narrow authenticated RPC and only write status
          plus updated timestamp.
        </p>
      </section>

      <dl className="mt-8 grid gap-4 lg:grid-cols-2">
        {[
          ["Customer name", request.customerName],
          ["Phone", request.customerPhone ?? "Not provided"],
          ["Email", request.customerEmail ?? "Not provided"],
          ["Location", `${request.city ? `${request.city}, ` : ""}${request.state} ${request.zipCode}`],
          ["Appliance", `${request.applianceBrand ?? "Unknown brand"} ${request.applianceType}`],
          ["Model", request.applianceModel ?? "Not provided"],
          ["Preferred window", request.preferredTimeWindow ?? "Not provided"],
          ["Selected technician", request.selectedTechnicianBusinessName ?? "Unassigned"],
          ["Technician slug", request.selectedTechnicianSlug ?? "None"],
          ["Source", formatServiceRequestSource(request.requestSource)],
        ].map(([label, value]) => (
          <div className="rounded-md border border-white/10 bg-slate-950 p-4" key={label}>
            <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </dt>
            <dd className="mt-2 text-sm leading-6 text-slate-300">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 rounded-md border border-white/10 bg-slate-950 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          Issue description
        </p>
        <p className="mt-2 leading-7 text-slate-300">{request.issueDescription}</p>
      </div>

      <section className="mt-6 rounded-lg border border-white/10 bg-slate-950 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
              Estimate
            </p>
            <h2 className="mt-2 text-xl font-bold text-white">
              Create quick repair estimate
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Select common repair jobs from the catalog, add one optional
              custom line, and save a draft estimate for this request.
            </p>
          </div>
          <div className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-right">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-100">
              Preview total
            </p>
            <p className="mt-1 text-2xl font-bold text-white">
              {formatServiceRequestMoney(estimatePreviewTotal)}
            </p>
          </div>
        </div>

        {catalogState.status === "loading" ? (
          <p className="mt-4 text-sm text-slate-400">Loading pricing catalog...</p>
        ) : null}
        {catalogState.status === "error" ? (
          <p className="mt-4 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-50">
            {catalogState.error}
          </p>
        ) : null}
        {catalogState.status === "ready" ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {availableApplianceTypes.map((type) => (
                <button
                  className={`rounded-full border px-3 py-2 text-xs font-bold transition ${
                    activeEstimateApplianceType === type
                      ? "border-cyan-300 bg-cyan-300 text-slate-950"
                      : "border-white/10 bg-slate-900 text-slate-300 hover:border-cyan-300/60"
                  }`}
                  key={type}
                  onClick={() => {
                    setSelectedEstimateApplianceType(type);
                    setSelectedCatalogItemIds([]);
                  }}
                  type="button"
                >
                  {type}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {filteredCatalogItems.map((item) => {
              const isSelected = selectedCatalogItemIds.includes(item.id);

              return (
                <button
                  className={`rounded-md border p-4 text-left transition ${
                    isSelected
                      ? "border-cyan-300 bg-cyan-300/10"
                      : "border-white/10 bg-slate-900 hover:border-cyan-300/50"
                  }`}
                  disabled={estimateSaveState.status === "saving"}
                  key={item.id}
                  onClick={() => toggleCatalogItem(item.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                        {item.applianceType} · {item.category}
                      </p>
                      <p className="mt-2 text-sm font-bold text-white">
                        {item.title}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-cyan-100">
                      {formatServiceRequestMoney(item.customerPrice)}
                    </span>
                  </div>
                  {item.description ? (
                    <p className="mt-3 text-xs leading-5 text-slate-400">
                      {item.description}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.defaultWarrantyText ? (
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-[11px] font-bold text-emerald-100">
                        Warranty included
                      </span>
                    ) : null}
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-bold text-slate-400">
                      {item.taxable ? "Taxable" : "Non-taxable"}
                    </span>
                    {item.technicianCost !== null ? (
                      <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[11px] font-bold text-amber-100">
                        Internal cost {formatServiceRequestMoney(item.technicianCost)}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
            </div>
          </>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_10rem]">
          <label className="block">
            <span className="text-sm font-bold text-slate-100">
              Optional custom line item
            </span>
            <input
              className="mt-2 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
              disabled={estimateSaveState.status === "saving"}
              maxLength={160}
              onChange={(event) => setCustomItemTitle(event.target.value)}
              placeholder="Custom part/labor line"
              value={customItemTitle}
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-100">Price</span>
            <input
              className="mt-2 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
              disabled={estimateSaveState.status === "saving"}
              min="0"
              onChange={(event) => setCustomItemPrice(event.target.value)}
              placeholder="0.00"
              step="0.01"
              type="number"
              value={customItemPrice}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            className="rounded-md bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={estimateSaveState.status === "saving"}
            onClick={() => void createEstimate()}
            type="button"
          >
            {estimateSaveState.status === "saving"
              ? "Creating..."
              : "Create Estimate"}
          </button>
          <p className="text-xs leading-5 text-slate-500">
            First estimate creation moves new requests to Contacted and adds a
            timeline entry.
          </p>
        </div>
        {estimateSaveState.message ? (
          <p
            className={`mt-3 text-sm font-semibold ${
              estimateSaveState.status === "error"
                ? "text-amber-100"
                : "text-cyan-100"
            }`}
          >
            {estimateSaveState.message}
          </p>
        ) : null}

        <div className="mt-6 rounded-lg border border-white/10 bg-white p-5 text-slate-950">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
                Customer preview
              </p>
              <h3 className="mt-2 text-2xl font-black">
                Draft Estimate
              </h3>
              <p className="mt-1 text-sm font-bold text-slate-600">
                {request.selectedTechnicianBusinessName ?? "WeRepairRefrigerators"} ·{" "}
                {formatServiceRequestDate(new Date().toISOString())}
              </p>
            </div>
            <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
              Preview only
            </span>
          </div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                Customer
              </dt>
              <dd className="mt-1 text-sm font-bold">{request.customerName}</dd>
            </div>
            <div>
              <dt className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                Appliance
              </dt>
              <dd className="mt-1 text-sm font-bold">
                {request.applianceBrand ?? "Unknown brand"} {request.applianceType}
              </dd>
            </div>
          </dl>
          <div className="mt-5 divide-y divide-slate-200 rounded-2xl border border-slate-200">
            {selectedCatalogItems.length === 0 && !customItemTitle.trim() ? (
              <p className="p-4 text-sm font-semibold text-slate-500">
                Select catalog jobs or add a custom line to preview the customer estimate.
              </p>
            ) : null}
            {selectedCatalogItems.map((item) => (
              <div
                className="flex items-start justify-between gap-4 p-4 text-sm"
                key={item.id}
              >
                <div>
                  <p className="font-black">{item.title}</p>
                  {item.description ? (
                    <p className="mt-1 leading-5 text-slate-600">{item.description}</p>
                  ) : null}
                </div>
                <p className="font-black">
                  {formatServiceRequestMoney(item.customerPrice)}
                </p>
              </div>
            ))}
            {customItemTitle.trim() ? (
              <div className="flex items-start justify-between gap-4 p-4 text-sm">
                <p className="font-black">{customItemTitle.trim()}</p>
                <p className="font-black">
                  {formatServiceRequestMoney(validCustomPrice)}
                </p>
              </div>
            ) : null}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
            <p className="text-sm font-black">Total</p>
            <p className="text-2xl font-black">
              {formatServiceRequestMoney(estimatePreviewTotal)}
            </p>
          </div>
          <div className="mt-5 grid gap-3 text-xs leading-5 text-slate-600 md:grid-cols-2">
            <p>
              <span className="font-black text-slate-900">Warranty: </span>
              {previewWarranty}
            </p>
            <p>
              <span className="font-black text-slate-900">Disclaimer: </span>
              {previewDisclaimer}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Saved estimates
          </p>
          {estimatesState.status === "loading" ? (
            <p className="mt-3 text-sm text-slate-400">Loading estimates...</p>
          ) : null}
          {estimatesState.status === "error" ? (
            <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-50">
              {estimatesState.error}
            </p>
          ) : null}
          {estimatesState.status === "ready" &&
          estimatesState.estimates.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-slate-500">
              No estimates created yet.
            </p>
          ) : null}
          {estimatesState.estimates.length > 0 ? (
            <div className="mt-3 space-y-3">
              {estimatesState.estimates.map((estimate) => (
                <article
                  className="rounded-md border border-white/10 bg-slate-900 p-4"
                  key={estimate.id}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-bold text-white">
                        {estimate.estimateNumber} ·{" "}
                        {formatServiceRequestSource(estimate.estimateStatus)}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        Created {formatServiceRequestDate(estimate.createdAt)}
                      </p>
                    </div>
                    <p className="text-xl font-bold text-cyan-100">
                      {formatServiceRequestMoney(estimate.total)}
                    </p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {estimate.items.map((item) => (
                      <div
                        className="flex flex-col gap-1 rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                        key={item.id}
                      >
                        <span className="font-semibold text-slate-200">
                          {item.quantity}x {item.itemTitle}
                        </span>
                        <span className="font-bold text-slate-300">
                          {formatServiceRequestMoney(item.lineTotal)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {(estimate.warrantyText || estimate.disclaimerText) ? (
                    <div className="mt-3 grid gap-3 text-xs leading-5 text-slate-400 md:grid-cols-2">
                      {estimate.warrantyText ? (
                        <p>
                          <span className="font-bold text-slate-200">Warranty: </span>
                          {estimate.warrantyText}
                        </p>
                      ) : null}
                      {estimate.disclaimerText ? (
                        <p>
                          <span className="font-bold text-slate-200">Disclaimer: </span>
                          {estimate.disclaimerText}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[0.8fr_0.8fr_1.1fr]">
        <div className="rounded-lg border border-white/10 bg-slate-950 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
            Internal note
          </p>
          <label className="mt-4 block">
            <span className="text-sm font-bold text-slate-100">Note type</span>
            <select
              className="mt-2 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
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
            <span className="text-sm font-bold text-slate-100">Quick note</span>
            <textarea
              className="mt-2 min-h-32 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300"
              disabled={noteSaveState.status === "saving"}
              maxLength={2000}
              onChange={(event) => setNoteBody(event.target.value)}
              placeholder="Diagnostics, parts reminder, dispatcher note..."
              value={noteBody}
            />
          </label>
          <button
            className="mt-4 w-full rounded-md bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
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
                  ? "text-amber-100"
                  : "text-cyan-100"
              }`}
            >
              {noteSaveState.message}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-white/10 bg-slate-950 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
            Request photos
          </p>
          <label className="mt-4 block">
            <span className="text-sm font-bold text-slate-100">Photo type</span>
            <select
              className="mt-2 w-full rounded-md border border-white/10 bg-slate-900 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
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
            <span className="text-sm font-bold text-slate-100">
              Upload image
            </span>
            <input
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="mt-2 block w-full rounded-md border border-dashed border-white/10 bg-slate-900 px-3 py-4 text-xs font-semibold text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-cyan-300 file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-950"
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
            <p className="mt-3 text-xs font-bold text-slate-300">
              Selected: {photoFile.name}
            </p>
          ) : null}
          {photoFileError ? (
            <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-50">
              {photoFileError}
            </p>
          ) : null}
          <button
            className="mt-4 w-full rounded-md bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
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
                  ? "text-amber-100"
                  : "text-cyan-100"
              }`}
            >
              {photoSaveState.message}
            </p>
          ) : null}

          <div className="mt-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Attached photos
            </p>
            {photosState.status === "loading" ? (
              <p className="mt-3 text-sm text-slate-400">Loading photos...</p>
            ) : null}
            {photosState.status === "error" ? (
              <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-50">
                {photosState.error}
              </p>
            ) : null}
            {photosState.status === "ready" && photosState.photos.length === 0 ? (
              <p className="mt-3 text-sm leading-6 text-slate-500">
                No photos attached yet.
              </p>
            ) : null}
            {photosState.photos.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {photosState.photos.map((photo) => (
                  <a
                    className="group overflow-hidden rounded-md border border-white/10 bg-slate-900"
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
                      <div className="flex aspect-square items-center justify-center p-3 text-center text-xs font-bold text-slate-500">
                        Signed URL unavailable
                      </div>
                    )}
                    <p className="truncate px-2 py-2 text-xs font-bold text-slate-300">
                      {photoTypeLabels[photo.photoType]}
                    </p>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-slate-950 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
            Service timeline
          </p>
          <div className="mt-4 space-y-3">
            {notesState.status === "loading" ? (
              <p className="text-sm text-slate-400">Loading timeline...</p>
            ) : null}
            {notesState.status === "error" ? (
              <p className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-50">
                {notesState.error}
              </p>
            ) : null}
            {photosState.status === "error" ? (
              <p className="rounded-md border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-6 text-amber-50">
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
              body="Service request submitted from public intake."
              createdAt={request.createdAt}
              label="Request created"
            />
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Timeline is designed for future photos, estimates, signatures, parts
            updates, and visit milestones.
          </p>
        </div>
      </section>

      <Link className="mt-6 inline-flex text-sm font-bold text-cyan-200" href="/dashboard/leads">
        Back to service requests
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
    <article className="rounded-md border border-white/10 bg-slate-900 p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-bold text-white">{label}</p>
        <time className="text-xs font-semibold text-slate-500">
          {formatServiceRequestDate(createdAt)}
        </time>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>
    </article>
  );
}
