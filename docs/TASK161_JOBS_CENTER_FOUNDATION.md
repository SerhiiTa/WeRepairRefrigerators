# Task 161 - Jobs Center Foundation

## Purpose

Task 161 turns the existing Jobs/Leads route into the daily Jobs Center for the Workiz Exit phase.

Customer is the relationship. Job is the work. Jobs Center manages the work.

## Scope

- Reuses the existing `/dashboard/leads` route.
- Reuses `service_requests`, appointments, existing statuses, filters, and Job Workspace routing.
- Does not redesign Job Workspace, Customer CRM, Communications Hub, estimates, invoices, Retell, SMS, Supabase, or schema.

## Jobs Center Behavior

The Jobs Center focuses on fast operational work:

- Compact counters for Today's Jobs, Active, Waiting Parts, Waiting Customer, and Completed Today.
- Search across customer, phone, email, address, ZIP, appliance, model, brand, problem, and technician.
- Technician and schedule filters.
- Horizontal status chips built from existing statuses currently present in the loaded jobs.
- Compact job cards showing customer, appliance, problem, time/date, status, assigned technician, city/ZIP, and last activity.
- Job cards open the existing Job Workspace at `/dashboard/leads/[id]`.
- Compact actions are limited to Call, Message, and Open.

## Navigation Position

Dashboard Jobs shortcut should route to Jobs Center. Communications and Customer CRM should continue linking real job objects into the existing Job Workspace through Jobs Center/Job Workspace routes instead of creating a duplicate work surface.

## Remaining Workiz Gaps

- New Job currently routes to the existing Intake surface; a future task can add a safer dispatcher-created job flow if needed.
- Message is a compact device `sms:` shortcut only; real SMS automation remains out of scope.
- Job ownership, bulk actions, advanced queues, drag-and-drop scheduling, and dispatcher board behavior remain future explicit tasks.
