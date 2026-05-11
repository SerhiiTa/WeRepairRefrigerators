# Supabase Data Model Plan

## Purpose

This document plans the future Supabase/Postgres data model for WeRepairRefrigerators. It is documentation-only. No Supabase project, migrations, packages, auth middleware, environment variables, or backend code are implemented yet.

The plan follows the current project rules:

- Frontend-first MVP.
- Mock workflows before backend.
- Public marketplace stays open.
- Dashboard requires auth later.
- Open jobs and private community require `verified_technician` or higher.
- Company/team views require company ownership.
- Admin actions require explicit admin role and audit logging.
- Public, dashboard, community, and admin data boundaries stay separate.

## Data Boundary Overview

### Public SEO content

Public SEO content includes brand pages, service pages, location pages, public repair case summaries, public technician profile cards, and landing content. It must never contain customer phone numbers, emails, full addresses, private notes, private repair photos, or private community discussion content.

### Private customer data

Private customer data includes service request contact details, phone/email, preferred service windows, issue details, and request status. It belongs to the customer and the assigned company/technician only after matching or assignment.

### Technician dashboard data

Technician dashboard data includes assigned leads, jobs, repair cases, photos, private notes, appliance label data, findings, conversion previews, and workflow status. It requires auth and role checks.

### Company/team data

Company/team data includes company profiles, company members, team technicians, company-scoped leads, jobs, repair cases, coverage, analytics, and billing ownership. It requires `company_id` scoping.

### Community knowledge data

Community knowledge data includes private posts, replies, accepted solutions, repair help threads, reputation events, badges, and future knowledge cases. It is verified-technician-only and never public by default.

### Admin/audit data

Admin/audit data includes role changes, verification decisions, assignment events, moderation actions, open job claims, accepted solutions, sensitive updates, and future billing events. Audit data should be admin-only, append-oriented, and protected from normal user edits.

## Core Tables

### profiles

- Purpose: Base authenticated user profile linked to Supabase Auth.
- Key fields: `id`, `auth_user_id`, `role`, `status`, `display_name`, `company_id`, `created_at`, `updated_at`.
- Ownership model: Owned by the authenticated user; optionally linked to a company.
- Public/private visibility: Private by default. Public display should come through `public_profiles`.
- Suggested indexes: `auth_user_id`, `role`, `company_id`, `status`.
- Future RLS notes: Users can read/update limited own profile fields. Company owners can read company member profiles. Admins can manage all. Role/status changes require admin policy and audit logs.

### technician_profiles

- Purpose: Private technician profile and verification record.
- Key fields: `id`, `profile_id`, `company_id`, `verification_status`, `business_name`, `years_experience`, `service_summary`, `availability_status`, `created_at`, `updated_at`.
- Ownership model: Owned by technician profile; company-scoped when technician belongs to a company.
- Public/private visibility: Private by default. Public-safe fields should be copied or exposed through `public_profiles`.
- Suggested indexes: `profile_id`, `company_id`, `verification_status`.
- Future RLS notes: Technician can read/update own onboarding fields. Company owner can manage team technician records. Admin can verify, reject, or suspend.

### companies

- Purpose: Service company account for team ownership, billing, and CRM scoping.
- Key fields: `id`, `name`, `slug`, `owner_profile_id`, `status`, `billing_status`, `created_at`, `updated_at`.
- Ownership model: Owned by company owner.
- Public/private visibility: Private by default; public display requires separate approved profile/page data.
- Suggested indexes: `slug`, `owner_profile_id`, `status`, `billing_status`.
- Future RLS notes: Company owners can read/update their company. Company members can read limited company context. Admins can manage all.

### company_members

- Purpose: Join table for company teams and permissions.
- Key fields: `id`, `company_id`, `profile_id`, `member_role`, `status`, `invited_by`, `joined_at`, `created_at`.
- Ownership model: Company-owned membership record.
- Public/private visibility: Private company/team data.
- Suggested indexes: `company_id`, `profile_id`, `member_role`, `status`.
- Future RLS notes: Company owners can manage company memberships. Members can read their own membership. Admins can manage all.

### customer_profiles

- Purpose: Optional customer account or portal identity.
- Key fields: `id`, `profile_id`, `first_name`, `preferred_contact_method`, `created_at`, `updated_at`.
- Ownership model: Owned by customer profile.
- Public/private visibility: Private. Never expose contact data publicly.
- Suggested indexes: `profile_id`.
- Future RLS notes: Customer can read/update own customer profile. Assigned company/technician should not need broad customer profile access unless required for service.

