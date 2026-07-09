# Task 160.1 - Action Dashboard Modules

Task 160.1 refines the minimalist Dashboard direction.

The Dashboard is not a traditional CRM home page and not a widget wall. It is an action launcher for the daily Workiz Exit workflow.

The question it should answer is:

```text
What should I do right now?
```

## Daily Action Modules

Use action-based product language in the dashboard header:

- Calls: phone call work center. Routes to Communications Hub for phone conversations.
- Messages: message work center. Routes to Communications Hub for SMS/chat/email/future messages.
- Jobs: job/service request work center. Routes to the existing Jobs list.
- Schedule: schedule/calendar work center. Routes to the existing technician schedule.
- Attention: future operational Attention Engine entry point. It remains a safe placeholder until a dedicated Attention task.
- Profile: user/company profile entry point.

These labels are UI/product language only. They do not rename database tables, backend concepts, service request storage, communication records, or route internals.

## Dashboard Rules

The Dashboard body stays minimal:

- Greeting.
- Search.
- Compact labeled action shortcuts.
- Today's Jobs.

Do not restore:

- Recent Calls widget.
- Recent Messages widget.
- Parts & Vendors widget.
- Manuals Library widget.
- Community Feed widget.
- Revenue widgets.
- Large KPI blocks.
- Demo/sample cards.

## Routing Rules

- Calls -> `/dashboard/communications?channel=phone`
- Messages -> `/dashboard/communications?channel=messages`
- Jobs -> `/dashboard/leads`
- Schedule -> `/dashboard/technician-schedule`
- Attention -> `/dashboard#attention`
- Profile -> `/dashboard/technician-profile`

Communications Hub may ignore channel query parameters until filtering is implemented. The route still opens the correct work center.

## Remaining Work Before SMS

- Add real message-channel ingestion and source filters inside Communications Hub.
- Add unread/needs-review message state only after real message records support it.
- Define Attention Engine ownership before notification delivery.
- Add SMS provider sending only after consent, templates, audit, and customer communication rules are reviewed.

Task 160.1 does not add SMS, email, Retell changes, phone webhook changes, Supabase schema changes, AI assistant behavior, vendor intelligence, community intelligence, or new routes.
