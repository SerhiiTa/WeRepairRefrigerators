/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { emailConfiguration, normalizeReceiptEmail, sendReceiptEmail } from '@/server/communications/telnyx-email-transport';
import { ensurePaymentReceipt } from './payment-receipts';
import { receiptEmailTemplate } from './receipt-email-template';
const table = 'service_request_payment_receipt_deliveries';
const fail = (message: string, status = 503) => ({ status, body: { ok: false, message } });
export async function receiptEmailRecipient(jobId: string) {
    const db = getSupabaseServiceRoleClient();
    if (!db)
        return null;
    const { data: job, error } = await db.from('service_requests').select('company_id,customer_id,customer_email').eq('id', jobId).maybeSingle();
    if (error || !job?.company_id)
        return null;
    if (job.customer_id) {
        const { data: customer } = await db.from('customers').select('email').eq('id', job.customer_id).eq('company_id', job.company_id).maybeSingle();
        const email = normalizeReceiptEmail(customer?.email);
        if (email)
            return email;
    }
    return normalizeReceiptEmail(job.customer_email);
}
function replay(row: any, fingerprint: string) {
    if (row.delivery_channel !== 'email' || row.delivery_metadata?.fingerprint !== fingerprint)
        return fail('This send request belongs to different receipt details.', 409);
    if (row.delivery_status === 'sent' || row.delivery_status === 'delivered')
        return { status: 200, body: { ok: true, deliveryId: row.id, deliveryStatus: row.delivery_status, idempotent: true, message: row.delivery_status === 'delivered' ? 'Delivered' : 'Accepted for sending' } };
    return fail(row.delivery_status === 'failed' ? 'This delivery failed. Review its history before starting a new send.' : 'This delivery is pending or its outcome is uncertain. Do not resend until reviewed.', 409);
}
// The unique (company_id,idempotency_key) insert is a one-shot claim. No lease expiry
// permits a second sender after a crash/timeout. SMS's existing finalizer is not used.
export async function deliverPaymentReceiptEmail(input: {
    jobId: string;
    paymentId: string;
    companyId: string;
    actorId: string;
    recipient: string;
    idempotencyKey: string;
    origin: string;
}) {
    const recipient = normalizeReceiptEmail(input.recipient);
    if (!recipient)
        return fail('Enter a valid customer email address.', 400);
    const db = getSupabaseServiceRoleClient() as any;
    if (!db)
        return fail('Receipt delivery is not configured.');
    const fingerprint = createHash('sha256').update(JSON.stringify([input.companyId, input.jobId, input.paymentId, recipient])).digest('hex');
    const lookup = () => db.from(table).select('*').eq('company_id', input.companyId).eq('idempotency_key', input.idempotencyKey).maybeSingle();
    const existing = await lookup();
    if (existing.error)
        return fail('Unable to check receipt delivery history.');
    if (existing.data)
        return replay(existing.data, fingerprint);
    const config = emailConfiguration();
    if (!config)
        return fail('Receipt email delivery is not configured.');
    let ensured: Awaited<ReturnType<typeof ensurePaymentReceipt>> | null = null;
    let receiptResult = await db.from('service_request_payment_receipts').select('*').eq('payment_id', input.paymentId).eq('service_request_id', input.jobId).eq('company_id', input.companyId).maybeSingle();
    if (receiptResult.error)
        return fail('Receipt is unavailable.');
    if (!receiptResult.data) {
        try {
            ensured = await ensurePaymentReceipt(input.paymentId);
        }
        catch {
            return fail('Receipt could not be prepared.');
        }
        receiptResult = await db.from('service_request_payment_receipts').select('*').eq('payment_id', input.paymentId).eq('service_request_id', input.jobId).eq('company_id', input.companyId).maybeSingle();
    }
    const receipt = receiptResult.data;
    if (receiptResult.error || !receipt)
        return fail('Receipt is unavailable.');
    const id = randomUUID();
    const claim = await db.from(table).insert({ id, company_id: input.companyId, service_request_id: input.jobId, payment_id: input.paymentId, receipt_id: receipt.id, initiated_by_profile_id: input.actorId, delivery_channel: 'email', recipient, delivery_status: 'pending', provider: 'telnyx-email', provider_status: 'preparing', idempotency_key: input.idempotencyKey, delivery_metadata: { manual_action: true, fingerprint, provider_key: id } }).select('id').single();
    if (claim.error) {
        if (claim.error.code === '23505') {
            const other = await lookup();
            if (!other.error && other.data)
                return replay(other.data, fingerprint);
        }
        return fail('Receipt delivery could not be reserved.');
    }
    let payload;
    try {
        ensured ??= await ensurePaymentReceipt(input.paymentId);
        const { data: job, error } = await db.from('service_requests').select('customer_name').eq('id', input.jobId).eq('company_id', input.companyId).single();
        if (error || !ensured.receipt_token)
            throw new Error('unavailable');
        payload = receiptEmailTemplate({ from: config.from, replyTo: config.replyTo, recipient, amount: receipt.amount, currency: receipt.currency, paidAt: receipt.paid_at, number: receipt.receipt_number, customerName: job?.customer_name ?? null, url: `${input.origin}/receipts/${ensured.receipt_token}` });
    }
    catch {
        await db.from(table).update({ delivery_status: 'failed', provider_status: 'preparation_failed', provider_error: 'Receipt email could not be prepared.', failed_at: new Date().toISOString() }).eq('id', id).eq('company_id', input.companyId);
        return fail('Receipt email could not be prepared.');
    }
    const snapshot = await db.from(table).update({ provider_status: 'sending', delivery_attempt_count: 1, last_attempt_at: new Date().toISOString(), delivery_metadata: { manual_action: true, fingerprint, provider_key: id, request: payload } }).eq('id', id).eq('company_id', input.companyId).eq('provider_status', 'preparing').select('id').single();
    if (snapshot.error || !snapshot.data)
        return fail('Receipt send reservation could not be confirmed.');
    const result = await sendReceiptEmail(payload, config.key, id);
    const accepted = result.status === 'accepted';
    const saved = await db.from(table).update({ delivery_status: accepted ? 'sent' : result.status === 'failed' ? 'failed' : 'pending', provider_status: accepted ? 'accepted' : result.status, provider_message_id: accepted ? result.messageId : null, provider_error: accepted ? null : result.message, sent_at: accepted ? new Date().toISOString() : null, failed_at: result.status === 'failed' ? new Date().toISOString() : null }).eq('id', id).eq('company_id', input.companyId).eq('provider_status', 'sending').select('id').single();
    if (saved.error || !saved.data)
        return fail('Provider outcome could not be recorded. Do not resend until reviewed.');
    if (!accepted)
        return fail(result.message, result.status === 'unknown' ? 409 : 502);
    return { status: 200, body: { ok: true, deliveryId: id, deliveryStatus: 'sent', message: 'Accepted for sending' } };
}
