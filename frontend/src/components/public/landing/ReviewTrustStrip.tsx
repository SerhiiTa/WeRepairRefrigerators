const reviews = [
  ["4.9/5", "Mock customer rating"],
  ["Same-day", "Houston MVP availability"],
  ["Privacy-first", "Public pages avoid personal data"],
];

export function ReviewTrustStrip() {
  return (
    <section className="bg-white">
      <div className="mx-auto grid max-w-7xl gap-4 px-5 py-10 sm:px-6 md:grid-cols-3">
        {reviews.map(([value, label]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
            <p className="text-3xl font-black text-blue-700">{value}</p>
            <p className="mt-2 text-sm font-bold text-slate-600">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
