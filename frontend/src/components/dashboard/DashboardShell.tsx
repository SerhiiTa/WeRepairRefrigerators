import { DashboardAuthGate } from "./DashboardAuthGate";
import { DashboardSidebar } from "./DashboardSidebar";
import { DashboardTopbar } from "./DashboardTopbar";
import { CommunicationsAttentionProvider } from "./communications/CommunicationsAttentionProvider";

type DashboardShellProps = {
  children: React.ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <DashboardAuthGate>
      <CommunicationsAttentionProvider>
        <main className="min-h-screen bg-[#F7F9FC] font-sans text-[#0F172A]">
          <div className="flex min-h-screen w-full">
            <DashboardSidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <DashboardTopbar />
              <div className="flex-1 px-4 py-5 sm:px-6 lg:px-6 2xl:px-8">
                {children}
              </div>
            </div>
          </div>
        </main>
      </CommunicationsAttentionProvider>
    </DashboardAuthGate>
  );
}
