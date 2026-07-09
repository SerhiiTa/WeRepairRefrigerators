# Task 162 - Job Workspace Audit

Date: July 9, 2026

Status: Documentation-only UX audit. No production code, components, backend, database, Retell, Supabase, authentication, or workflow logic was changed.

## Purpose

Task 162 audits the current Job Workspace, implemented primarily in `frontend/src/components/dashboard/ServiceRequestDetail.tsx`, before a future full UX restructure.

The goal is not to remove functionality. The goal is to make the Job Workspace usable as the one-job execution center for a technician working from a phone.

The current screen already supports the important operational objects:

- Customer and communication shortcuts.
- Service address editing and map navigation.
- Appointment booking and dispatcher preview.
- Status changes and workflow actions.
- Appliance complaint and technician findings.
- Repair Intelligence estimate generation.
- Estimate send/approval lifecycle.
- Invoice creation and invoice state changes.
- Notes, photos, and timeline.
- Parts-related status workflow.

The main problem is layout, prioritization, and duplication. Too many blocks are visible at once, several sections repeat the same job facts, and operational actions compete with history, diagnostics, and secondary metadata.

## Product Lens

The Job Workspace should answer, in this order:

1. What job is this?
2. Who is the customer and how do I contact them?
3. Where do I go?
4. What is broken?
5. What should I do next?
6. What has already been done?
7. What do I need to estimate, invoice, document, or close?

Anything that does not help the technician answer those questions immediately should move down, merge into another block, or collapse behind disclosure.

## Current Block Audit

### Header

Current purpose: Shows job number, status badge, title (`customer · appliance`), brand, appointment, assigned technician, and status dropdown.

Technician frequency: Constant. This is used every time the job opens.

Always visible: Yes, but it should be smaller and more information-dense.

Space issue: Medium. It repeats information shown again in the summary strip and overview cards.

Recommendation: KEEP + MERGE.

Why: Keep as the primary identity bar. Merge repeated summary facts into a tighter header instead of repeating them below. The header should include job/customer/appliance/status/time/address summary in one compact block.

### Job Name

Current purpose: `Customer · Appliance` headline.

Technician frequency: Constant.

Always visible: Yes.

Space issue: Low to medium.

Recommendation: KEEP.

Why: This is the fastest way to orient the technician. It should remain the largest text on the screen, but not force a second summary block underneath.

### Description / Customer Complaint

Current purpose: Shows original customer issue in Appliance and diagnosis, old detail grid, and sometimes estimate context.

Technician frequency: High during arrival and diagnosis.

Always visible: Yes, but as a short problem line. Full complaint can be expandable.

Space issue: Medium. It appears in more than one place.

Recommendation: MERGE.

Why: Show one compact `Problem` row near the top. Move the longer complaint text into the Diagnosis card or expandable details.

### Status

Current purpose: Status badge, status dropdown, quick START action, workflow actions, Next Action, and parts status buttons.

Technician frequency: High.

Always visible: Yes.

Space issue: High because status appears in multiple places and there are many status-change buttons.

Recommendation: KEEP + MERGE.

Why: Keep one prominent current status and one recommended next action. Move the full status dropdown/actions into a compact workflow rail or expandable `Change status` control. Avoid showing both a broad workflow grid and separate parts status buttons unless the job is actually in a parts state.

### Client / Customer

Current purpose: Customer name, phone, email, call/text/email buttons.

Technician frequency: Very high.

Always visible: Yes.

Space issue: Medium. The communication card also contains service address, appointment, and source.

Recommendation: KEEP + MERGE.

Why: Customer name and call/text shortcuts should be in the top operational card. Email can be secondary. `No Phone`/`No Text` disabled boxes should not take equal space on mobile.

### Phone

Current purpose: Native `tel:` and `sms:` links.

Technician frequency: Very high.

Always visible: Yes when available.

Space issue: Low if rendered as icons/compact buttons; high if rendered as full disabled boxes.

Recommendation: KEEP.

Why: Call and text are core field actions. Show only available actions; hide unavailable actions behind missing-info indicators rather than full disabled buttons.

### Address / Service Address

Current purpose: Appears in the top summary strip, customer communication card, full Service Address edit/map section, and old detail grid.

Technician frequency: Very high before dispatch and arrival; medium after arrival.

Always visible: Yes as a compact location row with map action.

Space issue: High. The full address editor is large and visible inside Overview.

Recommendation: KEEP + COLLAPSE.

Why: Always show the service address and navigation action near the top. Collapse the full edit form and navigation metadata. `Save as Customer Primary Address` is useful, but should appear as a small contextual action only when needed.

