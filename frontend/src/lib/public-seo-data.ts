import type { AiContentBlock, Brand, FaqItem, Location, PublicRepairCase, PublicSeoItem, RelatedLink, Service } from "@/types/public-seo";

export const publicBrands: Brand[] = [
  {
    slug: "sub-zero",
    name: "Sub-Zero",
    description: "Built-in refrigerator service for premium Sub-Zero cooling systems.",
    summary:
      "Sub-Zero repair pages can explain cooling loss, sealed system symptoms, door seal issues, and maintenance patterns for Houston homeowners.",
  },
  {
    slug: "thermador",
    name: "Thermador",
    description: "Thermador refrigerator troubleshooting for built-in and column units.",
    summary:
      "Thermador pages will focus on premium refrigerator diagnostics, temperature instability, ice maker issues, and service-ready repair summaries.",
  },
  {
    slug: "lg",
    name: "LG",
    description: "LG refrigerator repair content for compressor, cooling, and freezer concerns.",
    summary:
      "LG pages can turn repair cases into helpful public summaries about cooling failures, compressor noise, and freezer temperature problems.",
  },
  {
    slug: "samsung",
    name: "Samsung",
    description: "Samsung refrigerator repair pages for cooling, ice maker, and defrost issues.",
    summary:
      "Samsung pages will organize repair knowledge around ice maker failures, warm refrigerator compartments, and recurring defrost symptoms.",
  },
  {
    slug: "ge",
    name: "GE",
    description: "GE refrigerator repair content for common household refrigerator problems.",
    summary:
      "GE pages can explain model-specific symptoms, technician findings, and repair outcomes without exposing private job data.",
  },
  {
    slug: "whirlpool",
    name: "Whirlpool",
    description: "Whirlpool refrigerator repair summaries for common cooling and leak issues.",
    summary:
      "Whirlpool pages will support public repair education for water leaks, ice maker problems, warm refrigerators, and part replacement patterns.",
  },
  {
    slug: "kitchenaid",
    name: "KitchenAid",
    description: "KitchenAid refrigerator repair content for built-in and freestanding units.",
    summary:
      "KitchenAid pages can cover temperature control, condenser airflow, ice maker behavior, and repair decision points.",
  },
  {
    slug: "bosch",
    name: "Bosch",
    description: "Bosch refrigerator repair pages for premium kitchen appliance owners.",
    summary:
      "Bosch pages will prepare the site for brand-specific repair guides, diagnostic summaries, and public service information.",
  },
  {
    slug: "viking",
    name: "Viking",
    description: "Viking refrigerator service content for built-in and luxury units.",
    summary:
      "Viking pages can explain service patterns for premium refrigeration, including cooling issues, control faults, and part access notes.",
  },
  {
    slug: "jennair",
    name: "JennAir",
    description: "JennAir refrigerator repair pages for built-in and integrated systems.",
    summary:
      "JennAir pages will support public SEO content around luxury refrigerator symptoms, diagnosis, and repair-ready summaries.",
  },
];

export const publicServices: Service[] = [
  {
    slug: "refrigerator-repair",
    name: "Refrigerator repair",
    description: "Public repair content for refrigerators that are warm, noisy, leaking, or cycling poorly.",
    summary:
      "This service page will collect public-friendly repair explanations across brands, symptoms, and Houston-area repair cases.",
  },
  {
    slug: "built-in-refrigerator-repair",
    name: "Built-in refrigerator repair",
    description: "Repair content for premium built-in refrigerators and integrated kitchen systems.",
    summary:
      "Built-in pages will focus on airflow, access, sealed systems, controls, and service notes for higher-end refrigerators.",
  },
  {
    slug: "sealed-system-repair",
    name: "Sealed system repair",
    description: "Educational content for compressor, refrigerant, evaporator, and sealed-system concerns.",
    summary:
      "Sealed-system pages will prepare careful public explanations of symptoms, diagnostic steps, and repair decision factors.",
  },
  {
    slug: "ice-maker-repair",
    name: "Ice maker repair",
    description: "Repair content for ice makers that leak, stop producing ice, or freeze over.",
    summary:
      "Ice maker pages can explain inlet valves, filter seating, fill tubes, temperature issues, and repair outcomes.",
  },
  {
    slug: "wine-cooler-repair",
    name: "Wine cooler repair",
    description: "Public pages for wine coolers with temperature, fan, and control issues.",
    summary:
      "Wine cooler pages will support future SEO content for compact, undercounter, and premium wine refrigeration repair.",
  },
];

