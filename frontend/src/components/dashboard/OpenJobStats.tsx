import { MetricCard } from "@/components/MetricCard";
import type { OpenJob } from "@/types/open-jobs";

type OpenJobStatsProps = {
  jobs: OpenJob[];
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function getMostActiveZip(jobs: OpenJob[]) {
  const zipCounts = jobs.reduce<Record<string, number>>((counts, job) => {
    counts[job.zipCode] = (counts[job.zipCode] ?? 0) + 1;
    return counts;
  }, {});

  return (
    Object.entries(zipCounts).sort(([, firstCount], [, secondCount]) => secondCount - firstCount)[0]?.[0] ??
    "No ZIP"
  );
}

export function OpenJobStats({ jobs }: OpenJobStatsProps) {
  const openJobs = jobs.filter((job) => job.status === "open");
  const highUrgencyJobs = jobs.filter((job) => job.urgency === "High" || job.urgency === "Urgent");
  const averageLeadValue =
    jobs.length > 0
      ? jobs.reduce((total, job) => total + job.estimatedLeadValue, 0) / jobs.length
      : 0;

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        helper="Available marketplace requests ready for mock technician claiming."
        label="Open Jobs"
        value={openJobs.length.toString()}
      />
      <MetricCard
        helper="High and urgent requests across the current filtered view."
        label="High Urgency"
        value={highUrgencyJobs.length.toString()}
      />
      <MetricCard
        helper="Mock value estimate for future paid lead and dispatch planning."
        label="Average Lead Value"
        value={formatCurrency(averageLeadValue)}
      />
      <MetricCard
        helper="ZIP with the most demand in the selected mock job set."
        label="Most Active ZIP"
        value={getMostActiveZip(jobs)}
      />
    </section>
  );
}
