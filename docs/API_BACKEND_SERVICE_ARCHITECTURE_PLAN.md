# API & Backend Service Architecture Plan

## Purpose

This document plans the future backend service and API architecture for WeRepairRefrigerators. It is documentation-only. No backend routes, Supabase setup, Edge Functions, packages, migrations, middleware, or frontend changes are implemented here.

## Overall Backend Philosophy

- Keep the MVP frontend-first until backend scope is explicitly approved.
- Start with a thin backend: Supabase Auth, Postgres, RLS, Storage, and narrowly scoped server mutations.
- Avoid premature microservices, Kubernetes, or heavy infrastructure before real usage requires it.
- Keep APIs security-first: validate server-side, enforce RLS, audit sensitive actions, and never rely on frontend checks.
- Prefer progressive backend extraction: move only proven heavy workflows into Edge Functions, background jobs, or dedicated services.
- Preserve public marketplace, protected dashboard, private technician community, and admin boundaries.
- Let event-driven architecture emerge later from real workflows: leads, jobs, claims, community replies, accepted solutions, payments, and AI jobs.

## Planned Backend Layers

### Next.js frontend

- Renders public marketplace pages, dashboard UI, technician community UI, and future customer portal UI.
- Uses Supabase user-scoped clients only for safe reads/mutations that RLS can enforce.
- Uses server actions or route handlers when a workflow needs server-side validation, transaction coordination, secret access, or third-party API calls.
- Must not contain service-role keys, AI API keys, Stripe secrets, or private storage credentials.

### Supabase database

- Source of truth for profiles, companies, service requests, leads, jobs, open jobs, repair cases, community, reputation, audit logs, and future billing references.
- Uses RLS for every private table.
- Uses indexes and views for operational dashboards and analytics.
- Uses transactions/RPC for open job claiming and other concurrency-sensitive workflows.

### Supabase Auth

- Provides authentication and session identity.
- Connects to `profiles` for app roles and statuses.
- Supports future role-aware dashboard routing and onboarding.
- Should not be treated as sufficient alone; authorization comes from app role/status plus RLS/server checks.

### Supabase Storage

- Stores private repair photos, appliance labels, technician avatars, public profile images, community attachments, and future AI artifacts.
- Uses separate buckets by visibility and purpose.
- Private files require signed URLs.
- Public files require explicit approval before publication.

### Supabase Realtime

- Reserved for later authenticated dashboard updates, open job changes, technician community updates, notifications, and presence.
- Should be enabled only after auth, RLS, moderation, and rate limiting are in place.

### Edge Functions

- Good fit for workflows requiring secrets, validation, transactions, webhooks, AI calls, image processing, or Stripe integration.
- Should stay small and domain-focused.
- Should use service-role access only for tightly scoped server-side operations.

### Future dedicated backend services

- Not needed for the MVP.
- May be introduced later for heavy AI processing, queue workers, search/indexing, image processing, dispatch optimization, or billing workflows.
- Should be extracted only after Supabase/Edge Function boundaries become insufficient.

### AI processing layer

- Future server-side layer for repair summaries, translation, SEO drafts, moderation, TechAdvisor, image prompt generation, and knowledge extraction.
- Requires privacy filtering, cost controls, role checks, audit logs, and manual review for public output.

### Queue/background jobs layer

- Future layer for long-running AI tasks, image processing, notification fan-out, scheduled cleanup, analytics aggregation, and search indexing.
- Should be introduced after synchronous server flows become slow or unreliable.

## API Domain Separation

### auth

- Login, signup, session refresh, password reset, and profile bootstrap.
- Should use Supabase Auth plus server-side profile creation.

### profiles

- Current user profile, role/status, customer profile, technician profile, public profile projection, and company membership context.

### technician onboarding

- Technician profile setup, service areas, specialties, verification status, and public profile readiness.

### service requests

- Public `/schedule-service` intake, customer request status, source attribution, and customer contact handling.

### leads

- Dashboard lead inbox, lead status, lead assignment, lead detail, and lead-to-repair-case conversion.

### jobs / open jobs

