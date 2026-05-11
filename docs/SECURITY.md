# Security

## Current rules

- Do not commit API keys, tokens, secrets, or service credentials.
- Use `.env.local` for local environment variables.
- Keep `.env.local` out of git.
- Keep the repository private while the MVP is under active development.
- Require manual approval for AI-generated edits before publishing content.
- Do not run global commands without approval.
- Do not access folders outside the approved project folder.
- Do not install packages without approval.
- Do not implement authentication, uploads, payments, or database access until the scope is approved.
- Keep technician community, reputation, discussion, and knowledge base surfaces dashboard-only.
- Do not create public/indexable routes for private technician discussions or knowledge cases.
- Do not expose customer phone numbers, emails, full addresses, payment details, or private notes in public or community views.
- Do not add real-time messaging, persistence, AI calls, translation calls, notifications, or dispatch behavior until auth and backend boundaries are approved.
- Backend/RLS planning is documented in `docs/BACKEND_ARCHITECTURE_PLAN.md` and should be reviewed before adding Supabase, auth, persistence, dispatch, community, analytics, Stripe, or AI/RAG code.

## AI content safety

AI-generated repair articles should be treated as drafts. A technician or admin must review content before publication, especially when it includes diagnostic advice, repair steps, cost estimates, or customer-facing claims.

AI TechAdvisor, multilingual previews, and discussion summaries are currently mock-only. Future implementations must run server-side, exclude customer PII, and require technician/admin review before any content is published or indexed into a private RAG system.

## Future security checklist

Before adding authentication:

- Review `docs/BACKEND_ARCHITECTURE_PLAN.md`.
- Choose the Supabase auth flow.
- Define user roles.
- Keep auth checks server-side where possible.
- Add protected dashboard routes.
- Require authentication before enabling technician community, reputation, open job claiming, live dispatch, or private knowledge base access.

Before adding database tables:

- Enable Row Level Security.
- Write explicit RLS policies.
- Test cross-user access boundaries.
- Validate all mutation inputs.
- Avoid storing unnecessary customer personal information.
- Separate public marketplace records from private dashboard CRM records and private technician community records.
- Audit open job assignment, lead conversion, accepted solution, and reputation event mutations.

Before adding real-time messaging:

- Require verified technician access.
- Add moderation and abuse reporting paths.
- Avoid customer PII in technician-to-technician threads.
- Log accepted solution and edit history for auditability.

Before adding uploads:

- Restrict file types.
- Restrict file sizes.
- Store files in private buckets unless public access is required.
- Scan or validate upload metadata.
- Avoid exposing raw storage paths unless intended.

Before adding AI generation:

- Keep model API keys server-side.
- Rate limit generation requests.
- Log draft status and reviewer approval.
- Do not auto-publish generated content.
- Avoid including private customer information in public content.
- Keep AI translation and RAG indexing private, reviewed, and role-gated.
- Separate public SEO article generation from private TechAdvisor/community summarization.

Before production:

- Add rate limits to sensitive endpoints.
- Add audit logging for important mutations.
- Review dependency vulnerabilities.
- Review environment variable handling.
- Confirm backups and recovery process.
- Confirm privacy and terms requirements.
