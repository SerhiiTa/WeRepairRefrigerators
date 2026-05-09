import type { AiContentBlock } from "@/types/public-seo";

type PublicAiContentBlocksProps = {
  blocks: AiContentBlock[];
};

const blockTone: Record<AiContentBlock["kind"], string> = {
  intro: "border-cyan-300/20 bg-cyan-300/10",
  diagnostic: "border-white/10 bg-slate-900",
  repair: "border-emerald-300/20 bg-emerald-300/10",
  warning: "border-amber-300/20 bg-amber-300/10",
  maintenance: "border-white/10 bg-slate-900",
  cta: "border-cyan-300/20 bg-slate-900",
};

export function PublicAiContentBlocks({ blocks }: PublicAiContentBlocksProps) {
  return (
    <section className="grid gap-5">
      {blocks.map((block) => (
        <article key={`${block.kind}-${block.title}`} className={`rounded-lg border p-6 ${blockTone[block.kind]}`}>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">
            {block.kind}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">{block.title}</h2>
          <p className="mt-4 leading-8 text-slate-300">{block.body}</p>
        </article>
      ))}
    </section>
  );
}