- Assigned jobs, open job discovery, eligibility checks, claiming/locking, assignment, expiration, and dispatch status.

### repair cases

- Repair case creation, editing, list/detail reads, photo metadata, parts/finding details, and public summary approval.

### uploads

- Signed upload creation, metadata persistence, private/public visibility review, and future image processing.

### community

- Private technician posts, replies, accepted solutions, moderation, translation previews, and knowledge case extraction.

### reputation

- Reputation events, badges, leaderboard aggregates, expert status, and abuse prevention.

### admin

- Technician verification, role changes, moderation, audit review, support tools, and safety controls.

### payments

- Stripe subscriptions, paid leads, premium placement, marketplace fees, company billing, and future payout-compatible records.

### AI workflows

- Repair summary generation, SEO draft generation, translation, moderation, knowledge extraction, TechAdvisor, semantic search, and image prompt creation.

## Backend Mechanism Choices

### Direct Supabase client access

Use direct user-scoped Supabase client access for:

- Public reads from approved public tables/views.
- Authenticated reads protected fully by RLS.
- Simple owner-scoped profile updates.
- Simple dashboard reads where RLS is the complete security boundary.

Avoid direct client writes for sensitive workflows such as open job claiming, role changes, verification, payments, AI generation, uploads, and public publishing approvals.

### Edge Functions

Use Edge Functions for:

- Public intake validation and lead creation when service-role behavior is needed.
- Open job claiming/locking orchestration.
- Stripe webhooks.
- AI calls.
- Translation calls.
- Moderation workflows.
- Signed upload preparation if server-side rules are needed.

### Server-side validation

Use server-side validation for every mutation:

- Intake.
- Lead status updates.
- Job creation/claiming.
- Repair case writes.
- Community posts/replies.
- Accepted solutions.
- Reputation events.
- Upload metadata.
- Billing and AI requests.

### Background processing

Use background jobs later for:

- AI summaries and translations.
- SEO article drafting.
- Image processing.
- Analytics aggregation.
- Notification delivery.
- Vector/RAG indexing.
- Retention cleanup.

### Signed upload flows

Use signed upload flows for repair photos, appliance label photos, technician avatars when private review is needed, community attachments, and AI-generated assets before public approval.

### Webhook processing

Use signed/verifiable webhook handlers for Stripe subscription/payment events, future notification provider events, and future storage/image processing callbacks.

## File Upload Architecture

### Upload types

- Repair photos: private by default, tied to repair cases.
- Appliance label photos: private/internal by default because they may contain serial numbers.
- Public images: approved profile images, public SEO images, and sanitized repair case derivatives.
- Technician avatars: public only after approval; raw uploads may stay private until reviewed.
- Community attachments: private technician-only.

### Storage buckets

Suggested buckets:

- `public-assets`: approved public images only.
- `repair-case-photos-private`: repair and job photos.
- `appliance-labels-private`: model/serial label photos.
- `technician-profile-assets`: avatar/profile images with approval workflow.
- `community-attachments-private`: technician discussion attachments.
- `ai-artifacts-private`: prompts, generated drafts, generated images, and review artifacts.

### Upload security

- Use signed URLs for private files.
- Restrict file types and sizes.
- Store metadata in Postgres.
- Avoid exposing raw storage paths publicly.
- Require parent-record authorization before upload.
- Add moderation/review before any file becomes public.
- Plan malware/content scanning before production file uploads.
- Generate public derivatives rather than exposing raw private repair images.

### Image processing

Future image processing can create thumbnails, public-safe derivatives, blur/redaction variants, and optimized public images. Heavy processing should move to background jobs or dedicated services later.

## AI Architecture Planning

### Future AI areas

- Repair summaries from repair cases.
- Multilingual translation for technician community.
- Knowledge extraction from accepted solutions.
- SEO article generation from approved public-safe repair details.
- Moderation and privacy checks.
- Technician assistant / TechAdvisor.
- Semantic search and RAG over approved private knowledge cases.

### Processing model

- AI tasks should run server-side only.
- Long-running or expensive jobs should be async.
- Store AI request metadata, status, reviewer, and output references.
- Do not auto-publish public content.
- Do not index private content into RAG until privacy review passes.

