# Real Data Model Plan

## Purpose

This document plans the real Supabase/Postgres data model for WeRepairRefrigerators leads, service requests, jobs, repair cases, customer addressing, pricing, open jobs, and future AI article generation.

This is planning only. Do not create migrations, apply SQL, change frontend behavior, or create tables from this document without a separate implementation task.

The model should support the Houston refrigerator repair MVP first, while staying flexible enough for future appliance categories, HVAC, electrical, plumbing, locksmith, smart home, emergency dispatch, contractor teams, and AI-generated SEO content.

## Section 1: Core Entities

### leads

Purpose: CRM-facing record that represents a customer opportunity after intake. A lead may be assigned to a company or technician, converted into a job, converted into a repair case, or closed.

Recommended fields:

- `id`
- `service_request_id`
- `company_id`
- `assigned_technician_profile_id`
- `customer_first_name`
- `customer_last_name`
- `phone`
- `email`
- `city`
- `state`
- `zip`
- `appliance_type`
- `brand`
- `issue_summary`
- `preferred_window`
- `source`
- `status`
- `priority`
- `privacy_level`
- `created_at`
- `updated_at`

Notes:

- Private contact fields should not be visible to unassigned technicians.
- Lead source should distinguish homepage CTA, schedule-service, ZIP search, technician profile, brand page, service page, location page, admin entry, and referral.
- `privacy_level` can later support staged visibility such as `public_preview`, `technician_preview`, `assigned_full`, and `admin_full`.

### service_requests

Purpose: Initial customer-facing intake record. This is the first source of truth for customer request intent and may exist before a lead, job, or repair case.

Recommended fields:

- `id`
- `customer_profile_id`
- `requested_technician_profile_id`
- `requested_company_id`
- `lead_id`
- `customer_name`
- `phone`
- `email`
- `street_address`
- `unit`
- `city`
- `state`
- `zip`
- `latitude`
- `longitude`
- `gate_access_notes`
- `appliance_type`
- `brand`
- `issue_description`
- `preferred_service_window`
- `service_category`
- `industry`
- `source`
- `status`
- `estimated_service_call_cents`
- `created_at`
- `updated_at`

Notes:

- Public intake can create a service request before account creation.
- `industry` should default to `appliance_repair` for this MVP, allowing later expansion to HVAC, plumbing, electrical, and similar verticals.
- Service request contact and address fields are private.

### jobs

Purpose: Dispatchable work item derived from a lead or open job acceptance. Jobs carry scheduling, assignment, status, and field workflow state.

Recommended fields:

- `id`
- `service_request_id`
- `lead_id`
- `open_job_id`
- `company_id`
- `primary_technician_profile_id`
- `status`
- `job_type`
- `priority`
- `scheduled_start_at`
- `scheduled_end_at`
- `arrival_window_label`
- `service_call_price_cents`
- `customer_approved_price_cents`
- `dispatch_notes`
- `created_at`
- `updated_at`

Notes:

- Job status should be separate from lead status and repair case status.
- Suggested statuses: `draft`, `scheduled`, `assigned`, `in_progress`, `completed`, `cancelled`, `no_show`, `converted_to_repair_case`.
- Jobs should later support multiple technicians through `job_assignments`.

### job_assignments

Purpose: Join table between jobs and technicians. It supports primary/secondary technicians, reassignment history, and future contractor teams.

Recommended fields:

- `id`
- `job_id`
- `technician_profile_id`
- `company_id`
- `assignment_role`
- `status`
- `assigned_by_profile_id`
- `assigned_at`
- `accepted_at`
- `declined_at`
- `completed_at`
- `created_at`

Notes:

- Suggested `assignment_role` values: `primary`, `helper`, `trainee`, `expert_review`.
- Suggested statuses: `assigned`, `accepted`, `declined`, `completed`, `removed`.
- This table should become the main source for technician-specific job visibility.

### repair_cases

Purpose: Technical record documenting the repair work. Repair cases can be created from a job, created manually, or later used as source material for AI-assisted SEO content.

Recommended fields:

- `id`
- `service_request_id`
- `lead_id`
- `job_id`
- `company_id`
- `technician_profile_id`
- `industry`
- `service_category`
- `city`
- `state`
- `zip`
- `appliance_type`
- `brand`
- `model_number`
- `serial_number`
- `symptoms`
- `diagnosis`
- `root_cause`
- `repair_summary`
- `repair_status`
- `parts_summary`
- `labor_summary`
- `technician_private_notes`
- `customer_safe_notes`
- `ai_ready_notes`
- `voice_transcription`
- `public_summary_status`
- `created_at`
- `updated_at`

Notes:

