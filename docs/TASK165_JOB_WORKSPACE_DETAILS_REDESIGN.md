# Task 165 - Job Workspace Details Screen Redesign

Date: July 9, 2026

Status: UI-only first pass on the Job Workspace Details tab.

## Purpose

Task 165 begins the Job Workspace restructure recommended by Task 162. The goal is to make the first tab work like a technician field screen instead of a CRM record archive.

This task only changes the Details/Overview surface for one job. It does not change Finance, Timeline, Estimates backend, Invoices backend, Payments, Retell, SMS, Supabase schema, phone ingestion, provider configuration, or customer portal behavior.

## Details Tab Structure

The first tab now prioritizes the order a technician needs in the field:

1. Compact job header with back link, job number, status, job identity, appointment/technician summary, and compact quick actions.
2. Property Preview using the existing `/api/property-intelligence` route.
3. One primary Next Action.
4. Customer card with Call, SMS, View Customer, Navigate, and short service address.
5. Schedule card with date/window, assigned technician, location, and edit action.
6. Appliance / Problem card with appliance, brand, model, complaint, estimate state, and invoice state.
7. Technician Findings card with diagnosis note capture.
8. Photos / Attachments quick card.
9. Collapsed secondary controls for status workflow, parts workflow, counts, and service address editing.

## Kept Visible

- Property context.
- Next action.
- Customer communication.
- Service address summary and navigation.
- Schedule summary.
- Appliance and problem.
- Technician findings.
- Photo entry.
- Estimate and invoice status summaries.

## Collapsed

- Full status workflow grid.
- Parts status actions.
- Current job note/photo/timeline counters.
- Full service address editor.
- Navigation metadata.
- Save as Customer Primary Address.

These functions remain available, but they no longer occupy the primary mobile path.

## Removed From Default View

- Duplicate customer/address/appointment/source summary blocks.
- Duplicate appliance/problem cards.
- Always-visible customer history counter block.
- Always-visible full address editor.
- Disabled communication action placeholders.

## Property Preview

The card continues to consume the existing backend-only Property Intelligence API. It still displays only:

- Photo or map.
- Zestimate.
- Square footage.
- Year built.
- Source label when provider data exists.

Missing provider data still falls back cleanly without user-facing provider errors.

## Future Work

Future Job Workspace tasks should continue the Task 162 plan:

- Refine mobile sticky actions and bottom navigation compatibility.
- Split estimate/invoice/payment work into a clearer field workflow.
- Collapse long history by default.
- Add a dedicated reschedule/edit appointment flow only when needed.
- Prepare findings for future voice dictation without exposing AI/debug terminology.

## Task 165.10 - Clickable Job Summary and mobile Status bottom sheet

Task 165.10 keeps the Details tab mobile-first and removes tiny tap targets from the top workflow area.

Implemented:

- The mobile Job Summary row is now fully clickable. Tapping the job title, complaint, whitespace, or pencil opens the same Edit Job modal.
- A new mobile Status row appears directly under Job Summary. It uses the existing service request status value and the canonical `SERVICE_REQUEST_CRM_STATUSES` list.
- Tapping the Status row opens a mobile bottom sheet with the existing supported statuses. The current status is marked, and choosing a different status reuses the existing `updateStatus()` flow.
- The Edit Job modal now has smoother fade/scale entry, and the Status picker uses a dimmed backdrop plus slide-up sheet animation.

No backend, Supabase schema, API, Finance, Timeline, Property Intelligence, estimate, invoice, payment, Customer CRM, Dashboard, or Jobs Center logic changed.

## Task 165.12 - Mobile Client card and job-specific client editor

Task 165.12 replaces the mobile-only CRM-style `Customer` card with a compact `Client` block.

Implemented:

- The mobile section title is now `Client`, with `View Client Details` linking to the existing customer workspace route `/dashboard/customers/[customerId]` when the job is linked to a permanent client record.
- The mobile block uses the job/service-request snapshot fields: `customerName`, `customerPhone`, `customerEmail`, `streetAddress`, `unit`, `city`, `state`, and `zipCode`.
- The old mobile clutter was removed from the default Client block: uppercase `CUSTOMER`, separate Call/SMS/View/Navigate button group, the nested Service Address card, and long phone/email line.
- Client avatar currently uses initials only. Existing upload/storage flows are for service request photos/attachments, not persistent client avatars, so no fake client-photo upload action was added.
- Phone uses the existing `tel:` flow and displays readable US phone formatting. Message uses the existing `sms:` compose flow when a phone number exists; no new SMS backend or communication thread was created.
- Distance displays the neutral fallback `Distance unavailable`. Real driving distance requires an explicit geolocation permission flow plus a route-distance provider and was not enabled in this UI-only task.
- The pencil opens a mobile `Edit Client` modal for the current job snapshot fields only. It updates the current Job Workspace state immediately and does not silently mutate the permanent CRM client record.

