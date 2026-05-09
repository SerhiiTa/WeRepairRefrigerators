type FormSectionProps = {
  title: string;
  description: string;
  children: React.ReactNode;
};

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-900 p-5">
      <div className="border-b border-white/10 pb-4">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
      </div>
      <div className="mt-5 grid gap-5">{children}</div>
    </section>
  );
}