### Schedule / Appointment

Current purpose: Header appointment text, customer communication card appointment, Appointment tab scheduling assistant, dispatcher preview, booking button, calendar sync.

Technician frequency: High before the visit, medium during the visit, low after completion.

Always visible: Show current appointment window in header. Full scheduling assistant should not always be visible.

Space issue: Very high in Appointment tab because diagnostics, ranking explanation, availability rules, warnings, safe response draft, saved snapshot, and disabled platform call/message buttons are all visible when expanded.

Recommendation: KEEP + COLLAPSE.

Why: Appointment status/window belongs near the top. Booking or rescheduling belongs in an Appointment drawer/tab. Technical scheduling diagnostics should stay collapsed by default or move to developer/admin details.

### Tags

Current purpose: No obvious production tag block is visible in current Job Workspace.

Technician frequency: Potentially medium in the future, low now.

Always visible: No.

Space issue: None currently.

Recommendation: MOVE.

Why: If tags are introduced, they should be compact chips near the header or in an expandable metadata row. Do not create another large card.

### Team / Assigned Technician

Current purpose: Header subtitle, summary strip, old detail grid, dispatcher matching.

Technician frequency: Medium. Important for dispatchers/owners, less important for assigned technician once opened.

Always visible: Yes as a short label; full matching details no.

Space issue: Medium.

Recommendation: KEEP + COLLAPSE.

Why: Show assigned technician in the header. Put technician matching, backup options, ranking explanation, and availability details behind Appointment details.

### Attachments

Current purpose: Quick action `ATTACH` opens Photos tab. Photos tab uploads and displays gallery.

Technician frequency: High for diagnosis/completion photos.

Always visible: Shortcut yes; full gallery no.

Space issue: Medium in Photos tab; low in overview.

Recommendation: KEEP.

Why: Photo capture is operationally important. Keep the quick action. In the Photos tab, make upload first and gallery compact. Do not show photos as a large overview block unless missing required closeout photos.

### Notes

Current purpose: Quick note tab, technician findings capture in Overview, notes count in current-job history, timeline.

Technician frequency: High, especially findings and internal notes.

Always visible: A findings input or quick note should be easy to reach; full notes list can be tabbed/collapsed.

Space issue: High because technician findings and Notes tab overlap.

Recommendation: MERGE.

Why: `Technician findings` should become the primary diagnosis note entry. The Notes tab should show note history and secondary note types. Avoid two separate note entry mental models.

### Timeline

Current purpose: Timeline tab renders note/status/photo events plus job created event; overview also shows timeline count.

Technician frequency: Medium for context, low during active repair.

Always visible: No.

Space issue: Low when tabbed, but overview history counters take space and add little immediate value.

Recommendation: COLLAPSE.

Why: Keep timeline in its tab. Show only latest meaningful event in overview if useful. Remove large counters unless they become action indicators.

### Finance

Current purpose: Estimate and invoice status appear in Appliance and diagnosis, full estimate builder tab, invoice area inside estimate tab.

Technician frequency: High after diagnosis; low before arrival.

Always visible: Current estimate/invoice state yes. Full builder no.

Space issue: High because Estimate and Invoice share a long tab.

Recommendation: MERGE + MOVE.

Why: Current financial state belongs in the job summary. Full estimate builder belongs in Estimate tab. Invoice controls should either be a compact section after estimates or a separate Finance/Invoice sub-section only when an approved estimate exists.

### Estimate

Current purpose: Diagnosis input, generate estimate, editable lines, warranty, tax/discount, send estimate, saved estimate list, estimate history.

Technician frequency: Very high after diagnosis.

Always visible: Only when the job is ready for estimate. It should be one focused workspace when opened.

Space issue: High but mostly justified. It is a real work surface.

Recommendation: KEEP + COLLAPSE HISTORY.

Why: Keep as a dedicated tab. Keep diagnosis -> generate/review -> send flow. Collapse estimate history by default. Avoid showing history, invoice history, and builder controls all as equal weight.

### Invoice

Current purpose: Invoice cards, send/paid/void actions, history. Currently lives inside the Estimate tab.

Technician frequency: Medium; high at closeout/payment.

Always visible: Current invoice status yes; invoice controls only when needed.

Space issue: Medium to high because it extends the Estimate tab.

Recommendation: MOVE.

Why: Invoice should be a compact current-finance card in overview and a collapsible section in Estimate/Finance. If future payments become important, consider renaming the tab `Finance` or adding an invoice sub-tab, but do not make invoice history compete with estimate creation.

### Payments

Current purpose: No full payment workflow yet. Quick action `PAY` routes to Estimate tab.

