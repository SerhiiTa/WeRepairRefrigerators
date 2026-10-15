# Notifications hybrid delivery — local preparation only

No Production SQL/env changes, scheduler activation or real sends performed.

## Activation prerequisites

Review/apply forward-only migration 0151 after 0150 under separate authorization.
Deploy the reviewed code separately. Configure the recovery job before relying on eventual delivery.
Existing pending real events become eligible; review backlog before activation. Synthetic pilot entries
remain excluded from general claim, cleanup and device fan-out. Existing pilot RPCs stay unchanged.

## cron-job.org (not created/enabled)

Existing project URL: https://werepairrefrigerators.vercel.app/api/notifications/worker
Method: POST. Body: {"mode":"recovery"}. Schedule: every minute.
Headers: Content-Type: application/json; Authorization: Bearer <existing CRON_SECRET>.
Enter the secret only in the scheduler's protected configuration; never in URL, logs or repository.
Disable response saving. No owner session, user token, Supabase key or VAPID private key is needed.
No additional token is required. Whoever holds CRON_SECRET can invoke the bounded general worker;
restrict scheduler access, and rotate the secret via an approved operation if compromised.
No Vercel Cron definition is added. cron-job.org's normal request timeout is 30 seconds.

## Canonical worker

Both event and recovery use processGeneralPush. Only Push adapter is registered; no SMS/Telegram.
Admission bound: 20 claims / 5 seconds, then finish the in-flight attempt. Each RPC has a 3-second
network deadline; adapter attempt has existing 10-second bound and HTTP send 7 seconds.
maxDuration stays 60 seconds for platform cleanup. Timeout/disconnection cannot cause blind resend:
leases and uncertain outcomes are quarantined by existing canonical accounting.
An after() callback is not durable. Lost fast-path wakeups are recovered only once the external job
is actually enabled. Provider acceptance does not prove device display.

## Coverage and latency

Fast path: verified Telnyx inbound message.received only, after the awaited message INSERT and
inbound-state RPC handler return. Duplicates only wake the same deduplicated queue.
Messages without matching source account (202), signature failures, persistence failures and
outbound delivery receipts do not trigger a wakeup. If later attachment/state work fails after an
INSERT committed, that notification remains queued for recovery.
All other 0147 events (missed calls, website requests, other customer replies, AI attention,
assignment, appointments, estimate/payment/refund events) use recovery; no invented transaction hooks.
Fast path normally starts after response completion; no fixed latency guarantee. Recovery normally
waits up to the next minute plus processing/provider time, longer with quiet hours, backoff, scheduler
outage or backlog. A run can handle at most 20 recipient deliveries (up to 10 devices each).
One shared job serves all companies, not one job per user/company. Per-company queue ranks plus least
recent claim order prevent a busy tenant monopolizing sequential turns. SKIP LOCKED protects concurrent
invocations. This is bounded shared capacity, not a claim of unlimited throughput: monitor oldest age
and load-test before thousands of companies; no production-scale benchmark was performed.

## Deep links

SMS/reply/AI/website/missed-call -> exact Conversation with view=detail. The existing Conversation
includes its call/timeline content; no unsupported call-history tab parameter is invented.
Assignment -> canonical Job route /dashboard/leads/{jobId}.
Appointments -> Job?tab=appointment.
Estimate approval -> Job?tab=finance&financeSection=estimates.
Payment/refund -> Job?tab=finance&financeSection=payments.
The service worker allows only these exact internal route/query shapes. No arbitrary redirect URL.
Existing login and tenant authorization remain in force. Existing auth gate does not guarantee
restoring this path after an expired-session login; no new auth/redirect system is introduced here.
Finance section query opens the matching mobile section and the desktop Payments accordion; existing editor-close guards remain in place.

## Observability / stop

Structured event/recovery logs contain counts only. Recovery metrics: pending, oldest age in seconds,
accepted device count, terminal failures, retry attempts, expired and revoked subscriptions.
No endpoints, tokens, customer content or contact details are logged.
Stop the external job and use existing WRA_DISABLE_PROVIDER_CALLS kill switch under separate env/deploy
authorization to stop both paths. Merely disabling the cron does not disable event wakeups.
Do not undo additive SQL or replay uncertain outcomes. Pilot cannot be swept by recovery.
