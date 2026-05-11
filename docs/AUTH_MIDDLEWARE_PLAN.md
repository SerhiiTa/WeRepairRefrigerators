# Auth Middleware Plan

## Purpose

This document plans the next route-protection step for WeRepairRefrigerators. It is documentation-only. No middleware, redirects, route blocking, migrations, service-role usage, or frontend behavior changes are implemented here.

The current app has Supabase auth UI, profile role/status display, and non-blocking dashboard notices. Dashboard routes remain accessible in mock-safe mode until route protection is explicitly implemented.

## Public Routes

The following routes should stay public and crawlable:

- `/`
- `/brands`
- `/brands/[brand]`
- `/services`
- `/services/[service]`
- `/locations`
- `/locations/[city]`
- `/repair-cases`
- `/repair-cases/[slug]`
- `/technicians`
- `/technicians/[slug]`
- `/find-technician`
- `/schedule-service`
- `/login`
- `/signup`

Public routes must not read private dashboard data, raw repair cases, private community content, customer phone numbers, emails, full addresses, private notes, or admin-only data.

## Dashboard Routes Requiring Authentication Later

All `/dashboard` routes should eventually require an authenticated Supabase session and a matching `public.profiles` row:

- `/dashboard`
- `/dashboard/repair-cases`
- `/dashboard/repair-cases/new`
- `/dashboard/repair-cases/[id]`
- `/dashboard/leads`
- `/dashboard/leads/preview`
- `/dashboard/coverage`
- `/dashboard/analytics`
- `/dashboard/open-jobs`
- `/dashboard/ai-articles`
- `/dashboard/community`
- `/dashboard/community/new`
- `/dashboard/community/[discussionId]`
- `/dashboard/community/reputation`
- `/dashboard/technicians`
- `/dashboard/settings`

Authentication alone is not enough for production access. The route guard should also check profile presence, profile status, role eligibility, and later RLS/server authorization for real data.

## Routes Requiring Active Profile Later

The following should require an active profile status before normal dashboard access:

- `/dashboard`
- `/dashboard/repair-cases`
- `/dashboard/repair-cases/new`
- `/dashboard/repair-cases/[id]`
- `/dashboard/leads`
- `/dashboard/leads/preview`
- `/dashboard/coverage`
- `/dashboard/analytics`
- `/dashboard/ai-articles`
- `/dashboard/technicians`
- `/dashboard/settings`

Treat `active` and `verified` as usable statuses for broad dashboard access. Treat `pending`, `suspended`, and `rejected` as non-active states that should redirect to a status-specific route once enforcement begins.

## Routes Requiring Verified Technician Or Higher Later

The private technician network and marketplace dispatch surfaces should require `verified_technician`, `expert_technician`, `company_owner`, or `admin`:

- `/dashboard/open-jobs`
- `/dashboard/community`
- `/dashboard/community/new`
- `/dashboard/community/[discussionId]`
- `/dashboard/community/reputation`

Company owners may need separate team/company eligibility checks before broad community access is enabled. Admins should retain access through audited admin policies.

## Routes Requiring Company Owner Or Admin Later

The following routes should eventually require `company_owner` or `admin` for full access:

- `/dashboard/analytics`
- `/dashboard/coverage`
- `/dashboard/technicians`
- future company settings routes
- future billing routes
- future admin or moderation routes

Technicians may receive limited own-profile or assigned-work versions later, but company-wide data should be company-scoped and owner/admin gated.

## Pending Technician Handling

Pending technicians should not be treated as fully authorized.

Recommended behavior once enforcement starts:

1. Allow login.
2. Allow access to a limited onboarding/status page.
3. Block open jobs, private community, reputation, analytics, and company-wide CRM views.
4. Show a clear message that marketplace/community access requires verification.
5. Keep public pages available.

Initial redirect target:

- `/dashboard/settings` or a future `/dashboard/onboarding` route.

Do not use pending status as authorization for open job claiming, community access, reputation participation, company analytics, or admin surfaces.

## Dev Helper Routes

