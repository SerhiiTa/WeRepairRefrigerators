import Link from "next/link";

import type { AiArticleDraftPreview } from "@/types/ai-workflow";

type AiArticlePreviewProps = {
  preview: AiArticleDraftPreview;
};

export function AiArticlePreview({ preview }: AiArticlePreviewProps) {
  return (
    <article id="article-preview" className="rounded-lg border border-white/10 bg-slate-900 p-5">
      <div className="border-b border-white/10 pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">
          Mock SEO article preview
        </p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">{preview.seoTitle}</h2>
        <p className="mt-3 leading-7 text-slate-300">{preview.metaDescription}</p>
        <p className="mt-3 rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-300">
          Suggested slug: {preview.suggestedSlug}
        </p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-white/10 bg-slate-950 p-4">
          <h3 className="font-bold text-white">Intro paragraph</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{preview.introParagraph}</p>
        </section>
        <section className="rounded-md border border-white/10 bg-slate-950 p-4">
          <h3 className="font-bold text-white">Diagnostic summary</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{preview.diagnosticSummary}</p>
        </section>
        <section className="rounded-md border border-white/10 bg-slate-950 p-4">
          <h3 className="font-bold text-white">Repair summary</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{preview.repairSummary}</p>
        </section>
        <section className="rounded-md border border-white/10 bg-slate-950 p-4">
          <h3 className="font-bold text-white">Image prompt suggestion</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{preview.imagePromptSuggestion}</p>
        </section>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section>
          <h3 className="font-bold text-white">FAQ ideas</h3>
          <ul className="mt-3 grid gap-2">
            {preview.faqIdeas.map((faq) => (
              <li key={faq} className="rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                {faq}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="font-bold text-white">Internal link suggestions</h3>
          <div className="mt-3 grid gap-2">
            {preview.internalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </article>
  );
}