Known limitation:

- The current codebase has a narrow persisted service-address update endpoint, but no safe broad service-request contact snapshot update flow for name, phone, email, and address together. Persisting the full `Edit Client` modal should be done in a future task with a dedicated RPC/API instead of updating the permanent customer record silently.

## Task 165.13 - Client distance, avatar persistence, map address and phone icon

Task 165.13 completes the remaining mobile Client-card interactions without using phone geolocation or fake values.

Implemented:

- Distance is loaded from a server-side Client-card context route. The route uses the best existing base-address source in this order:
  1. `companies.primary_city` + `companies.primary_state` for the current dashboard company.
  2. `technician_profiles.primary_city` + `technician_profiles.primary_state` for the current user.
- The app does not request browser/device geolocation. If no base city/state exists, the UI shows `Set base address to calculate distance` and links to the technician profile/settings route when safe.
- Driving distance uses Google Distance Matrix server-side through the existing Google Maps environment configuration (`GOOGLE_MAPS_API_KEY` if present, otherwise `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`). No new browser key exposure or billing/configuration change was added.
- Service address text in the mobile Client block is clickable. It opens a compact `Open Google Maps?` confirmation and then opens Google Maps with an encoded address query, not latitude/longitude.
- The phone action now uses a small green inline SVG handset instead of an emoji/generic icon.
- The avatar is now an obvious tap target with a camera badge and a mobile action sheet:
  - Take Photo
  - Choose from Library
  - Upload File
  - Remove Photo when an avatar exists
  - Cancel
- Avatar persistence uses new apply-ready migration `supabase/migrations/0058_client_avatar_persistence_apply_ready.sql`.

Avatar ownership:

- Linked permanent clients store the image path on `customers.avatar_storage_path`.
- Jobs without a linked client store the image path on `service_requests.job_client_avatar_storage_path`.
- Images are stored in a new private `client-avatars` bucket.
- Browser code never writes directly to the bucket. `/api/service-requests/[id]/client-avatar` verifies the dashboard session and service-request access, uploads/removes via the server-side service role, and returns only a signed URL for display.

Fallbacks:

- Missing service address: `Service address unavailable`.
- Missing base/company/technician origin: `Set base address to calculate distance`.
- Google Maps/Distance Matrix unavailable: `Distance unavailable`.
- Missing avatar: initials placeholder remains visible.

Apply note:

- Real avatar persistence requires applying `0058_client_avatar_persistence_apply_ready.sql`. Before the migration is applied, the UI remains usable and the avatar action reports storage not ready instead of breaking the Job Workspace.

## Task 165.14 - Client photo upload, base address, and driving distance completion

Task 165.14 fixes the unfinished production pieces from Task 165.13.

Photo upload root cause:

- The first avatar route selected migration-only columns from `service_requests` too early. If `0058` was not applied, the upload/read path failed before ownership could be resolved.
- The route now verifies job access using stable `service_requests.id/customer_id` first, then reads optional avatar fields separately through the server-side service role.
- File upload now sends the file bytes explicitly to Supabase Storage, returns a fresh signed URL, updates local avatar state immediately, and keeps a visible uploading/error state in the Client block.

Avatar ownership remains:

- Linked permanent client: `customers.avatar_storage_path`.
- Unlinked job-specific client: `service_requests.job_client_avatar_storage_path`.
- Bucket: private `client-avatars`.
- Browser clients never write directly to the bucket. The dashboard-authenticated `/api/service-requests/[id]/client-avatar` route verifies service-request access and uses the server-side service role for Storage and DB writes.
- Storage is private; normal display uses signed URLs. The route removes the previous object after a successful replacement or removal.

Base address foundation:

- New migration: `supabase/migrations/0059_base_address_distance_foundation_apply_ready.sql`.
- Company base address fields live on `public.companies`: `base_address_line1`, `base_address_line2`, `base_city`, `base_state`, `base_zip`, `base_country`, `base_formatted_address`, `base_latitude`, `base_longitude`, `base_place_id`, `base_address_updated_at`.
- Technician override fields live on `public.technician_profiles` with the same `base_*` names.
- Company Base Address is edited from `/dashboard/settings` through the trusted `update_company_base_address_rpc(...)`.
- Technician Base Address override is edited from `/dashboard/technician-profile` through the existing trusted `upsert_own_technician_profile_rpc(...)`, extended by `0059`.
- Existing Google Places autocomplete is reused when configured. Manual entry remains available.

Origin resolution priority:

1. Technician Base Address override.
2. Company Base Address.
3. Missing origin fallback.

Distance:

