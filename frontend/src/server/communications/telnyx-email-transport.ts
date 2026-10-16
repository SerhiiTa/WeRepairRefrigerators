import 'server-only';
export function normalizeReceiptEmail(value: unknown): string | null {
    if (typeof value !== 'string')
        return null;
    const email = value.trim();
    return email.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(email) ? email : null;
}
export function emailConfiguration() {
    const configuredFrom = process.env.HOMEFIXOS_EMAIL_FROM?.trim();
    const replyTo = normalizeReceiptEmail(process.env.HOMEFIXOS_EMAIL_REPLY_TO);
    const key = process.env.TELNYX_API_KEY?.trim();
    const address = configuredFrom?.match(/^[^<>\r\n]+\s*<([^<>]+)>$/)?.[1] ?? configuredFrom;
    const from = normalizeReceiptEmail(address);
    if (!from || /[\r\n]/.test(configuredFrom ?? '') || !replyTo || !key || process.env.WRA_DISABLE_PROVIDER_CALLS === '1')
        return null;
    return { from, replyTo, key };
}
export type EmailPayload = {
    from: string;
    reply_to: string;
    to: string[];
    subject: string;
    html_body: string;
    text_body: string;
};
export type EmailDiagnostics = {
    category: 'provider_accepted' | 'provider_rejected' | 'provider_uncertain' | 'network_uncertain';
    httpStatus?: number;
    errorCode?: string;
    requestId?: string;
};
// Only structured identifiers are retained; never provider messages or response bodies.
function safeProviderCode(value: unknown): string | undefined {
    return typeof value === 'string' && /^(?:[0-9]{3,10}|[A-Z][A-Z0-9_]{2,47})$/.test(value) ? value : undefined;
}
function safeRequestId(value: unknown): string | undefined {
    return typeof value === 'string' && /^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|req_[A-Za-z0-9_-]{1,64})$/i.test(value) ? value : undefined;
}
export type EmailDiagnosticEvent = {
    stage: string;
    httpStatus?: number;
    errorCode?: string;
    requestId?: string;
    messageId?: string;
};
export function logEstimateEmailDiagnostic(deliveryId: unknown, event: EmailDiagnosticEvent, databaseErrorCode?: unknown) {
    // Allowlisted scalar fields only. Diagnostics must never affect delivery.
    try {
        console.info('[Estimate email]', {
            stage: event.stage,
            deliveryId: safeRequestId(deliveryId),
            httpStatus: event.httpStatus,
            errorCode: safeProviderCode(event.errorCode),
            requestId: safeRequestId(event.requestId),
            messageId: safeRequestId(event.messageId),
            databaseErrorCode: typeof databaseErrorCode === 'string' && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(databaseErrorCode) ? databaseErrorCode : undefined,
        });
    } catch { /* Logging must not change send outcomes. */ }
}
export type EmailResult = ({
    status: 'accepted';
    messageId: string;
} | {
    status: 'failed' | 'unknown';
    message: string;
}) & { diagnostics?: EmailDiagnostics };
export async function sendReceiptEmail(payload: EmailPayload, key: string, idempotencyKey: string, onDiagnostic?: (event: EmailDiagnosticEvent) => void): Promise<EmailResult> {
    const emit = (event: EmailDiagnosticEvent) => { try { onDiagnostic?.(event); } catch { /* Diagnostic observers cannot affect delivery. */ } };
    if (process.env.WRA_DISABLE_PROVIDER_CALLS === '1')
        return { status: 'failed', message: 'Email provider calls are disabled.' };
    try {
        emit({ stage: 'telnyx_request_initiated' });
        const response = await fetch('https://api.telnyx.com/v2/email_messages', {
            method: 'POST', signal: AbortSignal.timeout(12000),
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
            body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => null);
        const metadata = {
            httpStatus: response.status,
            errorCode: safeProviderCode(body?.errors?.[0]?.code),
            requestId: safeRequestId(response.headers.get('x-request-id')) ?? safeRequestId(body?.meta?.request_id),
        };
        emit({ stage: 'telnyx_response_received', ...metadata });
        if (response.status === 202 && typeof body?.data?.id === 'string' && body.data.id.length > 0 && body.data.id.length <= 160) {
            emit({ stage: 'provider_accepted', ...metadata, messageId: safeRequestId(body.data.id) });
            return { status: 'accepted', messageId: body.data.id, diagnostics: { ...metadata, category: 'provider_accepted' } };
        }
        const uncertain = response.status >= 500 || response.status === 409 || response.status === 408 || response.ok;
        const diagnostics: EmailDiagnostics = { ...metadata, category: uncertain ? 'provider_uncertain' : 'provider_rejected' };
        emit({ stage: diagnostics.category, ...diagnostics });
        console.warn('[Email transport]', diagnostics);
        if (uncertain)
            return { status: 'unknown', message: 'Delivery outcome is not confirmed. Do not resend until reviewed.', diagnostics };
        return { status: 'failed', message: response.status === 429 ? 'Email provider rate limit reached.' : 'Email provider rejected the request. Check sender configuration and recipient.', diagnostics };
    }
    catch {
        const diagnostics: EmailDiagnostics = { category: 'network_uncertain' };
        emit({ stage: diagnostics.category, ...diagnostics });
        console.warn('[Email transport]', diagnostics);
        return { status: 'unknown', message: 'Delivery outcome is not confirmed. Do not resend until reviewed.', diagnostics };
    }
}
