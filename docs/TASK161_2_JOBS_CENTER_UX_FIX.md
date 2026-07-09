# Task 161.2 — Jobs Center UX Fix

Task 161.2 refines the Jobs Center for Workiz Exit daily use.

## Completed

- Removed the duplicated mobile Jobs Center header language. Mobile now shows a hamburger, logo, and one company label.
- Created a reusable dashboard mobile drawer component for Dashboard, Jobs Center, and future dashboard pages that need mobile navigation.
- Replaced the stepped New Job wizard with a single customer-first work order form.
- Kept intake as an internal implementation detail while the visible UI speaks in customer, job, work order, service address, schedule, and technician language.
- Reused the existing address autocomplete adapter for New Job service address entry.
- Added customer search by name, phone, email, and primary address, with existing-customer prefill when selected.
- Added a technician selector that defaults when only one verified technician profile is available.
- Tightened Jobs Center stat tiles and job cards so mobile and desktop use the available width without large empty card areas.
- Removed full address, large technician blocks, repeated labels, and the Open button from collapsed job cards.

## Current New Job Flow

The user sees one form:

1. Customer search or new customer fields.
2. Service address with existing address autocomplete.
3. Appliance, brand, model, serial, and problem.
4. Schedule now or later.
5. Assigned technician.
6. Create Job.

Internally, the existing intake create and conversion path is still reused. This avoids creating a duplicate customer/job architecture.

## Remaining Work

- The New Job form currently stores serial number in the internal raw job note context; a future asset-focused pass should persist serial number into the proper appliance/customer asset model when the workflow is expanded.
- The technician selector reads verified technician profiles. Future team management should add richer dispatcher assignment rules.
- Browser QA should confirm Google Places suggestions in the owner’s existing `localhost:3002` session because the local dev server is owner-managed.
