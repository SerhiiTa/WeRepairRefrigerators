import type { FaqItem } from "@/types/public-seo";

type PublicFaqSectionProps = {
  title?: string;
  faqs: FaqItem[];
  variant?: "dark" | "light";
};

export function PublicFaqSection({
  title = "Frequently asked questions",
  faqs,
  variant = "dark",
}: PublicFaqSectionProps) {
  const isLight = variant === "light";

  return (
    <section
      className={
        isLight
          ? "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-blue-950/5"
          : "rounded-lg border border-white/10 bg-slate-900 p-6"
      }
    >
      <h2
        className={
          isLight
            ? "text-2xl font-black tracking-tight text-slate-950"
            : "text-2xl font-bold tracking-tight text-white"
        }
      >
        {title}
      </h2>
      <div className={isLight ? "mt-5 divide-y divide-slate-200" : "mt-5 divide-y divide-white/10"}>
        {faqs.map((faq) => (
          <article key={faq.question} className="py-5 first:pt-0 last:pb-0">
            <h3 className={isLight ? "text-lg font-black text-slate-950" : "text-lg font-bold text-white"}>
              {faq.question}
            </h3>
            <p className={isLight ? "mt-2 leading-7 text-slate-600" : "mt-2 leading-7 text-slate-300"}>
              {faq.answer}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