Technician frequency: Future high once payment exists.

Always visible: Not yet.

Space issue: Low currently.

Recommendation: MOVE.

Why: `PAY` should eventually route to invoice/payment collection, not estimate creation. Until payments exist, it should be labeled more carefully or hidden unless invoice/payment is available.

### Photos

Current purpose: Upload technician photos, select photo type, show gallery.

Technician frequency: High during diagnosis and completion.

Always visible: Attach shortcut yes; full gallery no.

Space issue: Acceptable inside tab.

Recommendation: KEEP + COMPACT.

Why: Keep the Photos tab. On mobile, prioritize one-tap add photo and show gallery thumbnails below. Photo type can default intelligently and stay editable.

### Property Preview

Current purpose: No true Property Preview exists yet. Current service address/customer/history blocks approximate property context, but they are not property-centered.

Technician frequency: Future high when property/asset history exists.

Always visible: Compact property/address/asset summary yes; full property history no.

Space issue: Current address/history substitutes are duplicative.

Recommendation: MOVE.

Why: Future Property Preview should be a compact top context strip: property address, known assets, open jobs, warranty/notes. Do not add a large property card until the property model exists.

### Repair Intelligence

Current purpose: Button in overview opens Estimate tab; estimate card generates/reviews repair-plan estimate.

Technician frequency: High after findings are captured.

Always visible: Not before diagnosis.

Space issue: Low in overview, high in estimate when combined with all estimate/invoice history.

Recommendation: KEEP + CONTEXTUAL.

Why: Repair Intelligence should feel like part of the estimate/diagnosis workflow, not a separate AI panel. Show it when findings exist or estimate is needed.

### Technician Findings

Current purpose: Large voice-ready note capture card in Overview.

Technician frequency: Very high.

Always visible: Yes during active diagnosis; less important after findings saved.

Space issue: Medium. It is useful, but it competes with Notes and Appliance card.

Recommendation: KEEP + MERGE.

Why: Make this the primary diagnosis input. After a diagnostic note exists, collapse to latest findings with an `Add update` action.

### Parts Workflow

Current purpose: Shows parts status and four status buttons.

Technician frequency: High only when parts are needed.

Always visible: No unless job is in a parts state or estimate includes parts requiring follow-up.

Space issue: Medium.

Recommendation: COLLAPSE.

Why: Keep a small parts state card. Expand only when parts status is active or technician selects `Parts`.

### Customer Repair History / Current Job History

Current purpose: Counts notes/photos/timeline and explains previous customer repairs are not attached yet.

Technician frequency: Low in current form.

Always visible: No.

Space issue: Medium and low value.

Recommendation: REMOVE from overview for now.

Why: Counts do not help the technician act. Move history access to Timeline/Notes/Photos tabs. Add real customer repair history later when data exists.

### Dispatcher Preview / Scheduling Diagnostics

Current purpose: Appointment tab shows recommended technician/window, matching details, ranking reasons, availability rules, backups, warnings/errors, safe response draft, saved snapshot.

Technician frequency: High for dispatcher before booking; low for field technician after schedule is set.

Always visible: No.

Space issue: Very high.

Recommendation: COLLAPSE + MOVE TECHNICAL DETAILS.

Why: Keep recommended technician/window and Book Appointment. Collapse all matching diagnostics. Developer-ish ranking explanations and saved snapshot details should be behind `Details` or moved to dev/admin context.

## Duplicate Information Found

- Customer name appears in header, summary strip, customer communication card, old details grid, and estimate context.
- Service address appears in header/summary strip, customer communication card, full address card, and old details grid.
- Appointment appears in header subtitle, summary strip, customer communication card, appointment tab, and old details grid.
- Appliance appears in header, summary strip, appliance diagnosis card, old details grid, and estimate context.
- Status appears as badge, dropdown, quick action, Next Action, workflow grid, parts workflow, estimate/invoice status signals.
- Issue description appears in appliance diagnosis, old issue description card, and estimate context.
- Estimate/invoice status appears in overview and again in the full Estimate tab.
- Notes/photos/timeline are represented as tabs and also as overview counters.

## Empty Or Low-Value Zones

- Disabled `No Phone`, `No Text`, and platform call/message buttons consume action-sized space without action.
- `Customer repair history` currently shows counts and a note that previous repairs are not attached; this is not useful enough for overview.
- Old overview detail grid repeats job facts already presented above.
- Address `Navigation data` showing coordinates is not normal technician information.
- Appointment diagnostics show many internal matching/ranking details that are not needed for normal field work.
- Estimate history and invoice history can create long scroll even when the technician only needs the current estimate.

