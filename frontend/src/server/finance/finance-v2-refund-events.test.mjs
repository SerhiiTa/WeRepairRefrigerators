import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (path) => readFileSync(path, 'utf8');
const sql = read('supabase/migrations/0145_finance_v2_refund_events_apply_ready.sql');
const foundation = read('supabase/migrations/0143_finance_v2_refund_financial_foundation_apply_ready.sql');
const functionText = (source, name) => {
  const start = source.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n$$;', start) + 4);
};
for (const name of ['confirm_service_request_payment_refund_rpc', 'confirm_stripe_service_request_payment_refund_rpc']) {
  test(`${name}: only adds Job-first locking, preserving all accounting and authorization`, () => {
    const current = functionText(sql, name);
    const first = current.indexOf('  -- Match reservation:');
    const end = current.indexOf('  select *\n  into refund_row', first);
    assert.ok(first >= 0 && end > first);
    assert.equal(current.slice(0, first) + current.slice(end), functionText(foundation, name));
    const locks = current.slice(first, end);
    assert.match(locks, /public.service_requests job[\s\S]*for update;[\s\S]*pg_advisory_xact_lock/);
    assert.match(locks, /507/);
  });
}
test('private canonical event writer has no accounting or refund mutations', () => {
  const writer = functionText(sql, 'ensure_confirmed_refund_events');
  assert.match(writer, /refund_row.refund_status <> 'succeeded'/);
  assert.match(writer, /company_id = refund_row.company_id/);
  assert.match(writer, /service_request_id = refund_row.service_request_id/);
  assert.doesNotMatch(writer, /update public\.|delete from|send_sms|send_email/);
  assert.match(sql, /ensure_confirmed_refund_events\(uuid, timestamptz\) from public, anon, authenticated, service_role/);
  assert.equal((sql.match(/on conflict \(refund_id\)/g) ?? []).length, 2);
  assert.match(sql, /old.refund_status = 'succeeded'/);
});
test('historical backfill is idempotent and does not invent confirmation time', () => {
  assert.match(sql, /coalesce\(p_confirmation_time, refund_row.created_at\)/);
  assert.match(sql, /exact confirmation time unavailable/);
  assert.match(sql, /where refund_status = 'succeeded'\s+order by service_request_id, payment_id, id/);
  assert.match(sql, /ensure_confirmed_refund_events\(historical_refund.id\)/);
  assert.match(sql, /payment_row.amount - coalesce\(payment_row.tip_amount, 0\)/);
  assert.match(sql, /then 'Full' else 'Partial'/);
  assert.match(sql, /select body, event_time into event_body, event_time_value/);
});
test('existing Communications and Timeline rendering contracts remain supported', () => {
  assert.match(read('frontend/src/lib/communications/timeline.ts'), /note_added: "Note added"/);
  assert.match(read('frontend/src/lib/communications/timeline.ts'), /payment_received: "Payment received"/);
  assert.match(read('frontend/src/components/dashboard/communications/CommunicationsHub.tsx'), /const timelineOnlyEvents: ThreadEvent\[\] = timelineEvents/);
  const job = read('frontend/src/components/dashboard/ServiceRequestDetail.tsx');
  assert.match(job, /notesState.notes.map/);
  assert.match(job, /body: note.body/);
  assert.match(sql, /'note_added', 'Refund confirmed'/);
  assert.match(sql, /'internal_note', event_body/);
  assert.doesNotMatch(sql, /create or replace function public.record_stripe_checkout_payment_rpc/);
});
