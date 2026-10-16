import type { EmailPayload } from '@/server/communications/telnyx-email-transport';
const escape = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function receiptEmailTemplate(input: {
    from: string;
    replyTo: string;
    recipient: string;
    amount: number | string;
    currency: string;
    paidAt: string;
    number: string;
    customerName: string | null;
    url: string;
}): EmailPayload {
    const url = new URL(input.url);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost'))
        throw new Error('Receipt link is unavailable.');
    if (!/^\/receipts\/[a-f0-9]{64}$/.test(url.pathname) || url.search || url.hash || url.username || url.password)
        throw new Error('Receipt link is unavailable.');
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !/^[a-z]{3}$/i.test(input.currency) || Number.isNaN(Date.parse(input.paidAt)))
        throw new Error('Receipt details are unavailable.');
    const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: input.currency }).format(amount);
    const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago', timeZoneName: 'short' }).format(new Date(input.paidAt));
    const greeting = input.customerName ? `Hello ${input.customerName},` : 'Hello,';
    const lines = [greeting, `Thank you. We received your payment of ${money}.`, `Receipt: ${input.number}`, `Payment date: ${date}`];
    return { from: input.from, reply_to: input.replyTo, to: [input.recipient], subject: 'Your Payment Receipt — HomeFix Appliance Repair',
        text_body: ['HomeFix Appliance Repair', ...lines, 'View Receipt:', input.url, `Questions? Reply to ${input.replyTo}.`].join('\n\n'),
        html_body: `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#172033"><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:560px;background:white"><tr><td style="padding:24px"><h1 style="font-size:22px">HomeFix Appliance Repair</h1>${lines.map(l => `<p style="line-height:1.6;overflow-wrap:anywhere">${escape(l)}</p>`).join('')}<p style="padding:14px 0"><a href="${escape(input.url)}" style="background:#0969ed;color:white;padding:14px 20px;border-radius:8px;text-decoration:none;display:inline-block">View Receipt</a></p><p>Questions? Reply to ${escape(input.replyTo)}.</p></td></tr></table></td></tr></table></body></html>` };
}
