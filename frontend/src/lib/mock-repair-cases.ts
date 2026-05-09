import type { RepairCase } from "@/types/repair-case";

export const mockRepairCases: RepairCase[] = [
  {
    id: "1",
    caseNumber: "WRR-1042",
    location: {
      label: "Memorial home",
      city: "Houston",
      zipCode: "77024",
      neighborhood: "Memorial",
    },
    appliance: {
      brand: "Sub-Zero",
      modelNumber: "BI-36UFD",
      serialNumber: "SZ18492073",
    },
    labelExtraction: {
      detectedBrand: "Sub-Zero",
      detectedModelNumber: "BI-36UFD",
      detectedSerialNumber: "SZ18492073",
      confidence: "Mock 94%",
    },
    issueDescription:
      "Built-in refrigerator is running but not cooling consistently. Job notes mention rising fresh-food temperatures and food spoilage risk.",
    technicianFindings:
      "Verified condenser fan operation, inspected coils, checked door gasket seal, and tested compressor start components. Start relay showed intermittent failure under load.",
    partsUsed: [
      {
        name: "Compressor start relay",
        partNumber: "4202260",
        quantity: 1,
      },
    ],
    repairSummary:
      "Replaced failed start relay, cleaned condenser area, verified compressor startup, and confirmed stable cooling cycle before leaving the site.",
    repairStatus: "Needs review",
    repairStatusTone: "amber",
    estimatedRepairCost: 425,
    technician: "Unassigned",
    photos: [
      {
        label: "Appliance label",
        description: "Model and serial label placeholder.",
      },
      {
        label: "Failed relay",
        description: "Part condition photo placeholder.",
      },
      {
        label: "Completed repair",
        description: "Post-repair temperature check placeholder.",
      },
    ],
    seoPreview: {
      title: "Sub-Zero refrigerator not cooling in Houston",
      description:
        "A Houston repair case covering symptoms, diagnosis, relay replacement, and cooling verification for a built-in Sub-Zero refrigerator.",
      slug: "/houston-sub-zero-refrigerator-not-cooling",
      audience: "Houston homeowners",
      status: "Draft preview",
    },
  },
  {
    id: "2",
    caseNumber: "WRR-1041",
    location: {
      label: "Heights bungalow",
      city: "Houston",
      zipCode: "77008",
      neighborhood: "The Heights",
    },
    appliance: {
      brand: "Whirlpool",
      modelNumber: "WRF555SDFZ",
      serialNumber: "WH78214590",
    },
    labelExtraction: {
      detectedBrand: "Whirlpool",
      detectedModelNumber: "WRF555SDFZ",
      detectedSerialNumber: "WH78214590",
      confidence: "Mock 91%",
    },
    issueDescription:
      "Ice maker began leaking after a filter change. Job notes mention water collecting under the refrigerator overnight.",
    technicianFindings:
      "Inspected filter housing, inlet valve, supply line, and ice maker fill tube. Found filter not seated fully and inlet fitting damp under pressure.",
    partsUsed: [
      {
        name: "Water filter housing gasket",
        partNumber: "W11162041",
        quantity: 1,
      },
    ],
    repairSummary:
      "Reseated filter, replaced worn gasket, tested inlet pressure, and confirmed no active leak during ice maker fill cycle.",
    repairStatus: "In progress",
    repairStatusTone: "cyan",
    estimatedRepairCost: 215,
    technician: "Marisol Reyes",
    photos: [
      {
        label: "Filter housing",
        description: "Leak area placeholder.",
      },
      {
        label: "Supply connection",
        description: "Water line placeholder.",
      },
      {
        label: "Completed test",
        description: "Fill-cycle verification placeholder.",
      },
    ],
    seoPreview: {
      title: "Whirlpool ice maker leak repair in Houston Heights",
      description:
        "A Houston Heights refrigerator repair case covering filter seating, gasket replacement, and leak testing.",
      slug: "/houston-heights-whirlpool-ice-maker-leak",
      audience: "Houston homeowners",
      status: "Draft preview",
    },
  },
  {
    id: "3",
    caseNumber: "WRR-1040",
    location: {
      label: "Midtown condo",
      city: "Houston",
      zipCode: "77002",
      neighborhood: "Midtown",
    },
    appliance: {
      brand: "LG",
      modelNumber: "LFXS26973S",
      serialNumber: "LG90422716",
    },
    labelExtraction: {
      detectedBrand: "LG",
      detectedModelNumber: "LFXS26973S",
      detectedSerialNumber: "LG90422716",
      confidence: "Mock 88%",
    },
    issueDescription:
      "Job notes mention compressor noise, warm freezer temperatures, and inconsistent ice production over the previous week.",
    technicianFindings:
      "Checked evaporator frost pattern, condenser airflow, control board faults, and compressor operation. Compressor noise remained elevated after reset.",
    partsUsed: [],
    repairSummary:
      "Documented compressor concern, advised on repair versus replacement options, and prepared article draft notes for review.",
    repairStatus: "Article draft",
    repairStatusTone: "emerald",
    estimatedRepairCost: 680,
    technician: "Andre Lewis",
    photos: [
      {
        label: "Appliance label",
        description: "Model and serial placeholder.",
      },
      {
        label: "Freezer interior",
        description: "Frost pattern placeholder.",
      },
      {
        label: "Condenser area",
        description: "Airflow inspection placeholder.",
      },
    ],
    seoPreview: {
      title: "LG refrigerator compressor noise and warm freezer in Houston",
      description:
        "A Midtown Houston refrigerator repair case covering compressor noise, freezer temperature concerns, and technician findings.",
      slug: "/houston-lg-refrigerator-compressor-noise",
      audience: "Houston condo owners",
      status: "Article draft",
    },
  },
];

export function getRepairCaseById(id: string) {
  return mockRepairCases.find((repairCase) => repairCase.id === id);
}
