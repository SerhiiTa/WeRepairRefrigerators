import Link from "next/link";

import type { RelatedLink } from "@/types/public-seo";

type PublicRelatedLinksProps = {
  title?: string;
  links: RelatedLink[];
};

export function PublicRelatedLinks({ title = "Related repair pages", links }: PublicRelatedLinksProps) {
  return (
    <aside className="rounded-lg border border-white/10 bg-slate-900 p-6">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <div className="mt-4 grid gap-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-md border border-white/10 bg-slate-950 p-4 transition hover:border-cyan-300/50"
          >
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
              {link.kind}
            </p>
            <h3 className="mt-2 text-sm font-bold text-white">{link.label}</h3>
            {link.description ? (
              <p className="mt-2 text-sm leading-6 text-slate-400">{link.description}</p>
            ) : null}
          </Link>
        ))}
      </div>
    </aside>
  );
}
