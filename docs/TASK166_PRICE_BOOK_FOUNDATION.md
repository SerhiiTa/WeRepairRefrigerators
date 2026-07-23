# Task 166 - Price Book Foundation

Task 166 starts the Finance phase without starting Estimate UI, Invoice, Payments, or Deposit work.

The purpose is to create the canonical Price Book foundation that future manual estimates, AI estimates, invoice line items, and finance analytics will use.

## Existing Finance Audit

Existing foundations that must not be duplicated:

- `pricing_catalog_items`: legacy MVP catalog used by the current estimate RPC.
- `service_request_estimates`: existing estimate document table with status, totals, approval token fields, archive support, and customer approval flow.
- `service_request_estimate_items`: existing estimate line item snapshots with labor/part/material/custom/warranty line support, internal/customer naming, cost/sell prices, and template references.
- `service_catalog_categories`, `service_catalog_repair_groups`, `service_catalog_repair_items`: Task 148 service catalog foundation for repair groups/items.
- `estimate_templates` and `estimate_template_lines`: current template foundation for inserting editable estimate lines.
- `service_request_invoices` and `service_request_invoice_items`: invoice foundation that snapshots approved estimate lines and does not mutate existing estimates.

Production-ready today:

- Estimate persistence, approval status, estimate numbers, and customer approval pages.
- Invoice table foundation from approved estimates.
- Estimate line snapshots and customer/internal naming fields.

Partial or legacy:

- `pricing_catalog_items` is too narrow for the future finance system. It remains intact for current estimate compatibility but is not the long-term canonical Price Book.
- Estimate templates exist but do not provide company-wide governance, duplicate prevention, approval, merge, or reusable bundle rules.
- Invoice/payment flow is not complete enough for Workiz exit and must not be extended before Price Book and manual estimate builder are stable.

## New Price Book Architecture

Migration:

`supabase/migrations/0066_price_book_foundation_apply_ready.sql`

New tables:

- `price_book_appliance_groups`
- `price_book_appliance_group_types`
- `price_book_items`
- `price_book_item_aliases`
- `price_book_bundle_items`
- `price_book_item_merge_history`

Supported item types:

- Labor
- Part
- Service
- Fee
- Bundle

Supported appliance groups:

- Cooling
- Laundry
- Cooking
- Dishwashing
- General

The model supports company-owned rows and system/default rows. System rows have `company_id = null`; company rows are scoped to one company.

## Price Book Item Fields

`price_book_items` supports:

- company scope
- item type
- name and normalized name
- description
- appliance group
- optional appliance type
- optional brand
- default quantity and unit
- labor price
- part price
- total price
- pricing strategy
- taxable/default tax behavior
- warranty text
- estimated duration
- internal notes
- customer-facing description
- AI/search keywords
- active/inactive
- review status
- canonical item reference for merges
- created/approved metadata
- usage count foundation

## Bundle Foundation

Bundles are reusable `price_book_items` with child rows in `price_book_bundle_items`.

Bundle child rows support:

- ordered child items
- default quantity
- optional/required flags
- bundled price override
- item-level price behavior
- hidden internal items
- customer-facing expanded description

This does not implement estimate expansion yet. It only makes future estimate behavior possible without redesign.

## Duplicate Prevention

Duplicate prevention exists in two layers:

- database uniqueness for active exact normalized duplicates within company/system scope, item type, and appliance group;
- server-side duplicate preview in `/api/settings/price-book` using normalized name, aliases, token overlap, same item type, and same appliance group.

The Settings UI shows:

- Similar items already exist
- Use existing
- Request New Item
- Create Anyway for managers only
- Cancel

Technician/dispatcher-created unique rows can be stored as `pending`. Company managers can create approved items directly.

## Governance

Review statuses:

- Pending
- Approved
- Rejected
- Merged
- Archived

Managers can approve, reject, archive, and edit. Merge support is represented in schema through `canonical_item_id` and `price_book_item_merge_history`; full merge UI can be expanded later.

Historical estimate and invoice rows are not rewritten.

## Settings UI

Location:

`Settings -> Price Book`

Files:

- `frontend/src/app/api/settings/price-book/route.ts`
- `frontend/src/components/dashboard/PriceBookSettings.tsx`
- `frontend/src/app/dashboard/settings/page.tsx`

The browser does not write directly to Supabase tables. The UI uses `/api/settings/price-book`, which verifies the dashboard session and uses the server-side service-role client for trusted writes.

## Initial Seed

The seed is intentionally small and idempotent.

General:

- Diagnostic Fee
- Trip Charge
- Maintenance
- After Hours Fee

Cooling:

- Replace Compressor
- Replace Evaporator Fan
- Replace Condenser Fan
- Replace Thermostat
- Replace Defrost Heater
- Replace Main Control Board
- Sealed System Diagnostic
- Refrigerant Leak Test

Laundry:

- Replace Heating Element
- Replace Drain Pump
- Replace Water Inlet Valve
- Replace Belt
- Replace Thermal Fuse
- Replace Door Lock

Dishwasher:

- Replace Drain Pump
- Replace Circulation Pump
- Replace Water Inlet Valve
- Clear Drain System

Cooking:

- Replace Bake Element
- Replace Igniter
- Replace Temperature Sensor
- Replace Control Board

Bundles:

- Dryer Not Heating Repair
- Refrigerator Not Cooling Diagnostic
- Dishwasher Not Draining Repair
- LG Compressor Replacement

## What Task 166 Does Not Do

Task 166 does not:

- create Estimate UI;
- create Invoice UI;
- implement payments;
- implement deposits;
- alter approval flow;
- alter existing estimates;
- alter existing invoices;
- alter customer approval pages;
- create inventory, purchasing, or vendor workflow.

## Next Finance Step

Next implementation should be Phase 3 from the locked roadmap: Manual Estimate Builder using Price Book items and bundles.
