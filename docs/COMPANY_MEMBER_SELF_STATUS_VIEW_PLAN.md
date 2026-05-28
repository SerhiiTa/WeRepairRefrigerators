# Company Member Self-Status View Plan

## Purpose

Task 74 patches raw `company_members` self-read access so non-manager members do not read their own raw membership row.

If active, suspended, removed, inactive, or archived members need a user-facing membership explanation later, they should not regain raw `company_members` table access. Instead, expose a sanitized server-side view or RPC that returns only safe account status fields.

## Recommended Future Shape

Create a server-reviewed view or RPC such as:

- `company_member_self_status`
- `get_my_company_membership_status(company_id uuid)`

Safe fields:

- `company_id`
- company display name
- `member_status`
- `member_role`
- `joined_at`
- `removed_at`
- `suspended_at`
- `archived_at`
- short generic status message

Fields to exclude:

- `notes`
- internal reviewer notes
- invite token data
- audit metadata
- other member rows
- private company management fields

## Access Rules

- Authenticated user may read only their own sanitized status.
- Suspended/removed users may receive a safe status message, not raw row metadata.
- Company owners/managers/admins continue to use privileged management surfaces for full member review.
- The raw `company_members` table remains restricted by RLS and should not become the user-facing status API.

## Implementation Notes

This should be built only after onboarding server actions are introduced. Prefer a server action or RPC with explicit field selection and tests over broad raw table grants.
