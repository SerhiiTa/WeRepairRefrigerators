import { CoolingAccent } from "@/components/public/visuals/CoolingAccent";
import { SnowflakeMotif } from "@/components/public/visuals/SnowflakeMotif";

type RefrigeratorHeroGraphicProps = {
  compact?: boolean;
};

export function RefrigeratorHeroGraphic({ compact = false }: RefrigeratorHeroGraphicProps) {
  return (
    <div
      aria-hidden="true"
      className={
        compact
          ? "relative mx-auto hidden max-w-72 lg:block"
          : "relative mx-auto max-w-sm sm:max-w-md"
      }
    >
      <div className="absolute -left-6 top-8">
        <SnowflakeMotif size={compact ? "sm" : "md"} />
      </div>
      <div className="absolute -right-4 top-20">
        <SnowflakeMotif size={compact ? "md" : "lg"} tone="strong" />
      </div>
      <div className="absolute -bottom-3 left-8 right-8">
        <CoolingAccent density="active" />
      </div>

      <div className="relative rounded-[2rem] border border-blue-100 bg-white p-4 shadow-2xl shadow-blue-950/10">
        <div className="rounded-[1.5rem] border border-blue-100 bg-gradient-to-b from-white via-blue-50 to-sky-100 p-4">
          <div className="grid min-h-80 grid-cols-[1fr_0.45rem] gap-3 rounded-[1.25rem] border border-blue-100 bg-white/80 p-3">
            <div className="grid grid-rows-[0.9fr_1.2fr] gap-3">
              <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-4">
                <div className="h-3 w-16 rounded-full bg-blue-200" />
                <div className="mt-5 grid gap-2">
                  <span className="h-2 rounded-full bg-sky-100" />
                  <span className="h-2 w-3/4 rounded-full bg-sky-100" />
                </div>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4">
                <div className="flex items-center justify-between">
                  <span className="h-3 w-20 rounded-full bg-blue-200" />
                  <span className="h-8 w-8 rounded-full border border-blue-100 bg-white" />
                </div>
                <div className="mt-8 grid grid-cols-3 gap-2">
                  <span className="h-14 rounded-xl bg-white/90" />
                  <span className="h-14 rounded-xl bg-white/90" />
                  <span className="h-14 rounded-xl bg-white/90" />
                </div>
              </div>
            </div>
            <div className="rounded-full bg-blue-200" />
          </div>
        </div>
      </div>
    </div>
  );
}
