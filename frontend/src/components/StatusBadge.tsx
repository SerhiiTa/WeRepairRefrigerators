type StatusBadgeTone =
  | "gray"
  | "slate"
  | "blue"
  | "cyan"
  | "emerald"
  | "amber"
  | "orange"
  | "purple"
  | "teal"
  | "indigo"
  | "yellow"
  | "red";

type StatusBadgeProps = {
  children: React.ReactNode;
  tone?: StatusBadgeTone;
};

const toneClasses: Record<StatusBadgeTone, string> = {
  gray: "border-gray-200 bg-gray-100 text-gray-700",
  slate: "border-slate-200 bg-slate-100 text-slate-700",
  blue: "border-blue-200 bg-blue-100 text-blue-700",
  cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
  emerald: "border-emerald-200 bg-emerald-100 text-emerald-700",
  amber: "border-amber-200 bg-amber-100 text-amber-800",
  orange: "border-orange-200 bg-orange-100 text-orange-700",
  purple: "border-purple-200 bg-purple-100 text-purple-700",
  teal: "border-teal-200 bg-teal-100 text-teal-700",
  indigo: "border-indigo-200 bg-indigo-100 text-indigo-700",
  yellow: "border-yellow-200 bg-yellow-100 text-yellow-800",
  red: "border-red-200 bg-red-100 text-red-700",
};

export function StatusBadge({ children, tone = "slate" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
