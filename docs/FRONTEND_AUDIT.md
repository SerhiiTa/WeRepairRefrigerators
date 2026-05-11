# Frontend Audit

## Scope

This audit covers the current `frontend/` implementation for WeRepairRefrigerators. It is documentation-only and reflects the inspected state of the Next.js App Router app, dashboard shell, reusable components, and repair case creation UI.

## 1. Existing Frontend Routes

Current App Router files:

```text
frontend/src/app/
├── layout.tsx
├── page.tsx
├── globals.css
├── favicon.ico
└── dashboard/
    ├── page.tsx
    └── repair-cases/
        └── new/
            └── page.tsx
```

Implemented routes:

- `/`: public homepage for the Houston refrigerator repair MVP.
- `/dashboard`: dashboard overview shell with placeholder cards and a recent repair cases table.
- `/dashboard/repair-cases/new`: repair case creation form UI with mock-only behavior.

Notable route observations:

- The homepage CTA currently links to `/repair-cases/new`, but the implemented repair case creation route is `/dashboard/repair-cases/new`. This should be aligned later.
- Dashboard navigation items are placeholders that use `href="#"` instead of real routes.
- There are no list/detail pages yet for repair cases, AI articles, technicians, or settings.

## 2. Existing Reusable Components

Current shared components:

```text
frontend/src/components/
├── FormField.tsx
├── FormSection.tsx
├── MetricCard.tsx
├── RadioCardGroup.tsx
├── SelectField.tsx
├── StatusBadge.tsx
├── TextArea.tsx
└── TextInput.tsx
```

Component roles:

- `FormField`: label, required marker, optional helper text wrapper.
- `FormSection`: section card with title, description, and content area.
- `MetricCard`: small dashboard statistic card.
- `RadioCardGroup`: card-style radio options.
- `SelectField`: styled select control.
- `StatusBadge`: tone-based status pill.
- `TextArea`: styled multiline input.
- `TextInput`: styled text, number, and telephone input.

Reusable component observations:

- The components are clean, typed, and small.
- Form components are validation-friendly through `id`, `name`, and `required` props.
- `FormField` computes a helper id but does not pass `aria-describedby` into the child input. This can be improved later by either cloning children carefully or moving label/helper behavior into field-specific components.
- `TextInput` currently supports only `text`, `number`, and `tel`. Future forms may need `email`, `url`, `date`, or `datetime-local`.
- The project does not yet have a generic `Button`, `Card`, `Table`, or `PageHeader` component, so styles are repeated in route files.

## 3. Existing Dashboard Components

Current dashboard-specific components:

```text
frontend/src/components/dashboard/
├── DashboardShell.tsx
├── DashboardSidebar.tsx
├── DashboardTopbar.tsx
├── PhotoUploadPlaceholder.tsx
├── RepairCasesTable.tsx
└── SeoMetadataPreview.tsx
```

Component roles:

- `DashboardShell`: main dashboard frame with sidebar, topbar, and content area.
- `DashboardSidebar`: desktop-only sidebar with top-level navigation labels.
- `DashboardTopbar`: page header area with mobile navigation, CTA, and Houston MVP badge.
- `RepairCasesTable`: mock table for recent repair cases.
- `PhotoUploadPlaceholder`: mock upload slots for appliance label, symptom photo, and completed repair.
- `SeoMetadataPreview`: static SEO preview placeholder.

Dashboard observations:

- The shell structure is clear and reusable for dashboard pages.
- The sidebar is hidden on small screens, with mobile navigation handled in the topbar.
- Sidebar and mobile nav share the same item labels but define separate arrays. These should eventually be consolidated into one navigation config.
- Dashboard navigation items are not route-aware yet.
- The topbar title is hardcoded as "Technician command center" on every dashboard page. Future dashboard pages may need page-specific titles, subtitles, and actions passed as props.
- `DashboardTopbar` uses `Link` for the new repair case CTA, which is appropriate for internal navigation.

