"use client";

import { LeadCard } from "@/components/dashboard/LeadCard";
import { LeadDetailPanel } from "@/components/dashboard/LeadDetailPanel";
import type { MarketplaceLead } from "@/types/lead";

type DashboardLeadPreviewProps = {
  lead: MarketplaceLead;
};

export function DashboardLeadPreview({ lead }: DashboardLeadPreviewProps) {
  const noop = () => undefined;

  return (
    <section className="grid gap-6 xl:grid-cols-[1fr_24rem] xl:items-start">
      <LeadCard
        isSelected
        lead={lead}
        onSelect={noop}
        onStartConversion={noop}
        onUpdateStatus={noop}
      />
      <LeadDetailPanel lead={lead} onStartConversion={noop} onUpdateStatus={noop} />
    </section>
  );
}
