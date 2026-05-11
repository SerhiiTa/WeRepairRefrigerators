"use client";

import { useState } from "react";

import { FormSection } from "@/components/FormSection";
import { RadioCardGroup } from "@/components/RadioCardGroup";
import { SelectField } from "@/components/SelectField";
import { TextArea } from "@/components/TextArea";
import { TextInput } from "@/components/TextInput";
import { RepairHelpRequestPreview } from "@/components/dashboard/RepairHelpRequestPreview";
import type {
  CommunityDiscussionPriority,
  CommunityLanguage,
  RepairHelpRequestDraft,
} from "@/types/community";

const applianceTypes = [
  "Built-in refrigerator",
  "French door refrigerator",
  "Column refrigerator",
  "Refrigerator ice maker",
  "Ice machine",
  "Wine cooler",
];

const brands = [
  "Sub-Zero",
  "Thermador",
  "LG",
  "Samsung",
  "Scotsman",
  "Whirlpool",
  "KitchenAid",
  "Bosch",
  "Viking",
  "JennAir",
];

const urgencyOptions = [
  {
    label: "Normal",
    value: "normal",
    description: "Standard private discussion for troubleshooting help.",
  },
  {
    label: "Urgent",
    value: "urgent",
    description: "Needs fast input before a callback, quote, or return visit.",
  },
  {
    label: "Expert needed",
    value: "expert_needed",
    description: "Escalate to sealed-system, premium, or senior technician experience.",
  },
];

const languageOptions = [
  {
    label: "English",
    value: "en",
    description: "Original request will be written in English.",
  },
  {
    label: "Spanish",
    value: "es",
    description: "Original request can later include a static translated preview.",
  },
  {
    label: "Russian",
    value: "ru",
    description: "Original request can later include a static translated preview.",
  },
  {
    label: "Ukrainian",
    value: "uk",
    description: "Original request can later include a static translated preview.",
  },
];

const initialDraft: RepairHelpRequestDraft = {
  allowAISummaryPreview: true,
  allowTranslatedPreview: true,
  applianceType: "",
  brand: "",
  customerComplaint: "",
  errorCodes: "",
  language: "",
  modelNumber: "",
  partsAlreadyReplaced: "",
  serialNumber: "",
  serviceArea: "",
  suspectedCause: "",
  symptom: "",
  urgency: "",
  visibility: "private_technicians_only",
  whatWasChecked: "",
};

function getFormValue(formData: FormData, key: keyof RepairHelpRequestDraft) {
  return String(formData.get(key) ?? "");
}

function buildDraftFromForm(form: HTMLFormElement): RepairHelpRequestDraft {
  const formData = new FormData(form);

  return {
    allowAISummaryPreview: formData.get("allowAISummaryPreview") === "on",
    allowTranslatedPreview: formData.get("allowTranslatedPreview") === "on",
    applianceType: getFormValue(formData, "applianceType"),
    brand: getFormValue(formData, "brand"),
    customerComplaint: getFormValue(formData, "customerComplaint"),
    errorCodes: getFormValue(formData, "errorCodes"),
    language: getFormValue(formData, "language") as CommunityLanguage | "",
    modelNumber: getFormValue(formData, "modelNumber"),
    partsAlreadyReplaced: getFormValue(formData, "partsAlreadyReplaced"),
    serialNumber: getFormValue(formData, "serialNumber"),
    serviceArea: getFormValue(formData, "serviceArea"),
    suspectedCause: getFormValue(formData, "suspectedCause"),
    symptom: getFormValue(formData, "symptom"),
    urgency: getFormValue(formData, "urgency") as CommunityDiscussionPriority | "",
    visibility: "private_technicians_only",
    whatWasChecked: getFormValue(formData, "whatWasChecked"),
  };
}

