import type { RepairCase } from "@/types/repair-case";
import type { PublicRepairCase } from "@/types/public-seo";

export type AiWorkflowStatusTone = "cyan" | "emerald" | "amber" | "slate";
export type AiWorkflowReviewStatus =
  | "Draft"
  | "Technician Review"
  | "Privacy Checked"
  | "SEO Checked"
  | "Ready to Publish";

export type AiWorkflowCardModel = {
  title: string;
  purpose: string;
  inputType: string;
  outputType: string;
  status: string;
  statusTone: AiWorkflowStatusTone;
  ctaLabel: string;
  ctaHref: string;
};

export type AiArticleDraftPreview = {
  seoTitle: string;
  metaDescription: string;
  suggestedSlug: string;
  introParagraph: string;
  diagnosticSummary: string;
  repairSummary: string;
  faqIdeas: string[];
  internalLinks: {
    label: string;
    href: string;
  }[];
  imagePromptSuggestion: string;
};

export type TelegramIntakeMockModel = {
  technician: string;
  submittedAt: string;
  textNote: string;
  voiceNoteLabel: string;
  modelStickerLabel: string;
  extracted: {
    brand: string;
    modelNumber: string;
    serialNumber: string;
    symptom: string;
  };
  draftRepairCase: Pick<
    RepairCase,
    "caseNumber" | "issueDescription" | "technicianFindings" | "repairSummary"
  >;
};

export type VoiceNoteConversionMock = {
  transcript: string;
  structuredSummary: {
    appliance: string;
    symptom: string;
    diagnosis: string;
    parts: string;
    repairResult: string;
    seoAngle: string;
  };
};

export type ImagePromptMock = {
  title: string;
  prompt: string;
};

export type PublishReadinessStep = {
  label: string;
  description: string;
  status: string;
  tone: AiWorkflowStatusTone;
};

export type AiWorkflowMockOutput = {
  articlePreview: AiArticleDraftPreview;
  publicRepairCasePreview: PublicRepairCase;
  imagePrompts: ImagePromptMock[];
};
