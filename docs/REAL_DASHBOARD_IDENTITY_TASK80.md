# Task 80 — Real Dashboard Identity & Data Loading

## Summary

Task 80 started replacing dashboard mock identity state with real Supabase-authenticated account context.

The dashboard now has a centralized client-side identity loader that reads through the normal authenticated anon Supabase client and existing RLS policies. It does not use `service_role`, does not bypass RLS, and does not write data.

## Implemented

- Added a dashboard identity loader for:
  - auth session/profile through the existing profile helper
  - profile role/status/onboarding completion state
  - linked company record when readable
  - company membership context when RLS allows it
  - technician profile context when readable
- Added real account overview cards to `/dashboard`.
- Updated the dashboard auth/status panel to include:
  - real profile status
  - onboarding status indirectly through the loaded profile/account context
  - company context
  - membership visibility state
  - technician profile state
- Updated dashboard copy to clearly separate:
  - real Supabase account/session/onboarding data
  - mock marketplace/repair/job/demo data

## RLS Behavior

The loader uses the authenticated anon Supabase client and respects RLS.

`company_members` raw rows remain intentionally limited after the Task 74 RLS patch because the table includes private/internal fields such as `notes`. If the current account cannot manage company members, the dashboard shows a restricted/empty membership state instead of pretending a membership was loaded.

## Files

- `frontend/src/lib/dashboard/identity.ts`
- `frontend/src/components/dashboard/DashboardIdentityOverview.tsx`
- `frontend/src/components/dashboard/DashboardAuthStatus.tsx`
- `frontend/src/app/dashboard/page.tsx`
- `frontend/src/lib/supabase/types.ts`

## Still Mock

- Repair case metrics
- Marketplace lead/job boards
- Analytics
- Community data
- Coverage/workload data
- AI article workflows

These remain local demo datasets until their persistence migrations, RLS policies, and server actions are implemented.

## Limitations

- Dashboard identity loading is client-side. Future work may add server-side identity hydration to reduce duplicate reads and improve first paint.
- Non-manager company members may need a sanitized self-membership view/RPC later because raw `company_members` remains intentionally hidden from them.
- Role-aware navigation hiding is still future work.
