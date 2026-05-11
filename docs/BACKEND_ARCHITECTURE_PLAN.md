# Backend Architecture Plan

## Current State Summary

WeRepairRefrigerators is currently a frontend-first Next.js App Router MVP. The product has three working mock surfaces:

- Public marketplace: homepage, public SEO pages, technician profiles, ZIP technician discovery, and `/schedule-service` intake.
- Dashboard CRM: repair cases, lead inbox, lead conversion preview, coverage board, analytics, open jobs, and AI workflow mock.
- Private technician community: community discussions, help request creation, discussion detail threads, multilingual previews, AI summary previews, private knowledge case previews, reputation, and expert badges.

All current workflows are static or local UI state. There is no backend, authentication, database persistence, file storage, live dispatch, realtime chat, Stripe, AI API, translation API, or vector/RAG system connected yet.

Task 41 added the first practical Supabase client foundation in `frontend/src/lib/supabase`. These helpers only create typed Supabase clients when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are configured, return `null` when missing, and do not change current mock-only app behavior.

## Backend Goals

The future backend should turn the current mock platform into a real SaaS marketplace while preserving public/dashboard/community boundaries.

For table-level schema planning, use `docs/SUPABASE_DATA_MODEL_PLAN.md` before creating migrations, storage policies, or RLS policies. For permission policy planning, use `docs/RLS_PERMISSION_ARCHITECTURE_PLAN.md` before writing RLS policies, protected mutations, admin tools, or API routes. For service/API boundary planning, use `docs/API_BACKEND_SERVICE_ARCHITECTURE_PLAN.md` before adding API routes, Edge Functions, uploads, webhooks, AI endpoints, realtime, or background jobs.

Planned backend capabilities:

- Supabase Postgres as the source of truth.
- Supabase Auth for customer, technician, company owner, and admin identity.
- Role-based permissions backed by Row Level Security.
- Existing frontend Supabase helpers should remain lightweight until auth, RLS, and persistence work begins.
- Supabase Storage for private repair photos, appliance labels, technician assets, and future public images.
- Realtime only after auth, RLS, moderation, and rate limits are in place.
- Server-side mutations for leads, repair cases, open job claiming, community replies, accepted solutions, reputation events, and payments.
- AI/RAG later, server-side only, with privacy filtering and manual review.
- Stripe later for subscriptions, paid leads, premium placement, expert community access, and payout-compatible records.
- Thin backend first, with dedicated services, queues, realtime, and heavy AI processing extracted only after core persistence and permission boundaries are stable.

## User Roles

### customer

- Can view public marketplace and public SEO pages.
- Can create service requests and view their own request status if a customer account or secure request token exists.
- Can edit limited contact preferences, issue details, and preferred service windows before dispatch.
- Must never access dashboard CRM, private technician community, other customers' leads, technician internal notes, dispatch locks, reputation internals, or billing data that is not their own.

### technician

- Can view assigned leads, assigned repair cases, eligible open jobs, own technician profile, and verified technician community areas.
- Can create repair help requests, discussion replies, lead/job updates, and repair case notes for assigned work.
- Can edit own public profile fields, own availability preferences, and assigned job progress where permitted.
- Must never access unassigned private customer details outside eligible marketplace views, other companies' CRM data, admin-only audit logs, service-role data, or billing data outside their own account.

### expert_technician

- Can do everything a technician can do.
- Can contribute expert replies, accepted solution recommendations, private knowledge case proposals, and expert community guidance.
- Can view expert-only community queues if future subscription or verification gates allow it.
- Must never access admin-only data, other companies' CRM records, service-role credentials, customer payment details, or private customer PII outside assigned/eligible work.

### company_owner

- Can view team technicians, company leads, assigned/open jobs within the company marketplace scope, repair cases, coverage, workload, and company analytics.
- Can create technician invitations, assignments, company repair cases, and operational settings.
- Can edit team profiles, coverage, lead assignment, company status, and company-owned records.
- Must never access other companies' private CRM records, other companies' billing details, private community moderation queues unless separately authorized, or service-role credentials.

### admin

