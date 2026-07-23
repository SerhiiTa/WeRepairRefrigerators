# Finance Workiz Exit Roadmap

This document locks the Finance implementation order for the Workiz Exit phase.

Finance must become a dependable production workflow before advanced AI, analytics, or optimization layers are added.

## Locked Phase Order

Do not change this order without a separate architecture decision.

1. Price Book Foundation
2. Bundles
3. Manual Estimate Builder
4. AI Estimate from Price Book
5. Estimate Approval and Verbal Approval Sync
6. Deposits
7. Invoice
8. Payments
9. Finance Timeline
10. Price Learning and Analytics

## Workiz Exit Finance Success Condition

Finance is ready to replace Workiz when a technician or dispatcher can:

1. Open a job.
2. Choose ready work or a bundle from Price Book.
3. Create an estimate.
4. Send the estimate.
5. Receive online approval or mark verbal approval.
6. Collect a deposit.
7. Convert the approved estimate to an invoice.
8. Accept payment.
9. Send a receipt.
10. Close the job.

AI must not block this workflow.

## Phase 1 - Price Book Foundation

Status: implemented by Task 166.

The Price Book is the canonical source for:

- labor;
- parts;
- services;
- fees;
- bundles;
- future estimate line selections;
- future invoice line references;
- future learning/analytics.

Task 166 creates the schema, starter seed, duplicate prevention, governance status foundation, server API, and Settings UI.

## Phase 2 - Bundles

Status: schema foundation implemented by Task 166; estimate expansion behavior is future work.

Bundles should let the technician select common repair packages such as:

- Dryer Not Heating Repair
- Refrigerator Not Cooling Diagnostic
- Dishwasher Not Draining Repair
- LG Compressor Replacement

Bundle behavior must support:

- detailed lines;
- collapsed customer line;
- optional items;
- required items;
- hidden internal items;
- bundle price override;
- customer-facing explanation.

Task 167 UX rule:

- Bundle content is edited inside the same Price Book repair editor.
- The first-level Price Book list does not expose bundle internals.
- Future Job Workspace Finance should show concise selectable repair solutions, not the full Price Book configuration surface.

## Phase 3 - Manual Estimate Builder

Next build target.

The technician should be able to open a job, select Price Book items/bundles, adjust quantities/prices, save draft, and send estimate.

Rules:

- technician remains the source of truth;
- no AI dependency;
- no inventory dependency;
- estimates use existing estimate persistence and approval flow;
- customer-facing estimate hides internal costs and part numbers unless intentionally shown.

Task 167 selection foundation:

- `POST /api/price-book/repair-solutions` returns compact, rule-based repair-solution suggestions from job context.
- It does not create estimates.
- It does not call OpenAI.
- It ranks by exact appliance type, appliance group, brand, symptoms, aliases, keywords, company approval, and General fallback.
- Future Manual Estimate Builder should use this endpoint/helper to pre-filter Price Book choices without deciding repair scope for the technician.

## Phase 4 - AI Estimate From Price Book

AI may draft estimates only from Price Book data and technician-confirmed scope.

AI must not invent:

- repairs;
- parts;
- prices;
- quantities;
- warranty terms.

AI can:

- search Price Book;
- suggest matching items;
- rewrite descriptions;
- prepare draft lines for technician confirmation.

AI output in future tasks should reference validated Price Book item IDs. If no approved item exists, AI should recommend a pending item request rather than inventing a live approved repair or price.

## Phase 5 - Estimate Approval And Verbal Approval Sync

Customer online approval already exists. Future work must add a clean verbal approval path:

- who approved;
- approval timestamp;
- approval method;
- notes;
- link to job timeline.

Verbal approval must not bypass audit/history.

## Phase 6 - Deposits

Deposits come after estimate approval behavior is stable.

Future deposit model should support:

- deposit requested;
- deposit paid;
- deposit applied to invoice;
- deposit refunded/voided;
- customer receipt.

Do not implement deposits before estimates are production-safe.

## Phase 7 - Invoice

Invoice must build from approved work and preserve history.

Existing invoice foundation snapshots approved estimate lines. Future work should complete:

- invoice creation/editing rules;
- invoice send;
- invoice customer page;
- invoice status;
- invoice timeline events.

## Phase 8 - Payments

Payments come after invoice completion.

Future work should support:

- Stripe or selected provider;
- payment status;
- receipt;
- payment failure/void/refund foundation;
- customer payment page.

## Phase 9 - Finance Timeline

Finance events should appear in job/customer history:

- estimate created;
- estimate sent;
- estimate viewed;
- estimate approved/declined;
- verbal approval recorded;
- deposit requested/paid;
- invoice created/sent/paid;
- receipt sent.

Timeline should show business events only, not provider/debug metadata.

## Phase 10 - Price Learning And Analytics

Learning comes last.

Future analytics can track:

- item usage;
- approval rate;
- actual sold price;
- discount patterns;
- profitability;
- technician edits;
- duplicate/merge suggestions.

Learning must preserve historical estimate/invoice records and group merged Price Book items through canonical references.

## Hard Rules

- Do not create a second estimate engine.
- Do not create a second invoice engine.
- Do not build payments before invoice workflow.
- Do not let AI invent prices or scope.
- Do not auto-run paid AI at job creation.
- Do not expose internal cost to customers.
- Do not rewrite historical estimate or invoice line items during Price Book cleanup.
- Do not use inventory, vendor, purchasing, or warehouse assumptions in Price Book foundation.