`/dashboard/dev/supabase-check` is a local development verification helper. It should remain direct-URL only and should not appear in public or dashboard navigation.

Recommended handling:

- During the next enforcement phase, keep it reachable for authenticated developers while Supabase setup is being verified.
- Do not expose it as production admin tooling.
- Do not print secret values.
- Do not use service-role keys.
- Do not auto-create profiles.
- Before production, either remove it, gate it behind `admin`, or disable it by environment.

## Redirect Targets

Future middleware or route-level guards should use explicit redirect targets:

| State | Redirect target | Notes |
| --- | --- | --- |
| Logged out | `/login?next=<encoded-path>` | Preserve intended dashboard path. Avoid redirecting from `/login` to itself. |
| Missing profile | `/dashboard/dev/supabase-check` in development, future `/account/setup` in production | Do not auto-create profile from frontend middleware. |
| Pending profile | future `/dashboard/onboarding` or `/dashboard/settings` | Explain verification status and next steps. |
| Suspended profile | future `/account/suspended` | Block dashboard data. Provide support path later. |
| Rejected profile | future `/account/rejected` | Block marketplace/community access. Provide support path later. |
| Unauthorized role | future `/dashboard/unauthorized` | Use for customers, public visitors, or technicians without required role. |

Redirect pages should be public or minimally protected enough to avoid loops. They should not expose private data.

## Safety Warnings

- Avoid infinite redirect loops by excluding `/login`, `/signup`, public routes, and the selected status/unauthorized routes from protected redirects.
- Keep public marketplace and SEO pages crawlable.
- Do not expose admin routes or admin-only data through public navigation.
- Do not use the Supabase `service_role` key in frontend code, browser code, or middleware intended for user sessions.
- Do not trust frontend role checks alone. Middleware improves routing, but server checks and Supabase RLS must enforce data access.
- Do not rely on hidden navigation as security.
- Do not redirect API/webhook/static asset paths through dashboard auth middleware.
- Preserve `.env.local` secrecy and never print key values.

## Recommended Phased Implementation

### Phase 1: Soft notices

Current state:

- Dashboard remains accessible.
- `DashboardAuthStatus` shows logged-out/demo mode, missing profile, and inactive profile notices.
- Auth/profile helper functions exist for future route decisions.

### Phase 2: Middleware dry-run / logging

Add middleware or route-level guard code that evaluates session/profile state but does not redirect yet.

Goals:

- Confirm route matching.
- Confirm session detection works in local and deployed environments.
- Confirm profile reads are safe and do not break builds.
- Record decisions in development logs only.

Do not log secrets, tokens, full customer data, or private profile details.

### Phase 3: Protect selected dashboard routes

Start with broad `/dashboard` authentication:

- Logged-out users redirect to `/login?next=<path>`.
- Missing profile users redirect to setup/check route.
- Pending users redirect to onboarding/status route.
- Suspended/rejected users redirect to status-specific routes.

Keep public routes unaffected.

### Phase 4: Protect owner/admin and verified-technician routes

Add route-specific role gates:

- `verified_technician` or higher for open jobs and community.
- `company_owner` or `admin` for company-wide analytics, coverage, team management, and future billing.
- `admin` only for future platform moderation, role management, audit, and support tools.

Pair route gates with RLS/server-side data checks before storing real private data.

## Rollback Plan

If middleware causes broken access or redirect loops:

1. Disable middleware route matching for `/dashboard`.
2. Revert to soft dashboard notices only.
3. Keep `/login`, `/signup`, public routes, and `/dashboard/dev/supabase-check` reachable.
4. Verify `npm run lint` and `npm run build -- --webpack`.
5. Re-test login, profile row detection, and dashboard access.
6. Re-enable protection one route group at a time.

Rollback should not require schema changes. Do not modify or drop profile data as part of route-protection rollback.

## Next Recommended Enforcement Step

The next implementation task should add a dry-run middleware or route-level guard that evaluates dashboard access decisions without redirecting. Once the dry run is stable, enforce login redirects for `/dashboard` while keeping public routes crawlable and preserving direct access to the dev helper during local setup.
