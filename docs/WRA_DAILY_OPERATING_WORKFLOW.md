# WRA Daily Operating Workflow

Task 158.5 defines the daily operating architecture for the Workiz Exit phase.

Owner QA after the Task 158 workspace prototype found that WRA should not create a second main home screen that competes with Dashboard. The product should clarify the daily workflow around three centers:

1. Dashboard
2. Communications Hub
3. Job Workspace

The central object for daily operations is the customer. A job is one event in the customer relationship.

## 1. Daily Entry Experience

Within 5 seconds after login, the user should understand what needs attention today.

Example:

```text
Good afternoon, Serhii.

Today:
- 4 jobs
- 2 calls
- 1 SMS
- 1 estimate waiting
- 1 unpaid invoice
- revenue snapshot
```

The Dashboard should answer:

What needs my attention today?

It should not force the user to search through long lists before understanding the day.

## 2. Dashboard Purpose

Dashboard is not a workspace.

Dashboard is not Communications Hub.

Dashboard is not Job Workspace.

Dashboard is a daily business overview and command center.

Dashboard should show:

- Greeting.
- Business status.
- Calls, messages, and attention counters.
- Today's jobs.
- Jobs in progress.
- Parts waiting.
- Pending estimates.
- Unpaid invoices.
- Revenue today, week, and month.
- Today's schedule.
- Recent messages.
- Recent calls.
- AI Technician Advisor history.
- Parts search entry point.
- Manuals library entry point.
- Community feed preview.

Dashboard should not show long detailed records.

Clicking an item should open the correct working center:

- Calls/messages counters open Communications Hub.
- Schedule/job cards open Job Workspace.
- Customer objects open Customer Workspace.
- Estimate/invoice counters open the relevant job or list surface.

## 3. Communications Hub Purpose

Communications Hub is where the user processes customer contact.

It handles:

- Phone calls.
- SMS.
- Website chat.
- Yelp.
- Thumbtack.
- Google Business messages.
- Facebook messages.
- Email.
- Marketplace messages.
- Internal mentions.

Communications Hub should answer:

Who contacted us and what needs to happen next?

It is the working center for:

- Conversation review.
- Transcript and audio review.
- Customer matching.
- Intake review.
- Create or match customer.
- Create job.
- Link to existing job.
- Reply later when SMS, email, or chat exists.

Communications Hub owns customer contact processing. It should not become a full Dashboard and should not replace Job Workspace.

Task 159.1 defines the post-call decision workflow in `docs/POST_CALL_WORKFLOW_SPEC.md`. Communications Hub should use a left conversation list, center decision card, and right transcript/audio/timeline. It should not duplicate Customer CRM or Job Workspace.

## 4. Job Workspace Purpose

Job Workspace is where the technician or dispatcher works on one job.

It should answer:

How do I complete this job?

Job Workspace contains:

- Customer summary.
- Service address.
- Appliance.
- Complaint.
- Appointment.
- Status.
- Technician.
- Notes.
- Photos.
- Estimate.
- Invoice.
- Payment.
- Timeline.
- Parts workflow.
- Completion.

Dashboard schedule cards should open Job Workspace.

Communications Hub should open Job Workspace when a conversation is linked to a job.

## 5. Attention Model

Attention is a count and priority signal.

It is not a separate page by default.

Examples:

- Phone icon badge = calls needing attention.
- Message icon badge = unread or customer messages.
- Bell badge = operational attention.
- Job badge = jobs needing action.
- Estimate badge = estimates waiting.
- Invoice badge = unpaid invoices.

A future bell or attention surface may open a Job Center or Attention Center, but the immediate Workiz Exit architecture treats attention as a routing signal that sends users to Dashboard, Communications Hub, or Job Workspace.

## 6. Mobile Navigation

Mobile must not show the full desktop sidebar.

Mobile should not waste half the screen on large navigation buttons.

Mobile should use compact bottom navigation, top navigation, or icon-based access.

Avoid large daily-work buttons such as:

- View Public Site.
- Open Jobs.
- Marketplace Profile.
- Sign Out.
- Houston MVP.

Those actions belong in profile, settings, or secondary menus, not the daily work area.

