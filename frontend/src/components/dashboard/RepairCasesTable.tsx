import Link from "next/link";

import { StatusBadge } from "@/components/StatusBadge";
import { mockRepairCases } from "@/lib/mock-repair-cases";

export function RepairCasesTable() {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-900">
      <div className="border-b border-white/10 p-5">
        <h2 className="text-lg font-bold text-white">Recent repair cases</h2>
        <p className="mt-1 text-sm text-slate-400">
          Placeholder data for the Houston refrigerator repair MVP.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="px-5 py-3 font-semibold">Case</th>
              <th className="px-5 py-3 font-semibold">Location</th>
              <th className="px-5 py-3 font-semibold">Appliance</th>
              <th className="px-5 py-3 font-semibold">Issue</th>
              <th className="px-5 py-3 font-semibold">Technician</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {mockRepairCases.map((repairCase) => (
              <tr key={repairCase.id} className="text-slate-300">
                <td className="whitespace-nowrap px-5 py-4 font-bold text-white">
                  <Link
                    href={`/dashboard/repair-cases/${repairCase.id}`}
                    className="transition hover:text-cyan-200"
                  >
                    {repairCase.caseNumber}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-5 py-4">
                  {repairCase.location.neighborhood}, {repairCase.location.zipCode}
                </td>
                <td className="whitespace-nowrap px-5 py-4">
                  {repairCase.appliance.brand} {repairCase.appliance.modelNumber}
                </td>
                <td className="min-w-64 px-5 py-4">{repairCase.issueDescription}</td>
                <td className="whitespace-nowrap px-5 py-4">{repairCase.technician}</td>
                <td className="whitespace-nowrap px-5 py-4">
                  <StatusBadge tone={repairCase.repairStatusTone}>{repairCase.repairStatus}</StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
