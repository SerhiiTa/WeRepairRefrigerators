# WRA Platform Bible

This folder contains the permanent source-of-truth documentation for the WeRepairRefrigerators platform.

Reading order:

1. WRA_00_ROADMAP_MASTER.docx
2. WRA_09_IMPLEMENTATION_HISTORY_AND_PROJECT_STATE.docx
3. WRA_10_EXECUTION_ROADMAP_AND_DEVELOPMENT_PLAN.docx

Then review the remaining documents as needed.

Every future major architectural decision, workflow change, customer feature, technician feature, marketplace feature, CRM feature, AI feature, inventory feature, vendor integration, or dashboard redesign must remain aligned with these documents.

Task 145 begins the customer marketplace/account foundation in the application. Customer-facing implementation work should remain aligned with `WRA_04_CUSTOMER_MARKETPLACE_AND_CUSTOMER_PORTAL.docx` and the current implementation note at `../CUSTOMER_MARKETPLACE_FOUNDATION_TASK145.md`.

Task 146 SQL/QA note: the corrected customer foundation migration must include customer account linking and dashboard-safe customer visibility helpers before end-to-end customer QA is treated as complete.

Task 146 follow-up: after applying `0035`, also apply `0036_customer_service_request_self_read_apply_ready.sql` before treating the customer portal service request history as complete.

Task 146 final note: after `0036`, the remaining customer foundation QA dependency is confirmed dev credentials for both customer and dashboard roles.

Task 146.1 fixture note: `supabase/fixtures/customer_marketplace_qa_accounts_task146.sql` prepares confirmed-account customer QA data after the Auth users are manually created and confirmed in dev/staging.
