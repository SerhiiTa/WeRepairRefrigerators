# Task 167 - Price Book UX Rebuild And Finance Selection Foundation

Task 167 rebuilds Settings -> Price Book around the Workiz Exit finance principle:
the Price Book is company configuration, while Job Workspace Finance should later
show only short, relevant repair solutions.

## UX Decisions

- Price Book home now starts with a simple header: `Price Book`, `Repair solutions used for estimates and invoices.`, and `+ New Repair`.
- The prominent Refresh action was removed from the main header. Refresh remains a small secondary control near the list.
- The first-level list no longer exposes internal metadata such as labor split, parts split, duration, aliases, keywords, tax behavior, warranty, bundle internals, or archive actions.
- Desktop uses a compact appliance/category rail and a selected repair list.
- Mobile uses an appliance category selector before the repair list.
- Repair rows show only the repair name, customer-facing total price, optional compact badges, and an overflow menu.
- The whole repair row opens the editor.
- Archive/Restore and Duplicate live in the row overflow menu, not on the main row.

## Repair Editor

There is one editor for both standalone items and bundles.

Default visible fields:

- Repair Name
- Customer Description
- Total Price
- Appliance category
- Included Work

Progressive disclosure sections:

- Appliance & Matching
- Internal Pricing
- Warranty
- Bundle Content

Bundle content is edited inside the same editor. `+ Add Included Work` searches
existing approved Price Book items and adds them as child rows. This avoids the
old separate `Open bundle` workflow.

## Duplicate Prevention

Create and rename flows now go through duplicate checks using:

- normalized exact name;
- aliases;
- token overlap;
- item type;
- appliance group.

If a similar repair exists, the UI shows `Similar repair already exists` with:

- Open Existing
- Use Existing
- Continue as New, manager only
- Cancel

The UI does not auto-save near duplicates.

## Save Path Fix

Root cause of the previous edit error:

- The PATCH route tried to update only rows where `price_book_items.company_id`
  matched the current company.
- System/default rows have `company_id = null`.
- Editing a default row therefore updated zero rows and `.single()` produced the
  PostgREST single-object coercion failure.

Fix:

- PATCH first loads the item in the company-visible catalog.
- Company-owned rows are updated in place.
- System/default rows are not mutated. Editing one creates a company-owned
  override row with `source = company_override` and a canonical reference to the
  default item.
- The UI collapses company overrides over their system defaults, so users see one
  canonical repair row instead of duplicates.

## Finance Selection Foundation

Task 167 adds a server-side, rule-based repair-solution selection foundation for
future Job Workspace -> Finance.

Endpoint:

- `POST /api/price-book/repair-solutions`

Reusable helper:

- `frontend/src/server/price-book/selection.ts`

Input context may include:

- service request id;
- appliance type;
- appliance group;
- brand;
- issue description;
- job name;
- customer complaint;
- diagnosis text.

Ranking priority:

1. exact appliance type;
2. appliance group;
3. brand match;
4. symptom/complaint match;
5. aliases and keywords;
6. company-approved items;
7. General items last.

The helper does not call OpenAI and does not create an estimate. It returns
compact repair-solution suggestions with `technicianConfirmationRequired = true`.

Guardrails:

- Refrigerator jobs do not return Dryer-only repairs.
- Cooling siblings may be suggested when exact appliance type is unavailable.
- General items are allowed only as lower-priority fallback suggestions.
- AI estimate generation remains a future explicit action after technician
  diagnosis/findings or explicit `Generate with AI`.

## Not Started

Task 167 does not implement:

- Job Workspace Finance UI;
- Manual Estimate Builder;
- AI Estimate generation;
- Invoice;
- Payments;
- Deposits;
- inventory, vendors, purchasing, or warehouse logic.
