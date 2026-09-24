# COM-05.2 Trusted Website Source Credential Architecture

## Status

Architecture/design checkpoint only. No API route, migration, secret, website change, Cloudflare Worker change, deployment, or Production data change is included in COM-05.2.

## 1. Current werepairsubzero.com Architecture

The current real flow is:

1. `werepairsubzero.com` static Next.js site on GitHub Pages.
2. Browser opens the booking form in `BookingModal.tsx`.
3. Browser submits booking fields to a Cloudflare Worker.
4. Cloudflare Worker validates required fields and allowed browser `Origin`.
5. Cloudflare Worker stores Telegram `BOT_TOKEN` and `CHAT_ID` as Cloudflare secrets.
6. Cloudflare Worker sends a Telegram notification server-side.

Telegram is notification-only long term. WRA must become the system of record.

The first real booking payload fields are:

- `name`
- `phone`
- `address`
- `zip`
- `issue`
- `date`
- `time`

The Worker can also derive:

- `source identity`
- `channel = booking_widget`
- `brand = Sub-Zero`
- `serviceType = Refrigerator Repair`
- `timezone = America/Chicago`

Browser-derived attribution can later include page URL, referrer, and UTM fields. Attribution is metadata, not authentication.

## 2. Target Worker to WRA Flow

Target future flow:

1. Browser booking form submits to the Cloudflare Worker.
2. Cloudflare Worker performs browser-facing checks such as required fields and allowed origin.
3. Cloudflare Worker adds trusted source configuration and signs/authenticates the request with a WRA ingestion credential stored as a Cloudflare secret.
4. Cloudflare Worker sends a server-to-server request to WRA.
5. WRA authenticates the integration credential.
6. WRA follows the verified credential to the linked `inbound_source`.
7. WRA treats that linked `inbound_source` as the authoritative source identity.
8. WRA derives `company_id` from WRA database records, never from browser payload.
9. WRA may normalize submitted domain/page/referrer/UTM data as attribution and optionally check it for diagnostics, but domain data does not authenticate or re-establish the source.
10. WRA constructs a `UnifiedInboundEvent`.
11. WRA passes the event to the COM-04 Unified Intake Gateway.
12. Communications / Intake become the operational owner.
13. Telegram may continue temporarily in parallel as a notification-only side effect from the Worker.

## 3. Trust Boundaries

### Public Browser Form

The browser is untrusted.

It may submit customer fields, page URL, referrer, UTM values, and other attribution metadata. It must not hold a WRA ingestion secret. It must not establish tenant identity.

### Website Backend / Cloudflare Worker

The Worker is the authenticated integration client.

It can store a WRA credential as a Cloudflare Worker secret. It can attach source identity and system-derived fields. It can call WRA server-to-server.

### WRA Ingestion Endpoint

WRA authenticates the integration credential, follows it to the authoritative linked `inbound_source`, derives `company_id`, rejects invalid or revoked credentials, and only then constructs/processes the trusted inbound event.

Origin checking on the Worker is useful browser-side filtering. It is not sufficient authentication for Worker to WRA.

COM-05 exact domain matching is source resolution. It is not credential authentication.

## 4. Recommended Credential Model

Use a simple machine-to-machine source credential model:

- public credential id
- random high-entropy secret shown/generated once
- hash of secret stored in WRA
- credential belongs to one `inbound_source`
- active/revoked state
- optional name/label for operators
- creation timestamp
- last-used timestamp
- revoked timestamp/reason
- rotated/replaced relationship where useful

Do not use one global WRA ingestion secret.

Do not store plaintext secrets in WRA.

Do not expose credential hashes or secret material through normal dashboard Supabase queries.

Compromise blast radius must be limited to the one credential/source. A leaked credential for Website A must not authenticate Website B or Company B.

## 5. Data Model Recommendation

Use a separate table rather than adding credential fields to `public.inbound_sources`.

Recommended table name:

`public.inbound_source_credentials`

Recommended columns:

- `id uuid primary key`
- `inbound_source_id uuid not null references public.inbound_sources(id) on delete cascade`
- `public_key text not null unique`
- `secret_hash text not null`
- `secret_hash_algorithm text not null`
- `label text`
- `is_active boolean not null default true`
- `last_used_at timestamptz`
- `last_used_ip inet`
- `created_at timestamptz not null default now()`
- `created_by uuid null references public.profiles(id) on delete set null`
- `revoked_at timestamptz`
- `revoked_by uuid null references public.profiles(id) on delete set null`
- `revocation_reason text`
- `metadata jsonb not null default '{}'::jsonb`

