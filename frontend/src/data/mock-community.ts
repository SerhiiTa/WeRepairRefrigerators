import type {
  CommunityDiscussion,
  CommunityFilters,
  CommunityKnowledgeCase,
  CommunityMessage,
} from "@/types/community";

export const mockCommunityDiscussions: CommunityDiscussion[] = [
  {
    id: "community-discussion-001",
    title: "Sub-Zero 650 fresh-food section warm after condenser cleaning",
    applianceType: "Built-in refrigerator",
    brand: "Sub-Zero",
    modelNumber: "650/S",
    symptom: "Fresh-food compartment climbs to 52F while freezer stays near set point.",
    status: "in_discussion",
    priority: "expert_needed",
    language: "en",
    createdAt: "2026-05-10T14:20:00.000Z",
    updatedAt: "2026-05-11T08:35:00.000Z",
    createdByTechnicianName: "Andre Lewis",
    createdByTechnicianRole: "Sealed-system technician",
    serviceArea: "Memorial",
    messageCount: 8,
    helpfulCount: 12,
    tags: ["sealed-system", "built-in", "airflow", "premium"],
    visibility: "private_technicians_only",
    aiSummaryStatus: "draft_available",
    finalRootCause: "Likely partial restriction after confirming clean condenser airflow.",
    finalFix: "Continue sealed-system diagnostics before quoting parts.",
  },
  {
    id: "community-discussion-002",
    title: "LG linear compressor replacement callback pattern",
    applianceType: "French door refrigerator",
    brand: "LG",
    modelNumber: "LFXS26973",
    symptom: "Compressor starts, cabinet cools briefly, then temperature rises again overnight.",
    status: "open",
    priority: "urgent",
    language: "es",
    createdAt: "2026-05-11T07:50:00.000Z",
    updatedAt: "2026-05-11T09:18:00.000Z",
    createdByTechnicianName: "Marisol Reyes",
    createdByTechnicianRole: "Refrigeration technician",
    serviceArea: "Houston Heights",
    messageCount: 5,
    helpfulCount: 7,
    tags: ["compressor", "callback", "controls", "lg"],
    visibility: "private_technicians_only",
    aiSummaryStatus: "not_ready",
  },
  {
    id: "community-discussion-003",
    title: "Scotsman undercounter unit makes cloudy ice after cleaning",
    applianceType: "Ice machine",
    brand: "Scotsman",
    modelNumber: "CU50",
    symptom: "Ice production resumed, but cubes are cloudy and smaller than expected.",
    status: "solved",
    priority: "normal",
    language: "uk",
    createdAt: "2026-05-08T16:25:00.000Z",
    updatedAt: "2026-05-10T13:05:00.000Z",
    createdByTechnicianName: "Nina Patel",
    createdByTechnicianRole: "Premium appliance technician",
    serviceArea: "Richmond",
    messageCount: 11,
    helpfulCount: 19,
    tags: ["ice-machine", "water-quality", "cleaning", "pump"],
    visibility: "private_technicians_only",
    aiSummaryStatus: "approved",
    finalRootCause: "Restricted water flow through inlet screen after scale cleaning.",
    finalFix: "Cleaned inlet screen, verified water flow, and reset harvest timing.",
  },
  {
    id: "community-discussion-004",
    title: "Thermador column refrigerator fan noise after control reset",
    applianceType: "Column refrigerator",
    brand: "Thermador",
    modelNumber: "T30IR900SP",
    symptom: "Evaporator fan ramps loudly after reset and temperature recovery is slow.",
    status: "archived",
    priority: "normal",
    language: "ru",
    createdAt: "2026-05-05T10:10:00.000Z",
    updatedAt: "2026-05-07T17:45:00.000Z",
    createdByTechnicianName: "Andre Lewis",
    createdByTechnicianRole: "Sealed-system technician",
    serviceArea: "Katy",
    messageCount: 6,
    helpfulCount: 10,
    tags: ["thermador", "fan", "controls", "built-in"],
    visibility: "private_technicians_only",
    aiSummaryStatus: "approved",
    finalRootCause: "Fan blade rub caused by ice buildup after door gasket leak.",
    finalFix: "Cleared ice, reseated gasket, and verified fan clearance.",
  },
];

