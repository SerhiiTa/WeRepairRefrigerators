import type {
  AiContentBlock,
  Brand,
  FaqItem,
  Location,
  PublicRepairCase,
  PublicSeoItem,
  RelatedLink,
  Service,
  TechnicianProfilePreview,
} from "@/types/public-seo";

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
  {
    slug: "scotsman",
    name: "Scotsman",
    description: "Scotsman ice machine repair content for undercounter and residential ice makers.",
    summary:
      "Scotsman pages can explain ice production issues, scale buildup, water inlet behavior, bin sensors, and cleaning-related service patterns.",
    applianceFocus: ["Undercounter ice machines", "Residential ice makers", "Clear ice machines"],
  },
];

export const publicServices: Service[] = [
  {
    slug: "refrigerator-repair",
    name: "Refrigerator repair",
    description: "Public repair content for refrigerators that are warm, noisy, leaking, or cycling poorly.",
    summary:
      "This service page will collect public-friendly repair explanations across brands, symptoms, and Houston-area repair cases.",
    applianceTypes: ["French door refrigerators", "Side-by-side refrigerators", "Bottom-freezer units"],
    difficulty: "standard",
  },
  {
    slug: "built-in-refrigerator-repair",
    name: "Built-in refrigerator repair",
    description: "Repair content for premium built-in refrigerators and integrated kitchen systems.",
    summary:
      "Built-in pages will focus on airflow, access, sealed systems, controls, and service notes for higher-end refrigerators.",
    applianceTypes: ["Built-in refrigerators", "Column refrigerators", "Integrated refrigeration"],
    difficulty: "advanced",
  },
  {
    slug: "sealed-system-repair",
    name: "Sealed system repair",
    description: "Educational content for compressor, refrigerant, evaporator, and sealed-system concerns.",
    summary:
      "Sealed-system pages will prepare careful public explanations of symptoms, diagnostic steps, and repair decision factors.",
    applianceTypes: ["Built-in refrigerators", "Premium refrigerators", "Freezers"],
    difficulty: "specialty",
  },
  {
    slug: "ice-maker-repair",
    name: "Ice maker repair",
    description: "Repair content for ice makers that leak, stop producing ice, or freeze over.",
    summary:
      "Ice maker pages can explain inlet valves, filter seating, fill tubes, temperature issues, and repair outcomes.",
    applianceTypes: ["Refrigerator ice makers", "Undercounter ice makers"],
    difficulty: "standard",
  },
  {
    slug: "wine-cooler-repair",
    name: "Wine cooler repair",
    description: "Public pages for wine coolers with temperature, fan, and control issues.",
    summary:
      "Wine cooler pages will support future SEO content for compact, undercounter, and premium wine refrigeration repair.",
    applianceTypes: ["Wine coolers", "Beverage centers", "Undercounter refrigeration"],
    difficulty: "advanced",
  },
  {
    slug: "ice-machine-repair",
    name: "Ice machine repair",
    description: "Repair content for residential clear ice machines with production, cleaning, and water issues.",
    summary:
      "Ice machine pages will support Scotsman-style service content around water flow, scale buildup, bin sensors, pumps, and clear ice production.",
    applianceTypes: ["Undercounter ice machines", "Clear ice machines", "Residential ice makers"],
    difficulty: "specialty",
  },
];

