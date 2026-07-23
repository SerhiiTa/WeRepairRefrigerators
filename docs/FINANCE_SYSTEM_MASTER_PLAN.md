# Finance System Master Plan

This document is the product source of truth for WRA Finance.

It is not a technical implementation plan. It defines how WRA should think about money, estimates, approvals, invoices, deposits, and payments before any screen, API, table, prompt, or automation is built.

Every future task touching Price Book, Estimate Builder, AI Estimate, Repair Proposal, Customer Approval, Invoice, Deposit, or Payments must follow this document.

## 1. Finance Philosophy

WRA Finance exists to turn technician-confirmed repair decisions into clear customer trust, approval, invoice, and payment.

Finance is not a separate accounting maze. It is part of the repair workflow:

Job
Diagnosis
Repair Solution
Customer approval
Invoice
Payment
Completed work history

The technician should not feel like they are building accounting records. The customer should not feel like they are reading internal labor math. The dispatcher should not need to become an estimator to keep the business moving.

Finance should answer:

- What repair are we proposing?
- What is included?
- What will the customer pay?
- What warranty applies?
- What action is needed next?

Everything else is internal detail and should be hidden until needed.

## 2. Why WRA Does Not Copy Workiz

WRA should not copy Workiz estimate screens, invoice tables, job widgets, or CRM-heavy finance workflows.

Workiz-style finance often exposes too many internal objects at once: line items, labor, parts, discounts, tax controls, invoice states, payment states, notes, and job context in one dense administrative surface.

WRA should be different:

- one repair decision at a time;
- one primary next action;
- customer-facing clarity first;
- internal pricing structure second;
- technician authority always preserved;
- company defaults instead of repeated manual configuration;
- progressive disclosure instead of permanent controls.

The goal is not to make a better spreadsheet. The goal is to make the repair business flow.

## 3. Repair Solution

A Repair Solution is the business-level answer to the repair problem.

Examples:

- Evaporator fan motor replacement
- Dryer heating repair
- Dishwasher drain pump replacement
- Refrigerator sealed system repair
- Oven bake element replacement

A Repair Solution can include:

- customer-facing repair name;
- technician-confirmed scope;
- labor operations;
- parts or materials;
- fees;
- warranty defaults;
- internal cost and price structure;
- customer explanation;
- optional bundle composition;
- future approval and invoice behavior.

The Repair Solution is what WRA should help the technician choose, confirm, explain, approve, and invoice.

## 4. Why Repair Solution Matters More Than Labor And Part Lines

Customers buy outcomes, not accounting rows.

A customer does not usually want to approve:

- labor line 1;
- part line 1;
- service material line;
- fee line;
- tax line;
- internal bundle child line.

They want to understand:

- what is broken;
- what will be repaired;
- what is included;
- what it costs;
- what warranty they receive;
- how to approve.

Labor and part lines still matter internally. They support pricing, reporting, technician pay, inventory, cost control, and invoice history. But they should not define the customer experience.

The primary object is the Repair Solution. Lines support the solution.

## 5. Bundle

A Bundle is an internal reusable composition of items that represent one Repair Solution.

A Bundle may contain:

- labor;
- parts;
- services;
- fees;
- required child items;
- optional child items;
- hidden internal items;
- price overrides;
- default quantities;
- warranty behavior.

Bundles help the company standardize how a repair is built.

Example:

Evaporator fan replacement bundle may include:

- diagnostic and repair labor;
- evaporator fan motor assembly;
- reassembly and performance test;
- optional defrost service when selected by the technician.

The Bundle is a company operating object, not a customer object.

## 6. Why Bundle Is Never Shown To Customer

The customer should never see "Bundle" as a visible finance concept.

Bundle is internal language. It describes how WRA groups pricing and operational components. Showing it to customers makes the repair feel like a catalog or accounting construct instead of a professional service proposal.

Customers should see:

- the repair being proposed;
- what is included;
- the total price;
- warranty;
- approval action.

They should not see:

- bundle IDs;
- internal child structure;
- hidden items;
- matching logic;
- margin controls;
- override rules;
- catalog metadata.

## 7. Repair Proposal

A Repair Proposal is the customer-facing document or screen that explains the technician-confirmed Repair Solution.

It should include:

- professional title;
- customer-friendly explanation;
- repairs included;
- parts included when useful;
- total price;
- taxes/fees if applicable;
- warranty text;
- approval button;
- company branding;
- optional itemized details when appropriate.

