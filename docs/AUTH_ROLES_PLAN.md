# Auth & Roles Implementation Plan

## Current Auth State

Authentication is not implemented yet. The app is currently a frontend-only mock platform:

- Dashboard routes are accessible as mock/demo screens.
- Public marketplace intake does not create real accounts.
- There are no real user profiles, sessions, organizations, teams, or permissions.
- There is no route protection, middleware, server auth check, Supabase client, database persistence, or RLS policy.
- All dashboard actions, open job claiming, lead conversion, discussion replies, and reputation behavior are local/static mock UI only.

## Role Definitions

### public_visitor

- Purpose: Anonymous customer or search visitor browsing public marketplace pages.
- Signup path: No signup required.
- Dashboard access: None.
- Allowed actions: View public SEO pages, technician public profiles, ZIP discovery, and submit public intake if anonymous intake is enabled.
- Restricted actions: Cannot access dashboard, leads, repair cases, open jobs, private community, analytics, billing, or admin tools.
- Future billing implications: None directly; may become a customer after submitting a request.

### customer

- Purpose: Customer who submitted a service request and may later track request status.
- Signup path: Optional account creation after public intake or magic-link/customer portal flow later.
- Dashboard access: No internal dashboard access; future customer portal only.
- Allowed actions: View own service request, update limited contact/preferred-window details, and approve customer-facing communication where needed.
- Restricted actions: Cannot view technician dashboard, other customer leads, open jobs board, private repair cases, community, technician reputation, internal notes, or company analytics.
- Future billing implications: May pay invoices or deposits later, but should not access technician subscription or marketplace payout data.

### technician

- Purpose: Technician account before full marketplace/community verification.
- Signup path: Technician signup or company invitation.
- Dashboard access: Limited dashboard onboarding/profile access.
- Allowed actions: Create technician profile draft, select service areas, select specialties, and manage own onboarding data.
- Restricted actions: Cannot claim open jobs, access private community, view reputation leaderboard, view company-wide analytics, or access other technicians' private CRM data until verified/authorized.
- Future billing implications: May need subscription status or company membership before marketplace access.

### verified_technician

- Purpose: Technician approved for marketplace work and private technician community access.
- Signup path: Technician completes onboarding and passes verification.
- Dashboard access: Technician dashboard routes scoped to own or eligible work.
- Allowed actions: View eligible open jobs, assigned leads/jobs, own repair cases, community discussions, help request creation, and reputation surfaces.
- Restricted actions: Cannot access admin moderation tools, other companies' CRM data, customer PII outside assigned/eligible work, billing owner settings, or service-role data.
- Future billing implications: May require active subscription, company coverage, or paid lead eligibility before claiming marketplace jobs.

### expert_technician

- Purpose: Verified technician with recognized specialty/reputation for advanced repair help.
- Signup path: Must become a verified technician first; expert status later assigned by admin or earned through reputation thresholds.
- Dashboard access: Verified technician access plus future expert-only queues or premium community areas.
- Allowed actions: Provide expert replies, participate in accepted solution workflows, contribute to knowledge cases, and access expert-only discussion areas when implemented.
- Restricted actions: Cannot manage platform-wide admin tools, billing for other accounts, raw analytics events, or private data outside role scope.
- Future billing implications: May unlock premium expert revenue share, paid expert community access, or lead priority rules later.

### company_owner

- Purpose: Service company owner or manager operating a technician team.
- Signup path: Company account creation, invitation, or admin-assisted onboarding.
- Dashboard access: Company-scoped dashboard access.
- Allowed actions: Manage team technicians, company leads, assigned/open jobs, repair cases, coverage, analytics, company settings, and billing owner flows.
- Restricted actions: Cannot access other companies' CRM records, private community moderation beyond allowed team/community scope, platform admin controls, or service-role credentials.
- Future billing implications: Owns company subscription, paid lead budget, premium ZIP placement, and team billing settings.

### admin

- Purpose: Platform operator for verification, moderation, support, and sensitive operational tasks.
- Signup path: Manual assignment only.
- Dashboard access: Admin-only operational tools when built.
- Allowed actions: Verify technicians, assign roles, moderate community, review audit logs, support billing issues, and manage platform safety workflows.
- Restricted actions: Should not bypass audit logging, expose PII publicly, use service-role credentials client-side, or publish private community/RAG data without approval.
- Future billing implications: Can support billing disputes and plan status issues but should not handle raw payment card data.

