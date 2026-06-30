# Task 148.13 Repair Intelligence Estimate QA Access

## Purpose

Task 148.12 could not complete authenticated estimate save/reopen QA because the Codex in-app browser had no dashboard session and the repository does not store test passwords. Task 148.13 defines the dev/staging-only setup needed to create a dashboard-ready QA account and a visible service request for Repair Intelligence persistence testing.

## Security Boundaries

- Do not store passwords in git, docs, SQL, screenshots, or browser logs.
- Do not apply this fixture to production.
- Do not add auth bypasses or service-role usage to the frontend.
- This setup uses normal Supabase Auth login in the browser.
- The fixture temporarily disables profile protection triggers only inside the SQL Editor admin session for a controlled dev/staging profile update.
- This task does not start Task 149 and does not touch inventory, vendor search, payments, community, dashboard redesign, or estimate UI redesign.

## Dev Test Account Setup

1. In the dev/staging Supabase dashboard, create or update this Auth user:
   - Email: `qa-estimate-tech@example.com`
   - Temporary password: create one locally and store it in a password manager only.
   - Confirm the user if email confirmation is enabled.
   - Task 148.14 finding: the Auth user was automatically created with Supabase Admin API after `SUPABASE_SERVICE_ROLE_KEY` was added. The local-only generated password is stored outside the repository in `/private/tmp/wra-qa-estimate-tech-example-com-password.txt`.
2. Apply the company-scope fix migration in Supabase SQL Editor:
   - `supabase/migrations/0044_repair_intelligence_estimate_persistence_company_scope_fix_apply_ready.sql`
3. Apply the fixture in Supabase SQL Editor:
   - `supabase/fixtures/repair_intelligence_estimate_qa_fixture.sql`
4. The fixture prepares:
   - active `verified_technician` profile with completed onboarding;
   - active company and active owner membership for company-scoped estimate RPCs;
   - public-ready technician profile;
   - one private service request named `QA Estimate Persistence`;
   - no real phone numbers.

## Browser QA Steps

1. Start the local app on `localhost:3002`.
2. Log in at `/login` with the QA email and the locally stored temporary password.
3. Open `/dashboard/leads`.
4. Open the `QA Estimate Persistence` job.
5. In the estimate card, enter:

   ```text
   Линейный компрессор работает но не производит холод
   ```

6. Click `Generate Estimate`.
7. Confirm generated estimate lines appear in the builder and are meaningful for LG sealed-system/compressor diagnosis.
8. Confirm the compact Repair Plan summary appears for the technician.
9. Click `Send Estimate` or save the draft path available in the current estimate card.
10. Leave the job, then reopen the same job from `/dashboard/leads`.
11. Confirm:
    - the saved estimate still exists;
    - line items remain attached to the estimate;
    - total is not `$0`;
    - Repair Plan summary was included in the estimate learning context if `record_estimate_learning_event_rpc` is applied.

## SQL Verification

After saving an estimate, verify rows in Supabase SQL Editor:

```sql
select e.id, e.estimate_number, e.estimate_status, e.subtotal, e.total,
       count(i.id) as line_count
from public.service_request_estimates e
left join public.service_request_estimate_items i on i.estimate_id = e.id
where e.service_request_id in (
  select id
  from public.service_requests
  where customer_email = 'qa-estimate@example.test'
)
group by e.id
order by e.created_at desc;

select event_type, diagnosis_text, decision_context->'repairPlanSummary' as repair_plan_summary,
       created_at
from public.estimate_learning_events
where service_request_id in (
  select id
  from public.service_requests
  where customer_email = 'qa-estimate@example.test'
)
order by created_at desc;
```

## Current Result

Codex created the Auth user through Supabase Admin API and stored a local-only generated password outside the repository. Automatic SQL application is still unavailable because this checkout has no database URL, no Supabase CLI, no SQL execution RPC, and Supabase Management SQL rejects the service-role key. Apply migration `0044` and then the fixture manually in dev/staging before rerunning browser persistence QA.
