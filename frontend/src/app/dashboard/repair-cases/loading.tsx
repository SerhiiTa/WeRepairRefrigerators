import { LoadingState } from "@/components/ui/LoadingState";

export default function RepairCasesLoading() {
  return (
    <div className="w-full">
      <LoadingState
        title="Loading repair cases"
        description="Preparing repair case data for the dashboard."
        rows={4}
        variant="list"
      />
    </div>
  );
}
