# Scheduling Pipeline Foundation

## Overview

The scheduling foundation is a provider-free TypeScript layer for turning a raw customer scheduling request into deterministic availability candidates, dispatcher recommendations, and customer-safe draft response text.

It is intentionally not connected to Supabase, CRM persistence, Google Calendar, Google Maps, AI APIs, SMS/call providers, or customer-facing booking UI.

Current pipeline:

1. Normalize raw scheduling intake.
2. Validate intake and company scheduling config.
3. Generate company-config-driven availability.
4. Rank dispatcher recommendations.
5. Build safe customer-facing response drafts.
6. Inspect the full flow through `/dashboard/dev/scheduling-engine`.

## Current Modules

- `frontend/src/lib/integrations/types.ts`  
  Provider-neutral contracts for Calendar, Communication, Maps, Analytics, and Payment providers.

- `frontend/src/lib/integrations/noop-providers.ts`  
  Safe noop provider implementations. These do not connect to external systems.

- `frontend/src/lib/integrations/registry.ts`  
  Provider registry that currently returns noop providers only.

- `frontend/src/lib/integrations/scheduling/types.ts`  
  Core scheduling primitives: work blocks, busy blocks, service windows, appointment duration, travel buffer, availability slots, and normalized blocks.

- `frontend/src/lib/integrations/scheduling/availability.ts`  
  Pure utilities for normalizing blocks, detecting overlap, merging busy ranges, subtracting busy time from workdays, and generating available slots.

- `frontend/src/lib/integrations/scheduling/availability-engine.ts`  
  Multi-technician availability engine with ZIP matching and deterministic slot ranking.

- `frontend/src/lib/integrations/scheduling/company-config.ts`  
  Provider-neutral company scheduling policies for business hours, service area, appointment defaults, same-day/next-day rules, emergency rules, defaults, and validation.

- `frontend/src/lib/integrations/scheduling/company-availability.ts`  
  Adapter from company scheduling config into provider-free technician availability requests.

- `frontend/src/lib/integrations/scheduling/dispatcher-recommendations.ts`  
  Rule-based conversion of availability candidates into best/backup dispatcher recommendations.

- `frontend/src/lib/integrations/scheduling/dispatcher-response-builder.ts`  
  Safe customer-facing draft text generation from dispatcher recommendations. It does not book, confirm, or send anything.

- `frontend/src/lib/integrations/scheduling/scheduling-intake.ts`  
  Raw request normalization and validation for phone, SMS, website, AI chat, and manual admin intake.

- `frontend/src/lib/integrations/scheduling/scheduling-orchestrator.ts`  
  Full provider-free pipeline from raw intake to availability, recommendations, and safe response draft, with status and step reporting.

- `frontend/src/lib/integrations/scheduling/service-request-adapter.ts`  
  Temporary read-only adapter that maps an existing dashboard service request into scheduling intake and provides static fallback company/technician scheduling inputs for the CRM preview.

- `frontend/src/lib/integrations/scheduling/dev-scenarios.ts`  
  Static internal-only scenario data used by diagnostics. These scenarios are not fixtures and do not create CRM records.

- `frontend/src/app/dashboard/dev/scheduling-engine/page.tsx`  
  Internal diagnostics surface for visually verifying the provider-free scheduling pipeline.

## Provider-Free Boundaries

The scheduling foundation currently:

- uses plain TypeScript objects only;
- does not read from Supabase;
- does not create service requests or appointments;
- does not write CRM data;
- does not call Google Calendar, Google Maps, Twilio, Telnyx, Retell, Stripe, or AI APIs;
- does not send SMS, place calls, or create calendar events;
- does not expose technician phone numbers;
- does not promise exact arrival times;
- does not confirm that an appointment is booked.

The response builder intentionally uses customer-safe draft language such as available windows and asks whether the window works. It must not be treated as booking confirmation.

## Status Model

`runSchedulingOrchestrator()` returns one of:

- `success`: valid intake/config and at least one best recommendation without warnings.
- `partial`: warnings exist but the pipeline can still produce a safe response.
- `no_availability`: intake/config are valid but no recommendation is available.
- `validation_failed`: required intake or company config fields are invalid, so later steps are skipped.

Normal validation paths return errors and warnings. They should not throw during routine use.

## Diagnostics Coverage

`/dashboard/dev/scheduling-engine` currently preserves these diagnostics:

- multi-technician availability by ZIP;
- company scheduling policy behavior;
- dispatcher recommendation scenarios;
- safe response draft preview;
- raw intake normalization preview;
- full orchestrator scenarios.

Static orchestrator scenarios cover:

- valid phone call same-day intake;
- website form next-day intake;
- morning and afternoon preferences;
- emergency request wording;
- unsupported ZIP;
- missing ZIP validation failure;
- missing service information;
- no available slots;
- weekend blocked by company rules;
- weekend allowed by company policy;
- same-day cutoff blocked.

## CRM Read-Only Preview

Task 119 adds the first internal CRM surface for the pipeline on `/dashboard/leads/[id]`.

The preview:

- reads the service request already loaded on the detail page;
- adapts customer, appliance, issue, ZIP/address, source, and preferred window into scheduling intake;
- uses static fallback company scheduling rules;
- loads real RLS-readable `technician_profiles` for technician matching;
- runs `runSchedulingOrchestrator()`;
- displays normalized request data, status, recommended technician, match reasons, best/backup scheduling windows, safe response draft, and warnings/errors.

The preview does not:

- write dispatcher output;
- create appointments;
- reserve availability;
- assign technicians;
- send messages;
- call calendar, maps, AI, SMS, call, or provider services.

Treat this as an internal planning preview only. Replace static fallback company scheduling config with persisted, RLS-protected scheduling data before adding real booking behavior.

## Real Technician Matching

Task 121 adds real technician matching for the internal dispatcher preview.

Module:

- `frontend/src/lib/integrations/scheduling/technician-matching.ts`

Inputs:

- current service request scheduling intake;
- RLS-readable `technician_profiles` rows;
- technician status, marketplace flag, suspension/rejection/archive fields;
- service ZIP codes;
- specialties;
- years of experience;
- public profile completeness signals.

Eligibility:

- `technician_status = verified`;
- `marketplace_enabled = true`;
- `archived_at`, `rejected_at`, and `suspended_at` are null;
- `service_zip_codes` includes the normalized request ZIP.

Ranking model:

- ZIP coverage: highest priority;
- primary market ZIP: small bonus;
- appliance specialty: high priority;
- brand experience/specialty: medium priority and never a hard block;
- years of experience: medium priority;
- profile completeness: low-priority tie-breaker.

Outputs:

- best technician match;
- backup technician matches;
- match confidence;
- score;
- human-readable reason list;
- provider-free scheduling technician inputs for `runSchedulingOrchestrator()`.

Snapshot persistence remains backward-compatible. Task 121 stores the recommended technician profile ID in the existing snapshot column when available, and stores technician name, business name, score, confidence, and ranking reasons inside `recommendation_summary`. Older snapshots without those fields should still render.

## Technician Availability Rules

Task 122 adds the first real availability layer for internal dispatcher preview.

New objects:

- `supabase/migrations/0031_technician_availability_rules_apply_ready.sql`
- `public.technician_availability_rules`
- `frontend/src/lib/integrations/scheduling/technician-availability-rules.ts`

Table shape:

- `company_id`
- `technician_profile_id`
- `day_of_week` where 0=Sunday and 6=Saturday
- `start_time`
- `end_time`
- `is_available`
- timestamps

Access model:

- no public or anonymous access;
- authenticated access is constrained by existing technician/company RLS helpers;
- technician owners, company managers/owners, and admins can manage rules when existing helper predicates allow them.

Dispatcher Preview now:

- loads RLS-readable availability rules;
- converts matching day/time rules into provider-free technician work blocks;
- feeds those work blocks into `runSchedulingOrchestrator()`;
- shows configured days/windows for the recommended technician;
- warns when the matched technician has no availability rules.

