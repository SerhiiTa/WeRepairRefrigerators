import { EmptyState } from "@/components/ui/EmptyState";

export default function AiArticlesPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <EmptyState
        title="No AI article drafts yet"
        description="Generated SEO drafts will appear here after repair cases can move through the AI review pipeline."
        action={{
          label: "View repair cases",
          href: "/dashboard/repair-cases",
        }}
      />
    </div>
  );
}
