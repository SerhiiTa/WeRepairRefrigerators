export type SeoEntityKind = "brand" | "service" | "location" | "repair-case" | "technician";

export type SeoPageMetadata = {
  title: string;
  description: string;
  canonicalPath: string;
  keywords: string[];
  openGraph: {
    title: string;
    description: string;
    url: string;
    type: "website" | "article";
  };
};

export type Brand = {
  slug: string;
  name: string;
  description: string;
  summary: string;
  applianceFocus?: string[];
};

export type Service = {
  slug: string;
  name: string;
  description: string;
  summary: string;
  applianceTypes?: string[];
  difficulty?: "standard" | "advanced" | "specialty";
};

export type Location = {
  slug: string;
  name: string;
  description: string;
  summary: string;
  zipCodes?: string[];
  serviceArea?: string;
};

export type PublicRepairCase = {
  slug: string;
  title: string;
  location: string;
  city?: string;
  serviceArea?: string;
  zipCode?: string;
  applianceType?: string;
  brand: string;
  service: string;
  symptom?: string;
  issue: string;
  diagnosis: string;
  resolution: string;
  photoPlaceholders?: {
    label: string;
    description: string;
  }[];
  faqIdeas?: string[];
  internalLinks?: RelatedLink[];
};

export type PublicSeoItem = Brand | Service | Location;

export type FaqItem = {
  question: string;
  answer: string;
};

export type RelatedLink = {
  label: string;
  href: string;
  description?: string;
  kind: SeoEntityKind;
};

export type AiContentBlockKind =
  | "intro"
  | "diagnostic"
  | "repair"
  | "warning"
  | "maintenance"
  | "cta";

export type AiContentBlock = {
  kind: AiContentBlockKind;
  title: string;
  body: string;
};

export type TechnicianProfilePreview = {
  slug: string;
  name: string;
  role: string;
  serviceArea: string;
  city?: string;
  zipCodes?: string[];
  specialties: string[];
  summary: string;
  verificationStatus?: string;
  rating?: string;
  responseTime?: string;
  completedRepairs?: number;
  yearsExperience?: number;
  badges?: string[];
  brandFocus?: string[];
  repairCaseSlugs?: string[];
};
