import { MobileFinanceSelector } from "@/components/dashboard/MobileFinanceSelector";
import { DashboardJobsOverview } from "@/components/dashboard/DashboardJobsOverview";

export default function DashboardPage() {
  return (
    <div className="w-full">
      <MobileFinanceSelector />
      <DashboardJobsOverview />
    </div>
  );
}
