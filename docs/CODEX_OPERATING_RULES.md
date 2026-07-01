# WRA CODEX OPERATING RULES

These rules are mandatory for every future task.

## 1. Required Reading

Before starting ANY task always read:

docs/CODEX_OPERATING_RULES.md
docs/PROJECT_STATE.md
docs/ROADMAP.md
docs/DEVELOPER_HANDOFF.md

Never skip this step.

------------------------------------------------------------

## 2. Project Philosophy

Protect the project before optimizing it.

Project stability is always more important than implementation speed.

Never sacrifice recoverability for convenience.

------------------------------------------------------------

## 3. Autonomous Decisions

Codex MAY perform without asking:

• create/edit local source code
• create documentation
• create migrations
• run lint
• run build
• run tests
• create temporary local files
• inspect git history
• inspect database schema
• inspect Supabase metadata
• create QA users beginning with qa-
• create temporary branches
• perform safe local refactoring

------------------------------------------------------------

## 4. Mandatory Approval

Codex MUST ask BEFORE:

changing any existing non-QA user

changing passwords

confirming existing owner accounts

deleting users

running destructive SQL

dropping tables

truncating tables

bulk updating production data

changing production configuration

changing DNS

changing billing

changing deployment

changing production environment variables

git reset --hard

git clean

git push --force

deleting branches

deleting stash

performing git stash pop if merge conflicts are possible

------------------------------------------------------------

## 5. Git Rules

Never execute:

git reset --hard

git clean

git push --force

git checkout -- .

git branch -D

without explicit approval.

If recovery is required:

1. Create a safety branch.
2. Explain the recovery plan.
3. Preserve all work.
4. Continue only after approval.

Never use stash as the only recovery mechanism.

------------------------------------------------------------

## 6. Milestone Protection

Before every major architectural task:

Create a milestone.

Commit.

Tag or backup.

Continue.

Never begin a large task from an unprotected working tree.

------------------------------------------------------------

## 7. Authentication Rules

Never modify existing owner accounts.

Never modify existing customer accounts.

Never modify existing technician accounts.

QA automation may ONLY modify emails beginning with:

qa-

Any attempt to modify non-QA accounts must stop immediately.

------------------------------------------------------------

## 8. QA Rules

QA users must always begin with:

qa-

Never reuse owner accounts.

Never reuse customer accounts.

Never reuse technician accounts.

Never overwrite passwords of real users.

------------------------------------------------------------

## 9. Database Rules

Never execute destructive SQL without approval.

Never delete production data.

Never assume every environment has identical schema.

Every migration must:

be forward-only

support partially upgraded databases

verify optional tables before altering them

fail safely

------------------------------------------------------------

## 10. Security Rules

Never expose:

SUPABASE_SERVICE_ROLE_KEY

API secrets

OpenAI keys

Google keys

Passwords

Never commit secrets.

Never write passwords into repository files.

------------------------------------------------------------

## 11. Recovery Rules

If ANY of the following break:

login

dashboard

build

database

routing

customer portal

estimate flow

STOP feature development.

Fix the regression FIRST.

Only then continue.

------------------------------------------------------------

## 12. Deliverables

Every completed task must include:

What changed

Files changed

Verification

Remaining blockers

Confirmation that the next task was NOT started

------------------------------------------------------------

## 13. Decision Rule

If an action is:

Local

Safe

Reversible

Codex should perform it without asking.

If an action changes:

Git history

Authentication

Production database

Production configuration

Existing users

Codex MUST ask first.

------------------------------------------------------------

## 14. Final Principle

Protect the project.

Protect the data.

Protect existing users.

Prefer the safest reversible action.

Never choose the fastest destructive action.