## 4. Existing Forms/Components From Repair Case Flow

Repair case creation route:

```text
frontend/src/app/dashboard/repair-cases/new/page.tsx
```

Current sections:

- Customer & location
- Appliance information
- Symptoms
- Diagnostic steps
- Parts used
- Repair summary
- Photo upload placeholders
- SEO metadata preview

Current captured fields:

- Customer name
- Phone number
- City
- ZIP code
- Brand
- Model number
- Serial number
- Issue description
- Technician findings
- Part name
- Part number
- Part quantity
- Repair outcome
- Estimated repair cost
- Repair summary

Repair case flow observations:

- The form is currently UI-only and uses `type="button"` for actions, so no submission or persistence is wired.
- The form has `noValidate`, which is acceptable for a mock UI but should be revisited once validation is implemented.
- Required fields are visually marked and passed to the native controls.
- The page keeps mock data local, including the appliance brand list.
- Photo upload and SEO preview are intentionally placeholder-only.
- No server actions, client state, Supabase calls, or upload logic exist yet.

## 5. Existing Layout Structure

Root layout:

```text
frontend/src/app/layout.tsx
```

Current behavior:

- Loads Geist and Geist Mono with `next/font/google`.
- Defines app-level metadata for WeRepairRefrigerators.
- Applies `h-full antialiased` on `<html>`.
- Applies `min-h-full flex flex-col` on `<body>`.

Dashboard layout pattern:

- There is no route-level `src/app/dashboard/layout.tsx` yet.
- Dashboard pages manually wrap content in `DashboardShell`.
- This works for the current small app, but a route-level dashboard layout would reduce repetition as more dashboard pages are added.

Global styles:

```text
frontend/src/app/globals.css
```

Current behavior:

- Imports Tailwind CSS.
- Defines root foreground/background variables.
- Maps Geist font variables through Tailwind theme inline tokens.
- Sets global body background, color, and font family.

## 6. Current UI Architecture

The UI architecture is a static, mock-driven frontend:

- Next.js App Router pages render server-side by default.
- Tailwind utility classes drive all styling.
- Components are split between generic shared components and dashboard-specific modules.
- Current data is local array data inside route or component files.
- No client components are required yet.
- No authentication, database, API routes, or server actions are implemented.

Strengths:

- Clean dark SaaS visual direction.
- Good early separation between dashboard shell, dashboard modules, and shared form controls.
- Simple static route implementation that is easy to iterate.
- TypeScript props are explicit and easy to follow.

Risks:

- Route pages will grow quickly if mock data, page headers, actions, and form sections continue living directly in page files.
- Navigation is not yet centralized.
- Form controls are not yet connected to validation, error messages, or submit handling.
- Several visual patterns are repeated with raw Tailwind classes.

## 7. Missing Pages/Modules

High-priority missing frontend routes:

- `/dashboard/repair-cases`: repair case list page.
- `/dashboard/repair-cases/[id]`: repair case detail/preview page.
- `/dashboard/ai-articles`: AI article draft list.
- `/dashboard/ai-articles/[id]`: AI article review/edit page.
- `/dashboard/technicians`: technician profile list.
- `/dashboard/technicians/[id]`: technician profile detail/edit page.
- `/dashboard/settings`: settings placeholder.

Missing UI modules:

- Route-aware dashboard navigation config.
- Dashboard page header component.
- Empty states.
- Loading states.
- Error states.
- Generic table component or table primitives.
- Generic button/link button component.
- Form validation message component.
- Repair case summary/preview component.
- Article draft preview component.

Missing behavior:

- Form validation.
- Submit handling.
- Draft save state.
- Repair case preview flow.
- Mock route transitions from dashboard cards/nav.
- Real uploads.
- Auth-protected dashboard pages.
- Backend persistence.

## 8. Duplicate Components That Should Be Consolidated Later

Items to consolidate later:

