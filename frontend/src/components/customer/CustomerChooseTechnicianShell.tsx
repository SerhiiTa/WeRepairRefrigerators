"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  getApplianceIconLabel,
  getApplianceSubtitle,
  getApplianceTitle,
} from "@/components/customer/customer-appliance-ui";
import { CustomerPortalHeader } from "@/components/customer/CustomerPortalHeader";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  CustomerApplianceRow,
  CustomerRow,
  PublicTechnicianProfileRow,
} from "@/lib/supabase/types";

const REPAIR_DRAFT_STORAGE_KEY = "wra_customer_repair_draft";
const BOOKING_RESULT_STORAGE_KEY = "wra_customer_booking_result";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RepairDraft = {
  applianceId: string;
  customer_appliance_id?: string;
  problemDescription: string;
  preferredContactMethod: string;
  notes: string;
  serviceZipCode: string;
  serviceCity: string;
  serviceState: string;
};

type BookingWindow = {
  date: string;
  start_time: string;
  end_time: string;
  source: string;
};

type TechnicianOption = PublicTechnicianProfileRow & {
  matchReasons: string[];
  confidence: "High" | "Medium" | "Basic";
  score: number;
};

type ChooseTechnicianState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "draft_missing" }
  | {
      status: "ready";
      customer: CustomerRow;
      appliance: CustomerApplianceRow;
      draft: RepairDraft;
      technicians: TechnicianOption[];
    }
  | { status: "unavailable"; message: string };

function getNextDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);

  return date.toISOString().slice(0, 10);
}

function formatWindowTime(value: string): string {
  const [hourValue = "0", minuteValue = "0"] = value.split(":");
  const hour = Number(hourValue);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minuteValue.padStart(2, "0")} ${suffix}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function readDraft(applianceId: string | null): RepairDraft | null {
  const routeApplianceId = applianceId?.trim();

  if (!isUuid(routeApplianceId)) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(REPAIR_DRAFT_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<RepairDraft>) : null;

    if (!parsed) {
      return null;
    }

    const storedApplianceId = (
      parsed.applianceId ?? parsed.customer_appliance_id ?? ""
    ).trim();

    if (
      isUuid(storedApplianceId) &&
      storedApplianceId === routeApplianceId &&
      parsed.problemDescription &&
      parsed.serviceZipCode
    ) {
      return {
        applianceId: storedApplianceId,
        customer_appliance_id: storedApplianceId,
        problemDescription: parsed.problemDescription,
        preferredContactMethod: parsed.preferredContactMethod || "phone",
        notes: parsed.notes || "",
        serviceZipCode: parsed.serviceZipCode,
        serviceCity: parsed.serviceCity || "",
        serviceState: parsed.serviceState || "TX",
      };
    }
  } catch {
    return null;
  }

  return null;
}

function scoreTechnician(
  row: PublicTechnicianProfileRow,
  draft: RepairDraft,
  appliance: CustomerApplianceRow,
): TechnicianOption {
  const specialties = row.specialties ?? [];
  const applianceCategories = row.appliance_categories ?? [];
  const brandsServiced = row.brands_serviced ?? [];
  const serviceCities = row.service_cities ?? [];
  const zipCodes = row.service_zip_codes ?? [];
  const reasons: string[] = [];
  let score = 0;

  if (zipCodes.includes(draft.serviceZipCode)) {
    score += 100;
    reasons.push(`Covers ZIP ${draft.serviceZipCode}`);
  }

  const applianceType = appliance.appliance_type.toLowerCase();
  const applianceKeyword = applianceType.split(" ")[0] ?? applianceType;
  const applianceMatch = [...applianceCategories, ...specialties].some((item) =>
    item.toLowerCase().includes(applianceKeyword),
  );

  if (applianceMatch) {
    score += 35;
    reasons.push(`${appliance.appliance_type} specialist`);
  }

  if (appliance.brand) {
    const brandMatch = [...brandsServiced, ...specialties].some((item) =>
      item.toLowerCase().includes(appliance.brand!.toLowerCase()),
    );

    if (brandMatch) {
      score += 20;
      reasons.push(`${appliance.brand} experience`);
    }
  }

  if (draft.serviceCity) {
    const cityMatch = serviceCities.some((city) =>
      city.toLowerCase().includes(draft.serviceCity.toLowerCase()),
    );

    if (cityMatch) {
      score += 10;
      reasons.push(`Serves ${draft.serviceCity}`);
    }
  }

  if (row.years_experience) {
    score += Math.min(row.years_experience, 20);
    reasons.push(`${row.years_experience} years experience`);
  }

  if (row.service_summary_public && (row.display_name || row.business_name)) {
    score += 5;
  }

  return {
    ...row,
    matchReasons: reasons.length > 0 ? reasons : ["Marketplace profile is available"],
    confidence: score >= 140 ? "High" : score >= 110 ? "Medium" : "Basic",
    score,
  };
}

