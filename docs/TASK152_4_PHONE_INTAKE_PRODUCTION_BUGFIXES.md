# Task 152.4 Phone Intake Production Bug Fixes

Task 152.4 fixes production issues found after migration `0056` was applied and a real Retell call was tested.

No additional paid Retell call was performed for this task.

## Scope

- Fix Retell address parsing for comma-separated address, apartment/unit, and city text.
- Fix relative appointment date parsing so `today` and `tomorrow` use the Retell call start timestamp in `America/Chicago`.
- Fix natural-language appointment window parsing for `9 to 11 AM`, `9 AM to 11 AM`, `between 9 and 11`, `tomorrow morning between 9 and 11`, `from 9 to 11`, and `9-11 AM`.
- Add internal Retell recording playback support for dashboard users with access to the selected conversation.

## Address Parsing

Production issue:

`3306 South Fry Road, apartment 437, Katy`

Expected normalized fields:

- `service_address`: `3306 South Fry Road`
- `unit`: `apartment 437`
- `city`: `Katy`

Fix:

- `phone-normalization.ts` now scans every comma-separated address segment for unit markers such as `apt`, `apartment`, `unit`, `suite`, `ste`, and `#`.
- The remaining city-like segment is mapped to city instead of treating the apartment segment as the city.
- ZIP/state parsing remains conservative and does not invent missing fields.

## Date Parsing

Production issue:

Relative dates such as `tomorrow` could be evaluated against server/browser time instead of the call's actual Central-time start date.

Fix:

- Relative dates now use `call.start_timestamp` when available.
- Date-only values are calculated in `America/Chicago`.
- If Retell sends `tomorrow`, the date is resolved relative to the phone call start date, not deployment server time.

## Window Parsing

Production issue:

Human appointment windows could stay as display labels only or broaden to a generic morning window.

Fix:

- Natural-language ranges are parsed into structured `window_start_time` and `window_end_time`.
- Supported forms include:
  - `9 to 11 AM`
  - `9 AM to 11 AM`
  - `between 9 and 11`
  - `tomorrow morning between 9 and 11`
  - `from 9 to 11`
  - `9-11 AM`
- Ambiguous range text without AM/PM defaults to AM only for range extraction.
- Generic `morning` or `afternoon` labels no longer create broad structured windows unless an explicit range is present.

## Retell Recording Playback

Internal dashboard users can now load a Retell call recording for a selected Communications Hub conversation.

Architecture:

- Server-only helper: `frontend/src/server/communications/retell-recording.ts`
- Internal API route: `/api/communications/retell-recording`
- Internal audio proxy route: `/api/communications/retell-recording/audio`
- UI surface: `/dashboard/communications`

Safety:

- Uses `RETELL_API_KEY` server-side only.
- Does not expose Retell credentials to the browser.
- Does not expose direct Retell/S3 recording URLs to the browser.
- Streams audio through the internal proxy and forwards safe audio headers, including byte-range headers when the upstream recording supports them.
- Does not store audio in Supabase Storage.
- Does not make recordings customer-facing.
- Does not log transcripts, raw payloads, or secrets.
- The API first reads the selected conversation through the user's RLS-scoped dashboard session.

## Deterministic Cases

`frontend/src/server/communications/phone-normalization-cases.ts` captures the production regressions as deterministic cases for future regression checks.

Verified local cases:

- Address/unit/city parsing for `3306 South Fry Road, apartment 437, Katy`.
- `tomorrow` resolves from the Retell call start date in Central time.
- `9 to 11 AM` resolves to `09:00:00` / `11:00:00`.
- `tomorrow morning between 9 and 11` resolves to `09:00:00` / `11:00:00`.
- `9-11 AM` resolves to `09:00:00` / `11:00:00`.

## Migration Status

No new migration was required for Task 152.4.

Fresh phone intake records after deployment will use the improved normalizer. Existing already-ingested records are not rewritten by this task.

## Remaining Verification

After deployment, use existing production rows and `/dashboard/communications` to verify the internal recording panel loads metadata for Retell calls. A new paid Retell call is not required unless the owner wants to verify a fresh call with the updated parser.

Task 153 has not started.