- Can view and moderate operational data across the platform.
- Can create or edit administrative records, resolve disputes, review audit logs, moderate community content, and support billing investigations.
- Can perform sensitive actions only through audited server-side tools.
- Must never expose customer PII publicly, bypass audit logging, use service-role credentials in client code, or publish private community/RAG data without review.

## Data Boundary Model

### Public SEO Data

Public SEO data includes public brand, service, location, public repair case, technician profile, and marketplace landing content. It must contain only public-safe copy, generalized service areas, public technician profile fields, and privacy-reviewed repair summaries.

### Customer Lead Data

Customer lead data includes intake submissions, customer first name, contact fields, ZIP, service area, appliance details, issue summary, source attribution, and status. It is private by default and should only appear in dashboard/authenticated contexts.

### Technician Profile Data

Technician profile data has public and private slices. Public fields may include name, slug, service areas, specialties, verified badges, profile summary, and trust metrics. Private fields include internal availability, workload, payout status, moderation flags, and account settings.

### Technician Private CRM Data

Private CRM data includes repair cases, internal technician notes, diagnostic findings, lead conversion drafts, job assignment data, dispatch status, private photos, and administrative activity. It must stay behind auth and role checks.

### Community Discussion Data

Community discussion data includes repair help requests, technician messages, accepted solutions, multilingual previews, and AI summary drafts. It is dashboard-only, technician-only, and never public/indexable.

### AI/RAG Knowledge Data

AI/RAG knowledge data includes approved private knowledge cases, embeddings, summaries, diagnostic steps, false leads, final fixes, and confidence levels. It must exclude customer PII and remain role-gated to verified technicians unless explicitly approved for public SEO transformation.

### Billing/Subscription Data

Billing data includes Stripe customer IDs, subscription IDs, payment status, paid lead records, premium placement records, payout compatibility fields, and audit references. Do not store raw card data.

## Proposed Supabase/Postgres Tables

This section is the high-level backend table map. The more detailed table-by-table ownership, visibility, index, and RLS planning reference is `docs/SUPABASE_DATA_MODEL_PLAN.md`.

The table-by-table SELECT/INSERT/UPDATE/DELETE policy reference is `docs/RLS_PERMISSION_ARCHITECTURE_PLAN.md`.

### profiles

- Purpose: Auth-linked user profile and role base.
- Key fields: `id`, `auth_user_id`, `role`, `display_name`, `company_id`, `status`, `created_at`, `updated_at`.
- Ownership model: Owned by the authenticated user; company ownership through `company_id`.
- Visibility model: User can see own profile; company owners see team profiles; admins see all.
- Future notes: Keep role changes audited. Do not rely only on client-side role checks.

### technicians

- Purpose: Technician-specific public/private profile record.
- Key fields: `id`, `profile_id`, `company_id`, `public_slug`, `verification_status`, `bio`, `years_experience`, `rating_preview`, `response_time_preview`, `is_public`, `created_at`.
- Ownership model: Owned by technician profile and optionally company.
- Visibility model: Public can see approved public fields; private fields require technician/company/admin access.
- Future notes: Separate public profile views from private account/admin fields.

### technician_service_areas

- Purpose: ZIP, city, and service-area coverage.
- Key fields: `id`, `technician_id`, `zip_code`, `city`, `service_area`, `coverage_type`, `is_primary`, `created_at`.
- Ownership model: Technician/company owned.
- Visibility model: Public may see generalized service areas; exact operational rules stay private.
- Future notes: Used for ZIP discovery, open job eligibility, and dispatch routing.

### technician_specialties

- Purpose: Brand, appliance, and service expertise.
- Key fields: `id`, `technician_id`, `brand`, `appliance_type`, `service_category`, `expertise_level`, `verified_at`.
- Ownership model: Technician/company owned; verified specialties may require admin or owner approval.
- Visibility model: Public can see approved specialties; verification metadata stays private.
- Future notes: Used for matching, profile ranking, expert badges, and paid placement eligibility.

### marketplace_leads

