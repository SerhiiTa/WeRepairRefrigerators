import { AiWorkflowWorkspace } from "@/components/dashboard/AiWorkflowWorkspace";
import { mockRepairCases } from "@/lib/mock-repair-cases";

export default function AiArticlesPage() {
  return <AiWorkflowWorkspace repairCases={mockRepairCases} />;
}
