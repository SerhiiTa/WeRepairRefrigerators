# Task 168.4 - Repair Proposal Builder UX Redesign

Task 168.4 rebuilds the technician-facing Repair Proposal Builder experience in Job Workspace -> Finance without changing the Repair Proposal generation contract, Estimate persistence engine, public customer Proposal route, invoice conversion, database schema, or AI prompt.

## Product Decision

The technician should not feel like they are editing an internal estimate table. The Finance tab should feel like a clean proposal document builder:

1. Start with one decision: generate with AI, create manually, or use a template.
2. Review the proposal as editable business sections.
3. Edit included items in focused bottom sheets.
4. Preview, save, or send from a sticky action bar.

This keeps Finance aligned with `docs/FINANCE_SYSTEM_MASTER_PLAN.md`: WRA sells a Repair Solution, while internal Estimate, Price Book, margin, tax, and cost details remain hidden until needed.

## UI Changes

The first Finance screen now shows:

- `Repair Proposal`
- `Generate with AI`
- `Create Manually`
- `Use Template`
- Draft status
- Last updated
- Warning count

After generation or manual/template start, the builder opens with expandable cards:

- What we found
- Repair Solution
- What we will do
- Included Items
- Warranty
- Estimated Completion
- Totals
- Warnings

Included item rows show the technician the meaningful fields without a table:

- Customer Price
- Internal Cost
- Quantity
- Taxable
- Warranty

Each custom item opens a mobile-friendly bottom sheet for editing title, type, description, customer price, internal cost, quantity, taxability, order, and delete.

## Actions

The sticky bottom bar exposes only:

- Preview
- Save Draft
- Send

These continue to use the existing estimate persistence and send flow. No second proposal engine was created.

## Compatibility

Task 168.4 intentionally preserves:

- `service_request_estimates`
- `service_request_estimate_items`
- `/api/estimate-agent/draft`
- `/api/repair-proposals/generate`
- public `/estimates/[token]`
- approval/decline behavior
- invoice conversion from approved estimates
- authoritative totals introduced by migration 0067

## Explicit Non-Goals

Task 168.4 does not implement:

- new AI prompt behavior
- schema changes
- customer Proposal redesign
- approve/decline redesign
- invoice builder changes
- Stripe or deposits
- partial approvals
- multiple customer-selectable options
- full template management
- full Price Book management
- autonomous diagnosis

## Known Follow-Up

The legacy inline builder code path is no longer visible to technicians, but the save/send engine remains the existing Estimate engine. A future cleanup task may remove the old hidden JSX after the new builder receives owner QA, but should still avoid changing persistence behavior unless explicitly requested.

## Task 168.4A Final QA And Fixes

Final QA used the QA technician account only on safe QA job `33a16f94-0176-4378-8c56-1344ddee9dc3`. The owner account was logged out before browser QA and was not used for Finance verification.

Verified flows:

- Landing screen: `Repair Proposal`, `Generate with AI`, `Create Manually`, `Use Template`, draft status, last updated, and warning count render correctly.
- Generate with AI: the Russian sealed-system scope produced editable customer-facing lines for evaporator, filter drier, service valve, refrigerant recharge, evaporator replacement labor, diagnostic/reassembly/testing labor, and suggested review work. The technician removed the extra generated compressor lines in the Builder without changing AI prompt behavior.
- Included Items: rows now show explicit `Customer Price`, `Internal Cost`, `Quantity`, `Type`, `Taxable`, `Customer Visible`, and `Warranty` labels.
- Item editing: bottom sheets support title, customer description, customer price, internal cost, quantity, type, taxable, customer visibility, ordering, and delete.
- What we will do: checklist items can be edited, added, and deleted using the same proposal-line state.
- Manual Draft: `Create Manually` creates a full card-based Builder with a starter labor line and all required sections.
- Template Draft: `Use Template` opens the minimal starter template sheet and creates a working template draft without implying full template management.
- Preview: fixed the active Builder path so the `Preview` button opens a customer-facing modal with itemized estimate disclosure. Internal cost, margin, Price Book IDs, AI metadata, vendor cost, internal warnings, and customer visibility flags are not shown in the modal.
- Send validation: fixed the active Builder so `Send` is disabled when warnings/blockers are present while `Save Draft` remains available for incomplete drafts.
- Save/reload: saved draft `EST-2026-BB50EAE4` persisted after leaving and reopening the job with 7 lines and total `$1,921.83`.
- Responsive QA: verified 375px, 390px, 430px, and desktop widths with no horizontal overflow. Builder, totals, sticky actions, and bottom sheets remained reachable.

Remaining limitations:

- Task 168.4A did not change the AI prompt or Repair Proposal generation contract. Any generated scope overreach must still be corrected by the technician in the Builder until a future generation-task explicitly changes AI behavior.
- `Estimated Completion` is captured in the estimate decision context when saving, but the current estimate row contract does not yet expose a dedicated persisted customer field for reload/edit display.