function fallbackWindows(date: string): BookingWindow[] {
  return [
    { date, start_time: "09:00:00", end_time: "12:00:00", source: "controlled_window" },
    { date, start_time: "12:00:00", end_time: "15:00:00", source: "controlled_window" },
    { date, start_time: "15:00:00", end_time: "18:00:00", source: "controlled_window" },
  ];
}

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function CustomerChooseTechnicianShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const applianceId = searchParams.get("appliance");
  const [state, setState] = useState<ChooseTechnicianState>({ status: "loading" });
  const [selectedTechnicianSlug, setSelectedTechnicianSlug] = useState("");
  const [selectedDate, setSelectedDate] = useState(getNextDate(1));
  const [windows, setWindows] = useState<BookingWindow[]>(fallbackWindows(getNextDate(1)));
  const [selectedWindowKey, setSelectedWindowKey] = useState("");
  const [windowStatus, setWindowStatus] = useState<string | null>(null);
  const [bookingStatus, setBookingStatus] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadFlow() {
      const draft = readDraft(applianceId);

      if (!draft) {
        if (isMounted) {
          setState({ status: "draft_missing" });
        }
        return;
      }

      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        if (isMounted) {
          setState({
            status: "unavailable",
            message: "Customer booking is not configured in this environment yet.",
          });
        }
        return;
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        if (isMounted) {
          setState({ status: "signed_out" });
          router.replace(
            `/customer/login?next=/customer/choose-technician?appliance=${encodeURIComponent(draft.applianceId)}`,
          );
        }
        return;
      }

      const customerResult = await supabase
        .from("customers")
        .select("*")
        .eq("auth_user_id", sessionData.session.user.id)
        .maybeSingle();

      if (customerResult.error || !customerResult.data) {
        if (isMounted) {
          setState({
            status: "unavailable",
            message: "Your customer account is not ready for booking yet.",
          });
        }
        return;
      }

      const customer = customerResult.data as CustomerRow;
      const applianceResult = await supabase
        .from("customer_appliances")
        .select("*")
        .eq("id", draft.applianceId)
        .eq("customer_id", customer.id)
        .maybeSingle();

      if (applianceResult.error || !applianceResult.data) {
        if (isMounted) {
          setState({ status: "draft_missing" });
        }
        return;
      }

      const technicianResult = await supabase
        .from("public_technician_profiles")
        .select(
          "slug,display_name,business_name,primary_city,primary_state,service_summary_public,service_zip_codes,service_cities,appliance_categories,brands_serviced,specialties,languages,years_experience,avatar_color,technician_status,public_profile_ready,marketplace_enabled,created_at",
        )
        .order("display_name", { ascending: true, nullsFirst: false });

      const technicianRows = technicianResult.error
        ? (
            await supabase
              .from("public_technician_profiles")
              .select(
                "slug,display_name,business_name,primary_city,primary_state,service_summary_public,specialties,languages,years_experience,service_zip_codes,technician_status,public_profile_ready,marketplace_enabled,created_at",
              )
              .order("display_name", { ascending: true, nullsFirst: false })
          ).data
        : technicianResult.data;

      const normalizedTechnicianRows = (technicianRows ?? []).map((row) => ({
        ...row,
        service_cities: "service_cities" in row ? row.service_cities : null,
        appliance_categories:
          "appliance_categories" in row ? row.appliance_categories : null,
        brands_serviced: "brands_serviced" in row ? row.brands_serviced : null,
        avatar_color: "avatar_color" in row ? row.avatar_color : null,
      })) as PublicTechnicianProfileRow[];

      const appliance = applianceResult.data as CustomerApplianceRow;
      const technicians = normalizedTechnicianRows
        .filter((technician) =>
          (technician.service_zip_codes ?? []).includes(draft.serviceZipCode),
        )
        .map((technician) => scoreTechnician(technician, draft, appliance))
        .sort(
          (first, second) =>
            second.score - first.score ||
            (first.business_name || first.display_name || first.slug).localeCompare(
              second.business_name || second.display_name || second.slug,
            ),
        );

      if (isMounted) {
        setState({
          status: "ready",
          customer,
          appliance,
          draft,
          technicians,
        });
        setSelectedTechnicianSlug(technicians[0]?.slug ?? "");
      }
    }

    void loadFlow();

    return () => {
      isMounted = false;
    };
  }, [applianceId, router]);

  useEffect(() => {
    let isMounted = true;

    async function loadWindows() {
      if (!selectedTechnicianSlug) {
        setWindows(fallbackWindows(selectedDate));
        setSelectedWindowKey("");
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const { data: sessionData } = supabase
        ? await supabase.auth.getSession()
        : { data: { session: null } };
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setWindows(fallbackWindows(selectedDate));
        return;
      }

      setWindowStatus("Loading appointment windows...");
      const response = await fetch(
        `/api/customer/technician-windows?technician=${encodeURIComponent(selectedTechnicianSlug)}&date=${encodeURIComponent(selectedDate)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      const result = (await response.json()) as {
        ok?: boolean;
        windows?: BookingWindow[];
        message?: string;
      };

      if (!isMounted) {
        return;
      }

      if (response.ok && result.ok !== false && result.windows?.length) {
        setWindows(result.windows);
        setWindowStatus(null);
        setSelectedWindowKey(`${result.windows[0].date}|${result.windows[0].start_time}|${result.windows[0].end_time}`);
        return;
      }

      setWindows(fallbackWindows(selectedDate));
      setSelectedWindowKey("");
      setWindowStatus(result.message || "Showing controlled booking windows.");
    }

    void loadWindows();

    return () => {
      isMounted = false;
    };
  }, [selectedTechnicianSlug, selectedDate]);

  const selectedTechnician = useMemo(() => {
    if (state.status !== "ready") {
      return null;
    }

    return (
      state.technicians.find(
        (technician) => technician.slug === selectedTechnicianSlug,
      ) ?? null
    );
  }, [selectedTechnicianSlug, state]);

  async function bookAppointment() {
    if (state.status !== "ready") {
      return;
    }

    const selectedWindow = windows.find(
      (windowOption) =>
        `${windowOption.date}|${windowOption.start_time}|${windowOption.end_time}` ===
        selectedWindowKey,
    );

    if (!selectedTechnician || !selectedWindow) {
      setBookingStatus("Choose a technician and appointment window first.");
      return;
    }

    if (!isUuid(state.appliance.id)) {
      setBookingStatus(
        "This appliance record is missing a valid ID. Return to the dashboard and start the repair from the appliance card again.",
      );
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setBookingStatus("Customer booking is not configured yet.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      router.push("/customer/login?next=/customer/choose-technician");
      return;
    }

    setIsBooking(true);
    setBookingStatus(null);

    try {
      const response = await fetch("/api/customer/repair-booking", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          customerApplianceId: state.appliance.id.trim(),
          customer_appliance_id: state.appliance.id.trim(),
          problemDescription: state.draft.problemDescription,
          preferredContactMethod: state.draft.preferredContactMethod,
          notes: state.draft.notes,
          serviceZipCode: state.draft.serviceZipCode,
          serviceCity: state.draft.serviceCity,
          serviceState: state.draft.serviceState,
          selectedTechnicianSlug: selectedTechnician.slug,
          appointmentDate: selectedWindow.date,
          windowStartTime: selectedWindow.start_time,
          windowEndTime: selectedWindow.end_time,
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        service_request_id?: string;
        service_request_created_at?: string;
        public_reference?: string | null;
        appointment_id?: string;
        technician_name?: string | null;
        appointment_date?: string;
        window_start_time?: string;
        window_end_time?: string;
        message?: string;
      };

      if (!response.ok || result.ok === false) {
        setBookingStatus(result.message || "We could not book this repair yet.");
        return;
      }

      window.sessionStorage.setItem(
        BOOKING_RESULT_STORAGE_KEY,
        JSON.stringify({
          ...result,
          applianceTitle: getApplianceTitle(state.appliance),
          problemDescription: state.draft.problemDescription,
          serviceZipCode: state.draft.serviceZipCode,
          technicianName:
            result.technician_name ||
            selectedTechnician.business_name ||
            selectedTechnician.display_name ||
            "Selected technician",
        }),
      );
      window.sessionStorage.removeItem(REPAIR_DRAFT_STORAGE_KEY);
      router.push(
        `/customer/booking-confirmation?reference=${encodeURIComponent(result.public_reference ?? "")}`,
      );
    } finally {
      setIsBooking(false);
    }
  }

  if (state.status === "loading" || state.status === "signed_out") {
    return (
      <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
        <div className="mx-auto max-w-4xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-bold text-slate-600">Loading technician options...</p>
        </div>
      </main>
    );
  }

  if (state.status === "unavailable" || state.status === "draft_missing") {
    return (
      <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-slate-950">
        <div className="mx-auto max-w-4xl rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <h1 className="text-2xl font-black">
            {state.status === "draft_missing" ? "Start from an appliance" : "Booking unavailable"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {state.status === "draft_missing"
              ? "Choose Request Repair from one of your saved appliances before selecting a technician."
              : state.message}
          </p>
          <Link
            href="/customer/dashboard"
            className="mt-5 inline-flex h-11 items-center rounded-xl bg-[#0F6BFF] px-4 text-sm font-bold text-white"
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const dates = [getNextDate(1), getNextDate(2), getNextDate(3), getNextDate(4)];

  return (
    <main className="min-h-screen bg-[#F7F9FC] text-slate-950">
      <CustomerPortalHeader customer={state.customer} />
      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:p-7">
          <Link
            href={`/customer/request-repair?appliance=${encodeURIComponent(state.appliance.id)}`}
            className="text-sm font-bold text-[#0F6BFF]"
          >
            Back to repair details
          </Link>
          <h1 className="mt-3 text-3xl font-black text-slate-950">
            Choose Technician & Time
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Select a real marketplace technician and appointment window. The repair is created only after final booking.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="grid gap-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-black uppercase tracking-[0.1em] text-[#0F6BFF]">
                Selected Asset
              </p>
              <div className="mt-3 flex gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-sm font-black text-[#0F6BFF]">
                  {getApplianceIconLabel(state.appliance.appliance_type)}
                </div>
                <div>
                  <p className="font-black text-slate-950">
                    {getApplianceTitle(state.appliance)}
                  </p>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                {getApplianceSubtitle(state.appliance)}
              </p>
            </div>
          </div>
          <p className="mt-4 rounded-2xl bg-[#F7F9FC] p-4 text-sm leading-6 text-slate-700">
                {state.draft.problemDescription}
              </p>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black">Technicians</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Showing real public profiles that cover ZIP {state.draft.serviceZipCode}.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3">
                {state.technicians.length > 0 ? (
                  state.technicians.map((technician, index) => {
                    const selected = technician.slug === selectedTechnicianSlug;
                    const name =
                      technician.business_name ||
                      technician.display_name ||
                      "Marketplace technician";

                    return (
                      <button
                        key={technician.slug}
                        type="button"
                        onClick={() => setSelectedTechnicianSlug(technician.slug)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          selected
                            ? "border-[#0F6BFF] bg-blue-50 shadow-[0_8px_24px_rgba(15,107,255,0.14)]"
                            : "border-slate-200 bg-[#F7F9FC] hover:border-blue-200"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className="flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black text-white"
                                style={{ backgroundColor: technician.avatar_color ?? "#0F6BFF" }}
                                aria-hidden="true"
                              >
                                {name.slice(0, 1).toUpperCase()}
                              </span>
                              <p className="text-base font-black text-slate-950">
                                {name}
                              </p>
                              {index === 0 ? (
                                <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">
                                  Top Match
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm text-slate-600">
                              {technician.primary_city || "Houston area"} · {technician.years_experience ?? 0} years
                            </p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700">
                            {technician.confidence} confidence
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {technician.matchReasons.slice(0, 3).map((reason) => (
                            <span
                              key={reason}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                        <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                          {technician.service_summary_public || "Public marketplace profile."}
                        </p>
                        <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-2">
                          <p>
                            Categories:{" "}
                            <span className="font-bold text-slate-800">
                              {(technician.appliance_categories?.length
                                ? technician.appliance_categories
                                : technician.specialties ?? []
                              )
                                .slice(0, 3)
                                .join(", ") || "Appliance repair"}
                            </span>
                          </p>
                          <p>
                            Brands:{" "}
                            <span className="font-bold text-slate-800">
                              {(technician.brands_serviced?.length
                                ? technician.brands_serviced
                                : technician.specialties ?? []
                              )
                                .slice(0, 3)
                                .join(", ") || "Multiple brands"}
                            </span>
                          </p>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-[#F7F9FC] p-5 text-sm font-semibold text-slate-600">
                    No real marketplace technicians currently cover this ZIP.
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="grid gap-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              <h2 className="text-xl font-black">Appointment Window</h2>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {dates.map((date) => (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setSelectedDate(date)}
                    className={`h-11 rounded-xl border px-3 text-sm font-bold transition ${
                      selectedDate === date
                        ? "border-[#0F6BFF] bg-[#0F6BFF] text-white"
                        : "border-slate-200 bg-[#F7F9FC] text-slate-800"
                    }`}
                  >
                    {formatDate(date)}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid gap-2">
                {windows.map((windowOption) => {
                  const key = `${windowOption.date}|${windowOption.start_time}|${windowOption.end_time}`;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedWindowKey(key)}
                      className={`rounded-xl border px-3 py-3 text-left text-sm font-bold transition ${
                        selectedWindowKey === key
                          ? "border-[#0F6BFF] bg-blue-50 text-[#0F6BFF]"
                          : "border-slate-200 bg-[#F7F9FC] text-slate-800"
                      }`}
                    >
                      {formatWindowTime(windowOption.start_time)} - {formatWindowTime(windowOption.end_time)}
                    </button>
                  );
                })}
              </div>
              {windowStatus ? (
                <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  {windowStatus}
                </p>
              ) : null}
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              <h2 className="text-xl font-black">Confirm Booking</h2>
              <div className="mt-4 grid gap-3 text-sm">
                <p className="rounded-xl bg-[#F7F9FC] p-3">
                  <span className="block text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                    Technician
                  </span>
                  <span className="font-bold text-slate-950">
                    {selectedTechnician?.business_name || selectedTechnician?.display_name || "Choose technician"}
                  </span>
                </p>
                <p className="rounded-xl bg-[#F7F9FC] p-3">
                  <span className="block text-xs font-black uppercase tracking-[0.08em] text-slate-500">
                    Service ZIP
                  </span>
                  <span className="font-bold text-slate-950">
                    {state.draft.serviceZipCode}
                  </span>
                </p>
              </div>
              {bookingStatus ? (
                <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                  {bookingStatus}
                </p>
              ) : null}
              <button
                type="button"
                disabled={isBooking || !selectedTechnician || !selectedWindowKey}
                onClick={() => void bookAppointment()}
                className="mt-4 h-12 w-full rounded-xl bg-[#0F6BFF] px-4 text-sm font-black text-white transition hover:bg-[#0057D9] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isBooking ? "Booking..." : "Book Appointment"}
              </button>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
