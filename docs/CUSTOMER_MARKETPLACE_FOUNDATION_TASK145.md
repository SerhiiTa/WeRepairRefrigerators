# Customer Marketplace Foundation Task 145

Task 145 creates the first mobile-first customer marketplace and customer account foundation.

## Scope Implemented

- Public customer entry route: `/customer`
- Customer preview route: `/customer/diagnosis-preview`
- Public technician options route: `/customer/pros`
- Customer price preview route: `/customer/price-prediction`
- Customer auth routes: `/customer/login` and `/customer/register`
- Customer account route: `/customer/dashboard`
- Technician CRM customer routes: `/dashboard/customers` and `/dashboard/customers/[id]`
- Apply-ready migration: `supabase/migrations/0035_customer_marketplace_foundation_apply_ready.sql`

## Database Foundation

Migration `0035` adds:

- `public.customers`
- `public.customer_appliances`
- `service_requests.customer_id`
- `service_requests.customer_appliance_id`
- `find_or_create_customer_for_request_rpc(...)`
- `create_service_request_with_customer_rpc(...)`

The migration is review/apply-ready only. It was not applied by Codex.

## Task 146 SQL Apply / QA Status

- Codex reviewed and corrected migration `0035` before apply.
- Current migration `0035` now includes dashboard-safe customer visibility helpers and customer account linking:
  - `link_current_customer_account_rpc(...)`
  - `can_view_customer(uuid)`
  - `can_view_customer_appliance(uuid)`
- Codex could not apply remote SQL from this environment because the local project has no `supabase` CLI, no `psql`, and no database URL/access token available.
- A safe anon-client reachability check against the configured dev Supabase showed customer tables are reachable, but the corrected helper RPCs are not present in the schema cache.
- Manual action required: apply the current full contents of `supabase/migrations/0035_customer_marketplace_foundation_apply_ready.sql` in Supabase SQL Editor.
- Do not consider customer dashboard/account QA complete until the corrected `0035` SQL has been applied.

## Task 146 Continued QA After 0035 Apply

- The user reported `0035` was applied successfully in Supabase.
- Real database QA confirmed:
  - `create_service_request_with_customer_rpc(...)` creates customer-linked service requests when `request_source = 'schedule_service'`.
  - Reusing the same phone/email creates separate service requests tied to the same customer row.
  - `/api/service-requests` saves successfully through the app server after `0035`.
  - `/customer/dashboard` redirects logged-out users to `/customer/login?next=/customer/dashboard`.
  - `/dashboard/customers` and `/dashboard/customers/[id]` redirect logged-out users to technician login.
  - `/customer` to `/customer/diagnosis-preview` works as preview-only flow and does not book an appointment.
- Bugs found:
  - Supabase Auth requires email confirmation, so generated customer accounts do not receive a browser session until confirmed.
  - The customer registration UI previously tried to continue after signup even when no session was returned.
  - The applied `0035` RPC defaulted unsupported request sources to `customer_marketplace`, which violates the existing `service_requests_request_source_check` constraint.
  - Authenticated customers need a direct read policy for their own linked service requests.
- Bugs fixed in code/migrations:
  - Customer registration now stays on the form and shows “Check your email to confirm the account, then sign in.” when signup returns no session.
  - New forward migration `supabase/migrations/0036_customer_service_request_self_read_apply_ready.sql` adds customer self-read for linked service requests and replaces the request RPC to normalize unsupported sources to `schedule_service`.
- Manual action required after Task 146:
  - Apply `0036_customer_service_request_self_read_apply_ready.sql` in Supabase SQL Editor.
  - Confirm or prepare a dev customer Auth user before browser-testing customer login/dashboard with a real session.

## Task 146 Final QA After 0036 Apply

- The user reported `0036` was applied successfully in Supabase.
- Real database QA confirmed:
  - Unsupported customer request sources now normalize safely and no longer violate the existing `service_requests_request_source_check`.
  - Anonymous `service_requests` SELECT remains blocked.
  - Anonymous execution of the customer self-read helper remains blocked.
  - Customer-aware request RPC still creates real customer-linked service requests.
  - Duplicate customer prevention still works by reusing the same customer for repeated phone/email.
