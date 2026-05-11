# Architecture

## Frontend architecture

The current application is a Next.js App Router frontend in `frontend/`. It uses TypeScript, Tailwind CSS, and reusable React components. Current pages are static UI surfaces with mock data and no backend integration.

The frontend should remain simple and production-ready:

- Use semantic HTML.
- Keep components focused.
- Keep route pages thin where possible.
- Prefer reusable UI components for form fields, dashboard layout, cards, badges, and tables.
- Avoid new dependencies unless explicitly approved.

The current product is frontend-first. Public marketplace, dashboard CRM, and technician community workflows are implemented with mock/static data before backend contracts are introduced.

## Current architecture layers

### Public marketplace

The public layer is customer-facing and SEO-oriented:

- Public homepage.
- Brand, service, location, and public repair case routes.
- Technician listing/detail routes.
- ZIP-based technician discovery at `/find-technician`.
- Unified service intake at `/schedule-service`.
- Public SEO data, metadata utilities, internal links, and refrigeration visual components.

Public pages must remain privacy-safe and must not expose dashboard-only repair case data, private notes, customer phone numbers, emails, full addresses, or technician-community content.

### Dashboard CRM

The internal dashboard layer is technician/business-facing:

- Dashboard shell and route-level dashboard layout.
- Repair case list, creation, and detail preview.
- Lead inbox, lead detail, lead conversion preview, and dashboard lead preview.
- Coverage/workload board.
- Marketplace analytics dashboard.
- Open Job Board for mock unassigned marketplace jobs.
- AI workflow mock for transforming repair case information into public-safe SEO content.

Dashboard CRM systems currently use static/mock data and local component state only.

### Technician community

The private technician community layer is dashboard-only:

- Community discussions and knowledge base preview.
- Repair help request creation mock.
- Discussion detail thread pages.
- Multilingual static translated previews.
- AI summary preview panels.
- Accepted solution display.
- Reputation, expert badges, and technician leaderboard.

These routes are intended for verified technicians only in production. They are not public, not SEO-indexed, and not connected to real chat, translation, AI, or persistence yet.

## App Router structure

Current routes:

```text
src/app/
├── page.tsx
├── layout.tsx
├── globals.css
├── brands/
├── find-technician/
├── locations/
├── repair-cases/
├── schedule-service/
├── services/
├── technicians/
└── dashboard/
    ├── analytics/
    ├── community/
    │   ├── [discussionId]/
    │   ├── new/
    │   └── reputation/
    ├── coverage/
    ├── leads/
    ├── open-jobs/
    ├── page.tsx
    └── repair-cases/
        └── new/
            └── page.tsx
```

## Components structure

Current component folders:

```text
src/components/
├── dashboard/
│   ├── DashboardShell.tsx
│   ├── DashboardSidebar.tsx
│   ├── DashboardTopbar.tsx
│   ├── PhotoUploadPlaceholder.tsx
│   ├── RepairCasesTable.tsx
│   └── SeoMetadataPreview.tsx
├── public/
├── ui/
├── FormField.tsx
├── FormSection.tsx
├── MetricCard.tsx
├── RadioCardGroup.tsx
├── SelectField.tsx
├── StatusBadge.tsx
├── TextArea.tsx
└── TextInput.tsx
```

Dashboard-specific components should stay in `src/components/dashboard`. Generic reusable components can live directly in `src/components` until a larger design system emerges.

Dashboard modules added during the mock marketplace/community phase include:

- Analytics components: `AnalyticsOverview`, `LeadSourceBreakdown`, `TechnicianPerformanceBoard`, `ZipDemandBoard`.
- Open jobs components: `OpenJobsBoard`, `OpenJobCard`, `OpenJobFilters`, `OpenJobStats`.
- Community components: `CommunityOverview`, `CommunityDiscussionCard`, `CommunityFilters`, `CommunityAISummaryPreview`, `CommunityKnowledgeCaseCard`, `CommunityLanguageBadge`.
- Discussion detail components: `DiscussionThread`, `DiscussionMessageCard`, `AcceptedSolutionCard`, `DiscussionSidebar`, `DiscussionAISummaryPanel`.
- Reputation components: `ReputationOverview`, `ReputationFilters`, `TechnicianLeaderboard`, `TechnicianExpertCard`, `ExpertBadgeGrid`, `TechnicianSpecialtyBadge`.

Mock data lives in `src/data` and shared TypeScript contracts live in `src/types`.

## Future backend/API architecture

No backend is implemented yet. Future backend work should use server-side patterns compatible with Next.js App Router, such as:

- Server Components for secure reads where appropriate
- Server Actions for controlled mutations
- Route handlers for API endpoints that need explicit HTTP contracts
- Shared validation schemas once validation strategy is selected

Backend code should avoid exposing secrets to the client. API keys and service credentials must stay server-side.

Future backend boundaries:

- Public intake should create marketplace lead records through server-side validation.
- Dashboard lead conversion should create repair case drafts through server-side mutations.
- Open job claiming must use server-side locking to prevent duplicate acceptance.
- Technician community discussions and replies require authentication, authorization, moderation, and audit logging.
- AI summary, translation, and RAG indexing must run server-side and exclude private customer identifiers.

## Future Supabase schema overview

Likely tables:

- `profiles`: authenticated user profile data
- `technicians`: technician profile and service information
- `repair_cases`: customer location, appliance details, issue, findings, outcome, and cost fields
- `repair_case_parts`: parts used per repair case
- `repair_case_photos`: uploaded photo metadata and storage references
- `ai_article_drafts`: generated article drafts tied to repair cases
- `published_pages`: approved SEO pages and metadata
- `marketplace_leads`: public intake requests and source attribution
- `open_jobs`: unassigned marketplace jobs and dispatch status
- `technician_availability`: availability, workload, and service-area coverage
- `community_discussions`: private technician repair help discussions
- `community_messages`: private technician replies
- `community_knowledge_cases`: approved private troubleshooting summaries
- `technician_reputation_events`: accepted solutions, helpful replies, badges, and scoring events

Every table that stores user-owned data should have Row Level Security enabled before production use.

## Future AI pipeline overview

The AI pipeline should remain human-reviewed:

1. Technician creates or completes a repair case.
2. System extracts safe, structured repair details.
3. AI generates an SEO article draft and metadata.
4. Technician or admin reviews and edits the draft.
5. Approved content is published to public SEO pages.
6. Draft inputs, outputs, review status, and publishing status are stored for auditability.

No AI-generated content should publish automatically without manual approval.

Private technician AI features should remain separate from public SEO generation:

1. Technician discussion or repair case is transformed into a privacy-safe structured draft.
2. AI generates a private summary, troubleshooting outline, translation preview, or public SEO draft depending on workflow.
3. Technician/admin reviews and approves the output.
4. Public content and private knowledge cases are stored separately.
5. Vector/RAG indexing is limited to approved private knowledge cases and must not contain customer PII.
