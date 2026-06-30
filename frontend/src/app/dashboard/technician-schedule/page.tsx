import { TechnicianSchedule } from "@/components/dashboard/TechnicianSchedule";

export default function TechnicianSchedulePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_34%),#0f172a] p-6">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-200">
          Calendar / Dispatch
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
          Internal dispatch board for booked job appointments.
        </h1>
        <p className="mt-3 max-w-3xl leading-7 text-slate-300">
          The CRM appointments table is the source of truth for technician
          scheduling. Google Calendar is optional outbound sync only; technician
          personal calendars are not the primary scheduling system.
        </p>
      </section>

      <TechnicianSchedule />
    </div>
  );
}