- Purpose: Public intake and technician request records.
- Key fields: `id`, `customer_profile_id`, `customer_first_name`, `contact_phone`, `contact_email`, `zip_code`, `city`, `appliance_type`, `brand`, `issue_summary`, `preferred_window`, `source`, `status`, `matched_technician_id`, `company_id`, `created_at`.
- Ownership model: Customer-owned when authenticated; company/technician assigned after matching.
- Visibility model: Customer sees own lead; assigned technician/company sees assigned lead; admins see all.
- Future notes: Consider encrypting contact fields. Keep public repair case generation separate from lead PII.

### open_jobs

- Purpose: Unassigned marketplace jobs eligible for technician claiming.
- Key fields: `id`, `marketplace_lead_id`, `status`, `zip_code`, `service_area`, `urgency`, `estimated_lead_value`, `selected_technician_id`, `assigned_technician_id`, `lock_expires_at`, `created_at`.
- Ownership model: Platform/company-owned until accepted; then technician/company assigned.
- Visibility model: Eligible technicians see open jobs matching service area, specialty, workload, and verification rules.
- Future notes: Claiming requires transactional locking or RPC to prevent double assignment.

### job_claims

- Purpose: Claim attempts and accepted open job history.
- Key fields: `id`, `open_job_id`, `technician_id`, `status`, `claimed_at`, `expires_at`, `accepted_at`, `declined_at`.
- Ownership model: Technician-owned claim records; platform/company operational visibility.
- Visibility model: Technician sees own claims; owners/admins see company/platform claims.
- Future notes: Add unique constraints or partial indexes for one active accepted claim per job.

### repair_cases

- Purpose: CRM repair case records created manually or from leads/jobs.
- Key fields: `id`, `marketplace_lead_id`, `company_id`, `technician_id`, `city`, `zip_code`, `appliance_type`, `brand`, `model_number`, `serial_number`, `issue_description`, `technician_findings`, `repair_status`, `estimated_cost`, `internal_notes_private`, `created_at`.
- Ownership model: Company/technician owned; optionally customer-linked.
- Visibility model: Assigned technician/company/admin only; public pages use separate approved summaries.
- Future notes: Add related `repair_case_parts` and `repair_case_photos` when persistence begins.

### community_discussions

- Purpose: Private technician repair help discussions.
- Key fields: `id`, `created_by_technician_id`, `title`, `appliance_type`, `brand`, `model_number`, `symptom`, `status`, `priority`, `language`, `visibility`, `accepted_message_id`, `created_at`, `updated_at`.
- Ownership model: Created by technician; visible to verified technician community.
- Visibility model: Verified technicians and admins only; never public.
- Future notes: Add moderation status before AI summaries or knowledge case creation.

### community_messages

- Purpose: Technician-to-technician discussion replies.
- Key fields: `id`, `discussion_id`, `technician_id`, `message_body`, `language`, `translated_preview`, `is_accepted_answer`, `created_at`, `updated_at`.
- Ownership model: Author-owned, discussion-scoped.
- Visibility model: Verified technicians with community access; admins for moderation.
- Future notes: Edit history and abuse reporting should be added before realtime chat.

### knowledge_cases

- Purpose: Approved private troubleshooting summaries derived from discussions.
- Key fields: `id`, `source_discussion_id`, `title`, `appliance_type`, `brand`, `model_number`, `symptom_summary`, `diagnostic_steps`, `false_leads`, `confirmed_root_cause`, `final_fix`, `parts_used`, `confidence_level`, `normalized_language`, `embedding_status`, `approved_by`, `created_at`.
- Ownership model: Platform/private community asset.
- Visibility model: Verified technicians and admins only.
- Future notes: Embeddings should be generated only after PII filtering and approval.

### reputation_events

- Purpose: Immutable technician contribution events.
- Key fields: `id`, `technician_id`, `event_type`, `points`, `source_discussion_id`, `source_message_id`, `created_by`, `created_at`.
- Ownership model: Platform-generated event log.
- Visibility model: Technician sees own reputation; verified community may see approved leaderboard fields; admins see full event history.
- Future notes: Use events as source of truth instead of directly editing scores.

### technician_badges

