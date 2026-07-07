# WRA Platform Operating Model

Task 153 establishes the long-term platform architecture after the first stable production phone/CRM milestone.

WRA is not an appliance repair CRM. Appliance repair is the first vertical used to validate the architecture, workflows, data model, AI boundaries, and operational discipline. The long-term platform is an AI operating system for property ownership and service ecosystems.

## 1. Platform Vision

WRA manages the complete operational history of residential and commercial properties.

The platform's long-term mission is to become the system of record and operating layer for every service event around a property: communications, intake, dispatch, field execution, estimates, approvals, repairs, invoices, payments, documents, warranties, recurring maintenance, and learning.

The first market is appliance repair because it has urgent customer demand, repeat asset history, technician expertise, parts complexity, estimates, appointments, customer communication, and warranty/history needs. The architecture must not hard-code appliance repair as the final scope.

The long-term central entity is:

Property

A property accumulates:

- Appliances
- HVAC
- Electrical
- Plumbing
- Roofing
- Solar
- Pools
- Security
- Landscaping
- Cleaning
- Internet
- Smart Home
- Warranties
- Maintenance
- Documents
- Every service provider
- Every completed job
- Every invoice
- Every estimate
- Every inspection
- Complete lifetime history

WRA should make a property smarter every time someone contacts, inspects, repairs, replaces, estimates, invoices, or documents anything at that property.

## 2. Core Platform Objects

### Property

The property is the long-term anchor for history, assets, service events, documents, and knowledge.

A property can be a single-family home, condo, apartment unit, rental property, commercial building, facility, restaurant, office, warehouse, or multi-location property portfolio.

Properties may have multiple owners, occupants, contacts, managers, service providers, assets, jobs, warranties, invoices, documents, and history events over time.

### Owner

An owner is a person or organization with responsibility for a property.

Owner relationships must support:

- Homeowners
- Tenants
- Property managers
- Landlords
- Commercial facility managers
- Business owners
- Real estate investors
- Warranty administrators

The customer remains important, but the customer is not always the same as the owner, occupant, payer, or property manager.

### Assets

Assets are maintainable items attached to a property.

Examples:

- Refrigerator
- Freezer
- Washer
- Dryer
- Dishwasher
- HVAC system
- Water heater
- Electrical panel
- Generator
- Roof
- Pool equipment
- Solar inverter
- EV charger
- Security system
- Smart thermostat

Each asset should eventually have type, category, brand, model, serial, installation date, warranty, documents, photos, repairs, maintenance schedule, replacement recommendations, and lifetime history.

### Service Providers

Service providers are individuals or companies that perform work on a property.

WRA must support:

- Solo technicians
- Dispatcher-led companies
- Multi-location service organizations
- Specialist subcontractors
- Marketplace providers
- Future verified provider networks

Provider records should connect skills, coverage, schedules, marketplace eligibility, company ownership, job history, estimates, invoices, customer feedback, and performance.

### Jobs

Jobs are operational work records created from intake, scheduling, customer requests, inspections, maintenance plans, warranty claims, or provider actions.

A job belongs to a property context even when the first version only has customer/address fields. Future jobs should link to property and asset records whenever possible.

Jobs organize:

- Customer complaint
- Appointment
- Assigned provider
- Diagnosis/findings
- Photos
- Notes
- Repair plan
- Estimate
- Approval
- Parts
- Return visits
- Invoice
- Payment
- Closeout
- Timeline

### Documents

Documents are durable evidence and reference material.

Examples:

- Photos
- Appliance labels
- Manuals
- Estimates
- Invoices
- Receipts
- Warranties
- Inspection reports
- Permits
- Recordings
- Transcripts
- Signed approvals

Documents must be connected to property, asset, job, customer, provider, and timeline context when appropriate.

### History

History is the ordered operational record of what happened.

History should include business-significant events only in normal user surfaces:

- Customer contacted us
- Intake created
- Appointment scheduled
- Technician arrived
- Findings recorded
- Estimate sent
- Estimate approved
- Parts ordered
- Return visit scheduled
- Repair completed
- Invoice sent
- Payment received
- Warranty started