- The Client block never requests browser/device geolocation.
- Destination is the job service address, not Zillow coordinates.
- Server helper: `frontend/src/server/maps/distance.ts`.
- Internal endpoint: `POST /api/maps/distance`.
- Client-card context endpoint: `/api/service-requests/[id]/client-card`.
- Current Google API implementation uses server-side Google Distance Matrix with `GOOGLE_MAPS_API_KEY` if present, otherwise the already configured `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` server-side. The key is not exposed by this task.
- Results are cached in-memory for 12 hours by normalized origin/destination.

Fallback states:

- Loading: `Calculating distance...`.
- Missing origin: `Set base address to calculate distance`.
- Missing destination: `Service address unavailable`.
- Provider/API unavailable: `Distance unavailable`.
- Success: `12.4 mi away`.

Apply notes:

- Apply `0058` before expecting avatar persistence.
- Apply `0059` before expecting Company Base Address, Technician Base Address override, or full-address distance behavior.
- If the Google Distance Matrix API is not enabled for the configured Google Maps project, distance remains safely unavailable until the API is enabled by the owner.

## Task 165.15 - Client avatar persistence and base-address resolution runtime fix

Task 165.15 audits the real runtime flows after `0058` and `0059` were applied.

Confirmed storage/schema state:

- `client-avatars` bucket exists.
- Bucket is private.
- Bucket size limit is 5 MB.
- Allowed MIME types are `image/jpeg`, `image/png`, `image/webp`, `image/heic`, and `image/heif`.
- Expected columns exist in code paths: `customers.avatar_storage_path` and `service_requests.job_client_avatar_storage_path`.

Avatar failure root cause:

- The bucket exists, but the service-role database role did not have the minimum table grants needed by the server avatar route.
- Read-only runtime check returned PostgreSQL `42501` on `public.service_requests` for the configured service-role client.
- Because `/api/service-requests/[id]/client-avatar` verifies ownership and writes avatar paths server-side, the missing grants can make the UI show `Client photo could not be saved` even after the storage bucket exists.

Avatar runtime fixes:

- `/api/service-requests/[id]/client-avatar` now returns a flat response contract:
  - success: `ok`, `avatarUrl`, `storagePath`, `ownerType`
  - error: `ok: false`, `error`, `message`
- The route logs safe Supabase/storage metadata for failed owner lookup, upload, signed URL, or DB update operations. It does not log API keys, raw image bytes, or private customer data.
- The route uploads explicit file bytes to the private bucket and verifies that DB updates return the intended row.
- The UI accepts both the new flat response and the previous nested `avatar` response shape.

Base-address resolution root cause:

- The Job Workspace origin resolver could miss the saved Company Base Address when `current_dashboard_company_id` did not resolve the same company row as Settings.
- The resolver now uses the project rule from Task 152: active `company_members` is authoritative for company access; do not rely on `profiles.company_id`.
- Coordinates are optional. A non-empty `base_formatted_address` or composed base address is enough to calculate distance through Google Distance Matrix.

Base-address runtime fixes:

- `/api/service-requests/[id]/client-card` resolves distance origin in this order:
  1. active technician profile base address override;
  2. active company membership -> company base address;
  3. missing-origin fallback.
- The client-card response includes safe diagnostics only:
  - `originSource`
  - `originAddressAvailable`
  - `destinationAddressAvailable`
- The response no longer returns the private exact origin address to the browser.
- Server logs include profile id, technician profile id, selected company id, origin source, and safe rejection reason.
- Distance Matrix logging now records missing key, HTTP status, Google response status, element status, and request failures without logging API keys or addresses.

New required migration:

- `supabase/migrations/0060_client_avatar_distance_service_role_grants_apply_ready.sql`
- This migration is required because runtime QA proved the current applied schema privileges are insufficient.
- It grants only the service-role privileges needed by the avatar and client-card routes:
  - `service_requests`: `SELECT`, and `UPDATE` of `job_client_avatar_storage_path`, `job_client_avatar_updated_at`
  - `customers`: `SELECT`, and `UPDATE` of `avatar_storage_path`, `avatar_updated_at`
  - `technician_profiles`: `SELECT`
  - `company_members`: `SELECT`
  - `companies`: `SELECT`
- It does not disable RLS, weaken anon/authenticated policies, make storage public, or add broad browser write access.

Safe manual SQL checks:

```sql
select id, base_formatted_address, base_latitude, base_longitude, base_address_updated_at
from public.companies
where id = '<company_id>';

select id, profile_id, base_formatted_address, base_latitude, base_longitude, base_address_updated_at
from public.technician_profiles
where profile_id = '<profile_id>'
  and archived_at is null;

select id, avatar_storage_path, avatar_updated_at
from public.customers
where id = '<customer_id>';

select id, customer_id, job_client_avatar_storage_path, job_client_avatar_updated_at
from public.service_requests
where id = '<service_request_id>';
```

