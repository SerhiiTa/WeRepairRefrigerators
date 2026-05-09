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

## AI content safety

AI-generated repair articles should be treated as drafts. A technician or admin must review content before publication, especially when it includes diagnostic advice, repair steps, cost estimates, or customer-facing claims.

## Future security checklist

Before adding authentication:

- Choose the Supabase auth flow.
- Define user roles.
- Keep auth checks server-side where possible.
- Add protected dashboard routes.

Before adding database tables:

- Enable Row Level Security.
- Write explicit RLS policies.
- Test cross-user access boundaries.
- Validate all mutation inputs.
- Avoid storing unnecessary customer personal information.

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

Before production:

- Add rate limits to sensitive endpoints.
- Add audit logging for important mutations.
- Review dependency vulnerabilities.
- Review environment variable handling.
- Confirm backups and recovery process.
- Confirm privacy and terms requirements.
