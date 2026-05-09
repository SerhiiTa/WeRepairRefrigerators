type StatusBadgeTone = "cyan" | "emerald" | "amber" | "slate";

type StatusBadgeProps = {
  children: React.ReactNode;
  tone?: StatusBadgeTone;
};

const toneClasses: Record<StatusBadgeTone, string> = {
  cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-200",
  emerald: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200",
  amber: "border-amber-300/20 bg-amber-300/10 text-amber-200",
  slate: "border-slate-500/30 bg-slate-800 text-slate-200",
};

export function StatusBadge({ children, tone = "slate" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-bold ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
