# Task 155 - Customer CRM Write Actions + Intake Linking

Task 155 adds the first internal Customer CRM write layer needed for the Workiz Exit workflow.

## Scope

- Dashboard-only customer creation and editing.
- Customer address management through a new normalized address table.
- Customer appliance add/edit actions through trusted RPCs.
- Customer internal notes separate from job notes.
- Intake-to-customer match/create action for source-neutral intake records.
- Communications Hub customer links for real phone-created conversations.

## Database foundation

Apply-ready migration:

- `supabase/migrations/0057_customer_crm_write_actions_apply_ready.sql`

The migration adds:

- `customers.company_id` for company-scoped dashboard CRM access.
- `customer_addresses` for primary and future secondary addresses.
- `customer_internal_notes` for internal customer-level notes.
- Dashboard-safe customer management checks and trusted RPCs:
  - `upsert_dashboard_customer_rpc`
  - `upsert_customer_address_rpc`
  - `upsert_customer_appliance_rpc`
  - `add_customer_internal_note_rpc`
  - `match_or_create_customer_for_intake_rpc`

The migration does not disable RLS, does not make customer data public, and does not add provider behavior.

## UI changes

- `/dashboard/customers` now supports search by customer name, phone, email, saved address, job address, city, state, and ZIP.
- Dashboard users can create a customer with contact and primary address fields; duplicate phone/email matches reuse the accessible customer instead of creating obvious duplicates.
- `/dashboard/customers/[id]` now supports editing profile/contact/address, adding/editing appliances, and adding internal customer notes.
- Customer detail keeps jobs, estimates, invoices, communications, appliance repair history, and timeline visible from existing records.
- `/dashboard/intake` now shows `Open Customer` when an intake is linked and `Create / Match Customer` when it is not.
- `/dashboard/communications` now selects linked `customer_id` and shows `Open Customer` or `Create / Match Customer` actions where appropriate.

## Source-neutral matching helper

A reusable helper was added at:

- `frontend/src/server/customer-matching/customer-matching.ts`

It normalizes customer matching inputs from future phone, SMS, website chat, Yelp, Thumbtack, email, or manual sources and calls the trusted match/create RPC.

## Safety boundaries

- No authentication changes.
- No Retell/Telnyx changes.
- No phone ingestion workflow changes beyond customer links in the read UI.
- No Property OS implementation.
- No dashboard redesign.
- No service-role exposure.
- No provider calls.

## Remaining work

- Apply `0057` in Supabase before expecting production dashboard writes.
- QA create/edit customer, add/edit address, add/edit appliance, internal note creation, intake match/create, and Communications Hub customer links with a real dashboard account.
- Future tasks can add richer duplicate review and multi-address UX, but this task provides the trusted write foundation.
