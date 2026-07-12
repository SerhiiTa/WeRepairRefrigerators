import { CompanyBaseAddressSettings } from "@/components/dashboard/CompanyBaseAddressSettings";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <p className="text-sm font-bold uppercase tracking-[0.22em] text-[#2563EB]">
          Settings
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A]">
          Company Settings
        </h1>
        <p className="mt-3 max-w-3xl leading-7 text-[#64748B]">
          Configure only the operational settings that WRA needs today. Company
          Base Address is used for driving distance to service jobs.
        </p>
      </section>

      <CompanyBaseAddressSettings />
    </div>
  );
}
