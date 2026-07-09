# Post-Call Workflow Spec

Task 159.1 defines the post-call workflow before further Communications Hub implementation.

The Communications Hub should not become a duplicate Customer CRM, Job Workspace, or Dashboard. It should answer only:

- Who contacted us?
- What did they say?
- Is this an existing customer?
- Is there an intake?
- Is there a job?
- What is the next required action?

## A. Call Completed

Retell/Telnyx/provider work ends outside the normal technician UI.

The Communications Hub should show the completed call as a conversation record with:

- Channel.
- Customer name if known.
- Phone/email if available.
- Last activity.
- Recording indicator if available.

Do not show provider debug events in normal UI.

## B. Transcript Received

The transcript belongs to the conversation.

Normal UI should show:

- Transcript preview.
- Audio player if recording exists.
- Business timeline events.

Do not show raw payloads, provider metadata, confidence scores, language detection, or normalization internals.

## C. AI Extraction Complete

Extraction may populate intake fields, summary, next action, appliance details, address, and appointment preferences.

Normal UI should show the extracted business facts only:

- Problem summary.
- Service address.
- Appliance/brand/model when available.
- Preferred appointment details when available.

Do not show AI implementation details.

## D. Conversation Created

Every call should create or reuse a conversation.

The conversation is the communication record, not the job and not the customer profile.

## E. Intake Created

If the call includes a repair request, create or reuse intake.

Intake is the review step before a CRM job exists.

The Hub should link to Intake for review/conversion. It should not duplicate the full Intake Inbox editor.

## F. Customer Matching Result

States:

- Matched.
- Possible match.
- Not matched.

Hub behavior:

- Matched: customer name/card opens Customer CRM.
- Possible match: route to Intake/Customer matching workflow.
- Not matched: route to Create / Match Customer from Intake.

The Hub should not duplicate the full Customer CRM workspace.

## G. Appliance Matching Result

States:

- Matched.
- Possible match.
- Not matched.

Hub behavior:

- Matched: show concise appliance label.
- Possible match: indicate that an appliance may need review.
- Not matched: keep the appliance as extracted intake/job text until a customer asset is created or matched.

The Hub should not duplicate full appliance management.

## H. Job State

States:

- No job yet.
- Converted job exists.
- Existing open job may be related.

Hub behavior:

- No job yet: route to Convert to Job through Intake.
- Converted job exists: job card opens Job Workspace.
- Existing open job may be related: route to Intake/Customer review until a safe matching workflow exists.

The Hub should not duplicate Job Workspace.

## I. Required Next Action

Allowed next actions:

- Review Intake.
- Create / Match Customer.
- Create / Match Appliance.
- Convert to Job.
- Open Job.
- Schedule.
- No action needed.

Actions should use existing workflows only.

## Desired Communications Hub UX

Left column:

- Conversation list only.

Center:

- Selected conversation decision card.
- The card answers the post-call workflow questions above.

Right:

- Transcript.
- Audio.
- Timeline.

Avoid:

- Duplicate long Customer CRM panels.
- Duplicate Job Workspace panels.
- Random extra operational cards.
- Technical/provider/AI implementation detail.

## Task 159 Recovery Decision

Task 159 added useful context but made the Hub feel more complex without making the workflow clearer.

Task 159.1 recovers the Hub by keeping:

- Conversation list.
- Existing recording playback.
- Transcript/message preview.
- Business timeline.
- Links to existing Intake, Customer, and Job workflows.

Task 159.1 removes:

- Duplicate customer-workspace style panels.
- Duplicate job-workspace style panels.
- Extra operational cards that do not answer the post-call decision.
