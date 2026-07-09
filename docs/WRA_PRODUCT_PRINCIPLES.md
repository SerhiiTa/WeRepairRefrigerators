# WRA Product Principles

This document is internal product philosophy for WeRepairAppliances / WeRepairRefrigerators. It is not marketing copy and not customer documentation.

Every future product, workflow, integration, AI, marketplace, customer portal, technician tool, dashboard, estimate, invoice, intake, dispatch, inventory, vendor, payment, or communication task should stay aligned with these principles.

## 1. WRA Is An Operating System

WRA is an operating system for the service business. It is not another CRM.

The product should help a service company run daily work from first customer contact through diagnosis, estimate, approval, parts, return visit, invoice, payment, review, and history.

## 2. The Technician Is The Source Of Truth

The technician decides what is broken, what will be repaired, what parts are required, and what should be charged.

The system may capture, organize, and present technician decisions. It must not replace them.

## 3. AI Assists, It Does Not Override

AI may improve wording, structure, translation, summaries, routing, preparation, and recommendations.

AI must not override technician decisions, invent repair scope, invent parts, invent prices, silently change workflow state, or make irreversible business decisions without confirmation.

## 4. Manual Typing Is Failure

The system should capture, recognize, pre-fill, and suggest whenever possible.

Typing should be reserved for information that cannot be captured from a call, message, photo, appliance label, previous history, customer profile, technician finding, or provider payload.

## 5. Every Extra Click Is A Bug

Every tap must earn its place.

If a step can be automated, inferred safely, defaulted, pre-filled, or confirmed inline, it should not become another required click.

## 6. One Screen, One Goal, One Primary Action

Each screen should have a clear job.

The primary action should be obvious. Secondary actions should support the goal without competing for attention.

## 7. Hide Complexity

Advanced functionality should remain available, but normal users should not have to stare at it.

Complex data, diagnostics, audit detail, internal scoring, provider metadata, and configuration belong behind progressive disclosure or internal/admin surfaces.

## 8. Progressive Disclosure

Show only what is needed now.

Reveal additional controls when the technician asks for them or when the workflow truly needs them.

## 9. Defaults Over Configuration

The system should choose intelligent defaults instead of forcing users to configure everything.

Configuration should exist, but daily work should not depend on constant setup.

## 10. Mobile First

Every operational workflow must work naturally on a phone.

Technicians should be able to receive, understand, update, estimate, document, and close work from the field.

## 11. The Software Should Think First

WRA should prepare the work before asking a human to act.

It should parse requests, recognize customers, detect duplicate intake, suggest technicians, prepare estimate drafts, organize notes, and surface next actions.

## 12. The Technician Confirms

The technician should confirm information rather than manually recreate it.

The product should turn raw input into structured suggestions and let the technician approve, correct, or reject them.

## 13. Customer Experience Is Part Of The Product

Every customer-facing estimate, invoice, appointment link, approval page, message, and portal screen should feel professional, trustworthy, clear, and easy to understand.

The technician workflow and customer workflow are one product.

## 14. Automation Must Reduce Work

Automation that creates more review burden, duplicate records, manual cleanup, or uncertainty is not automation.

Automation should reduce work, reduce mistakes, and make the next action clearer.

## 15. WRA Should Feel Like The iPhone Of Service Business Software

Simple. Fast. Clean. Powerful.

The complexity should exist under the surface, not in the technician's face.

## 16. Source Of Truth Before Convenience

Do not duplicate core business objects casually.

Customers, appliances, jobs, appointments, estimates, invoices, payments, technicians, and companies need clear ownership and lifecycle rules.

## 17. Preserve History

Do not casually delete operational history.

Use status, archive, void, cancel, close, or supersede flows so the business can understand what happened later.

## 18. Human Language Over System Language

Users should not see database words, provider terms, prompt terms, confidence internals, RLS, RPC, Supabase, or implementation details during normal work.

The interface should speak like a dispatcher, technician, owner, or customer would speak.

## 19. Operational Value Before Platform Expansion

Every future task must answer:

Does this help HomeFix stop using Workiz within two months?

If the answer is no, move it to backlog unless it is required for security, stability, or recovery.

## 20. Small Safe Steps

WRA should grow through safe, verified operational improvements.

Each task should preserve authentication, existing workflows, customer trust, database recoverability, and build stability.

## 21. Objects Navigate, Buttons Act

Use clickable objects for navigation: customer cards, job cards, appliance cards, estimates, invoices, calls, and timeline entries should open themselves.