## 7. Left Menu Principles

Desktop left menu should contain stable modules only:

- Dashboard.
- Jobs.
- Intake.
- Calls & Messages.
- Customers.
- Schedule.
- Estimates.
- Invoices.
- Parts & Inventory.
- Manuals Library.
- Community.
- Vendors.
- Technicians.
- Marketplace Profile.
- Settings.

Workspace should not remain as a separate permanent menu item unless a later product decision redefines it.

Task 158 produced a useful workspace prototype, but owner QA determined that the ideas should be folded into Dashboard, Communications Hub, or Job Workspace rather than competing as a fourth main center.

Task 158.6 removed Workspace from main navigation and removed the temporary `/dashboard/workspace` route/component.

## 8. Daily Technician Workflow

Ideal technician day:

1. Open app on phone.
2. See dashboard summary.
3. Check calls, messages, and attention counters.
4. Review today's jobs.
5. Open first job from schedule.
6. Work inside Job Workspace.
7. Add notes and photos.
8. Create estimate.
9. Get approval.
10. Create invoice.
11. Collect payment.
12. Close job.
13. Return to Dashboard for the next action.

The user should not need Workiz for any of these steps.

## 9. Solo Owner Default

By default, WRA serves a solo owner/operator.

That one user is:

- Owner.
- Dispatcher.
- Technician.
- Accountant.

All counters and attention items belong to that user by default.

Team and enterprise routing comes later through the Attention Engine model.

## 10. Customer-First Operating Model

The central object for daily operations is Customer.

A customer may have:

- Conversations.
- Calls.
- SMS.
- Leads.
- Jobs.
- Appliances.
- Estimates.
- Invoices.
- Payments.
- Notes.
- Service addresses.
- Repair history.

Jobs are events inside the customer relationship. Daily workflow should keep the customer relationship as the anchor while still making the current job fast to execute.

## 11. Workiz Exit Priority

Every daily workflow decision should reduce the need to open Workiz.

Priority order:

1. Dashboard daily command center.
2. Communications Hub.
3. Job Workspace.
4. Estimate, Invoice, and Payment flow.
5. Schedule and parts workflow.

Do not build AI Repair Assistant, Vendor Intelligence, or Community Intelligence before the Workiz replacement workflow is stable.

## 12. Next Implementation Decisions

Task 158.6 completed the immediate correction:

- Removed `/dashboard/workspace` from main navigation.
- Removed the temporary `/dashboard/workspace` route/component.
- Preserved useful OperatingWorkspace ideas only as architecture notes to fold into Dashboard, Communications Hub, or Job Workspace.

Next implementation should:

- Refine Dashboard as the daily command center.
- Keep Communications Hub as the communication processing center.
- Keep Job Workspace as the job execution center.

Do not build a fourth competing daily workspace.

## 13. Task 160 Minimalist Dashboard Decision

Owner QA refined the dashboard direction again: the dashboard should not be a page full of widgets.

The dashboard should answer:

```text
What should I do right now?
```

For the current Workiz Exit phase, `/dashboard` should show only:

- Greeting.
- Search.
- Phone/messages/attention icons.
- Profile shortcut.
- Today's Jobs.

The dashboard should not duplicate Communications Hub, Customer CRM, Job Workspace, vendor search, manuals, community, revenue analytics, recent calls, recent messages, or parts/vendor workflows.

Routing rules:

- Phone icon opens Communications Hub.
- Messages icon opens Communications Hub.
- Bell icon is an Attention Center placeholder until a future attention task.
- Today's job cards open Job Workspace.
- Search routes into Jobs.

## 14. Task 160.1 Action Module Language

Task 160.1 keeps the minimalist dashboard and makes the entry actions explicit.

Daily action module labels:

- Calls.
- Messages.
- Jobs.
- Schedule.
- Attention.
- Profile.

These are product labels for humans, not database or backend renames.

The dashboard header should act like an operating-system launcher: one compact row of actions that routes the user into the correct work center. The body remains Today's Jobs only.

Do not add separate dashboard widgets for calls, messages, parts, vendors, manuals, community, or revenue while the Workiz Exit workflow is still being stabilized.
