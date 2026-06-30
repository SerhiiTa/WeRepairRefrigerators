-- Task 102: Invoice foundation.
--
-- DEV/STAGING APPLY-READY.
-- Purpose:
--   Add the first invoice document layer after approved estimates. Invoices
--   snapshot estimate line items so future estimate changes never mutate an
--   existing invoice.
--
-- Security model:
--   - No anonymous invoice reads or writes.
--   - Authenticated dashboard users can read invoices only for service
--     requests they can already view.
--   - Mutations go through narrow SECURITY DEFINER RPCs.
--   - Invoice creation is allowed only from approved estimates.
--   - No service-role behavior or broad browser table writes are added.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.service_request_invoices (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null
    references public.service_requests(id)
    on delete cascade,
  estimate_id uuid not null
    references public.service_request_estimates(id)
    on delete restrict,
  created_by_profile_id uuid
    references public.profiles(id)
    on delete set null,
  invoice_number text not null,
  subtotal numeric(10, 2) not null default 0,
  tax numeric(10, 2),
  total numeric(10, 2) not null default 0,
  invoice_status text not null default 'draft',
  sent_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint service_request_invoices_number_not_blank_check
    check (length(btrim(invoice_number)) > 0),
  constraint service_request_invoices_status_check
    check (invoice_status in ('draft', 'sent', 'paid', 'void')),
  constraint service_request_invoices_subtotal_check
    check (subtotal >= 0 and subtotal <= 100000),
  constraint service_request_invoices_tax_check
    check (tax is null or (tax >= 0 and tax <= 100000)),
  constraint service_request_invoices_total_check
    check (total >= 0 and total <= 100000)
);

comment on table public.service_request_invoices is
  'Task 102 MVP invoices created from approved estimates. Not an accounting ledger or payment processor.';
comment on column public.service_request_invoices.estimate_id is
  'Source approved estimate. Invoice line items are copied as a snapshot and do not change if the estimate changes later.';

create unique index if not exists service_request_invoices_invoice_number_idx
  on public.service_request_invoices (invoice_number);
create unique index if not exists service_request_invoices_estimate_unique_idx
  on public.service_request_invoices (estimate_id);
create index if not exists service_request_invoices_request_created_idx
  on public.service_request_invoices (service_request_id, created_at desc);
create index if not exists service_request_invoices_status_idx
  on public.service_request_invoices (invoice_status, created_at desc);

drop trigger if exists set_service_request_invoices_updated_at
  on public.service_request_invoices;
create trigger set_service_request_invoices_updated_at
before update on public.service_request_invoices
for each row
execute function public.set_updated_at();

create table if not exists public.service_request_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null
    references public.service_request_invoices(id)
    on delete cascade,
  source_estimate_item_id uuid
    references public.service_request_estimate_items(id)
    on delete set null,
  item_title text not null,
  quantity integer not null default 1,
  unit_price numeric(10, 2) not null,
  line_total numeric(10, 2) not null,
  notes text,
  created_at timestamptz not null default now(),

  constraint service_request_invoice_items_title_not_blank_check
    check (length(btrim(item_title)) > 0),
  constraint service_request_invoice_items_quantity_check
    check (quantity > 0 and quantity <= 20),
  constraint service_request_invoice_items_unit_price_check
    check (unit_price >= 0 and unit_price <= 50000),
  constraint service_request_invoice_items_line_total_check
    check (line_total >= 0 and line_total <= 100000),
  constraint service_request_invoice_items_notes_length_check
    check (notes is null or char_length(notes) <= 1000)
);

comment on table public.service_request_invoice_items is
  'Task 102 invoice line item snapshots copied from estimate items.';

create index if not exists service_request_invoice_items_invoice_idx
  on public.service_request_invoice_items (invoice_id, created_at);

alter table public.service_request_invoices enable row level security;
alter table public.service_request_invoice_items enable row level security;

revoke all on public.service_request_invoices from public;
revoke all on public.service_request_invoice_items from public;

grant select on public.service_request_invoices to authenticated;
grant select on public.service_request_invoice_items to authenticated;

drop policy if exists "service_request_invoices_dashboard_select"
  on public.service_request_invoices;
create policy "service_request_invoices_dashboard_select"
on public.service_request_invoices
for select
to authenticated
using (public.can_view_service_request(service_request_id));