export const publicLocations: Location[] = [
  {
    slug: "houston",
    name: "Houston",
    description: "The first MVP market for WeRepairRefrigerators public repair content.",
    summary:
      "Houston pages will anchor local refrigerator repair content before the platform expands to additional markets.",
    zipCodes: ["77002", "77007", "77008", "77024", "77056"],
    serviceArea: "Houston metro",
  },
  {
    slug: "katy",
    name: "Katy",
    description: "Future public repair pages for Katy-area refrigerator service.",
    summary:
      "Katy pages can organize brand, service, and repair-case content for west Houston-area homeowners.",
    zipCodes: ["77449", "77450", "77493", "77494"],
    serviceArea: "West Houston",
  },
  {
    slug: "sugar-land",
    name: "Sugar Land",
    description: "Future refrigerator repair content for Sugar Land homeowners.",
    summary:
      "Sugar Land pages will support local SEO structure while keeping repair summaries public-safe and privacy-first.",
    zipCodes: ["77478", "77479", "77498"],
    serviceArea: "Southwest Houston",
  },
  {
    slug: "richmond",
    name: "Richmond",
    description: "Public repair content foundation for Richmond-area refrigerator service.",
    summary:
      "Richmond pages can combine location intent with brand and service pages as the public SEO platform grows.",
    zipCodes: ["77406", "77407", "77469"],
    serviceArea: "Fort Bend County",
  },
  {
    slug: "memorial",
    name: "Memorial",
    description: "Houston neighborhood page for premium refrigerator repair content.",
    summary:
      "Memorial pages will help structure built-in and premium refrigerator repair examples for public search.",
    zipCodes: ["77024", "77079"],
    serviceArea: "West Houston",
  },
  {
    slug: "spring-branch",
    name: "Spring Branch",
    description: "Spring Branch refrigerator repair page foundation for the Houston MVP.",
    summary:
      "Spring Branch pages can collect public-friendly summaries for cooling issues, ice maker problems, and service examples.",
    zipCodes: ["77055", "77080", "77092"],
    serviceArea: "Northwest Houston",
  },
];