## Access Matrix

Legend:

- `Public`: accessible without auth.
- `Own`: own customer/account data only.
- `Limited`: role-scoped or onboarding-only access.
- `Team`: company/team-scoped access.
- `Yes`: role can access when authenticated and authorized.
- `No`: no access.

| Route / feature | public_visitor | customer | technician | verified_technician | expert_technician | company_owner | admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Homepage `/` | Public | Public | Public | Public | Public | Public | Public |
| Brand pages `/brands`, `/brands/[brand]` | Public | Public | Public | Public | Public | Public | Public |
| Service pages `/services`, `/services/[service]` | Public | Public | Public | Public | Public | Public | Public |
| Location pages `/locations`, `/locations/[city]` | Public | Public | Public | Public | Public | Public | Public |
| Technician public profiles `/technicians`, `/technicians/[slug]` | Public | Public | Public | Public | Public | Public | Public |
| Schedule-service intake `/schedule-service` | Public | Own | Public | Public | Public | Public | Public |
| `/dashboard` | No | No | Limited | Yes | Yes | Team | Yes |
| `/dashboard/leads` | No | No | Limited assigned only | Yes assigned/eligible | Yes assigned/eligible | Team | Yes |
| `/dashboard/leads/[leadId]` future | No | No | Limited assigned only | Yes assigned only | Yes assigned only | Team | Yes |
| `/dashboard/coverage` | No | No | Limited own availability | Yes own/eligible | Yes own/eligible | Team | Yes |
| `/dashboard/analytics` | No | No | No or limited own metrics | Limited own metrics | Limited own metrics | Team | Yes |
| `/dashboard/open-jobs` | No | No | No until verified | Yes eligible jobs | Yes eligible jobs | Team visibility | Yes |
| `/dashboard/community` | No | No | No until verified | Yes | Yes | Limited if verified | Yes |
| `/dashboard/community/new` | No | No | No until verified | Yes | Yes | Limited if verified | Yes |
| `/dashboard/community/[discussionId]` | No | No | No until verified | Yes private community | Yes private/expert | Limited if verified | Yes |
| `/dashboard/community/reputation` | No | No | No until verified | Yes | Yes | Limited team/community | Yes |
| `/dashboard/repair-cases` | No | No | Limited assigned only | Yes assigned | Yes assigned | Team | Yes |
| `/dashboard/repair-cases/new` | No | No | Limited if assigned/company | Yes | Yes | Team | Yes |
| `/dashboard/technicians` | No | No | Limited own profile | Limited own/team | Limited own/team | Team | Yes |
| `/dashboard/ai-articles` | No | No | Limited assigned content | Yes assigned content | Yes assigned/expert content | Team | Yes |

## Signup / Login Flow Plan

### Customer flow

1. Customer submits public intake without needing an account at first.
2. System creates a marketplace lead through server-side validation in a later persistence phase.
3. Customer may be offered optional account creation after submission.
4. Customer portal can be added later for request status, communication, invoices, and history.
5. Customer access must remain limited to their own request/account data.

### Technician flow

1. Technician signs up or accepts company invitation.
2. Technician creates profile.
3. Technician selects service areas.
4. Technician selects brand/appliance/service specialties.
5. Technician enters pending verification status.
6. After verification, technician gets access to eligible open jobs and private community.

### Expert technician flow

1. User must be a verified technician first.
2. Expert status is assigned manually by admin at first.
3. Later, expert status may be earned from accepted solutions, badge thresholds, specialty verification, or paid expert program rules.
4. Expert-only access should be explicit and auditable.

### Company owner flow

1. Company owner creates company account or is created by admin.
2. Owner invites technicians.
3. Owner manages team service areas, leads, jobs, repair cases, coverage, analytics, and billing.
4. Company ownership must be represented in profile/company relationships before team-wide dashboard data is enabled.

### Admin flow

1. Admin role is manually assigned.
2. Admin verifies technicians, reviews moderation queues, supports disputes, and manages sensitive role changes.
3. Admin actions must be audited.

## Technician Verification Plan

Verification statuses:

- `pending`: Technician has signed up but cannot claim jobs or access private community yet.
- `verified`: Technician can access eligible open jobs and private technician community.
- `rejected`: Technician cannot access marketplace/community features.
- `suspended`: Technician access is temporarily disabled pending review.

