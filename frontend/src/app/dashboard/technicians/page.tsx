import { EmptyState } from "@/components/ui/EmptyState";

export default function TechniciansPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <EmptyState
        title="No technician profiles yet"
        description="Technician profiles will appear here once profile management is added for the Houston MVP."
        action={{
          label: "Create repair case",
          href: "/dashboard/repair-cases/new",
        }}
      />
    </div>
  );
}