QA note:

- Codex verified the exact target job page is open and authenticated at `http://localhost:3002/dashboard/leads/33a16f94-0176-4378-8c56-1344ddee9dc3`.
- The in-app browser surface did not expose a supported file-input injection method, so final click-through photo upload/removal QA must be performed by the owner in the existing 3002 browser session after applying `0060`.

## Task 165.16 Schedule Row and Reschedule Sheet

Scope:

- Mobile Job Workspace Details only.
- Finance, Timeline, Estimates, Invoices, Payments, Property Preview, Job Summary, Status row, Client Details routing, avatar storage logic, distance calculation, Technician Findings, Photos/Attachments, desktop layout, and Property Intelligence were not redesigned.

Client avatar badge:

- The blue camera badge is now hidden after a real client avatar photo loads.
- The camera badge still appears when no photo exists, so the upload affordance remains discoverable.

Mobile Schedule row:

- The previous mobile Schedule card has been replaced with a compact borderless row after the Client block.
- Row layout:
  - left label: `Schedule`
  - center blue calendar icon
  - date/time block
  - right pencil affordance
- The whole row opens the same reschedule interaction.
- Desktop still uses the existing schedule card and Appointment tab edit path.

Reschedule sheet:

- Mobile uses a bottom sheet with dimmed backdrop, drag handle, title `Reschedule`, close button, native start date/time and end date/time inputs, Save, and Cancel.
- The sheet uses transform-based slide-up animation and the existing dashboard modal fade timing.
- Start/end validation keeps the end after the start. If the start moves forward past the end, the end is automatically moved one hour later.
- The current appointment table stores one active same-day appointment window per job. `Schedule later` / unschedule is not supported by the current system and is documented in the sheet instead of being faked.

Persistence:

- First-time scheduling still reuses the existing appointment booking route.
- Rescheduling an existing appointment uses a narrow authenticated `PATCH /api/service-requests/[id]/appointments` path.
- The PATCH path verifies the logged-in user can access the job, verifies the appointment is linked to that job, checks availability and overlaps, updates the existing `appointments` row, and mirrors the scheduled fields back to `service_requests`.
- It does not create duplicate appointments.
- Google Calendar sync remains outbound-only; this task does not add inbound calendar behavior.
- New apply-ready migration: `supabase/migrations/0061_job_workspace_mobile_reschedule_service_role_grants_apply_ready.sql`.
- `0061` grants only the service-role privileges needed by the server reschedule path: select/update `appointments`, select `technician_availability_rules`, and update the mirrored scheduled fields on `service_requests`. It does not grant browser users direct appointment writes.

QA:

- Browser route checked at `http://localhost:3002/dashboard/leads/33a16f94-0176-4378-8c56-1344ddee9dc3`.
- Mobile 390px: Job Workspace loads, Schedule row appears after Client, row opens the Reschedule sheet, native date/time inputs are prefilled, and there is no horizontal overflow.
- Mobile 375px and 430px sampled with the sheet open; no horizontal overflow.
- Save was not clicked during Codex QA to avoid mutating the local QA job.

## Task 165.17 Reschedule Validation Fix

Root cause:

- The ZIP coverage error is produced by the first-time booking path, not by true rescheduling.
- `POST /api/service-requests/[id]/appointments` calls `book_service_request_appointment_rpc`.
- That RPC validates technician eligibility and ZIP coverage because it is assigning/booking a technician.
- The mobile sheet previously chose POST whenever `service_requests.appointment_id` was missing, even if the job already had scheduled appointment fields from a legacy/manual/imported flow.
- That made a date/time-only change behave like a new technician booking and triggered `That technician does not cover this service ZIP code.`

Create vs reschedule rule:

- Initial appointment creation still uses POST and keeps full technician eligibility, ZIP coverage, availability, duplicate, and conflict validation.
- Existing appointment reschedule uses PATCH and does not rerun ZIP coverage when the assigned technician is unchanged.
- PATCH still verifies:
  - dashboard access to the job;
  - active appointment ownership/linkage;
  - active appointment status;
  - technician availability for the new date/time;
  - overlapping appointments for the same technician;
  - valid start/end window.

Legacy appointment resolution:

- PATCH now accepts an omitted `appointmentId` when the request is a reschedule.
- If `service_requests.appointment_id` is present, PATCH uses it.
- If it is missing, PATCH resolves the latest active appointment for the current `service_request_id`, optionally scoped to the assigned technician.
- This supports legacy/manual/imported jobs where the canonical appointment row exists but the mirror field is stale.

Technician changes:

- The current mobile Reschedule sheet does not expose technician changes.
- If a caller attempts to change `technicianProfileId` through PATCH, the route rejects it with a clear unsupported-change error instead of silently bypassing ZIP validation.
- Technician assignment changes should continue to go through a dedicated assignment/booking flow with full ZIP coverage validation.

