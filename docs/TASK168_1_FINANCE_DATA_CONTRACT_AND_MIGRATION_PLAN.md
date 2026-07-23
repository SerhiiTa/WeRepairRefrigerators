# Task 168.1 - Finance Data Contract Audit And Migration Plan

Task 168.1 is documentation-only. It does not create migrations, change schema, change RPCs, change APIs, change UI, or start the shared calculation engine.

This document defines the V1 data-contract direction for the Repair Proposal Builder before any apply-ready SQL is written.

## Decision Summary

Use the existing estimate/invoice engine.

- `service_request_estimates` remains the internal financial row and becomes the V1 Repair Proposal version row.
- `service_request_estimate_items` remains the financial line snapshot table and receives additive Repair Solution grouping metadata later.
- Do not create `repair_proposal_versions` in V1.
- Keep approval tokens on `service_request_estimates`.
- Keep invoice creation from approved `service_request_estimates`.
- Add immutable customer-facing proposal snapshots to `service_request_estimates`.
- Add calculation snapshot fields to `service_request_estimates`.
- Add Price Book source snapshot/reference fields to `service_request_estimate_items`.
- Preserve every legacy estimate, public estimate link, approval token, job status sync, and invoice conversion path.

The customer receives a Repair Proposal. The technician works in the Repair Proposal Builder. The database still stores an internal Estimate row as the durable financial entity.

## 1. Existing Schema Inventory

### `pricing_catalog_items`

Created by `0023` and expanded by `0024`.

Current purpose:

- Legacy estimate catalog source.
- Still referenced by `service_request_estimate_items.pricing_catalog_item_id`.
- Must remain supported for old estimate rows and any remaining catalog-based estimate flows.

Important fields:

- `id`
- `appliance_type`
- `category`
- `title`
- `description`
- `default_labor_price`
- `estimated_duration_minutes`
- `active`
- `customer_price`
- `technician_cost`
- `taxable`
- `default_warranty_text`
- `default_disclaimer_text`
- `sort_order`

### `service_request_estimates`

Created by `0023`, expanded by `0024`, `0026`, `0043`, `0045`, and fixed by `0046`.

Current purpose:

- Internal estimate/draft/sent/approved/declined row.
- Public approval token owner.
- Source for invoice creation.
- Source for Job Workspace saved estimate cards.

Important fields:

- `id`
- `service_request_id`
- `created_by_profile_id`
- `subtotal`
- `tax`
- `total`
- `estimate_status`
- `estimate_number`
- `customer_preview_notes`
- `warranty_text`
- `disclaimer_text`
- `public_approval_token_hash`
- `sent_at`
- `customer_responded_at`
- `archived_at`
- `archived_by_profile_id`
- `archive_reason`
- `created_at`
- `updated_at`

### `service_request_estimate_items`

Created by `0023`, expanded by `0024` and `0042`.

Current purpose:

- Estimate line snapshots.
- Invoice copy source.
- Customer public page line source.
- Legacy catalog/custom item storage.

Important fields:

- `id`
- `estimate_id`
- `pricing_catalog_item_id`
- `item_title`
- `quantity`
- `unit_price`
- `line_total`
- `notes`
- `technician_cost`
- `taxable`
- `warranty_text`
- `line_type`
- `internal_name`
- `customer_name`
- `public_description`
- `internal_cost`
- `sell_price`
- `service_catalog_repair_item_id`
- `estimate_template_line_id`
- `created_at`

### `service_request_invoices`

Created by `0028`.

Current purpose:

- Invoice snapshot created from one approved estimate.
- One invoice per estimate through unique `estimate_id`.
- Existing invoice status owner.

Important fields:

- `id`
- `service_request_id`
- `estimate_id`
- `created_by_profile_id`
- `invoice_number`
- `subtotal`
- `tax`
- `total`
- `invoice_status`
- `sent_at`
- `paid_at`
- `voided_at`
- `created_at`
- `updated_at`

