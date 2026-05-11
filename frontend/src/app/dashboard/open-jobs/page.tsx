import { OpenJobsBoard } from "@/components/dashboard/OpenJobsBoard";
import { getOpenJobs } from "@/data/mock-open-jobs";
import { getPublicTechnicians } from "@/lib/public-seo-data";

export default function OpenJobsPage() {
  const jobs = getOpenJobs();
  const technicians = getPublicTechnicians();

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.2),transparent_32%),#0f172a] p-6 shadow-2xl shadow-black/20">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-200">
          Marketplace dispatch
        </p>
        <h1 className="mt-3 text-3xl font-bold text-white">Open Job Board</h1>
        <p className="mt-3 max-w-3xl text-slate-300">
          Preview how unassigned marketplace requests can become open jobs for qualified
          technicians to claim in a future dispatch workflow.
        </p>
      </section>

      <OpenJobsBoard jobs={jobs} technicians={technicians} />
    </div>
  );
}
