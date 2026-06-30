# Address Intelligence Foundation

## Summary

Task 103 adds the first structured address layer for service requests. The goal is to stop treating customer location as ZIP-only text and prepare the CRM for maps, dispatch, routing, technician assignment, and calendar travel-time optimization.

## Database

New forward-only migration:

- `supabase/migrations/0029_service_request_address_intelligence_apply_ready.sql`

The migration adds these `public.service_requests` fields:

- `full_address`
- `street_address`
- `unit`
- `country`
- `latitude`
- `longitude`
- `place_id`

Existing fields remain in use:

- `city`
- `state`
- `zip_code`

The migration also adds:

- `public.format_service_request_full_address(...)`
- `public.update_service_request_address_rpc(...)`

The RPC is intentionally narrow. It updates only address/navigation fields after checking `public.can_view_service_request(request_id)`. It does not grant broad browser `UPDATE` access on `service_requests`.

## CRM UI

`/dashboard/leads/[id]` now includes a compact Service Address card that shows:

- formatted address
- ZIP/city/state fallback when street address is missing
- coordinate state when available
- Google Maps link
- Apple Maps link
- Google Places autocomplete when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is configured
- manual edit mode for street, unit, city, state, ZIP, and country

No embedded map is included in this phase.

## Autocomplete Adapter

`frontend/src/lib/address-autocomplete.ts` defines the provider abstraction for address search providers:

- manual
- Google Places, currently supported through the browser-safe public env var `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- Mapbox
- Radar
- Apple
- internal provider

No provider secret keys are exposed to client code. If the Google key is missing, invalid, blocked, or the Places API fails, the UI stays usable in manual address mode.

Google Places selection fills:

- `street_address`
- `city`
- `state`
- `zip_code`
- `country`
- `latitude`
- `longitude`
- `place_id`

Manual fields remain editable after a suggestion is selected.

## Maps Behavior

Map links use coordinates when both latitude and longitude are present. If coordinates are missing, links fall back to the encoded formatted address.

## Future Use

These fields prepare the platform for:

- AI Dispatcher lead creation from call transcripts
- Telnyx/Retell call workflows
- ZIP and service-area matching
- nearest technician assignment
- route optimization
- calendar travel-time scheduling
- smarter open-job marketplace previews

## Manual SQL Step

Codex did not apply SQL. Apply this manually in dev/staging before expecting address saves to persist:

```bash
open -a TextEdit ./supabase/migrations/0029_service_request_address_intelligence_apply_ready.sql
```

Copy the full SQL into Supabase SQL Editor and run it once. Stop on any SQL error.

## Known Limitations

- Google Places is the first connected autocomplete/geocoding provider.
- Coordinates are stored when Google Places returns geometry, or when a future trusted workflow supplies them.
- Customer intake still primarily collects ZIP and issue details; full street address can be added from the CRM detail page.
- No route optimization, dispatch calendar, or technician assignment logic is implemented yet.
