import type { CompanyAvailabilityTechnicianInput } from "./company-availability";
import type { TechnicianWorkBlock } from "./types";
import type { TechnicianAvailabilityRuleRow } from "@/lib/supabase/types";

export type TechnicianAvailabilityRule = {
  id: string;
  companyId: string | null;
  technicianProfileId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TechnicianAvailabilitySummary = {
  technicianProfileId: string;
  configuredDays: Array<{
    dayOfWeek: number;
    label: string;
    windows: string[];
  }>;
  hasAvailability: boolean;
  activeWindowCountForDate: number;
};

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function normalizeTime(value: string): string {
  return value.slice(0, 5);
}

function getDayOfWeekForDate(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00`).getDay();
}

function buildIsoForDateTime(dateKey: string, timeValue: string): string {
  return new Date(`${dateKey}T${normalizeTime(timeValue)}:00`).toISOString();
}

export function mapTechnicianAvailabilityRuleRow(
  row: TechnicianAvailabilityRuleRow,
): TechnicianAvailabilityRule {
  return {
    id: row.id,
    companyId: row.company_id,
    technicianProfileId: row.technician_profile_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    isAvailable: row.is_available,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAvailabilityRulesForTechnician(
  rules: TechnicianAvailabilityRule[],
  technicianProfileId: string,
): TechnicianAvailabilityRule[] {
  return rules
    .filter((rule) => rule.technicianProfileId === technicianProfileId)
    .sort(
      (first, second) =>
        first.dayOfWeek - second.dayOfWeek ||
        first.startTime.localeCompare(second.startTime),
    );
}

export function buildWorkBlocksFromAvailabilityRules(
  rules: TechnicianAvailabilityRule[],
  technicianProfileId: string,
  requestedDate: string,
): TechnicianWorkBlock[] {
  const requestedDay = getDayOfWeekForDate(requestedDate);

  return getAvailabilityRulesForTechnician(rules, technicianProfileId)
    .filter((rule) => rule.isAvailable && rule.dayOfWeek === requestedDay)
    .map((rule) => ({
      technicianId: technicianProfileId,
      startsAt: buildIsoForDateTime(requestedDate, rule.startTime),
      endsAt: buildIsoForDateTime(requestedDate, rule.endTime),
      source: "manual",
      label: "Technician availability rule",
    }));
}

export function applyAvailabilityRulesToTechnicianInputs(
  technicians: CompanyAvailabilityTechnicianInput[],
  rules: TechnicianAvailabilityRule[],
  requestedDate: string,
): CompanyAvailabilityTechnicianInput[] {
  return technicians.map((technician) => {
    const workBlocks = buildWorkBlocksFromAvailabilityRules(
      rules,
      technician.technicianId,
      requestedDate,
    );

    return { ...technician, workBlocks };
  });
}

export function summarizeTechnicianAvailability(
  rules: TechnicianAvailabilityRule[],
  technicianProfileId: string,
  requestedDate: string,
): TechnicianAvailabilitySummary {
  const technicianRules = getAvailabilityRulesForTechnician(
    rules,
    technicianProfileId,
  ).filter((rule) => rule.isAvailable);
  const grouped = new Map<number, string[]>();

  for (const rule of technicianRules) {
    const windows = grouped.get(rule.dayOfWeek) ?? [];
    windows.push(`${normalizeTime(rule.startTime)}-${normalizeTime(rule.endTime)}`);
    grouped.set(rule.dayOfWeek, windows);
  }

  return {
    technicianProfileId,
    configuredDays: Array.from(grouped.entries()).map(([dayOfWeek, windows]) => ({
      dayOfWeek,
      label: DAY_LABELS[dayOfWeek] ?? `Day ${dayOfWeek}`,
      windows,
    })),
    hasAvailability: technicianRules.length > 0,
    activeWindowCountForDate: buildWorkBlocksFromAvailabilityRules(
      rules,
      technicianProfileId,
      requestedDate,
    ).length,
  };
}
