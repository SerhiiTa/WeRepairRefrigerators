type PublicHeroSectionProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function PublicHeroSection({ eyebrow, title, description }: PublicHeroSectionProps) {
  return (
    <section className="border-b border-white/10 bg-[radial-gradient(circle_at_20%_16%,rgba(34,211,238,0.2),transparent_30%),linear-gradient(135deg,#020617_0%,#0f172a_52%,#111827_100%)]">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:py-20">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-cyan-200">{eyebrow}</p>
        <h1 className="mt-4 max-w-4xl text-4xl font-bold tracking-tight text-white md:text-6xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">{description}</p>
      </div>
    </section>
  );
}
