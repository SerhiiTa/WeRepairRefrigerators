import { StatusBadge } from "@/components/StatusBadge";

const repairCases = [
  {
    id: "WRR-1042",
    customer: "Memorial home",
    issue: "Built-in refrigerator not cooling",
    technician: "Unassigned",
    status: "Needs review",
    tone: "amber" as const,
  },
  {
    id: "WRR-1041",
    customer: "Heights bungalow",
    issue: "Ice maker leaking after filter change",
    technician: "Marisol Reyes",
    status: "In progress",
    tone: "cyan" as const,
  },
  {
    id: "WRR-1040",
    customer: "Midtown condo",
    issue: "Compressor noise and warm freezer",
    technician: "Andre Lewis",
    status: "Article draft",
    tone: "emerald" as const,
  },
];

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
              <th className="px-5 py-3 font-semibold">Customer</th>
              <th className="px-5 py-3 font-semibold">Issue</th>
              <th className="px-5 py-3 font-semibold">Technician</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {repairCases.map((repairCase) => (
              <tr key={repairCase.id} className="text-slate-300">
                <td className="whitespace-nowrap px-5 py-4 font-bold text-white">{repairCase.id}</td>
                <td className="whitespace-nowrap px-5 py-4">{repairCase.customer}</td>
                <td className="min-w-64 px-5 py-4">{repairCase.issue}</td>
                <td className="whitespace-nowrap px-5 py-4">{repairCase.technician}</td>
                <td className="whitespace-nowrap px-5 py-4">
                  <StatusBadge tone={repairCase.tone}>{repairCase.status}</StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
