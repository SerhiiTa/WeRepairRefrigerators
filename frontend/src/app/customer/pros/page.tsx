import Link from "next/link";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { PublicTechnicianProfileRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Customer technician options | WeRepairRefrigerators",
  description:
    "Review public-safe refrigerator technician profile options before creating a customer booking request.",
};

const PUBLIC_TECH_COLUMNS = [
  "slug",
  "display_name",
  "business_name",
  "primary_city",
  "primary_state",
  "service_summary_public",
  "service_zip_codes",
  "service_cities",
  "appliance_categories",
  "brands_serviced",
  "specialties",
  "languages",
  "years_experience",
  "avatar_color",
  "technician_status",
  "public_profile_ready",
  "marketplace_enabled",
  "created_at",
].join(",");

async function loadRealPublicTechnicians(): Promise<PublicTechnicianProfileRow[]> {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("public_technician_profiles")
    .select(PUBLIC_TECH_COLUMNS)
    .order("display_name", { ascending: true, nullsFirst: false });

  if (error || !data) {
    return [];
  }

  return data as unknown as PublicTechnicianProfileRow[];
}

export default async function CustomerProsPage() {
  const technicians = await loadRealPublicTechnicians();

  return (
    <main className="min-h-screen bg-[#F7F9FC] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-5">
        <header className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:p-7">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#0F6BFF]">
            Customer technician options
          </p>
          <h1 className="mt-3 text-3xl font-black text-slate-950">
            Choose from public-ready technicians.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Only public-safe technician profile fields are shown here. Account
            registration is required before a booking request can begin.
          </p>
        </header>

        {technicians.length > 0 ? (
          <section className="grid gap-4 lg:grid-cols-3">
            {technicians.map((technician) => {
              const name =
                technician.business_name ||
                technician.display_name ||
                "Refrigerator technician";

              return (
                <article
                  key={technician.slug}
                  className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">
                    Verified public profile
                  </p>
                  <h2 className="mt-3 text-xl font-black text-slate-950">{name}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {[technician.primary_city, technician.primary_state]
                      .filter(Boolean)
                      .join(", ") || "Houston service area"}
                  </p>
                  <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
                    {technician.service_summary_public ||
                      "Public technician profile is ready for customer review."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(technician.specialties ?? []).slice(0, 4).map((specialty) => (
                      <span
                        key={specialty}
                        className="rounded-full border border-slate-200 bg-[#F7F9FC] px-3 py-1 text-xs font-bold text-slate-700"
                      >
                        {specialty}
                      </span>
                    ))}
                  </div>
                  <Link
                    href={`/customer/register?next=${encodeURIComponent("/customer/dashboard")}`}
                    className="mt-5 inline-flex w-full justify-center rounded-xl bg-[#0F6BFF] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#0057D9]"
                  >
                    Create account to request
                  </Link>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="rounded-[24px] border border-dashed border-slate-300 bg-white p-6 text-center shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
            <h2 className="text-xl font-black text-slate-950">
              No public technician profiles are available yet.
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Public profile rows must be marked public-ready before customer
              technician options can appear.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
