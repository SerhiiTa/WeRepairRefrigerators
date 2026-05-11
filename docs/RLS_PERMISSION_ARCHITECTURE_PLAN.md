# RLS & Permission Architecture Plan

## Purpose

This document plans future Row Level Security and permission architecture for the Supabase backend. It is documentation-only. No SQL policies, migrations, middleware, Supabase code, frontend code, or packages are implemented here.

## Global Security Principles

- Deny by default: every private table should have RLS enabled and no broad public policies.
- Least privilege: each role receives only the minimum rows and actions needed.
- Public/private separation: public SEO data must stay separate from raw customer, dashboard, community, and audit data.
- Ownership-based access: users can access their own records only when ownership is explicit and verified.
- Verification-gated resources: open jobs, private community, accepted solutions, and reputation surfaces require `verified_technician` or higher.
- Company isolation: company/team data must be scoped by `company_id` and membership.
- Admin isolation: admin access should be explicit, audited, and not treated as normal user access.
- Audit-first security mindset: sensitive mutations should create audit records before production workflows are trusted.
- Server enforcement: frontend navigation and role checks are UX only; RLS and server-side validation enforce real security.

## Role Hierarchy

### public_visitor

Anonymous visitor. Can read approved public SEO content and public technician profile projections only. Has no dashboard, CRM, community, or private data access.

### customer

Authenticated or token-backed customer. Inherits public visitor access and can access only their own service requests or customer portal records. Cannot access technician dashboard, community, open jobs, internal notes, or company analytics.

### technician

Authenticated technician before verification. Inherits public access and can access own onboarding/profile data and explicitly assigned work if allowed. Cannot access open jobs or private community until verified.

### verified_technician

Verified marketplace/community technician. Inherits technician access and can access eligible open jobs, assigned leads/jobs/repair cases, private community posts/replies, accepted solutions, and own reputation/badge data.

### expert_technician

Verified technician with expert permissions. Inherits verified technician access and may later access expert-only discussions or knowledge workflows. Expert access must not imply company-owner or admin privileges.

### company_owner

Company account owner. Can access company-scoped team data, leads, jobs, repair cases, coverage, analytics, company members, and billing ownership records. Cannot access other companies' private data.

### admin

Platform operator. Can manage all operational data through audited admin flows. Admin access should be explicit, server-side, and paired with audit logging. Admin users must not bypass public privacy rules.

## Table-By-Table RLS Strategy

### profiles

- SELECT: user can select own profile; company owners can select company member profiles; admins can select all.
- INSERT: server-side profile creation after auth signup.
- UPDATE: user can update safe own fields; company owners can update limited team fields; admins can update role/status fields.
- DELETE: admin-only soft delete or deactivation.
- Ownership rules: `auth_user_id` maps to authenticated user.
- Company-scoped rules: `company_id` connects profile to company membership.
- Verification requirements: none for own profile reads.
- Admin overrides: role/status changes admin-only and audited.

### technician_profiles

- SELECT: owning technician, company owner for team technicians, verified matching workflows where public-safe data is needed, admins.
- INSERT: technician onboarding flow or company owner invitation flow.
- UPDATE: owning technician for safe onboarding fields; company owner for team management fields; admin for verification/status.
- DELETE: admin-only or company-owner deactivation if scoped.
- Ownership rules: `profile_id` maps technician profile to user profile.
- Company-scoped rules: company owner can access rows with matching `company_id`.
- Verification requirements: verification status controls open job/community access, not basic own profile access.
- Admin overrides: admin can verify, reject, suspend, and audit.

### customer_profiles

- SELECT: customer can select own profile; admins can select all.
- INSERT: server-side customer account creation or post-intake portal creation.
- UPDATE: customer can update safe own fields; admin can support/update.
- DELETE: admin-only or customer-requested deletion flow.
- Ownership rules: `profile_id` maps to authenticated customer.
- Company-scoped rules: companies should not broadly read customer profiles.
- Verification requirements: none.
- Admin overrides: audited support actions only.

### service_requests

- SELECT: customer can select own requests; assigned company/technician can select after matching/assignment; admins can select all.
- INSERT: public intake via server-side validation; customer-authenticated insert when signed in.
- UPDATE: customer can update limited pre-dispatch fields; assigned company/technician can update operational status; admin can support.
- DELETE: admin-only soft delete/cancel flow.
- Ownership rules: `customer_profile_id` or secure request token identifies customer ownership.
- Company-scoped rules: company access only after lead/job assignment.
- Verification requirements: technicians need assignment or eligibility.
- Admin overrides: audited.

### leads

