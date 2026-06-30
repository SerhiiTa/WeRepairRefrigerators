import { DashboardAuthGate } from "./DashboardAuthGate";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardTopbar } from "./DashboardTopbar";

type DashboardShellProps = {
  children: React.ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <DashboardAuthGate>
      <main className="min-h-screen bg-[#F7F9FC] font-sans text-[#0F172A]">
        <div className="mx-auto flex min-h-screen max-w-[1440px]">
          <DashboardSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <DashboardTopbar />
            <div className="flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</div>
          </div>
        </div>
      </main>
    </DashboardAuthGate>
  );
}
