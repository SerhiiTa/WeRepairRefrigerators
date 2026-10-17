/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';
import { getSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import { normalizeReceiptEmail } from '@/server/communications/telnyx-email-transport';
type DeliveryTable = 'service_request_payment_receipt_deliveries' | 'service_request_invoice_deliveries' | 'service_request_estimate_revision_deliveries';
export function logEmailWebhookDiagnostic(stage: string, table?: string, body?: any, error?: any) {
    const id = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ? value : undefined;
    try {
        console.info('[Email webhook]', {
            stage, table,
            eventId: id(body?.data?.id),
            messageId: id(body?.data?.payload?.id),
            databaseErrorCode: typeof error?.code === 'string' && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(error.code) ? error.code : undefined,
        });
    } catch { /* Diagnostics must not change webhook processing. */ }
}
const states: Record<string, string> = { queued: 'sent', sent: 'sent', deferred: 'sent', delivered: 'delivered', bounced: 'failed', failed: 'failed', cancelled: 'failed', daily_limit_exceeded: 'failed' };
// Only called after signature verification. Provider ID + recipient correlation is
// authoritative; no company or receipt IDs from the callback are trusted.
export async function applyReceiptEmailEvent(body: any): Promise<number> {
    return applyEmailEvent(body, "service_request_payment_receipt_deliveries");
}
export async function applyInvoiceEmailEvent(body: any): Promise<number> {
    return applyEmailEvent(body, "service_request_invoice_deliveries");
}
export async function applyEstimateEmailEvent(body: any): Promise<number> {
 return applyEmailEvent(body,'service_request_estimate_revision_deliveries');
}
async function applyEmailEvent(body: any, table: DeliveryTable): Promise<number> {
    const diagnostic = (stage: string, error?: any) => logEmailWebhookDiagnostic(stage, table, body, error);
    const event = body?.data;
    const kind = typeof event?.event_type === 'string' ? event.event_type.replace(/^email\./, '') : '';
    if (!Object.hasOwn(states, kind) || event.event_type !== `email.${kind}`) {
        diagnostic('event_ignored');
        return 200;
    }
    const payload = event.payload;
    const occurred = Date.parse(event.occurred_at);
    if (typeof event.id !== 'string' || !event.id || typeof payload?.id !== 'string' || !payload.id || !Number.isFinite(occurred)) {
        diagnostic('invalid_event_envelope');
        return 400;
    }
    const recipient = normalizeReceiptEmail(payload.to?.email);
    if (!recipient) {
        diagnostic('invalid_recipient_projection');
        return 400;
    }
    const db = getSupabaseServiceRoleClient() as any;
    if (!db) {
        diagnostic('database_client_unavailable');
        return 503;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
        const { data: row, error } = await db.from(table).select('*').eq('provider', 'telnyx-email').eq('delivery_channel', 'email').eq('provider_message_id', payload.id).maybeSingle();
        // The callback may arrive before the send response has been persisted.
        if (error || !row) {
            diagnostic(error ? 'delivery_lookup_failed' : 'delivery_not_found', error);
            return 503;
        }
        if (row.recipient.toLowerCase() !== recipient.toLowerCase()) {
            diagnostic('recipient_mismatch');
            return 400;
        }
        const metadata = row.delivery_metadata ?? {};
        const previous = Date.parse(metadata.email_event_at ?? '');
        if (metadata.email_event_id === event.id || (Number.isFinite(previous) && occurred < previous)) {
            diagnostic(metadata.email_event_id === event.id ? 'duplicate_ignored' : 'older_event_ignored');
            return 200;
        }
        // Terminal outcomes cannot regress to queue/sent; a later OOB bounce may
        // supersede delivered. Failed outcomes never become successful on a retry.
        if (row.delivery_status === 'failed' || (row.delivery_status === 'delivered' && states[kind] !== 'failed')) {
            diagnostic('terminal_state_preserved');
            return 200;
        }
        const at = new Date(occurred).toISOString();
        let update = db.from(table).update({
            delivery_status: states[kind], provider_status: kind,
            provider_error: states[kind] === 'failed' ? 'Email could not be delivered.' : null,
            ...(kind === 'delivered' ? { delivered_at: at } : {}),
            ...(states[kind] === 'failed' ? { failed_at: at } : {}),
            delivery_metadata: { ...metadata, email_event_id: event.id, email_event_at: at },
        }).eq('id', row.id).eq('provider_message_id', payload.id).eq('updated_at', row.updated_at);
        update = table === 'service_request_estimate_revision_deliveries' ? update.eq('revision_id', row.revision_id) : update.eq('company_id', row.company_id);
        const {data:updated,error:updateError} = await update.select('id').maybeSingle();
        if (updateError) {
            diagnostic('delivery_update_failed', updateError);
            return 503;
        }
        if (updated) {
            diagnostic('delivery_update_succeeded');
            return 200;
        }
        diagnostic('concurrent_update_conflict');
    }
    diagnostic('concurrent_update_exhausted');
    return 503;
}
