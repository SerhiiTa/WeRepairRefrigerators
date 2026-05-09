# Architecture

## Frontend architecture

The current application is a Next.js App Router frontend in `frontend/`. It uses TypeScript, Tailwind CSS, and reusable React components. Current pages are static UI surfaces with mock data and no backend integration.

The frontend should remain simple and production-ready:

- Use semantic HTML.
- Keep components focused.
- Keep route pages thin where possible.
- Prefer reusable UI components for form fields, dashboard layout, cards, badges, and tables.
- Avoid new dependencies unless explicitly approved.

## App Router structure

Current routes:

```text
src/app/
├── page.tsx
├── layout.tsx
├── globals.css
└── dashboard/
    ├── page.tsx
    └── repair-cases/
        └── new/
            └── page.tsx
```

Expected near-term routes:

```text
/dashboard
/dashboard/repair-cases
/dashboard/repair-cases/new
/dashboard/repair-cases/[id]
/dashboard/ai-articles
/dashboard/technicians
/dashboard/settings
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

## Future backend/API architecture

No backend is implemented yet. Future backend work should use server-side patterns compatible with Next.js App Router, such as:

- Server Components for secure reads where appropriate
- Server Actions for controlled mutations
- Route handlers for API endpoints that need explicit HTTP contracts
- Shared validation schemas once validation strategy is selected

Backend code should avoid exposing secrets to the client. API keys and service credentials must stay server-side.

## Future Supabase schema overview

Likely tables:

- `profiles`: authenticated user profile data
- `technicians`: technician profile and service information
- `repair_cases`: customer location, appliance details, issue, findings, outcome, and cost fields
- `repair_case_parts`: parts used per repair case
- `repair_case_photos`: uploaded photo metadata and storage references
- `ai_article_drafts`: generated article drafts tied to repair cases
- `published_pages`: approved SEO pages and metadata

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
