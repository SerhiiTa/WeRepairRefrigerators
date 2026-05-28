# Onboarding UI Implementation - Task 77

## Purpose

Task 77 adds the first real onboarding UI that calls the Task 75/76 server actions and writes supported onboarding data to the current dev/staging Supabase project.

This is intentionally simple. It does not add invite acceptance, join requests, admin verification, hard route protection, payments, uploads, or production onboarding polish.

## Files Added

- `frontend/src/app/onboarding/page.tsx`
- `frontend/src/components/public/OnboardingFlow.tsx`
- `frontend/src/components/dashboard/DashboardOnboardingGuard.tsx`

## Files Updated

- `frontend/src/components/dashboard/DashboardShell.tsx`
- `frontend/src/server/onboarding/actions.ts`
- `frontend/src/server/onboarding/types.ts`

## Route Added

- `/onboarding`

## Supported Flows

### Customer

- Reads authenticated Supabase session/profile.
- Updates `profiles.full_name`.
- Calls `completeOnboarding`.
- Redirects to dashboard after success.

### Independent Technician

- Reads authenticated Supabase session/profile.
- Updates `profiles.full_name`.
- Calls `updateTechnicianProfile` to create a draft `technician_profiles` row when current RLS allows it.
- Calls `completeOnboarding`, which currently advances technician accounts to `technician_verification_pending` unless already verified.
- Redirects to dashboard after success.

Known limitation: public technician signup currently starts as `pending`, and the applied RLS helper excludes pending profiles from technician profile insert. A pending technician may need dev/admin activation before this path can create the draft technician profile.

### Company Owner

- Reads authenticated Supabase session/profile.
- Updates `profiles.full_name`.
- Calls `createCompanyAndOwnerMembership`, backed by `create_company_and_owner_membership_rpc`.
- Calls `completeOnboarding`.
- Redirects to dashboard after success.

Company creation requires the authenticated profile role to already be `company_owner` or `admin`. Public signup cannot grant these roles.

## Basic Profile Data

The UI collects:

- full name
- display name
- phone

Current persistence:

- `full_name` is saved to `public.profiles`.
- technician display/profile fields are saved to `technician_profiles` where RLS allows.
- company phone is saved as `companies.business_phone` for company owner flow.
- personal phone is not saved yet because the current `profiles` table does not have a phone column. A future customer/contact table should handle this.
- company service ZIP codes are collected for future use but are not saved yet because company service areas are not part of the current applied schema.

## Onboarding Guard

`DashboardOnboardingGuard` is mounted inside `DashboardShell`.

Behavior:

- Logged-out/demo dashboard access remains non-blocking.
- Supabase-unavailable mode remains non-blocking.
- `/dashboard/dev/*` remains reachable directly for setup/debug helpers.
- Authenticated users with a profile where `onboarding_status !== complete` are redirected to `/onboarding?next=<current-dashboard-path>`.
- Completed users can continue to dashboard routes.

## Security Notes

- No service-role key is used or exposed.
- The browser only obtains the current session access token and passes it to reviewed server actions.
- Server actions still validate the access token with Supabase Auth server-side.
- Company creation and onboarding completion use trusted RPCs that rely on `auth.uid()`.
- Browser-submitted role escalation is not trusted.
- Company owner flow checks role server-side and in the RPC.
- This UI does not expose private company membership notes, invite hashes, audit logs, or admin-only data.

## Remaining Work

- Seeded authenticated tests for customer, technician, and company owner flows.
- Better UX around pending technician activation/verification.
- Dedicated onboarding success/next-step pages.
- Invite acceptance and company join requests.
- Admin technician verification and owner/company review.
- Production route protection and role-aware redirects.
- Customer/contact phone persistence in a future table.

## Verification

Required after implementation:

- `npm run lint`
- `npm run build -- --webpack`
- service-role exposure scan
- `git diff --check`

No commit should be made from this task.
