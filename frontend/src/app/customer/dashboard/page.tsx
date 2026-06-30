import Link from "next/link";

export default function CustomerDashboardPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
      <section className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-950/5">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-blue-700">
          Customer Account
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">
          Customer dashboard
        </h1>
        <p className="mt-4 leading-7 text-slate-600">
          You are signed in to the customer side of WeRepairRefrigerators.
          Technician CRM access stays separate from customer repair tracking.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex justify-center rounded-full border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
          >
            Back to marketplace
          </Link>
          <Link
            href="/schedule-service"
            className="inline-flex justify-center rounded-full bg-blue-700 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-800"
          >
            Schedule service
          </Link>
        </div>
      </section>
    </main>
  );
}