### service_requests

- Purpose: Initial public intake request before or alongside lead creation.
- Key fields: `id`, `customer_profile_id`, `customer_first_name`, `contact_phone`, `contact_email`, `zip_code`, `city`, `appliance_type`, `brand`, `issue_description`, `preferred_window`, `source`, `status`, `created_at`.
- Ownership model: Customer-owned when authenticated; platform-owned for anonymous intake until claimed/converted.
- Public/private visibility: Private customer/request data.
- Suggested indexes: `customer_profile_id`, `zip_code`, `source`, `status`, `created_at`.
- Future RLS notes: Customer can see own requests. Company/technician can see requests only after matching or assignment. Admins can see all.

### leads

- Purpose: CRM lead record derived from service requests, technician requests, ZIP discovery, or marketplace intake.
- Key fields: `id`, `service_request_id`, `company_id`, `assigned_technician_profile_id`, `customer_first_name`, `zip_code`, `city`, `appliance_type`, `brand`, `issue_summary`, `requested_time_window`, `source`, `status`, `created_at`, `updated_at`.
- Ownership model: Company/platform-owned; assigned to technician when matched.
- Public/private visibility: Private dashboard CRM data.
- Suggested indexes: `service_request_id`, `company_id`, `assigned_technician_profile_id`, `zip_code`, `source`, `status`, `created_at`.
- Future RLS notes: Company owners see company leads. Assigned technicians see assigned leads. Customers see only their own request/lead status through customer portal. Admins see all.

### jobs

- Purpose: Assigned work item created from a lead or repair case workflow.
- Key fields: `id`, `lead_id`, `company_id`, `technician_profile_id`, `status`, `scheduled_window`, `priority`, `job_type`, `created_at`, `updated_at`.
- Ownership model: Company-owned and technician-assigned.
- Public/private visibility: Private dashboard/dispatch data.
- Suggested indexes: `lead_id`, `company_id`, `technician_profile_id`, `status`, `scheduled_window`.
- Future RLS notes: Assigned technician sees own jobs. Company owner sees team jobs. Customer may see limited status later. Admins see all.

### open_jobs

- Purpose: Unassigned marketplace jobs visible to eligible verified technicians.
- Key fields: `id`, `lead_id`, `service_request_id`, `zip_code`, `city`, `appliance_type`, `brand`, `urgency`, `estimated_lead_value`, `status`, `lock_expires_at`, `accepted_by_technician_profile_id`, `accepted_at`, `created_at`.
- Ownership model: Platform/company marketplace-owned until accepted.
- Public/private visibility: Private marketplace dispatch data, visible only to eligible verified technicians/company/admin.
- Suggested indexes: `lead_id`, `service_request_id`, `zip_code`, `status`, `urgency`, `accepted_by_technician_profile_id`, `created_at`.
- Future RLS notes: Verified technicians can read eligible open jobs based on service area, specialty, status, and verification. Claiming requires server-side transaction/RPC.

### repair_cases

- Purpose: Detailed CRM repair documentation record.
- Key fields: `id`, `lead_id`, `job_id`, `company_id`, `technician_profile_id`, `city`, `zip_code`, `appliance_type`, `brand`, `model_number`, `serial_number`, `issue_description`, `technician_findings`, `repair_status`, `estimated_cost`, `private_notes`, `public_summary_status`, `created_at`, `updated_at`.
- Ownership model: Company-owned and technician-authored/assigned.
- Public/private visibility: Private by default. Public repair case pages must use sanitized approved output, not raw rows.
- Suggested indexes: `lead_id`, `job_id`, `company_id`, `technician_profile_id`, `brand`, `zip_code`, `repair_status`, `public_summary_status`, `created_at`.
- Future RLS notes: Assigned technician and company owner can access. Customer access should be limited to safe status details. Admins see all.

### repair_case_photos

- Purpose: Metadata for repair case uploads and appliance label photos.
- Key fields: `id`, `repair_case_id`, `uploaded_by_profile_id`, `storage_bucket`, `storage_path`, `photo_type`, `visibility`, `caption`, `created_at`.
- Ownership model: Owned by repair case/company; uploaded by authenticated profile.
- Public/private visibility: Private by default. Public usage requires sanitized derivative or explicit approval.
- Suggested indexes: `repair_case_id`, `uploaded_by_profile_id`, `photo_type`, `visibility`, `created_at`.
- Future RLS notes: Same access as parent repair case. Use signed URLs for private files. Do not expose raw storage paths publicly.