### `service_request_invoice_items`

Created by `0028`.

Current purpose:

- Invoice line snapshots copied from approved estimate items.

Important fields:

- `id`
- `invoice_id`
- `source_estimate_item_id`
- `item_title`
- `quantity`
- `unit_price`
- `line_total`
- `notes`
- `created_at`

### `price_book_items`

Created by `0066`.

Current purpose:

- Future canonical company/system source for labor, part, service, fee, and bundle repair pricing.
- Should become the source catalog for future Repair Proposal Builder selections.
- Must not rewrite historical estimate or invoice snapshots.

Important fields:

- `id`
- `company_id`
- `item_type`
- `name`
- `normalized_name`
- `description`
- `appliance_group_id`
- `appliance_type`
- `brand`
- `default_quantity`
- `unit`
- `labor_price`
- `part_price`
- `total_price`
- `pricing_strategy`
- `taxable`
- `default_tax_behavior`
- `warranty_text`
- `estimated_duration_minutes`
- `customer_description`
- `internal_notes`
- `ai_keywords`
- `bundle_display_mode`
- `active`
- `review_status`
- `canonical_item_id`
- `usage_count`
- `last_used_at`
- `created_by_profile_id`
- `updated_by_profile_id`
- `created_at`
- `updated_at`

### `price_book_bundle_items`

Created by `0066`.

Current purpose:

- Internal bundle child composition.
- Must never become visible customer terminology.
- Future builder expands or collapses these into customer-facing Repair Solution lines.

Important fields:

- `bundle_item_id`
- `child_item_id`
- `sort_order`
- `default_quantity`
- `is_optional`
- `is_required`
- `bundled_price_override`
- `use_child_price`
- `hidden_internal`
- `customer_expanded_description`
- timestamps

### `estimate_learning_events`

Created by `0043` in some environments.

Important compatibility note:

- Real production previously did not have this table.
- Later migrations must not assume it exists unless they guard with `to_regclass('public.estimate_learning_events')`.
- Finance V1 must not depend on this table for proposal persistence.

## 2. Existing Constraints And Indexes

### Estimate constraints

Known existing constraints:

- `service_request_estimates.estimate_status` accepts `draft`, `sent`, `approved`, `declined`, `void`, plus legacy tolerated `presented` and `converted_to_invoice`.
- `subtotal`, `tax`, and `total` are constrained to safe non-negative ranges.
- `estimate_number` is not blank and is unique after `0024`/`0046`.
- `public_approval_token_hash` is nullable or a 64-character hex hash.
- `customer_preview_notes`, `warranty_text`, and `disclaimer_text` have length limits.

Known existing indexes:

- Estimate rows indexed by `service_request_id, created_at desc`.
- Created-by profile index where present.
- Unique estimate number index.
- Unique public approval token hash partial index where token hash is present.

### Estimate item constraints

Known existing constraints:

- `item_title` is not blank.
- `quantity` is positive and bounded.
- `unit_price` and `line_total` are non-negative and bounded.
- `notes` and `warranty_text` have length limits.
- `technician_cost` is non-negative and bounded when present.

Known existing indexes:

- Estimate items indexed by `estimate_id`.
- Estimate items indexed by legacy catalog item where present.

### Invoice constraints

Known existing constraints:

- `invoice_status` accepts `draft`, `sent`, `paid`, `void`.
- `invoice_number` is not blank and unique.
- `subtotal`, `tax`, and `total` are non-negative and bounded.
- `estimate_id` is unique, preserving one invoice per approved estimate.

Known existing indexes:

- Invoices indexed by `service_request_id, created_at desc`.
- Invoices indexed by status/date.
- Invoice items indexed by invoice and source estimate item.

### Price Book constraints

Known existing constraints from `0066`:

- `item_type` accepts `labor`, `part`, `service`, `fee`, `bundle`.
- `pricing_strategy` accepts `fixed_total`, `labor_plus_part`, `bundle_override`, `manual`.
- `review_status` accepts `pending`, `approved`, `rejected`, `merged`, `archived`.
- `estimated_duration_minutes` is nullable or positive, not zero.
- Prices and quantities are bounded.
- Bundle child rows prevent self-reference and enforce bounded child quantity/override values.

## 3. Existing RPC Contract Inventory

### Estimate create/update/archive

Current routes call:

- `create_service_request_estimate_rpc(p_request_id, p_catalog_items, p_custom_items)`
- `update_service_request_estimate_draft_rpc(p_estimate_id, p_catalog_items, p_custom_items)`
- `archive_service_request_estimate_draft_rpc(p_estimate_id)`
- fallback `void_service_request_estimate_draft_rpc(p_estimate_id)`

Current API payload shape:

- `catalogItems`: pricing catalog item id, quantity, notes.
- `customItems`: item title, customer/internal/public names, line type, quantity, unit price, unit cost, taxable, warranty text, notes.

Compatibility requirement:

- These RPCs must continue accepting the current shape until all callers are moved.
- Future proposal fields must be additive and optional.

### Estimate send/public approval

Current routes/RPCs:

- `send_service_request_estimate_to_customer_rpc(p_estimate_id)`
- `get_public_estimate_by_token_rpc(p_token)`
- `respond_to_public_estimate_rpc(p_token, p_response)`

Current behavior:

- Send is allowed only for draft estimate rows.
- Send stores token hash on the estimate row, sets status `sent`, sets `sent_at`, and updates job status to `estimate_sent`.
- Public lookup returns a customer-safe payload by token.
- Public response accepts `approved` or `declined`, updates the same estimate row, and updates job status to `estimate_approved` or `waiting_customer`.

Compatibility requirement:

- The token must continue to belong to the exact estimate/proposal version row.
- Legacy public links must continue to resolve.

### Invoice RPCs

Current routes/RPCs:

- `create_invoice_from_estimate_rpc(p_estimate_id)`
- `send_service_request_invoice_rpc(p_invoice_id)`
- `mark_service_request_invoice_paid_rpc(p_invoice_id)`
- `void_service_request_invoice_rpc(p_invoice_id)`

Current behavior:

- Invoice can be created only from approved estimates.
- Invoice snapshots estimate totals and copies estimate item lines.
- Unique estimate id prevents duplicate invoice creation.

Compatibility requirement:

- Future Repair Proposal approval must still produce an approved `service_request_estimates` row that can create an invoice.

### Learning RPC

Current best-effort route calls:

- `record_estimate_learning_event_rpc(...)`

Compatibility requirement:

- Must remain optional.
- Future Finance persistence cannot require this RPC/table.

## 4. Existing RLS And Grants Inventory

Existing table access model:

- `service_request_estimates` and `service_request_estimate_items` use service-request visibility through `can_view_service_request(service_request_id)`.
- Public estimate lookup/response is RPC-based by token; it does not expose direct public table reads.
- Invoice tables use service-request visibility.
- Price Book table reads are company-scoped plus system-default rows.
- Service-role grants exist in later migrations for server-side ingestion/settings paths.

V1 implication:

- Additive columns on existing estimate tables inherit existing table RLS.
- Public RPCs must filter output and not expose internal cost, margin, source metadata, hidden internal lines, or Price Book governance fields.
- No new public table grants are required for the V1 contract.

## 5. Legacy Compatibility Contracts

These contracts must not break:

- Existing draft estimates remain editable through the current API/RPC path.
- Existing sent estimates remain visible and approvable by token.
- Existing approved estimates can create invoices.
- Existing invoice rows remain linked to their source estimate.
- Existing Job Workspace estimate history remains readable.
- Existing public `/estimates/[token]` links remain valid.
- Existing status sync remains intact.
- Existing estimate rows without proposal/version metadata render through legacy fallback.
- Existing invoice conversion must not require Repair Solution grouping metadata.

## 6. Chosen V1 Architecture

### Chosen model

