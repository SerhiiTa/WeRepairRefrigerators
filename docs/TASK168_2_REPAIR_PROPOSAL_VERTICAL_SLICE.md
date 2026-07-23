# Task 168.2 - Repair Proposal Builder First Production Vertical Slice

Task 168.2 implements the first production vertical slice for the Finance Operating System.

It follows:

- `docs/FINANCE_SYSTEM_MASTER_PLAN.md`
- `docs/TASK168_REPAIR_PROPOSAL_BUILDER_PLAN.md`
- `docs/TASK168_1_FINANCE_DATA_CONTRACT_AND_MIGRATION_PLAN.md`

## Scope Implemented

The Job Workspace Finance tab now presents the technician workflow as Repair Proposal Builder rather than a generic estimate generator.

The customer-facing public estimate route now presents a Repair Proposal first, with itemized estimate details hidden behind an explicit `View Itemized Estimate` action.

## Architecture Decision

Task 168.2 does not create a second estimate engine.

The vertical slice continues to use:

- `service_request_estimates`
- `service_request_estimate_items`
- existing approval tokens
- existing public `/estimates/[token]` route
- existing send/approve/decline RPCs
- existing invoice conversion from approved estimates

The technician sees Proposal language. The database still stores an internal Estimate.

## Technician Workflow

Inside Job Workspace -> Finance:

1. Technician enters confirmed repair scope in `Describe confirmed repair`.
2. Technician may type, paste, or use browser-native voice dictation when available.
3. Technician clicks `Generate Repair Proposal`.
4. Existing server-side estimate agent formats technician-confirmed scope into a draft.
5. Technician reviews and can edit:
   - Repair Solution
   - Customer Summary
   - Customer-facing line titles
   - Line type
   - Customer price
   - Internal cost
   - Quantity
   - Taxability
   - Customer description
   - Warranty
   - Tax/discount settings
   - Line order
6. Technician can `Save Draft`.
7. Technician can open `Preview`.
8. Technician can `Send` only when blocking validation errors are resolved.

## Blocking Send Validation

Send is blocked when:

- confirmed repair scope is empty;
- there are no proposal lines;
- a visible line is missing a customer-facing title;
- a visible line has invalid quantity;
- a visible customer-facing line has no customer price.

Save Draft is intentionally softer so incomplete drafts can be preserved.

## Draft Content

The builder now exposes the first vertical-slice proposal data needed by technicians:

- Repair Solution
- Customer Summary
- Customer Description
- Warranty
- Labor count
- Parts count
- Materials count
- Service Fees count
- Internal Cost
- Customer Price / Total
- Tax
- Discount
- Margin
- Warnings

Internal cost and margin remain technician-only and are not shown on the customer proposal page.

## Customer Experience

The public approval route remains `/estimates/[token]` for legacy compatibility.

The customer page now shows:

- Repair Proposal title
- What happened
- What will be done
- Proposal Total
- customer/appliance/service area summary
- warranty/notes
- Approve Proposal
- Decline
- optional `View Itemized Estimate`

The main customer view does not show:

- internal cost;
- margin;
- markup;
- Price Book IDs;
- AI information;
- technician notes;
- internal bundle details.

## Legacy Compatibility

Preserved:

- existing public estimate links;
- approval token ownership;
- approval and decline endpoint;
- job status sync;
- saved estimate history;
- invoice conversion from approved estimates;
- existing draft update/archive path;
- existing line-item persistence path.

No migration was created for this slice. Task 168.1 remains the source of truth for future additive data-contract migration work.

## Files Changed

