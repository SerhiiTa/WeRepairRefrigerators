# Task 161.4 Jobs Center Layout Reset

Task 161.4 resets the Jobs Center from a dense CRM-style management page into a simpler month-based work list.

## Completed

- Removed the six-tile stats grid from the Jobs Center main surface.
- Reduced stats to three clean horizontal rows:
  - Today
  - Active
  - Gross
- Added previous/current/next month navigation.
- Default month is the current browser month.
- Job list now shows jobs for the selected month.
- Search remains on the main surface and searches customer, phone, address, ZIP, appliance, brand, model, and problem.
- Permanent Technician and Schedule dropdowns were removed from the main surface.
- Permanent status chips were removed from the main surface.
- Filters now live behind a compact filter button.
- Filter sheet includes:
  - Status
  - Tags
  - Team
  - Schedule status
- Tags are shown as unavailable because real job-tag data does not exist yet.
- Top actions are compact:
  - New Job `+`
  - Filter control
- New Job remains the existing customer-first single-screen form.
- Job cards are compact date-led rows:
  - Date
  - Time/window
  - Status
  - Customer/job name
  - Appliance/service type
  - Short problem
  - City/ZIP
  - Communication badges when real linked conversations exist
- Job card click still opens the existing Job Workspace.

## Gross

Gross means month-to-date gross for the selected month when safely available from existing paid invoice data.

If invoice/payment data is unavailable or incomplete, the UI shows `$0`.

Real gross, collected revenue, technician share, commission, and rate calculations remain future financial-engine work.

## Scope Guard

This task did not change:

- Retell
- Phone workflow
- Communications Hub
- Job Workspace
- Customer CRM
- SMS/email
- Estimates
- Invoices
- Payments
- Supabase schema
- Migrations
- Authentication

