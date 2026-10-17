import { NextResponse } from 'next/server';
import { verifyTelnyxWebhookSignature } from '@/server/communications/telnyx-sms-transport';
import { applyDocumentEmailWebhookEvent, logEmailWebhookDiagnostic } from '@/server/finance/receipt-email-webhook';
export const runtime = 'nodejs';
export async function POST(request: Request) {
    const rawBody = await request.text();
    if (!verifyTelnyxWebhookSignature({ rawBody, signature: request.headers.get('telnyx-signature-ed25519'), timestamp: request.headers.get('telnyx-timestamp') }))
        return NextResponse.json({ ok: false }, { status: 401 });
    let body;
    try {
        body = JSON.parse(rawBody);
    }
    catch {
        return NextResponse.json({ ok: false }, { status: 400 });
    }
    try {
        const status = await applyDocumentEmailWebhookEvent(body);
        return NextResponse.json({ ok: status === 200 }, { status });
    }
    catch (error) {
        logEmailWebhookDiagnostic('handler_exception', undefined, body, error);
        return NextResponse.json({ ok: false }, { status: 503 });
    }
}