### community_posts

- Purpose: Private technician repair help post/discussion.
- Key fields: `id`, `created_by_technician_profile_id`, `title`, `appliance_type`, `brand`, `model_number`, `symptom`, `priority`, `language`, `status`, `visibility`, `created_at`, `updated_at`.
- Ownership model: Created by verified technician; belongs to private technician community.
- Public/private visibility: Private, non-indexed, verified-technician-only.
- Suggested indexes: `created_by_technician_profile_id`, `brand`, `appliance_type`, `priority`, `language`, `status`, `updated_at`.
- Future RLS notes: Verified technicians can read private community posts. Authors can update allowed fields. Admins/moderators can manage.

### community_replies

- Purpose: Replies in private technician community posts.
- Key fields: `id`, `community_post_id`, `technician_profile_id`, `body`, `language`, `translated_preview`, `is_accepted_solution`, `created_at`, `updated_at`.
- Ownership model: Reply author-owned, post-scoped.
- Public/private visibility: Private, verified-technician-only.
- Suggested indexes: `community_post_id`, `technician_profile_id`, `is_accepted_solution`, `created_at`.
- Future RLS notes: Verified technicians can read/reply. Authors can edit own replies within policy. Accepted solution changes require post owner/admin/moderator policy.

### accepted_solutions

- Purpose: Explicit accepted answer record for community knowledge and reputation.
- Key fields: `id`, `community_post_id`, `community_reply_id`, `accepted_by_profile_id`, `solved_by_technician_profile_id`, `root_cause`, `final_fix`, `confidence_level`, `created_at`.
- Ownership model: Community/platform-owned solution record.
- Public/private visibility: Private technician community data.
- Suggested indexes: `community_post_id`, `community_reply_id`, `solved_by_technician_profile_id`, `created_at`.
- Future RLS notes: Verified technicians can read accepted solutions. Creation should be restricted to post owner, moderator, or admin. Writes should create audit and reputation events.

### reputation_events

- Purpose: Immutable contribution log for helpful replies, accepted solutions, badges, and expert scoring.
- Key fields: `id`, `technician_profile_id`, `event_type`, `points`, `source_table`, `source_id`, `created_by_profile_id`, `created_at`.
- Ownership model: Platform-generated event log.
- Public/private visibility: Private by default; aggregate public reputation can flow through approved public profile fields.
- Suggested indexes: `technician_profile_id`, `event_type`, `source_table`, `source_id`, `created_at`.
- Future RLS notes: Technician can read own events. Verified community may see aggregate leaderboard fields only. Admins can manage corrections through audited workflows.

### technician_badges

- Purpose: Earned technician badges and expert recognition.
- Key fields: `id`, `technician_profile_id`, `badge_key`, `label`, `category`, `rarity`, `visibility`, `earned_at`, `awarded_by_profile_id`.
- Ownership model: Platform/admin awarded or derived from reputation events.
- Public/private visibility: Some badges may be public if approved; private community badges remain dashboard-only.
- Suggested indexes: `technician_profile_id`, `badge_key`, `category`, `rarity`, `visibility`, `earned_at`.
- Future RLS notes: Technician can read own badges. Public can read only public badge fields through `public_profiles`. Admins can award/revoke with audit logs.

### public_profiles

- Purpose: Public-safe technician/company profile projection for marketplace pages.
- Key fields: `id`, `technician_profile_id`, `company_id`, `slug`, `display_name`, `service_area_summary`, `specialties`, `public_badges`, `rating_preview`, `response_time_preview`, `is_published`, `created_at`, `updated_at`.
- Ownership model: Derived from technician/company data and approved for public display.
- Public/private visibility: Public read only when `is_published = true`.
- Suggested indexes: `slug`, `technician_profile_id`, `company_id`, `is_published`.
- Future RLS notes: Public can read published rows. Technician/company can request edits to own public profile fields. Admin approves publication.

### audit_logs

- Purpose: Sensitive mutation history.
- Key fields: `id`, `actor_profile_id`, `action`, `entity_table`, `entity_id`, `old_value_summary`, `new_value_summary`, `ip_address`, `user_agent`, `created_at`.
- Ownership model: Platform-owned audit trail.
- Public/private visibility: Admin-only.
- Suggested indexes: `actor_profile_id`, `entity_table`, `entity_id`, `action`, `created_at`.
- Future RLS notes: No normal user updates/deletes. Admin read only. Inserts should happen server-side for sensitive actions.

