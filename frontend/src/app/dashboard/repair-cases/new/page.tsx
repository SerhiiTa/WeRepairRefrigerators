import Link from "next/link";

import { FormField } from "@/components/FormField";
import { FormSection } from "@/components/FormSection";
import { RadioCardGroup } from "@/components/RadioCardGroup";
import { TextArea } from "@/components/TextArea";
import { TextInput } from "@/components/TextInput";
import { BrandSelector } from "@/components/dashboard/BrandSelector";
import { PhotoUploadPlaceholder } from "@/components/dashboard/PhotoUploadPlaceholder";
import { SeoMetadataPreview } from "@/components/dashboard/SeoMetadataPreview";
import type { ApplianceLabelExtraction } from "@/types/repair-case";

const mockLabelExtraction: ApplianceLabelExtraction = {
  detectedBrand: "Sub-Zero",
  detectedModelNumber: "BI-36UFD",
  detectedSerialNumber: "SZ18492073",
  confidence: "Mock 94%",
};

export default function NewRepairCasePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-lg border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_34%),#0f172a] p-6">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-200">
            Repair cases
          </p>
          <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                Create refrigerator repair case
              </h1>
              <p className="mt-3 max-w-3xl leading-7 text-slate-300">
                Capture the job location, appliance details, symptoms, diagnosis,
                parts, repair outcome, and SEO-ready summary. This is UI only with mock
                placeholders for the MVP.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex justify-center rounded-md border border-white/15 px-4 py-2.5 text-sm font-bold text-white transition hover:border-cyan-300 hover:bg-white/5"
            >
              Back to dashboard
            </Link>
          </div>
        </section>

        <form className="grid gap-6" noValidate>
          <FormSection
            title="Job location"
            description="Only city and ZIP code are required so outside-platform repair jobs can be tracked without customer personal data."
          >
            <div className="rounded-md border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
              Do not enter customer personal information unless the customer came through the
              platform or gave permission.
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <FormField id="city" label="City" required>
                <TextInput id="city" name="city" placeholder="Houston" required />
              </FormField>
              <FormField id="zip-code" label="ZIP code" required>
                <TextInput
                  id="zip-code"
                  name="zipCode"
                  inputMode="numeric"
                  placeholder="77007"
                  required
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection
            title="Private notes — not used for public SEO pages"
            description="Optional admin-only fields for platform-originated jobs or customers who gave permission."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <FormField id="customer-name" label="Customer name">
                <TextInput id="customer-name" name="customerName" placeholder="Optional" />
              </FormField>
              <FormField id="phone" label="Phone number">
                <TextInput id="phone" name="phone" type="tel" placeholder="Optional" />
              </FormField>
            </div>
            <FormField id="private-notes" label="Private admin notes">
              <TextArea
                id="private-notes"
                name="privateNotes"
                placeholder="Internal notes only. Do not use this content for public SEO pages."
                rows={3}
              />
            </FormField>
          </FormSection>

          <FormSection
            title="Appliance information"
            description="Details that help technicians identify parts, warranty context, and recurring model issues."
          >
            <div className="grid gap-5 md:grid-cols-3">
              <BrandSelector />
              <FormField id="model-number" label="Model number" required>
                <TextInput id="model-number" name="modelNumber" placeholder="WRF555SDFZ" required />
              </FormField>
              <FormField id="serial-number" label="Serial number">
                <TextInput id="serial-number" name="serialNumber" placeholder="SN123456789" />
              </FormField>
            </div>
          </FormSection>

          <FormSection
            title="AI label extraction"
            description="AI extraction will be connected later. For now, enter appliance data manually."
          >
            <div className="grid gap-4 md:grid-cols-4">
              {[
                ["Detected brand", mockLabelExtraction.detectedBrand],
                ["Detected model number", mockLabelExtraction.detectedModelNumber],
                ["Detected serial number", mockLabelExtraction.detectedSerialNumber],
                ["Confidence", mockLabelExtraction.confidence],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-white/10 bg-slate-950 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                    {label}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-100">{value}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled
                className="rounded-md border border-white/10 px-5 py-3 text-sm font-bold text-slate-500"
              >
                Extract from label photo
              </button>
              <button
                type="button"
                disabled
                className="rounded-md bg-slate-800 px-5 py-3 text-sm font-bold text-slate-500"
              >
                Apply extracted data
              </button>
            </div>
          </FormSection>

          <FormSection
            title="Symptoms"
            description="Reported issue details before the technician diagnosis."
          >
            <FormField id="issue-description" label="Issue description" required>
              <TextArea
                id="issue-description"
                name="issueDescription"
                placeholder="Refrigerator is running but not cooling. Freezer temperature has been rising since yesterday."
                required
              />
            </FormField>
          </FormSection>

          <FormSection
            title="Diagnostic steps"
            description="Technician notes that can support repair history and future AI article generation."
          >
            <FormField id="technician-findings" label="Technician findings" required>
              <TextArea
                id="technician-findings"
                name="technicianFindings"
                placeholder="Checked condenser coils, evaporator fan, start relay, and compressor amp draw."
                required
                rows={5}
              />
            </FormField>
          </FormSection>

          <FormSection
            title="Parts used"
            description="Placeholder part details for now. Inventory and pricing automation will come later."
          >
            <div className="grid gap-5 md:grid-cols-3">
              <FormField id="part-name" label="Part name">
                <TextInput id="part-name" name="partName" placeholder="Start relay" />
              </FormField>
              <FormField id="part-number" label="Part number">
                <TextInput id="part-number" name="partNumber" placeholder="W11081429" />
              </FormField>
              <FormField id="part-quantity" label="Quantity">
                <TextInput
                  id="part-quantity"
                  name="partQuantity"
                  type="number"
                  inputMode="numeric"
                  placeholder="1"
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection
            title="Repair summary"
            description="Outcome and estimate fields for the case preview and later reporting."
          >
            <RadioCardGroup
              legend="Repair outcome"
              name="repairOutcome"
              options={[
                {
                  label: "Repaired",
                  value: "repaired",
                  description: "The refrigerator was returned to working condition.",
                },
                {
                  label: "Not repaired",
                  value: "not-repaired",
                  description: "The repair was declined, deferred, or requires follow-up.",
                },
              ]}
            />

            <div className="grid gap-5 md:grid-cols-[1fr_2fr]">
              <FormField id="estimated-repair-cost" label="Estimated repair cost" required>
                <TextInput
                  id="estimated-repair-cost"
                  name="estimatedRepairCost"
                  type="number"
                  inputMode="decimal"
                  placeholder="325"
                  required
                />
              </FormField>
              <FormField id="repair-summary" label="Repair summary">
                <TextArea
                  id="repair-summary"
                  name="repairSummary"
                  placeholder="Replaced failed relay, verified compressor startup, and confirmed cooling cycle."
                  rows={3}
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection
            title="Photo upload placeholders"
            description="Mock upload areas only. No storage, Supabase, or real file handling yet."
          >
            <PhotoUploadPlaceholder />
          </FormSection>

          <FormSection
            title="SEO metadata preview"
            description="A preview surface for future AI-assisted article metadata."
          >
            <SeoMetadataPreview />
          </FormSection>

          <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-slate-900 p-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="rounded-md border border-white/15 px-5 py-3 text-sm font-bold text-white transition hover:border-cyan-300 hover:bg-white/5"
            >
              Save mock draft
            </button>
            <button
              type="button"
              className="rounded-md bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
            >
              Preview repair case
            </button>
          </div>
        </form>
    </div>
  );
}
