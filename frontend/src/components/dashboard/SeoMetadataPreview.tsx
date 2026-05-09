export function SeoMetadataPreview() {
  return (
    <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-5">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
        SEO preview
      </p>
      <h3 className="mt-3 text-xl font-bold text-white">
        Houston refrigerator repair case: brand, symptoms, diagnosis, and repair summary
      </h3>
      <p className="mt-3 text-sm leading-6 text-slate-300">
        This placeholder preview will later combine the city, appliance brand, issue
        description, technician findings, and repair outcome into AI-assisted metadata.
      </p>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          ["Slug", "/houston-refrigerator-repair-case"],
          ["Audience", "Local homeowners"],
          ["Status", "Draft preview"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-white/10 bg-slate-950 p-3">
            <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </dt>
            <dd className="mt-2 text-sm font-semibold text-slate-100">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
