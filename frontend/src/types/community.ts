export type CommunityDiscussionStatus = "open" | "in_discussion" | "solved" | "archived";

export type CommunityDiscussionPriority = "normal" | "urgent" | "expert_needed";

export type CommunityLanguage = "en" | "es" | "ru" | "uk";

export type CommunityVisibility = "private_technicians_only";

export type CommunityAiSummaryStatus = "not_ready" | "draft_available" | "approved";

export type KnowledgeCaseVisibility = "private_knowledge_base";

export type KnowledgeConfidenceLevel = "low" | "medium" | "high";

export type CommunityDiscussion = {
  id: string;
  title: string;
  applianceType: string;
  brand: string;
  modelNumber?: string;
  symptom: string;
  status: CommunityDiscussionStatus;
  priority: CommunityDiscussionPriority;
  language: CommunityLanguage;
  createdAt: string;
  updatedAt: string;
  createdByTechnicianName: string;
  createdByTechnicianRole: string;
  serviceArea?: string;
  messageCount: number;
  helpfulCount: number;
  tags: string[];
  visibility: CommunityVisibility;
  aiSummaryStatus: CommunityAiSummaryStatus;
  finalRootCause?: string;
  finalFix?: string;
};

export type CommunityMessage = {
  id: string;
  discussionId: string;
  technicianName: string;
  technicianRole: string;
  language: CommunityLanguage;
  message: string;
  createdAt: string;
  isAcceptedAnswer?: boolean;
  translatedPreview?: string;
};

export type CommunityKnowledgeCase = {
  id: string;
  sourceDiscussionId: string;
  title: string;
  applianceType: string;
  brand: string;
  modelNumber?: string;
  symptomSummary: string;
  diagnosticSteps: string[];
  falseLeads: string[];
  confirmedRootCause: string;
  finalFix: string;
  partsUsed: string[];
  confidenceLevel: KnowledgeConfidenceLevel;
  visibility: KnowledgeCaseVisibility;
  languageOriginal: CommunityLanguage;
  normalizedLanguage: "en";
  createdAt: string;
};

export type CommunityFilters = {
  brand: string;
  applianceType: string;
  status: "All statuses" | CommunityDiscussionStatus;
  language: "All languages" | CommunityLanguage;
  priority: "All priorities" | CommunityDiscussionPriority;
};