Rationale:

- `inbound_sources` remains the durable source registry.
- Credentials are operational integration material, not source attribution.
- A source may need multiple credentials later, for example staging/production Worker, rotation overlap, WordPress plugin plus booking widget, or migration between backends.
- Revocation and audit history are cleaner in a separate table.
- Credential rows can have stricter RLS/grants than normal source metadata.

COM-06 will require a forward-only migration to create this table and grants/policies.

## 6. Secret Hashing and Storage Strategy

WRA should generate or accept a high-entropy secret once.

Recommended shape:

- `public_key`: non-secret identifier such as `wra_src_live_<random>`
- `secret`: machine-generated high-entropy random token, minimum 32 random bytes encoded with base64url
- `secret_hash`: HMAC-SHA-256 digest stored by WRA
- `secret_hash_algorithm`: `hmac-sha256`

Recommended verification:

- Compute HMAC-SHA-256 over the raw secret using a WRA server-side pepper/key.
- Store the WRA pepper/key only in the WRA/Vercel server environment.
- Do not store the pepper/key in Supabase.
- Compare the stored digest and candidate digest with constant-time comparison.
- Never log raw secrets.
- Never return raw secrets after initial generation.
- Store the secret only in the integration backend secret manager, such as Cloudflare Worker secrets.

The credential secret is not a human password. Do not use bcrypt, Argon2, or a password-hashing alternative for the first implementation.

For Cloudflare Worker:

- Store WRA public key as a non-secret environment variable or secret.
- Store WRA secret as a Cloudflare Worker secret.
- Do not put either credential in `BookingModal`, `NEXT_PUBLIC_*`, Git, static export output, or browser JavaScript.

For future WordPress/custom integrations:

- Store the secret server-side in WordPress options/config or host secret manager.
- Do not expose it to frontend JavaScript.
- Server-side hook/plugin submits to WRA.

## 7. Authentication Request Contract

Future endpoint, conceptually:

`POST /api/public/inbound/website`

Recommended headers:

- `Authorization: WRA-Source <public_key>:<secret>`
- `Content-Type: application/json`

Alternative acceptable shape:

- `X-WRA-Source-Key: <public_key>`
- `X-WRA-Source-Secret: <secret>`

Prefer `Authorization` unless platform constraints make separate headers materially simpler.

Initial body for `werepairsubzero.com`:

```json
{
  "customer": {
    "name": "Customer Name",
    "phone": "(346) 555-0100"
  },
  "serviceAddress": {
    "formatted": "123 Main St, Houston, TX",
    "postalCode": "77001"
  },
  "requestedService": {
    "serviceType": "Refrigerator Repair",
    "applianceType": "Refrigerator",
    "brand": "Sub-Zero",
    "problemDescription": "Issue from form"
  },
  "requestedAppointment": {
    "date": "2026-10-01",
    "preferredWindow": "Morning 8am-12pm",
    "timezone": "America/Chicago"
  },
  "attribution": {
    "websiteDomain": "werepairsubzero.com",
    "landingPageUrl": "https://werepairsubzero.com/",
    "referrerUrl": "https://example.com/",
    "utm": {
      "source": "google",
      "medium": "cpc",
      "campaign": "subzero"
    }
  }
}
```

Do not accept `companyId` from the request body as tenant identity.

## 8. Source and Company Resolution Sequence

WRA request handling sequence:

1. Parse authentication header.
2. Look up `inbound_source_credentials.public_key`.
3. Reject missing credential.
4. Reject inactive or revoked credential.
5. Verify secret against `secret_hash`.
6. Load the credential-linked `inbound_sources` row.
7. Reject inactive source.
8. Verify source channel is appropriate for endpoint, such as `website_form`, `booking_widget`, or `lead_generator`.
9. Treat the linked `inbound_source` as the authoritative source identity.
10. Derive `company_id` from `inbound_sources.company_id`.
11. Optionally verify linked `communication_source_account_id` if source uses one.
12. Construct `UnifiedInboundEvent.source` using trusted database values:
    - `companyId`
    - `inboundSourceId`
    - `sourceKey`
    - `sourceName`
    - optional `sourceAccountId`
