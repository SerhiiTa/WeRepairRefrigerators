# COM-07A Existing Booking Sources Inventory And Integration Plan

## Purpose

This checkpoint inventories HomeFix's known booking/form sources before WRA builds a reusable Hosted Booking Page and Embedded Booking Widget.

The goal is not to create a separate booking system per website. Existing forms can feed WRA during transition, but the long-term direction is one reusable WRA booking experience with per-source configuration and shared unified inbound persistence.

## Existing Source Inventory

| Source | Current state | Temporary integration strategy | Long-term strategy | Later verification needed |
| --- | --- | --- | --- | --- |
| `werepairsubzero.com` | Custom website with an existing booking form. Real Production booking has already been verified through Website -> Cloudflare Worker -> WRA Production, with Telegram still receiving notification-only delivery. | Keep the current WRA integration working as-is. Treat it as the first proven Existing Form Adapter path. | Later move to the shared Embedded WRA Booking Widget only if it gives a real product or maintenance benefit. The source should remain attributed as `werepairsubzero.com`. | Confirm only when changing the site/widget, not during this planning task. |
| `appliancerepair-homefix.com` | Main HomeFix WordPress site. Existing form uses a WordPress form plugin, likely free/limited. | Later inspect the WordPress form capability. If it can POST server-side or webhook reliably, connect the existing form to WRA Public Inbound API. If not, use Hosted Booking Page first. | Prefer the shared WRA Widget once widget delivery is production-ready and the WordPress integration path is clear. | Exact plugin, webhook/API support, server-side secret handling, current destination, fields, spam protection. |
| `fixhomehouston.com` | WordPress site. Existing website/form situation still needs confirmation. | Later inspect whether a real booking/contact form exists and whether it can safely connect to WRA. | Use Hosted Booking Page or Embedded WRA Widget depending on the site's actual form architecture. | Whether a form exists, current form plugin, submission destination, webhook/API support, field coverage. |
| `refrigeratorrepairhouston.com` | Custom website with an existing form. Focused on refrigeration equipment. | Later connect the existing form to WRA Public Inbound API where practical. | Move to the shared WRA Widget if useful, configured as refrigeration-only rather than all HomeFix services. | Actual local form submission flow, server-side capability, current endpoint/destination, field coverage, spam protection. |
| HomeFix Google Business Profile | Currently uses a Workiz booking/form link. | Keep the Workiz link active. Do not replace it until WRA Hosted Booking Page is production-ready and manually verified. | Replace with a WRA-hosted booking URL, one source-configured link for the HomeFix GBP. | Current GBP booking URL and source naming at the replacement checkpoint. |
| Houston Home Fix Google Business Profile | Currently uses a Workiz booking/form link. | Keep the Workiz link active. Do not replace it until WRA Hosted Booking Page is production-ready and manually verified. | Replace with a WRA-hosted booking URL, one source-configured link for the Houston Home Fix GBP. | Current GBP booking URL and source naming at the replacement checkpoint. |

## Transition Matrix

| Source | Temporary classification | Long-term classification | Notes |
| --- | --- | --- | --- |
| `werepairsubzero.com` | KEEP CURRENT WRA INTEGRATION | LATER MOVE TO WRA WIDGET | Current Worker -> WRA integration is proven and should not be disrupted. |
| `appliancerepair-homefix.com` | CONNECT EXISTING FORM TO WRA | LATER MOVE TO WRA WIDGET | WordPress limitations may make Hosted Booking Page the safer interim path. |
| `fixhomehouston.com` | CONNECT EXISTING FORM TO WRA | LATER MOVE TO WRA WIDGET | Requires later confirmation of the actual form architecture. |
| `refrigeratorrepairhouston.com` | CONNECT EXISTING FORM TO WRA | LATER MOVE TO WRA WIDGET | Future source config must restrict choices to refrigeration-related services. |
| HomeFix Google Business Profile | Keep Workiz until WRA replacement is ready | REPLACE WITH WRA HOSTED BOOKING | Replace only after manual Production verification. |
| Houston Home Fix Google Business Profile | Keep Workiz until WRA replacement is ready | REPLACE WITH WRA HOSTED BOOKING | Replace separately from the HomeFix GBP link. |

## Target Booking Architecture

### Hosted Booking Page

A WRA-hosted URL presents the reusable booking experience and sends the booking through WRA unified inbound. This is the preferred future path for Google Business Profile booking links, SMS/email booking links, companies without their own website, and new WRA SaaS customers.

### Embedded WRA Booking Widget

A customer website embeds the same underlying WRA booking experience and configuration as the Hosted Booking Page. The widget passes source identity and attribution into WRA, then relies on the same unified inbound architecture and future central Availability Engine.

### Existing Form Adapter/API

An existing site form can keep its current UX while a trusted backend, Worker, or adapter sends the submission to WRA Public Inbound API. This is the transition path already proven by `werepairsubzero.com`.

The current WRA website inbound endpoint supports credential-authenticated server-to-server submission. Source identity comes from the verified credential linked to `inbound_sources`; submitted domain/page/UTM data is attribution, not authentication.

All three modes must converge into:

`Booking/Form Source -> WRA Public Inbound API/Gateway -> Communications + Intake -> future Job/Appointment rules`

## Source Configuration Requirements

A future Booking Source configuration should conceptually define:

- company ownership
- public source identity and source name
- website/domain and allowed domains
- brand/display settings
- delivery mode: hosted page, embedded widget, or existing form adapter
- allowed service categories
- allowed appliance/equipment types
- default service type
- service territory or ZIP/service-area constraints
- attribution defaults such as campaign, landing page, UTM, and tracking number context
- future availability/direct-booking behavior
- whether dispatcher review is required before Job/Appointment creation

Do not hardcode one global service picker.

Examples:

- HomeFix source: may allow refrigerator, washer, dryer, dishwasher, oven/range, ice maker, wine cooler, and other approved appliance services.
- Refrigerator Houston Repair source: should allow only refrigeration-related equipment such as refrigerator, freezer, ice maker, and wine cooler.
- Future HVAC source: can allow AC, furnace, heat pump, mini split, and similar HVAC categories.

This document does not design tables or migrations for that configuration.

## Workiz Exit Requirement

The existing Workiz booking links on HomeFix Google Business Profile and Houston Home Fix Google Business Profile must remain active until the WRA Hosted Booking Page is production-ready and manually verified.

After verification, replace the Google Business Profile links one at a time with WRA booking URLs. Do not replace both at once.

## Recommended Execution Order

1. Inventory complete.
2. Connect remaining existing forms where practical using the current WRA inbound API.
3. Define reusable Booking Source configuration.
4. Build WRA Hosted Booking Page.
5. Replace Workiz GBP booking links one at a time after Production verification.
6. Build or reuse the same booking component as the Embedded WRA Widget.
7. Migrate existing websites to the Widget only where it provides a real benefit.

## Unresolved Questions For Later Inspection

- Which exact WordPress form plugin powers `appliancerepair-homefix.com`, and can it call a secure server-side webhook without exposing WRA credentials?
- Does `fixhomehouston.com` currently have a live booking/contact form, and where does it submit?
- What is the exact form submission flow for `refrigeratorrepairhouston.com`?
- Which source-specific service choices, territory rules, and direct-booking/review rules should each HomeFix source use?
- What URL naming convention should WRA use for hosted booking pages before replacing Google Business Profile Workiz links?

## Non-Goals

This checkpoint does not inspect website repositories, access WordPress, change Workiz, change Google Business Profiles, create schema, create migrations, deploy, or implement the Hosted Booking Page/Widget.