- `frontend/src/components/dashboard/ServiceRequestDetail.tsx`
- `frontend/src/components/public/PublicEstimateApproval.tsx`
- `docs/TASK168_2_REPAIR_PROPOSAL_VERTICAL_SLICE.md`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/DEVELOPER_HANDOFF.md`

## Not Implemented

The following remain out of scope:

- Payment
- Stripe
- Partial approval
- Multiple Proposal alternatives
- Full Price Book management
- Invoice Builder redesign
- Inventory
- Vendor ordering
- Accounting reports
- Finance Settings
- Dashboard redesign
- Shared Calculation Engine
- New proposal schema migration

## QA Notes

Browser QA must use only the existing project QA account. Do not use owner, employee, or customer accounts for validation.

Use `info@appliancerepair-homefix.com` only if it is the intended QA account available in the local session. Do not print, store, or change its password.

Required QA:

- create draft;
- save draft;
- reload page;
- reopen draft;
- edit line/title/price/cost/quantity;
- preview;
- send;
- open public proposal;
- open itemized estimate;
- approve;
- decline on another sent proposal/version if available;
- verify job status sync;
- verify invoice creation compatibility from approved proposal;
- verify old estimate links still open.

## Task 168.2B Final QA

Task 168.2B completed the first end-to-end Repair Proposal vertical-slice QA on the QA service request `33a16f94-0176-4378-8c56-1344ddee9dc3`.

Verified workflow:

- Job Workspace -> Finance generated a Repair Proposal from confirmed technician scope.
- The generation now preserves the explicit technician repair scope for water valve replacement, frozen dispenser water line thawing, and labor/testing.
- Save Draft persisted estimate `EST-2026-B13AF2AB`.
- Leaving Jobs Center and reopening the job preserved the saved draft, estimate number, three lines, and total.
- Sending generated a public approval link on the existing `/estimates/[token]` route.
- The public Repair Proposal page rendered customer-facing proposal content and `View Itemized Estimate`.
- Public approval succeeded and updated the estimate to `approved`.
- A separate QA-only proposal `EST-2026-D3DE3ADB` verified the decline path and updated the job back to `waiting_customer`.
- Timeline notes were written for draft creation, send, approval, decline, status changes, and invoice creation.
- Invoice compatibility passed: approved estimate `EST-2026-B13AF2AB` created draft invoice `INV-2026-05BD2E90`.
- Duplicate invoice protection behaved idempotently: a second invoice-create call returned the same invoice and did not create a duplicate invoice row.

Fixes made during QA:

- The estimate agent's technician-scope repair pass now treats dispenser `supply tubing` / `water supply tubing` as an explicit dispenser water line when paired with thaw/defrost language.
- Browser-native dictation now reports a visible error if microphone permission or browser support prevents dictation from starting instead of failing silently.

Known limitations after this vertical slice:

- Builder preview tax/discount settings are not yet an authoritative persisted calculation contract. The saved estimate uses the existing estimate RPC totals; the verified QA proposal persisted at `$595.00` with `tax = 0`.
- Responsive browser screenshots could not be captured from the Codex runtime after the browser binding reset because Playwright's bundled browser was missing and the installed Chrome headless process aborted. Public/API workflow verification was completed, and owner browser QA should still confirm 375px, 390px, 430px, and desktop rendering on the existing local session.
- No historical pre-Task-168 raw approval token was available for a separate legacy-link sample. The live public route compatibility was verified with the newly sent token, which uses the same `/estimates/[token]` route and response endpoint.

## Task 168.2C Authoritative Tax/Discount Persistence

Task 168.2C adds the authoritative calculation foundation required to close the Task 168.2B total mismatch.

Migration:

- `supabase/migrations/0067_repair_proposal_authoritative_totals_apply_ready.sql`

Persisted fields added to `service_request_estimates`:

- `discount_type`
- `discount_value`
- `discount_amount`
- `tax_rate`
- `taxable_amount`
- `non_taxable_amount`
- `internal_cost_total`
- `gross_profit`
- `margin_percent`

Calculation rules:

- Line totals are normalized to cents.
- Subtotal is the sum of line totals.
- Discount is applied before tax.
- Flat discount is capped at subtotal.
- Percent discount is capped to `0-100%`.
- Tax rate is capped to `0-20%`.
- Discount is allocated proportionally across taxable and non-taxable amounts.
- Tax is calculated only on taxable amount after discount.
- Total is `subtotal - discount_amount + tax`.
- Internal cost total is the sum of line quantity times internal unit cost.
- Gross profit is `total - internal_cost_total`.
- Margin percent is gross profit divided by total.

RPC/API changes:

- Added 4-argument Repair Proposal create/update RPC overloads:
  - `create_service_request_estimate_rpc(p_request_id, p_catalog_items, p_custom_items, p_adjustments)`
  - `update_service_request_estimate_draft_rpc(p_estimate_id, p_catalog_items, p_custom_items, p_adjustments)`
- Old 3-argument callers remain supported for legacy estimate flows.
- The Job Workspace estimate API now sends `adjustments` with `discountType`, `discountValue`, and `taxRate`.
- The server RPC recalculates totals authoritatively and persists the calculation snapshot.
- Public proposal payload now includes persisted discount/tax fields.
- Invoice conversion continues to copy approved estimate `subtotal`, `tax`, and `total`, so invoices receive the authoritative approved proposal total after migration 0067 is applied.

Shared helper:

- `frontend/src/server/finance/repair-proposal-calculations.ts`
- Used by Job Workspace preview so frontend preview matches the server contract.

Focused tests:

- `frontend/src/server/finance/repair-proposal-calculations.test.ts`
- Verified subtotal-only, quantity, taxable/non-taxable lines, flat discount, percent discount, discount-before-tax, rounding, zero tax, internal cost, gross profit, margin percent, negative value normalization, discount capping, legacy default payload, and the `$595 + 8.25% taxable part = $618.51` scenario.

Verification completed locally:

- `node --test src/server/finance/repair-proposal-calculations.test.ts` passed.
- `npm run lint` passed.
- `npm run build -- --webpack` passed.
- `git diff --check` passed.

Production/manual action required:

- Apply `supabase/migrations/0067_repair_proposal_authoritative_totals_apply_ready.sql` in Supabase SQL Editor.
- Codex could not apply or database-parse the migration from this environment because `psql` and Supabase CLI are not installed, and this project has no safe SQL execution RPC.

Task 168.2C is not fully closed until migration 0067 is applied and final browser QA confirms:

- preview total equals saved total;
- reload shows the same subtotal/discount/tax/total;
- public Proposal and Itemized Estimate show the same total;
- invoice created from approved Proposal copies the same subtotal/tax/total;
- responsive visual QA passes at 375px, 390px, 430px, and desktop.

## Task 168.2D Final QA After Migration 0067

Owner manually applied:

- `supabase/migrations/0067_repair_proposal_authoritative_totals_apply_ready.sql`

QA account used:

- `qa-booking-tech@example.test`

QA job used:

- `33a16f94-0176-4378-8c56-1344ddee9dc3`

Authoritative totals QA proposal:

- Proposal number: `EST-2026-490987A9`
- Invoice number: `INV-2026-1EC31CFD`
- Lines entered:
  - `Diagnostic testing labor`, labor, customer price `$150.00`, internal cost `$0.00`
  - `Dispenser water inlet valve`, part, customer price `$285.00`, internal cost `$200.00`
  - `Frozen dispenser water line thawing`, service, customer price `$160.00`, internal cost `$0.00`
- Subtotal: `$595.00`
- Discount type: flat/dollar
- Discount value: `$10.00`
- Discount amount: `$10.00`
- Tax rate: `8.25%`
- Tax: `$23.12`
- Total: `$608.12`
- Internal cost: `$200.00`
- Gross profit/margin shown in Builder: `$408.12 · 67.11%`

Verified after migration 0067:

- Draft save succeeded with the new calculation snapshot fields/RPC behavior available.
- Saved estimate card displayed `$608.12`, matching Builder Preview.
- Leaving the Job Workspace, reopening the same job, opening Finance, and editing the saved draft restored line prices, internal costs, discount `$10.00`, tax rate `8.25%`, tax `$23.12`, subtotal `$595.00`, total `$608.12`, internal cost `$200.00`, and margin `$408.12 · 67.11%`.
- Customer Preview displayed Proposal Total `$608.12`.
- Sending changed the job to `Estimate Sent`, produced a public approval link, and kept the sent proposal read-only in the saved estimate card.
- Public Repair Proposal loaded at `/estimates/[token]` and showed estimate `EST-2026-490987A9`, customer, appliance, area, and Proposal Total `$608.12`.
- Public Itemized Estimate opened and showed only customer-visible lines plus Subtotal `$595.00`, Discount `-$10.00`, Tax `$23.12`, Tax rate `8.25%`, and Total `$608.12`.
- Public Itemized Estimate did not expose internal cost, margin, markup, Price Book IDs, AI confidence, vendor cost, internal warnings, or technician-only notes.
- Public approval updated the public UI immediately to `Approved`.
- Job Workspace reload showed job status `Estimate Approved` and estimate `EST-2026-490987A9 · Approved · $608.12`.
- Invoice creation from the approved proposal created draft invoice `INV-2026-1EC31CFD` from `EST-2026-490987A9`.
- Invoice card displayed `$608.12`, matching the approved Proposal total.
- Duplicate invoice protection is visible in the UI because the approved proposal now shows `View Invoice` instead of `Create Invoice`, and the invoice list contains one invoice for `EST-2026-490987A9`.
- Timeline recorded estimate creation, sent/status change, approval/status change, invoice creation, decline regression sent/status change, and decline/status change events.

Decline regression:

- Separate QA proposal: `EST-2026-7DE52D2A`
- Total: `$2.00`
- Public decline updated the public UI immediately to `Declined`.
- Job Workspace reload showed job status `Waiting Customer` and current estimate `EST-2026-7DE52D2A · Declined · $2.00`.
- Timeline recorded `Customer declined estimate EST-2026-7DE52D2A` and the automatic `Waiting Customer` status change.

Legacy compatibility:

- Existing historical estimates remained readable in the same job after 0067:
  - `EST-2026-B13AF2AB` approved, three lines, source invoice `INV-2026-05BD2E90`, total `$595.00`
  - `EST-2026-D3DE3ADB` declined, one line, total `$1.00`
- Existing invoice `INV-2026-05BD2E90` remained readable.
- No pre-Task-168 raw historical approval token was available, so historical-token QA was not claimed.

Responsive visual QA after Screen Recording permission:

- The in-app browser viewport override was re-tested after macOS Screen Recording permission was granted, and `window.innerWidth`, `documentElement.clientWidth`, and `scrollWidth` now reflected the requested widths.
- Verified true responsive widths `375px`, `390px`, `430px`, and desktop `1280px`.
- Verified Technician Repair Proposal Builder with an unsaved QA-only long-line visual check: no horizontal overflow, `$3.00` preview total readable, long line text wrapped, and `Save Draft`, `Preview`, and `Send` stayed reachable. `Send` correctly stayed disabled until confirmed repair scope was present.
- Sent QA-only visual proposal `EST-2026-E3837895` for approval-control QA. Public URL: `/estimates/21635e7230214b9686ef1626301090e0cbebc104e820438c9d0fa1d18e58bddb`.
- Verified the sent public Repair Proposal at `375px`, `390px`, `430px`, and desktop: no horizontal overflow, `$3.00` total readable, long description wrapped, `Approve Proposal` and `Decline` stayed reachable, and `View Itemized Estimate` opened.
- Verified the sent public Itemized Estimate at all required widths: line item and total were readable, and no internal cost, margin, markup, Price Book IDs, AI confidence, vendor cost, internal warnings, or technician-only notes were visible.
- Verified approved proposal `EST-2026-490987A9` at all required widths: approved state displayed, total `$608.12` was readable, no horizontal overflow occurred, and customer-only data remained visible.
- Verified approved Itemized Estimate at all required widths: Subtotal `$595.00`, Discount `-$10.00`, Tax `$23.12`, Tax rate `8.25%`, and Total `$608.12` displayed without layout breaks.
- No visual/responsive bugs were found during the completed responsive pass.

## Task 168.5 Manual Estimate Production Review Addendum

Final accepted local state:

- Supabase migrations `0068` through `0072` have been applied manually.
- Existing/old Estimates remain visible.
- New Manual Estimates save through the current estimate API and `0071` metadata RPC.
- Technician manual approval works through `0072` and does not fake a customer-clicked approval.
- Current local UI is ready for production review.

Manual Estimate editor rules now in force:

- The Manual Estimate screen is compact and mobile-first.
- The estimate context block shows only customer, service address, and estimate creation/update date.
- Job number is not repeated inside the estimate block; it remains only in the Job Workspace header.
- Items and Totals are the primary working surface.
- What we found, Repair solution, Warranty, Estimated completion, Notes, and Attachments support the price instead of leading the screen.
- Compact item rows do not show internal cost; internal cost remains editable inside the item editor.
- Bottom actions remain Preview proposal, Save draft, and Send to client.

Technician manual approval:

- `Approve for Customer` is available after an estimate is saved.
- Manual approval can happen before sending or after sending.
- Sending can still happen after manual approval for customer records.
- Manual approval records `approval_source = technician_manual` and `approved_by_profile_id`.
- Timeline/notes must say approval was recorded by a technician on behalf of the customer.
- Downstream status behavior remains the same as customer approval: estimate becomes Approved and the job moves to Estimate Approved.

Not included yet:

- Autosave.
- Sync to Job.
- Payments/Stripe.
- Invoice Builder redesign.
- Task 169.
