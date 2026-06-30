import { createDefaultSchedulingConfig, type CompanySchedulingConfig } from "./company-config";
import type { CompanyAvailabilityTechnicianInput } from "./company-availability";
import type { CustomerPreferredTimeWindow } from "./dispatcher-recommendations";
import type { SchedulingIntakeRequest } from "./scheduling-intake";
import type { TechnicianAvailabilityProfile } from "./availability-engine";

export type AvailabilityDevScenario = {
  id: string;
  label: string;
  requestedZipCode: string;
};

export type CompanySchedulingDevScenario = {
  id: string;
  label: string;
  requestedZipCode: string;
  requestedDate: string;
  now: Date;
  config: CompanySchedulingConfig;
};

export type DispatcherDevScenario = {
  id: string;
  label: string;
  requestedZipCode: string;
  requestedDate: string;
  preferredTimeWindow?: CustomerPreferredTimeWindow;
  emergency?: boolean;
  now: Date;
  config: CompanySchedulingConfig;
  technicians: CompanyAvailabilityTechnicianInput[];
};

export type OrchestratorDevScenario = {
  id: string;
  label: string;
  description: string;
  intake: SchedulingIntakeRequest;
  now: Date;
  config: CompanySchedulingConfig;
  technicians: CompanyAvailabilityTechnicianInput[];
};

const baseCompanyConfig: CompanySchedulingConfig = {
  ...createDefaultSchedulingConfig(),
  serviceArea: {
    allowedZipCodes: ["77494", "77449", "77084", "77095", "77064"],
    primaryZipCodes: ["77494", "77095"],
    secondaryZipCodes: ["77449", "77084", "77064"],
  },
};

export const schedulingDevCompanyConfig = baseCompanyConfig;

export const availabilityDevTechnicians: TechnicianAvailabilityProfile[] = [
  {
    technicianId: "tech-sergio",
    displayName: "Sergio Martinez",
    serviceArea: {
      primaryZipCode: "77494",
      zipCodes: ["77494", "77449", "77084", "77095"],
    },
    workBlocks: [
      {
        startsAt: "2026-06-01T14:00:00.000Z",
        endsAt: "2026-06-01T23:00:00.000Z",
        source: "manual",
        label: "Monday workday",
      },
    ],
    busyBlocks: [
      {
        startsAt: "2026-06-01T16:00:00.000Z",
        endsAt: "2026-06-01T17:30:00.000Z",
        source: "crm_appointment",
        label: "Compressor diagnosis",
      },
    ],
  },
  {
    technicianId: "tech-maya",
    displayName: "Maya Chen",
    serviceArea: {
      primaryZipCode: "77095",
      zipCodes: ["77095", "77064", "77433"],
    },
    workBlocks: [
      {
        startsAt: "2026-06-01T15:00:00.000Z",
        endsAt: "2026-06-01T22:00:00.000Z",
        source: "manual",
        label: "Monday workday",
      },
    ],
    busyBlocks: [
      {
        startsAt: "2026-06-01T18:00:00.000Z",
        endsAt: "2026-06-01T19:00:00.000Z",
        source: "crm_appointment",
        label: "Ice maker repair",
      },
      {
        startsAt: "2026-06-01T20:30:00.000Z",
        endsAt: "2026-06-01T21:30:00.000Z",
        source: "crm_appointment",
        label: "Built-in refrigerator callback",
      },
    ],
  },
  {
    technicianId: "tech-daniel",
    displayName: "Daniel Ortiz",
    serviceArea: {
      primaryZipCode: "77479",
      zipCodes: ["77479", "77478", "77459"],
    },
    workBlocks: [
      {
        startsAt: "2026-06-01T13:00:00.000Z",
        endsAt: "2026-06-01T21:00:00.000Z",
        source: "manual",
        label: "Monday workday",
      },
    ],
    busyBlocks: [
      {
        startsAt: "2026-06-01T14:00:00.000Z",
        endsAt: "2026-06-01T15:30:00.000Z",
        source: "crm_appointment",
        label: "Sealed system estimate",
      },
    ],
  },
];