`service_request_estimates` is the V1 Repair Proposal version row.

One customer-sendable Repair Proposal version equals one internal estimate row. The row owns:

- estimate number;
- token hash;
- proposal snapshot;
- calculation snapshot;
- status;
- send/response timestamps;
- invoice source relationship.

`service_request_estimate_items` stores the financial line snapshots and future Repair Solution grouping metadata.

### Why this works

- Existing public approval flow already depends on a token per estimate.
- Existing invoice conversion already depends on an approved estimate id.
- Existing Job Workspace already reads estimates and items.
- Existing migration history already solved estimate-number generation, approval tokens, independent-technician access, and invoice snapshots.
- Adding a separate proposal-version table would duplicate ownership without solving a current V1 problem.

## 7. Rejected Alternatives And Reasons

### Rejected: create `repair_proposals`

Reason:

- Creates a second finance object next to `service_request_estimates`.
- Requires a second approval token engine or complicated delegation.
- Risks drift between proposal status and estimate status.
- Risks duplicate invoice conversion logic.

### Rejected: create `repair_proposal_versions`

Reason:

- V1 does not need partial approvals, alternative accepted groups, or multi-document rendering.
- Estimate rows can already serve as immutable sent versions.
- A version wrapper can be reconsidered later only if the product needs complex alternatives, multi-recipient document history, or separate customer-facing documents per same financial estimate.

### Rejected: store Repair Solutions only in JSON

Reason:

- JSON-only grouping makes invoice conversion, line mapping, search, analytics, and future Price Book learning harder.
- Estimate item rows are already the financial line source and should receive structured grouping columns.

### Rejected: expose Price Book bundles directly to customers

Reason:

- Bundle is internal company language.
- Customers should see Repair Solutions and included scope, not bundle child mechanics.

## 8. Exact Proposed Additive Schema Changes

No migration is created in this task. The next migration task should add only nullable/default-safe columns and indexes.

### `service_request_estimates`

Add proposal content snapshots:

```sql
proposal_title text null;
confirmed_problem_summary text null;
proposal_snapshot jsonb not null default '{}'::jsonb;
diagnosis_snapshot jsonb not null default '{}'::jsonb;
repair_scope_snapshot jsonb not null default '{}'::jsonb;
price_book_snapshot jsonb not null default '{}'::jsonb;
company_display_snapshot jsonb not null default '{}'::jsonb;
technician_display_snapshot jsonb not null default '{}'::jsonb;
```

Add version relationship fields:

```sql
proposal_version_number integer null;
source_estimate_id uuid null references public.service_request_estimates(id) on delete set null;
superseded_by_estimate_id uuid null references public.service_request_estimates(id) on delete set null;
superseded_at timestamptz null;
sent_snapshot_at timestamptz null;
viewed_at timestamptz null;
expires_at timestamptz null;
```

Add calculation snapshot fields:

```sql
discount_type text null;
discount_value numeric(10,2) not null default 0;
discount_amount numeric(10,2) not null default 0;
tax_rate numeric(7,4) null;
taxable_amount numeric(10,2) not null default 0;
non_taxable_amount numeric(10,2) not null default 0;
internal_cost_total numeric(10,2) null;
gross_profit numeric(10,2) null;
margin_percent numeric(7,4) null;
deposit_required_amount numeric(10,2) null;
```

### `service_request_estimate_items`

Add Repair Solution grouping fields:

```sql
repair_solution_key text null;
repair_solution_title text null;
repair_solution_description text null;
repair_solution_sort_order integer not null default 0;
repair_solution_type text not null default 'required';
repair_solution_is_recommended boolean not null default false;
customer_visible boolean not null default true;
included_in_customer_summary boolean not null default true;
```

Add Price Book source snapshot/reference fields:

```sql
source_price_book_item_id uuid null references public.price_book_items(id) on delete set null;
source_price_book_bundle_id uuid null references public.price_book_items(id) on delete set null;
source_price_book_bundle_child_id uuid null references public.price_book_items(id) on delete set null;
bundle_parent_line_key text null;
hidden_internal boolean not null default false;
source_metadata jsonb not null default '{}'::jsonb;
```

## 9. Exact Proposed Column Definitions

### Estimate proposal snapshot columns

- `proposal_title`: customer-facing title for the proposal version.
- `confirmed_problem_summary`: technician-confirmed problem/diagnosis summary. This must not be generated from complaint alone.
- `proposal_snapshot`: immutable customer-facing render payload at send time.
- `diagnosis_snapshot`: structured technician findings and confirmed diagnosis at the time of proposal creation.
- `repair_scope_snapshot`: structured Repair Solutions and included scope at the time of proposal creation.
- `price_book_snapshot`: source Price Book item ids, names, prices, and version-like metadata used to create the proposal.
- `company_display_snapshot`: company display name, logo, license text, warranty defaults, and branding values used in the sent proposal.
- `technician_display_snapshot`: technician/customer-contact display values used in the sent proposal.

### Estimate version columns

- `proposal_version_number`: nullable for legacy rows; future RPC sets a positive integer per service request.
- `source_estimate_id`: previous estimate/proposal row this version was copied from.
- `superseded_by_estimate_id`: later estimate/proposal row that replaced this version.
- `superseded_at`: timestamp when this version was superseded.
- `sent_snapshot_at`: timestamp when customer-facing immutable snapshot was locked.
- `viewed_at`: first public customer view timestamp, if implemented later.
- `expires_at`: optional future expiration timestamp.

### Estimate calculation columns

- `discount_type`: nullable, `flat`, or `percent`.
- `discount_value`: entered discount value.
- `discount_amount`: calculated currency discount amount.
- `tax_rate`: applied tax percent at time of calculation.
- `taxable_amount`: taxable subtotal after discount allocation.
- `non_taxable_amount`: non-taxable subtotal after discount allocation.
- `internal_cost_total`: internal cost snapshot for margin reporting.
- `gross_profit`: `total - internal_cost_total`, can be negative.
- `margin_percent`: snapshot percentage, can be negative.
- `deposit_required_amount`: future deposit request amount; nullable until deposits are implemented.

### Estimate item Repair Solution columns

- `repair_solution_key`: stable per-estimate grouping key such as `solution_1`.
- `repair_solution_title`: customer-facing Repair Solution title.
- `repair_solution_description`: customer-facing description for grouped scope.
- `repair_solution_sort_order`: display order.
- `repair_solution_type`: `required`, `recommended`, `optional`, or `alternative`; V1 should normally use `required` and `recommended`.
- `repair_solution_is_recommended`: true for recommended repair solution grouping.
- `customer_visible`: false for internal-only lines.
- `included_in_customer_summary`: controls whether the line contributes to customer included-scope summary.

### Estimate item Price Book columns

- `source_price_book_item_id`: selected Price Book item snapshot source.
- `source_price_book_bundle_id`: selected bundle parent source when line came from a bundle.
- `source_price_book_bundle_child_id`: selected bundle child source when line came from expanded bundle content.
- `bundle_parent_line_key`: local grouping key for expanded bundle children.
- `hidden_internal`: internal-only line not shown to customer and not copied as a customer invoice line.
- `source_metadata`: JSON object for non-authoritative source audit metadata.

## 10. Exact Proposed Foreign Keys

Future migration should add:

```sql
alter table public.service_request_estimates
  add constraint service_request_estimates_source_estimate_id_fkey
  foreign key (source_estimate_id)
  references public.service_request_estimates(id)
  on delete set null;

alter table public.service_request_estimates
  add constraint service_request_estimates_superseded_by_estimate_id_fkey
  foreign key (superseded_by_estimate_id)
  references public.service_request_estimates(id)
  on delete set null;

alter table public.service_request_estimate_items
  add constraint service_request_estimate_items_source_price_book_item_id_fkey
  foreign key (source_price_book_item_id)
  references public.price_book_items(id)
  on delete set null;

alter table public.service_request_estimate_items
  add constraint service_request_estimate_items_source_price_book_bundle_id_fkey
  foreign key (source_price_book_bundle_id)
  references public.price_book_items(id)
  on delete set null;

alter table public.service_request_estimate_items
  add constraint service_request_estimate_items_source_price_book_bundle_child_id_fkey
  foreign key (source_price_book_bundle_child_id)
  references public.price_book_items(id)
  on delete set null;
```

