-- Task 103: Service request address intelligence foundation.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Add structured customer address fields and a narrow authenticated RPC for
--   dashboard address edits without granting broad browser UPDATE access to
--   service_requests.
--
-- Security model:
--   - Anonymous users cannot read or update service request addresses.
--   - Authenticated dashboard users call a narrow RPC.
--   - The RPC reuses public.can_view_service_request(request_id), so admins can
--     update all visible requests and eligible technician/company-owner roles
--     can update only requests selected for their own public technician slug.
--   - Only address/navigation fields and updated_at are changed.
--   - Customer contact, issue details, technician selection, source, status,
--     estimate, invoice, note, and photo data are not writable through this RPC.

alter table public.service_requests
  add column if not exists full_address text,
  add column if not exists street_address text,
  add column if not exists unit text,
  add column if not exists country text not null default 'US',
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists place_id text;

comment on column public.service_requests.full_address is
  'Private formatted customer address for technician routing. Do not expose publicly.';
comment on column public.service_requests.street_address is
  'Private customer street address for service visit routing. Do not expose publicly.';
comment on column public.service_requests.unit is
  'Private apartment/unit/gate/location detail. Do not expose publicly.';
comment on column public.service_requests.latitude is
  'Optional geocoded latitude for future dispatcher routing and travel-time scheduling.';
comment on column public.service_requests.longitude is
  'Optional geocoded longitude for future dispatcher routing and travel-time scheduling.';
comment on column public.service_requests.place_id is
  'Optional provider place identifier. Store provider IDs only, never provider secret keys.';

create index if not exists service_requests_zip_city_state_idx
  on public.service_requests (zip_code, city, state);

create index if not exists service_requests_coordinates_idx
  on public.service_requests (latitude, longitude)
  where latitude is not null and longitude is not null;

create or replace function public.format_service_request_full_address(
  p_street_address text,
  p_unit text,
  p_city text,
  p_state text,
  p_zip_code text,
  p_country text
)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    concat_ws(
      ', ',
      nullif(btrim(coalesce(p_street_address, '')), ''),
      nullif(btrim(coalesce(p_unit, '')), ''),
      nullif(
        btrim(
          concat_ws(
            ' ',
            nullif(btrim(coalesce(p_city, '')), ''),
            nullif(btrim(coalesce(p_state, '')), ''),
            nullif(btrim(coalesce(p_zip_code, '')), '')
          )
        ),
        ''
      ),
      nullif(btrim(coalesce(p_country, '')), '')
    ),
    ''
  );
$$;

comment on function public.format_service_request_full_address(text, text, text, text, text, text) is
  'Task 103 helper. Formats private service request address fields for technician routing.';

create or replace function public.update_service_request_address_rpc(
  p_request_id uuid,
  p_street_address text,
  p_unit text,
  p_city text,
  p_state text,
  p_zip_code text,
  p_country text default 'US',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_place_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_street text := nullif(btrim(coalesce(p_street_address, '')), '');
  cleaned_unit text := nullif(btrim(coalesce(p_unit, '')), '');
  cleaned_city text := nullif(btrim(coalesce(p_city, '')), '');
  cleaned_state text := upper(nullif(btrim(coalesce(p_state, '')), ''));
  cleaned_zip text := regexp_replace(coalesce(p_zip_code, ''), '[^0-9]', '', 'g');
  cleaned_country text := upper(nullif(btrim(coalesce(p_country, '')), ''));
  cleaned_place_id text := nullif(btrim(coalesce(p_place_id, '')), '');
  formatted_address text;
  updated_request public.service_requests;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.'
      using errcode = '28000';
  end if;

  if not public.can_view_service_request(p_request_id) then
    raise exception 'Service request is not accessible for this account.'
      using errcode = '42501';
  end if;

  if cleaned_state is null or length(cleaned_state) <> 2 then
    raise exception 'State must be a 2-letter abbreviation.'
      using errcode = '22023';
  end if;

  if cleaned_zip !~ '^[0-9]{5}$' then
    raise exception 'ZIP code must be 5 digits.'
      using errcode = '22023';
  end if;

  if cleaned_country is null then
    cleaned_country := 'US';
  end if;

  if length(cleaned_country) <> 2 then
    raise exception 'Country must be a 2-letter country code.'
      using errcode = '22023';
  end if;

  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'Latitude is outside the valid range.'
      using errcode = '22023';
  end if;

  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'Longitude is outside the valid range.'
      using errcode = '22023';
  end if;

  if (p_latitude is null and p_longitude is not null)
    or (p_latitude is not null and p_longitude is null) then
    raise exception 'Latitude and longitude must be saved together.'
      using errcode = '22023';
  end if;

  formatted_address := public.format_service_request_full_address(
    cleaned_street,
    cleaned_unit,
    cleaned_city,
    cleaned_state,
    cleaned_zip,
    cleaned_country
  );

  update public.service_requests
  set
    street_address = cleaned_street,
    unit = cleaned_unit,
    city = cleaned_city,
    state = cleaned_state,
    zip_code = cleaned_zip,
    country = cleaned_country,
    full_address = formatted_address,
    latitude = p_latitude,
    longitude = p_longitude,
    place_id = cleaned_place_id,
    updated_at = now()
  where id = p_request_id
  returning * into updated_request;

  if not found then
    raise exception 'Service request was not found.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', updated_request.id,
    'full_address', updated_request.full_address,
    'street_address', updated_request.street_address,
    'unit', updated_request.unit,
    'city', updated_request.city,
    'state', updated_request.state,
    'zip_code', updated_request.zip_code,
    'country', updated_request.country,
    'latitude', updated_request.latitude,
    'longitude', updated_request.longitude,
    'place_id', updated_request.place_id,
    'updated_at', updated_request.updated_at
  );
end;
$$;

comment on function public.update_service_request_address_rpc(uuid, text, text, text, text, text, text, double precision, double precision, text) is
  'Task 103 RPC. Updates only private address/navigation fields after authenticated dashboard visibility checks.';

revoke all on function public.format_service_request_full_address(text, text, text, text, text, text) from public;
revoke all on function public.update_service_request_address_rpc(uuid, text, text, text, text, text, text, double precision, double precision, text) from public;
grant execute on function public.update_service_request_address_rpc(uuid, text, text, text, text, text, text, double precision, double precision, text) to authenticated;

-- No service_requests UPDATE grant or UPDATE policy is added here. The RPC is
-- intentionally the only browser-callable address mutation path for this task.