- Purpose: Earned technician expertise and contribution badges.
- Key fields: `id`, `technician_id`, `badge_key`, `label`, `category`, `rarity`, `earned_at`, `awarded_by`.
- Ownership model: Platform/admin awarded or derived from reputation events.
- Visibility model: Approved badges may be public; private community badges may remain dashboard-only.
- Future notes: Some badges may affect paid lead eligibility or expert access later.

### analytics_events

- Purpose: Privacy-safe event tracking for marketplace and CRM analytics.
- Key fields: `id`, `actor_profile_id`, `session_id`, `event_type`, `lead_source`, `entity_type`, `entity_id`, `zip_code`, `metadata`, `created_at`.
- Ownership model: Platform-owned event log.
- Visibility model: Aggregated dashboards for owners/admins; raw events restricted.
- Future notes: Avoid storing unnecessary PII. Use aggregate views for dashboard analytics.

### subscriptions

- Purpose: Stripe-backed subscription state.
- Key fields: `id`, `profile_id`, `company_id`, `stripe_customer_id`, `stripe_subscription_id`, `plan_key`, `status`, `current_period_end`, `created_at`.
- Ownership model: Customer/company/technician account owned.
- Visibility model: Account owner and admins only.
- Future notes: Store Stripe identifiers and status only. Do not store card data.

### payments

- Purpose: Stripe payment and paid lead audit records.
- Key fields: `id`, `subscription_id`, `open_job_id`, `technician_id`, `stripe_payment_intent_id`, `amount_cents`, `currency`, `status`, `created_at`.
- Ownership model: Account/platform-owned financial records.
- Visibility model: Account owner/company owner/admin only.
- Future notes: Use Stripe as source of truth for payment details and disputes.

### audit_logs

- Purpose: Sensitive action audit trail.
- Key fields: `id`, `actor_profile_id`, `action`, `entity_type`, `entity_id`, `sensitive`, `ip_address`, `user_agent`, `metadata`, `created_at`.
- Ownership model: Platform-owned.
- Visibility model: Admin-only, with limited company owner views if needed.
- Future notes: Required for role changes, lead conversion, job claiming, accepted solutions, AI approvals, billing changes, and moderation.

## RLS Strategy

- Enable RLS on every table that stores user, customer, technician, CRM, community, billing, or analytics data.
- Public users can only read approved public SEO records and public technician profile fields through explicit public views.
- Customers can only view and update their own leads or service requests through `customer_profile_id` or secure request ownership.
- Technicians can view assigned leads, assigned repair cases, their own profile data, and open jobs matching verified service areas/specialties.
- Technicians can see open jobs only when the job is open, their profile is verified, and matching checks pass.
- Verified technicians can access private community discussions/messages only after community access is granted.
- Expert technicians can access the same private community plus future expert queues, based on explicit role or permission flags.
- Company owners can view and manage records scoped to their `company_id`.
- Admins can see all data through audited admin tools and policies.
- Community data must never be exposed through public policies or public SEO routes.
- Service-role access must be limited to server-side code and never used in client components.

## Dispatch / Open Jobs Locking Plan

Future open job claiming should be server-side and transactional:

1. Customer submits a request without selecting a technician.
2. Server validates intake and creates `marketplace_leads`.
3. Matching logic creates an `open_jobs` record.
4. Eligible technicians see the job based on ZIP, service area, specialty, verification, workload, and availability.
5. Technician clicks accept.
6. Server runs an RPC or transaction that locks the open job row.
7. Transaction verifies the job is still open and the technician is still eligible.
8. Transaction creates a `job_claims` record and updates `open_jobs.status` to assigned.
9. Transaction updates the lead assignment and writes an `audit_logs` event.
10. Notifications can be sent later after assignment succeeds.

The database should prevent double assignment with row locking, status checks, and unique constraints or partial indexes for active accepted claims.

## Community / Knowledge Base Plan

The technician community should stay private and verified-technician-only:

- `community_discussions` store repair help requests.
- `community_messages` store technician replies.
- Accepted answers are marked only after authenticated technician/admin action.
- Multilingual previews are stored as generated preview text only after server-side translation is introduced.
- AI summary drafts are generated server-side and reviewed before approval.
- `knowledge_cases` are created from approved discussions and accepted answers.
- Future embeddings should be generated only for approved private knowledge cases that pass PII filtering.
- Public SEO article generation must be a separate workflow with moderation and privacy review before any public page is created.