13. Normalize submitted/derived website domain, landing page, referrer, and UTM data as untrusted attribution metadata.
14. Optionally compare attribution domain to source `domain` / `allowed_domains` for diagnostics or consistency warnings.
15. Do not let attribution domain override the authenticated credential -> `inbound_source` relationship.
16. Pass the event to `processUnifiedInboundEvent`.
17. Update `last_used_at` and safe operational diagnostics.

## 9. Rotation and Revocation Model

Rotation:

1. Create a new credential for the same `inbound_source`.
2. Show the new secret once.
3. Add it to Cloudflare Worker secrets or the integration backend.
4. Deploy/update the integration backend.
5. Verify successful ingestion using the new credential.
6. Revoke the old credential.

Revocation:

1. Set `is_active = false`.
2. Set `revoked_at`, `revoked_by`, and optional `revocation_reason`.
3. Requests using that credential fail authentication.
4. The linked `inbound_source` can remain active if other credentials are still valid.

Source shutdown:

- Set `inbound_sources.is_active = false`.
- All credentials for that source should fail even if individually active.

## 10. Multi-Tenant Security Rules

- Credentials belong to exactly one `inbound_source`.
- `inbound_source` belongs to exactly one company.
- After `public_key + secret` verification succeeds, the credential-linked `inbound_source` is authoritative.
- WRA derives `company_id` exclusively from the authenticated linked `inbound_source`.
- Request body `companyId` must be ignored or treated only as an optional consistency check.
- A credential cannot be used to submit for another source.
- A credential cannot be used to submit for another company.
- Domain/page/referrer/UTM data may be normalized, stored as attribution, and optionally checked for diagnostics.
- Domain/page/referrer/UTM data is not authentication and must not override the authenticated credential -> `inbound_source` relationship.
- If diagnostic domain matching is performed, use exact normalized hostname matching only.
- No suffix matching, no partial matching, no broad wildcard matching in the first implementation.
- Browser-supplied attribution is never authentication.
- Normal authenticated dashboard users should not be able to read `secret_hash`.
- No anon table access is required.

## 11. Cloudflare Worker Credential Storage

For `werepairsubzero.com`, store the future WRA ingestion secret as Cloudflare Worker secrets:

- `WRA_INGESTION_PUBLIC_KEY`
- `WRA_INGESTION_SECRET`
- `WRA_INGESTION_ENDPOINT`

The Worker submits server-to-server to WRA.

The static Next.js site must not receive these values. Do not use `NEXT_PUBLIC_*`.

## 12. Future WordPress and Custom Integrations

The same credential model works for:

- Cloudflare Workers
- WordPress server-side hooks/plugins
- custom website backends
- future WRA booking widgets

WordPress/custom integrations should store the public key and secret server-side, submit to WRA from backend code, and keep browser forms unauthenticated with respect to WRA.

## 13. COM-06 Responsibilities

COM-06 should implement:

- public WRA website ingestion route
- credential verification against `inbound_source_credentials`
- authoritative trusted source/company resolution through credential -> `inbound_source`
- attribution domain normalization and optional diagnostics using COM-05 registry helper
- mapping first `werepairsubzero.com` fields into `UnifiedInboundEvent`
- server-side validation/sanitization of customer/request fields
- COM-04 gateway call
- safe response contract for Worker
- operational logging without raw secrets
- optional Telegram parallel notification remains outside WRA or temporary Worker behavior

COM-06 should not:

- trust browser `companyId`
- use submitted website domain, page URL, referrer, or UTM values to establish source identity
- store plaintext credentials
- expose secrets to browser JavaScript
- create Jobs directly unless later trusted booking rules explicitly allow it
- replace Intake review unless the later booking architecture says so

## 14. Migration Requirement for COM-06

A migration will be required for COM-06.

Reason: current `public.inbound_sources` represents source attribution and trustable source identity, but it does not store independent integration credentials, hashes, revocation state, or rotation/audit metadata.

The migration should create `public.inbound_source_credentials` or equivalent, with narrow grants and no anon table access.

## 15. Remaining Open Questions

- Decide whether credential management is admin-only SQL initially or exposed later in Settings.
- Decide whether first WRA endpoint path should be `/api/public/inbound/website` or `/api/inbound/website`.
- Decide exact Worker retry behavior and idempotency header/payload field for repeated submissions.
- Decide whether Telegram notification remains only in Worker or whether WRA later emits notifications after Intake creation.