Migration dependency:

- The Price Book foreign keys require `public.price_book_items` from `0066`.
- If an environment has not applied `0066`, the future migration must either stop with a clear precondition or split Price Book foreign keys into a later migration.

## 11. Exact Proposed Indexes

Future migration should add:

```sql
create index if not exists service_request_estimates_request_proposal_version_idx
  on public.service_request_estimates (service_request_id, proposal_version_number desc)
  where proposal_version_number is not null;

create unique index if not exists service_request_estimates_request_proposal_version_unique_idx
  on public.service_request_estimates (service_request_id, proposal_version_number)
  where proposal_version_number is not null;

create index if not exists service_request_estimates_source_estimate_idx
  on public.service_request_estimates (source_estimate_id)
  where source_estimate_id is not null;

create index if not exists service_request_estimates_superseded_by_idx
  on public.service_request_estimates (superseded_by_estimate_id)
  where superseded_by_estimate_id is not null;

create index if not exists service_request_estimates_active_proposal_lookup_idx
  on public.service_request_estimates (service_request_id, estimate_status, sent_at desc)
  where archived_at is null and superseded_at is null;

create index if not exists service_request_estimate_items_solution_order_idx
  on public.service_request_estimate_items
  (estimate_id, repair_solution_sort_order, repair_solution_key, created_at);

create index if not exists service_request_estimate_items_source_price_book_item_idx
  on public.service_request_estimate_items (source_price_book_item_id)
  where source_price_book_item_id is not null;

create index if not exists service_request_estimate_items_source_bundle_idx
  on public.service_request_estimate_items (source_price_book_bundle_id)
  where source_price_book_bundle_id is not null;
```

## 12. Exact Proposed CHECK Constraint Changes

Do not replace existing status checks in V1.

Add constraints:

```sql
proposal_version_number is null or proposal_version_number > 0
source_estimate_id is null or source_estimate_id <> id
superseded_by_estimate_id is null or superseded_by_estimate_id <> id
discount_type is null or discount_type in ('flat', 'percent')
discount_value between 0 and 100000
discount_amount between 0 and 100000
tax_rate is null or tax_rate between 0 and 100
taxable_amount between 0 and 100000
non_taxable_amount between 0 and 100000
internal_cost_total is null or internal_cost_total between 0 and 100000
gross_profit is null or gross_profit between -100000 and 100000
margin_percent is null or margin_percent between -1000 and 100
deposit_required_amount is null or deposit_required_amount between 0 and 100000
proposal_title is null or length(btrim(proposal_title)) <= 240
confirmed_problem_summary is null or length(confirmed_problem_summary) <= 1200
jsonb_typeof(proposal_snapshot) = 'object'
jsonb_typeof(diagnosis_snapshot) = 'object'
jsonb_typeof(repair_scope_snapshot) = 'object'
jsonb_typeof(price_book_snapshot) = 'object'
jsonb_typeof(company_display_snapshot) = 'object'
jsonb_typeof(technician_display_snapshot) = 'object'
repair_solution_type in ('required', 'recommended', 'optional', 'alternative')
repair_solution_key is null or length(btrim(repair_solution_key)) <= 120
repair_solution_title is null or length(btrim(repair_solution_title)) <= 240
repair_solution_description is null or length(repair_solution_description) <= 2000
repair_solution_sort_order >= 0
bundle_parent_line_key is null or length(btrim(bundle_parent_line_key)) <= 120
jsonb_typeof(source_metadata) = 'object'
```

