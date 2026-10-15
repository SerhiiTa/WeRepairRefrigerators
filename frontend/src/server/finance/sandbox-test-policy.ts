import { HOMEFIX_PRIVATE_COMPANY_ID } from "@/lib/auth/homefix-private-access";

// Reuse the private-access company identity; no customer allowlist.
export function getSandboxTestPolicy() {
  const companyId = HOMEFIX_PRIVATE_COMPANY_ID;
  return { companyId };
}
export function isSandboxTestContextAllowed(context: {
  customerId: string | null; customerCompanyId: string | null; companyId: string;
}) {
  const policy = getSandboxTestPolicy();
  return Boolean(policy.companyId &&
    context.companyId.toLowerCase() === policy.companyId &&
    context.customerCompanyId?.toLowerCase() === policy.companyId &&
    context.customerId);
}
