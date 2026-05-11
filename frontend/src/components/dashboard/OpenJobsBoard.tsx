"use client";

import { useMemo, useState } from "react";

import { OpenJobCard } from "@/components/dashboard/OpenJobCard";
import { OpenJobFilters } from "@/components/dashboard/OpenJobFilters";
import { OpenJobStats } from "@/components/dashboard/OpenJobStats";
import { DashboardNotice } from "@/components/dashboard/DashboardNotice";
import { EmptyState } from "@/components/ui/EmptyState";
import type { OpenJob, OpenJobFilters as OpenJobFiltersType } from "@/types/open-jobs";
import type { TechnicianProfilePreview } from "@/types/public-seo";

type OpenJobsBoardProps = {
  jobs: OpenJob[];
  technicians: TechnicianProfilePreview[];
};

type AcceptedJobState = {
  acceptedAt: string;
  acceptedByTechnicianId: string;
};

const defaultFilters: OpenJobFiltersType = {
  applianceType: "All appliances",
  source: "All sources",
  urgency: "All urgencies",
  zipCode: "All ZIP codes",
};

function buildOptions(label: string, values: string[]) {
  return [label, ...Array.from(new Set(values)).sort()];
}

export function OpenJobsBoard({ jobs, technicians }: OpenJobsBoardProps) {
  const [filters, setFilters] = useState<OpenJobFiltersType>(defaultFilters);
  const [acceptedJobs, setAcceptedJobs] = useState<Record<string, AcceptedJobState>>({});

  const currentTechnician = technicians[0] ?? null;

  const hydratedJobs = useMemo(
    () =>
      jobs.map((job) => {
        const acceptedJob = acceptedJobs[job.id];

        if (!acceptedJob) {
          return job;
        }

        return {
          ...job,
          acceptedAt: acceptedJob.acceptedAt,
          acceptedByTechnicianId: acceptedJob.acceptedByTechnicianId,
          selectedTechnicianId: acceptedJob.acceptedByTechnicianId,
          status: "assigned" as const,
        };
      }),
    [acceptedJobs, jobs],
  );

  const filteredJobs = useMemo(
    () =>
      hydratedJobs.filter((job) => {
        const matchesZip =
          filters.zipCode === "All ZIP codes" ? true : job.zipCode === filters.zipCode;
        const matchesAppliance =
          filters.applianceType === "All appliances"
            ? true
            : job.applianceType === filters.applianceType;
        const matchesUrgency =
          filters.urgency === "All urgencies" ? true : job.urgency === filters.urgency;
        const matchesSource =
          filters.source === "All sources" ? true : job.source === filters.source;

        return matchesZip && matchesAppliance && matchesUrgency && matchesSource;
      }),
    [filters, hydratedJobs],
  );

  const openJobs = filteredJobs.filter((job) => job.status === "open");
  const assignedJobs = filteredJobs.filter((job) => job.status === "assigned");
  const expiredJobs = filteredJobs.filter((job) => job.status === "expired");

  const zipOptions = useMemo(
    () => buildOptions("All ZIP codes", jobs.map((job) => job.zipCode)),
    [jobs],
  );
  const applianceTypeOptions = useMemo(
    () => buildOptions("All appliances", jobs.map((job) => job.applianceType)),
    [jobs],
  );
  const sourceOptions = useMemo(
    () => buildOptions("All sources", jobs.map((job) => job.source)),
    [jobs],
  );

  function getTechnicianName(slug?: string) {
    if (!slug) {
      return undefined;
    }

    return technicians.find((technician) => technician.slug === slug)?.name;
  }

  function acceptJob(jobId: string) {
    if (!currentTechnician) {
      return;
    }

    setAcceptedJobs((current) => ({
      ...current,
      [jobId]: {
        acceptedAt: "Just now",
        acceptedByTechnicianId: currentTechnician.slug,
      },
    }));
  }

  return (
    <div className="space-y-6">
      <OpenJobStats jobs={filteredJobs} />
      <OpenJobFilters
        applianceTypeOptions={applianceTypeOptions}
        filters={filters}
        onChange={setFilters}
        sourceOptions={sourceOptions}
        zipOptions={zipOptions}
      />

      <DashboardNotice>
          Open jobs shown here are demonstration data for the future marketplace dispatch system.
        <span className="mt-2 block font-normal text-slate-300">
          Accepting a job assigns it to {currentTechnician?.name ?? "a mock technician"} in local
          UI state only. Nothing is persisted, routed, or dispatched.
        </span>
      </DashboardNotice>

      {filteredJobs.length > 0 ? (
        <div className="space-y-8">
          <section className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
                  Available jobs
                </p>
                <h2 className="mt-1 text-2xl font-bold text-white">
                  {openJobs.length} open job{openJobs.length === 1 ? "" : "s"}
                </h2>
              </div>
              <p className="text-sm text-slate-400">
                Customer details are limited to first name, ZIP, and service area.
              </p>
            </div>

            {openJobs.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {openJobs.map((job) => (
                  <OpenJobCard
                    acceptedTechnicianName={getTechnicianName(job.acceptedByTechnicianId)}
                    job={job}
                    key={job.id}
                    onAccept={acceptJob}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No open jobs match these filters"
                description="Try another ZIP, appliance type, urgency, or lead source. Accepted jobs are shown separately below."
              />
            )}
          </section>

          {assignedJobs.length > 0 ? (
            <section className="space-y-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-200">
                  Assigned in mock state
                </p>
                <h2 className="mt-1 text-2xl font-bold text-white">
                  {assignedJobs.length} assigned job{assignedJobs.length === 1 ? "" : "s"}
                </h2>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {assignedJobs.map((job) => (
                  <OpenJobCard
                    acceptedTechnicianName={getTechnicianName(job.acceptedByTechnicianId)}
                    job={job}
                    key={job.id}
                    onAccept={acceptJob}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {expiredJobs.length > 0 ? (
            <section className="space-y-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">
                  Expired examples
                </p>
                <h2 className="mt-1 text-2xl font-bold text-white">
                  {expiredJobs.length} expired job{expiredJobs.length === 1 ? "" : "s"}
                </h2>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {expiredJobs.map((job) => (
                  <OpenJobCard
                    acceptedTechnicianName={getTechnicianName(job.acceptedByTechnicianId)}
                    job={job}
                    key={job.id}
                    onAccept={acceptJob}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <EmptyState
          title="No open job records match these filters"
          description="This board uses static mock marketplace jobs only. Adjust the filters to view available, assigned, or expired examples."
        />
      )}
    </div>
  );
}