QA note:

- The specified local job currently renders as `Not scheduled` / `First available`, so it cannot prove a same-technician reschedule save in browser without first creating an appointment.
- Browser QA still verified the mobile sheet opens and layout remains usable; persistence for true existing appointments should be verified against a job that has either `appointment_id` or scheduled appointment fields plus an active appointment row.

## Task 165.18 - End-to-end Job Creation and Appointment Save Debug

Root cause findings:

- The problematic job `33a16f94-0176-4378-8c56-1344ddee9dc3` has no `service_requests.appointment_id`, no `assigned_technician_profile_id`, no scheduled mirror fields, and no active appointment record visible through the current applied grants.
- It does have `selected_technician_slug = qa-booking-refrigeration-1770c801`, which is only a selected-technician snapshot.
- The selected technician resolves to QA Booking Refrigeration, whose service ZIP coverage is `77494`, `77449`, `77084`, and `77095`.
- The job ZIP is `10075`, so first-time appointment creation correctly fails with `That technician does not cover this service ZIP code.`
- The earlier "Assign a technician" failure happened because the scheduling route did not reconcile legacy `selected_technician_slug` snapshots to a real `technician_profiles.id`.
- New Job creation failed because the Jobs Center flow performed an extra browser-side customer match/create RPC before conversion. That intermediate step could fail independently, while conversion already owns customer/job creation.
- New Job also forced duplicate candidates into `needs_info` even when the form explicitly sent `duplicateConfirmed: true`.

Canonical appointment behavior:

- Mobile schedule Save now calls `PUT /api/service-requests/[id]/appointments`.
- The server, not the frontend, decides whether to create or update by looking for active `appointments` rows for the service request.
- If an active appointment exists, PUT updates that appointment and mirrors `appointment_id`, assigned technician, date, and window fields back to `service_requests`.
- If no active appointment exists, PUT performs first-time booking through `book_service_request_appointment_rpc`.
- `service_requests.appointment_id` is treated as a mirror/cache field that may be stale. It is not the only source of truth.
- Existing POST and PATCH remain for compatibility with older callers, but the mobile Schedule row uses PUT.

ZIP and technician rules:

- First-time appointment creation still validates selected technician eligibility, availability, conflicts, duplicates, and ZIP coverage.
- Same-technician update does not hard-block on ZIP coverage.
- Technician changes are still rejected by the mobile schedule sheet and should use a future assignment flow with full validation.

New Job behavior:

- The Jobs Center no longer calls `match_or_create_customer_for_intake_rpc` directly from the browser before conversion.
- New Job now creates the intake and immediately converts it through the existing server conversion route.
- If duplicate candidates are found but `duplicateConfirmed` is true, intake creation preserves the requested status instead of forcing `needs_info`.
- Browser QA created a real unscheduled QA job:
  - service request `7ae0b981-d477-425e-868e-37bd790c6786`
  - customer `b6d6ae9b-d00e-4a83-b5a6-273578315e71`
  - intake `6e47470c-f21c-4b1b-93fe-d60082aa3727`
  - status `new`
  - assigned technician `77a48eaa-28ea-4088-93e1-8b42630bb369`
  - `appointment_id = null`
  - scheduled fields `null`
- Failed pre-fix QA intakes left for traceability:
  - `9b9c2d3f-b0aa-48e2-b84c-3bcf1dce16bf`
  - `2457a97e-a454-47fb-8492-fa09122117f9`

Remaining database requirement:

- Runtime diagnostics still show PostgreSQL `42501 permission denied for table appointments` for the configured service-role client.
- Apply `supabase/migrations/0061_job_workspace_mobile_reschedule_service_role_grants_apply_ready.sql` before verifying existing-appointment update persistence through the server-side update branch.
- `0061` now also grants service-role update access to `service_requests.appointment_id` and `service_requests.assigned_technician_profile_id` so the server can reconcile stale mirrors after finding the canonical appointment row.

## Task 165.19 - Technician availability and conflict validation fix

Root cause:

- The false "technician unavailable" blocker came from inconsistent availability semantics between the provider-free scheduling engine and the appointment save paths.
- Existing scheduling config already defines platform default business hours: Monday-Friday, `08:00-17:00`, timezone `America/Chicago`.
- The first booking RPC and the server-side reschedule branch required a matching `technician_availability_rules.is_available = true` row for every save.
- That meant a technician with no explicit available-hour records was treated as unavailable 24/7, even though the project already has default company business hours.
- This was not a ZIP coverage issue and not an appointment overlap for the current QA job.

QA diagnostics for `7ae0b981-d477-425e-868e-37bd790c6786`:

- Technician checked: `77a48eaa-28ea-4088-93e1-8b42630bb369` (`QA Booking Refrigeration`).
- Service ZIP: `77494`.
- Technician ZIP coverage: `77494`, `77449`, `77084`, `77095`.
- Availability records found: one active Monday rule, `09:00:00-12:00:00`.
- Requested diagnostic window checked: `2026-07-13`, `09:00:00-10:00:00`.
- Timezone used by route helpers: `America/Chicago`.
- Matching availability rules for that diagnostic window: `1`.
- Blocking overlap count for that diagnostic window: `0`.
- Active blocking appointment statuses remain `scheduled`, `confirmed`, and `en_route`; canceled/no-show/completed records do not block.
- The overlap rule remains `existing_start < requested_end AND existing_end > requested_start`.
- Existing appointment updates exclude the current appointment id, so a reschedule cannot conflict with itself.

Fix:

- `frontend/src/app/api/service-requests/[id]/appointments/route.ts` now uses one shared server-side decision helper for PATCH/PUT reschedule validation:
  - explicit unavailable recurring rules block;
  - explicit available rules are respected when configured;
  - default business hours are used only when the technician has no explicit available-hour rules;
  - overlap checks still block real conflicts and exclude the current appointment during update;
  - conflict errors now include the blocking window, for example `Technician already has an appointment from 10:00 AM to 11:00 AM.`
- New migration `supabase/migrations/0062_appointment_availability_default_hours_fix_apply_ready.sql` replaces `book_service_request_appointment_rpc(...)` without changing the signature. It applies the same availability fallback to first-time appointment creation while preserving ZIP, eligibility, duplicate-active-appointment, explicit unavailable, explicit working-hours, and overlap protections.

Browser/DB QA:

- Existing authenticated browser session on `localhost:3002` opened the QA job.
- The visible Appointment assistant successfully booked the first appointment.
- Created appointment id: `1500de2b-4889-4635-9d29-ffdfc2609ec0`.
- The job mirror fields persisted:
  - `service_requests.appointment_id = 1500de2b-4889-4635-9d29-ffdfc2609ec0`
  - `scheduled_date = 2026-06-01`
  - `scheduled_window_start_time = 09:00:00`
  - `scheduled_window_end_time = 10:30:00`
  - `status = scheduled`
- Duplicate appointment count for the job after booking: `1`.
- Full mobile PUT reschedule QA still needs a browser path exposing the mobile Schedule sheet. The current desktop visible `Edit` action opens the Appointment assistant instead of the reschedule bottom sheet.

Migration requirement:

- Apply `0062_appointment_availability_default_hours_fix_apply_ready.sql` after `0061`.
- Do not apply this automatically to production from Codex. Run it through Supabase SQL Editor or the approved migration path, then repeat first-booking and reschedule QA.

## Task 165.23 - Job Details catalogs, attribution and tags

Scope:

- Adds a mobile Job Details block under Schedule in Job Workspace Details.
- Rows are `Job Name`, `Description`, `Ad Source`, and `Tags`.
- Rows are borderless, divider-based, mobile-first, and open bottom sheets.

Canonical fields:

- Job Name canonical field: `service_requests.job_name`.
- Legacy fallback: derive `"{appliance_type} Repair"` when `job_name` is missing.
- Description canonical field: existing `service_requests.issue_description`.
- Technical intake source remains `service_requests.request_source`.
- Marketing attribution uses new `service_requests.marketing_source_id`.
- Tags use `service_request_tags` relation to reusable `service_tags`.

Migration:

- `supabase/migrations/0063_job_details_catalogs_attribution_tags_apply_ready.sql`

Catalogs created:

- `service_job_types`
- `service_problem_types`
- `marketing_sources`
- `service_tags`
- `service_request_tags`

Catalog behavior:

- Catalogs are system/default plus company-scoped custom values.
- Duplicate prevention uses normalized names with case/spacing-insensitive indexes.
- Problem types can be scoped by job type and appliance category.
- Marketing source is intentionally separate from technical intake channel.
- Tags support controlled categories and tones, not arbitrary CSS colors.

Default seed data:

- Job types include Refrigerator, Freezer, Wine Cooler, Ice Maker, Dishwasher, Washer, Dryer, Oven / Range, Cooktop, Microwave, and Other.
- Problem defaults include contextual appliance-specific lists for refrigerator, dishwasher, dryer, washer, oven/range, ice maker, freezer, wine cooler, microwave, and cooktop.
- Marketing sources include Google Ads, Google Organic, Google Business Profile, Website, Reserve with Google, Thumbtack, Yelp, Nextdoor, Referral, Returning Customer, Facebook, Instagram, Direct Call, Property Management, and Other.
- Tags are intentionally minimal: high-end appliance, sealed system, callback/follow-up/customer/warranty/priority style tags.

API:

- `/api/service-requests/[id]/details`
- `GET` returns the canonical job details snapshot and available catalogs.
- `PATCH` updates job name, description, marketing source, and tags through `update_service_request_details_rpc(...)`.
- Frontend does not write directly to Supabase.

Synchronization:

- The existing top `Edit Job` modal now saves through the same details endpoint.
- The new lower Job Details rows read the same canonical snapshot.
- Updating either path updates the top summary and lower rows immediately without refresh.

Intake mapping:

- A `set_service_request_job_name_default` trigger fills `job_name` from `appliance_type` on insert/update when missing.
- This covers intake conversion and customer-created jobs without rewriting historical rows.

## Task 165.24 - Job Details layout correction and contextual descriptions

Scope:

- Corrects the Task 165.23 mobile Job Details layout.
- The main mobile Details screen now shows only three rows: `Job Name`, `Description`, and `Tags`.
- `Ad Source` is no longer a separate row on the main screen. It remains persisted through `marketing_source_id` and is edited inside the Job Name editor.

Job Details editor:

- Tapping `Job Name` opens one compact bottom sheet titled `Job Details`.
- The sheet shows two collapsed selector fields: `Job Type` and `Ad Source`.
- Job Type and Ad Source lists are hidden until their selector is tapped.
- Each expanded selector has its own search, scrollable list, current selection behavior, and add-new field.
- Ad Source supports clearing the current source.
- Save preserves unchanged fields, so changing only Ad Source does not overwrite Job Name, and changing only Job Type does not clear Ad Source.

Description catalog behavior:

- Tapping `Description` now shows problem options contextual to the current Job Type.
- If no Job Type can be resolved, the sheet shows `Choose Job Name first` instead of dumping all problems.
- New custom problems are saved through the existing details RPC and are attached to the current job type context.
- If the current free-text description is not in the selected job type catalog, the UI keeps the text and warns the technician instead of deleting it silently.

Divider behavior:

- The three main rows use one fixed label column and matching right-side content dividers.
- Dividers start after the label column and no longer create full-width, uneven row borders.

Migration:

- `supabase/migrations/0064_job_type_problem_catalog_seed_apply_ready.sql`
- This is a seed-only, forward-only migration that reuses the `0063` catalog architecture.
- It adds missing contextual default problems such as washer `Door locked`, washer `Error code`, refrigerator `Not making ice`, refrigerator `Error code`, dishwasher `Error code`, dryer `Shutting off`, and dryer `Error code`.
- It does not create a second catalog system, delete data, or modify existing production schema design.

## Task 165.26 - Mobile Technician assignment block

Scope:

- Adds a mobile-only `Technician` row after the Job Details rows in Job Workspace Details.
- The row is borderless, matches the existing Schedule/Status/Job Details density, and opens a bottom sheet instead of navigating away.
- The row shows initials/avatar color, technician name, and assignment state. It never exposes UUIDs, slugs, or debug values.

Assignment source of truth:

- Canonical primary assignment field: `service_requests.assigned_technician_profile_id`.
- Existing scheduled jobs also update the linked `appointments.technician_profile_id`.
- Existing appointment id, appointment date, and appointment window are preserved.
- Unscheduled jobs may be assigned a technician without creating an appointment.

Selector behavior:

- Bottom sheet title: `Assign Technician`.
- Includes search, scrollable technician list, current assignment state, selected state, ZIP coverage hint, and availability hint.
- Active verified marketplace technician profiles are reused from the existing scheduler profile loader.
- Profiles without photos use initials and the existing `avatar_color`.

Validation:

- Browser hints check active profile, ZIP coverage, and working-window availability from existing availability rules/default business hours.
- Server save remains authoritative and validates dashboard job access, technician management access, active technician state, service ZIP coverage, appointment availability, and active appointment overlap.
- Same-technician save is allowed.
- ZIP mismatch and conflicts return clear errors and do not create duplicate appointments.

API and migration:

- `PATCH /api/service-requests/[id]/appointments` now supports `operation: "assign_technician"`.
- New apply-ready migration: `supabase/migrations/0065_job_workspace_technician_assignment_grants_apply_ready.sql`.
- `0065` grants only the service-role privileges needed for the trusted server assignment path, including `appointments.technician_profile_id` update and `service_requests.assigned_technician_profile_id` update.

## Task 165.27 - Mobile Details cleanup and Attachments actions

Scope:

- Cleans the mobile-only Job Workspace Details default screen after the new Technician row.
- Desktop blocks and underlying data/backend behavior were preserved.

Mobile blocks hidden from the default Details screen:

- `Appliance / Problem`
- `Technician findings`
- `More job controls`
- `Service address details`

Reason:

- Job Name and Description now cover the core work summary.
- Client already exposes address and maps access.
- Large findings, workflow, and service-address blocks add mobile scroll and are better kept off the default one-hand flow.

