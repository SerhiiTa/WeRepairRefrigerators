import Link from "next/link";

type PublicCardGridItem = {
  href: string;
  title: string;
  description: string;
  meta?: string;
};

type PublicCardGridProps = {
  items: PublicCardGridItem[];
  variant?: "dark" | "light";
};

export function PublicCardGrid({ items, variant = "dark" }: PublicCardGridProps) {
  const cardClass =
    variant === "light"
      ? "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-200 hover:shadow-lg hover:shadow-blue-950/5"
      : "rounded-lg border border-white/10 bg-slate-900 p-6 transition hover:border-cyan-300/50 hover:bg-slate-900/80";
  const metaClass =
    variant === "light"
      ? "text-xs font-black uppercase tracking-[0.2em] text-blue-600"
      : "text-xs font-bold uppercase tracking-[0.2em] text-cyan-200";
  const titleClass =
    variant === "light"
      ? "mt-3 text-xl font-black tracking-tight text-slate-950"
      : "mt-3 text-xl font-bold tracking-tight text-white";
  const descriptionClass =
    variant === "light" ? "mt-3 leading-7 text-slate-600" : "mt-3 leading-7 text-slate-400";

  return (
    <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cardClass}
        >
          {item.meta ? <p className={metaClass}>{item.meta}</p> : null}
          <h2 className={titleClass}>{item.title}</h2>
          <p className={descriptionClass}>{item.description}</p>
        </Link>
      ))}
    </section>
  );
}