- Public SEO pages must never read raw repair cases directly.
- `customer_safe_notes` and `ai_ready_notes` should be intentionally sanitized before AI article drafts are created.
- Serial numbers should remain private/internal.

### repair_case_photos

Purpose: Metadata for repair case images, appliance labels, model stickers, before/after photos, and future public-safe derivatives.

Recommended fields:

- `id`
- `repair_case_id`
- `uploaded_by_profile_id`
- `storage_bucket`
- `storage_path`
- `photo_type`
- `visibility`
- `caption`
- `contains_serial_number`
- `public_derivative_storage_path`
- `created_at`

Notes:

- Appliance label photos should default to private because they may contain serial numbers.
- Public use should require explicit approval and preferably a sanitized derivative.

### repair_case_notes

Purpose: Append-oriented notes connected to a repair case, useful for technician updates, customer-safe summaries, admin review, and AI preparation.

Recommended fields:

- `id`
- `repair_case_id`
- `author_profile_id`
- `note_type`
- `body`
- `visibility`
- `created_at`
- `updated_at`

Notes:

- Suggested `note_type` values: `technician_private`, `customer_safe`, `admin_review`, `ai_ready`, `voice_transcript`, `seo_review`.
- Keep private notes out of public article generation.

### technician_profiles

Purpose: Technician-specific profile, verification, matching, and marketplace eligibility record.

Recommended fields:

- `id`
- `profile_id`
- `company_id`
- `public_profile_id`
- `verification_status`
- `business_name`
- `display_name`
- `years_experience`
- `bio_private`
- `service_summary_public`
- `availability_status`
- `workload_status`
- `marketplace_enabled`
- `created_at`
- `updated_at`

Notes:

- Public technician pages should read from approved public fields or a public projection, not raw private technician profiles.
- Verification status drives access to open jobs and private technician community.

### companies

Purpose: Company/team account for owner-managed technicians, leads, pricing, dispatch, and billing.

Recommended fields:

- `id`
- `owner_profile_id`
- `name`
- `slug`
- `phone`
- `email`
- `status`
- `default_city`
- `default_state`
- `billing_status`
- `created_at`
- `updated_at`

Notes:

- Company data should be scoped by `company_id`.
- Company owners should not access other companies' leads, jobs, repair cases, or pricing overrides.

### pricing_rules

Purpose: Configurable service call pricing model by industry, category, appliance type, brand tier, urgency, distance, company, and market.

Recommended fields:

- `id`
- `company_id`
- `industry`
- `service_category`
- `appliance_type`
- `brand`
- `brand_tier`
- `market`
- `zip`
- `base_service_call_cents`
- `emergency_surcharge_cents`
- `after_hours_surcharge_cents`
- `travel_surcharge_cents`
- `commercial_surcharge_cents`
- `built_in_surcharge_cents`
- `is_active`
- `created_at`
- `updated_at`

Notes:

- Platform defaults can have `company_id = null`.
- Company-specific overrides can be added after company ownership is stable.

### service_areas

Purpose: ZIP/city/neighborhood coverage for technicians and companies.

Recommended fields:

- `id`
- `company_id`
- `technician_profile_id`
- `industry`
- `city`
- `state`
- `zip`
- `service_area_name`
- `coverage_type`
- `priority`
- `is_active`
- `created_at`

Notes:

- Suggested `coverage_type` values: `primary`, `nearby`, `extended`, `emergency_only`.
- This table supports ZIP matching, open job eligibility, travel surcharges, and SEO location pages.

### ai_article_drafts

Purpose: Human-reviewed AI output created from public-safe repair case data.

Recommended fields:

- `id`
- `repair_case_id`
- `company_id`
- `technician_profile_id`
- `source_city`
- `source_zip`
- `brand`
- `appliance_type`
- `service_category`
- `title`
- `slug`
- `meta_description`
- `draft_body`
- `faq_json`
- `schema_json`
- `internal_links_json`
- `image_prompt`
- `privacy_review_status`
- `seo_review_status`
- `publish_status`
- `created_at`
- `updated_at`

Notes:

- Drafts should only be generated from sanitized repair case fields.
- Publication requires human review and a separate public page/published content layer.

## Section 2: Customer Address Handling

Recommended customer address/contact fields:

- `customer_name`
- `phone`
- `email`
- `street_address`
- `unit`
- `city`
- `state`
- `zip`
- `latitude`
- `longitude`
- `gate_access_notes`

Visibility model:

- Before technician acceptance: show only city, ZIP, general service area, appliance type, brand, issue summary, preferred window, and estimated service call value.
- During open job preview: hide full customer name, phone, email, street address, unit, exact coordinates, and gate/access notes.
- After assignment/acceptance: unlock full address and customer contact only for the assigned technician, company owner, and admin.
- Customer portal later: customer can see and update their own address/contact details.
- Public SEO: never expose full address, phone, email, exact coordinates, gate notes, private notes, or serial numbers.

Privacy considerations:

- Use ZIP/city for technician matching before acceptance.
- Store latitude/longitude only when needed for dispatch; do not expose it publicly.
- Treat gate/access notes as sensitive because they can reveal entry details.
- Consider separate encrypted columns or restricted views for phone, email, street address, and access notes before production.
- Do not copy private customer data into AI prompts for public SEO generation.

## Section 3: Marketplace Workflow

Target workflow:

1. Customer submits request through `/schedule-service`, ZIP search, public technician profile, brand page, service page, or location page.
2. Server validates the intake and creates a `service_requests` row.
3. Pricing engine calculates a service call estimate using `pricing_rules`, `service_areas`, urgency, appliance type, brand tier, commercial/built-in flags, and travel distance.
4. System creates a `leads` row for CRM tracking.
5. If no technician is selected, system creates an `open_jobs` row with privacy-limited details.
6. Eligible technicians see the open job preview with city/ZIP, appliance type, brand, symptom summary, preferred window, service call estimate, and lead value.
7. Technician accepts the open job through a server-side transaction/RPC.
8. System creates a `job_assignments` row and links/updates the `jobs` row.
9. Full customer details unlock only for the assigned technician, company owner, and admin.
10. Technician completes the work and creates or updates a `repair_cases` row.
11. Sanitized repair case notes can feed `ai_article_drafts`.
12. Human review approves or rejects public-safe SEO content.

Important constraints:

- Open job acceptance must not be a direct client-side update.
- Assignment should be transactional to prevent double acceptance.
- Customer private data is locked until assignment.
- Repair case generation should never auto-publish content.

## Section 4: Service Call Pricing Model

Pricing should support platform defaults first, then company-specific overrides later.

Pricing dimensions:

- Standard appliance repair.
- Built-in refrigeration.
- High-end brands.
- Commercial refrigeration or ice machines.
- Emergency service.
- After-hours or weekend service.
- Distance/travel surcharge.
- ZIP/market-specific defaults.
- Company-specific overrides.

Suggested defaults:

- Standard appliance service call: baseline platform default.
- Built-in/high-end refrigeration: higher baseline or surcharge.
- Commercial refrigeration/ice machine: separate commercial surcharge.
- Emergency/after-hours: additive surcharge.
- Distance/travel: additive surcharge by ZIP, miles, or service-area type.

Who controls pricing:

- Platform controls default marketplace pricing.
- Company owners can later override their own service call rules.
- Admins can manage global defaults, markets, and rule conflicts.
- Technicians may view assigned/open job estimated value, but should not change pricing unless company policy allows.

Customer visibility:

- Customers should see a simple service call estimate or range before submitting.
- The estimate should state that final repair cost depends on diagnosis, parts, and approval.
- Emergency/after-hours charges should be visible before confirmation.

Technician visibility:

- Before acceptance: show estimated service call value and general conditions.
- After assignment: show full job pricing context, customer-approved estimate, and any company policy notes.

## Section 5: Repair Case Structure

Repair case fields should support field operations, internal QA, customer-safe summaries, and AI article generation.

Recommended fields:

- `industry`
- `service_category`
- `appliance_type`
- `brand`
- `model_number`
- `serial_number`
- `symptoms`
- `customer_complaint`
- `diagnosis`
- `root_cause`
- `parts_used`
- `labor_performed`
- `repair_status`
- `technician_private_notes`
- `customer_safe_notes`
- `ai_ready_notes`
- `voice_transcription`
- `photo_summary`
- `estimated_cost_cents`
- `final_cost_cents`
- `public_summary_status`

AI/SEO support:

- `customer_safe_notes` should describe work without PII.
- `ai_ready_notes` should be privacy-reviewed and structured.
- `voice_transcription` should remain private until converted into safe notes.
- `public_summary_status` should track `not_ready`, `needs_review`, `approved_for_ai`, `draft_created`, `published`, or `rejected`.

Parts/labor:

- Start with text/JSON summaries in early persistence if needed.
- Add normalized `repair_case_parts` and labor line tables later if invoices, inventory, or analytics require it.

## Section 6: AI Future Integration

Repair cases can later generate:

- SEO article drafts.
- Public repair case summaries.
- FAQ ideas.
- FAQ schema.
- LocalBusiness/Service schema snippets.
- Internal link suggestions.
- Brand/service/city keyword variants.
- Social posts.
- Image prompts.
- Technician knowledge snippets.

