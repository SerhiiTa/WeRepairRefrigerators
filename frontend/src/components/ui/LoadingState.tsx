type LoadingStateVariant = "card" | "list";

type LoadingStateProps = {
  title?: string;
  description?: string;
  rows?: number;
  variant?: LoadingStateVariant;
};

export function LoadingState({
  title = "Loading",
  description = "Preparing the latest data.",
  rows = 3,
  variant = "card",
}: LoadingStateProps) {
  const skeletonRows = Array.from({ length: rows }, (_, index) => index);

  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="rounded-lg border border-white/10 bg-slate-900 p-5"
    >
      <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
        </div>
        <div className="h-9 w-9 shrink-0 rounded-md bg-cyan-300/10" />
      </div>

      <div className={variant === "list" ? "mt-5 space-y-3" : "mt-5 grid gap-4 md:grid-cols-3"}>
        {skeletonRows.map((row) => (
          <div
            key={row}
            className="rounded-md border border-white/10 bg-slate-950 p-4"
          >
            <div className="h-3 w-24 animate-pulse rounded bg-slate-800" />
            <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-slate-800" />
            <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-800" />
            <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-slate-800" />
          </div>
        ))}
      </div>
    </section>
  );
}