export const mockCommunityMessages: CommunityMessage[] = [
  {
    id: "community-message-001",
    discussionId: "community-discussion-001",
    technicianName: "Andre Lewis",
    technicianRole: "Sealed-system technician",
    language: "en",
    message:
      "Condenser is clean and fans are moving air. I am seeing freezer recovery but weak fresh-food pull-down.",
    createdAt: "2026-05-10T14:25:00.000Z",
  },
  {
    id: "community-message-002",
    discussionId: "community-discussion-001",
    technicianName: "Nina Patel",
    technicianRole: "Premium appliance technician",
    language: "en",
    message:
      "Check the evaporator pattern before quoting sealed-system work. I have seen this present like airflow when the pattern is partial.",
    createdAt: "2026-05-10T15:05:00.000Z",
    isAcceptedAnswer: true,
  },
  {
    id: "community-message-003",
    discussionId: "community-discussion-002",
    technicianName: "Marisol Reyes",
    technicianRole: "Refrigeration technician",
    language: "es",
    message:
      "El compresor arranca, baja un poco la temperatura, pero en la mañana otra vez esta caliente.",
    createdAt: "2026-05-11T08:05:00.000Z",
    translatedPreview:
      "The compressor starts and drops the temperature slightly, but by morning the refrigerator is warm again.",
  },
  {
    id: "community-message-004",
    discussionId: "community-discussion-003",
    technicianName: "Nina Patel",
    technicianRole: "Premium appliance technician",
    language: "uk",
    message:
      "Після очищення вода проходила повільно. Фільтр на вході був частково забитий накипом.",
    createdAt: "2026-05-09T10:35:00.000Z",
    isAcceptedAnswer: true,
    translatedPreview:
      "After cleaning, water flow was slow. The inlet screen was partially blocked by scale.",
  },
  {
    id: "community-message-005",
    discussionId: "community-discussion-004",
    technicianName: "Andre Lewis",
    technicianRole: "Sealed-system technician",
    language: "ru",
    message:
      "После сброса управления вентилятор шумел из-за льда рядом с лопастью. Проблема была в уплотнителе двери.",
    createdAt: "2026-05-07T17:20:00.000Z",
    isAcceptedAnswer: true,
    translatedPreview:
      "After the control reset, the fan was noisy because ice was near the blade. The issue was the door gasket.",
  },
];

export const mockCommunityKnowledgeCases: CommunityKnowledgeCase[] = [
  {
    id: "knowledge-case-001",
    sourceDiscussionId: "community-discussion-003",
    title: "Scotsman CU50 cloudy ice after cleaning",
    applianceType: "Ice machine",
    brand: "Scotsman",
    modelNumber: "CU50",
    symptomSummary: "Cloudy, undersized cubes after cleaning and restart.",
    diagnosticSteps: [
      "Confirmed ice production resumed after cleaning.",
      "Checked water flow into reservoir.",
      "Inspected inlet screen for scale loosened during cleaning.",
      "Verified harvest timing after water flow correction.",
    ],
    falseLeads: ["Bin sensor fault", "Low room temperature", "Compressor short cycling"],
    confirmedRootCause: "Restricted inlet screen reduced water flow after scale cleaning.",
    finalFix: "Cleaned inlet screen, restored water flow, and verified clear cube formation.",
    partsUsed: ["No replacement parts", "Cleaning solution"],
    confidenceLevel: "high",
    visibility: "private_knowledge_base",
    languageOriginal: "uk",
    normalizedLanguage: "en",
    createdAt: "2026-05-10T13:20:00.000Z",
  },
  {
    id: "knowledge-case-002",
    sourceDiscussionId: "community-discussion-004",
    title: "Thermador column fan noise after reset",
    applianceType: "Column refrigerator",
    brand: "Thermador",
    modelNumber: "T30IR900SP",
    symptomSummary: "Loud evaporator fan ramp and slow temperature recovery after reset.",
    diagnosticSteps: [
      "Verified fan noise at evaporator compartment.",
      "Inspected fan blade clearance.",
      "Checked door gasket seating and frost path.",
      "Confirmed normal fan operation after defrost and gasket reseat.",
    ],
    falseLeads: ["Bad fan motor", "Control board failure"],
    confirmedRootCause: "Ice buildup near fan blade caused by a poorly seated door gasket.",
    finalFix: "Cleared ice, reseated gasket, and verified fan clearance during recovery.",
    partsUsed: ["No replacement parts"],
    confidenceLevel: "high",
    visibility: "private_knowledge_base",
    languageOriginal: "ru",
    normalizedLanguage: "en",
    createdAt: "2026-05-07T18:05:00.000Z",
  },
];

export function getCommunityDiscussions() {
  return mockCommunityDiscussions;
}

export function getCommunityDiscussionById(discussionId: string) {
  return mockCommunityDiscussions.find((discussion) => discussion.id === discussionId);
}

export function getCommunityMessagesByDiscussion(discussionId: string) {
  return mockCommunityMessages.filter((message) => message.discussionId === discussionId);
}

export function getCommunityKnowledgeCases() {
  return mockCommunityKnowledgeCases;
}

export function getKnowledgeCaseByDiscussion(discussionId: string) {
  return mockCommunityKnowledgeCases.find(
    (knowledgeCase) => knowledgeCase.sourceDiscussionId === discussionId,
  );
}

export function filterCommunityDiscussions(
  discussions: CommunityDiscussion[],
  filters: CommunityFilters,
) {
  return discussions.filter((discussion) => {
    const matchesBrand = filters.brand === "All brands" || discussion.brand === filters.brand;
    const matchesAppliance =
      filters.applianceType === "All appliances" ||
      discussion.applianceType === filters.applianceType;
    const matchesStatus =
      filters.status === "All statuses" || discussion.status === filters.status;
    const matchesLanguage =
      filters.language === "All languages" || discussion.language === filters.language;
    const matchesPriority =
      filters.priority === "All priorities" || discussion.priority === filters.priority;

    return (
      matchesBrand &&
      matchesAppliance &&
      matchesStatus &&
      matchesLanguage &&
      matchesPriority
    );
  });
}