- SELECT: assigned technician, company owner/member scoped to `company_id`, customer through limited portal view, admins.
- INSERT: server-side from service request, schedule-service flow, technician request, or admin/company creation.
- UPDATE: assigned technician for allowed status fields; company owner for assignment/status; admin for support.
- DELETE: admin-only soft delete or company-owner archive if scoped.
- Ownership rules: lead belongs to company/platform and may link to customer request.
- Company-scoped rules: `company_id` controls team visibility.
- Verification requirements: unverified technicians should not see unassigned marketplace leads.
- Admin overrides: audited lead assignment and conversion changes.

### jobs

- SELECT: assigned technician, company owner/member scoped to company, customer limited status view later, admins.
- INSERT: server-side from accepted open job, lead conversion, or company dispatch flow.
- UPDATE: assigned technician for field status updates; company owner for scheduling/assignment; admin for support.
- DELETE: admin-only or company-owner cancellation if scoped.
- Ownership rules: assigned by `technician_profile_id`; company-owned by `company_id`.
- Company-scoped rules: company members see rows according to member role.
- Verification requirements: technicians should be verified before marketplace jobs are assigned.
- Admin overrides: audited reassignment/cancellation.

### open_jobs

- SELECT: verified technicians eligible by ZIP/service area/specialty/status; company owners for company marketplace scope; admins.
- INSERT: server-side only from validated lead/service request.
- UPDATE: server-side claiming/locking RPC; company/admin status updates.
- DELETE: admin-only; expiration should be status update, not hard delete.
- Ownership rules: platform/company-owned until accepted.
- Company-scoped rules: company owners may see company-scoped open jobs.
- Verification requirements: verified technician or higher for technician visibility and claiming.
- Admin overrides: audited.

### repair_cases

- SELECT: assigned technician, company owner/member scoped to company, customer limited safe view later, admins.
- INSERT: assigned technician/company owner/server-side conversion flow.
- UPDATE: assigned technician for case details; company owner for team cases; admin for support/moderation.
- DELETE: admin-only or company-owner archive if scoped.
- Ownership rules: `technician_profile_id`, `company_id`, and optional `lead_id`/`job_id`.
- Company-scoped rules: company members access only company rows and role-appropriate fields.
- Verification requirements: assigned technician access should require authenticated technician role; marketplace-origin cases should require verified technician.
- Admin overrides: audited especially for public summary status and private notes.

### repair_case_photos

- SELECT: same as parent repair case; signed URL required for storage access.
- INSERT: assigned technician/company member/admin for parent case.
- UPDATE: uploader, assigned technician, company owner, or admin for metadata/visibility.
- DELETE: admin-only or company-owner/assigned technician if scoped and policy allows.
- Ownership rules: parent `repair_case_id` controls row access.
- Company-scoped rules: inherited through parent repair case company.
- Verification requirements: same as parent repair case.
- Admin overrides: audited for public visibility or deletion.

### community_posts

- SELECT: verified technicians, expert technicians, company owners only if separately granted verified community access, admins.
- INSERT: verified technicians and higher.
- UPDATE: author for editable fields; moderators/admins for status/moderation; accepted status changes through controlled workflow.
- DELETE: admin/moderator soft delete only.
- Ownership rules: `created_by_technician_profile_id` owns author edits.
- Company-scoped rules: community is technician-network scoped, not automatically company-owned.
- Verification requirements: verified technician or higher.
- Admin overrides: moderation actions audited.

### community_replies

- SELECT: verified technicians and higher; admins.
- INSERT: verified technicians and higher.
- UPDATE: author for own reply within edit rules; admin/moderator for moderation.
- DELETE: admin/moderator soft delete; author delete only if policy permits and not accepted.
- Ownership rules: `technician_profile_id` owns reply.
- Company-scoped rules: not automatically company-owned.
- Verification requirements: verified technician or higher.
- Admin overrides: audited.

### accepted_solutions

- SELECT: verified technicians and higher; admins.
- INSERT: post author, moderator, or admin through controlled accepted-solution flow.
- UPDATE: moderator/admin only after creation, or post author under strict rules.
- DELETE: admin/moderator only; prefer revoked status over hard delete.
- Ownership rules: tied to `community_post_id`, `community_reply_id`, and solving technician.
- Company-scoped rules: community-scoped, not company-owned.
- Verification requirements: verified technician or higher.
- Admin overrides: audited and may create reputation events.

### reputation_events

- SELECT: technician can select own detailed events; verified community may see aggregates only; admins can select all.
- INSERT: server-side only from accepted solution/helpful events/admin awards.
- UPDATE: admin-only correction flow.
- DELETE: admin-only correction/void flow; prefer reversal events over hard delete.
- Ownership rules: `technician_profile_id` is subject of event.
- Company-scoped rules: company owners may see aggregate team reputation, not necessarily raw event details.
- Verification requirements: reputation events usually apply to verified technicians.
- Admin overrides: audited.

### technician_badges