Provider debug events, AI confidence, parsing internals, schema details, and implementation metadata should stay out of normal production UI.

### Knowledge

Knowledge is what WRA learns from property history, service outcomes, technician decisions, repair patterns, parts usage, customer behavior, and provider performance.

Knowledge should improve:

- Intake extraction
- Customer recognition
- Property recognition
- Asset matching
- Duplicate detection
- Dispatch recommendations
- Estimate preparation
- Warranty checks
- Maintenance reminders
- Technician assistance
- Marketplace matching
- Future predictive ownership guidance

Knowledge must remain explainable and overridable by humans.

## 3. Four Core Systems

### Communications

Communications owns every contact across phone, SMS, email, website forms, AI voice, chat, marketplace channels, and future messaging providers.

Responsibilities:

- Capture inbound/outbound communication
- Recognize customer, property, and asset context
- Preserve transcript/message history
- Create intake when work is requested
- Maintain a business timeline
- Prepare next actions
- Keep provider implementation details hidden from normal users

Communications is not Retell, Telnyx, Twilio, email, or any other provider. Those are adapters. WRA owns the conversation.

### Operations

Operations owns the workflow from intake to completed work.

Responsibilities:

- Intake review
- Job creation
- Scheduling
- Dispatch
- Field execution
- Status lifecycle
- Notes/photos
- Repair findings
- Estimates
- Approvals
- Parts workflow
- Return visits
- Invoices
- Payments
- Closeout
- History

Operations must work for a solo technician and a dispatcher-led company without splitting into separate products.

### Marketplace

Marketplace connects property owners/customers with qualified service providers.

Responsibilities:

- Provider discovery
- Eligibility and coverage
- Skill/asset/category matching
- Availability-aware recommendations
- Trust signals
- Reviews and completed work history
- Lead/request routing
- Future multi-service expansion

Marketplace must not bypass Operations. When a marketplace request becomes real work, it should enter the same Communications -> Intake -> Job -> History path.

### Company Operating System

The Company Operating System is the internal control center for service businesses running on WRA.

Responsibilities:

- Company identity
- Teams and roles
- Technician profiles
- Scheduling rules
- CRM rules
- AI Dispatcher rules
- Estimate/invoice defaults
- Billing and payments configuration
- Marketplace settings
- Integrations
- Automation
- Permissions
- Operational policies

Settings should not become the product. Settings exist so daily work can stay simple.

## 4. Universal Workflow

Every service category should follow the same universal workflow:

```text
Customer Contact
↓
Communications
↓
AI Extraction
↓
Intake
↓
Review
↓
Job
↓
Dispatch
↓
Execution
↓
Estimate
↓
Approval
↓
Repair
↓
Invoice
↓
Payment
↓
History
↓
Learning
```

This workflow applies to appliance repair, HVAC, electrical, plumbing, roofing, pools, solar, EV chargers, security, commercial maintenance, and future property services.

Implementation may start with simplified versions of steps, but future work should strengthen this flow rather than create parallel workflows.

## 5. AI Philosophy

AI is embedded into every workflow. There is no separate AI module.

AI should help by:

- Extracting structured data from calls, messages, forms, photos, labels, and documents
- Recognizing customers, properties, and assets
- Suggesting duplicate matches
- Summarizing conversations
- Preparing intake drafts
- Recommending next actions
- Drafting customer-friendly language
- Organizing technician findings
- Preparing estimate text from technician-authorized scope
- Identifying missing information
- Surfacing property history and warranty context
- Learning from completed workflows

Humans override AI by:

- Correcting extracted fields
- Confirming or rejecting matches
- Selecting the technician/provider
- Approving schedule changes
- Authorizing repair scope
- Setting prices
- Sending estimates
- Completing/canceling jobs
- Resolving exceptions

AI must never silently create irreversible business outcomes, invent repair scope, override technician authority, send messages without approved automation rules, or hide uncertainty behind confident copy.

Each workflow should answer:

- What can AI prefill?
- What should the human confirm?
- What must remain manually controlled?
- What history should be learned from the result?

## 6. Company Operating Modes

### Solo Technician

A solo technician may answer calls, schedule, diagnose, estimate, invoice, collect payment, and close jobs alone.

