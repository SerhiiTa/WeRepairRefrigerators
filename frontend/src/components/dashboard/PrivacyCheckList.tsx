const privacyChecks = [
  "No customer full name",
  "No phone number",
  "No exact street address",
  "City or service area only",
  "Technical findings only",
  "Private notes excluded from public pages",
];

export function PrivacyCheckList() {
  return (
    <section className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-5">
      <h2 className="text-lg font-bold text-emerald-100">Privacy-first transformation</h2>
      <p className="mt-2 text-sm leading-6 text-emerald-100/80">
        Public content uses appliance, city, symptom, diagnosis, and repair summary fields only.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {privacyChecks.map((check) => (
          <li
            key={check}
            className="rounded-md border border-emerald-300/20 bg-slate-950/40 px-3 py-2 text-sm font-semibold text-emerald-100"
          >
            {check}
          </li>
        ))}
      </ul>
    </section>
  );
}