AI pipeline:

1. Technician completes or updates repair case.
2. System creates a sanitized AI input from city, service area, appliance type, brand, symptom, diagnosis, root cause, repair summary, and customer-safe notes.
3. AI draft is stored in `ai_article_drafts`.
4. Draft receives privacy review and SEO review.
5. Approved draft can become a public page or public repair case summary.
6. Rejected drafts stay private for audit.

Never include:

- Customer phone/email.
- Full street address or exact coordinates.
- Gate/access notes.
- Private technician notes.
- Serial numbers.
- Payment details.

## Section 7: Ownership And RLS

### Lead ownership

- Anonymous service requests are platform-owned until linked to a customer account or assigned company.
- Authenticated customers can read their own requests.
- Company owners can read company-scoped leads.
- Assigned technicians can read assigned leads.
- Admins can read all.

### Job ownership

- Jobs belong to a company when company-scoped.
- Jobs are visible to assigned technicians through `job_assignments`.
- Customers may later see limited job status only.
- Admins can read and manage all through audited tools.

### Technician visibility

- Before acceptance: eligible technicians see only open job preview fields.
- After assignment: assigned technicians see full customer address/contact needed to perform service.
- Technicians should not see unrelated company/customer records.

### Company owner visibility

- Company owners see leads, jobs, assignments, repair cases, pricing rules, service areas, and technician profiles scoped to their `company_id`.
- Company owners should not see other companies' customer data or private operations.

### Admin visibility

- Admins can view and manage records for support, moderation, verification, and safety.
- Admin actions should be audited.

### Open marketplace visibility

- Open jobs expose only city, ZIP, service area, appliance type, brand, issue summary, preferred window, urgency, and estimated value.
- Open jobs hide full address, phone, email, exact coordinates, access notes, and private notes.
- Open job claiming should use server-side locking and RLS-safe RPC.

### Private customer data boundaries

- Contact/address fields should never be public.
- Public repair case pages should use sanitized approved projections, not raw `repair_cases`.
- AI article drafts should use sanitized fields only.

## Section 8: Migration Strategy

### Phase 1: Leads, basic jobs, and basic repair cases

Recommended tables:

- `service_requests`
- `leads`
- `jobs`
- `repair_cases`

Scope:

- Persist `/schedule-service` intake.
- Persist dashboard lead inbox data.
- Create basic jobs from leads.
- Create basic repair cases from jobs or manually.
- Keep open jobs and pricing simple or mocked until Phase 2.
- Add strict RLS before storing real customer PII.

### Phase 2: Assignments, pricing, companies, and open jobs

Recommended tables:

- `job_assignments`
- `open_jobs`
- `pricing_rules`
- `service_areas`
- `companies`
- `technician_profiles`

Scope:

- Add company ownership and team scoping.
- Add technician assignment history.
- Add open job preview/claim flow.
- Add service call pricing and travel surcharge logic.
- Add ZIP/service-area matching.

### Phase 3: AI pipeline, attachments, voice notes, and scheduling

Recommended tables:

- `repair_case_photos`
- `repair_case_notes`
- `ai_article_drafts`
- future `repair_case_parts`
- future scheduling/availability tables
- future voice note/transcription records

Scope:

- Add private storage metadata.
- Add voice transcription support.
- Add AI-ready note preparation.
- Add reviewed SEO draft workflow.
- Add richer scheduling and dispatching.

## Section 9: Future-Proofing

The model should avoid refrigerator-only assumptions in core workflow tables.

Use broad fields:

- `industry`
- `service_category`
- `appliance_type`
- `brand`
- `service_area`
- `job_type`
- `pricing_rule_type`

Future industries:

- HVAC: units, thermostats, compressors, air handlers, emergency cooling/heating.
- Plumbing: leaks, drains, water heaters, emergency calls.
- Electrical: panels, outlets, breakers, EV chargers, emergency repairs.
- Smart home: cameras, thermostats, networking, automation.
- Locksmith: lockouts, rekeys, access control, emergency dispatch.

Future workflow support:

- Emergency dispatch with urgency-based pricing and response windows.
- Contractor teams with company memberships and job assignments.
- Multiple technicians per job.
- Paid leads and subscription eligibility.
- Geographic expansion by market, city, ZIP, and service area.
- Public SEO pages generated from approved, privacy-safe service records.

## Implementation Notes

- This plan does not create database tables.
- Create migrations only in a separate implementation task.
- Review RLS before storing real customer contact or address data.
- Do not use service-role keys in frontend code.
- Do not expose customer PII to public routes, public SEO pages, or AI article prompts.
- Start narrow: Houston, appliance repair, service requests, leads, jobs, and repair cases.