Reserve buttons for actions that change state, create something, save something, send something, or start a workflow.

Do not make users choose between a row and a separate navigation button when the object itself can be the path.

## 22. Operational First, Metrics Second

Customer and job workspaces should show the facts needed for the next operational decision before analytics, counts, or historical trivia.

For customers, prioritize open jobs, assets, balances, last job, and current contact context. Financial metrics are owner/admin information, not default technician clutter.

## 23. Collapse History By Default

Timeline, communication history, repair history, assets, notes, estimates, and invoices are important, but they should not force every user to scroll through history on every visit.

Show the current work first. Reveal history through compact expandable sections that remember state while the page is open.

## 24. Address Truth Must Be Explicit

A customer has a primary address. A job has a service address. They are related, but they are not the same record.

Creating a customer from intake may use the first service address as the customer primary address. Future jobs may default to the customer primary address. Changing a job service address must not rewrite customer history, and changing a customer primary address must not rewrite historical job addresses.

If a dispatcher enters a new service address that should become the customer primary address, the UI must make that an explicit action.

## 25. The Platform Grows With The Company

WRA should adapt to company size instead of forcing every company through the same configuration burden.

A solo technician should receive simple defaults and nearly zero routing setup. A team should gain role-aware operational ownership when additional technicians, dispatchers, or office staff are added. An enterprise should support departments, branches, queues, managers, accounting, and escalation without becoming a separate product.

Attention should be modeled before notifications. The system should first decide who needs to notice an operational event, how urgent it is, and whether it should be grouped, delayed, ignored, or escalated. Delivery channels such as dashboard, push, SMS, email, browser, mobile app, desktop, and future voice are outputs of that decision, not the operating model itself.

See `docs/ATTENTION_ENGINE_AND_COMPANY_MODES.md` before implementing future notification, attention, routing, settings, communications, or operational queue work.

## 26. Three Daily Work Centers

WRA should not create competing home screens.

Daily appliance repair operations should resolve into three centers:

- Dashboard: the daily command center and business overview.
- Communications Hub: the working center for calls, messages, intake, and customer conversations.
- Job Workspace: the working center for one specific job.

If a new screen duplicates one of these centers, fold the useful idea into the correct center instead of adding another daily destination.

Task 158.6 removed the temporary Workspace prototype from main navigation and removed the `/dashboard/workspace` route/component. Do not restore a fourth competing daily work center without a new architecture decision.

## 27. Customer First In Daily Operations

The customer is the daily operations anchor.

A job is one event in the customer relationship. The relationship also includes conversations, calls, SMS, leads, appliances, estimates, invoices, payments, notes, service addresses, and repair history.

Workflows should make the current job fast to execute while preserving customer context and history.

See `docs/WRA_DAILY_OPERATING_WORKFLOW.md` before changing the daily Dashboard, Communications Hub, Job Workspace, or navigation model.

## 28. Dashboard Is An Action Launcher

The daily Dashboard should not become a CRM widget wall.

Its job is to route the user into the correct work center quickly:

- Calls.
- Messages.
- Jobs.
- Schedule.
- Attention.
- Profile.

Show only the information needed to decide where to go next. For the Workiz Exit phase, the dashboard body should stay focused on Today's Jobs. Calls and messages belong in Communications Hub. Job execution belongs in Job Workspace. Customer history belongs in Customer CRM. Revenue, vendor, manuals, community, and deeper operational analytics should not compete for attention on the daily start screen unless a future task proves they directly answer `What should I do right now?`

## 29. Jobs Center Manages Work

Customer is the relationship. Job is the work.

The Jobs Center should help technicians, dispatchers, and owners find and move work quickly throughout the day. It should not become a customer profile, a communications transcript viewer, or a duplicate Job Workspace.

Jobs Center should show compact work facts: customer, appliance, problem, appointment time, status, assigned technician, service location, and last activity. The object itself should open the Job Workspace. Buttons should remain compact actions such as Call, Message, or Open.

When a user chooses New Job, the interface should speak in job language. Intake can remain an internal review/conversion implementation, but it should not be exposed as the mental model for someone trying to create work.

Task 161.2 adds the concrete Jobs Center rule: New Job should be a single customer-first form whenever possible. Search/select the customer first, then service address, appliance/problem, schedule, and technician. Avoid step ceremonies unless the workflow truly needs them.

Mobile dashboard navigation should use one reusable drawer pattern across Dashboard, Jobs Center, and future dashboard pages. Do not create route-specific mobile menus that drift in animation, styling, route list, or profile behavior.
