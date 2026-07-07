# Attention Engine And Company Modes

Task 157 defines how WRA should behave as a company grows from one person to a team to an enterprise operation.

This is an architecture document. It does not implement notifications, push, SMS, browser notifications, provider integrations, database changes, UI changes, or Communications Hub changes.

## 1. Purpose

WRA must grow with the service business.

A solo technician should not be forced to configure enterprise routing rules. A dispatcher-led company should gain role-aware operational routing when the team grows. An enterprise should support departments, branches, managers, dispatchers, accounting, and escalation without rebuilding the platform.

The operating model is:

```text
Operational Event
↓
Attention Engine
↓
Responsible Human
↓
Correct Workflow Surface
```

The Attention Engine is not a notification system.

The Attention Engine decides who needs to notice an operational event, how urgent it is, whether it can wait, whether it should be grouped with related work, and whether it should be ignored.

Delivery channels such as dashboard badges, browser notifications, mobile push, SMS, email, desktop alerts, and future voice are later outputs. They are not the core engine.

## 2. Company Operating Modes

### Mode 1: Solo

Solo mode is for one-person operations.

One user performs every role:

- Owner
- Dispatcher
- Technician
- Accounting
- AI Assistant reviewer

Default behavior:

- All operational attention routes to the solo user.
- No notification-routing setup is required.
- Settings should stay minimal.
- The system should favor one next action, mobile speed, and automatic defaults.
- The dashboard should answer: what do I need to do next?

Examples:

- Incoming phone call: solo user sees it.
- Estimate approved: solo user sees it.
- Customer waiting callback: solo user sees it.
- Payment received: solo user sees it.
- AI recommendation requiring review: solo user sees it.

Solo mode should be automatic when a company has one active operational user.

### Mode 2: Team

Team mode is for small and mid-sized service companies.

Typical roles:

- Owner
- Dispatcher
- Multiple technicians
- Office staff
- Optional accounting user

Default behavior:

- Attention routing becomes role-aware.
- Dispatch work goes to dispatchers or owners.
- Technician work goes to the assigned technician.
- Estimate/payment/accounting events may go to owner, dispatcher, or accounting depending on team setup.
- Settings should expose only simple routing choices that matter to this company size.

Examples:

- Incoming phone call: dispatcher queue.
- Customer SMS: dispatcher or assigned job owner.
- Technician running late: dispatcher and assigned technician.
- Estimate approved: assigned technician plus dispatcher.
- Payment received: owner/accounting, optionally dispatcher.
- Customer waiting: dispatcher queue.

Team mode should be suggested automatically when WRA detects multiple technicians, dispatcher roles, or office staff.

### Mode 3: Enterprise

Enterprise mode is for larger service organizations.

Typical structure:

- Departments
- Multiple dispatchers
- Accounting
- Managers
- Branches
- Territories
- Specialized teams
- Escalation owners

Default behavior:

- Attention routing is role-, branch-, department-, territory-, and workflow-aware.
- Events may route to queues rather than individual users.
- Escalation and fallback rules become important.
- Auditability and permissions matter more.
- Settings can expose advanced controls, but only to users responsible for operating them.

Examples:

- Incoming phone call: branch dispatch queue.
- Payment failure: accounting queue and branch manager.
- System failure: operations manager and technical admin.
- High-value estimate approved: branch manager, dispatcher, assigned technician.
- Missed call after hours: after-hours dispatcher queue or owner escalation.

Enterprise mode should not create a different product. It is the same WRA workflow with more routing capacity.

## 3. Attention Engine Model

Every operational event enters the Attention Engine.

Examples:

- Incoming phone call
- Customer SMS
- Website chat
- Website form
- Missed call
- Estimate approved
- Estimate declined
- Payment received
- Customer waiting
- Technician running late
- Appointment missed
- Return visit needed
- Parts received
- AI recommendation
- System failure

The engine asks:

- Who needs attention?
- How urgent is it?
- Can this wait?
- Is it already covered by another active event?
- Should it be grouped?
- Should it be ignored?
- Does it belong to a person, role, queue, department, branch, or company owner?
- Does the current company mode simplify or expand routing?

The engine should produce an attention decision, not necessarily a notification.

## 4. Priority Levels

### Critical

Requires immediate human awareness because the business may lose a customer, miss a job, create a safety issue, or fail a production workflow.

Examples:

- System failure blocking intake, login, booking, or estimate approval
- Customer canceled while technician is en route
- Emergency service request
- Payment or booking failure during customer checkout
- Live call handoff failure

### Urgent

Requires near-term action during the current operating window.

Examples:

- Missed call
- Customer waiting callback
- Technician running late
- Appointment needs reschedule
- Same-day customer reply
- Dispatcher review needed before booking

### Action Required

Requires action but can be handled in normal queue order.

Examples:

- Estimate approved
- Estimate needs follow-up
- Parts ordered
- Parts received
- Return visit needs scheduling
- Intake ready for review

### Informational

Useful context that should be visible in the appropriate timeline or workspace but does not require immediate interruption.

