#!/usr/bin/env node

/**
 * Dev/staging-only QA Auth helper.
 *
 * This script intentionally refuses to touch any email that does not start
 * with `qa-`. Do not use Supabase Admin API ad hoc for QA users; route future
 * QA account provisioning through this guard so project-owner/customer emails
 * cannot be modified by accident.
 */

const email = (process.argv[2] ?? "").trim().toLowerCase();

if (!email) {
  console.error("Usage: node supabase/fixtures/provision_qa_auth_user.mjs qa-example@example.test");
  process.exit(1);
}

if (!email.startsWith("qa-")) {
  console.error(
    `Refusing to provision or modify non-QA email: ${email}. QA fixture emails must start with qa-.`,
  );
  process.exit(2);
}

console.log(
  `QA email guard passed for ${email}. Add project-specific provisioning here only after preserving this non-QA refusal.`,
);
