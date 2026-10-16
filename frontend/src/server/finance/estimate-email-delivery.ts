/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';
import { createHash } from 'node:crypto';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { emailConfiguration, normalizeReceiptEmail, sendReceiptEmail } from '@/server/communications/telnyx-email-transport';
const table = 'service_request_estimate_revision_deliveries';
export function estimateEmailOrigin() {
    try {
        const u = new URL(process.env.HOMEFIXOS_PUBLIC_ORIGIN ?? '');
        return u.protocol === 'https:' && !u.username && !u.password ? u.origin : null;
    }
    catch {
        return null;
    }
}
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function estimateEmailTemplate(from: string, replyTo: string, recipient: string, number: string, url: string) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !/^\/estimates\/[a-f0-9]{64}$/.test(parsed.pathname) || parsed.search || parsed.hash || parsed.username || parsed.password)
        throw Error('Invalid estimate link');
    const message = `Please review and approve your HomeFix Appliance Repair estimate ${number}.`;
    return { from, reply_to: replyTo, to: [recipient], subject: 'Your Estimate — HomeFix Appliance Repair', text_body: `${message}\n\nReview Estimate: ${url}\n\nQuestions? Reply to ${replyTo}.`, html_body: `<!doctype html><html><body style="font-family:Arial,sans-serif"><div style="max-width:560px;margin:auto;padding:24px"><h1>HomeFix Appliance Repair</h1><p>${escape(message)}</p><p><a href="${escape(url)}">Review Estimate</a></p><p>Questions? Reply to ${escape(replyTo)}.</p></div></body></html>` };
}
export async function sendEstimateEmail(input: {
    estimateId: string;
    recipient: string;
    idempotencyKey: string;
    userClient: any;
}) {
    const fail = (message: string, status = 503) => ({ status, body: { ok: false, message } });
    const config = emailConfiguration(), origin = estimateEmailOrigin();
    if (!config || !origin)
        return fail('Estimate email delivery is not configured.');
    const recipient = normalizeReceiptEmail(input.recipient);
    if (!recipient)
        return fail('Enter a valid customer email.', 400);
    if (input.idempotencyKey.length < 12 || input.idempotencyKey.length > 160)
        return fail('Invalid send identity.', 400);
    const db = getSupabaseServiceRoleClient() as any;
    if (!db)
        return fail('Estimate delivery is unavailable.');
    const fingerprint = createHash('sha256').update(JSON.stringify([input.estimateId, recipient])).digest('hex');
    const { data: r, error } = await input.userClient.rpc('reserve_estimate_email_delivery_rpc', { p_estimate_id: input.estimateId, p_recipient: recipient, p_idempotency_key: input.idempotencyKey, p_fingerprint: fingerprint });
    if (error || !r)
        return fail(error?.code === '42501' ? 'You are not authorized to send this estimate.' : error?.code === '55000' ? 'Previous email outcome requires review. Do not resend.' : 'Estimate email could not be reserved. Verify the email migration and estimate eligibility.', error?.code === '42501' ? 403 : 409);
    if (!r.claimed && (r.provider_error || r.review_required)) return fail("Previous email requires review. Do not resend automatically.",409);
    if (!r.claimed)
        return ['sent', 'delivered'].includes(r.delivery_status) ? { status: 200, body: { ok: true, message: r.delivery_status === 'delivered' ? 'Delivered' : 'Accepted for sending', deliveryStatus: r.delivery_status } } : fail('This send already has an attempt. Review its outcome before resending.', 409);
    const payload = estimateEmailTemplate(config.from, config.replyTo, recipient, r.estimate_number ?? '', `${origin}/estimates/${r.approval_token}`);
    const { data: claimed, error: claimError } = await db.from(table).update({ provider_status: 'sending', delivery_metadata: { manual_action: true, request: payload, provider_key: r.delivery_id } }).eq('id', r.delivery_id).eq('revision_id', r.revision_id).eq('provider_status', 'reserved').select('id').single();
    if (claimError || !claimed)
        return fail('Send reservation unavailable. Do not resend until reviewed.');
    const result = await sendReceiptEmail(payload, config.key, r.delivery_id);
    let finalized;
    try {
        const finalization = await db.rpc('finalize_estimate_email_delivery_rpc', { p_delivery_id: r.delivery_id, p_outcome: result.status, p_provider_message_id: result.status === 'accepted' ? result.messageId : null });
        if (finalization.error) throw new Error('Finalization failed');
        finalized = finalization.data;
    }
    catch {
        console.error('[Estimate email]', { stage: 'database_finalization_failed', providerOutcome: result.status, ...result.diagnostics });
        return fail('Provider outcome could not be recorded. Do not resend until reviewed.');
    }
    if (result.status !== 'accepted')
        return fail(result.message, result.status === 'unknown' ? 409 : 502);
    if (!finalized?.active) return fail('Provider accepted, but Estimate changed. Link remains inactive; staff review required.',409);
    return { status: 200, body: { ok: true, message: 'Accepted for sending', deliveryStatus: 'sent' } };
}
