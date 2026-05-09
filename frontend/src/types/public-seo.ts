export type SeoEntityKind = "brand" | "service" | "location" | "repair-case";

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
};

export type Service = {
  slug: string;
  name: string;
  description: string;
  summary: string;
};

export type Location = {
  slug: string;
  name: string;
  description: string;
  summary: string;
};

export type PublicRepairCase = {
  slug: string;
  title: string;
  location: string;
  brand: string;
  service: string;
  issue: string;
  diagnosis: string;
  resolution: string;
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
