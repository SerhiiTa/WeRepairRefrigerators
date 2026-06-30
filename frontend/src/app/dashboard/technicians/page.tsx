import { EmptyState } from "@/components/ui/EmptyState";

export default function TechniciansPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <EmptyState
        title="No technician profiles yet"
        description="Technician team management will appear here once company staffing flows are added. Individual technician profile editing remains available through the existing profile route."
        action={{
          label: "Open jobs",
          href: "/dashboard/leads",
        }}
      />
    </div>
  );
}