The availability layer is deliberately simple. It does not model exceptions, PTO, travel time, provider calendar events, appointment holds, dispatch assignments, customer confirmation, or calendar sync. Future appointment recommendation work should add reviewed persistence for actual holds/appointments before any customer-facing booking action.

## Persisted Preview Snapshots

Task 120 adds the first persisted dispatcher decision layer while keeping the dispatcher preview operationally read-only.

New objects:

- `supabase/migrations/0030_dispatcher_preview_snapshots_apply_ready.sql`
- `public.dispatcher_preview_snapshots`
- `public.save_dispatcher_preview_snapshot_rpc(...)`
- `public.latest_dispatcher_preview_snapshot_rpc(service_request_id)`
- `/api/service-requests/[id]/dispatcher-preview`

The saved snapshot captures:

- normalized ZIP, appliance/service, brand, issue, requested date/window;
- orchestrator status;
- sanitized best recommendation payload;
- backup recommendation count/payload;
- safe customer response draft text;
- validation warnings and errors;
- creator and created timestamp.

This persistence is internal-only. It does not create appointments, assign technicians, update service requests, send SMS/calls/emails, call Google Calendar/Maps, or invoke AI/provider services. Because current `service_requests` do not yet have durable company ownership, access reuses `public.can_view_service_request(service_request_id)` and stores nullable `company_id` from the caller profile when available.

Apply migration `0030` in dev/staging before using the dashboard save action. Until then, the UI should show a migration-required message instead of pretending persistence is active.

## Stabilization Notes

- Static scenario data now lives in `dev-scenarios.ts` instead of being duplicated in the diagnostics page.
- Scheduling exports remain centralized through `frontend/src/lib/integrations/scheduling/index.ts`.
- The current wildcard exports are intentional for the internal scheduling package; future public package boundaries can narrow exports if the module grows.
- No broad `any` types were added in the provider-free scheduling layer.
- No normal-use throws are used for validation flow; helpers return validation results, empty responses, errors, or warnings.

## Intentionally Not Implemented

Do not treat the current foundation as real booking.

Not implemented yet:

- persisted company scheduling settings;
- persisted technician work schedules;
- persisted CRM appointments;
- Google Calendar sync;
- Outlook or Apple Calendar sync;
- Google Maps drive-time/routing;
- customer booking confirmation;
- appointment holds;
- technician assignment records;
- SMS or call delivery;
- AI Dispatcher provider calls;
- webhook handling;
- audit logging for scheduling decisions.
- persisted company scheduling configuration beyond the Task 120 preview snapshot.
- availability exceptions, PTO, provider calendar busy blocks, and CRM appointment blocks.
- real technician assignment records or appointment ownership.

## Next Safe Steps

Recommended sequence before real provider integration:

1. Apply and verify `0030` in dev/staging, then confirm authorized dashboard users can save/read dispatcher preview snapshots.
2. Apply and verify `0031` in dev/staging, then create test availability rules for multiple technicians.
3. Design reviewed Supabase schema for company scheduling settings and CRM appointments.
4. Add RLS and server-side mutations for real appointment/hold persistence.
5. Feed persisted company rules into `runSchedulingOrchestrator()`.
6. Add reviewed service request assignment/hold tables before any recommendation becomes an actual technician assignment.
7. Add appointment hold/confirmation semantics before any customer-facing booking action.
8. Add audit/timeline records for dispatcher recommendations and human decisions.
9. Only then connect CalendarProvider implementations such as Google Calendar.
10. Add MapsProvider drive-time/routing after address quality and coordinates are reliable.
11. Add CommunicationProvider SMS/call delivery only after safe wording, opt-in, and audit rules are reviewed.

## Verification

Task 118 verification:

- `npm run lint`
- `npm run build -- --webpack`
- `git diff --check`

The scheduling foundation should continue to build without schema, API, customer-facing UI, provider, package, Supabase, AI, Maps, Calendar, SMS, call, or commit changes.