- Sidebar and mobile nav item arrays are duplicated in `DashboardSidebar` and `DashboardTopbar`.
- Dashboard hero/header card styling appears in both `/dashboard` and `/dashboard/repair-cases/new`.
- CTA button styles are repeated across homepage, dashboard, and repair case form.
- Card styling is repeated across feature cards, dashboard cards, form sections, and placeholders.
- Inline SVG icons in the homepage are local to the page. If icons expand, centralize simple internal icons or adopt an approved icon strategy.
- Placeholder arrays and mock data are colocated in components/routes. Future mock fixtures could move to `src/lib/mock-data` or similar.

Recommended consolidation path:

1. Create a shared dashboard navigation config.
2. Add a `DashboardPageHeader` component.
3. Add `ButtonLink` and `Button` primitives.
4. Add `Card` or `Panel` primitives once repeated card styling stabilizes.
5. Move mock repair case data into one source when list/detail pages are added.

## 9. Recommended Next Frontend Tasks

Recommended next tasks in order:

1. Fix homepage CTA route so "Create Repair Case" points to `/dashboard/repair-cases/new`.
2. Create `/dashboard/repair-cases` list route using the existing repair case table pattern.
3. Create `/dashboard/repair-cases/[id]` preview route using mock repair case data.
4. Add a route-aware dashboard navigation config and replace `href="#"` placeholders.
5. Extract a reusable `DashboardPageHeader` component.
6. Add basic validation UI patterns for the repair case form.
7. Add mock success/preview state for repair case creation.
8. Add placeholder pages for AI Articles, Technicians, and Settings.
9. Add reusable empty/loading/error state components.
10. Review mobile dashboard navigation after more pages exist.

## 10. Technical Debt / Cleanup Recommendations

Cleanup recommendations:

- Replace placeholder dashboard nav anchors with real `Link` routes once pages exist.
- Introduce route-level dashboard layout at `src/app/dashboard/layout.tsx` when multiple dashboard routes share the shell.
- Make `DashboardTopbar` accept page title, eyebrow, actions, and badge props.
- Add accessibility linkage for helper text and future error messages in form fields.
- Add error-message props or validation slots to form controls.
- Expand form input types only as needed.
- Avoid letting route files accumulate large data arrays and repeated UI sections.
- Normalize internal navigation to use `next/link`.
- Keep mock-only UI clearly separated from future persistence logic.
- Run `npm run lint` and `npm run build -- --webpack` before reporting frontend implementation changes.

## Summary

The frontend is in a healthy early-MVP state: clear App Router routes, a reusable dashboard shell, focused shared components, and a complete mock repair case form. The next major frontend effort should be connecting the existing dashboard navigation to real placeholder routes, adding repair case list/detail pages, and consolidating repeated page header, navigation, card, and button patterns before adding Supabase or AI functionality.

## Task 29-34 Update

This addendum reflects the current implemented frontend after marketplace analytics, open jobs, technician community, repair help request, discussion detail, and reputation mock systems were added.

### New Dashboard Routes

Current dashboard route additions:

- `/dashboard/analytics`: marketplace lead source analytics mock.
- `/dashboard/open-jobs`: open marketplace job board mock.
- `/dashboard/community`: private technician community and knowledge base preview.
- `/dashboard/community/new`: repair help request creation mock.
- `/dashboard/community/[discussionId]`: technician discussion detail mock.
- `/dashboard/community/reputation`: technician reputation and expert badge mock.
- `/dashboard/coverage`: technician availability/workload coverage preview.
- `/dashboard/leads`: marketplace lead inbox.
- `/dashboard/leads/preview`: dashboard preview bridge from public intake.

All of these routes are mock/demo-only and use static data or local component state.

### Analytics And Open Jobs Architecture

Analytics files:

