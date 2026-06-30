"use client";

import { useMemo, useState } from "react";

import {
  availabilityDevScenarios,
  availabilityDevTechnicians,
  buildAvailabilityRequestFromCompanyConfig,
  companySchedulingDevScenarios,
  dispatcherDevScenarios,
  buildDispatcherSchedulingResponse,
  filterTechniciansByZip,
  generateDispatcherRecommendationResponse,
  generateAvailabilityResponse,
  generateCompanyAvailabilityResponse,
  isSameDaySchedulingAllowed,
  isSchedulingDateAllowed,
  orchestratorDevScenarios,
  runSchedulingOrchestrator,
  schedulingDevCompanyTechnicians,
  schedulingDevSampleIntake,
  validateSchedulingIntake,
} from "@/lib/integrations/scheduling";

function formatTimeRange(startsAt: string, endsAt: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });

  return `${formatter.format(new Date(startsAt))} - ${formatter.format(new Date(endsAt))}`;
}

function DetailPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-300">
      {children}
    </span>
  );
}

export default function SchedulingEngineDiagnosticsPage() {
  const [scenarioId, setScenarioId] =
    useState<(typeof availabilityDevScenarios)[number]["id"]>("multiple");
  const [companyScenarioId, setCompanyScenarioId] =
    useState<(typeof companySchedulingDevScenarios)[number]["id"]>("normal");
  const [dispatcherScenarioId, setDispatcherScenarioId] =
    useState<(typeof dispatcherDevScenarios)[number]["id"]>("same-day-normal");
  const [orchestratorScenarioId, setOrchestratorScenarioId] =
    useState<(typeof orchestratorDevScenarios)[number]["id"]>("phone-same-day");
  const scenario =
    availabilityDevScenarios.find((item) => item.id === scenarioId) ??
    availabilityDevScenarios[0];
  const companyScenario =
    companySchedulingDevScenarios.find((item) => item.id === companyScenarioId) ??
    companySchedulingDevScenarios[0];
  const dispatcherScenario =
    dispatcherDevScenarios.find((item) => item.id === dispatcherScenarioId) ??
    dispatcherDevScenarios[0];
  const orchestratorScenario =
    orchestratorDevScenarios.find((item) => item.id === orchestratorScenarioId) ??
    orchestratorDevScenarios[0];

  const response = useMemo(
    () =>
      generateAvailabilityResponse({
        requestedZipCode: scenario.requestedZipCode,
        technicians: availabilityDevTechnicians,
        appointmentDuration: { minutes: 90 },
        travelBuffer: { beforeMinutes: 15, afterMinutes: 15 },
        slotStepMinutes: 30,
        maxSlotsPerTechnician: 4,
        maxCandidates: 8,
      }),
    [scenario.requestedZipCode],
  );

  const supportedTechnicians = useMemo(
    () => filterTechniciansByZip(availabilityDevTechnicians, scenario.requestedZipCode),
    [scenario.requestedZipCode],
  );
  const companyResponse = useMemo(
    () =>
      generateCompanyAvailabilityResponse({
        config: companyScenario.config,
        requestedZipCode: companyScenario.requestedZipCode,
        requestedDate: companyScenario.requestedDate,
        technicians: schedulingDevCompanyTechnicians,
        now: companyScenario.now,
        maxSlotsPerTechnician: 4,
        maxCandidates: 8,
      }),
    [companyScenario],
  );
  const companyBuiltRequest = useMemo(
    () =>
      buildAvailabilityRequestFromCompanyConfig({
        config: companyScenario.config,
        requestedZipCode: companyScenario.requestedZipCode,
        requestedDate: companyScenario.requestedDate,
        technicians: schedulingDevCompanyTechnicians,
        now: companyScenario.now,
        maxSlotsPerTechnician: 4,
        maxCandidates: 8,
      }),
    [companyScenario],
  );
  const companySameDayAllowed = isSameDaySchedulingAllowed(
    companyScenario.config,
    companyScenario.requestedDate,
    companyScenario.now,
  );
  const companyDateAllowed = isSchedulingDateAllowed(
    companyScenario.config,
    companyScenario.requestedDate,
    companyScenario.now,
  );
  const dispatcherAvailability = useMemo(
    () =>
      generateCompanyAvailabilityResponse({
        config: dispatcherScenario.config,
        requestedZipCode: dispatcherScenario.requestedZipCode,
        requestedDate: dispatcherScenario.requestedDate,
        technicians: dispatcherScenario.technicians,
        now: dispatcherScenario.now,
        maxSlotsPerTechnician: 4,
        maxCandidates: 8,
      }),
    [dispatcherScenario],
  );
  const dispatcherRecommendations = useMemo(
    () =>
      generateDispatcherRecommendationResponse({
        availability: dispatcherAvailability,
        requestedZipCode: dispatcherScenario.requestedZipCode,
        requestedDate: dispatcherScenario.requestedDate,
        preferredTimeWindow: dispatcherScenario.preferredTimeWindow,
        emergency: dispatcherScenario.emergency,
        maxRecommendations: 3,
      }),
    [dispatcherAvailability, dispatcherScenario],
  );
  const dispatcherResponse = useMemo(
    () =>
      buildDispatcherSchedulingResponse({
        recommendations: dispatcherRecommendations,
        requestedZipCode: dispatcherScenario.requestedZipCode,
        requestedDate: dispatcherScenario.requestedDate,
        preferredTimeWindow: dispatcherScenario.preferredTimeWindow,
        emergency: dispatcherScenario.emergency,
        companyDisplayName: "Refrigerator Houston Repair",
        showTechnicianDisplayName: false,
        channel: "phone",
        tone: "friendly",
      }),
    [dispatcherRecommendations, dispatcherScenario],
  );
  const intakeValidation = useMemo(
    () => validateSchedulingIntake(schedulingDevSampleIntake),
    [],
  );
  const orchestratorResult = useMemo(
    () =>
      runSchedulingOrchestrator({
        intake: orchestratorScenario.intake,
        companyConfig: orchestratorScenario.config,
        technicians: orchestratorScenario.technicians,
        now: orchestratorScenario.now,
        maxRecommendations: 3,
        maxSlotsPerTechnician: 4,
        maxCandidates: 8,
        companyDisplayName: "Refrigerator Houston Repair",
        showTechnicianDisplayName: false,
      }),
    [orchestratorScenario],
  );

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                Dev diagnostics
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-white">
                Scheduling Engine
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Provider-free availability check using static technicians,
                work blocks, busy blocks, travel buffers, and ZIP service areas.
                No Google Calendar, Maps, Supabase, CRM, or provider calls run
                on this page.
              </p>
            </div>

            <label className="flex min-w-64 flex-col gap-2 text-sm text-slate-300">
              Scenario
              <select
                value={scenarioId}
                onChange={(event) =>
                  setScenarioId(event.target.value as typeof scenarioId)
                }
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400"
              >
                {availabilityDevScenarios.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">
                Intake normalization
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                Scheduling Request Intake
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Static customer intake is normalized before future availability,
                recommendation, and response-builder steps. This is provider-free,
                storage-free, and does not create bookings or service requests.
              </p>
            </div>
            <DetailPill>{intakeValidation.valid ? "valid" : "needs review"}</DetailPill>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Customer
              </p>
              <p className="mt-3 font-semibold text-white">
                {intakeValidation.normalized.customer.name ?? "Unknown customer"}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {intakeValidation.normalized.customer.phone ?? "No phone"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {intakeValidation.normalized.customer.email ?? "No email"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Service
              </p>
              <p className="mt-3 font-semibold text-white">
                {intakeValidation.normalized.service.applianceType}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {intakeValidation.normalized.service.brand}{" "}
                {intakeValidation.normalized.service.modelNumber}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {intakeValidation.normalized.service.issueDescription}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Scheduling
              </p>
              <p className="mt-3 font-semibold text-white">
                ZIP {intakeValidation.normalized.location.zipCode}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {intakeValidation.normalized.preferences.requestedDate ?? "No date"} ·{" "}
                {intakeValidation.normalized.preferences.preferredTimeWindow ??
                  "No window"}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Source: {intakeValidation.normalized.source}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Validation errors
              </p>
              {intakeValidation.errors.length > 0 ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-rose-100">
                  {intakeValidation.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-400">
                  No blocking intake errors for this static scenario.
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Validation warnings
              </p>
              {intakeValidation.warnings.length > 0 ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-100">
                  {intakeValidation.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-400">
                  No warnings for this static scenario.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-300">
                Pipeline diagnostics
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                Scheduling Orchestrator
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Static intake, company policy, technician availability,
                recommendations, and safe response drafts are connected here
                without Supabase, providers, booking, AI, SMS, calls, or maps.
              </p>
            </div>
            <div className="flex min-w-72 flex-col gap-3">
              <DetailPill>{orchestratorResult.status}</DetailPill>
              <label className="flex flex-col gap-2 text-sm text-slate-300">
                Orchestrator scenario
                <select
                  value={orchestratorScenarioId}
                  onChange={(event) =>
                    setOrchestratorScenarioId(event.target.value)
                  }
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-fuchsia-400"
                >
                  {orchestratorDevScenarios.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Scenario
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">
              {orchestratorScenario.label}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {orchestratorScenario.description}
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Normalized intake
              </p>
              <p className="mt-3 font-semibold text-white">
                {orchestratorResult.normalizedIntake.customer.name ??
                  "Unknown customer"}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {orchestratorResult.normalizedIntake.customer.phone ?? "No phone"} ·{" "}
                {orchestratorResult.normalizedIntake.customer.email ?? "No email"}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Source: {orchestratorResult.normalizedIntake.source}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Location and service
              </p>
              <p className="mt-3 font-semibold text-white">
                ZIP {orchestratorResult.normalizedIntake.location.zipCode ?? "missing"}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {orchestratorResult.normalizedIntake.location.city ?? "No city"},{" "}
                {orchestratorResult.normalizedIntake.location.state ?? "No state"}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {orchestratorResult.normalizedIntake.service.applianceType ??
                  "No appliance"}{" "}
                · {orchestratorResult.normalizedIntake.service.brand ?? "No brand"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Preferences
              </p>
              <p className="mt-3 font-semibold text-white">
                {orchestratorResult.normalizedIntake.preferences.requestedDate ??
                  "No date"}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {orchestratorResult.normalizedIntake.preferences.preferredTimeWindow ??
                  "No preferred window"}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Emergency:{" "}
                {orchestratorResult.normalizedIntake.preferences.emergency
                  ? "yes"
                  : "no"}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Completed steps
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {orchestratorResult.completedSteps.map((step) => (
                  <DetailPill key={step}>{step}</DetailPill>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Skipped steps
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {orchestratorResult.skippedSteps.length > 0 ? (
                  orchestratorResult.skippedSteps.map((step) => (
                    <DetailPill key={step}>{step}</DetailPill>
                  ))
                ) : (
                  <DetailPill>none</DetailPill>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Failed steps
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {orchestratorResult.failedSteps.length > 0 ? (
                  orchestratorResult.failedSteps.map((step) => (
                    <DetailPill key={step}>{step}</DetailPill>
                  ))
                ) : (
                  <DetailPill>none</DetailPill>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Availability
              </p>
              <p className="mt-3 text-xl font-semibold text-white">
                {orchestratorResult.availabilityResponse?.candidates.length ?? 0} candidates
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {orchestratorResult.availabilityResponse?.techniciansSupportingZip ?? 0} supporting technicians
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Best recommendation
              </p>
              <p className="mt-3 font-semibold text-white">
                {orchestratorResult.recommendationResponse?.bestRecommendation
                  ?.customerWindowLabel ?? "No best option"}
              </p>
              <p className="mt-2 text-sm text-slate-400">
                {orchestratorResult.recommendationResponse?.bestRecommendation
                  ?.technicianDisplayName ??
                  orchestratorResult.recommendationResponse?.bestRecommendation
                    ?.technicianId ??
                  "No technician"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Backup recommendations
              </p>
              <p className="mt-3 text-xl font-semibold text-white">
                {orchestratorResult.recommendationResponse?.backupRecommendations.length ?? 0}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {orchestratorResult.recommendationResponse?.backupRecommendations
                  .slice(0, 3)
                  .map((recommendation) => (
                    <DetailPill
                      key={`${recommendation.technicianId}-${recommendation.startsAt}`}
                    >
                      {recommendation.timeWindowLabel}
                    </DetailPill>
                  ))}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Response draft
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-100">
                {orchestratorResult.responseDraft?.primaryResponseText ??
                  "No response draft generated."}
              </p>
              {orchestratorResult.responseDraft?.backupResponseText ? (
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {orchestratorResult.responseDraft.backupResponseText}
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Warnings and errors
              </p>
              {orchestratorResult.errors.length > 0 ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-rose-100">
                  {orchestratorResult.errors.map((error) => (
                    <li key={`${error.step}-${error.message}`}>
                      {error.step}: {error.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              {orchestratorResult.warnings.length > 0 ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-100">
                  {orchestratorResult.warnings.map((warning) => (
                    <li key={`${warning.step}-${warning.message}`}>
                      {warning.step}: {warning.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              {orchestratorResult.errors.length === 0 &&
              orchestratorResult.warnings.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">
                  No pipeline warnings or errors for this static scenario.
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Requested ZIP
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {response.requestedZipCode}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Technicians
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {response.techniciansEvaluated}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Supporting ZIP
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {response.techniciansSupportingZip}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Candidates
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {response.candidates.length}
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <h2 className="text-lg font-semibold text-white">
            Supported Technicians
          </h2>
          {supportedTechnicians.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {supportedTechnicians.map((technician) => (
                <article
                  key={technician.technicianId}
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
                >
                  <h3 className="font-semibold text-white">
                    {technician.displayName}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {technician.technicianId}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {technician.serviceArea.zipCodes.map((zipCode) => (
                      <DetailPill key={zipCode}>{zipCode}</DetailPill>
                    ))}
                  </div>
                  <p className="mt-4 text-sm text-slate-400">
                    Busy blocks: {technician.busyBlocks?.length ?? 0}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100">
              No mock technician services ZIP {scenario.requestedZipCode}. The
              engine returns an empty candidate list without falling back to
              unrelated technicians.
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Ranked Availability Candidates
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Ranking: earliest slot, then fewest busy blocks, then stable
                technician ID.
              </p>
            </div>
            <DetailPill>90 min appointment + 15 min travel buffer</DetailPill>
          </div>

          {response.candidates.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-800">
              <div className="grid grid-cols-1 divide-y divide-slate-800">
                {response.candidates.map((candidate, index) => (
                  <article
                    key={`${candidate.technicianId}-${candidate.slot.startsAt}`}
                    className="grid gap-4 bg-slate-950/50 p-5 md:grid-cols-[80px_1fr_1fr_160px]"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Rank
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-cyan-200">
                        #{index + 1}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Technician
                      </p>
                      <p className="mt-2 font-semibold text-white">
                        {candidate.displayName ?? candidate.technicianId}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {candidate.technicianId}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Slot
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-100">
                        {formatTimeRange(candidate.slot.startsAt, candidate.slot.endsAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-start gap-2 md:justify-end">
                      <DetailPill>{candidate.serviceAreaMatch}</DetailPill>
                      <DetailPill>{candidate.conflictCount} busy</DetailPill>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
              No availability candidates for this scenario.
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Company policy diagnostics
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                Company Scheduling Config
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Static company rules drive the same provider-free availability
                engine. This section validates business hours, service area,
                same-day cutoff, next-day/horizon rules, appointment defaults,
                and travel buffers without reading Supabase or providers.
              </p>
            </div>

            <label className="flex min-w-72 flex-col gap-2 text-sm text-slate-300">
              Company scenario
              <select
                value={companyScenarioId}
                onChange={(event) =>
                  setCompanyScenarioId(event.target.value as typeof companyScenarioId)
                }
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-400"
              >
                {companySchedulingDevScenarios.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Requested ZIP
              </p>
              <p className="mt-3 text-xl font-semibold text-white">
                {companyResponse.requestedZipCode}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Requested date
              </p>
              <p className="mt-3 text-xl font-semibold text-white">
                {companyScenario.requestedDate}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Business hours
              </p>
              <p className="mt-3 text-xl font-semibold text-white">
                {companyScenario.config.businessHours.startTime} -{" "}
                {companyScenario.config.businessHours.endTime}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Days: {companyScenario.config.businessHours.workingDays.join(", ")}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Appointment defaults
              </p>
              <p className="mt-3 text-xl font-semibold text-white">
                {companyScenario.config.appointmentDefaults.defaultAppointmentDuration.minutes} min
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Buffer:{" "}
                {companyScenario.config.appointmentDefaults.defaultTravelBuffer.beforeMinutes ?? 0}
                /{companyScenario.config.appointmentDefaults.defaultTravelBuffer.afterMinutes ?? 0} min
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Same-day rule
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <DetailPill>{companySameDayAllowed ? "allowed" : "blocked"}</DetailPill>
                <DetailPill>
                  cutoff {companyScenario.config.schedulingRules.sameDayCutoffTime}
                </DetailPill>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Date rule
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <DetailPill>{companyDateAllowed ? "allowed" : "blocked"}</DetailPill>
                <DetailPill>
                  horizon {companyScenario.config.schedulingRules.maximumSchedulingHorizonDays} days
                </DetailPill>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Service area
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {companyScenario.config.serviceArea.allowedZipCodes.map((zipCode) => (
                  <DetailPill key={zipCode}>{zipCode}</DetailPill>
                ))}
              </div>
            </div>
          </div>

          {companyResponse.errors.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
              <h3 className="text-sm font-semibold text-amber-100">
                Validation / policy result
              </h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-100">
                {companyResponse.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm text-emerald-100">
              Company config is valid for this request. Engine request built:{" "}
              {companyBuiltRequest.request ? "yes" : "no"}.
            </div>
          )}

          {companyResponse.candidates.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-800">
              <div className="grid grid-cols-1 divide-y divide-slate-800">
                {companyResponse.candidates.map((candidate, index) => (
                  <article
                    key={`company-${candidate.technicianId}-${candidate.slot.startsAt}`}
                    className="grid gap-4 bg-slate-950/50 p-5 md:grid-cols-[80px_1fr_1fr_160px]"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Rank
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-emerald-200">
                        #{index + 1}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Technician
                      </p>
                      <p className="mt-2 font-semibold text-white">
                        {candidate.displayName ?? candidate.technicianId}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {candidate.technicianId}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Slot
                      </p>
                      <p className="mt-2 text-sm font-medium text-slate-100">
                        {formatTimeRange(candidate.slot.startsAt, candidate.slot.endsAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-start gap-2 md:justify-end">
                      <DetailPill>{candidate.serviceAreaMatch}</DetailPill>
                      <DetailPill>{candidate.conflictCount} busy</DetailPill>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-5 text-sm text-slate-400">
              No company-config-driven availability candidates for this scenario.
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Dispatcher recommendation scenarios
                </p>
                <h3 className="mt-2 text-lg font-semibold text-white">
                  Customer-friendly windows
                </h3>
                <p className="mt-2 text-sm text-slate-400">
                  Static previews for same-day, next-day, preferred-window,
                  emergency, unsupported ZIP, and no-slot recommendation cases.
                  No AI, SMS, calls, booking, maps, or calendar confirmation
                  happens here.
                </p>
              </div>
              <label className="flex min-w-72 flex-col gap-2 text-sm text-slate-300">
                Dispatcher scenario
                <select
                  value={dispatcherScenarioId}
                  onChange={(event) =>
                    setDispatcherScenarioId(event.target.value)
                  }
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400"
                >
                  {dispatcherDevScenarios.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Requested ZIP
                </p>
                <p className="mt-2 font-semibold text-white">
                  {dispatcherScenario.requestedZipCode}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Requested date
                </p>
                <p className="mt-2 font-semibold text-white">
                  {dispatcherScenario.requestedDate}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Preferred window
                </p>
                <p className="mt-2 font-semibold text-white">
                  {dispatcherScenario.preferredTimeWindow ?? "None"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Emergency
                </p>
                <p className="mt-2 font-semibold text-white">
                  {dispatcherScenario.emergency ? "Yes" : "No"}
                </p>
              </div>
            </div>

            {dispatcherRecommendations.errors.length > 0 ? (
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-amber-100">
                {dispatcherRecommendations.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : dispatcherRecommendations.recommendations.length > 0 ? (
              <>
                {dispatcherRecommendations.bestRecommendation ? (
                  <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">
                          Best recommendation
                        </p>
                        <h4 className="mt-2 text-xl font-semibold text-white">
                          {dispatcherRecommendations.bestRecommendation.customerWindowLabel}
                        </h4>
                        <p className="mt-2 text-sm text-emerald-50">
                          {dispatcherRecommendations.bestRecommendation.technicianDisplayName ??
                            dispatcherRecommendations.bestRecommendation.technicianId}
                        </p>
                        <p className="mt-2 text-xs text-emerald-100/80">
                          {formatTimeRange(
                            dispatcherRecommendations.bestRecommendation.startsAt,
                            dispatcherRecommendations.bestRecommendation.endsAt,
                          )}
                        </p>
                      </div>
                      <DetailPill>
                        {dispatcherRecommendations.bestRecommendation.timeWindowLabel}
                      </DetailPill>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {dispatcherRecommendations.bestRecommendation.reasonCodes.map((reason) => (
                        <DetailPill key={reason}>{reason}</DetailPill>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  {dispatcherRecommendations.backupRecommendations.length > 0 ? (
                    dispatcherRecommendations.backupRecommendations.map((recommendation) => (
                      <article
                        key={`${recommendation.technicianId}-${recommendation.startsAt}`}
                        className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="font-semibold text-white">
                            Backup recommendation
                          </h4>
                          <DetailPill>{recommendation.timeWindowLabel}</DetailPill>
                        </div>
                        <p className="mt-3 text-sm font-medium text-slate-100">
                          {recommendation.customerWindowLabel}
                        </p>
                        <p className="mt-2 text-sm text-slate-400">
                          {recommendation.technicianDisplayName ??
                            recommendation.technicianId}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {formatTimeRange(recommendation.startsAt, recommendation.endsAt)}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {recommendation.reasonCodes.map((reason) => (
                            <DetailPill key={reason}>{reason}</DetailPill>
                          ))}
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 text-sm text-slate-400">
                      No backup recommendations for this scenario.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-5 text-sm text-slate-400">
                No dispatcher recommendations for this scenario.
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Safe response draft
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-100">
                {dispatcherResponse.primaryResponseText}
              </p>
              {dispatcherResponse.backupResponseText ? (
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {dispatcherResponse.backupResponseText}
                </p>
              ) : null}
              <p className="mt-4 text-xs leading-5 text-slate-500">
                Internal summary: {dispatcherResponse.internalSummary}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {dispatcherResponse.noAvailabilityReason ? (
                  <DetailPill>{dispatcherResponse.noAvailabilityReason}</DetailPill>
                ) : null}
                {dispatcherResponse.reasonCodes.map((reason) => (
                  <DetailPill key={reason}>{reason}</DetailPill>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