drop policy if exists "service_request_invoice_items_dashboard_select"
  on public.service_request_invoice_items;
create policy "service_request_invoice_items_dashboard_select"
on public.service_request_invoice_items
for select
to authenticated
using (
  exists (
    select 1
    from public.service_request_invoices invoice
    where invoice.id = invoice_id
      and public.can_view_service_request(invoice.service_request_id)
  )
);

create or replace function public.create_invoice_from_estimate_rpc(
  p_estimate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate_row public.service_request_estimates;
  invoice_row public.service_request_invoices;
  line_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into estimate_row
  from public.service_request_estimates
  where id = p_estimate_id;

  if not found then
    raise exception 'Estimate was not found.' using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(estimate_row.service_request_id) then
    raise exception 'Estimate is not accessible for this account.' using errcode = '42501';
  end if;

  if estimate_row.estimate_status <> 'approved' then
    raise exception 'Invoice can only be created from an approved estimate.' using errcode = '42501';
  end if;

  select count(*)
  into line_count
  from public.service_request_estimate_items
  where estimate_id = estimate_row.id;

  if line_count = 0 then
    raise exception 'Approved estimate has no line items to invoice.' using errcode = '22023';
  end if;

  insert into public.service_request_invoices (
    service_request_id,
    estimate_id,
    created_by_profile_id,
    invoice_number,
    subtotal,
    tax,
    total,
    invoice_status
  )
  values (
    estimate_row.service_request_id,
    estimate_row.id,
    auth.uid(),
    'INV-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8)),
    estimate_row.subtotal,
    estimate_row.tax,
    estimate_row.total,
    'draft'
  )
  on conflict (estimate_id)
  do update
  set updated_at = public.service_request_invoices.updated_at
  returning * into invoice_row;

  if not exists (
    select 1
    from public.service_request_invoice_items
    where invoice_id = invoice_row.id
  ) then
    insert into public.service_request_invoice_items (
      invoice_id,
      source_estimate_item_id,
      item_title,
      quantity,
      unit_price,
      line_total,
      notes
    )
    select
      invoice_row.id,
      item.id,
      item.item_title,
      item.quantity,
      item.unit_price,
      item.line_total,
      item.notes
    from public.service_request_estimate_items item
    where item.estimate_id = estimate_row.id
    order by item.created_at asc;

    insert into public.service_request_notes (service_request_id, created_by_profile_id, note_type, body)
    values (
      invoice_row.service_request_id,
      auth.uid(),
      'estimate',
      'Invoice ' || invoice_row.invoice_number || ' was created from approved estimate '
        || estimate_row.estimate_number || '.'
    );
  end if;

  return jsonb_build_object(
    'id', invoice_row.id,
    'invoice_number', invoice_row.invoice_number,
    'service_request_id', invoice_row.service_request_id,
    'estimate_id', invoice_row.estimate_id,
    'subtotal', invoice_row.subtotal,
    'tax', invoice_row.tax,
    'total', invoice_row.total,
    'invoice_status', invoice_row.invoice_status,
    'created_at', invoice_row.created_at,
    'updated_at', invoice_row.updated_at,
    'line_count', line_count
  );
end;
$$;

comment on function public.create_invoice_from_estimate_rpc(uuid) is
  'Task 102. Creates a draft invoice snapshot from an accessible approved estimate.';

create or replace function public.send_service_request_invoice_rpc(
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.service_request_invoices;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into invoice_row
  from public.service_request_invoices
  where id = p_invoice_id;

  if not found then
    raise exception 'Invoice was not found.' using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(invoice_row.service_request_id) then
    raise exception 'Invoice is not accessible for this account.' using errcode = '42501';
  end if;

  if invoice_row.invoice_status <> 'draft' then
    raise exception 'Only draft invoices can be sent.' using errcode = '42501';
  end if;

  update public.service_request_invoices
  set invoice_status = 'sent', sent_at = now(), updated_at = now()
  where id = invoice_row.id
  returning * into invoice_row;

  insert into public.service_request_notes (service_request_id, created_by_profile_id, note_type, body)
  values (
    invoice_row.service_request_id,
    auth.uid(),
    'estimate',
    'Invoice ' || invoice_row.invoice_number || ' was marked sent.'
  );

  return jsonb_build_object(
    'id', invoice_row.id,
    'invoice_number', invoice_row.invoice_number,
    'invoice_status', invoice_row.invoice_status,
    'sent_at', invoice_row.sent_at,
    'updated_at', invoice_row.updated_at
  );
end;
$$;

comment on function public.send_service_request_invoice_rpc(uuid) is
  'Task 102. Marks an accessible draft invoice as sent. No SMS/email is sent in MVP.';

create or replace function public.mark_service_request_invoice_paid_rpc(
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.service_request_invoices;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into invoice_row
  from public.service_request_invoices
  where id = p_invoice_id;

  if not found then
    raise exception 'Invoice was not found.' using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(invoice_row.service_request_id) then
    raise exception 'Invoice is not accessible for this account.' using errcode = '42501';
  end if;

  if invoice_row.invoice_status not in ('draft', 'sent') then
    raise exception 'Only draft or sent invoices can be marked paid.' using errcode = '42501';
  end if;

  update public.service_request_invoices
  set invoice_status = 'paid', paid_at = now(), updated_at = now()
  where id = invoice_row.id
  returning * into invoice_row;

  update public.service_requests
  set status = 'completed', updated_at = now()
  where id = invoice_row.service_request_id;

  insert into public.service_request_notes (service_request_id, created_by_profile_id, note_type, body)
  values (
    invoice_row.service_request_id,
    auth.uid(),
    'estimate',
    'Invoice ' || invoice_row.invoice_number || ' was marked paid. Service request marked completed.'
  );

  return jsonb_build_object(
    'id', invoice_row.id,
    'invoice_number', invoice_row.invoice_number,
    'invoice_status', invoice_row.invoice_status,
    'paid_at', invoice_row.paid_at,
    'service_request_status', 'completed',
    'updated_at', invoice_row.updated_at
  );
end;
$$;

comment on function public.mark_service_request_invoice_paid_rpc(uuid) is
  'Task 102. Manually marks an accessible invoice paid and completes the service request.';

create or replace function public.void_service_request_invoice_rpc(
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.service_request_invoices;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select *
  into invoice_row
  from public.service_request_invoices
  where id = p_invoice_id;

  if not found then
    raise exception 'Invoice was not found.' using errcode = 'P0002';
  end if;

  if not public.can_view_service_request(invoice_row.service_request_id) then
    raise exception 'Invoice is not accessible for this account.' using errcode = '42501';
  end if;

  if invoice_row.invoice_status = 'paid' then
    raise exception 'Paid invoices cannot be voided in the MVP workflow.' using errcode = '42501';
  end if;

  if invoice_row.invoice_status = 'void' then
    return jsonb_build_object(
      'id', invoice_row.id,
      'invoice_number', invoice_row.invoice_number,
      'invoice_status', invoice_row.invoice_status,
      'voided_at', invoice_row.voided_at,
      'updated_at', invoice_row.updated_at
    );
  end if;

  update public.service_request_invoices
  set invoice_status = 'void', voided_at = now(), updated_at = now()
  where id = invoice_row.id
  returning * into invoice_row;

  insert into public.service_request_notes (service_request_id, created_by_profile_id, note_type, body)
  values (
    invoice_row.service_request_id,
    auth.uid(),
    'estimate',
    'Invoice ' || invoice_row.invoice_number || ' was voided.'
  );

  return jsonb_build_object(
    'id', invoice_row.id,
    'invoice_number', invoice_row.invoice_number,
    'invoice_status', invoice_row.invoice_status,
    'voided_at', invoice_row.voided_at,
    'updated_at', invoice_row.updated_at
  );
end;
$$;

comment on function public.void_service_request_invoice_rpc(uuid) is
  'Task 102. Voids an accessible unpaid invoice while preserving read-only history.';

revoke all on function public.create_invoice_from_estimate_rpc(uuid) from public;
revoke all on function public.send_service_request_invoice_rpc(uuid) from public;
revoke all on function public.mark_service_request_invoice_paid_rpc(uuid) from public;
revoke all on function public.void_service_request_invoice_rpc(uuid) from public;

grant execute on function public.create_invoice_from_estimate_rpc(uuid) to authenticated;
grant execute on function public.send_service_request_invoice_rpc(uuid) to authenticated;
grant execute on function public.mark_service_request_invoice_paid_rpc(uuid) to authenticated;
grant execute on function public.void_service_request_invoice_rpc(uuid) to authenticated;
