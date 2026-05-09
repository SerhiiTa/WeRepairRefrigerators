import Link from "next/link";

import { RepairCaseDetail } from "@/components/dashboard/RepairCaseDetail";
import { ErrorState } from "@/components/ui/ErrorState";
import { getRepairCaseById, mockRepairCases } from "@/lib/mock-repair-cases";

type RepairCaseDetailPageProps = {
  params: Promise<{
    id?: string;
  }>;
};

export function generateStaticParams() {
  return mockRepairCases.map((repairCase) => ({
    id: repairCase.id,
  }));
}

export default async function RepairCaseDetailPage({ params }: RepairCaseDetailPageProps) {
  const { id } = await params;
  const repairCase = id ? getRepairCaseById(id) : undefined;

  if (!repairCase) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <ErrorState
          title="Repair case not found"
          description="The requested mock repair case is missing or has not been created yet. Use the repair cases list to open an available preview."
        />
        <Link
          href="/dashboard/repair-cases"
          className="inline-flex justify-center rounded-md bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
        >
          Back to repair cases
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_34%),#0f172a] p-6">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-200">
          {repairCase.caseNumber}
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              {repairCase.appliance.brand} refrigerator repair preview
            </h1>
            <p className="mt-3 max-w-3xl leading-7 text-slate-300">
              A complete mock repair case preview for future database records, photo
              storage, and AI SEO article generation.
            </p>
          </div>
          <Link
            href="/dashboard/repair-cases"
            className="inline-flex justify-center rounded-md border border-white/15 px-4 py-2.5 text-sm font-bold text-white transition hover:border-cyan-300 hover:bg-white/5"
          >
            Back to repair cases
          </Link>
        </div>
      </section>

      <RepairCaseDetail repairCase={repairCase} />
    </div>
  );
}
