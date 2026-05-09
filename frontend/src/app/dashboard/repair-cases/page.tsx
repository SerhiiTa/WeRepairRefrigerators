import Link from "next/link";

import { RepairCasesTable } from "@/components/dashboard/RepairCasesTable";

export default function RepairCasesPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_34%),#0f172a] p-6">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-200">
          Repair cases
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Review Houston refrigerator repair cases.
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-300">
              Track intake, diagnosis, technician assignment, and article draft
              readiness from one mock list. Backend persistence will come later.
            </p>
          </div>
          <Link
            href="/dashboard/repair-cases/new"
            className="inline-flex justify-center rounded-md bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
          >
            Create Repair Case
          </Link>
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-white/10 bg-slate-900 p-5 md:grid-cols-[1fr_auto_auto] md:items-end">
        <label className="block">
          <span className="text-sm font-bold text-slate-100">Search repair cases</span>
          <input
            type="search"
            name="repairCaseSearch"
            placeholder="Search by case, location, appliance, issue, or technician"
            className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-100">Status</span>
          <select
            name="repairCaseStatus"
            className="mt-2 w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300 md:w-44"
            defaultValue="all"
          >
            <option value="all">All statuses</option>
            <option value="needs-review">Needs review</option>
            <option value="in-progress">In progress</option>
            <option value="article-draft">Article draft</option>
          </select>
        </label>
        <button
          type="button"
          className="rounded-md border border-white/15 px-4 py-3 text-sm font-bold text-white transition hover:border-cyan-300 hover:bg-white/5"
        >
          Apply filters
        </button>
      </section>

      <RepairCasesTable />
    </div>
  );
}