## Recommended Future Structure

### Top-To-Bottom Layout

1. Compact sticky job header:
   - Customer / appliance / status.
   - Appointment start/window.
   - Assigned technician.
   - Service address short line.
   - Status dropdown or compact status action.

2. Primary action card:
   - One `Next Action`.
   - One primary button.
   - Secondary actions as icons: Call, Text, Map, Note, Photo.

3. Current job facts:
   - Customer/contact.
   - Service address/map.
   - Appliance/problem.
   - Latest technician findings.
   - Current estimate/invoice/payment state.

4. Diagnosis workspace:
   - Technician findings input.
   - Latest findings.
   - Attach photo.
   - Start estimate when ready.

5. Conditional workflow modules:
   - Appointment module only if unscheduled/rescheduling.
   - Parts module only if parts-needed/ordered/received/return-visit state.
   - Finance module only if estimate/invoice/payment action is needed.

6. Tabs or drawers:
   - Estimate.
   - Invoice / Finance.
   - Notes.
   - Photos.
   - Timeline.
   - Appointment details.

7. History:
   - Collapsed by default.
   - Expand only when technician needs context.

### Recommended Tab Model

- Overview: current facts and next action only.
- Diagnosis: findings, complaint, photos shortcut, repair scope.
- Estimate: estimate creation and current estimates.
- Finance: invoices/payments when payment work exists. Until then, invoices can remain below Estimate but collapsed.
- Schedule: appointment booking/reschedule, details collapsed.
- History: timeline, notes, photos, previous repairs.

If the app keeps the current tab set, then Overview must be aggressively reduced and history/diagnostics must stay inside their existing tabs.

## Block Disposition Summary

| Block | Decision | Reason |
| --- | --- | --- |
| Header | KEEP + MERGE | Essential orientation; remove duplicated summary cards. |
| Job Name | KEEP | Fastest job identity. |
| Description | MERGE | Show short problem near top; long complaint in Diagnosis. |
| Status | KEEP + MERGE | One current status plus one next action; reduce repeated buttons. |
| Client/Customer | KEEP + MERGE | Core context; merge into top facts. |
| Phone | KEEP | Critical field action; hide unavailable actions. |
| Service Address | KEEP + COLLAPSE | Always show address/map; collapse editor/metadata. |
| Schedule | KEEP + COLLAPSE | Show current window; collapse matching diagnostics. |
| Tags | MOVE | Future compact metadata only. |
| Team | KEEP + COLLAPSE | Show assignment; collapse matching/ranking. |
| Attachments | KEEP | Photos are operational; shortcut remains. |
| Notes | MERGE | Merge findings and notes entry model. |
| Timeline | COLLAPSE | Important history, not primary action. |
| Finance | MERGE + MOVE | Current state in overview; controls in Estimate/Finance. |
| Estimate | KEEP + COLLAPSE HISTORY | Core workflow; history should not dominate. |
| Invoice | MOVE | Needs own finance treatment or collapsed section. |
| Payments | MOVE | Future payment workflow; do not route PAY to estimate forever. |
| Photos | KEEP + COMPACT | High-value proof/diagnosis capture. |
| Property Preview | MOVE | Future compact property context after property model exists. |
| Repair Intelligence | KEEP + CONTEXTUAL | Part of diagnosis/estimate, not separate AI feature. |
| Technician Findings | KEEP + MERGE | Primary diagnosis capture; collapse after saved. |
| Parts Workflow | COLLAPSE | Show only when parts state is relevant. |
| Customer Repair History | REMOVE for now | Current block is low-value counters without true history. |
| Dispatcher Preview | COLLAPSE | Useful for scheduling, too technical for default view. |

## Highest-Impact Future Redesign Moves

1. Remove the old repeated overview detail grid and issue-description card.
2. Collapse full Service Address editor by default and keep only compact address/map near top.
3. Replace the broad workflow action grid with one next action plus compact status controls.
4. Merge technician findings with diagnostic notes so there is one note-entry mental model.
5. Collapse Appointment diagnostics by default and show only recommendation/book action.
6. Separate current finance state from full estimate/invoice history.
7. Remove customer repair history counters until real cross-job history exists.
8. Hide disabled/unavailable actions instead of showing large disabled buttons.
9. Make tabs/drawers history-first only when history is requested.
10. Optimize mobile for one-hand use: current action, call/text/map, diagnosis, estimate, photo.

## Non-Goals For Task 162

- No code changes.
- No component changes.
- No refactor.
- No migration.
- No backend or Supabase changes.
- No Retell or Communications Hub changes.
- No Task 163 implementation.