Examples:

- Payment received
- Invoice sent
- Appointment confirmation delivered
- Technician note added
- Recording available

### Background

System or learning events that should not interrupt normal users.

Examples:

- AI extraction completed
- Transcript parsed
- Deduplication checked
- Source payload normalized
- Provider webhook received

Background events may be available in developer/admin diagnostics when needed, but they do not belong in the normal technician workflow.

## 5. Future Delivery Channels

Delivery is separate from attention.

Future delivery channels may include:

- Dashboard queue
- Dashboard badge
- Browser notification
- Mobile push
- SMS
- Email
- Mobile app inbox
- Desktop app alert
- Future voice handoff

The Attention Engine should decide the attention target and urgency first. A later delivery layer decides how to surface it based on company mode, user role, user availability, user preferences, and business rules.

No delivery channels are implemented by this document.

## 6. Auto Evolution

WRA should evolve automatically as the company changes.

The owner should never be forced to configure features that do not yet matter.

Example evolution:

```text
Company created
↓
One user
↓
Automatically Solo Mode
```

```text
Second technician added
↓
Suggest Team Mode
↓
Enable technician-aware assignment and attention routing
```

```text
Dispatcher added
↓
Suggest operational routing
↓
Incoming calls, intake, callbacks, and scheduling attention can route to dispatch
```

```text
Accounting user added
↓
Enable financial routing
↓
Payment, invoice, refund, and failed-payment attention can route to accounting
```

```text
Branches or departments added
↓
Suggest Enterprise Mode
↓
Attention can route by branch, department, territory, queue, and escalation owner
```

The platform should explain what changed and allow the owner to accept defaults. It should not expose every enterprise control to a solo company.

## 7. Settings Direction

Future Settings should expose Company Mode as a simple operating model choice:

- Solo
- Team
- Enterprise

Settings should also support an automatic recommendation:

- "WRA recommends Solo Mode because your company has one active user."
- "WRA recommends Team Mode because you added multiple technicians."
- "WRA recommends Team routing because you added a dispatcher."
- "WRA recommends financial routing because you added accounting."

Settings should progressively disclose controls:

Solo settings:

- Company profile
- Owner profile
- Basic schedule
- Basic customer communication rules
- Basic AI assistant boundaries

Team settings:

- Roles
- Dispatch ownership
- Technician assignment
- Callback ownership
- Estimate/payment routing
- Escalation defaults

Enterprise settings:

- Branches
- Departments
- Queues
- Territories
- Managers
- Advanced escalation
- Audit policy
- Multi-team routing rules

The Settings architecture should stay operational. It should help daily work happen with less effort, not become another administrative maze.

## 8. Communications Relationship

Communications captures the event. The Attention Engine decides who must notice it.

Phone example:

```text
Phone
↓
Conversation
↓
Attention Engine
↓
Assigned Human
↓
CRM / Intake / Job
```

The same model must support:

- SMS
- Email
- Website chat
- Website forms
- Yelp
- Thumbtack
- Google Business Messages
- Facebook Messenger
- WhatsApp
- Future channels

Provider adapters should never decide long-term business ownership by themselves.

Retell, Telnyx, Twilio, email providers, marketplace sources, and future chat providers should hand events into WRA. WRA should recognize the customer/property/job context, create or update the conversation/intake, and send the event into the Attention Engine.

## 9. Business Timeline Relationship

The Attention Engine should not pollute the customer or job timeline with internal implementation details.

Business timeline events:

- Incoming call
- Customer replied
- Appointment scheduled
- Estimate sent
- Estimate approved
- Invoice sent
- Payment received
- Parts received
- Return visit scheduled
- Repair completed

Internal attention decisions:

- Routed to dispatcher
- Grouped with existing callback
- Suppressed as duplicate
- Escalated to owner
- Assigned priority urgent

These may be available in future operational audit surfaces, but the normal customer/job timeline should remain business-focused.

## 10. Product Rules

Future implementation must follow these rules:

- Do not start with notifications. Start with attention decisions.
- Do not expose enterprise routing to solo users.
- Do not create separate systems for Solo, Team, and Enterprise.
- Do not let providers bypass WRA-owned Communications, Intake, Jobs, or History.
- Do not show AI/provider/debug events in normal technician workflow.
- Do not interrupt a human for background work.
- Do not force configuration before the company needs it.
- Do not make the owner choose from dozens of channels before defining who owns the work.

## 11. Future Implementation Path

When implementation begins, safe next steps should be:

1. Define an internal attention event shape.
2. Map Communications, Intake, Estimate, Appointment, Payment, and Job lifecycle events into that shape.
3. Add a mode resolver that detects Solo, Team, or Enterprise from company/user/team data.
4. Add an attention assignment resolver that chooses user, role, queue, or owner fallback.
5. Display attention inside existing dashboard/job/intake/communications surfaces before adding external delivery channels.
6. Add delivery channels only after attention ownership is correct.

This document intentionally stops before implementation.
