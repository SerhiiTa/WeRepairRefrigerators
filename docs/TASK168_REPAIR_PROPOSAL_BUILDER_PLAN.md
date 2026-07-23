# Task 168 - Repair Proposal Builder Plan

Task 168 is a design-only task. It does not implement production code, UI, API routes, migrations, or schema changes.

This plan follows `docs/FINANCE_SYSTEM_MASTER_PLAN.md`: WRA Finance is built around technician-confirmed Repair Solutions and customer-facing Repair Proposals. Estimate remains an internal financial entity.

## Documents Studied

- `docs/CODEX_OPERATING_RULES.md`
- `docs/WRA_PRODUCT_PRINCIPLES.md`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/DEVELOPER_HANDOFF.md`
- `docs/FINANCE_WORKIZ_EXIT_ROADMAP.md`
- `docs/FINANCE_SYSTEM_MASTER_PLAN.md`
- `docs/ESTIMATE_INVOICE_PAYMENT_AUDIT.md`
- Task 168 request / previous completion report context

## Files And Flows Audited

### Job Workspace / Finance UI

- `frontend/src/components/dashboard/ServiceRequestDetail.tsx`
- `frontend/src/lib/service-request-records.ts`
- `frontend/src/lib/supabase/types.ts`

### Estimate / Proposal-Like APIs

- `frontend/src/app/api/service-requests/[id]/estimates/route.ts`
- `frontend/src/app/api/estimates/[id]/send/route.ts`
- `frontend/src/app/api/estimates/[id]/respond/route.ts`
- `frontend/src/app/estimates/[token]/page.tsx`
- `frontend/src/components/public/PublicEstimateApproval.tsx`

### Invoice APIs

- `frontend/src/app/api/estimates/[id]/invoice/route.ts`
- `frontend/src/app/api/invoices/[id]/route.ts`

### AI / Repair Intelligence / Price Book

- `frontend/src/app/api/estimate-agent/draft/route.ts`
- `frontend/src/lib/estimate-draft-agent.ts`
- `frontend/src/app/api/price-book/repair-solutions/route.ts`
- `frontend/src/server/price-book/selection.ts`
- `frontend/src/app/api/settings/price-book/route.ts`
- `frontend/src/components/dashboard/PriceBookSettings.tsx`

### Migrations / Database Contracts

- `supabase/migrations/0023_pricing_catalog_and_estimates_foundation_apply_ready.sql`
- `supabase/migrations/0024_estimate_ux_v2_fields_apply_ready.sql`
- `supabase/migrations/0025_estimate_lifecycle_rpc_apply_ready.sql`
- `supabase/migrations/0026_estimate_customer_approval_flow_apply_ready.sql`
- `supabase/migrations/0027_estimate_token_generation_fix_apply_ready.sql`
- `supabase/migrations/0028_invoice_foundation_apply_ready.sql`
- `supabase/migrations/0034_job_status_lifecycle_and_estimate_transitions_apply_ready.sql`
- `supabase/migrations/0042_professional_estimate_service_catalog_foundation_apply_ready.sql`
- `supabase/migrations/0043_estimate_agent_intelligence_foundation_apply_ready.sql`
- `supabase/migrations/0044_repair_intelligence_estimate_persistence_company_scope_fix_apply_ready.sql`
- `supabase/migrations/0045_repair_intelligence_independent_technician_estimate_compat_apply_ready.sql`
- `supabase/migrations/0046_repair_intelligence_estimate_number_rpc_fix_apply_ready.sql`
- `supabase/migrations/0066_price_book_foundation_apply_ready.sql`

## 1. Current State Audit

### Existing Finance Tab In Job Workspace

Current state:

- Job Workspace has a Finance tab internally keyed as `estimate`.
- The tab is still titled and structured around `Estimate`.
- It contains one large builder surface, saved estimate cards, estimate history, invoice cards, invoice history, and manual invoice actions.
- The builder starts from a free-form `Diagnosis` textarea and a `Generate Estimate` action.
- It can add manual quick lines: labor, part, material, custom.
- It has compact line rows, expandable line details, warranty editor, collapsed tax/discount controls, preview total, Save/Send, active draft warning, and saved estimate history.

Decision:

- Adapt, do not delete.
- Rename the future user-facing mental model to Repair Proposal Builder.
- Keep the tab as the Job Workspace Finance entry point, but the default surface should become Proposal-oriented, not line-editor-oriented.
- Keep legacy estimate cards for compatibility and history.

Conflict with new architecture:

- The current UI asks for `Diagnosis` and can generate estimate lines directly. That risks mixing complaint, diagnosis, repair planning, AI estimate writing, and approval into one flow.
- The current primary customer-facing object is still an Estimate, not a Repair Proposal.
- The current UI can become long and spreadsheet-like despite recent compacting.

### Existing Estimate Builder And Editing UI

Current state:

- Draft estimates can be created through `POST /api/service-requests/[id]/estimates`.
- Draft estimates can be updated through `PATCH /api/service-requests/[id]/estimates`.
- Draft estimates can be archived/voided through `DELETE /api/service-requests/[id]/estimates`.
- Existing drafts can be edited; sent/approved/declined/void estimates are read-only.
- Duplicate draft prevention exists in UI: active draft prompts edit existing or create another draft intentionally.

Decision:

- Preserve this as the internal Estimate persistence/editing contract.
- Adapt the builder to create Proposal versions backed by internal Estimate rows.
- Do not create a second estimate engine.

Legacy contract:

- Existing draft update RPCs and draft rows must continue to work.
- Existing sent/approved/declined/void rows must remain readable.

### Estimate Components

Current state:

- Estimate logic is mostly embedded in `ServiceRequestDetail.tsx`.
- Public customer experience is `PublicEstimateApproval`.
- Mapping, formatting, and select columns live in `service-request-records.ts`.
- There is no dedicated Repair Proposal component family yet.

Decision:

- Future implementation should extract Proposal-specific UI into smaller components, but this task does not implement that.
- Keep mapping functions backward compatible.

Conflict:

- `ServiceRequestDetail.tsx` is overloaded and should not absorb an entire new Finance OS without component boundaries.

### Estimate API Routes

Current state:

- `POST /api/service-requests/[id]/estimates`: creates internal estimate from catalog/custom items.
- `PATCH /api/service-requests/[id]/estimates`: updates an existing draft estimate.
- `DELETE /api/service-requests/[id]/estimates`: archives draft if available, falls back to void draft.
- `POST /api/estimates/[id]/send`: sends draft estimate through RPC, returns public approval URL.
- `POST /api/estimates/[token]/respond`: public approve/decline using token.
- `POST /api/estimates/[id]/invoice`: creates invoice from approved estimate.
- `PATCH /api/invoices/[id]`: send/paid/void invoice.

Decision:

- Preserve existing API routes as legacy/internal estimate endpoints.
- Introduce future Proposal endpoints as wrappers/adapters around the same underlying estimate tables or version tables.
- Do not break public token approval.

### Estimate Database Tables

Current state:

- `pricing_catalog_items` is the old catalog.
- `service_request_estimates` stores internal estimates.
- `service_request_estimate_items` stores estimate lines.
- `service_request_invoices` stores invoices copied from approved estimates.
- `service_request_invoice_items` stores invoice line snapshots.
- `estimate_learning_events` may exist in some environments; migrations guard or adapt around it.

Important `service_request_estimates` fields:

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
- `archive_reason`

Important `service_request_estimate_items` fields:

- `estimate_id`
- `pricing_catalog_item_id`
- `item_title`
- `quantity`
- `unit_price`
- `line_total`
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
- `notes`

Decision:

- Evolve these tables where possible.
- Prefer using `service_request_estimates` as the internal financial entity under a Repair Proposal version.
- Add proposal/version metadata in future migrations only if existing columns are not enough.

Conflict:

- Existing rows have no explicit Repair Solution grouping.
- Existing rows have no Proposal version entity.
- Existing rows cannot represent alternatives/optional solutions cleanly.
- Existing totals do not reliably persist frontend tax/discount math.

### Estimate Items And Labor/Parts Model

Current state:

- Line types: `labor`, `part`, `material`, `custom`, `warranty`.
- Items can come from old `pricing_catalog_items` or custom lines.
- Price Book 0066 introduces a newer company configuration model with `price_book_items`, `price_book_bundle_items`, aliases, review status, appliance groups, and bundle internals.

Decision:

- Keep old estimate items for legacy and invoice conversion.
- Future Proposal Builder should map Repair Solutions and Price Book items into estimate item snapshots.
- Do not expose internal bundle rows as customer line items.

Conflict:

- Current customer page shows line items directly as `Estimate lines`.
- Current model treats line items as the primary surface, not supporting Repair Solution as the primary object.

### Estimate Statuses

Current estimate statuses:

- `draft`
- `sent`
- `approved`
- `declined`
- `void`
- legacy/future tolerated: `presented`, `converted_to_invoice`
- archive fields exist for draft archival.

Current job sync statuses:

- Send estimate moves job to `estimate_sent`.
- Customer approve moves job to `estimate_approved`.
- Customer decline moves job to `waiting_customer`.

Decision:

- Preserve existing statuses for compatibility.
- Repair Proposal lifecycle can map onto existing statuses for V1:
  - Proposal Draft -> estimate `draft`
  - Sent -> estimate `sent`
  - Approved -> estimate `approved`
  - Declined -> estimate `declined`
  - Canceled/Voided -> estimate `void` or archived draft
  - Converted to invoice -> invoice link exists; avoid relying on `converted_to_invoice` unless explicitly implemented later.

Conflict:

- There is no `viewed`, `customer_question`, `expired`, or `superseded`.
- Current approval link does not version-lock around a separate Proposal Version.

### Approval Token Logic

Current state:

- Sending generates a raw 64-character token.
- Only SHA-256 hash is stored in `service_request_estimates.public_approval_token_hash`.
- Public page calls `get_public_estimate_by_token_rpc`.
- Public response calls `respond_to_public_estimate_rpc`.
- Public output excludes internal cost, profile IDs, company IDs, customer email/phone, and private notes.

Decision:

- Preserve token behavior and security model.
- Future Proposal Version should own or reference token hash in a way that old `/estimates/[token]` continues to work.

Legacy contract:

- Existing `/estimates/[token]` links must not break.

### Customer Estimate Approval Page

Current state:

- Customer sees `Estimate Review`.
- Shows service summary, issue description, estimate line rows, subtotal/tax/total, warranty/disclaimer, approve/decline.
- UI updates local state immediately after approval/decline and calls `router.refresh()`.
- No request-clarification action.
- No Proposal language or Repair Solution grouping.
- No invoice/payment/deposit CTA after approval.

Decision:

- Preserve as legacy public estimate page.
- Future customer-facing experience should become Customer Repair Proposal.
- Existing old links can render legacy UI or a compatibility view.

Conflict:

- Customer sees itemized estimate lines as primary.
- Customer does not see a polished Repair Proposal with included repair solution, optional/alternative solutions, or clarification workflow.

### Job Status Synchronization

Current state:

- Estimate send inserts service request notes and changes job to `estimate_sent`.
- Estimate approval changes job to `estimate_approved`.
- Estimate decline changes job to `waiting_customer`.
- Notes are used as timeline events.

Decision:

- Preserve existing status side effects.
- Future Proposal lifecycle should reuse status transitions but make them explicit in the Proposal send/approve transaction.

Risk:

- Manual job status changes can create mismatch with estimate status. Existing UI already shows status mismatch warnings.

### Timeline Events

Current state:

- Estimate/invoice events are written into `service_request_notes` with note types `estimate` and `status_change`.
- Communications timeline has event categories for estimate/invoice but is not the authoritative finance timeline.
- `estimate_learning_events` records AI/decision context when table/RPC exists.

Decision:

- Preserve `service_request_notes` timeline for compatibility.
- Future Proposal Builder should write business timeline events through the existing note/timeline mechanism first.
- A dedicated Finance Timeline can come later.

### Tax, Discount, Warranty, Total Calculations

Current state:

- UI computes:
  - line subtotal
  - flat or percent discount
  - taxable subtotal after proportional discount
  - tax at UI-entered rate, default `8.25%`
  - grand total
- UI payload includes `estimateDecisionContext.calculationPreview`.
- API/RPC currently persists estimate line totals and subtotal/tax/total from server-side line math; current payload indicates `persistedEstimateTotalsCurrentlyUseLineSubtotalOnly: true`.
- Warranty exists as estimate-level `warranty_text` and line-level `warranty_text`.
- Discount fields are not first-class persisted fields.
- Tax configuration is not company-owned yet.

Decision:

- Future authoritative calculations must move server-side.
- Frontend should only preview totals using shared rules.
- Company tax/discount/deposit settings are future Finance Settings, not Task 168 implementation.

Conflict:

- Customer could see totals that do not match the UI preview if discount/tax was not persisted authoritatively.
- This must be fixed before production Repair Proposal sending.

### Invoice Creation Dependencies

Current state:

- Invoice can be created only from an approved estimate.
- `service_request_invoices.estimate_id` has unique index: one invoice per estimate.
- Invoice rows snapshot subtotal/tax/total and line items from estimate items.
- Invoice lifecycle: `draft`, `sent`, `paid`, `void`.
- No real customer invoice page.
- No payment provider implementation.
- No deposit model.

Decision:

- Preserve invoice dependency on approved internal estimate/version.
- Future Proposal approval should produce an approved internal estimate version that invoice conversion can snapshot.

Legacy contract:

- Existing approved estimates must remain invoice-capable.

### Existing AI Estimate Functionality

Current state:

- `/api/estimate-agent/draft` calls OpenAI server-side when key exists, otherwise local fallback.
- Current prompt follows Technician Authority: AI formats estimates, does not diagnose or invent repair scope.
- It returns `repair_plan`, `estimate_lines`, `customer_summary`, `warranty_text`, `pricing_warnings`, `confidence`, and `source`.
- UI shows compact Repair Plan Summary / Estimate Draft review and inserts generated lines into builder.
- Local deterministic fallback remains.

Decision:

- Preserve server-side-only AI boundary.
- Future AI Repair Proposal Agent should build on this guardrail but should work from confirmed Repair Solutions and Price Book IDs, not free-form complaint alone.

Conflict:

- Existing endpoint is still named estimate-agent and returns estimate lines. It should become a controlled Proposal-draft helper later, not the authority for repair scope.

### Existing Price Book Code / Schema

Current state:

- `0066_price_book_foundation_apply_ready.sql` defines:
  - `price_book_appliance_groups`
  - `price_book_appliance_group_types`
  - `price_book_items`
  - `price_book_item_aliases`
  - `price_book_bundle_items`
  - `price_book_item_merge_history`
- Price Book item types: `labor`, `part`, `service`, `fee`, `bundle`.
- Review statuses: `pending`, `approved`, `rejected`, `merged`, `archived`.
- Bundle display modes: `expanded`, `collapsed`, `technician_choice`.
- `POST /api/price-book/repair-solutions` returns ranked, rule-based repair solution suggestions and `aiUsed: false`.
- Selection ranks by appliance type/group, brand, symptoms/diagnosis tokens, aliases, keywords, company approval, and general fallback.
- System/default rows can be overridden by company-owned rows.

Decision:

- Future Proposal Builder should use Price Book selection as the suggestion/source contract.
- Price Book remains settings/configuration; it must not become customer UI.

Conflict:

- Current estimate persistence still references old `pricing_catalog_items`, not new `price_book_items`.

### Existing Migrations Related To Estimates, Approvals, Invoices

Current state:

- 0023: estimate/catalog foundation.
- 0024: estimate UX fields, customer price, technician cost, warranty/disclaimer.
- 0025: draft update/void lifecycle.
- 0026: public token approval.
- 0027: token generation/hash fix.
- 0028: invoice foundation.
- 0034: job status transitions for estimate send/response.
- 0042: professional service catalog / expanded estimate item fields / draft update.
- 0043: estimate learning events and archive draft.
- 0044/0045/0046: Repair Intelligence persistence, independent technician compatibility, estimate number RPC fix.
- 0066: Price Book foundation.

Decision:

- Do not remove or rewrite old migrations.
- Future migrations must be forward-only and adapt existing tables.

### Mobile Behavior 375px / 390px / 430px

Current state:

- Recent Job Workspace Details work is mobile-first and compact.
- Finance tab remains larger and less polished than Details.
- Current Finance UI contains nested cards, large estimate generation block, line list, adjustment panels, saved estimates, and invoices.
- Public estimate page is mobile-capable but visually old and estimate-line-centric.

Decision:

- Repair Proposal Builder must be designed mobile-first before implementation.
- Builder should avoid long permanent sections and use bottom sheets/full-screen editors.

## 2. Product Definition

### Repair Proposal Builder

Repair Proposal Builder is the technician-facing workflow inside Job Workspace Finance.

It helps the technician turn confirmed diagnosis and repair scope into a customer-ready Repair Proposal while maintaining an internal Estimate snapshot for calculations, audit, approval, and invoice conversion.

It is not an accounting table. It is not Price Book management. It is not autonomous diagnosis.

### Repair Proposal

Repair Proposal is the customer-facing offer.

It explains:

- confirmed problem;
- proposed Repair Solution;
- what is included;
- price;
- warranty;
- approval/decline/clarification actions.

### Repair Solution

Repair Solution is the technician-confirmed repair outcome.

It may contain labor, parts, materials, services, fees, warranty, internal cost, customer price, and optional bundle composition, but the solution itself is the primary object.

### Internal Estimate

Internal Estimate is the persisted financial calculation entity under a Repair Proposal.

It stores:

- line item snapshots;
- subtotal/tax/discount/total;
- estimate status;
- token;
- approval status;
- invoice conversion link;
- audit-friendly version reference.

### Internal Bundle

Internal Bundle is a Price Book composition of child items used to build a Repair Solution. It is never shown to customers as a bundle.

### Relationships

- Job owns the Finance workflow.
- Customer receives Proposal and approval link.
- Appliance/problem/diagnosis provide context.
- Repair Scope determines what can be proposed.
- Price Book provides approved company repair knowledge.
- Invoice snapshots the approved internal Estimate version.

## 3. User Roles And Authority

### Technician

- Confirms diagnosis.
- Confirms repair scope.
- Selects/creates Repair Solutions.
- Reviews AI suggestions.
- Adjusts labor/parts/materials/services.
- Can send Proposal when company policy allows.
- Remains source of truth.

### Dispatcher

- Can prepare Proposal shell from existing job/customer data.
- Can select known Price Book items only when technician-confirmed scope exists or company policy allows.
- Should not diagnose.
- May send Proposal if company policy allows.

### Company Owner

- Controls Price Book.
- Controls pricing policy.
- Can change prices within permissions.
- Can define warranty, tax, discount, deposit, branding, and template defaults in future Finance Settings.
- Can override or approve unusual Proposal decisions.

### AI

May:

- suggest matching Price Book entries;
- structure confirmed scope;
- warn about missing information;
- improve customer-facing language;
- explain recommendations to technician;
- calculate recommended preview using company rules when available.

Must not:

- approve diagnosis;
- silently add or remove scope;
- silently change price;
- send Proposal;
- hide internal warnings;
- treat complaint as diagnosis.

### Customer

Sees:

- Repair Proposal;
- repair explanation;
- included work;
- total;
- warranty;
- approval/decline/clarification actions.

Does not see:

- internal bundle structure;
- internal cost;
- margin;
- vendor cost;
- Price Book metadata;
- AI confidence;
- internal technician/dispatcher notes.

## 4. Domain Model

### Diagnosis

- Purpose: technician-confirmed finding.
- Key fields: text, author profile, confirmed_at, confidence/source, optional photos/notes.
- Source of truth: technician.
- Linked to: Job, Appliance, Customer indirectly.
- Facing: internal.
- Editable: draft/editable until Proposal sent; changes after sent require new Proposal version.
- Audit: keep before/after through notes/version metadata.

### Repair Scope

- Purpose: explicit set of work the technician confirms.
- Key fields: operations, required parts, services, exclusions, safety notes.
- Source of truth: technician.
- Facing: internal, summarized to customer.
- Editable: yes before send; after send requires new version.
- Audit: required when used to create Proposal.

### Repair Solution

- Purpose: business-level repair outcome.
- Key fields: title, customer description, solution_type, recommended flag, optional/alternative flag, included items, warranty, price, internal cost.
- Source of truth: technician-confirmed scope plus Price Book/manual entries.
- Linked to: Job, Customer, Appliance, Internal Estimate.
- Facing: customer-facing summary plus internal detail.
- Editable: draft; versioned after send.
- Audit: must snapshot on send.

### Repair Proposal

- Purpose: customer-facing offer.
- Key fields: proposal_number or display label, status, current_version_id, customer summary, customer token, expiration, approval state.
- Source of truth: system generated from technician-confirmed Repair Solutions.
- Linked to: Job, Customer, Appliance, Internal Estimate.
- Facing: customer-facing.
- Editable: current draft only.
- Audit: all sent versions immutable.

### Repair Proposal Version

- Purpose: immutable sent/reviewable snapshot.
- Key fields: version_number, status, sent_at, viewed_at, responded_at, superseded_at, token_hash, rendered_payload, total snapshot.
- Source of truth: server transaction at send.
- Facing: customer-facing rendered data.
- Editable: immutable after sent.
- Audit: required.

### Internal Estimate

- Purpose: calculation and persistence engine.
- Key fields: subtotal, tax, discount, total, status, estimate_number, token_hash, line snapshots, proposal metadata.
- Source of truth: server calculations.
- Facing: internal.
- Editable: draft only.
- Versioning: either one estimate row per Proposal version or one estimate row with linked version table.
- Audit: required for invoice conversion.

### Internal Estimate Version

- Purpose: if added, snapshot internal calculation rules and lines.
- Minimal preference: use `service_request_estimates` row as the versioned estimate for V1, with new metadata columns linking to proposal/version.
- Avoid duplicating full estimate version tables unless needed.

### Internal Bundle

- Purpose: Price Book composition.
- Key fields: bundle item id, child item ids, optional/required, hidden_internal, price overrides, display mode.
- Source of truth: Price Book.
- Facing: internal.
- Editable: in Price Book Settings, not in customer Proposal.
- Audit: estimate/proposal must snapshot resolved child items at send.

### Proposal Item

- Purpose: customer-visible item under a Repair Solution.
- Key fields: title, description, quantity, customer price, included flag, optional flag, alternative group, sort order.
- Source of truth: Repair Solution/Price Book/manual input.
- Facing: customer-facing.
- Editable: draft only.
- Audit: snapshot at send.

### Price Book Entry

- Purpose: reusable company repair knowledge.
- Source of truth: company settings.
- Facing: internal.
- Editable: Settings.
- Versioning: historical estimates/proposals snapshot values; Price Book edits do not rewrite history.

### Customer Approval

- Purpose: customer response to a specific Proposal version.
- Key fields: response, responded_at, token/version, ip/user-agent if later approved, notes.
- Source of truth: customer token action or authorized staff verbal approval later.
- Facing: customer and internal summary.
- Editable: immutable; corrections require audit entry.

### Discount

- Purpose: reduce customer total under company policy.
- Key fields: type, value, amount, reason, approved_by.
- Source of truth: company policy plus authorized user.
- Facing: customer only as final discount, not internal policy.
- Editable: draft; snapshot on send.

### Tax

- Purpose: apply company/location tax configuration.
- Key fields: rate, taxable amount, tax amount, jurisdiction/source.
- Source of truth: company tax settings in future.
- Facing: customer total.
- Editable: only as policy override with permission.

### Warranty

- Purpose: customer promise for labor/parts.
- Key fields: text, labor days, parts days, exclusions, source.
- Source of truth: company defaults plus technician override.
- Facing: customer-facing.
- Editable: draft; snapshot on send.

### Deposit

- Purpose: future prepayment.
- Key fields: required flag, amount/percent, paid status, payment link.
- Source of truth: company deposit policy plus Proposal.
- Facing: customer.
- Task 168 design only; implementation later.

### Invoice Link

- Purpose: connect approved Proposal/Estimate version to invoice.
- Key fields: invoice_id, estimate_id, proposal_version_id.
- Source of truth: invoice creation transaction.
- Facing: internal; customer sees invoice later.

### Two Entities Or One Financial Entity

Recommended V1 architecture:

- Do not create a fully parallel `repair_proposals` financial engine.
- Use existing `service_request_estimates` as the internal Estimate/versioned financial document.
- Add minimal future proposal metadata and/or a `repair_proposal_versions` table only to store customer-facing rendered snapshot, version status, and Proposal language that existing estimate rows cannot represent.
- The Repair Proposal is a product layer over the internal Estimate, not a competing database system.

## 5. Repair Solution Model

One Repair Solution is one technician-confirmed repair outcome.

Examples:

- Replace evaporator fan motor.
- Replace defrost heater and manually defrost evaporator.
- Repair LG sealed system with compressor replacement.

A Proposal can contain multiple Repair Solutions when the job truly has multiple confirmed repairs.

Solutions can be:

- required;
- optional;
- alternative;
- recommended.

V1 recommendation:

- Support multiple required solutions.
- Support one recommended solution.
- Defer true partial approval and complex alternative selection unless a clear customer workflow is implemented.

How parts/labor/materials relate:

- They are internal components under a Repair Solution.
- They may be shown as "Included" when useful.
- They should not become the customer’s primary decision object.

Bundle transformation:

- Internal Bundle expands into internal estimate item snapshots.
- Customer sees a solution title and included-work description.
- Hidden internal items stay hidden.

Customer chooses:

- approve whole Proposal;
- decline;
- request clarification.

Customer never sees:

- bundle structure;
- internal child rows;
- internal cost/margin;
- Price Book metadata.

## 6. Repair Proposal Lifecycle

Recommended V1 states:

- Draft
- Ready for Review
- Sent
- Viewed
- Customer Question
- Approved
- Declined
- Expired
- Superseded
- Converted to Invoice
- Canceled

V1 implementation should start with the minimal subset:

- Draft
- Sent
- Approved
- Declined
- Superseded
- Canceled/Void
- Converted to Invoice as derived state from invoice link

### Draft

- Set by: technician/dispatcher/system.
- Created by: creating or editing Repair Solution.
- Editable: yes.
- Job status: unchanged unless company policy changes it.
- Timeline: optional draft-created event.

### Ready For Review

- Set by: validation passes but not sent.
- Editable: yes.
- V1 can implement as UI state, not database status.

### Sent

- Set by: explicit human Send action.
- Editable: no; edits require new version.
- Job status: `estimate_sent`.
- Timeline: Proposal sent / status changed.
- Notification: future SMS/email; current system returns approval link.

### Viewed

- Set by: customer page open.
- V1 can defer database implementation if not needed.
- Must not block approval.

### Customer Question

- Set by: customer clarification request.
- V1 may defer until messaging/communication is ready.
- Job status: likely `waiting_customer`.

### Approved

- Set by: customer approval or future verbal approval action.
- Editable: no.
- Job status: `estimate_approved`.
- Invoice: eligible for invoice creation.
- Timeline: approval event.

### Declined

- Set by: customer decline.
- Editable: no.
- Job status: `waiting_customer`.
- New Proposal version may be created.

### Expired

- Set by: system or manual action after expiration.
- V1 can defer if no expiration policy exists.

### Superseded

- Set by: sending a new version after a prior sent version.
- Old token should render "This proposal was replaced" and link to current version only if safe.

### Converted To Invoice

- Derived from invoice existence.
- Avoid adding duplicate status unless needed.

### Canceled

- Set by: authorized dashboard user.
- Use when draft/sent Proposal should no longer be active.

### Internal Approved

Do not add `Internal Approved` in V1. It duplicates Ready for Review and creates confusion. Use draft validation plus explicit Send.

### Partial Approval

Do not include Partial Approval in V1. It requires a more complex customer selection model, invoice split behavior, and optional/alternative state handling. Allow optional/alternative display later only with explicit product justification.

## 7. Repair Proposal Builder UX

Location: Job Workspace -> Finance.

Mobile-first principle: no giant tables, no spreadsheet layout, no CRM inside Finance.

### Empty State

Visible immediately:

- Confirmed diagnosis status.
- "Create Repair Proposal" primary action.
- If no confirmed diagnosis exists, show "Add or confirm diagnosis first."

Collapsed:

- Existing legacy estimates/history.
- Invoice history.

Primary action:

- Confirm scope / Create Proposal.

### Confirmed Diagnosis Context

Visible:

- Diagnosis summary.
- Technician who confirmed it.
- Last updated time.
- "Edit diagnosis" if allowed.

If only complaint exists:

- Show `Customer complaint only. Diagnosis required before proposal.`

### Repair Scope Confirmation

Bottom sheet or full-screen mobile editor:

- Confirmed operations.
- Required parts.
- Services/materials.
- Exclusions.
- Notes.

Human confirmation required before AI can build a Proposal.

### Repair Solutions

Default view:

- Each solution as compact row/card:
  - title;
  - included summary;
  - customer price;
  - status/warnings;
  - tap to edit.

No visible internal line table by default.

### Adding First Repair Solution

Flow:

1. Confirm diagnosis/scope.
2. Show Price Book suggestions.
3. Technician selects suggestion or chooses Manual.
4. System creates draft solution.
5. Technician reviews price, included work, warranty, and warnings.

### Price Book Entry Selection

Use `POST /api/price-book/repair-solutions` as initial contract.

Visible:

- suggested repair name;
- price;
- match reason in plain language;
- "Requires technician confirmation".

Hidden:

- scoring;
- tokens;
- aliases;
- internal bundle metadata.

### Manual Creation

Manual Repair Solution editor should ask only:

- repair title;
- customer description;
- price;
- included work;
- optional internal cost.

Advanced labor/part/material/service details open only when needed.

### Parts / Labor / Materials / Service Fees

Do not show as a permanent table.

Use solution detail bottom sheet:

- Included parts
- Labor
- Materials
- Fees
- Internal cost / margin

### Quantity / Customer Price / Internal Cost

Inline for simple price edits.

Bottom sheet for detailed internal pricing.

Internal cost and margin should be visible to authorized technician/owner, never customer.

### Customer-Facing Description

AI may draft it, but technician confirms.

Visible preview:

- short proposal paragraph;
- included bullet list.

### Warranty

Visible as compact row:

- default warranty text.
- tap to edit.

### Tax / Discount / Deposit

Visible:

- total summary only.

Collapsed:

- tax/discount/deposit controls.

Deposit is planned but not implemented in first builder.

### Optional / Alternative / Recommended

V1:

- Allow recommended flag.
- Allow optional/alternative labels only as internal draft metadata if UI is clear.
- Do not let customer partially approve until implemented explicitly.

### Delete / Duplicate / Reorder

- Delete: overflow with confirmation.
- Duplicate: optional later, useful for alternative solutions.
- Reorder: drag later; for V1 simple up/down or sort order is enough.

### Validation Warnings

Examples:

- Diagnosis not confirmed.
- Repair scope missing.
- No customer price.
- Internal cost missing.
- Warranty missing.
- Tax settings unavailable.
- Proposal has no customer-facing description.

Warnings must be actionable and not expose AI internals.

### Avoiding Infinite Scroll

Default Finance screen should show:

1. Diagnosis status.
2. Repair Solutions.
3. Proposal total.
4. Preview / Send.
5. Current approval state.

Everything else opens through:

- bottom sheets;
- full-screen editor;
- collapsed history;
- compact overflow menus.

### Mobile Behavior

At 375px / 390px / 430px:

- one-column stack;
- sticky bottom primary action when editing;
- no horizontal line item grid;
- solution rows fit in one screen with totals visible;
- customer preview opens full-screen;
- advanced calculations open bottom sheet.

## 8. Customer Repair Proposal UX

Customer page should not be the internal builder.

Structure:

1. Company identity.
2. Job/customer/appliance summary.
3. Confirmed problem.
4. Proposed Repair Solution.
5. What is included.
6. Warranty.
7. Total.
8. Tax/discount/deposit if applicable.
9. Expiration if configured.
10. Approve.
11. Decline.
12. Request clarification.
13. Company/legal disclosures.

Never show:

- internal bundle structure;
- internal cost;
- vendor cost;
- markup;
- margin;
- gross profit;
- Price Book metadata;
- AI confidence;
- internal warnings;
- technician notes;
- dispatcher notes.

Legacy `/estimates/[token]` can continue to render existing estimates. New Proposal tokens should render the Proposal layout.

## 9. AI Responsibilities

AI is a controlled assistant.

AI may:

- structure confirmed repair scope;
- suggest missing work steps as warnings;
- suggest Price Book entries;
- suggest labor/parts/materials from Price Book;
- rewrite customer-facing descriptions;
- check completeness;
- explain recommendation reasons to technician;
- calculate recommended preview only from company rules.

AI may not:

- approve diagnosis;
- convert complaint into final diagnosis;
- present unconfirmed scope as fact;
- add scope without human confirmation;
- send Proposal;
- change price silently;
- remove items silently;
- alter warranty silently.

Human confirmation points:

- diagnosis confirmed;
- repair scope confirmed;
- Price Book selection accepted;
- manual price accepted;
- AI description accepted;
- warranty accepted;
- Proposal sent.

## 10. Price Book Integration Boundary

Minimum Builder contract:

- fetch ranked Repair Solution suggestions;
- fetch selected Price Book item details;
- expand bundles internally into estimate item snapshots;
- expose customer-facing name/description/price;
- preserve internal child data for calculation only.

Builder reads:

- item id;
- item type;
- name;
- customer description;
- appliance group/type;
- brand;
- total price;
- labor/part price;
- internal cost;
- warranty text;
- tax behavior;
- bundle children;
- hidden internal flags;
- review status.

Builder may create draft Price Book knowledge later only as `pending`, never as approved live repair without Settings review.

If Price Book is empty:

- manual Repair Solution flow must work.
- AI can help wording but cannot invent approved price book records.

Future Price Book tasks:

- full merge workflow;
- learning from sold proposals;
- approval governance;
- analytics;
- richer bundle editor.

## 11. Calculation Model

Authoritative calculations must happen server-side.

Frontend may preview, but saved/sent totals must come from the same calculation rules used by backend.

Fields:

- labor amount;
- parts amount;
- materials amount;
- service fees;
- discount amount;
- taxable amount;
- non-taxable amount;
- tax;
- deposit required amount;
- subtotal;
- total;
- internal cost;
- gross profit;
- margin.

Rules:

- currency: USD cents or numeric with strict two-decimal rounding.
- round each line total to cents.
- subtotal is sum of customer-facing charge lines before discounts/tax.
- discounts apply by company policy; V1 supports flat/percent only if persisted.
- taxable amount depends on line tax behavior and company tax config.
- tax config must be company-owned. If missing, show `Tax not configured` or use explicit safe default only if company policy says so.
- deposit is future and should not block Proposal V1.
- snapshot calculations at send.
- editing after send creates new version and recalculates only the new version.

Minimum safe contract before implementation:

- create a shared calculation helper used by API and UI.
- persist discount/tax inputs and computed amounts.
- public customer page must read saved snapshot, not recalculate from current Price Book.

## 12. Versioning And Immortality

Sent Proposal versions are immutable.

At send:

- validate diagnosis/scope;
- snapshot Repair Solutions;
- snapshot Price Book values and bundle expansion;
- snapshot customer-facing rendered payload;
- snapshot internal estimate lines;
- snapshot totals/tax/discount/warranty;
- generate approval token for that version.

After send:

- no silent edits.
- changes create a new draft version.
- sending new version supersedes prior sent version.

Old customer link:

- must not show changed terms under same token.
- if superseded, should show a clear replacement message.
- approval should be blocked for superseded/expired/canceled versions.

Invoice:

- created only from approved version.
- invoice links to the approved internal estimate/version snapshot.

Audit:

- keep all versions.
- timeline records send, view if implemented, approval, decline, supersede, cancel, invoice conversion.

## 13. Data Model Plan

No migrations are created in Task 168. This is a plan only.

Recommended minimal evolution:

### Option A: Adapt Existing Estimate As Version Entity

Use one `service_request_estimates` row per Repair Proposal version.

Add future columns:

- `proposal_display_status`
- `proposal_title`
- `proposal_customer_summary`
- `proposal_snapshot_json`
- `diagnosis_snapshot`
- `repair_scope_snapshot`
- `price_book_snapshot`
- `discount_type`
- `discount_value`
- `discount_amount`
- `tax_rate`
- `taxable_amount`
- `non_taxable_amount`
- `deposit_required_amount`
- `superseded_by_estimate_id`
- `superseded_at`
- `expires_at`
- `viewed_at`

Pros:

- avoids second estimate engine.
- existing approval/invoice logic can adapt.
- old rows remain valid.

Cons:

- estimate row carries Proposal concerns.
- complex multi-solution/alternative behavior may become awkward.

### Option B: Add `repair_proposal_versions`

Create lightweight proposal/version table linked to `service_request_estimates`.

Fields:

- id;
- company_id;
- service_request_id;
- customer_id;
- appliance fields/snapshot;
- estimate_id;
- version_number;
- status;
- public_token_hash;
- proposal_snapshot_json;
- diagnosis_snapshot;
- repair_scope_snapshot;
- sent_at/viewed_at/responded_at/superseded_at/expires_at;
- created_by_profile_id.

Pros:

- separates customer-facing Proposal from internal Estimate.
- cleaner versioning and public rendering.

Cons:

- risk of parallel system if overbuilt.
- requires adapter for old `/estimates/[token]`.

Recommendation:

- Use Option A for first implementation unless proposal rendering/versioning cannot be safely represented.
- If adding a new table, make it a thin version/snapshot wrapper, not a second financial engine.

### Repair Solution Storage

Future table or JSON snapshot may be needed:

- `repair_solutions` draft table linked to service request and estimate/proposal.
- Or store solution group in `service_request_estimate_items` with new `repair_solution_id` / `repair_solution_snapshot`.

Recommendation:

- For V1, add grouping metadata to estimate items plus estimate-level proposal snapshot.
- Add dedicated solution table only if multiple optional/alternative solutions are required.

### RLS / Service Role

- Dashboard users can access only jobs they can view and company Price Book they can access.
- Customer public reads only token-specific proposal snapshot.
- Service role can perform trusted writes through API only.
- No browser direct writes to finance tables.

## 14. API Plan

### Create Draft

- Caller: authenticated technician/dispatcher/owner.
- Input: service_request_id, diagnosis/scope snapshot, optional selected Price Book IDs.
- Validation: job access, diagnosis/scope presence if sending-ready.
- Idempotency: optional active draft per job unless user requests new version.
- Transaction: create estimate/proposal draft and solution rows/snapshots.
- Timeline: draft created optional.

### Update Draft

- Caller: authenticated authorized user.
- Input: draft id, solution/item changes.
- Validation: draft status only.
- Transaction: update draft, recalculate.
- Timeline: optional draft updated.

### Create Repair Solution

- Caller: technician/dispatcher/owner.
- Input: title, scope, selected price book item or manual fields.
- Validation: confirmed scope or explicit manual confirmation.
- Side effects: recalculate draft.

### Update Repair Solution

- Caller: authorized user.
- Validation: draft only.
- Side effects: recalculate, warnings.

### Delete Repair Solution

- Caller: authorized user.
- Validation: draft only; cannot leave send-ready proposal empty.
- Timeline: optional.

### Add Proposal Item

- Caller: authorized user.
- Input: labor/part/material/service/fee or Price Book child.
- Validation: price/quantity/tax/warranty limits.
- Side effects: recalculate.

### Update Proposal Item

- Caller: authorized user.
- Validation: draft only.
- Side effects: recalculate.

### Calculate Totals

- Caller: authenticated UI/API.
- Input: draft data.
- Validation: same as save.
- Authority: backend/shared calculation.
- Output: subtotal, discount, taxable, tax, total, cost, margin.

### Request AI Recommendations

- Caller: authenticated dashboard user.
- Input: confirmed diagnosis/scope, job context, selected Price Book candidates.
- Validation: no complaint-only final scope.
- Output: suggestions requiring confirmation.
- Side effects: none unless user accepts.

### Preview Customer Proposal

- Caller: authenticated user.
- Input: draft id.
- Output: customer-rendered preview from draft snapshot.
- Side effects: none.

### Send Proposal

- Caller: authorized human.
- Validation: draft valid, customer price present, warranty/tax policy resolved, no blocking warnings.
- Transaction: create immutable snapshot, status sent, token, job status `estimate_sent`, timeline.
- Notification: current V1 returns link; future SMS/email.

### Create New Version

- Caller: authorized user.
- Input: source sent/declined/superseded proposal.
- Transaction: copy previous version into draft, link parent.
- Side effects: none until send.

### Mark Viewed

- Caller: public token page.
- Validation: valid token and version can be viewed.
- Idempotency: first view timestamp only.
- Timeline: optional.

### Request Clarification

- Caller: customer token page.
- Input: message.
- Transaction: create communication/timeline event, set customer question state.
- V1 may defer.

### Approve

- Caller: customer token or future verbal approval staff action.
- Validation: sent/current/not expired/not superseded.
- Transaction: status approved, job `estimate_approved`, timeline, approval audit.
- Notification: future attention/SMS/email.

### Decline

- Caller: customer token.
- Validation: sent/current.
- Transaction: status declined, job `waiting_customer`, timeline.

### Expire

- Caller: system/authorized user.
- Validation: expiration policy.
- V1 may defer.

### Cancel

- Caller: authorized user.
- Validation: not approved/invoiced unless void policy allows.
- Transaction: status canceled/void, timeline.

### Convert Approved Version To Invoice

- Caller: authorized user.
- Validation: approved, not already invoiced.
- Transaction: create invoice snapshot from approved estimate/version.
- Side effects: timeline; no payment yet.

## 15. Legacy Compatibility

### Existing Estimates

- Continue displaying in Job Workspace history.
- Draft estimates remain editable through legacy path until replaced.
- Sent/approved/declined/void estimates remain read-only.
- Do not rewrite legacy line items into Repair Solutions destructively.

### Legacy Public Links

- `/estimates/[token]` must continue to work.
- Old tokens load old estimate payload.
- New Proposal links may share route or use new route, but old route must remain.

### Approval Compatibility

- Existing `respond_to_public_estimate_rpc` remains valid for old estimates.
- New Proposal approval can either adapt this RPC or add a new token RPC with backward-compatible route detection.

### Job Status Compatibility

- Keep `estimate_sent`, `estimate_approved`, `waiting_customer` mapping.
- Avoid new job statuses until the workflow requires them.

### Invoice Compatibility

- Existing `create_invoice_from_estimate_rpc` remains.
- New Proposal approval must yield an approved internal estimate that this RPC can invoice, or an adapted successor with the same old behavior for legacy estimates.

### Rollback Strategy

- No destructive migrations.
- New columns/tables nullable and additive.
- Existing UI can still render estimates from old fields.
- New Proposal layer can be disabled/hidden if needed while legacy Estimate flow remains.

## 16. Implementation Breakdown

### 168.1 Finance Data Contract Audit And Migration Plan

- Goal: finalize minimal schema evolution.
- Scope: docs and migration design only.
- Likely files: migrations plan docs, type notes.
- DB impact: none until approved.
- Risks: over-modeling.
- Acceptance: clear additive migration spec.
- Non-goals: implementation.

### 168.2 Shared Calculation Engine Design And Test Harness

- Goal: define shared server calculation helper.
- Likely files: future `frontend/src/server/finance/calculations.ts`.
- DB impact: none.
- Acceptance: documented inputs/outputs and rounding.
- Non-goals: tax reporting.

### 168.3 Proposal Draft API Foundation

- Goal: wrapper around existing estimate draft creation.
- API impact: create/update draft proposal endpoints.
- Acceptance: creates internal estimate draft without breaking old endpoints.
- Non-goals: customer send.

### 168.4 Repair Solution Draft Model

- Goal: group estimate items under Repair Solutions.
- DB impact: additive grouping metadata or thin table.
- Acceptance: one job can store draft solution(s).
- Non-goals: partial approval.

### 168.5 Price Book Selection Integration

- Goal: use existing `repair-solutions` endpoint in Finance tab.
- UI impact: suggestions inside Builder.
- Acceptance: technician confirms suggestion before adding.
- Non-goals: Price Book management.

### 168.6 Mobile Repair Proposal Builder UI

- Goal: replace current line-first Finance UI with solution-first mobile workflow.
- UI impact: Job Workspace Finance only.
- Acceptance: 375/390/430 no overflow; no giant tables.
- Non-goals: dashboard redesign.

### 168.7 Customer Repair Proposal Preview

- Goal: customer-facing preview before send.
- UI/API impact: preview endpoint or client view from draft snapshot.
- Acceptance: no internal costs/bundles shown.
- Non-goals: live send.

### 168.8 Send Proposal And Immutable Snapshot

- Goal: generate token and immutable version.
- DB/API impact: additive version/snapshot fields.
- Acceptance: old estimates still send; new proposals create locked snapshot.
- Non-goals: SMS/email.

### 168.9 Customer Proposal Page

- Goal: new Proposal customer UI or compatible route branch.
- Acceptance: customer approves/declines/requests clarification if implemented.
- Non-goals: payment.

### 168.10 Approval / Decline / Job Sync

- Goal: preserve existing job status transitions and timeline.
- Acceptance: approval updates UI immediately and job status reflects approved.
- Non-goals: attention engine.

### 168.11 Invoice Conversion Compatibility

- Goal: approved Proposal version creates invoice through existing invoice foundation.
- Acceptance: no duplicate invoices; old approved estimates still invoice.
- Non-goals: invoice builder redesign.

### 168.12 Production QA And Legacy Regression

- Goal: end-to-end test.
- Acceptance: new proposal flow and old estimate links both work.
- Non-goals: Task 169.

## 17. Acceptance Criteria

Task 168 implementation is ready only when:

1. Technician opens Job Finance.
2. System shows confirmed Diagnosis context.
3. Technician confirms Repair Scope.
4. Technician creates Repair Solution.
5. Technician may use Price Book or manual entry.
6. AI recommends but cannot silently modify confirmed scope.
7. Technician reviews internal costs, customer price, and margin.
8. Technician previews customer Repair Proposal.
9. Technician sends Proposal.
10. System creates immutable version snapshot.
11. Customer opens clean mobile Proposal.
12. Customer approves, declines, or requests clarification.
13. Timeline records important business events.
14. Job status updates correctly.
15. Approved Proposal version can create Invoice.
16. Existing legacy Estimates remain accessible.
17. Technician and customer flows work at 375px, 390px, and 430px.

## 18. Explicit Non-Goals

Task 168 design and first implementation sequence must not include:

- full Price Book management;
- payment processing;
- Stripe integration;
- full Invoice Builder redesign;
- accounting reports;
- inventory purchasing;
- vendor ordering;
- autonomous AI diagnosis;
- dashboard redesign;
- unrelated Details tab redesign;
- unrelated Timeline redesign;
- full company Finance Settings;
- tax reporting;
- refunds;
- financing;
- recurring billing.

## Risks

- Existing estimate totals do not fully persist tax/discount preview behavior.
- `ServiceRequestDetail.tsx` is too large and should be decomposed carefully.
- Old `pricing_catalog_items` and new `price_book_items` overlap; adapters must avoid confusing the two.
- Public token compatibility is non-negotiable.
- Invoice creation depends on approved `service_request_estimates`; proposal design must preserve that path.
- Partial approval is tempting but would multiply complexity.
- If Proposal and Estimate become two fully separate systems, WRA will duplicate its finance engine.

## Blocking Unresolved Questions

None for design.

Future implementation must make explicit architecture choices before migrations:

- adapt `service_request_estimates` as version entity or add thin `repair_proposal_versions`;
- exact persisted fields for discount/tax/deposit snapshots;
- whether customer clarification is in V1 or deferred.

