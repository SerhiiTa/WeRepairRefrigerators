import Link from "next/link";

import { CommunityOverview } from "@/components/dashboard/CommunityOverview";
import {
  getCommunityDiscussions,
  getCommunityKnowledgeCases,
} from "@/data/mock-community";

export default function CommunityPage() {
  const discussions = getCommunityDiscussions();
  const knowledgeCases = getCommunityKnowledgeCases();

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.2),transparent_32%),#0f172a] p-6 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-200">
              Technician network
            </p>
            <h1 className="mt-3 text-3xl font-bold text-white">
              Community Knowledge Base
            </h1>
            <p className="mt-3 max-w-3xl text-slate-300">
              Community discussions shown here are demonstration data for the future private
              technician network.
            </p>
          </div>
          <Link
            className="inline-flex items-center justify-center rounded-md bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
            href="/dashboard/community/new"
          >
            Create Help Request
          </Link>
        </div>
        <div className="mt-5 rounded-md border border-emerald-300/20 bg-emerald-300/10 p-4">
          <p className="text-sm font-bold text-emerald-100">
            This area is designed to stay private, non-indexed, and available only to verified
            technicians.
          </p>
        </div>
      </section>

      <CommunityOverview discussions={discussions} knowledgeCases={knowledgeCases} />
    </div>
  );
}
