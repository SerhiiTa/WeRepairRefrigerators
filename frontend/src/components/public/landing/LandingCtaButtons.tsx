import Link from "next/link";

type LandingCtaButtonsProps = {
  className?: string;
};

export function LandingCtaButtons({ className = "" }: LandingCtaButtonsProps) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row ${className}`}>
      <a
        href="tel:+17135550134"
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
      >
        Call now
      </a>
      <Link
        href="/schedule-service"
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-bold text-slate-900 transition hover:border-blue-300 hover:bg-blue-50"
      >
        Schedule service
      </Link>
    </div>
  );
}