export const availabilityDevScenarios: AvailabilityDevScenario[] = [
  {
    id: "multiple",
    label: "Multiple matching technicians",
    requestedZipCode: "77095",
  },
  {
    id: "single",
    label: "One matching technician",
    requestedZipCode: "77449",
  },
  {
    id: "none",
    label: "No matching technician",
    requestedZipCode: "77002",
  },
];

export const schedulingDevCompanyTechnicians: CompanyAvailabilityTechnicianInput[] = [
  {
    technicianId: "tech-sergio",
    displayName: "Sergio Martinez",
    primaryZipCode: "77494",
    serviceZipCodes: ["77494", "77449", "77084", "77095"],
    busyBlocks: [
      {
        startsAt: "2026-06-01T16:00:00.000Z",
        endsAt: "2026-06-01T17:30:00.000Z",
        source: "crm_appointment",
        label: "Compressor diagnosis",
      },
    ],
  },
  {
    technicianId: "tech-maya",
    displayName: "Maya Chen",
    primaryZipCode: "77095",
    serviceZipCodes: ["77095", "77064"],
    busyBlocks: [
      {
        startsAt: "2026-06-01T18:00:00.000Z",
        endsAt: "2026-06-01T19:00:00.000Z",
        source: "crm_appointment",
        label: "Ice maker repair",
      },
    ],
  },
];

const normalTechnicians = schedulingDevCompanyTechnicians;

const noSlotTechnicians: CompanyAvailabilityTechnicianInput[] = [
  {
    technicianId: "tech-sergio",
    displayName: "Sergio Martinez",
    primaryZipCode: "77494",
    serviceZipCodes: ["77494"],
    busyBlocks: [
      {
        startsAt: "2026-06-01T13:30:00.000Z",
        endsAt: "2026-06-01T23:30:00.000Z",
        source: "crm_appointment",
        label: "Fully booked route",
      },
    ],
  },
];

const weekendEnabledConfig: CompanySchedulingConfig = {
  ...baseCompanyConfig,
  businessHours: {
    ...baseCompanyConfig.businessHours,
    workingDays: [0, 1, 2, 3, 4, 5, 6],
  },
};

const afterCutoffConfig: CompanySchedulingConfig = {
  ...baseCompanyConfig,
  schedulingRules: {
    ...baseCompanyConfig.schedulingRules,
    sameDaySchedulingEnabled: true,
    sameDayCutoffTime: "12:00",
  },
};

const noSlotConfig: CompanySchedulingConfig = {
  ...baseCompanyConfig,
  businessHours: {
    ...baseCompanyConfig.businessHours,
    startTime: "08:00",
    endTime: "17:00",
  },
};

function createBaseIntake(
  overrides: Partial<SchedulingIntakeRequest> = {},
): SchedulingIntakeRequest {
  return {
    source: overrides.source ?? "phone_call",
    customer: {
      name: "Maria Lopez",
      phone: "+1 (713) 555-0198",
      email: "maria@example.com",
      ...overrides.customer,
    },
    service: {
      applianceType: "Refrigerator",
      brand: "LG",
      modelNumber: "LFXS26973S",
      issueDescription: "Refrigerator is warm but the freezer is still cooling.",
      ...overrides.service,
    },
    location: {
      streetAddress: "22110 Grand Corner Dr",
      city: "Katy",
      state: "TX",
      zipCode: "77494",
      ...overrides.location,
    },
    preferences: {
      requestedDate: "2026-06-01",
      preferredTimeWindow: "morning",
      emergency: false,
      ...overrides.preferences,
    },
  };
}

export const schedulingDevSampleIntake: SchedulingIntakeRequest = createBaseIntake({
  customer: {
    name: " Maria  Lopez ",
    phone: "+1 (713) 555-0198",
    email: " MARIA@example.COM ",
  },
  service: {
    applianceType: " Refrigerator ",
    brand: "LG",
    modelNumber: " lfxs26973s ",
    issueDescription: "Customer says the refrigerator is warm and the freezer is still cooling.",
  },
  location: {
    streetAddress: " 22110 Grand Corner Dr ",
    city: "Katy",
    state: "tx",
    zipCode: "77494-1234",
  },
});

