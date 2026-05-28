import type { TechnicianProfilePreview } from "@/types/public-seo";

type TechnicianServiceAreasProps = {
  technician: TechnicianProfilePreview;
};

export function TechnicianServiceAreas({ technician }: TechnicianServiceAreasProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-blue-950/5">
      <h2 className="text-2xl font-black tracking-tight text-slate-950">
        Service areas and ZIP coverage
      </h2>
      <p className="mt-3 leading-7 text-slate-600">
        Public ZIP coverage is approximate and does not expose private customer
        addresses, exact technician schedules, or internal dispatch data.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {technician.zipCodes && technician.zipCodes.length > 0 ? (
          technician.zipCodes.map((zipCode) => (
            <span
              key={zipCode}
              className="rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-black text-blue-800"
            >
              {zipCode}
            </span>
          ))
        ) : (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-black text-slate-700">
            ZIP coverage coming soon
          </span>
        )}
      </div>
    </section>
  );
}
