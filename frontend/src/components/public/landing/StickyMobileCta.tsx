import Link from "next/link";

export function StickyMobileCta() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur md:hidden">
      <div className="grid grid-cols-2 gap-3">
        <a
          href="tel:+17135550134"
          className="flex min-h-12 items-center justify-center rounded-xl bg-blue-600 text-sm font-black text-white"
        >
          Call now
        </a>
        <Link
          href="/services/refrigerator-repair"
          className="flex min-h-12 items-center justify-center rounded-xl border border-slate-300 text-sm font-black text-slate-900"
        >
          Schedule
        </Link>
      </div>
    </div>
  );
}