Status mapping remains:

- Draft Proposal -> `estimate_status = 'draft'`
- Sent Proposal -> `estimate_status = 'sent'`
- Approved Proposal -> `estimate_status = 'approved'`
- Declined Proposal -> `estimate_status = 'declined'`
- Canceled/Void Proposal -> `estimate_status = 'void'` or archived draft behavior
- Superseded Proposal -> `superseded_at` and `superseded_by_estimate_id`, not a new V1 status
- Converted to Invoice -> derived from `service_request_invoices.estimate_id`; legacy `converted_to_invoice` remains tolerated but should not be the new V1 source of truth

## 13. Exact Proposed RLS And Grant Implications

No new tables are required in V1.

Implications:

- Existing RLS on `service_request_estimates` and `service_request_estimate_items` continues to protect new columns.
- Existing dashboard/API access through service request visibility remains the main authorization boundary.
- Public RPCs must explicitly filter and shape returned JSON.
- Public customer payload must not expose:
  - `internal_cost`
  - `technician_cost`
  - `internal_cost_total`
  - `gross_profit`
  - `margin_percent`
  - `source_metadata`
  - `hidden_internal` lines
  - Price Book governance fields
  - internal bundle mechanics
- No anon table grants should be added.
- No RLS should be disabled.
- Existing service-role grants may need extension only if future server-side RPC/API writes new columns through direct table operations rather than RPC.

## 14. Proposed Migration Sequence

Future migration sequence:

1. Preflight check that `service_request_estimates` and `service_request_estimate_items` exist.
2. Confirm whether `price_book_items` exists.
3. Add nullable/default-safe proposal snapshot and version columns to `service_request_estimates`.
4. Add calculation snapshot columns to `service_request_estimates`.
5. Add Repair Solution grouping columns to `service_request_estimate_items`.
6. Add Price Book source columns to `service_request_estimate_items`.
7. Add self-referential estimate foreign keys.
8. Add Price Book foreign keys only if `0066` is guaranteed applied; otherwise split them into a dependent migration.
9. Add checks.
10. Add indexes.
11. Add comments documenting internal Estimate versus customer Proposal terminology.
12. Do not update RPCs in the schema migration unless explicitly scoped in a later task.

## 15. Backfill Requirements

Required:

- Backfill JSON snapshot columns to `{}` through defaults only.
- Backfill new boolean columns through defaults only.
- Backfill numeric calculation columns through defaults only where `not null default 0` is used.

Not required:

- Do not assign proposal version numbers to legacy rows in the schema migration.
- Do not rewrite legacy totals.
- Do not infer Repair Solutions from old line items.
- Do not create proposal snapshots for old sent estimates by guessing.

Legacy rendering rule:

- If `proposal_snapshot = '{}'::jsonb` or missing customer-facing fields, public/customer UI must use the existing legacy estimate payload.

## 16. RPC Changes Required Later

Later implementation task must update:

- `create_service_request_estimate_rpc`
- `update_service_request_estimate_draft_rpc`
- `send_service_request_estimate_to_customer_rpc`
- `get_public_estimate_by_token_rpc`
- `respond_to_public_estimate_rpc`
- `create_invoice_from_estimate_rpc`
- archive/void draft RPCs if proposal-version cancellation semantics are added

Required later behavior:

- Draft creation accepts Repair Solution groups and Price Book-selected items.
- Draft update remains allowed only for draft rows.
- Sending locks `proposal_snapshot` and `sent_snapshot_at`.
- Sending a new version can supersede a prior sent/draft version without destroying history.
- Public lookup returns proposal snapshot when present and legacy estimate payload otherwise.
- Public response rejects superseded, void, archived, expired, or non-sent rows.
- Invoice creation continues to use an approved estimate id and must exclude or safely handle `hidden_internal`/`customer_visible = false` lines.

## 17. TypeScript Contract Changes Required Later

Later implementation task must update:

