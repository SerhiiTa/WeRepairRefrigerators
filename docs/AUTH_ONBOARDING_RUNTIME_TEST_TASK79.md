# Auth Onboarding Runtime Test - Task 79

## Purpose

Task 79 verifies the current Supabase Auth, onboarding, and protected dashboard routing runtime behavior after Task 78.

No SQL was applied, no migrations were changed, no packages were installed, and no service-role key was used. This pass did not add product features.

## Test Environment

- App mode: existing production-mode server on port `3002`.
- Desktop URL tested: `http://localhost:3002`
- LAN URL checked: `http://10.0.0.67:3002`
- Browser used: Codex in-app browser for desktop route checks.
- Seeded credentials available to Codex: none.

`npm run start -- -H 0.0.0.0 -p 3002` was attempted, but port `3002` was already in use. The existing server responded successfully on both localhost and LAN URLs.

## Test Results

| Scenario | Route/Input | Expected | Actual | Status |
| --- | --- | --- | --- | --- |
| Logged-out dashboard access | `/dashboard` | Redirect to `/login?next=/dashboard` | Redirected to `http://localhost:3002/login?next=%2Fdashboard` | Pass |
| Logged-out nested dashboard access | `/dashboard/open-jobs` | Redirect to `/login?next=/dashboard/open-jobs` | Redirected to `http://localhost:3002/login?next=%2Fdashboard%2Fopen-jobs` | Pass |
| `/dashboard/dev/*` exception | `/dashboard/dev/supabase-check` | Remains reachable | Stayed on `http://localhost:3002/dashboard/dev/supabase-check` | Pass |
| Unsafe `next` on login | `/login?next=https://example.com` | Do not auto-navigate outside app | Stayed on local login URL | Pass |
| Unsafe protocol-relative `next` on login | `/login?next=//example.com` | Do not auto-navigate outside app | Stayed on local login URL | Pass |
| Unsafe `next` on onboarding | `/onboarding?next=https://example.com` | Do not auto-navigate outside app | Stayed on local onboarding URL while logged out | Pass |
| Desktop login route availability | `http://localhost:3002/login` | HTTP 200 | `curl -I` returned HTTP 200 | Pass |
| LAN/mobile login route availability | `http://10.0.0.67:3002/login` | HTTP 200 if LAN route is available | `curl -I` returned HTTP 200 | Pass |

## Seeded Account Tests Pending

The following scenarios require known dev/staging test credentials or manual Supabase SQL Editor profile state changes. They were not executed by Codex in this pass:

- Login `next` redirect with a valid test account from `/dashboard/open-jobs`.
- Incomplete onboarding profile redirects to `/onboarding?next=/dashboard`.
- Completed active/verified technician, company owner, or admin profile renders dashboard normally.
- Customer role redirects to `/account-status?reason=dashboard-role`.
- Pending profile redirects to `/account-status?reason=pending`.
- Suspended profile redirects to `/account-status?reason=suspended`.
- Rejected profile redirects to `/account-status?reason=rejected`.

## Bugs Found

No Task 79 runtime bug was found in the logged-out redirect, dev-route exception, unsafe-next URL, or localhost/LAN availability checks.

## Fixes Made

No application code fixes were required during Task 79.

## Remaining Limitations

- No seeded role/status account testing was possible without test credentials.
- The current protection is still client/runtime dashboard gating, not Supabase SSR cookie middleware.
- `/dashboard/dev/*` intentionally remains reachable for local verification.
- Production route protection still needs seeded tests for role/status/onboarding combinations and future middleware/SSR redirect-loop checks.