export const companySchedulingDevScenarios: CompanySchedulingDevScenario[] = [
  {
    id: "normal",
    label: "Normal business hours with supported ZIP",
    requestedZipCode: "77095",
    requestedDate: "2026-06-01",
    now: new Date("2026-06-01T15:00:00.000Z"),
    config: baseCompanyConfig,
  },
  {
    id: "same-day-cutoff",
    label: "Same-day blocked by cutoff",
    requestedZipCode: "77494",
    requestedDate: "2026-06-01",
    now: new Date("2026-06-01T20:00:00.000Z"),
    config: afterCutoffConfig,
  },
  {
    id: "unsupported-zip",
    label: "Unsupported ZIP outside service area",
    requestedZipCode: "77002",
    requestedDate: "2026-06-01",
    now: new Date("2026-06-01T15:00:00.000Z"),
    config: baseCompanyConfig,
  },
  {
    id: "weekend-blocked",
    label: "Weekend blocked by business hours",
    requestedZipCode: "77494",
    requestedDate: "2026-06-07",
    now: new Date("2026-06-01T15:00:00.000Z"),
    config: baseCompanyConfig,
  },
];

export const dispatcherDevScenarios: DispatcherDevScenario[] = [
  {
    id: "same-day-normal",
    label: "Normal same-day availability",
    requestedZipCode: "77095",
    requestedDate: "2026-06-01",
    now: new Date("2026-06-01T15:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: normalTechnicians,
  },
  {
    id: "next-day",
    label: "Next-day recommendation",
    requestedZipCode: "77449",
    requestedDate: "2026-06-02",
    now: new Date("2026-06-01T20:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: normalTechnicians,
  },
  {
    id: "morning-preference",
    label: "Customer prefers morning",
    requestedZipCode: "77494",
    requestedDate: "2026-06-01",
    preferredTimeWindow: "morning",
    now: new Date("2026-06-01T14:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: normalTechnicians,
  },
  {
    id: "afternoon-preference",
    label: "Customer prefers afternoon",
    requestedZipCode: "77095",
    requestedDate: "2026-06-01",
    preferredTimeWindow: "afternoon",
    now: new Date("2026-06-01T14:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: normalTechnicians,
  },
  {
    id: "emergency",
    label: "Emergency request",
    requestedZipCode: "77095",
    requestedDate: "2026-06-01",
    emergency: true,
    now: new Date("2026-06-01T14:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: normalTechnicians,
  },
  {
    id: "unsupported-zip",
    label: "Unsupported ZIP",
    requestedZipCode: "77002",
    requestedDate: "2026-06-01",
    now: new Date("2026-06-01T14:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: normalTechnicians,
  },
  {
    id: "no-slots",
    label: "No available slots",
    requestedZipCode: "77494",
    requestedDate: "2026-06-01",
    now: new Date("2026-06-01T14:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: noSlotTechnicians,
  },
];

export const orchestratorDevScenarios: OrchestratorDevScenario[] = [
  {
    id: "phone-same-day",
    label: "Phone call, same-day availability",
    description: "Valid phone intake with same-day service area and available technicians.",
    intake: createBaseIntake(),
    now: new Date("2026-06-01T14:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: normalTechnicians,
  },
  {
    id: "website-next-day",
    label: "Website form, next-day availability",
    description: "Website intake prefers the next day and still returns a safe draft.",
    intake: createBaseIntake({
      source: "website_form",
      preferences: {
        requestedDate: "2026-06-02",
        preferredTimeWindow: "afternoon",
        emergency: false,
      },
    }),
    now: new Date("2026-06-01T20:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: normalTechnicians,
  },
  {
    id: "morning-preference",
    label: "Customer prefers morning",
    description: "Valid intake with a morning preference passed through the full pipeline.",
    intake: createBaseIntake({
      preferences: {
        requestedDate: "2026-06-01",
        preferredTimeWindow: "morning",
        emergency: false,
      },
    }),
    now: new Date("2026-06-01T14:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: normalTechnicians,
  },
  {
    id: "afternoon-preference",
    label: "Customer prefers afternoon",
    description: "Valid intake with afternoon preference and ranked backup options.",
    intake: createBaseIntake({
      location: {
        zipCode: "77095",
      },
      preferences: {
        requestedDate: "2026-06-01",
        preferredTimeWindow: "afternoon",
        emergency: false,
      },
    }),
    now: new Date("2026-06-01T14:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: normalTechnicians,
  },
  {
    id: "emergency",
    label: "Emergency request",
    description: "Emergency flag carries into response drafting without promising emergency service.",
    intake: createBaseIntake({
      source: "sms",
      preferences: {
        requestedDate: "2026-06-01",
        preferredTimeWindow: "afternoon",
        emergency: true,
      },
    }),
    now: new Date("2026-06-01T14:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: normalTechnicians,
  },
  {
    id: "unsupported-zip",
    label: "Unsupported ZIP",
    description: "Valid intake in a ZIP outside company service area returns no availability.",
    intake: createBaseIntake({
      location: {
        city: "Houston",
        zipCode: "77002",
      },
    }),
    now: new Date("2026-06-01T14:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: normalTechnicians,
  },
  {
    id: "missing-zip",
    label: "Missing ZIP validation failure",
    description: "Missing ZIP stops before availability because the intake is not schedulable.",
    intake: createBaseIntake({
      location: {
        zipCode: "",
      },
    }),
    now: new Date("2026-06-01T14:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: normalTechnicians,
  },
  {
    id: "missing-service-warning",
    label: "Missing brand warning",
    description: "Missing brand stays partial but can still produce a safe response draft.",
    intake: createBaseIntake({
      service: {
        brand: "",
      },
    }),
    now: new Date("2026-06-01T14:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: normalTechnicians,
  },
  {
    id: "missing-service-failure",
    label: "Missing appliance failure",
    description: "Missing appliance and issue details stop before recommendation generation.",
    intake: createBaseIntake({
      service: {
        applianceType: "",
        issueDescription: "",
      },
    }),
    now: new Date("2026-06-01T14:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: normalTechnicians,
  },
  {
    id: "no-slots",
    label: "No available slots",
    description: "Supported ZIP and valid intake, but technician schedule is fully blocked.",
    intake: createBaseIntake({
      preferences: {
        requestedDate: "2026-06-01",
        preferredTimeWindow: "afternoon",
        emergency: false,
      },
    }),
    now: new Date("2026-06-01T14:00:00.000Z"),
    config: noSlotConfig,
    technicians: noSlotTechnicians,
  },
  {
    id: "weekend-blocked",
    label: "Weekend blocked by company rules",
    description: "Valid weekend intake is blocked by company working-day policy.",
    intake: createBaseIntake({
      preferences: {
        requestedDate: "2026-06-07",
        preferredTimeWindow: "morning",
        emergency: false,
      },
    }),
    now: new Date("2026-06-01T14:00:00.000Z"),
    config: baseCompanyConfig,
    technicians: normalTechnicians,
  },
  {
    id: "weekend-enabled",
    label: "Weekend enabled by policy",
    description: "Same weekend request succeeds when company config explicitly includes weekends.",
    intake: createBaseIntake({
      preferences: {
        requestedDate: "2026-06-07",
        preferredTimeWindow: "morning",
        emergency: false,
      },
    }),
    now: new Date("2026-06-01T14:00:00.000Z"),
    config: weekendEnabledConfig,
    technicians: normalTechnicians,
  },
  {
    id: "same-day-cutoff",
    label: "Same-day blocked by cutoff",
    description: "Valid same-day request after company cutoff returns no availability.",
    intake: createBaseIntake({
      preferences: {
        requestedDate: "2026-06-01",
        preferredTimeWindow: "late_afternoon",
        emergency: false,
      },
    }),
    now: new Date("2026-06-01T20:00:00.000Z"),
    config: afterCutoffConfig,
    technicians: normalTechnicians,
  },
];
