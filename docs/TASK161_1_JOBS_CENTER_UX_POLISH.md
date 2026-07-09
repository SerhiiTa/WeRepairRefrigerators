# Task 161.1 - Jobs Center UX Polish

## Purpose

Task 161.1 refines the Jobs Center without redesigning the system or adding new backend objects.

The Jobs Center should feel like the daily work manager, not a CRM inbox and not an Intake screen.

## Changes

- Mobile `/dashboard/leads` no longer shows the old CRM header with Public Site, Open Jobs, Marketplace Profile, Sign out, and Houston MVP.
- Mobile Jobs Center now shows a compact app header with WRA branding, company name, and a hamburger menu.
- New Job now opens a lightweight three-step wizard:
  1. Existing customer or new customer.
  2. Appliance, brand, model, and problem.
  3. Schedule now or later.
- The wizard reuses the existing authenticated intake and conversion backend internally. The user sees a job creation workflow; `intake_requests` remains an implementation detail.
- Job cards remain clickable objects and open the existing Job Workspace.
- The redundant Open button was removed from job cards.
- Compact card actions are limited to Call and Message.
- Cards can show linked communication indicators when existing conversation records are attached to the service request.

## Boundaries

- No Job Workspace redesign.
- No Customer CRM redesign.
- No Communications Hub redesign.
- No schema, migration, Retell, SMS, estimate, invoice, or provider work.
- No new communication tables.

## Remaining Work

- The New Job wizard still depends on the existing intake conversion path and existing duplicate handling.
- Real outbound SMS remains future work; Message is a compact device/message shortcut only.
- A future task can add richer dispatcher-created-job defaults, technician assignment, address autocomplete, and duplicate review inside the wizard.