Future verification data may include:

- Name.
- Business name.
- Service areas.
- Specialties.
- License/insurance details, if required.
- Experience level.
- References or reviews.
- Public profile readiness.

Do not store sensitive verification documents until secure private storage, signed URLs, retention rules, and admin-only review permissions exist.

## Route Protection Strategy

Future route protection should use server-side checks. Middleware can handle broad redirects, but page/server-layer authorization must still validate access for sensitive data.

Planned protection:

- Public routes remain accessible without auth.
- `/dashboard` requires an authenticated profile.
- Technician dashboard features require `technician` or higher, with route-specific checks.
- `/dashboard/open-jobs` requires `verified_technician`, `expert_technician`, `company_owner`, or `admin`.
- `/dashboard/community`, `/dashboard/community/new`, `/dashboard/community/[discussionId]`, and `/dashboard/community/reputation` require `verified_technician` or higher.
- Company/team views require matching `company_id` ownership.
- Admin routes require `admin`.
- Customer portal routes, when created, require customer ownership or secure request-token validation.

## RLS Role Mapping

Future Supabase RLS should map roles to database policies:

- `public_visitor`: can select only approved public SEO records and public technician profile fields.
- `customer`: can select and update own `marketplace_leads` and future customer portal records.
- `technician`: can select own profile/onboarding data and assigned jobs/cases only where explicitly permitted.
- `verified_technician`: can select eligible `open_jobs`, assigned `marketplace_leads`, assigned `repair_cases`, and private `community_discussions`/`community_messages`.
- `expert_technician`: can use verified technician policies plus future expert-only discussion/knowledge policies.
- `company_owner`: can select and manage records scoped to their `company_id`, including team technicians, leads, jobs, repair cases, and aggregate analytics.
- `admin`: can select/manage all records through audited admin tools and policies.

Frontend role checks should improve UX only. RLS and server checks must enforce the real boundary.

## Navigation Visibility Plan

The current dashboard navigation remains static until the auth phase begins.

Later navigation behavior:

- Hide dashboard routes the signed-in user cannot access.
- Show onboarding/profile setup for unverified technicians.
- Show Open Jobs only for verified technicians, expert technicians, company owners, and admins.
- Show Community and Reputation only for verified technicians or higher.
- Show company/team tools only for company owners and admins.
- Show admin tools only for admins.
- Keep public navigation independent from dashboard permissions.

Navigation visibility must not be treated as security. Hidden links still require server/RLS protection.

## Security Requirements

- Never trust frontend role checks alone.
- Enforce access with RLS and server-side checks.
- Keep service-role key server-only.
- Keep customer PII out of public pages.
- Keep private technician community non-public and non-indexed.
- Use signed URLs for private files later.
- Add audit logs for role changes, verification status changes, lead assignment, open job claiming, accepted solutions, moderation, and billing changes.
- Add rate limiting for auth, signup, login, password reset, public intake, open job claiming, and community posting.
- Separate customer, technician, company, community, analytics, and billing data boundaries.

## First Implementation Recommendation

### Phase 1: Basic auth foundation

- Install/configure Supabase client only when implementation is explicitly approved.
- Create `profiles` table.
- Add `role`, `status`, `company_id`, and timestamps.
- Implement basic login/signup.
- Protect `/dashboard`.
- Create role-aware dashboard shell/navigation.
- Keep existing mock data until persistence phase.

### Phase 2: Technician onboarding and route gates

- Add technician onboarding profile.
- Add verification status.
- Gate Open Jobs and Community behind verified technician status.
- Add company owner team visibility if company accounts are included in MVP.

### Phase 3: Migrate one safe flow to persistence

- Start with public intake to `marketplace_leads` or technician profile onboarding.
- Keep scope narrow.
- Add RLS tests before expanding to open jobs, community, repair cases, or billing.

## Open Questions / Decisions Needed

- Should customer accounts launch immediately, or should customers start with anonymous intake plus optional account creation later?
- Should technician self-signup be allowed in the Houston MVP, or should the beta be invite-only?
- Should expert status be manual first, reputation-based later, or both?
- Are company accounts required in the first auth release, or can MVP start with single-company/internal accounts?
- Should public technician profiles require verification before being visible?
- What is the minimum verification required before open job access?
- Should community access require both verification and active subscription later?
- Should company owners be able to view private community posts from their technicians, or should community remain individual verified-technician scoped?
