import { mockRepairCases } from "@/lib/mock-repair-cases";
import type {
  AiArticleDraftPreview,
  AiWorkflowCardModel,
  ImagePromptMock,
  PublishReadinessStep,
  TelegramIntakeMockModel,
  VoiceNoteConversionMock,
} from "@/types/ai-workflow";
import type { PublicRepairCase } from "@/types/public-seo";
import type { RepairCase } from "@/types/repair-case";

export const aiWorkflowCards: AiWorkflowCardModel[] = [
  {
    title: "Generate SEO Article",
    purpose: "Create a human-reviewed article draft from approved repair case details.",
    inputType: "Repair case summary",
    outputType: "SEO article draft",
    status: "Mock ready",
    statusTone: "emerald",
    ctaLabel: "Preview draft",
    ctaHref: "#article-preview",
  },
  {
    title: "Create Public Repair Case",
    purpose: "Convert private job notes into a privacy-safe public repair case page.",
    inputType: "Private repair case",
    outputType: "Public case preview",
    status: "Privacy gated",
    statusTone: "amber",
    ctaLabel: "View flow",
    ctaHref: "#privacy-flow",
  },
  {
    title: "Generate Image Prompt",
    purpose: "Draft prompts for future article and social visuals without calling an image API.",
    inputType: "SEO topic",
    outputType: "Image prompt set",
    status: "Prompt only",
    statusTone: "cyan",
    ctaLabel: "View prompts",
    ctaHref: "#image-prompts",
  },
  {
    title: "Telegram Intake Draft",
    purpose: "Mock how a technician could submit notes, voice, and label photos from the field.",
    inputType: "Telegram-style intake",
    outputType: "Draft repair case",
    status: "UI mock",
    statusTone: "slate",
    ctaLabel: "Open intake",
    ctaHref: "#telegram-intake",
  },
  {
    title: "Voice Note to Repair Summary",
    purpose: "Turn a technician voice note into structured repair and SEO fields.",
    inputType: "Voice transcript",
    outputType: "Repair summary",
    status: "Mock parsed",
    statusTone: "cyan",
    ctaLabel: "View conversion",
    ctaHref: "#voice-note",
  },
  {
    title: "Photo Label Extraction",
    purpose: "Show future appliance label extraction from model sticker photos.",
    inputType: "Appliance label photo",
    outputType: "Brand/model/serial",
    status: "Existing mock",
    statusTone: "emerald",
    ctaLabel: "View extraction",
    ctaHref: "#telegram-intake",
  },
];

const sourceRepairCase = mockRepairCases[0];

function toSlugSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function serviceFromRepairCase(repairCase: RepairCase) {
  if (repairCase.issueDescription.toLowerCase().includes("ice maker")) {
    return "Ice maker repair";
  }

  if (repairCase.issueDescription.toLowerCase().includes("compressor")) {
    return "Sealed system repair";
  }

  if (repairCase.appliance.brand === "Sub-Zero") {
    return "Built-in refrigerator repair";
  }

  return "Refrigerator repair";
}

export function buildAiArticleDraftPreview(repairCase: RepairCase): AiArticleDraftPreview {
  const service = serviceFromRepairCase(repairCase);

  return {
    seoTitle: repairCase.seoPreview.title,
    metaDescription: repairCase.seoPreview.description,
    suggestedSlug: repairCase.seoPreview.slug,
    introParagraph: `When a ${repairCase.appliance.brand} refrigerator in ${repairCase.location.city} shows symptoms like ${repairCase.issueDescription.toLowerCase()}, the public article can explain the likely service path without exposing private customer details.`,
    diagnosticSummary: repairCase.technicianFindings,
    repairSummary: `${repairCase.repairSummary} This public draft keeps the repair outcome technical and removes customer identity, phone, exact address, and private notes.`,
    faqIdeas: [
      `Why would a ${repairCase.appliance.brand} refrigerator need service?`,
      `What should a homeowner check before scheduling ${service.toLowerCase()}?`,
      `When should a ${repairCase.location.city} homeowner call a refrigerator technician?`,
    ],
    internalLinks: [
      {
        label: `${repairCase.appliance.brand} refrigerator repair`,
        href: `/brands/${toSlugSegment(repairCase.appliance.brand)}`,
      },
      {
        label: service,
        href: `/services/${toSlugSegment(service)}`,
      },
      {
        label: `${repairCase.location.city} refrigerator repair`,
        href: `/locations/${toSlugSegment(repairCase.location.city)}`,
      },
    ],
    imagePromptSuggestion: `Clean editorial image for ${repairCase.appliance.brand} ${service.toLowerCase()} in a bright Houston-area kitchen, light blue cooling accents, no people, no customer address, no visible brand marks.`,
  };
}