- SELECT: technician can select own badges; public can select only public badge projections; company owner can see team badges; admins can select all.
- INSERT: server-side derived badge award or admin award.
- UPDATE: admin-only or server-side visibility/status changes.
- DELETE: admin-only revoke flow; prefer revoked status if modeled later.
- Ownership rules: `technician_profile_id` is badge owner.
- Company-scoped rules: company owners can see team badges.
- Verification requirements: public/expert badges should require verified technician status.
- Admin overrides: audited badge awards/revocations.

### audit_logs

- SELECT: admin-only; limited company-owner audit summaries may be added later through separate views.
- INSERT: server-side only for sensitive actions.
- UPDATE: no normal updates.
- DELETE: no normal deletes; retention policy only through admin/server maintenance.
- Ownership rules: platform-owned; `actor_profile_id` identifies actor.
- Company-scoped rules: raw logs are not company-readable by default.
- Verification requirements: none.
- Admin overrides: admin read only; writes should come from trusted server paths.

## Public Marketplace Protection

- Public SEO pages remain readable without auth.
- Public repair cases must come from sanitized approved content, not raw `repair_cases`.
- Technician public profiles should come from `public_profiles`, not raw `technician_profiles`.
- Customer phone, email, full address, private notes, serial numbers, and exact job details must never be copied to public tables.
- ZIP/location SEO can show service areas, neighborhoods, and ZIPs, but not exact customer addresses.
- Public content generation from repair cases or community posts requires privacy review and approval before publication.

## Company / Team Security Model

- Company isolation is based on `company_id`.
- `company_members` defines who belongs to a company and what member role they have.
- Company owners can manage team technicians, company leads, jobs, repair cases, and billing ownership records.
- Company members should receive narrower permissions based on member role.
- Multi-company users require explicit membership per company and active company context.
- Technician reassignment should be server-side, company-scoped, and audited.
- Moving a technician between companies should not expose historical private records without explicit migration/ownership rules.

## Open Jobs Security

- Open jobs require `verified_technician` or higher for technician access.
- Job visibility must check service area, ZIP, specialty, job status, and verification status.
- Claiming must run through a server-side transaction/RPC, not client-side updates.
- Race conditions should be handled with row locking, status checks, lock expiration, and unique active claim constraints.
- Open job rows should show only privacy-safe customer context: first name if needed, ZIP/city, appliance/brand, issue summary, preferred window.
- Customer phone/email/full address should stay hidden until assignment and only be available to authorized assigned users.

## Community Security

- Community posts and replies are private technician-only resources.
- Verified technician access is required before reading or writing community content.
- Expert-only areas can be added later as a stricter permission layer.
- Public knowledge extraction must use a separate review workflow and must never expose raw private posts.
- Moderation roles need explicit permission boundaries and audit logs.
- Reputation abuse prevention should avoid client-written points; reputation events should be server-side generated.
- Multilingual content and translations need moderation because translated previews may expose sensitive details if generated naively.

## Audit And Admin Protection

- Audit logs should be immutable in normal app flows.
- Sensitive actions should be logged: role changes, verification changes, lead assignment, open job claiming, repair case public status changes, accepted solution changes, reputation/badge awards, billing changes, moderation actions, and AI publishing approvals.
- Admin action visibility should be admin-only at first.
- Future fraud/security monitoring can use audit patterns for suspicious claim attempts, repeated failed auth, unusual lead access, moderation flags, and payment anomalies.
- Admin tooling should use server-side checks and never rely on frontend-only role hiding.

## Future API Security

- Server-side validation is required for every mutation.
- Edge functions or server actions should use user-scoped clients for normal user operations.
- Service-role key must remain server-only and reserved for tightly scoped administrative/server workflows.
- Rate limiting should protect auth, public intake, open job claiming, community posting, AI generation, uploads, and webhook endpoints.
- Signed uploads and signed URLs are required for private repair photos, appliance labels, and community attachments.
- Webhooks, especially Stripe, must verify signatures and avoid trusting client-submitted payment status.
- Stripe data should stay isolated from public/customer/community data, with raw payment details remaining in Stripe.
- AI endpoints must be protected by auth, role checks, rate limits, privacy filters, and manual review for public publishing.

## Open Questions

- Should company owners see raw technician community posts, or only aggregate contribution/reputation data?
- Should customers get authenticated portal accounts in the first persistence phase or only secure request-token access?
- Which dashboard routes should unverified technicians see during onboarding?
- Should open job eligibility require active subscription/payment status immediately or only verification at launch?
- Who has moderator permissions in the first private community release: admins only, expert technicians, or selected company owners?
- Should accepted solutions be reversible by post authors, moderators, or admins only?
- How long should audit logs and private repair photos be retained?
- Should public technician badges be manually approved before appearing in `public_profiles`?
