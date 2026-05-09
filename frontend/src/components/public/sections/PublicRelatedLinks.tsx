import Link from "next/link";

import type { RelatedLink } from "@/types/public-seo";

type PublicRelatedLinksProps = {
  title?: string;
  links: RelatedLink[];
  variant?: "dark" | "light";
};

export function PublicRelatedLinks({
  title = "Related repair pages",
  links,
  variant = "dark",
}: PublicRelatedLinksProps) {
  const isLight = variant === "light";

  return (
    <aside
      className={
        isLight
          ? "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-blue-950/5"
          : "rounded-lg border border-white/10 bg-slate-900 p-6"
      }
    >
      <h2 className={isLight ? "text-lg font-black text-slate-950" : "text-lg font-bold text-white"}>
        {title}
      </h2>
      <div className="mt-4 grid gap-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              isLight
                ? "rounded-2xl border border-blue-100 bg-blue-50/60 p-4 transition hover:border-blue-300 hover:bg-white hover:shadow-md hover:shadow-blue-950/5"
                : "rounded-md border border-white/10 bg-slate-950 p-4 transition hover:border-cyan-300/50"
            }
          >
            <p
              className={
                isLight
                  ? "text-xs font-black uppercase tracking-[0.18em] text-blue-700"
                  : "text-xs font-bold uppercase tracking-[0.18em] text-cyan-200"
              }
            >
              {link.kind}
            </p>
            <h3 className={isLight ? "mt-2 text-sm font-black text-slate-950" : "mt-2 text-sm font-bold text-white"}>
              {link.label}
            </h3>
            {link.description ? (
              <p className={isLight ? "mt-2 text-sm leading-6 text-slate-600" : "mt-2 text-sm leading-6 text-slate-400"}>
                {link.description}
              </p>
            ) : null}
          </Link>
        ))}
      </div>
    </aside>
  );
}
