import type { ImagePromptMock } from "@/types/ai-workflow";

type ImagePromptPreviewProps = {
  prompts: ImagePromptMock[];
};

export function ImagePromptPreview({ prompts }: ImagePromptPreviewProps) {
  return (
    <section id="image-prompts" className="rounded-lg border border-white/10 bg-slate-900 p-5">
      <div className="border-b border-white/10 pb-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-200">
          Image prompt mock
        </p>
        <h2 className="mt-3 text-2xl font-bold text-white">Future visual generation prompts</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Prompt-only previews for future AI image tooling. No image API is connected.
        </p>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {prompts.map((prompt) => (
          <article key={prompt.title} className="rounded-md border border-white/10 bg-slate-950 p-4">
            <h3 className="font-bold text-white">{prompt.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">{prompt.prompt}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
