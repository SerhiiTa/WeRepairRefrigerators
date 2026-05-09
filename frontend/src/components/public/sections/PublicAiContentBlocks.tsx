import type { AiContentBlock } from "@/types/public-seo";

type PublicAiContentBlocksProps = {
  blocks: AiContentBlock[];
  variant?: "dark" | "light";
};

const darkBlockTone: Record<AiContentBlock["kind"], string> = {
  intro: "border-cyan-300/20 bg-cyan-300/10",
  diagnostic: "border-white/10 bg-slate-900",
  repair: "border-emerald-300/20 bg-emerald-300/10",
  warning: "border-amber-300/20 bg-amber-300/10",
  maintenance: "border-white/10 bg-slate-900",
  cta: "border-cyan-300/20 bg-slate-900",
};

const lightBlockTone: Record<AiContentBlock["kind"], string> = {
  intro: "border-blue-100 bg-blue-50/70",
  diagnostic: "border-slate-200 bg-white",
  repair: "border-emerald-100 bg-emerald-50/70",
  warning: "border-amber-100 bg-amber-50/80",
  maintenance: "border-slate-200 bg-white",
  cta: "border-blue-100 bg-white",
};

export function PublicAiContentBlocks({ blocks, variant = "dark" }: PublicAiContentBlocksProps) {
  const isLight = variant === "light";
  const blockTone = isLight ? lightBlockTone : darkBlockTone;

  return (
    <section className="grid gap-5">
      {blocks.map((block) => (
        <article
          key={`${block.kind}-${block.title}`}
          className={`border p-6 ${
            isLight ? "rounded-3xl shadow-sm shadow-blue-950/5" : "rounded-lg"
          } ${blockTone[block.kind]}`}
        >
          <p
            className={
              isLight
                ? "text-xs font-black uppercase tracking-[0.2em] text-blue-700"
                : "text-xs font-bold uppercase tracking-[0.2em] text-cyan-200"
            }
          >
            {block.kind}
          </p>
          <h2
            className={
              isLight
                ? "mt-3 text-2xl font-black tracking-tight text-slate-950"
                : "mt-3 text-2xl font-bold tracking-tight text-white"
            }
          >
            {block.title}
          </h2>
          <p className={isLight ? "mt-4 leading-8 text-slate-600" : "mt-4 leading-8 text-slate-300"}>
            {block.body}
          </p>
        </article>
      ))}
    </section>
  );
}
