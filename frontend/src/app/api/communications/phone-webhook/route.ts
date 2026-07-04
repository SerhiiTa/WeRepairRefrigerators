import { handlePhoneWorkflowWebhook } from "@/server/communications/phone-webhook-handler";

export async function POST(request: Request) {
  return handlePhoneWorkflowWebhook(request);
}