Attachments row:

- Added immediately under `Technician`.
- Label: `Attachments`.
- Style: white, borderless row with current divider system.
- Actions: Camera and Gallery icon buttons with invisible action borders and 44px tap targets.
- Tapping the row/label opens Gallery.
- Tapping Camera opens the camera input and stops propagation so Gallery does not also fire.

Existing upload flow reused:

- Storage bucket: `service-request-photos`.
- Upload helper: `uploadTechnicianServiceRequestPhoto(...)`.
- Metadata write path: `add_service_request_photo_rpc(...)`.
- After upload, `loadPhotos()` refreshes signed URLs and attachment state without a page refresh.

Input behavior:

- Camera input: `type="file"`, `accept="image/*"`, `capture="environment"`.
- Gallery input: `type="file"`, `accept="image/*"`.
- Camera and Gallery remain single-file actions in this task.

## Task 165.28 - Mobile attachment upload compatibility fix

Root cause:

- Mobile Safari over the local LAN URL can run in a context where `crypto.randomUUID()` is unavailable.
- `frontend/src/lib/service-request-photos.ts` previously called `crypto.randomUUID()` directly in `buildServiceRequestPhotoPath(...)`.
- When that call threw, the attachment upload stopped before Supabase upload and the mobile UI could remain on `Uploading photo...`.

Safe ID helper:

- Added `createSafePhotoStorageId(...)`.
- Native branch uses `globalThis.crypto?.randomUUID` only after confirming it is a function.
- Fallback branch uses `globalThis.crypto?.getRandomValues` to create a UUID-v4-like identifier.
- Final fallback uses timestamp plus random strings and sanitizes the result to safe path characters.
- The helper uses `globalThis`, does not access `window`, and runs only when a path is generated.

Storage path and filename safety:

- Existing bucket/table/RPC flow is unchanged.
- Path shape remains `requestId/scope/unique-id-safe-name.extension`.
- Original filenames are stripped of path separators, backslashes, query/hash-like suffixes, and unsafe characters.

Upload state cleanup:

- Attachment Camera/Gallery upload calls catch thrown errors and reset selected-file/loading state to an error message.
- The existing Photos tab add-photo flow uses the same cleanup pattern.
- Canceling the picker leaves upload state unchanged and does not leave the UI stuck uploading.

QA notes:

- Browser/static QA can verify attributes and error-safe code paths.
- Real iPhone Safari camera/gallery capture over LAN must be verified on device before claiming real capture persistence.

## Task 165.29 - Attachments preview and mobile gallery

Scope:

- Mobile-only Job Workspace Details Attachments block.
- No storage bucket, photo table, upload helper, signed URL logic, backend route, Supabase schema, Finance, Timeline, Customer card, Schedule, or desktop layout changes.

Count source:

- Count uses `photosState.photos.length`.
- `photosState` is loaded from existing `public.service_request_photos` records for the current `service_request_id`.
- The count excludes client avatars, property images, estimates, invoices, and unrelated storage objects because those are not in `service_request_photos` for the job.

Thumbnail strategy:

- The mobile Attachments row shows `No files`, `1 photo`, or `{n} photos`.
- A compact preview strip appears only when photos exist.
- The strip shows the newest three `service_request_photos` records using the existing signed URLs created by `loadPhotos()`.
- If more than three photos exist, a compact `+N` tile opens the hidden portion of the internal gallery.
- If a signed URL cannot be created, the thumbnail area shows a small preview-unavailable placeholder and does not break the layout.

Row click behavior:

- Camera icon opens the existing camera file input.
- Gallery icon opens the existing system gallery file input.
- The Attachments label/count/free row area opens the internal job gallery.
- Taps are separated so Camera/Gallery upload actions do not also open the viewer.

Gallery and viewer:

- The internal mobile gallery is a full-screen overlay titled `Attachments`.
- It shows count, close, Camera, Add from Gallery, loading/error/empty states, and a 3-column grid of all job photos.
- Tapping a thumbnail opens a full-screen viewer with close, return-to-gallery, previous/next controls, current index, filename/type, and upload date.
- Grid thumbnails are square, lazy-loaded, object-cover images using existing signed URLs.

Delete support:

- Job photo delete/remove is not currently implemented for `service_request_photos`.
- Existing delete support only exists for client-avatar storage paths.
- The Task 165.29 gallery is read-only for deletion; do not add fake local delete.

Persistence behavior:

- Upload continues to use `uploadTechnicianServiceRequestPhoto(...)`.
- After upload, `loadPhotos()` refreshes the existing photo list and signed URLs.
- Because the row, strip, internal gallery, and viewer all read `photosState`, count and thumbnails update without a page refresh and remain after reload through the existing table/storage path.
