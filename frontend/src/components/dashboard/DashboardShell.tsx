import { DashboardAuthGate } from "./DashboardAuthGate";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardTopbar } from "./DashboardTopbar";

type DashboardShellProps = {
  children: React.ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <DashboardAuthGate>
      <main className="min-h-screen bg-slate-950 text-white">
        <div className="flex min-h-screen">
          <DashboardSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <DashboardTopbar />
            <div className="flex-1 px-5 py-6 sm:px-6 lg:px-8">{children}</div>
          </div>
        </div>
      </main>
    </DashboardAuthGate>
  );
}