export function buildPublicRepairCasePreview(repairCase: RepairCase): PublicRepairCase {
  const service = serviceFromRepairCase(repairCase);

  return {
    slug: repairCase.seoPreview.slug.replace(/^\//, ""),
    title: repairCase.seoPreview.title,
    location: repairCase.location.neighborhood
      ? `${repairCase.location.neighborhood}, ${repairCase.location.city}`
      : repairCase.location.city,
    brand: repairCase.appliance.brand,
    service,
    issue: repairCase.issueDescription,
    diagnosis: repairCase.technicianFindings,
    resolution: repairCase.repairSummary,
  };
}

export function buildImagePromptMocks(repairCase: RepairCase): ImagePromptMock[] {
  const service = serviceFromRepairCase(repairCase);

  return [
    {
      title: "Blog hero image prompt",
      prompt: `Bright modern kitchen with a ${repairCase.appliance.brand} refrigerator, cool blue repair-themed accents, editorial lighting, no text, no people, no visible customer details.`,
    },
    {
      title: "Repair case thumbnail prompt",
      prompt: `${service} thumbnail showing refrigerator airflow and diagnostic inspection, subtle frost motif, professional appliance service style, square crop.`,
    },
    {
      title: "Social image prompt",
      prompt: `${repairCase.location.city} refrigerator repair educational graphic, white and light blue palette, appliance silhouette, cooling lines, room for headline overlay.`,
    },
  ];
}

export const aiArticleDraftPreview = buildAiArticleDraftPreview(sourceRepairCase);

export const telegramIntakeMock: TelegramIntakeMockModel = {
  technician: "Marisol Reyes",
  submittedAt: "Mock intake, 2:14 PM",
  textNote:
    "Whirlpool fridge in Heights. Customer says leak started after filter change. Water under front right corner after ice maker runs.",
  voiceNoteLabel: "0:38 field voice note placeholder",
  modelStickerLabel: "Model sticker photo placeholder",
  extracted: {
    brand: "Whirlpool",
    modelNumber: "WRF555SDFZ",
    serialNumber: "WH78214590",
    symptom: "Ice maker leak after filter change",
  },
  draftRepairCase: {
    caseNumber: "WRR-DRAFT",
    issueDescription: "Ice maker leak after recent filter change in Houston Heights.",
    technicianFindings:
      "Draft findings should prompt filter seating, inlet fitting, fill tube, and supply line checks.",
    repairSummary:
      "Draft repair case is ready for technician review before it becomes public-safe content.",
  },
};

export const voiceNoteConversionMock: VoiceNoteConversionMock = {
  transcript:
    "Customer said refrigerator is not cooling. Built-in Sub-Zero. Checked condenser area and start components. Relay looks intermittent. Replaced relay, cleaned coils, unit started cooling before I left.",
  structuredSummary: {
    appliance: "Sub-Zero built-in refrigerator",
    symptom: "Running but not cooling consistently",
    diagnosis: "Intermittent compressor start relay behavior after condenser and gasket checks",
    parts: "Compressor start relay",
    repairResult: "Relay replaced, condenser cleaned, cooling cycle verified",
    seoAngle: "Houston built-in refrigerator not cooling due to start component issue",
  },
};

export const imagePromptMocks = buildImagePromptMocks(sourceRepairCase);

export const publishReadinessSteps: PublishReadinessStep[] = [
  {
    label: "Draft created",
    description: "Mock AI content draft exists from structured repair case details.",
    status: "Complete",
    tone: "emerald",
  },
  {
    label: "Needs technician review",
    description: "A technician must confirm findings, parts, and repair result before publishing.",
    status: "Required",
    tone: "amber",
  },
  {
    label: "Privacy check",
    description: "Remove customer name, phone, exact address, and private notes.",
    status: "In progress",
    tone: "cyan",
  },
  {
    label: "SEO check",
    description: "Confirm title, metadata, slug, FAQ ideas, and internal links.",
    status: "Queued",
    tone: "slate",
  },
  {
    label: "Ready to publish",
    description: "Publishing remains disabled until review and checks are complete.",
    status: "Locked",
    tone: "slate",
  },
];

export const aiWorkflowSourceRepairCase = sourceRepairCase;