- Browser QA confirmed:
  - `/customer/dashboard` redirects logged-out users to `/customer/login?next=/customer/dashboard`.
  - `/dashboard/customers` redirects logged-out users to `/login?next=%2Fdashboard%2Fcustomers`.
  - `/dashboard/customers/[id]` redirects logged-out users to `/login?next=...`.
  - `/customer`, `/customer/login`, `/customer/register`, `/customer/diagnosis-preview`, `/customer/pros`, and `/customer/price-prediction` render without horizontal overflow in the available in-app browser viewport.
- Confirmed-account QA status:
  - Supabase Auth currently requires email confirmation. Codex-created generated customer users cannot log in until confirmed.
  - The repository does not contain a confirmed customer password or dashboard QA password, and Codex does not have service-role/admin access to confirm Auth users.
  - A manually confirmed dev customer account is still required to complete `/customer/login` -> `/customer/dashboard` data QA.
  - A manually confirmed dashboard technician/company-owner account is still required to complete authenticated `/dashboard/customers` and `/dashboard/customers/[id]` data QA.

## Task 146.1 Confirmed QA Account Fixture

- Added dev/staging fixture: `supabase/fixtures/customer_marketplace_qa_accounts_task146.sql`.
- Required Auth users:
  - customer: `qa-customer-marketplace@example.test`
  - dashboard technician: `qa-customer-dashboard@example.test`
- Passwords are intentionally not stored in git, docs, SQL, screenshots, or Codex output.
- To use the fixture:
  1. Create both Supabase Auth users in the dev/staging Supabase dashboard.
  2. Set temporary passwords in a password manager only.
  3. Confirm both users.
  4. Apply `supabase/fixtures/customer_marketplace_qa_accounts_task146.sql` in Supabase SQL Editor.
- The fixture:
  - confirms Auth rows defensively;
  - prepares active customer and technician profiles;
  - links a real customer row;
  - creates a customer appliance;
  - creates a customer-linked service request selected for the QA technician;
  - preserves the no-password-in-repo rule.
- Codex could not create confirmed Auth users directly because the local repo exposes only the public anon key, not Supabase dashboard access, database credentials, or a service-role/admin key.

## Customer Account Behavior

- Customers can register or log in through customer-specific routes.
- The customer dashboard requires a browser Supabase session.
- If customer tables are not available in the environment yet, the UI shows a safe setup state instead of raw database errors.
- Customer service request creation can use the new trusted RPC after migration `0035`; until then, the existing public service request insert fallback remains available.

## Public Marketplace Behavior

- `/customer` collects a local preview only and does not create a job.
- `/customer/diagnosis-preview` summarizes the preview state.
- `/customer/price-prediction` shows a planning range and gates next steps behind a customer account.
- `/customer/pros` reads only `public.public_technician_profiles`; it does not use mock technician fallback.

## Safety Boundaries

- No payments.
- No real AI backend.
- No vendor APIs.
- No SMS, calls, emails, or booking creation.
- No customer community backend.
- No service-role key usage in frontend code.
- No private technician fields exposed on customer routes.
- Technician dashboard auth and CRM logic remain separate from customer account routes.

## Mobile Validation

The customer routes use mobile-first stacked layouts, full-width controls, compact cards, and responsive grids intended for 375px, 390px, and 430px widths.

## Remaining Work

- Apply migration `0035` in dev/staging before expecting customer table persistence.
- After applying the corrected `0035`, verify:
  - `/customer/register`
  - `/customer/login`
  - `/customer/dashboard`
  - `/dashboard/customers`
  - `/dashboard/customers/[id]`
  - no duplicate customers for reused phone/email
  - customer-linked service request creation through `create_service_request_with_customer_rpc(...)`
- After applying `0036`, verify customer dashboard service request history with a confirmed customer Auth account.
- Add profile-linking for already-authenticated customers after signup confirmation behavior is finalized.
- Build real customer booking requests only in a future explicitly approved task.
- Add customer estimate/invoice history once customer-owned read policies are fully tested.
- Add real AI, vendor, payment, communication, and customer community integrations in separate tasks.