## RLS Planning

### Public read tables

- `public_profiles` can be read by anonymous users only when `is_published = true`.
- Future public SEO tables should expose sanitized content only.
- Raw `repair_cases`, `leads`, `service_requests`, community tables, and customer contact fields must not have public read policies.

### Owner-only tables

- `profiles` and `customer_profiles` are owner-readable and owner-updatable for limited safe fields.
- `service_requests` can be readable by the request owner when authenticated, or through a future secure token/customer portal pattern.

### Technician-only tables

- `technician_profiles` are readable by the owning technician, company owner, and admin.
- Assigned `jobs`, `leads`, and `repair_cases` are readable by assigned technicians only.

### Verified technician tables

- `open_jobs` are readable only by verified technicians who match service-area/specialty eligibility and by company owners/admins.
- `community_posts`, `community_replies`, and `accepted_solutions` are readable only by verified technicians or higher.

### Company owner/member access

- Company owners can read/manage `companies`, `company_members`, team `technician_profiles`, company `leads`, company `jobs`, company `repair_cases`, and aggregate company analytics.
- Company members get only role-scoped access.

### Admin-only access

- Admins can manage verification, moderation, role changes, support workflows, and audit review.
- Admin policies should still require explicit admin role and should be paired with audit logging.

### Audit log protection

- `audit_logs` should be append-only from trusted server paths.
- Users should not update or delete audit logs.
- Company owners may receive limited audit summaries later, but raw audit access should start admin-only.

## Phased Persistence Plan

### Phase 1: profiles + auth roles

- Add Supabase Auth.
- Add `profiles`.
- Add role/status fields.
- Protect `/dashboard`.
- Keep current mock data in place.

### Phase 2: service requests / leads

- Persist `/schedule-service` intake into `service_requests`.
- Create `leads` from service requests.
- Add lead source attribution.
- Add dashboard lead reads and status updates.

### Phase 3: jobs / open jobs

- Add `jobs` and `open_jobs`.
- Add verified technician eligibility reads.
- Add server-side open job claiming/locking.
- Add audit logs for claim/assignment actions.

### Phase 4: repair cases

- Persist repair case creation/list/detail.
- Add `repair_case_photos` metadata and private storage policy.
- Keep public repair case publishing separate and sanitized.

### Phase 5: technician profiles

- Persist technician onboarding.
- Add public profile approval workflow.
- Add service areas and specialties through follow-up tables or typed JSON only if intentionally chosen.

### Phase 6: community

- Persist private `community_posts`, `community_replies`, and `accepted_solutions`.
- Add moderation and accepted solution workflow.
- Keep all community content dashboard-only and verified-technician-only.

### Phase 7: reputation and badges

- Add `reputation_events` and `technician_badges`.
- Derive scores and leaderboards from event history.
- Use public projections only after approval.

### Phase 8: payments/subscriptions later

- Add Stripe tables only after auth, leads, open jobs, and verification are stable.
- Keep payment details in Stripe.
- Store only Stripe IDs, status, and audit-safe metadata.

## Privacy Rules

- No customer phone, email, or full address in public tables.
- Public repair cases must be sanitized and approved before publication.
- Technician public profiles must not expose private phone, email, payout, workload, or account details unless explicitly approved.
- Repair photos are private by default and require sanitized derivatives or explicit approval for public use.
- Community posts can become private knowledge cases only after privacy review.
- Community content must not become public SEO content without a separate moderation and sanitization workflow.
- Serial numbers and appliance label photos are private/internal by default.

## Open Questions

- Should customer accounts launch immediately, or should customers begin with anonymous intake and optional account creation later?
- Should company accounts be part of the first auth release, or should MVP begin with a single internal company?
- Do open jobs require an active subscription, paid lead balance, or verification-only gate at launch?
- What is the repair photo retention and storage policy?
- Should public technician profiles show any direct contact method, or should all contact route through platform intake?
- Who can moderate community posts and accepted solutions in the first production release?
- Should public repair case publishing use separate `public_repair_cases` records or a `public_summary_status` projection from `repair_cases`?
- Should technician service areas/specialties use normalized tables immediately, or start with constrained JSON plus later normalization?