export const publicLocations: Location[] = [
  {
    slug: "houston",
    name: "Houston",
    description: "The first MVP market for WeRepairRefrigerators public repair content.",
    summary:
      "Houston pages will anchor local refrigerator repair content before the platform expands to additional markets.",
  },
  {
    slug: "katy",
    name: "Katy",
    description: "Future public repair pages for Katy-area refrigerator service.",
    summary:
      "Katy pages can organize brand, service, and repair-case content for west Houston-area homeowners.",
  },
  {
    slug: "sugar-land",
    name: "Sugar Land",
    description: "Future refrigerator repair content for Sugar Land homeowners.",
    summary:
      "Sugar Land pages will support local SEO structure while keeping repair summaries public-safe and privacy-first.",
  },
  {
    slug: "richmond",
    name: "Richmond",
    description: "Public repair content foundation for Richmond-area refrigerator service.",
    summary:
      "Richmond pages can combine location intent with brand and service pages as the public SEO platform grows.",
  },
  {
    slug: "memorial",
    name: "Memorial",
    description: "Houston neighborhood page for premium refrigerator repair content.",
    summary:
      "Memorial pages will help structure built-in and premium refrigerator repair examples for public search.",
  },
  {
    slug: "spring-branch",
    name: "Spring Branch",
    description: "Spring Branch refrigerator repair page foundation for the Houston MVP.",
    summary:
      "Spring Branch pages can collect public-friendly summaries for cooling issues, ice maker problems, and service examples.",
  },
];

export const publicRepairCases: PublicRepairCase[] = [
  {
    slug: "sub-zero-built-in-refrigerator-not-cooling-houston",
    title: "Sub-Zero built-in refrigerator not cooling in Houston",
    location: "Houston",
    brand: "Sub-Zero",
    service: "Built-in refrigerator repair",
    issue:
      "Fresh-food temperatures were rising and the refrigerator was running without reaching the expected cooling range.",
    diagnosis:
      "A technician-style summary would review condenser airflow, compressor startup behavior, door sealing, and control response.",
    resolution:
      "The public summary can describe a repair-ready outcome without showing customer name, phone, address, or private notes.",
  },
  {
    slug: "whirlpool-ice-maker-leak-repair-heights",
    title: "Whirlpool ice maker leak repair near Houston Heights",
    location: "Houston Heights",
    brand: "Whirlpool",
    service: "Ice maker repair",
    issue:
      "Water appeared beneath the refrigerator after an ice maker fill cycle and filter change.",
    diagnosis:
      "Public content can discuss filter seating, inlet valve behavior, water line checks, and fill tube inspection.",
    resolution:
      "The case page keeps the summary technical and location-safe while preparing a future AI-generated article structure.",
  },
  {
    slug: "lg-compressor-noise-warm-freezer-midtown",
    title: "LG compressor noise and warm freezer in Midtown Houston",
    location: "Midtown Houston",
    brand: "LG",
    service: "Sealed system repair",
    issue:
      "A warm freezer and compressor noise created a repair-or-replace decision point.",
    diagnosis:
      "A public case page can explain frost pattern checks, condenser airflow, control-board review, and compressor symptoms.",
    resolution:
      "The page avoids personal data and focuses on public-friendly technical education for similar refrigerator symptoms.",
  },
];

