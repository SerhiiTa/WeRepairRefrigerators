import 'server-only';
export function normalizeReceiptEmail(value: unknown): string | null {
    if (typeof value !== 'string')
        return null;
    const email = value.trim();
    return email.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(email) ? email : null;
}
export function emailConfiguration() {
    const from = process.env.HOMEFIXOS_EMAIL_FROM?.trim();
    const replyTo = normalizeReceiptEmail(process.env.HOMEFIXOS_EMAIL_REPLY_TO);
    const key = process.env.TELNYX_API_KEY?.trim();
    const address = from?.match(/^(?:[^<>\r\n]+ <)?([^<>]+)>?$/)?.[1];
    if (!from || /[\r\n]/.test(from) || !normalizeReceiptEmail(address) || !replyTo || !key || process.env.WRA_DISABLE_PROVIDER_CALLS === '1')
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
export type EmailResult = {
    status: 'accepted';
    messageId: string;
} | {
    status: 'failed' | 'unknown';
    message: string;
};
export async function sendReceiptEmail(payload: EmailPayload, key: string, idempotencyKey: string): Promise<EmailResult> {
    if (process.env.WRA_DISABLE_PROVIDER_CALLS === '1')
        return { status: 'failed', message: 'Email provider calls are disabled.' };
    try {
        const response = await fetch('https://api.telnyx.com/v2/email_messages', {
            method: 'POST', signal: AbortSignal.timeout(12000),
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
            body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => null);
        if (response.status === 202 && typeof body?.data?.id === 'string' && body.data.id.length > 0 && body.data.id.length <= 160)
            return { status: 'accepted', messageId: body.data.id };
        if (response.status >= 500 || response.status === 409 || response.status === 408 || response.ok)
            return { status: 'unknown', message: 'Delivery outcome is not confirmed. Do not resend until reviewed.' };
        return { status: 'failed', message: response.status === 429 ? 'Email provider rate limit reached.' : 'Email provider rejected the request. Check sender configuration and recipient.' };
    }
    catch {
        return { status: 'unknown', message: 'Delivery outcome is not confirmed. Do not resend until reviewed.' };
    }
}
