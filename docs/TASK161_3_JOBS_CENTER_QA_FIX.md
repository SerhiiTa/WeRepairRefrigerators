# Task 161.3 — Jobs Center QA Fixes

Task 161.3 resolves owner QA issues found after the customer-first Jobs Center pass.

## Completed

- Customer suggestions in New Job now stay hidden until the user types at least two characters or digits.
- Customer search checks name, phone, email, primary address, city, and ZIP.
- Phone entry and display now use readable US formatting while the create-job payload normalizes 10-digit US numbers to `+1XXXXXXXXXX`.
- Appliance and brand entry use shared option lists from `frontend/src/lib/appliance-options.ts` while still allowing custom values.
- The mobile drawer no longer waits on dashboard identity loading. It renders the known dashboard route list immediately and keeps the same slide/overlay behavior.
- Stats now render as six equal tiles: Today, Active, Waiting Parts, Waiting Customer, Completed Today, and Gross MTD.
- Gross MTD uses safely readable paid invoice totals from the current month. If invoice data is unavailable, it shows `$0`.
- The filter panel now clearly says `Filter jobs` and separates `Clear filters` from the primary `New Job` action.
- Job cards are more compact and remove large technician/last-activity blocks while keeping communication badges and Call/Message actions.

## Financial Note

Gross MTD currently means total paid/recorded invoice gross from the first day of the current month, based only on existing invoice data that the dashboard user can safely read.

Future invoice/payment work should define:

- company gross
- collected revenue
- technician share/rate settings
- owner versus technician views
- payment-provider settlement status

Task 161.3 does not implement technician share logic.

## Scope Guard

No Retell, phone webhook, SMS, estimates, invoices, payments, Supabase schema, migrations, Communications Hub redesign, Customer CRM redesign, or Job Workspace redesign work was added.
