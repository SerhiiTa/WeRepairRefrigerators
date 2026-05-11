import Link from "next/link";

import { DashboardNotice } from "@/components/dashboard/DashboardNotice";
import { ReputationOverview } from "@/components/dashboard/ReputationOverview";
import { getTechnicianReputation } from "@/data/mock-reputation";

export default function CommunityReputationPage() {
  const technicians = getTechnicianReputation();

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.2),transparent_32%),#0f172a] p-6 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-200">
              Private expert network
            </p>
            <h1 className="mt-3 text-3xl font-bold text-white">
              Technician Reputation & Expert Badges
            </h1>
            <p className="mt-3 max-w-3xl text-slate-300">
              Technician reputation shown here is demonstration data for the future private
              technician network.
            </p>
          </div>
          <Link
            className="inline-flex items-center justify-center rounded-md border border-white/15 px-4 py-3 text-sm font-bold text-white transition hover:border-cyan-300 hover:bg-white/5"
            href="/dashboard/community"
          >
            Back to Community
          </Link>
        </div>

        <div className="mt-5">
          <DashboardNotice>
            Scores, badges, filters, and rankings are static mock data only. No real technician
            ranking, payment, dispatch, moderation, or persistence logic is implemented.
          </DashboardNotice>
        </div>
      </section>

      <ReputationOverview technicians={technicians} />
    </div>
  );
}
