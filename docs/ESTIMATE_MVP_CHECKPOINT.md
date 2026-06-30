# Estimate MVP Checkpoint

## Purpose

This checkpoint freezes the current Estimate MVP state after successful customer approval flow verification and before invoice, payment, PDF, SMS, or email workflows are added. The estimate system is now treated as a real CRM business-document workflow, not a disposable UI card.

Task 101.1 records that tokenized customer approval links, public approve/decline responses, and status persistence have been verified end to end in the browser.

## Architecture Summary

The Estimate MVP lives inside the real service request CRM flow:

1. A customer request is saved in `public.service_requests`.
2. An authorized dashboard user opens `/dashboard/leads/[id]`.
3. The estimate builder loads active `pricing_catalog_items` through authenticated Supabase/RLS access.
4. The technician selects appliance-category-specific catalog jobs and optional custom work.
5. Estimate creation goes through `/api/service-requests/[id]/estimates`, which calls Supabase RPCs using the user's bearer token.
6. Saved estimates render as managed CRM documents in the Saved Estimates list.
7. Draft estimates can be edited or voided through draft-only RPCs.
8. Non-draft or void estimates remain read-only history.
9. Draft estimates can be sent to customers through tokenized approval links.
10. Customers can approve or decline sent estimates without login through `/estimates/[token]`.

The browser never receives a service-role key and does not get broad write access to estimate tables. Estimate mutations are routed through narrow RPCs that validate authentication, request visibility, draft status, and payload shape.

## Database Objects Involved

Core tables from Task 97/98:

- `public.pricing_catalog_items`
- `public.service_request_estimates`
- `public.service_request_estimate_items`
- `public.service_request_notes` for timeline entries
- `public.service_requests` for request status changes

RPCs:

- `public.create_service_request_estimate_rpc(...)`
- `public.update_service_request_estimate_draft_rpc(...)`
- `public.void_service_request_estimate_draft_rpc(...)`
- `public.send_service_request_estimate_to_customer_rpc(...)`
- `public.get_public_estimate_by_token_rpc(...)`
- `public.respond_to_public_estimate_rpc(...)`
- `public.estimate_approval_token_hash(...)`

Important helper dependency:

- `public.can_view_service_request(...)`

## API Endpoints Involved

- `POST /api/service-requests/[id]/estimates`
  - Creates a new draft estimate from catalog and custom line items.
  - Requires a dashboard bearer token.
  - Calls `create_service_request_estimate_rpc`.

- `PATCH /api/service-requests/[id]/estimates`
  - Updates an existing draft estimate.
  - Requires `estimateId` and at least one valid line item.
  - Calls `update_service_request_estimate_draft_rpc`.

- `DELETE /api/service-requests/[id]/estimates`
  - Voids an existing draft estimate.
  - Requires `estimateId`.
  - Calls `void_service_request_estimate_draft_rpc`.

- `POST /api/estimates/[id]/send`
  - Sends a draft estimate by generating a one-time-visible public approval token.
  - Requires a dashboard bearer token.
  - Calls `send_service_request_estimate_to_customer_rpc`.

- `POST /api/estimates/[id]/respond`
  - Records public customer approve/decline responses for tokenized estimates.
  - Calls `respond_to_public_estimate_rpc`.

## UI Screens Involved

- `/dashboard/leads`
  - CRM inbox for real `service_requests`.
  - Shows request status and routes into detail pages.

- `/dashboard/leads/[id]`
  - Main estimate workspace.
  - Includes appliance category selection, catalog job cards, selected estimate cart, custom line item, customer-facing preview, save/update actions, and Saved Estimates list.
  - Saved Estimates is the single source of truth for persisted estimate documents.
  - View expands an estimate inline instead of rendering a duplicate panel.
  - Draft estimates can be sent to customers, after which approval links are available and the estimate becomes read-only.

- `/estimates/[token]`
  - Public customer approval page.
  - Shows only customer-safe estimate, line item, warranty, disclaimer, and service summary fields.
  - Supports approve and decline actions without requiring customer login.

## Estimate Lifecycle

Current supported lifecycle:

- `draft`
  - Created from catalog/custom line items.
  - Editable through `Update Draft`.
  - Can be voided.
  - Not sent to a customer yet.

