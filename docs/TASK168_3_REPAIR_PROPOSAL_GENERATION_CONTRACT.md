# Task 168.3 - Repair Proposal Generation Contract And Manual Fallback Foundation

Task 168.3 creates the server-side generation foundation for Repair Proposals before any additional Finance UI redesign.

It follows:

- `docs/FINANCE_SYSTEM_MASTER_PLAN.md`
- `docs/TASK168_REPAIR_PROPOSAL_BUILDER_PLAN.md`
- `docs/TASK168_1_FINANCE_DATA_CONTRACT_AND_MIGRATION_PLAN.md`
- `docs/TASK168_2_REPAIR_PROPOSAL_VERTICAL_SLICE.md`

## Core Decision

The technician-confirmed repair scope remains the single source of truth.

The AI can write, organize, translate, and structure a customer-facing Repair Proposal. It cannot diagnose, decide scope, invent parts, invent labor, invent prices, invent quantities, or replace technician decisions.

## New Server Contract

The strict Repair Proposal draft schema lives in:

- `frontend/src/server/finance/repair-proposal-schema.ts`

The contract includes:

- `proposal_title`
- `confirmed_problem_summary`
- `customer_summary`
- `repair_solutions[]`
- `warranty`
- `estimated_completion`
- `validity`
- `disclaimer`
- `warnings[]`
- `generation_metadata`

Each Repair Solution owns customer-facing included work plus structured Proposal Items. Supported line types are:

- `labor`
- `part`
- `material`
- `service`
- `fee`
- `custom`

The compatibility mapper converts the new Repair Proposal draft back to the current `EstimateDraftAgentResult` shape so the existing Job Workspace Finance UI can keep working during this transition.

## Warning Contract

Structured warning codes are:

- `MODEL_NUMBER_MISSING`
- `CUSTOMER_PRICE_REQUIRED`
- `INTERNAL_COST_MISSING`
- `TECHNICIAN_CONFIRMATION_REQUIRED`
- `PRICE_BOOK_MATCH_UNCONFIRMED`
- `WARRANTY_NOT_CONFIGURED`
- `PART_NUMBER_UNCONFIRMED`
- `SUGGESTED_PROCEDURE_REVIEW_REQUIRED`

Missing model number does not block generation. Missing customer price blocks Send but does not block Generate or Save.

## Prompt Contract

The professional AI prompt lives in:

- `frontend/src/server/finance/repair-proposal-agent-prompt.ts`

It explicitly states:

- The technician-confirmed repair scope is the single source of truth.
- AI is not allowed to diagnose.
- AI is not allowed to determine repair scope.
- AI is not allowed to replace technician decisions.
- AI formats Repair Proposals. It does not create repairs.
- Expand only the language, not the repair.
- Preserve every explicit repair action.

The prompt asks for strict JSON only and excludes internal AI/debug/provider details from customer-facing copy.

## Provider Abstraction

The provider layer lives in:

- `frontend/src/server/finance/repair-proposal-providers.ts`

Fallback order:

1. OpenAI when `OPENAI_API_KEY` is available.
2. Anthropic when OpenAI is unavailable/fails and `ANTHROPIC_API_KEY` is available.
3. Deterministic fallback.
4. Manual/template factories remain available through the schema layer.

The implementation does not call both AI providers unless fallback is required. API keys remain server-side only and are never logged, returned to the browser, documented, or written to source.

## Scope Preservation

Scope extraction and enforcement live in:

- `frontend/src/server/finance/repair-proposal-scope.ts`

The enforcement pass extracts explicit technician operations, parts, materials, and services from English, Russian, Ukrainian, and mixed technician language. It then compares those explicit items against provider output and adds missing confirmed lines when needed.

It must not remove explicit technician scope, replace a concrete line with a generic line, or merge named replacement parts into vague labor.

The confirmed Russian evaporator example:

`дырка в эвапорейторе и надо ставить новый эвапорейтор, фильтр-драйер, сервис-вальв в компрессор и перезаправлять систему фреоном`

Preserved confirmed lines:

- `Evaporator`
- `Filter drier`
- `Service valve`
- `Refrigerant recharge`
- `Evaporator replacement labor`
- `Diagnostic, reassembly, and testing labor`

Suggested review-only procedures:

- `Refrigerant recovery`
- `Nitrogen pressure test`
- `Sealed-system leak test`
- `System evacuation`
- `Final refrigerant recharge`
- `Cooling performance verification`

Suggested procedures are marked for technician review and are not customer-visible by default until confirmed.

## API Routes

New generation route:

- `POST /api/repair-proposals/generate`

Input:

- `serviceRequestId`
- `confirmedRepairScope`
- optional `preferredProvider`
- optional `language`
- optional `generationMode`

The server fetches the service request/job context itself and does not trust browser-supplied customer or company data. It also attempts to load Price Book repair-solution candidates through the existing rule-based selection helper when company context is available.

Legacy compatibility:

- `POST /api/estimate-agent/draft` now uses the new Repair Proposal generation contract first and returns the existing `draft` shape expected by the current Job Workspace Finance UI.

The legacy route still sets `source: "openai"` only when OpenAI was the actual provider. Anthropic and deterministic fallback are returned as fallback-compatible source values for the current UI.

## Price Book Rules

The generation engine consumes existing Price Book candidates. It does not query Price Book directly from the AI provider. It does not create approved Price Book records.

When a candidate clearly matches, the generated item may preserve `price_book_item_id`. When no safe match exists, the item is generated with unresolved price and a blocking `CUSTOMER_PRICE_REQUIRED` warning.

## Manual And Template Foundation

Factories in `repair-proposal-schema.ts` provide:

- `createManualRepairProposalDraft()`
- `createRepairProposalFromTemplate()`

These create editable Proposal drafts without requiring AI.

## Automated QA

Focused tests live in:

- `frontend/src/server/finance/repair-proposal-generation.test.ts`
- `frontend/test/node-ts-loader.mjs`

The tests use mock providers only and do not make paid OpenAI or Anthropic calls.

Covered cases:

- English compressor scope.
- Russian evaporator sealed-system scope.
- Mixed Russian/English dispenser water valve and frozen tubing scope.
- Ukrainian compressor scope.
- deterministic fallback without API providers.
- OpenAI failure -> Anthropic fallback.
- both providers fail -> deterministic fallback.
- invalid provider JSON -> deterministic fallback.
- missing model number warning.
- missing customer prices warning.

Focused test command:

```bash
cd frontend
node --loader ./test/node-ts-loader.mjs --test src/server/finance/repair-proposal-calculations.test.ts src/server/finance/repair-proposal-generation.test.ts
```

## Not Implemented

Task 168.3 does not redesign Finance UI, Job Workspace Details, Dashboard, Timeline, Invoice Builder, Payments, Deposits, or Price Book Settings.

It does not create migrations, modify schema, modify `.env.local`, expose keys, send customer proposals, or start Task 169.