- `frontend/src/lib/supabase/types.ts`
- `frontend/src/lib/service-request-records.ts`
- `SERVICE_REQUEST_ESTIMATE_SELECT_COLUMNS`
- `DashboardServiceRequestEstimate`
- `DashboardServiceRequestEstimateItem`
- public estimate payload types
- estimate create/update API payload validators
- Repair Proposal Builder component contracts
- Price Book selection-to-estimate mapping types

Required later behavior:

- New fields are optional in TypeScript because legacy rows will not have meaningful values.
- Public types must separate customer-safe proposal fields from internal calculation/source fields.
- UI must treat Estimate as internal language and Repair Proposal as customer/technician language where appropriate.

## 18. API Compatibility Notes

Keep current routes working:

- `POST /api/service-requests/[id]/estimates`
- `PATCH /api/service-requests/[id]/estimates`
- `DELETE /api/service-requests/[id]/estimates`
- `POST /api/estimates/[id]/send`
- `POST /api/estimates/[token]/respond`
- `POST /api/estimates/[id]/invoice`
- `PATCH /api/invoices/[id]`

Future proposal routes may be added as wrappers, but they must use the same underlying `service_request_estimates` row until a separate architecture decision replaces it.

Do not create a second financial persistence engine.

## 19. Rollback Strategy

Because future changes are additive:

- Existing legacy estimate and invoice reads can ignore new columns.
- Existing public token links keep using current token hash and status fields.
- If Proposal Builder UI fails, fallback to legacy Estimate UI remains possible.
- If Price Book source mapping fails, custom estimate lines still work.
- If versioning fails, new proposal rows can still be treated as normal estimates.

Database rollback preference:

- Avoid destructive column drops in production.
- Disable new code paths first.
- Stop populating new columns.
- Keep old rows readable.

## 20. Acceptance Criteria For Future Migration Task

The future migration is acceptable only if:

- It is additive and forward-only.
- It does not create `repair_proposal_versions`.
- It does not create a second estimate engine.
- It does not change existing approval-token ownership.
- It does not break legacy public estimate links.
- It does not break invoice creation from approved estimates.
- It does not require `estimate_learning_events`.
- It handles environments without Price Book dependency either by explicit dependency on `0066` or by splitting Price Book foreign keys.
- It leaves historical totals unchanged.
- It includes checks and indexes listed in this plan or documents a specific reason for deviation.

## 21. Risks

- Existing client-side estimate preview has discount/tax math that is richer than stored estimate totals. The migration can store snapshots, but the shared calculation engine must later become authoritative.
- Existing invoice copy logic copies all estimate item rows. It must be audited before hidden internal Price Book lines are introduced.
- Public proposal snapshot rendering must not leak internal costs or source metadata.
- Adding Price Book foreign keys requires sequencing after `0066`.
- Superseded public tokens must be blocked in RPC logic, not only in UI.
- Legacy rows will not have Repair Solution grouping, so UI must have a clean fallback.

## 22. Blocking Unresolved Questions

No product-blocking questions remain for the V1 data contract.

Implementation tasks must still decide:

- Whether the first additive migration depends strictly on `0066` or splits Price Book foreign keys into a follow-up migration.
- Whether deposits should stay nullable columns on estimates until Task Deposits or be delayed entirely.
- Whether `viewed_at` is populated from public proposal page load in V1 or reserved for later finance timeline work.

## Final Task 168.1 Conclusion

The correct V1 path is to evolve the existing estimate/invoice engine instead of creating a parallel Proposal engine.

`service_request_estimates` can safely serve as the Repair Proposal version entity with additive snapshot/version/calculation fields. `service_request_estimate_items` can safely serve as the Repair Solution line snapshot table with additive grouping and Price Book source fields.

This preserves Workiz Exit momentum while aligning Finance with the WRA product philosophy: Repair Solutions first, customer-facing Repair Proposals, internal Estimates as durable financial records, and no duplicate finance engine.