The Repair Proposal is designed for customer trust and approval.

It is not the same thing as the internal estimate builder.

## 8. Why Customer Receives Proposal, Not Internal Estimate

An internal Estimate is how WRA calculates and stores the financial structure.

A Repair Proposal is how WRA communicates the offer.

The customer should receive a Proposal because the customer needs clarity, not internal tooling. Proposal language should be polished, direct, and easy to approve from a phone.

The internal Estimate can preserve:

- selected Price Book items;
- bundle composition;
- labor/part/service/fee lines;
- taxability;
- discount logic;
- technician notes;
- dispatcher notes;
- audit snapshot;
- approval and invoice conversion state.

The Proposal presents the useful result of that internal structure.

## 9. Itemized Estimate

An Itemized Estimate is a detailed internal or optional customer-facing view of the repair price.

It may show:

- labor;
- parts;
- service fees;
- discounts;
- taxes;
- deposits;
- totals.

Itemized details should be available when needed, but they should not be the default emotional experience for every customer.

The default customer experience should be:

Repair Proposal first.
Itemization only when useful.

## 10. When AI Runs

AI should run after the technician has provided or confirmed repair information.

AI may run when:

- the technician enters diagnosis/findings;
- the technician selects one or more Repair Solutions;
- the technician asks WRA to draft a Proposal;
- the dispatcher needs help turning confirmed scope into customer language;
- the system needs to detect missing information before sending.

AI should not run as the repair authority when a customer complaint is first received.

AI should not decide that a compressor, board, pump, fan, valve, or heater must be replaced unless the technician confirmed that repair scope or a future Repair Intelligence subsystem has produced validated scope for technician confirmation.

AI helps write. AI helps organize. AI helps check completeness. AI does not replace the technician.

## 11. Complaint Is Not Diagnosis

A customer complaint is what the customer experienced.

Examples:

- refrigerator not cooling;
- washer leaking;
- oven not heating;
- dishwasher not draining.

A diagnosis is what the technician determined.

Examples:

- failed evaporator fan motor;
- cracked washer door boot;
- open bake element;
- failed drain pump;
- sealed system restriction.

WRA must not treat complaint as diagnosis.

Complaint can help prepare the job and suggest questions, but it cannot create final repair scope by itself. Finance should not generate a final Proposal from complaint alone unless it is clearly marked as preliminary and requires technician confirmation.

## 12. Technician Is The Source Of Truth

The technician remains the single source of truth for what will actually be repaired.

The technician confirms:

- diagnosis;
- repair scope;
- required parts;
- labor operations;
- safety concerns;
- warranty exclusions;
- whether repair is recommended;
- whether replacement is a better option;
- whether work is complete.

AI, Price Book, and dispatcher workflows may assist, suggest, organize, and prepare. They may not override technician decisions.

If information is missing, WRA should ask for confirmation instead of inventing it.

## 13. How Price Book Is Used By AI

Price Book gives AI approved company language and pricing structure.

AI may use Price Book to:

- match technician-confirmed scope to existing Repair Solutions;
- choose approved customer-facing wording;
- assemble a Proposal from selected items;
- detect missing price, warranty, model, or part information;
- keep proposals consistent with company defaults;
- avoid inventing repairs or prices.

AI must not use Price Book to silently broaden repair scope.

If the technician says "replace evaporator fan," AI may draft a clear evaporator fan Proposal. It may not add a compressor or control board because those are common industry possibilities.

## 14. How Price Book Is Used By Technician

Technicians use Price Book to move faster after diagnosis.

The technician should be able to:

- search or select a Repair Solution;
- confirm it matches the actual repair;
- adjust scope if needed;
- see customer-facing price quickly;
- add missing part/labor information;
- request proposal generation;
- send for approval.

The technician should not have to manually rebuild common repairs from scratch on every job.

## 15. How Price Book Is Used By Dispatcher

Dispatchers use Price Book to support operations without pretending to diagnose.

A dispatcher may use Price Book to:

- prepare common service fee language;
- understand standard repair categories;
- help create a preliminary customer expectation when allowed by company policy;
- support approved repeat workflows;
- help schedule return visits when technician-confirmed scope already exists.

A dispatcher should not use Price Book to make a final technical repair decision unless the company has explicitly authorized that workflow and the technician-confirmed source exists.