The same workflow should collapse into fewer screens and fewer required approvals. The system should emphasize speed, mobile use, and next action.

### Dispatcher Company

A dispatcher company separates intake, scheduling, dispatch, field work, estimate approval, parts, invoicing, and follow-up across multiple people.

The same workflow should expose queues, ownership, assignment, review, and escalation without changing core objects.

### Enterprise

Enterprise organizations may have branches, departments, teams, territories, roles, compliance needs, multiple service categories, and reporting layers.

The same workflow should support hierarchy, permissions, audit trails, integrations, and scale without creating a different product.

The core architecture must be shared across all three modes.

## 7. Company Operating System And Settings Architecture

Future Settings should be the configuration layer for the Company Operating System.

Major sections:

### Company

Identity, business profile, service categories, locations, branding, legal details, operating hours, teams, roles, and permissions.

### AI Dispatcher

Voice/chat behavior, intake extraction rules, booking rules, escalation rules, supported service categories, customer recognition rules, and human handoff boundaries.

### CRM Rules

Job statuses, required fields, timeline rules, customer communication rules, duplicate handling, archive/cancel policies, and closeout requirements.

### Scheduling

Availability, business hours, technician calendars, service windows, return visits, travel buffers, capacity rules, holiday rules, and optional calendar sync.

### Technicians

Profiles, skills, coverage, marketplace readiness, availability, roles, performance, certifications, and service category eligibility.

### Billing

Estimate defaults, invoice defaults, taxes, discounts, payment terms, deposits, warranties, receipts, payment providers, and refund rules.

### Marketplace

Public profile, coverage, accepted categories, ranking inputs, lead rules, pricing display rules, reviews, and eligibility.

### Integrations

Phone, SMS, email, calendar, payment, accounting, vendor, inventory, maps, analytics, review platforms, and future property data providers.

### Automation

Appointment confirmations, reminders, on-my-way messages, estimate follow-ups, invoice follow-ups, review requests, maintenance reminders, warranty reminders, and exception alerts.

Settings must define responsibilities and rules. Daily users should not have to configure every job manually.

## 8. Property Lifecycle

A property should become more valuable inside WRA over time.

Year one might contain:

- Customer account
- Address
- Refrigerator repair
- Appliance photo
- Estimate
- Invoice
- Technician notes
- Warranty

Year three might contain:

- Multiple appliances
- HVAC maintenance
- Water heater replacement
- Electrical panel inspection
- Roof inspection
- Pool repair
- Invoices from different providers
- Warranty documents
- Photos
- Recordings/transcripts
- Recurring maintenance recommendations

The property history becomes the platform's primary knowledge asset because it connects what happened, who did it, what it cost, what failed, what was replaced, what is under warranty, and what should happen next.

This is the durable advantage of WRA: not just lead generation, not just CRM, and not just AI chat, but the complete operational memory of the property.

## 9. Future Expansion

The architecture expands beyond appliances by adding service categories, asset types, provider capabilities, documents, and workflow-specific fields while preserving the universal workflow.

Future verticals:

- HVAC
- Electrical
- Plumbing
- Roofing
- Pools
- Solar
- EV Chargers
- Security
- Smart Home
- Landscaping
- Cleaning
- Commercial Facilities

Expansion rules:

- Do not fork the platform per vertical.
- Do not create isolated CRMs per service category.
- Do not create provider integrations that bypass Communications, Intake, Jobs, or History.
- Add vertical-specific fields only behind shared property, asset, job, estimate, invoice, document, and history concepts.
- Keep AI embedded in workflows, not isolated as a separate product.

## 10. Implementation Direction After Task 153

Task 153 is documentation-only.

Future implementation should treat the current appliance workflow as the first proof of the property operating model. New work should strengthen these platform primitives:

- Property recognition and property records
- Asset registry generalized beyond appliances
- Property-linked jobs
- Property history timeline
- Document and warranty storage
- Cross-provider service history
- Company operating settings
- Marketplace matching across service categories
- AI extraction and review loops in every workflow

Task 154 and later should be evaluated against this question:

Does this help WRA become the operating system for property ownership and service ecosystems while still supporting the immediate Workiz Exit operational path?
