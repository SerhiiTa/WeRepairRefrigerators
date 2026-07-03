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
