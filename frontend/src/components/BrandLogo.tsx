import Link from "next/link";

type BrandLogoProps = {
  variant?: "light" | "dark";
  compact?: boolean;
  className?: string;
};

export function BrandLogo({ variant = "light", compact = false, className = "" }: BrandLogoProps) {
  const isDark = variant === "dark";

  return (
    <Link href="/" className={`inline-flex items-center gap-3 ${className}`}>
      <span
        aria-hidden="true"
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
          isDark
            ? "border-cyan-300/20 bg-cyan-300/10"
            : "border-blue-100 bg-white shadow-sm shadow-blue-950/5"
        }`}
      >
        <span
          className={`h-5 w-3 rounded-sm border ${
            isDark ? "border-cyan-200 bg-slate-950" : "border-blue-300 bg-blue-50"
          }`}
        />
        <span
          className={`absolute right-2 top-2 h-1.5 w-1.5 rounded-full ${
            isDark ? "bg-cyan-200" : "bg-blue-500"
          }`}
        />
      </span>
      <span className="min-w-0">
        <span
          className={`block font-black tracking-tight ${
            compact ? "text-sm" : "text-base"
          } ${isDark ? "text-white" : "text-slate-950"}`}
        >
          WeRepairRefrigerators
        </span>
        {!compact ? (
          <span className={`block text-xs font-bold ${isDark ? "text-slate-400" : "text-blue-700"}`}>
            Houston refrigerator repair MVP
          </span>
        ) : null}
      </span>
    </Link>
  );
}
