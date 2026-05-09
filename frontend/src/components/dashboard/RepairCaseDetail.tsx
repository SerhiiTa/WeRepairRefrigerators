import { StatusBadge } from "@/components/StatusBadge";
import { DetailSection } from "@/components/dashboard/DetailSection";
import type { RepairCase } from "@/types/repair-case";

type RepairCaseDetailProps = {
  repairCase: RepairCase;
};

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950 p-4">
      <dt className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm font-semibold text-slate-100">{value}</dd>
    </div>
  );
}

function CurrencyValue({ value }: { value: number }) {
  return (
    <span>
      {new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value)}
    </span>
  );
}

export function RepairCaseDetail({ repairCase }: RepairCaseDetailProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <DetailSection
          title="Job location"
          description="Public-safe service location context for repair tracking and SEO pages."
        >
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailItem label="Service label" value={repairCase.location.label} />
            <DetailItem label="Neighborhood" value={repairCase.location.neighborhood} />
            <DetailItem label="City" value={repairCase.location.city} />
            <DetailItem label="ZIP code" value={repairCase.location.zipCode} />
          </dl>
        </DetailSection>

        <DetailSection title="Appliance information" description="Repair identifiers for future database records.">
          <dl className="grid gap-4 sm:grid-cols-3">
            <DetailItem label="Brand" value={repairCase.appliance.brand} />
            <DetailItem label="Model number" value={repairCase.appliance.modelNumber} />
            <DetailItem label="Serial number" value={repairCase.appliance.serialNumber} />
          </dl>
        </DetailSection>

        <DetailSection title="AI label extraction" description="Mock extracted appliance-label data for future OCR and AI wiring.">
          <dl className="grid gap-4 sm:grid-cols-4">
            <DetailItem
              label="Detected brand"
              value={repairCase.labelExtraction?.detectedBrand ?? "Not extracted"}
            />
            <DetailItem
              label="Detected model"
              value={repairCase.labelExtraction?.detectedModelNumber ?? "Not extracted"}
            />
            <DetailItem
              label="Detected serial"
              value={repairCase.labelExtraction?.detectedSerialNumber ?? "Not extracted"}
            />
            <DetailItem
              label="Confidence"
              value={repairCase.labelExtraction?.confidence ?? "Mock pending"}
            />
          </dl>
        </DetailSection>

        <DetailSection title="Symptoms">
          <p className="leading-7 text-slate-300">{repairCase.issueDescription}</p>
        </DetailSection>

        <DetailSection title="Diagnostic findings">
          <p className="leading-7 text-slate-300">{repairCase.technicianFindings}</p>
        </DetailSection>

        <DetailSection title="Parts used" description="Mock part rows for future normalized part records.">
          {repairCase.partsUsed.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-3 pr-4 font-semibold">Part</th>
                    <th className="px-4 py-3 font-semibold">Part number</th>
                    <th className="px-4 py-3 font-semibold">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {repairCase.partsUsed.map((part) => (
                    <tr key={`${part.partNumber}-${part.name}`} className="text-slate-300">
                      <td className="py-4 pr-4 font-semibold text-white">{part.name}</td>
                      <td className="px-4 py-4">{part.partNumber}</td>
                      <td className="px-4 py-4">{part.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm leading-6 text-slate-400">No parts were recorded for this case.</p>
          )}
        </DetailSection>

        <DetailSection title="Repair summary">
          <p className="leading-7 text-slate-300">{repairCase.repairSummary}</p>
        </DetailSection>

        <DetailSection title="SEO preview block" description="Draft metadata generated from mock case details.">
          <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-5">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">
              SEO preview
            </p>
            <h3 className="mt-3 text-xl font-bold text-white">{repairCase.seoPreview.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {repairCase.seoPreview.description}
            </p>
            <dl className="mt-5 grid gap-3 sm:grid-cols-3">
              <DetailItem label="Slug" value={repairCase.seoPreview.slug} />
              <DetailItem label="Audience" value={repairCase.seoPreview.audience} />
              <DetailItem label="Status" value={repairCase.seoPreview.status} />
            </dl>
          </div>
        </DetailSection>
      </div>

      <aside className="space-y-6">
        <DetailSection title="Case status">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-slate-400">Status</span>
              <StatusBadge tone={repairCase.repairStatusTone}>{repairCase.repairStatus}</StatusBadge>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-slate-400">Technician</span>
              <span className="text-sm font-bold text-white">{repairCase.technician}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-slate-400">Estimated repair cost</span>
              <span className="text-sm font-bold text-white">
                <CurrencyValue value={repairCase.estimatedRepairCost} />
              </span>
            </div>
          </div>
        </DetailSection>

        <DetailSection title="Location">
          <dl className="grid gap-4">
            <DetailItem label="Service label" value={repairCase.location.label} />
            <DetailItem label="Neighborhood" value={repairCase.location.neighborhood} />
            <DetailItem label="Market" value="Houston MVP" />
          </dl>
        </DetailSection>

        <DetailSection title="Photo placeholders" description="No real uploads yet.">
          <div className="grid gap-3">
            {repairCase.photos.map((photo) => (
              <div
                key={photo.label}
                className="rounded-lg border border-dashed border-white/20 bg-slate-950 p-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-300/10 text-cyan-200">
                  +
                </div>
                <h3 className="mt-3 text-sm font-bold text-white">{photo.label}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">{photo.description}</p>
              </div>
            ))}
          </div>
        </DetailSection>
      </aside>
    </div>
  );
}