## Analytics Plan

Analytics should start as privacy-safe event tracking:

- Capture lead source attribution from Homepage CTA, Schedule Service, Technician Profile, ZIP Search, Brand Page, Service Page, and Location Page.
- Track ZIP demand, appliance type demand, brand demand, technician matching, conversion funnel, open job claims, and repair case conversion.
- Track marketplace revenue events after Stripe is introduced.
- Store raw events in `analytics_events` with minimal PII.
- Power dashboards through aggregate views or materialized views.
- Expose only aggregated analytics to company owners and technicians unless a raw event is explicitly required for support or auditing.

## Stripe / Monetization Plan

Future monetization models:

- Technician subscriptions for marketplace access.
- Paid leads based on qualified customer requests.
- Premium ZIP placement for specific service areas.
- Expert community access for verified specialists.
- Sponsored technician profiles or enhanced public placement.

Stripe should own payment instruments, invoices, disputes, and card data. The application database should store Stripe IDs, plan/status fields, lead/payment associations, and audit records only.

## Security & Privacy Requirements

- No customer PII on public pages.
- Dashboard routes require authentication before production.
- Technician community requires verified technician access before production.
- Service-role keys must stay server-only.
- Audit logs are required for sensitive mutations.
- Storage buckets should be separated by purpose: public assets, private repair uploads, private appliance labels, technician profile assets, community attachments, and AI artifacts.
- Private uploads should use signed URLs and short expiry windows.
- Rate limiting and abuse protection are required for intake, login, open job claiming, community posting, AI generation, and payment-adjacent endpoints.
- AI, translation, and RAG systems must filter customer PII and require review before public publication or indexing.

## Implementation Phases

### Phase 1: Supabase foundation

- Create Supabase project.
- Add `profiles`.
- Add authentication.
- Add roles and permission checks.
- Protect dashboard routes.
- Enable baseline RLS and audit logging patterns.

### Phase 2: Marketplace leads persistence

- Persist `/schedule-service` intake.
- Persist lead source attribution.
- Add dashboard lead inbox reads.
- Add validated lead status updates.
- Keep customer PII private.

### Phase 3: Open jobs and claiming

- Add `open_jobs` and `job_claims`.
- Implement eligibility queries.
- Implement transactional claiming/locking.
- Add assignment status transitions.
- Add audit events.

### Phase 4: Technician community persistence

- Persist community discussions and messages.
- Require verified technician access.
- Add moderation and abuse reporting.
- Add accepted answer workflow.

### Phase 5: Reputation system

- Add reputation events.
- Add technician badges.
- Derive leaderboard views from events.
- Gate expert features through verified reputation data.

### Phase 6: Analytics events

- Add `analytics_events`.
- Add server-side event capture.
- Add aggregate views for dashboard analytics.
- Avoid raw PII in analytics.

### Phase 7: Stripe monetization

- Add subscriptions and payments.
- Add webhook handling.
- Add paid lead and premium placement records.
- Add payout-compatible audit trails.

### Phase 8: AI/RAG

- Add server-side AI generation boundaries.
- Add private translation previews.
- Add reviewed knowledge case generation.
- Add vector/RAG indexing for approved private knowledge only.
- Add manual approval before public SEO publishing.

## Integration Notes

- Analytics mocks map to `analytics_events` and aggregate analytics views.
- Open jobs mock maps to `open_jobs` and `job_claims`.
- Community mocks map to `community_discussions` and `community_messages`.
- Repair help request form maps to `community_discussions`.
- Discussion detail maps to `community_messages`, accepted answers, and `knowledge_cases`.
- Reputation mock maps to `reputation_events` and `technician_badges`.
- Lead inbox maps to `marketplace_leads`.
- Lead conversion preview maps to `repair_cases`.
- Public schedule-service intake maps to `marketplace_leads` and optionally `open_jobs`.
- Technician discovery maps to `technicians`, `technician_service_areas`, `technician_specialties`, and future availability data.