- `frontend/src/app/dashboard/analytics/page.tsx`
- `frontend/src/components/dashboard/AnalyticsOverview.tsx`
- `frontend/src/components/dashboard/LeadSourceBreakdown.tsx`
- `frontend/src/components/dashboard/TechnicianPerformanceBoard.tsx`
- `frontend/src/components/dashboard/ZipDemandBoard.tsx`
- `frontend/src/data/mock-analytics.ts`
- `frontend/src/types/analytics.ts`

Open jobs files:

- `frontend/src/app/dashboard/open-jobs/page.tsx`
- `frontend/src/components/dashboard/OpenJobsBoard.tsx`
- `frontend/src/components/dashboard/OpenJobCard.tsx`
- `frontend/src/components/dashboard/OpenJobFilters.tsx`
- `frontend/src/components/dashboard/OpenJobStats.tsx`
- `frontend/src/data/mock-open-jobs.ts`
- `frontend/src/types/open-jobs.ts`

Open job acceptance is local client state only. It does not persist, lock, notify, dispatch, or create repair cases.

### Technician Community Components

Community files:

- `frontend/src/app/dashboard/community/page.tsx`
- `frontend/src/app/dashboard/community/new/page.tsx`
- `frontend/src/app/dashboard/community/[discussionId]/page.tsx`
- `frontend/src/components/dashboard/CommunityOverview.tsx`
- `frontend/src/components/dashboard/CommunityDiscussionCard.tsx`
- `frontend/src/components/dashboard/CommunityFilters.tsx`
- `frontend/src/components/dashboard/CommunityLanguageBadge.tsx`
- `frontend/src/components/dashboard/CommunityAISummaryPreview.tsx`
- `frontend/src/components/dashboard/CommunityKnowledgeCaseCard.tsx`
- `frontend/src/components/dashboard/RepairHelpRequestForm.tsx`
- `frontend/src/components/dashboard/RepairHelpRequestPreview.tsx`
- `frontend/src/components/dashboard/DiscussionThread.tsx`
- `frontend/src/components/dashboard/DiscussionMessageCard.tsx`
- `frontend/src/components/dashboard/AcceptedSolutionCard.tsx`
- `frontend/src/components/dashboard/DiscussionSidebar.tsx`
- `frontend/src/components/dashboard/DiscussionAISummaryPanel.tsx`
- `frontend/src/data/mock-community.ts`
- `frontend/src/types/community.ts`

Community behavior is dashboard-only and private-by-design. Discussion replies can be appended locally on detail pages, but refresh clears them. Multilingual previews and AI summaries are static mock text.

### Reputation Components

Reputation files:

- `frontend/src/app/dashboard/community/reputation/page.tsx`
- `frontend/src/components/dashboard/ReputationOverview.tsx`
- `frontend/src/components/dashboard/ReputationFilters.tsx`
- `frontend/src/components/dashboard/TechnicianLeaderboard.tsx`
- `frontend/src/components/dashboard/TechnicianExpertCard.tsx`
- `frontend/src/components/dashboard/ExpertBadgeGrid.tsx`
- `frontend/src/components/dashboard/TechnicianSpecialtyBadge.tsx`
- `frontend/src/data/mock-reputation.ts`
- `frontend/src/types/reputation.ts`

The reputation system is static and mock-only. Filtering and sorting are local client behavior and should not be treated as real ranking, verification, or payment eligibility logic.

### Mock State Patterns

Current local-only state patterns:

- AI workflow selected repair case and review status.
- Lead inbox status overrides and conversion preview state.
- Open job accept/assigned state.
- Repair help request live preview and local submit success state.
- Discussion detail local reply append state.
- Reputation leaderboard filters and sorting.

None of these states persist after refresh.

### Remaining Frontend Gaps

- No authentication or protected dashboard routes.
- No Supabase/database persistence.
- No server actions or route handlers for mutations.
- No real uploads.
- No live chat/WebSockets.
- No real analytics tracking.
- No dispatch locking or notifications.
- No real AI, translation, or vector/RAG pipeline.
- No production moderation, permissions, or audit logging for technician community content.
- No real payment, subscription, payout, or paid lead system.