- `sent`
  - Created when a technician sends a draft estimate to the customer.
  - Read-only in the dashboard.
  - Customer can open the tokenized approval page.

- `approved`
  - Created when the customer approves the sent estimate.
  - Read-only in the dashboard.
  - Updates the related service request to `estimate_approved`.

- `declined`
  - Created when the customer declines the sent estimate.
  - Read-only in the dashboard.
  - Updates the related service request to `estimate_declined`.

- `void`
  - Read-only history.
  - Created when a draft is voided.

Planned/future lifecycle states:

- `presented`
- `converted_to_invoice`

These future/legacy states should remain read-only in the current UI until invoice workflows are designed.

## Draft Behavior

- A request can have multiple estimates over time.
- Only draft estimates are editable.
- If an active draft exists, the builder guides the technician to edit that draft before creating another estimate.
- Creating another draft requires an intentional `Create Another Draft` action.
- After create/update, the builder resets intentionally so the saved estimate remains the source of truth.

## Edit and Update Flow

- `Edit Draft` loads the saved draft line items into the builder.
- The builder heading changes to `Editing draft EST-*`.
- The primary button changes to `Update Draft`.
- Saving calls the PATCH endpoint and updates the same estimate record/number.
- The UI reloads saved estimates and timeline entries after save.

## Void Flow

- `Void Draft` is available only for draft estimates.
- Voiding calls the DELETE endpoint and RPC.
- The estimate remains visible in Saved Estimates as read-only history.
- Voiding writes a timeline note when the RPC is available.

## Persistence Behavior

- Estimate creation persists after refresh when migrations through `0024` are applied.
- Draft update and void persistence require migration `0025` to be applied in the target dev/staging Supabase project.
- Send/approve/decline persistence requires migrations `0026` and `0027` to be applied in the target dev/staging Supabase project.
- Browser QA has verified draft creation, draft editing, send-to-customer, approval link generation, public approve/decline, refresh persistence, and read-only approved estimates after migrations `0025`, `0026`, and `0027` were applied manually.

## Migrations Required Through Task 100

Required estimate/storage/service-request baseline:

- `0017_service_requests_foundation_apply_ready.sql`
- `0018_service_requests_dashboard_read_policies_apply_ready.sql`
- `0019_service_request_status_update_policies_apply_ready.sql`
- `0020_service_request_notes_foundation_apply_ready.sql`
- `0023_pricing_catalog_and_estimates_foundation_apply_ready.sql`
- `0024_estimate_ux_v2_fields_apply_ready.sql`
- `0025_estimate_lifecycle_rpc_apply_ready.sql`
- `0026_estimate_customer_approval_flow_apply_ready.sql`
- `0027_estimate_token_generation_fix_apply_ready.sql`

Related optional/current CRM foundation:

- `0021_service_request_photos_foundation_apply_ready.sql`
- `0022_patch_service_request_photos_anon_select_revoke_apply_ready.sql`

## Known Limitations

- No SMS, email, or automated customer delivery yet. The MVP exposes copy/open approval links only.
- No PDF rendering yet.
- No payment, invoice, tax engine, deposit, or Stripe flow yet.
- No estimate version comparison UI yet.
- No parts inventory, purchase order, or technician commission workflow yet.
- No customer authentication or customer portal around estimate history yet.
- Approval token revocation/expiration is not implemented yet.
- Tax remains simple/null-first and is not an accounting-grade calculation.
- Browser QA requires a valid seeded technician/company owner session and the relevant Supabase migrations applied in dev/staging.

## Future Approval and Invoice Roadmap

Recommended next phases:

1. Add optional token expiration/revocation and customer response metadata such as IP/user agent if required.
2. Send estimate by SMS/email through server-side providers.
3. Convert approved estimate to invoice.
4. Payment/deposit workflow through Stripe.
5. PDF rendering after approval/invoice contracts are stable.
6. Repair case generation from completed estimate/request history.

## Task 101.1 Browser QA Checkpoint

Manually verified in dev/staging after applying migrations `0025`, `0026`, and `0027`:

- Draft estimate creation.
- Editing an existing draft estimate.
- Sending an estimate to a customer.
- Approval link generation.
- Public customer estimate page.
- Customer approve flow.
- Customer decline flow.
- Estimate and service request status persistence after refresh.
- Approved estimates remain read-only in the dashboard.
