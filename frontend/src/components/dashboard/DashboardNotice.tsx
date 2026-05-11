type DashboardNoticeTone = "amber" | "cyan" | "emerald";

type DashboardNoticeProps = {
  children: React.ReactNode;
  tone?: DashboardNoticeTone;
};

const noticeToneClasses: Record<DashboardNoticeTone, string> = {
  amber: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
  emerald: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
};

export function DashboardNotice({ children, tone = "cyan" }: DashboardNoticeProps) {
  return (
    <section className={`rounded-lg border p-4 ${noticeToneClasses[tone]}`}>
      <p className="text-sm font-bold leading-6">{children}</p>
    </section>
  );
}