### Queue and cost protection

- Add per-user and per-company rate limits.
- Add token/cost budgets for AI features.
- Queue expensive jobs.
- Deduplicate repeated requests.
- Log inputs/outputs enough for audit without retaining unnecessary PII.

### Privacy boundaries

- Strip customer phone, email, full address, serial number, exact address, and private notes before public SEO generation.
- Keep TechAdvisor/private community AI separate from public SEO AI.
- Human review is required before public articles, public repair cases, public profile claims, or knowledge-derived public content.

## Realtime Architecture

Realtime should come after auth/RLS and moderation foundations.

Future realtime usage:

- Open job status changes and claim results.
- Dashboard lead/job/repair case updates.
- Technician community replies.
- Notifications for assigned jobs and expiring open job locks.
- Technician chat/community updates.
- Typing and presence later, only after privacy and abuse rules are defined.

Realtime channels must be scoped by user, company, role, verification status, and parent-record access.

## Payments / Subscription Planning

Stripe should handle payment instruments and billing truth. The app should store only IDs, statuses, plan keys, and audit-safe metadata.

Future architecture:

- Technician subscriptions for marketplace access.
- Company billing accounts for teams.
- Paid leads after qualification rules exist.
- Marketplace fees tied to accepted/completed jobs.
- Premium ZIP placement and sponsored technician profiles.
- Expert community access subscriptions.
- Future payout-compatible records, but no payout implementation until explicitly approved.

Webhook handlers must verify Stripe signatures and update internal billing state server-side. Client-submitted payment status should never be trusted.

## Scaling Strategy

- Start simple with Next.js + Supabase.
- Avoid early Kubernetes, separate services, or complex event buses.
- Add indexes based on query paths from leads, open jobs, repair cases, dashboard analytics, and community.
- Use public page static generation where possible.
- Use CDN and image optimization for public assets.
- Add caching later for public SEO data, technician discovery, and aggregate analytics.
- Move heavy AI/image processing to queues or dedicated workers when needed.
- Add materialized views or aggregate tables for analytics when raw events grow.

## Security Architecture

- Validate all API inputs server-side.
- Keep service-role key server-only.
- Use user-scoped clients for normal operations.
- Enforce RLS for database access.
- Add rate limits for auth, public intake, open job claiming, community posting, uploads, AI endpoints, and webhooks.
- Use signed uploads and signed private asset reads.
- Verify webhook signatures.
- Keep secrets in approved environment storage only.
- Add abuse prevention for spam leads, repeated claim attempts, community abuse, upload abuse, and AI prompt abuse.
- Add moderation tooling before realtime community or public publishing.
- Add AI abuse prevention: role gates, prompt logging, cost limits, privacy filters, and manual review.

## Monitoring / Observability Planning

Future observability should include:

- Application logs for server mutations and Edge Functions.
- Audit logs for sensitive business actions.
- Metrics for lead creation, conversion, open job claims, repair case creation, community activity, AI job usage, and billing events.
- Uptime monitoring for public site, dashboard, auth, and critical backend endpoints.
- Error tracking for frontend, server actions, Edge Functions, webhooks, and AI jobs.
- Admin moderation visibility for flagged community posts, failed uploads, failed AI tasks, and suspicious marketplace activity.
- Alerts for webhook failures, repeated claim conflicts, auth spikes, storage errors, and AI cost anomalies.

## Open Architecture Questions

- Should the first backend mutations use Next.js server actions, Supabase Edge Functions, or a mix?
- Should public intake write directly to `service_requests` through a server action or Edge Function?
- When should open job claiming move from Postgres RPC to a dedicated dispatch service?
- What queue provider should be used for AI/image/background jobs when needed?
- Should technician community realtime launch with Supabase Realtime or start as refresh-based pages?
- What upload scanning/moderation provider should be used before production uploads?
- Should analytics use raw events plus views, or an external analytics product later?
- Which billing model launches first: company subscription, technician subscription, paid leads, or premium ZIP placement?
- When should vector/RAG infrastructure be introduced, and where should embeddings be stored?
