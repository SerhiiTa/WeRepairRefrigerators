const trustBadges = [
  "Houston MVP",
  "Refrigerator repair focused",
  "Privacy-first repair summaries",
  "Brand-aware diagnostics",
];

export function TrustBadges() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {trustBadges.map((badge) => (
        <div
          key={badge}
          className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm"
        >
          <span className="mr-2 text-blue-600">✓</span>
          {badge}
        </div>
      ))}
    </div>
  );
}
