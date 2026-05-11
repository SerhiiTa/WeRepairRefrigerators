import Link from "next/link";

import { RepairHelpRequestForm } from "@/components/dashboard/RepairHelpRequestForm";

export default function NewCommunityHelpRequestPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.2),transparent_32%),#0f172a] p-6 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-200">
              Private technician network
            </p>
            <h1 className="mt-3 text-3xl font-bold text-white">
              Create Repair Help Request
            </h1>
            <p className="mt-3 max-w-3xl text-slate-300">
              Draft a private troubleshooting request that could later become a technician
              discussion, TechAdvisor prompt, translated thread, or RAG-ready knowledge case.
            </p>
          </div>
          <Link
            className="inline-flex items-center justify-center rounded-md border border-white/15 px-4 py-3 text-sm font-bold text-white transition hover:border-cyan-300 hover:bg-white/5"
            href="/dashboard/community"
          >
            Back to Community
          </Link>
        </div>

        <div className="mt-5 rounded-md border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-sm font-bold text-amber-100">
            Do not enter customer names, phone numbers, emails, full addresses, payment details, or
            private customer notes. Serial numbers are treated as private/internal only.
          </p>
        </div>
      </section>

      <RepairHelpRequestForm />
    </div>
  );
}
