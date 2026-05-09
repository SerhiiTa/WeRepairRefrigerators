import type { FaqItem } from "@/types/public-seo";

type PublicFaqSectionProps = {
  title?: string;
  faqs: FaqItem[];
};

export function PublicFaqSection({ title = "Frequently asked questions", faqs }: PublicFaqSectionProps) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-900 p-6">
      <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
      <div className="mt-5 divide-y divide-white/10">
        {faqs.map((faq) => (
          <article key={faq.question} className="py-5 first:pt-0 last:pb-0">
            <h3 className="text-lg font-bold text-white">{faq.question}</h3>
            <p className="mt-2 leading-7 text-slate-300">{faq.answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
