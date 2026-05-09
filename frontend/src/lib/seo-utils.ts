import type { Metadata } from "next";

import type { SeoEntityKind, SeoPageMetadata } from "@/types/public-seo";

const siteUrl = "https://www.werepairrefrigerators.com";
const siteName = "WeRepairRefrigerators";

export function formatKeywordSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateSeoTitle(parts: string[]) {
  return `${parts.filter(Boolean).join(" | ")} | ${siteName}`;
}

export function generateMetaDescription(description: string) {
  const trimmed = description.trim();
  return trimmed.length > 155 ? `${trimmed.slice(0, 152).trim()}...` : trimmed;
}

export function generateCanonicalUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl}${normalizedPath}`;
}

export function prepareOpenGraph({
  title,
  description,
  canonicalPath,
  kind,
}: {
  title: string;
  description: string;
  canonicalPath: string;
  kind: SeoEntityKind;
}) {
  return {
    title,
    description,
    url: generateCanonicalUrl(canonicalPath),
    type: kind === "repair-case" ? ("article" as const) : ("website" as const),
  };
}

export function buildSeoPageMetadata({
  titleParts,
  description,
  canonicalPath,
  keywords,
  kind,
}: {
  titleParts: string[];
  description: string;
  canonicalPath: string;
  keywords: string[];
  kind: SeoEntityKind;
}): SeoPageMetadata {
  const title = generateSeoTitle(titleParts);
  const metaDescription = generateMetaDescription(description);

  return {
    title,
    description: metaDescription,
    canonicalPath,
    keywords: keywords.map(formatKeywordSlug),
    openGraph: prepareOpenGraph({
      title,
      description: metaDescription,
      canonicalPath,
      kind,
    }),
  };
}

export function toNextMetadata(metadata: SeoPageMetadata): Metadata {
  return {
    title: metadata.title,
    description: metadata.description,
    keywords: metadata.keywords,
    alternates: {
      canonical: generateCanonicalUrl(metadata.canonicalPath),
    },
    openGraph: metadata.openGraph,
  };
}
