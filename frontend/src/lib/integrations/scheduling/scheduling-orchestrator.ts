import {
  generateCompanyAvailabilityResponse,
  type CompanyAvailabilityTechnicianInput,
  type CompanyConfiguredAvailabilityResponse,
} from "./company-availability";
import {
  validateSchedulingConfig,
  type CompanySchedulingConfig,
} from "./company-config";
import {
  generateDispatcherRecommendationResponse,
  type DispatcherRecommendationResponse,
} from "./dispatcher-recommendations";
import {
  buildDispatcherSchedulingResponse,
  type DispatcherResponseResult,
} from "./dispatcher-response-builder";
import {
  normalizeSchedulingIntake,
  validateSchedulingIntake,
  type NormalizedSchedulingIntake,
  type SchedulingIntakeRequest,
  type SchedulingIntakeValidationResult,
} from "./scheduling-intake";

export type SchedulingOrchestratorStatus =
  | "success"
  | "no_availability"
  | "validation_failed"
  | "partial";

export type SchedulingOrchestratorStep =
  | "normalize_intake"
  | "validate_intake"
  | "validate_company_config"
  | "generate_availability"
  | "generate_recommendations"
  | "build_response_draft";

export type SchedulingOrchestratorWarning = {
  step: SchedulingOrchestratorStep;
  message: string;
};

export type SchedulingOrchestratorError = {
  step: SchedulingOrchestratorStep;
  message: string;
};

export type SchedulingOrchestratorRequest = {
  intake: SchedulingIntakeRequest;
  companyConfig: CompanySchedulingConfig;
  technicians: CompanyAvailabilityTechnicianInput[];
  maxRecommendations?: number;
  maxSlotsPerTechnician?: number;
  maxCandidates?: number;
  companyDisplayName?: string;
  showTechnicianDisplayName?: boolean;
  now?: Date;
};

export type SchedulingOrchestratorResult = {
  status: SchedulingOrchestratorStatus;
  normalizedIntake: NormalizedSchedulingIntake;
  intakeValidation: SchedulingIntakeValidationResult;
  availabilityResponse: CompanyConfiguredAvailabilityResponse | null;
  recommendationResponse: DispatcherRecommendationResponse | null;
  responseDraft: DispatcherResponseResult | null;
  completedSteps: SchedulingOrchestratorStep[];
  failedSteps: SchedulingOrchestratorStep[];
  skippedSteps: SchedulingOrchestratorStep[];
  warnings: SchedulingOrchestratorWarning[];
  errors: SchedulingOrchestratorError[];
};

const orchestratorSteps: SchedulingOrchestratorStep[] = [
  "normalize_intake",
  "validate_intake",
  "validate_company_config",
  "generate_availability",
  "generate_recommendations",
  "build_response_draft",
];

function getDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function collectOrchestratorWarnings(
  intakeValidation: SchedulingIntakeValidationResult,
): SchedulingOrchestratorWarning[] {
  return intakeValidation.warnings.map((message) => ({
    step: "validate_intake",
    message,
  }));
}

export function collectOrchestratorErrors(
  intakeValidation: SchedulingIntakeValidationResult,
  companyConfigErrors: string[],
): SchedulingOrchestratorError[] {
  return [
    ...intakeValidation.errors.map((message) => ({
      step: "validate_intake" as const,
      message,
    })),
    ...companyConfigErrors.map((message) => ({
      step: "validate_company_config" as const,
      message,
    })),
  ];
}

export function buildOrchestratorStatus(
  errors: SchedulingOrchestratorError[],
  warnings: SchedulingOrchestratorWarning[],
  recommendationResponse: DispatcherRecommendationResponse | null,
  responseDraft: DispatcherResponseResult | null,
): SchedulingOrchestratorStatus {
  if (errors.length > 0) {
    return "validation_failed";
  }

  if (!recommendationResponse?.bestRecommendation) {
    return "no_availability";
  }

  if (warnings.length > 0 || responseDraft?.noAvailabilityReason) {
    return "partial";
  }

  return "success";
}

/**
 * Provider-free scheduling pipeline for future AI Dispatcher call intake, SMS
 * replies, website forms, CRM booking, and calendar confirmation flows. It does
 * not store data, book appointments, send messages, call providers, or expose
 * internal ranking details in customer-facing text.
 */
export function runSchedulingOrchestrator(
  request: SchedulingOrchestratorRequest,
): SchedulingOrchestratorResult {
  const completedSteps: SchedulingOrchestratorStep[] = ["normalize_intake"];
  const failedSteps: SchedulingOrchestratorStep[] = [];
  const normalizedIntake = normalizeSchedulingIntake(request.intake);
  const intakeValidation = validateSchedulingIntake(request.intake);
  completedSteps.push("validate_intake");

  const configValidation = validateSchedulingConfig(request.companyConfig);
  completedSteps.push("validate_company_config");

  const warnings = collectOrchestratorWarnings(intakeValidation);
  const errors = collectOrchestratorErrors(
    intakeValidation,
    configValidation.errors,
  );

  if (errors.length > 0) {
    failedSteps.push(
      ...Array.from(new Set(errors.map((error) => error.step))),
    );

    return {
      status: "validation_failed",
      normalizedIntake,
      intakeValidation,
      availabilityResponse: null,
      recommendationResponse: null,
      responseDraft: null,
      completedSteps,
      failedSteps,
      skippedSteps: orchestratorSteps.filter(
        (step) => !completedSteps.includes(step) && !failedSteps.includes(step),
      ),
      warnings,
      errors,
    };
  }

  const requestedDate =
    normalizedIntake.preferences.requestedDate ?? getDateKey(request.now ?? new Date());
  const requestedZipCode = normalizedIntake.location.zipCode ?? "";
  const availabilityResponse = generateCompanyAvailabilityResponse({
    config: request.companyConfig,
    requestedZipCode,
    requestedDate,
    technicians: request.technicians,
    now: request.now,
    maxSlotsPerTechnician: request.maxSlotsPerTechnician,
    maxCandidates: request.maxCandidates,
  });
  completedSteps.push("generate_availability");

  const recommendationResponse = generateDispatcherRecommendationResponse({
    availability: availabilityResponse,
    requestedZipCode,
    requestedDate,
    preferredTimeWindow:
      normalizedIntake.preferences.preferredTimeWindow ?? undefined,
    emergency: normalizedIntake.preferences.emergency,
    maxRecommendations: request.maxRecommendations,
  });
  completedSteps.push("generate_recommendations");

  const responseDraft = buildDispatcherSchedulingResponse({
    recommendations: recommendationResponse,
    requestedZipCode,
    requestedDate,
    preferredTimeWindow:
      normalizedIntake.preferences.preferredTimeWindow ?? undefined,
    emergency: normalizedIntake.preferences.emergency,
    companyDisplayName: request.companyDisplayName,
    showTechnicianDisplayName: request.showTechnicianDisplayName,
    channel: "internal",
  });
  completedSteps.push("build_response_draft");

  const status = buildOrchestratorStatus(
    errors,
    warnings,
    recommendationResponse,
    responseDraft,
  );

  return {
    status,
    normalizedIntake,
    intakeValidation,
    availabilityResponse,
    recommendationResponse,
    responseDraft,
    completedSteps,
    failedSteps,
    skippedSteps: orchestratorSteps.filter(
      (step) => !completedSteps.includes(step) && !failedSteps.includes(step),
    ),
    warnings,
    errors,
  };
}