export const publicSymptoms = [
  "Refrigerator not cooling",
  "Freezer is warm",
  "Ice maker is leaking",
  "Compressor is noisy",
  "Built-in refrigerator temperature swings",
  "Wine cooler will not hold temperature",
];

export const publicRepairProcessSteps = [
  "Capture the brand, appliance type, city, ZIP code, and reported symptom.",
  "Summarize diagnosis details in public-safe language.",
  "Remove customer names, phone numbers, exact addresses, and private notes.",
  "Compose human-reviewed SEO content from approved repair context.",
];

export const publicFaqs: FaqItem[] = [
  {
    question: "Will public repair pages show customer personal information?",
    answer:
      "No. Public pages are designed to use brand, service, city, symptom, and technical summaries rather than customer names, phone numbers, exact addresses, or private notes.",
  },
  {
    question: "Are these pages generated by AI today?",
    answer:
      "No. The current content is mock/static. The architecture is prepared for future AI-assisted drafts that still require human review before publishing.",
  },
  {
    question: "Why start with Houston?",
    answer:
      "Houston is the MVP market. The route and content structure can later scale to additional cities after the local workflow is validated.",
  },
];

export const publicAiContentBlocks: AiContentBlock[] = [
  {
    kind: "intro",
    title: "Public-safe introduction",
    body: "Future AI drafts can introduce the repair topic using brand, service, and location context without exposing private job data.",
  },
  {
    kind: "diagnostic",
    title: "Diagnostic summary",
    body: "A diagnostic block can explain likely checks such as airflow, temperature readings, fan operation, ice maker fill behavior, or sealed-system symptoms.",
  },
  {
    kind: "repair",
    title: "Repair outcome",
    body: "Repair blocks can summarize completed work, deferred repair decisions, or technician recommendations in a customer-friendly format.",
  },
  {
    kind: "warning",
    title: "When to stop troubleshooting",
    body: "Warning blocks can advise readers to avoid unsafe electrical, refrigerant, or sealed-system work and contact a qualified technician.",
  },
  {
    kind: "maintenance",
    title: "Maintenance guidance",
    body: "Maintenance blocks can cover condenser cleaning, airflow clearance, gasket checks, filter seating, and temperature monitoring.",
  },
  {
    kind: "cta",
    title: "Next step",
    body: "CTA blocks can direct readers toward approved repair resources or platform workflows once public conversion paths are defined.",
  },
];

export function getRelatedLinks({
  currentSlug,
  includeRepairCases = true,
}: {
  currentSlug?: string;
  includeRepairCases?: boolean;
} = {}): RelatedLink[] {
  const brandLinks = publicBrands
    .filter((brand) => brand.slug !== currentSlug)
    .slice(0, 3)
    .map((brand) => ({
      label: `${brand.name} repair`,
      href: `/brands/${brand.slug}`,
      description: brand.description,
      kind: "brand" as const,
    }));

  const serviceLinks = publicServices
    .filter((service) => service.slug !== currentSlug)
    .slice(0, 3)
    .map((service) => ({
      label: service.name,
      href: `/services/${service.slug}`,
      description: service.description,
      kind: "service" as const,
    }));

  const cityLinks = publicLocations
    .filter((location) => location.slug !== currentSlug)
    .slice(0, 3)
    .map((location) => ({
      label: `${location.name} repair`,
      href: `/locations/${location.slug}`,
      description: location.description,
      kind: "location" as const,
    }));

  const repairCaseLinks = includeRepairCases
    ? publicRepairCases.slice(0, 2).map((repairCase) => ({
        label: repairCase.title,
        href: `/repair-cases/${repairCase.slug}`,
        description: repairCase.issue,
        kind: "repair-case" as const,
      }))
    : [];

  return [...brandLinks, ...serviceLinks, ...cityLinks, ...repairCaseLinks];
}

export function findPublicItem(items: PublicSeoItem[], slug: string) {
  return items.find((item) => item.slug === slug);
}

export function findPublicRepairCase(slug: string) {
  return publicRepairCases.find((repairCase) => repairCase.slug === slug);
}