export const publicRepairCases: PublicRepairCase[] = [
  {
    slug: "sub-zero-built-in-refrigerator-not-cooling-houston",
    title: "Sub-Zero built-in refrigerator not cooling in Houston",
    location: "Memorial, Houston",
    city: "Houston",
    serviceArea: "Memorial",
    zipCode: "77024",
    applianceType: "Built-in refrigerator",
    brand: "Sub-Zero",
    service: "Built-in refrigerator repair",
    symptom: "Fresh-food section not cooling consistently",
    issue:
      "Fresh-food temperatures were rising and the refrigerator was running without reaching the expected cooling range.",
    diagnosis:
      "The public diagnostic summary covers condenser airflow, compressor startup behavior, door sealing, control response, and start component testing.",
    resolution:
      "The public repair summary describes start relay replacement, condenser cleaning, compressor startup verification, and cooling-cycle confirmation without customer personal data.",
    photoPlaceholders: [
      {
        label: "Appliance label",
        description: "Public-safe placeholder for model and serial label documentation.",
      },
      {
        label: "Condenser area",
        description: "Public-safe placeholder for airflow and coil inspection.",
      },
      {
        label: "Temperature verification",
        description: "Public-safe placeholder for post-repair cooling confirmation.",
      },
    ],
    faqIdeas: [
      "Why would a Sub-Zero refrigerator run but not cool?",
      "Can a start relay cause cooling problems on a built-in refrigerator?",
      "When should a Houston homeowner schedule built-in refrigerator repair?",
    ],
    internalLinks: [
      {
        label: "Sub-Zero repair",
        href: "/brands/sub-zero",
        description: "Brand-specific built-in refrigerator repair content.",
        kind: "brand",
      },
      {
        label: "Built-in refrigerator repair",
        href: "/services/built-in-refrigerator-repair",
        description: "Service page for integrated refrigerator diagnostics.",
        kind: "service",
      },
      {
        label: "Memorial refrigerator repair",
        href: "/locations/memorial",
        description: "Houston neighborhood service area page.",
        kind: "location",
      },
    ],
  },
  {
    slug: "lg-compressor-replacement-midtown-houston",
    title: "LG compressor replacement evaluation in Midtown Houston",
    location: "Midtown Houston",
    city: "Houston",
    serviceArea: "Midtown",
    zipCode: "77002",
    applianceType: "French door refrigerator",
    brand: "LG",
    service: "Sealed system repair",
    symptom: "Warm freezer and compressor noise",
    issue:
      "The freezer was warm, ice production slowed, and compressor noise increased over several days.",
    diagnosis:
      "The public diagnostic summary covers evaporator frost pattern checks, condenser airflow, control-board review, compressor startup behavior, and sealed-system decision points.",
    resolution:
      "The public repair summary explains the compressor replacement evaluation, repair-versus-replace discussion, and customer-safe next-step guidance without showing private job details.",
    photoPlaceholders: [
      {
        label: "Freezer frost pattern",
        description: "Public-safe placeholder for evaporator inspection documentation.",
      },
      {
        label: "Compressor compartment",
        description: "Public-safe placeholder for sealed-system diagnostic context.",
      },
      {
        label: "Control diagnostics",
        description: "Public-safe placeholder for service mode or diagnostic review.",
      },
    ],
    faqIdeas: [
      "What are signs an LG refrigerator compressor may be failing?",
      "Is compressor replacement always worth it?",
      "What should be checked before sealed-system repair?",
    ],
    internalLinks: [
      {
        label: "LG refrigerator repair",
        href: "/brands/lg",
        description: "Brand page for LG compressor and cooling issues.",
        kind: "brand",
      },
      {
        label: "Sealed system repair",
        href: "/services/sealed-system-repair",
        description: "Service page for compressor and refrigerant concerns.",
        kind: "service",
      },
      {
        label: "Houston refrigerator repair",
        href: "/locations/houston",
        description: "Houston MVP service area page.",
        kind: "location",
      },
    ],
  },
  {
    slug: "samsung-refrigerator-cooling-issue-sugar-land",
    title: "Samsung refrigerator cooling issue in Sugar Land",
    location: "Sugar Land",
    city: "Sugar Land",
    serviceArea: "Southwest Houston",
    zipCode: "77479",
    applianceType: "French door refrigerator",
    brand: "Samsung",
    service: "Refrigerator repair",
    symptom: "Fresh-food temperature rising",
    issue:
      "Fresh-food temperatures were rising while the freezer stayed colder, creating a recurring cooling complaint.",
    diagnosis:
      "The public diagnostic summary covers evaporator fan checks, frost buildup, air damper behavior, condenser cleaning, and temperature sensor review.",
    resolution:
      "The public repair summary explains airflow restoration, temperature monitoring, and customer-safe maintenance guidance without exact address or private notes.",
    photoPlaceholders: [
      {
        label: "Fresh-food compartment",
        description: "Public-safe placeholder for airflow and vent inspection.",
      },
      {
        label: "Evaporator area",
        description: "Public-safe placeholder for frost and fan checks.",
      },
      {
        label: "Temperature test",
        description: "Public-safe placeholder for post-service temperature readings.",
      },
    ],
    faqIdeas: [
      "Why is a Samsung refrigerator warm but the freezer still cold?",
      "Can airflow problems cause refrigerator cooling issues?",
      "When should a Sugar Land homeowner schedule refrigerator repair?",
    ],
    internalLinks: [
      {
        label: "Samsung refrigerator repair",
        href: "/brands/samsung",
        description: "Brand page for Samsung cooling and airflow concerns.",
        kind: "brand",
      },
      {
        label: "Refrigerator repair",
        href: "/services/refrigerator-repair",
        description: "General refrigerator repair service page.",
        kind: "service",
      },
      {
        label: "Sugar Land refrigerator repair",
        href: "/locations/sugar-land",
        description: "Southwest Houston service area page.",
        kind: "location",
      },
    ],
  },
  {
    slug: "thermador-built-in-sealed-system-issue-katy",
    title: "Thermador built-in refrigerator sealed system issue in Katy",
    location: "Katy",
    city: "Katy",
    serviceArea: "West Houston",
    zipCode: "77494",
    applianceType: "Built-in refrigerator",
    brand: "Thermador",
    service: "Sealed system repair",
    symptom: "Temperature instability and poor recovery",
    issue:
      "A built-in Thermador refrigerator struggled to recover temperature after door openings and showed inconsistent cooling performance.",
    diagnosis:
      "The public diagnostic summary covers condenser airflow, evaporator frost pattern, compressor run behavior, sealed-system indicators, and control response.",
    resolution:
      "The public repair summary explains sealed-system review, service options, and technician review steps while keeping the case location-safe and privacy-first.",
    photoPlaceholders: [
      {
        label: "Built-in installation",
        description: "Public-safe placeholder for access and ventilation context.",
      },
      {
        label: "Evaporator inspection",
        description: "Public-safe placeholder for frost pattern documentation.",
      },
      {
        label: "Service panel",
        description: "Public-safe placeholder for diagnostic access area.",
      },
    ],
    faqIdeas: [
      "What are sealed-system symptoms on a built-in refrigerator?",
      "Why does a premium built-in refrigerator recover temperature slowly?",
      "Should sealed-system work be handled by a specialist?",
    ],
    internalLinks: [
      {
        label: "Thermador refrigerator repair",
        href: "/brands/thermador",
        description: "Brand page for Thermador built-in repair topics.",
        kind: "brand",
      },
      {
        label: "Sealed system repair",
        href: "/services/sealed-system-repair",
        description: "Service page for compressor and refrigerant issues.",
        kind: "service",
      },
      {
        label: "Katy refrigerator repair",
        href: "/locations/katy",
        description: "West Houston service area page.",
        kind: "location",
      },
    ],
  },
  {
    slug: "scotsman-ice-machine-repair-richmond",
    title: "Scotsman ice machine repair in Richmond",
    location: "Richmond",
    city: "Richmond",
    serviceArea: "Fort Bend County",
    zipCode: "77406",
    applianceType: "Undercounter ice machine",
    brand: "Scotsman",
    service: "Ice machine repair",
    symptom: "Low ice production and cloudy cubes",
    issue:
      "The ice machine produced fewer cubes than expected and showed signs of scale buildup affecting clear ice quality.",
    diagnosis:
      "The public diagnostic summary covers water supply checks, filter condition, scale buildup, bin sensor behavior, pump operation, and cleaning needs.",
    resolution:
      "The public repair summary explains cleaning-related service, water flow verification, sensor checks, and production testing without exposing customer details.",
    photoPlaceholders: [
      {
        label: "Ice machine label",
        description: "Public-safe placeholder for model identification.",
      },
      {
        label: "Ice bin area",
        description: "Public-safe placeholder for bin and sensor inspection.",
      },
      {
        label: "Water system",
        description: "Public-safe placeholder for filter and supply checks.",
      },
    ],
    faqIdeas: [
      "Why does a Scotsman ice machine stop making clear ice?",
      "Can scale buildup reduce ice production?",
      "How often should an undercounter ice machine be cleaned?",
    ],
    internalLinks: [
      {
        label: "Scotsman ice machine repair",
        href: "/brands/scotsman",
        description: "Brand page for clear ice machine repair topics.",
        kind: "brand",
      },
      {
        label: "Ice machine repair",
        href: "/services/ice-machine-repair",
        description: "Service page for residential ice machine issues.",
        kind: "service",
      },
      {
        label: "Richmond refrigerator repair",
        href: "/locations/richmond",
        description: "Fort Bend County service area page.",
        kind: "location",
      },
    ],
  },
  {
    slug: "whirlpool-ice-maker-leak-repair-heights",
    title: "Whirlpool ice maker leak repair near Houston Heights",
    location: "Houston Heights",
    city: "Houston",
    serviceArea: "The Heights",
    zipCode: "77008",
    applianceType: "French door refrigerator",
    brand: "Whirlpool",
    service: "Ice maker repair",
    symptom: "Water leaking after ice maker fill cycle",
    issue:
      "Water appeared beneath the refrigerator after an ice maker fill cycle and filter change.",
    diagnosis:
      "Public content can discuss filter seating, inlet valve behavior, water line checks, and fill tube inspection.",
    resolution:
      "The case page keeps the summary technical and location-safe while preparing a future AI-generated article structure.",
    photoPlaceholders: [
      {
        label: "Filter housing",
        description: "Public-safe placeholder for leak-area documentation.",
      },
      {
        label: "Supply connection",
        description: "Public-safe placeholder for water line checks.",
      },
      {
        label: "Fill cycle test",
        description: "Public-safe placeholder for post-repair leak verification.",
      },
    ],
    faqIdeas: [
      "Why would an ice maker leak after a filter change?",
      "Can a filter housing gasket cause water under a refrigerator?",
      "What should be checked during ice maker leak repair?",
    ],
    internalLinks: [
      {
        label: "Whirlpool refrigerator repair",
        href: "/brands/whirlpool",
        description: "Brand page for Whirlpool leak and ice maker issues.",
        kind: "brand",
      },
      {
        label: "Ice maker repair",
        href: "/services/ice-maker-repair",
        description: "Service page for refrigerator ice maker concerns.",
        kind: "service",
      },
      {
        label: "Houston refrigerator repair",
        href: "/locations/houston",
        description: "Houston MVP service area page.",
        kind: "location",
      },
    ],
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

export const publicTechnicianPreviews: TechnicianProfilePreview[] = [
  {
    slug: "marisol-reyes",
    name: "Marisol Reyes",
    role: "Refrigeration technician preview",
    serviceArea: "Houston Heights and central Houston",
    city: "Houston",
    zipCodes: ["77007", "77008", "77002", "77043"],
    specialties: ["Ice maker repair", "Water leaks", "French door refrigerators"],
    summary:
      "Mock technician profile preview for future public trust pages and technician-specific repair content.",
    verificationStatus: "Verified Technician",
    rating: "4.9 mock rating",
    responseTime: "Same-day response window",
    completedRepairs: 148,
    yearsExperience: 7,
    badges: ["Verified Technician", "Fast Response", "Ice Maker Specialist"],
    brandFocus: ["Whirlpool", "Samsung", "KitchenAid"],
    repairCaseSlugs: [
      "whirlpool-ice-maker-leak-repair-heights",
      "samsung-refrigerator-cooling-issue-sugar-land",
    ],
  },
  {
    slug: "andre-lewis",
    name: "Andre Lewis",
    role: "Sealed-system technician preview",
    serviceArea: "Houston, Midtown, and Memorial",
    city: "Houston",
    zipCodes: ["77002", "77024", "77056", "77079", "77043"],
    specialties: ["Compressor diagnostics", "Sealed systems", "Built-in refrigerators"],
    summary:
      "Mock technician profile preview for future sealed-system service pages, repair case attribution, and trust content.",
    verificationStatus: "Verified Technician",
    rating: "5.0 mock rating",
    responseTime: "Priority diagnostic window",
    completedRepairs: 212,
    yearsExperience: 11,
    badges: ["Verified Technician", "Sealed System Specialist", "High-End Refrigeration"],
    brandFocus: ["LG", "Sub-Zero", "Thermador"],
    repairCaseSlugs: [
      "lg-compressor-replacement-midtown-houston",
      "sub-zero-built-in-refrigerator-not-cooling-houston",
    ],
  },
  {
    slug: "nina-patel",
    name: "Nina Patel",
    role: "Premium appliance technician preview",
    serviceArea: "Katy, Richmond, and Sugar Land",
    city: "Katy",
    zipCodes: ["77494", "77406", "77479", "77441"],
    specialties: ["Sub-Zero", "Thermador", "Scotsman ice machines"],
    summary:
      "Mock technician profile preview for future brand-focused public pages and local service-area expansion.",
    verificationStatus: "Verified Technician",
    rating: "4.8 mock rating",
    responseTime: "Next available premium-service window",
    completedRepairs: 176,
    yearsExperience: 9,
    badges: ["Verified Technician", "High-End Refrigeration", "Sealed System Specialist"],
    brandFocus: ["Sub-Zero", "Thermador", "Scotsman"],
    repairCaseSlugs: [
      "thermador-built-in-sealed-system-issue-katy",
      "scotsman-ice-machine-repair-richmond",
    ],
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

export function getPublicRepairCases() {
  return publicRepairCases;
}

export function findPublicRepairCase(slug: string) {
  return publicRepairCases.find((repairCase) => repairCase.slug === slug);
}

export function getPublicRepairCaseBySlug(slug: string) {
  return findPublicRepairCase(slug);
}

export function getCasesByBrand(brand: string) {
  return publicRepairCases.filter(
    (repairCase) => repairCase.brand.toLowerCase() === brand.toLowerCase(),
  );
}

export function getCasesByLocation(location: string) {
  const normalizedLocation = location.toLowerCase();

  return publicRepairCases.filter((repairCase) => {
    const caseLocations = [
      repairCase.location,
      repairCase.city,
      repairCase.serviceArea,
      repairCase.zipCode,
    ].filter((value): value is string => Boolean(value));

    return caseLocations.some((value) => value.toLowerCase() === normalizedLocation);
  });
}

export function getCasesByService(service: string) {
  return publicRepairCases.filter(
    (repairCase) => repairCase.service.toLowerCase() === service.toLowerCase(),
  );
}

export function getPublicTechnicians() {
  return publicTechnicianPreviews;
}

export function getPublicTechnicianBySlug(slug: string) {
  return publicTechnicianPreviews.find((technician) => technician.slug === slug);
}

export function getRepairCasesForTechnician(slug: string) {
  const technician = getPublicTechnicianBySlug(slug);

  if (!technician?.repairCaseSlugs) {
    return [];
  }

  return technician.repairCaseSlugs
    .map((repairCaseSlug) => getPublicRepairCaseBySlug(repairCaseSlug))
    .filter((repairCase): repairCase is PublicRepairCase => Boolean(repairCase));
}

export function getTechniciansByZip(zipCode: string) {
  const normalizedZip = zipCode.trim();

  if (!normalizedZip) {
    return publicTechnicianPreviews;
  }

  return publicTechnicianPreviews.filter((technician) =>
    technician.zipCodes?.includes(normalizedZip),
  );
}

export function getTechniciansByService(service: string, technicians = publicTechnicianPreviews) {
  if (!service || service === "Any service") {
    return technicians;
  }

  const normalizedService = service.toLowerCase();

  return technicians.filter((technician) =>
    [...technician.specialties, ...(technician.brandFocus ?? [])].some((item) => {
      const normalizedItem = item.toLowerCase();

      return (
        normalizedItem.includes(normalizedService) ||
        normalizedService.includes(normalizedItem) ||
        (normalizedService.includes("built-in") && normalizedItem.includes("built-in")) ||
        (normalizedService.includes("sealed") && normalizedItem.includes("sealed")) ||
        (normalizedService.includes("ice machine") && normalizedItem.includes("scotsman")) ||
        (normalizedService.includes("refrigerator") && normalizedItem.includes("refrigerator"))
      );
    }),
  );
}

export function getTechniciansBySpecialty(
  specialty: string,
  technicians = publicTechnicianPreviews,
) {
  if (!specialty || specialty === "Any brand or specialty") {
    return technicians;
  }

  const normalizedSpecialty = specialty.toLowerCase();

  return technicians.filter((technician) =>
    [...technician.specialties, ...(technician.brandFocus ?? [])].some((item) =>
      item.toLowerCase().includes(normalizedSpecialty),
    ),
  );
}