export function RepairHelpRequestForm() {
  const [draft, setDraft] = useState<RepairHelpRequestDraft>(initialDraft);
  const [isSubmitted, setIsSubmitted] = useState(false);

  function syncDraft(form: HTMLFormElement) {
    setDraft(buildDraftFromForm(form));
    setIsSubmitted(false);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDraft(buildDraftFromForm(event.currentTarget));
    setIsSubmitted(true);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
      <form
        className="space-y-6"
        noValidate
        onChange={(event) => syncDraft(event.currentTarget)}
        onSubmit={handleSubmit}
      >
        <FormSection
          title="Appliance and symptom"
          description="Capture the repair context without adding customer personal information."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-slate-100">Appliance type</span>
              <div className="mt-2">
                <SelectField
                  id="applianceType"
                  name="applianceType"
                  options={applianceTypes}
                  required
                />
              </div>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-100">Brand</span>
              <div className="mt-2">
                <SelectField id="brand" name="brand" options={brands} required />
              </div>
            </label>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-slate-100">Model number</span>
              <div className="mt-2">
                <TextInput id="modelNumber" name="modelNumber" placeholder="650/S" />
              </div>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-100">Serial number</span>
              <span className="mt-1 block text-xs font-bold uppercase tracking-[0.18em] text-amber-200">
                Private/internal only
              </span>
              <div className="mt-2">
                <TextInput id="serialNumber" name="serialNumber" placeholder="Optional" />
              </div>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-bold text-slate-100">Symptom</span>
            <div className="mt-2">
              <TextInput
                id="symptom"
                name="symptom"
                placeholder="Fresh-food section warming up"
                required
              />
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-bold text-slate-100">
              Generalized customer complaint
            </span>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Do not enter full names, phone numbers, emails, or full addresses.
            </p>
            <div className="mt-2">
              <TextArea
                id="customerComplaint"
                name="customerComplaint"
                placeholder="Customer reports the refrigerator has been warm since yesterday."
                rows={3}
              />
            </div>
          </label>
        </FormSection>

        <FormSection
          title="Troubleshooting context"
          description="Add what has already been checked so other technicians can respond faster."
        >
          <label className="block">
            <span className="text-sm font-bold text-slate-100">What was checked</span>
            <div className="mt-2">
              <TextArea
                id="whatWasChecked"
                name="whatWasChecked"
                placeholder="Condenser cleaned, fans running, freezer near target temperature."
                rows={4}
              />
            </div>
          </label>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-slate-100">Suspected cause</span>
              <div className="mt-2">
                <TextInput
                  id="suspectedCause"
                  name="suspectedCause"
                  placeholder="Partial restriction or airflow issue"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-100">Error codes</span>
              <div className="mt-2">
                <TextInput id="errorCodes" name="errorCodes" placeholder="Optional" />
              </div>
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-bold text-slate-100">Parts already replaced</span>
            <div className="mt-2">
              <TextArea
                id="partsAlreadyReplaced"
                name="partsAlreadyReplaced"
                placeholder="No parts replaced yet, or list technician-facing part details."
                rows={3}
              />
            </div>
          </label>
        </FormSection>

        <FormSection
          title="Community routing"
          description="Set priority, language, service area, and future AI/translation eligibility."
        >
          <RadioCardGroup legend="Urgency" name="urgency" options={urgencyOptions} />
          <RadioCardGroup legend="Original language" name="language" options={languageOptions} />

          <label className="block">
            <span className="text-sm font-bold text-slate-100">Service area</span>
            <div className="mt-2">
              <TextInput id="serviceArea" name="serviceArea" placeholder="Memorial, Houston" />
            </div>
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex gap-3 rounded-md border border-white/10 bg-slate-950 p-4">
              <input
                className="mt-1 h-4 w-4 accent-cyan-300"
                defaultChecked
                name="allowAISummaryPreview"
                type="checkbox"
              />
              <span>
                <span className="block text-sm font-bold text-white">AI summary preview</span>
                <span className="mt-1 block text-sm leading-6 text-slate-400">
                  Mark this draft as eligible for future TechAdvisor summarization.
                </span>
              </span>
            </label>

            <label className="flex gap-3 rounded-md border border-white/10 bg-slate-950 p-4">
              <input
                className="mt-1 h-4 w-4 accent-cyan-300"
                defaultChecked
                name="allowTranslatedPreview"
                type="checkbox"
              />
              <span>
                <span className="block text-sm font-bold text-white">Translated preview</span>
                <span className="mt-1 block text-sm leading-6 text-slate-400">
                  Mark this draft as eligible for future static translation previews.
                </span>
              </span>
            </label>
          </div>

          <div className="rounded-md border border-emerald-300/20 bg-emerald-300/10 p-4">
            <p className="text-sm font-bold text-emerald-100">
              Visibility: private_technicians_only. This request is not public, not indexed, and
              not sent anywhere in this mock.
            </p>
          </div>
        </FormSection>

        <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-slate-900 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-slate-400">
            Client-side mock only. Submitting shows a local success state and does not create data.
          </p>
          <button
            className="rounded-md bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
            type="submit"
          >
            Create Mock Help Request
          </button>
        </div>
      </form>

      <RepairHelpRequestPreview draft={draft} isSubmitted={isSubmitted} />
    </div>
  );
}
