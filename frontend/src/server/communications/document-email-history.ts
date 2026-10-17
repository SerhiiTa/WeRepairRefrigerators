import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export type DocumentViewSummary = { total: number; lastViewed: string | null; recent: string[] };
export type DocumentEmail = {
  engagement?: DocumentViewSummary;
  id: string; documentType: 'estimate' | 'invoice' | 'receipt'; jobId: string; jobNumber: string | null;
  sender: string; recipient: string; subject: string; preview: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';
  occurredAt: string; sentAt: string | null; url: string | null;
};
type Row = Record<string, unknown>;
const text = (v: unknown) => typeof v === 'string' ? v : '';
const object = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {};
// Plain text only; never let the generic message auto-linker expose snapshot URLs.
const safeText = (v: unknown) => text(v).replace(/https?:\/\/\S+/gi, '[document link]').replace(/[a-f0-9]{64}/gi, '[redacted]').replace(/<[^>]*>/g, '').slice(0, 6000);
export class EmailHistoryError extends Error {
  constructor(public status: number) { super(status === 403 ? 'Email history is not accessible.' : 'Email history is unavailable.'); }
}
type ReadResult = { data: unknown; error: unknown };
type ReadQuery = PromiseLike<ReadResult> & {
  range(from: number, to: number): ReadQuery;
  order(column: string): ReadQuery;
};
async function rows(query: ReadQuery): Promise<Row[]> {
  const all: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await query.order('id').range(offset, offset + 499);
    if (result.error) throw new EmailHistoryError(503);
    const page = Array.isArray(result.data) ? result.data as Row[] : [];
    all.push(...page);
    if (page.length < 500) return all;
  }
}
export function projectDocumentEmail(type: DocumentEmail['documentType'], d: Row, jobId: string, tokens: Row[], origin: string, now = Date.now()): DocumentEmail {
  const request = object(object(d.delivery_metadata).request);
  const original = text(request.text_body);
  let url: string | null = null;
  for (const candidate of original.match(/https?:\/\/[^\s<>"']+/g) ?? []) {
    try {
      const u = new URL(candidate);
      const route = type === 'estimate' ? 'estimates' : type === 'invoice' ? 'invoices' : 'receipts';
      const match = u.pathname.match(new RegExp(`^/${route}/([a-f0-9]{64})$`));
      if (!match || u.origin !== origin || u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) continue;
      const hash = createHash('sha256').update(match[1]).digest('hex');
      if (tokens.some(t => (t.token_hash ?? t.public_approval_token_hash) === hash &&
          !t.token_revoked_at && Date.parse(text(t.token_expires_at)) > now &&
          (type !== 'estimate' || (['sent', 'approved', 'declined'].includes(text(t.revision_status)) &&
            (t.customer_decision || t.estimate_status === 'sent'))))) { url = u.href; break; }
    } catch { /* Invalid snapshot links stay unavailable. */ }
  }
  const status = d.provider_status === 'bounced' ? 'bounced' :
    ['sent', 'delivered', 'failed'].includes(text(d.delivery_status)) ? d.delivery_status as 'sent' | 'delivered' | 'failed' : 'pending';
  return { id: `email:${type}:${text(d.id)}`, documentType: type, jobId, jobNumber: null,
    sender: safeText(request.from) || 'Unavailable', recipient: safeText(d.recipient),
    subject: safeText(request.subject) || 'Content unavailable.', preview: safeText(original) || 'Content unavailable.',
    status, occurredAt: text(d.sent_at) || text(d.created_at), sentAt: text(d.sent_at) || null, url };
}

// Uses the caller's authenticated client throughout: RLS applies to every read.
export async function readDocumentEmailHistory(db: SupabaseClient, conversationId: string, publicOrigin: string | undefined, smsEngagement?: Record<string, DocumentViewSummary>): Promise<DocumentEmail[]> {
  const access = await db.rpc('can_access_communication_conversation', { target_conversation_id: conversationId });
  if (access.error || access.data !== true) throw new EmailHistoryError(403);
  const conversations = await rows(db.from('communication_conversations').select('id,company_id,customer_id,service_request_id').eq('id', conversationId));
  const c = conversations[0];
  if (!c?.company_id) throw new EmailHistoryError(403);
  let customerId = text(c.customer_id);
  if (c.service_request_id) {
    const linked = await rows(db.from('service_requests').select('id,company_id,customer_id').eq('id', c.service_request_id).eq('company_id', c.company_id));
    if (linked.length !== 1 || !linked[0].customer_id || (customerId && customerId !== linked[0].customer_id)) throw new EmailHistoryError(403);
    customerId = text(linked[0].customer_id);
  }
  if (!customerId) return [];
  const customers = await rows(db.from('customers').select('id').eq('id', customerId).eq('company_id', c.company_id));
  if (customers.length !== 1) throw new EmailHistoryError(403);
  const jobs = await rows(db.from('service_requests').select('id,job_number').eq('company_id', c.company_id).eq('customer_id', customerId));
  const jobIds = jobs.map(j => text(j.id));
  if (!jobIds.length) return [];
  for (const jobId of jobIds) {
    const jobAccess = await db.rpc('can_view_service_request', { target_service_request_id: jobId });
    // Job rows already passed RLS; explicit check must also succeed.
    if (jobAccess.error || jobAccess.data !== true) throw new EmailHistoryError(403);
  }
  let origin = '';
  try { const u = new URL(publicOrigin ?? ''); if (u.protocol === 'https:' && !u.username && !u.password) origin = u.origin; } catch { /* Links disabled. */ }
  const result: DocumentEmail[] = [];
  const bindings: ViewBinding[] = [];
  const deliveryColumns = 'id,recipient,delivery_status,provider_status,delivery_metadata,sent_at,created_at';
  const revisions = await rows(db.from('service_request_estimate_revisions').select('id,estimate_id,service_request_id,company_id,revision_status,customer_decision,public_approval_token_hash,token_expires_at,token_revoked_at').eq('company_id', c.company_id).in('service_request_id', jobIds));
  if (revisions.length) {
    const estimates = await rows(db.from('service_request_estimates').select('id,service_request_id,estimate_status').in('service_request_id', jobIds));
    const deliveries = await rows(db.from('service_request_estimate_revision_deliveries').select(`${deliveryColumns},revision_id,delivery_channel,provider,communication_message_id`).in('revision_id', revisions.map(r => r.id)).in('delivery_channel', smsEngagement ? ['email', 'sms'] : ['email']));
    for (const d of deliveries) {
      const r = revisions.find(r => r.id === d.revision_id);
      const e = estimates.find(e => e.id === r?.estimate_id && e.service_request_id === r?.service_request_id);
      if (!r || !e) throw new EmailHistoryError(403);
      const email = projectDocumentEmail('estimate', d, text(r.service_request_id), [{ ...r, estimate_status: e.estimate_status }], origin);
      const active = !r.token_revoked_at && Date.parse(text(r.token_expires_at)) > Date.now() &&
        ['sent', 'approved', 'declined'].includes(text(r.revision_status)) && (r.customer_decision || e.estimate_status === 'sent');
      if (smsEngagement && active && (d.delivery_channel === 'sms' || email.url)) bindings.push({ type: 'estimate', ref: text(r.id), document: text(e.id), job: text(r.service_request_id), message: d.delivery_channel === 'sms' ? text(d.communication_message_id) : email.id });
      if (d.delivery_channel === 'email' && d.provider === 'telnyx-email') result.push(email);
    }
  }
  for (const type of ['invoice', 'receipt'] as const) {
    const table = type === 'invoice' ? 'service_request_invoice_deliveries' : 'service_request_payment_receipt_deliveries';
    const key = type === 'invoice' ? 'invoice_id' : 'receipt_id';
    const deliveries = await rows(db.from(table).select(`${deliveryColumns},company_id,service_request_id,${key}${type === 'invoice' ? ',invoice_token_id,communication_message_id' : ''},delivery_channel,provider`).eq('company_id', c.company_id).in('service_request_id', jobIds).in('delivery_channel', smsEngagement && type === 'invoice' ? ['email', 'sms'] : ['email']));
    if (!deliveries.length) continue;
    const documents = await rows(db.from(type === 'invoice' ? 'service_request_invoices' : 'service_request_payment_receipts')
      .select(`id,service_request_id${type === 'invoice' ? ',invoice_status,invoice_lifecycle_status' : ''}`)
      .in('service_request_id', jobIds));
    const tokenTable = type === 'invoice' ? 'service_request_invoice_delivery_tokens' : 'service_request_payment_receipt_tokens';
    const tokens = await rows(db.from(tokenTable).select(`id,company_id,service_request_id,${key},token_hash,token_expires_at,token_revoked_at`).eq('company_id', c.company_id).in('service_request_id', jobIds));
    for (const d of deliveries) {
      const document = documents.find(doc => doc.id === d[key] && doc.service_request_id === d.service_request_id);
      if (!document) throw new EmailHistoryError(403);
      const documentActive = type !== 'invoice' || (document.invoice_status !== 'void' && (document.invoice_lifecycle_status ?? 'current') === 'current');
      const ownedTokens = tokens.filter(t => documentActive && t[key] === d[key] && t.service_request_id === d.service_request_id && (type !== 'invoice' || t.id === d.invoice_token_id));
      const email = projectDocumentEmail(type, d, text(d.service_request_id), ownedTokens, origin);
      const activeToken = ownedTokens.find(t => !t.token_revoked_at && Date.parse(text(t.token_expires_at)) > Date.now());
      if (smsEngagement && type === 'invoice' && activeToken && (d.delivery_channel === 'sms' || email.url)) bindings.push({ type, ref: text(activeToken.id), document: text(document.id), job: text(d.service_request_id), message: d.delivery_channel === 'sms' ? text(d.communication_message_id) : email.id });
      if (d.delivery_channel === 'email' && d.provider === 'telnyx-email') result.push(email);
    }
  }
  if (smsEngagement) {
    const messageRefs = new Map<string, string>();
    for (const binding of bindings) {
      if (!binding.message) continue;
      const ref = `${binding.type}:${binding.ref}`;
      if (messageRefs.has(binding.message) && messageRefs.get(binding.message) !== ref) throw new EmailHistoryError(403);
      messageRefs.set(binding.message, ref);
    }
    const summaries = await readViewSummaries(db, text(c.company_id), bindings);
    for (const binding of bindings) {
      const summary = summaries.get(`${binding.type}:${binding.ref}`);
      if (!summary || !binding.message) continue;
      const email = result.find(e => e.id === binding.message);
      if (email) email.engagement = summary;
      else smsEngagement[binding.message] = summary;
    }
  }
  return [...new Map(result.map(d => [d.id, { ...d, jobNumber: String(jobs.find(j => j.id === d.jobId)?.job_number ?? '') || null }])).values()].sort((a,b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}


type ViewBinding = { type: 'estimate' | 'invoice'; ref: string; document: string; job: string; message: string };
// Legacy embedded count is supported without enabling general PostgREST aggregates.
// Each batch returns one count and at most two timestamps per token/revision, never event/session IDs.
async function readViewSummaries(db: SupabaseClient, company: string, bindings: ViewBinding[]) {
  const summaries = new Map<string, DocumentViewSummary>();
  for (const type of ['estimate', 'invoice'] as const) {
    const refs = [...new Map(bindings.filter(b => b.type === type).map(b => [b.ref, b])).values()];
    const table = type === 'estimate' ? 'service_request_estimate_revisions' : 'service_request_invoice_delivery_tokens';
    const key = type === 'estimate' ? 'estimate_id' : 'invoice_id';
    for (let offset = 0; offset < refs.length; offset += 100) {
      const batch = refs.slice(offset, offset + 100);
      const { data, error } = await db.from(table)
        .select(`id,company_id,service_request_id,${key},stats:document_view_events(count),recent:document_view_events(viewed_at)`)
        .eq('company_id', company).in('id', batch.map(b => b.ref))
        .eq('stats.company_id', company).eq('recent.company_id', company)
        .eq('stats.document_type', type).eq('recent.document_type', type)
        .in('stats.service_request_id', batch.map(b => b.job)).in('recent.service_request_id', batch.map(b => b.job))
        .order('viewed_at', { referencedTable: 'recent', ascending: false })
        .limit(2, { referencedTable: 'recent' }).limit(100);
      if (error || !Array.isArray(data) || data.length !== batch.length) throw new EmailHistoryError(503);
      for (const row of data as unknown as Row[]) {
        const binding = batch.find(b => b.ref === row.id);
        if (!binding || row.company_id !== company || row.service_request_id !== binding.job || row[key] !== binding.document) throw new EmailHistoryError(403);
        const total = object(Array.isArray(row.stats) ? row.stats[0] : null).count;
        if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) throw new EmailHistoryError(503);
        const recent = (Array.isArray(row.recent) ? row.recent : []).map(r => text(object(r).viewed_at)).filter(t => Number.isFinite(Date.parse(t))).sort((a,b) => Date.parse(b)-Date.parse(a)).slice(0,2);
        if ((total > 0 && !recent.length) || (total === 0 && recent.length)) throw new EmailHistoryError(503);
        summaries.set(`${type}:${binding.ref}`, { total, lastViewed: recent[0] ?? null, recent });
      }
    }
  }
  return summaries;
}