## 16. Why Customer Never Works With Price Book

Price Book is internal company configuration.

The customer should never browse, search, filter, or edit Price Book items.

Customers interact with:

- Repair Proposal;
- approval;
- invoice;
- deposit/payment;
- receipts;
- warranty information.

Keeping Price Book internal protects clarity, pricing policy, margins, and operational consistency.

## 17. Full Finance Lifecycle

The WRA finance lifecycle is:

Job

Diagnosis

Repair Solution

AI

Repair Proposal

Customer Approval

Estimate Approved

Invoice

Deposit

Payment

Completed

### Job

The work exists. Customer, property, appliance, problem, appointment, technician, and communication context are known as much as possible.

### Diagnosis

The technician identifies the actual problem and confirms repair scope.

### Repair Solution

The technician or dispatcher selects the company-approved repair outcome that matches the diagnosis.

### AI

AI formats, explains, checks completeness, and prepares customer-facing proposal language from the confirmed scope and Price Book.

### Repair Proposal

The customer receives a clear professional offer with repair scope, price, warranty, and approval action.

### Customer Approval

The customer approves, declines, asks questions, or requests changes.

### Estimate Approved

The internal estimate state becomes approved and can drive invoice/deposit/payment workflow.

### Invoice

The approved or completed work becomes a payable document.

### Deposit

If company policy requires deposit, the customer pays before parts ordering, return visit, or work start.

### Payment

Payment is recorded through the supported payment flow.

### Completed

The job, proposal, invoice, payment, warranty, and repair history become part of the customer/property service record.

## 18. Future Company Settings

Finance settings should live at the company level and should not clutter every job.

Future settings include:

- warranty defaults;
- discounts;
- taxes;
- deposits;
- pricing policy;
- company branding;
- Repair Proposal template.

### Warranty Defaults

Default labor and installed-parts warranty text should be reusable, editable, and automatically applied to proposals unless overridden.

### Discounts

Discount settings should support controlled company policies without making technicians manage accounting details during every repair.

### Taxes

Tax settings should be company-level defaults with job-level override only when truly needed.

### Deposits

Deposit settings should define when deposits are requested, how much is required, and how the payment state affects parts ordering or scheduling.

### Pricing Policy

Pricing policy should define how the company handles flat rate, hourly, diagnostic fees, bundled repairs, optional items, and override permissions.

### Company Branding

Repair Proposals, invoices, and receipts should reflect company identity without requiring technicians to style documents manually.

### Repair Proposal Template

Proposal templates should control tone, layout, warranty placement, approval wording, and optional itemization.

## 19. Future AI Repair Proposal Agent

The Future AI Repair Proposal Agent is a product concept, not an implementation in this document.

Its role is to transform technician-confirmed Repair Solutions into polished customer-facing Repair Proposals.

### Inputs

The agent should receive:

- technician diagnosis/findings;
- selected Repair Solution IDs;
- selected Price Book items;
- warranty defaults;
- pricing policy;
- customer/job context;
- appliance/property context;
- technician notes;
- missing information flags.

### Outputs

The agent should produce:

- customer-facing repair title;
- plain-English explanation;
- included repairs;
- included parts/materials when appropriate;
- warranty text;
- missing information warnings;
- proposal-ready total summary;
- approval-ready wording.

### Guardrails

The agent must not:

- diagnose from complaint alone;
- invent repair scope;
- invent part numbers;
- invent prices;
- override technician decisions;
- expose bundle internals;
- expose Price Book internals;
- make unsafe guarantees.

### Human Override

The technician or dispatcher must be able to edit, confirm, or reject the generated Proposal before it is sent.

The agent should make the human faster, not less responsible.

## 20. Finance Must Stay Minimalist

Finance must remain one of the simplest parts of WRA.

No CRM inside Finance.

No giant tables by default.

No long lists unless the user asks for history.

No permanent tax/discount/deposit controls on the main repair screen.

No internal bundle complexity in customer views.

No duplicate customer, job, communication, or property workspace inside Finance.

Finance should feel like:

- choose the repair;
- confirm the scope;
- send the proposal;
- collect approval;
- invoice;
- get paid.

Everything else should be progressive disclosure.

The strongest Finance system is not the one that exposes the most controls. It is the one that lets the service business move from diagnosis to approval to payment with the least confusion.

