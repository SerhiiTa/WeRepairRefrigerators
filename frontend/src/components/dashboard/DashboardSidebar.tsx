import Link from "next/link";

const sidebarItems = [
  "Overview",
  "Repair Cases",
  "AI Articles",
  "Technicians",
  "Settings",
];

export function DashboardSidebar() {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-slate-950 px-5 py-6 lg:block">
      <Link href="/" className="block text-lg font-bold tracking-tight text-white">
        WeRepairRefrigerators
      </Link>
      <p className="mt-2 text-sm leading-6 text-slate-400">Houston refrigerator repair MVP</p>

      <nav aria-label="Dashboard navigation" className="mt-8 space-y-2">
        {sidebarItems.map((item, index) => (
          <a
            key={item}
            href="#"
            className={`flex rounded-md px-3 py-2.5 text-sm font-semibold transition ${
              index === 0
                ? "bg-cyan-300 text-slate-950"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            {item}
          </a>
        ))}
      </nav>
    </aside>
  );
}
