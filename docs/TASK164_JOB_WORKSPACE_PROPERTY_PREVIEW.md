# Task 164 - Job Workspace Property Preview

Date: July 9, 2026

Status: UI-only Job Workspace Details enhancement.

## Purpose

Task 164 surfaces the Task 163 Property Intelligence infrastructure inside the Job Workspace without changing the backend, Supabase, HasData integration, status workflow, estimates, invoices, timeline, or the larger Job Workspace layout.

The preview gives technicians quick property context near the top of the Details/Overview tab while keeping the screen compact and operational.

## Location

Property Preview was added to:

- `frontend/src/components/dashboard/ServiceRequestDetail.tsx`

It appears in the `Overview` tab after the `Next action` card and before the customer/workflow cards.

## Data Flow

- The component reads the current job service address.
- If the job has no street/full service address, no provider request is made.
- If a usable address exists, the browser calls the existing internal route:
  - `/api/property-intelligence?address=...`
- The browser never calls HasData directly.
- The API route remains responsible for dashboard authentication, HasData access, normalization, and caching.

## Displayed Fields

The card displays only:

- Static map image, when available.
- Property/home photo, when available.
- Zestimate.
- Living area in square feet.
- Year built.

No beds, baths, schools, taxes, HOA, agent, listing status, price history, or other Zillow fields are shown.

## Empty And Failure Behavior

If the route returns `property: null`, the address is absent, or the provider lookup fails, the card shows a compact fallback:

- Map placeholder.
- Photo placeholder.
- `Property details unavailable`.
- A short prompt to confirm the service address.

No provider/API error is shown to the technician.

## Restrictions Preserved

Task 164 does not:

- Modify backend routes.
- Modify Supabase or migrations.
- Modify HasData configuration.
- Modify Retell, phone workflow, Communications Hub, Finance, Timeline, estimates, invoices, status logic, or appointment logic.
- Add new Job Workspace tabs or redesign the workspace.

## Future Work

Future Job Workspace restructuring can decide whether this card remains always visible, moves into a compact property strip, or becomes part of a larger Property Preview module. That future work should continue consuming `/api/property-intelligence` rather than adding browser-side provider calls.

## Task 164.1 Full Address QA

QA used service request `33a16f94-0176-4378-8c56-1344ddee9dc3` with service address:

`301 E 79th St, APT 23S, New York, NY 10075, US`

The full provider path was verified. HasData Zillow returns real property data when the server adapter sends a derived Zillow homes URL to the provider endpoint. The card displayed:

- Static map image.
- Property photo.
- Zestimate.
- `Sqft unavailable` because the provider returned living area as `0`.
- Year built.

Task 164.1 fixed the server adapter request shape and normalizer for the real HasData response. The browser still calls only `/api/property-intelligence`; no browser-side HasData calls were added.

## Task 164.2 Reliability And Mobile Layout

Reliability audit result:

- HasData Zillow Property API expects a Zillow property/search URL, not a plain street address.
- WRA currently derives a Zillow homes URL from the job service address and sends that URL to HasData server-side.
- This is a safe best-effort lookup, but it is not guaranteed to resolve every arbitrary address because Zillow may route, redirect, or fail to match some address-derived URLs.
- If HasData cannot resolve the address, returns an unsupported shape, times out, or returns a mismatched ZIP code, `/api/property-intelligence` returns `property: null`.
- The Job Workspace shows only the clean fallback and does not display provider/debug errors.

Mobile layout update:

- Mobile now prioritizes one large media area instead of two tiny thumbnails.
- If a property photo exists, mobile shows the photo.
- If no photo exists but a map exists, mobile shows the map.
- If neither exists, mobile shows a compact placeholder.
- Desktop can still show map + photo + stats side by side.
