import Link from "next/link";

type PublicCardGridItem = {
  href: string;
  title: string;
  description: string;
  meta?: string;
};

type PublicCardGridProps = {
  items: PublicCardGridItem[];
};

export function PublicCardGrid({ items }: PublicCardGridProps) {
  return (
    <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-lg border border-white/10 bg-slate-900 p-6 transition hover:border-cyan-300/50 hover:bg-slate-900/80"
        >
          {item.meta ? (
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">
              {item.meta}
            </p>
          ) : null}
          <h2 className="mt-3 text-xl font-bold tracking-tight text-white">{item.title}</h2>
          <p className="mt-3 leading-7 text-slate-400">{item.description}</p>
        </Link>
      ))}
    </section>
  );
}
