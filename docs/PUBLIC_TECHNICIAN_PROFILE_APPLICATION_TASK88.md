# Task 88 — Public Technician Profile Application Status

## Status

Migration `0015` was manually applied by the user in Supabase SQL Editor.

Codex verified the view through the existing public anon Supabase path.

## Verification Performed

Using the existing public anon key only after manual application:

- `public.public_technician_profiles` returned `200`, so the view is reachable.
- The view returned `0` rows.
- Raw `public.technician_profiles` returned `401 / 42501 permission denied`, which is the correct privacy behavior for anonymous users.
- `/technicians` and `/technicians/marisol-reyes` still render the emergency mock fallback because no Supabase technician profile currently qualifies for the public view.

## Apply This Migration Manually

No further SQL migration application is needed for the view itself.

## Verify Public View

After applying:

```sql
select * from public.public_technician_profiles limit 5;
```

Expected:

- Query succeeds.
- Only sanitized public fields are returned.
- No `profile_id`, `company_id`, `bio_private`, email, phone, verification internals, suspension/rejection/archive fields, or audit/admin data appears.

## Ensure At Least One Public Row

At least one `technician_profiles` row must satisfy:

- `public_profile_ready = true`
- `marketplace_enabled = true`
- `technician_status = 'verified'`
- `archived_at is null`
- `rejected_at is null`
- `suspended_at is null`
- `display_name` or `business_name` is present

If `/technicians` still shows mock fallback, one or more of the required fields/flags above is missing on every technician profile row.

## Frontend Behavior

The frontend already prefers Supabase rows from `public.public_technician_profiles`.

If the view is absent or returns no rows, `/technicians` and `/technicians/[slug]` keep using the existing mock public technician previews as an emergency fallback.


## Task 89 Dev Public-Ready Profile

A dev/staging-only SQL patch was prepared at:

```text
supabase/migrations/0016_dev_public_ready_technician_profile_apply_ready.sql
```

It targets the existing dev profile `info@refrigeratorhoustonrepair.com`, updates or creates its `technician_profiles` row, and sets the public-view requirements:

- `technician_status = 'verified'`
- `marketplace_enabled = true`
- `public_profile_ready = true`
- non-archived, non-suspended, non-rejected state
- public-safe display/business/service fields

Codex did not apply this SQL. Apply it manually in Supabase SQL Editor, then run:

```sql
select slug, display_name, business_name, primary_city, primary_state
from public.public_technician_profiles
where business_name = 'Refrigerator Houston Repair';
```

Expected slug format:

```text
refrigerator-houston-repair-<8-char-id-hash>
```

After the view returns a row, `/technicians` should prefer real Supabase data and `/technicians/[slug]` should render the real public-safe detail page.
