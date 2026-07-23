import type { RankedRepairSolution } from "@/server/price-book/selection";

import {
  buildRepairProposalUserPrompt,
  REPAIR_PROPOSAL_SYSTEM_PROMPT,
} from "./repair-proposal-agent-prompt";
import {
  enforceRepairProposalScope,
  extractExplicitRepairScope,
} from "./repair-proposal-scope";
import {
  createRepairProposalItem,
  createRepairProposalWarning,
  normalizeRepairProposalDraft,
  type RepairProposalContext,
  type RepairProposalDraft,
  type RepairProposalGenerationMetadata,
  type RepairProposalProvider,
} from "./repair-proposal-schema";

const GENERATION_TIMEOUT_MS = 30_000;
const OPENAI_MODEL =
  process.env.REPAIR_PROPOSAL_OPENAI_MODEL?.trim() ||
  process.env.ESTIMATE_AGENT_MODEL?.trim() ||
  "gpt-4o-mini";
const ANTHROPIC_MODEL =
  process.env.REPAIR_PROPOSAL_ANTHROPIC_MODEL?.trim() ||
  process.env.ANTHROPIC_MODEL?.trim() ||
  "claude-3-5-haiku-latest";

export type RepairProposalGenerationInput = RepairProposalContext & {
  preferredProvider?: "openai" | "anthropic" | "deterministic" | null;
  generationMode?: "ai" | "manual" | "template" | "deterministic_fallback" | null;
  priceBookCandidates?: RankedRepairSolution[];
};

export type RepairProposalProviderResult = {
  provider: RepairProposalProvider;
  model: string | null;
  rawDraft: unknown;
};

export type RepairProposalGenerationResult = {
  ok: true;
  proposalDraft: RepairProposalDraft;
  provider: RepairProposalProvider;
  fallbackUsed: boolean;
  fallbackReasons: string[];
  explicitScope: ReturnType<typeof extractExplicitRepairScope>;
};

export type RepairProposalProviderCall = (
  input: RepairProposalGenerationInput,
  options: {
    explicitScope: ReturnType<typeof extractExplicitRepairScope>;
    priceBookCandidates: RankedRepairSolution[];
  },
) => Promise<RepairProposalProviderResult>;

export type RepairProposalProviderOverrides = {
  openai?: RepairProposalProviderCall;
  anthropic?: RepairProposalProviderCall;
};

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Provider response did not include JSON text.");
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    }
    throw new Error("Provider response was not valid JSON.");
  }
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new Error(`http_${response.status}`);
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

function extractOpenAiResponseText(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }
  const payload = body as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ text?: unknown }> }>;
  };
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }
  return (
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter((text): text is string => typeof text === "string")
      .join("\n") ?? ""
  );
}

function extractAnthropicResponseText(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }
  const payload = body as { content?: Array<{ type?: string; text?: unknown }> };
  return (
    payload.content
      ?.map((item) => (typeof item.text === "string" ? item.text : ""))
      .filter(Boolean)
      .join("\n") ?? ""
  );
}

export async function callOpenAiRepairProposalProvider(
  input: RepairProposalGenerationInput,
  options: {
    explicitScope: ReturnType<typeof extractExplicitRepairScope>;
    priceBookCandidates: RankedRepairSolution[];
  },
): Promise<RepairProposalProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("openai_key_missing");
  }

  const { body } = await fetchJsonWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: REPAIR_PROPOSAL_SYSTEM_PROMPT },
        {
          role: "user",
          content: buildRepairProposalUserPrompt({
            context: input,
            explicitScope: options.explicitScope,
            priceBookCandidates: options.priceBookCandidates,
          }),
        },
      ],
      temperature: 0.1,
      max_output_tokens: 3000,
      text: { format: { type: "json_object" } },
    }),
  });

  return {
    provider: "openai",
    model: OPENAI_MODEL,
    rawDraft: extractJsonObject(extractOpenAiResponseText(body)),
  };
}

export async function callAnthropicRepairProposalProvider(
  input: RepairProposalGenerationInput,
  options: {
    explicitScope: ReturnType<typeof extractExplicitRepairScope>;
    priceBookCandidates: RankedRepairSolution[];
  },
): Promise<RepairProposalProviderResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("anthropic_key_missing");
  }

  const { body } = await fetchJsonWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 3000,
      temperature: 0.1,
      system: REPAIR_PROPOSAL_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildRepairProposalUserPrompt({
            context: input,
            explicitScope: options.explicitScope,
            priceBookCandidates: options.priceBookCandidates,
          }),
        },
      ],
    }),
  });

  return {
    provider: "anthropic",
    model: ANTHROPIC_MODEL,
    rawDraft: extractJsonObject(extractAnthropicResponseText(body)),
  };
}

function findPriceBookMatch(
  title: string,
  candidates: RankedRepairSolution[],
): RankedRepairSolution | null {
  const normalizedTitle = title.toLowerCase();
  return (
    candidates.find((candidate) =>
      candidate.name
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token.length >= 4)
        .some((token) => normalizedTitle.includes(token)),
    ) ?? null
  );
}

export function createDeterministicRepairProposalDraft(
  input: RepairProposalGenerationInput,
  options?: {
    explicitScope?: ReturnType<typeof extractExplicitRepairScope>;
    priceBookCandidates?: RankedRepairSolution[];
  },
): RepairProposalDraft {
  const explicitScope = options?.explicitScope ?? extractExplicitRepairScope(input.confirmedRepairScope);
  const priceBookCandidates = options?.priceBookCandidates ?? [];
  const items = explicitScope.explicitItems.map((scopeItem, index) => {
    const match = findPriceBookMatch(scopeItem.title, priceBookCandidates);
    return createRepairProposalItem({
      id: `deterministic-item-${index + 1}`,
      lineType: scopeItem.lineType,
      title: scopeItem.title,
      description: scopeItem.description,
      source: match ? "price_book" : "deterministic_fallback",
      price: match?.totalPrice ?? 0,
      taxable: scopeItem.taxable,
      priceBookItemId: match?.id ?? null,
      requiresConfirmation: true,
      warningCodes: [
        ...(scopeItem.warningCodes ?? []),
        ...(match ? ["PRICE_BOOK_MATCH_UNCONFIRMED" as const] : []),
      ],
    });
  });

  if (items.length === 0) {
    items.push(
      createRepairProposalItem({
        id: "deterministic-scope-required",
        lineType: "custom",
        title: "Technician-confirmed repair scope required",
        description:
          "Add the confirmed repair operation, part, or service before sending a proposal.",
        source: "deterministic_fallback",
        price: 0,
        requiresConfirmation: true,
      }),
    );
  }

  const solutionTitle =
    explicitScope.explicitItems[0]?.title
      ? `${explicitScope.explicitItems[0].title} repair`
      : "Repair Proposal";
  const metadata: RepairProposalGenerationMetadata = {
    provider: "deterministic",
    model: null,
    generation_mode: "deterministic_fallback",
    language_detected: explicitScope.language,
    price_book_matches_used: items
      .map((item) => item.price_book_item_id)
      .filter((item): item is string => Boolean(item)),
    fallback_used: true,
    generated_at: new Date().toISOString(),
  };

  const draft = normalizeRepairProposalDraft(
    {
      proposal_title: solutionTitle,
      confirmed_problem_summary: input.confirmedRepairScope,
      customer_summary:
        "This proposal was prepared from the technician-confirmed repair scope and requires technician review before sending.",
      repair_solutions: [
        {
          id: "solution-deterministic-1",
          title: solutionTitle,
          customer_description:
            "The technician has identified the repair scope below. Review prices and parts before sending to the customer.",
          included_work: items.map((item) => item.customer_title),
          items,
          recommended: true,
          sort_order: 1,
          warranty: null,
          estimated_completion: null,
          warnings: [],
        },
      ],
      warranty: "Warranty to be confirmed before sending.",
      estimated_completion: null,
      validity: "Proposal valid for 30 days unless otherwise noted.",
      disclaimer: "Final repair is subject to technician confirmation and customer approval.",
      warnings: [
        createRepairProposalWarning({
          code: "TECHNICIAN_CONFIRMATION_REQUIRED",
          message: "Review generated lines and prices before sending this proposal.",
        }),
      ],
      generation_metadata: metadata,
    },
    input,
    metadata,
  );

  return enforceRepairProposalScope({ draft, context: input, scope: explicitScope });
}

function providerOrder(input: RepairProposalGenerationInput): Array<"openai" | "anthropic"> {
  if (input.preferredProvider === "anthropic") {
    return ["anthropic", "openai"];
  }
  return ["openai", "anthropic"];
}

export async function generateRepairProposalDraft(
  input: RepairProposalGenerationInput,
  providers: RepairProposalProviderOverrides = {},
): Promise<RepairProposalGenerationResult> {
  const priceBookCandidates = input.priceBookCandidates ?? [];
  const explicitScope = extractExplicitRepairScope(input.confirmedRepairScope);
  const fallbackReasons: string[] = [];

  if (input.generationMode === "manual") {
    const draft = createDeterministicRepairProposalDraft(input, {
      explicitScope,
      priceBookCandidates,
    });
    return {
      ok: true,
      proposalDraft: draft,
      provider: "deterministic",
      fallbackUsed: true,
      fallbackReasons: ["manual_mode_uses_editable_deterministic_seed"],
      explicitScope,
    };
  }

  if (input.preferredProvider === "deterministic") {
    const draft = createDeterministicRepairProposalDraft(input, {
      explicitScope,
      priceBookCandidates,
    });
    return {
      ok: true,
      proposalDraft: draft,
      provider: "deterministic",
      fallbackUsed: true,
      fallbackReasons: ["deterministic_requested"],
      explicitScope,
    };
  }

  for (const providerName of providerOrder(input)) {
    const provider =
      providers[providerName] ??
      (providerName === "openai"
        ? callOpenAiRepairProposalProvider
        : callAnthropicRepairProposalProvider);

    try {
      const result = await provider(input, { explicitScope, priceBookCandidates });
      const normalized = normalizeRepairProposalDraft(result.rawDraft, input, {
        provider: result.provider,
        model: result.model,
        generation_mode: "ai",
        fallback_used: fallbackReasons.length > 0,
      });
      const proposalDraft = enforceRepairProposalScope({
        draft: normalized,
        context: input,
        scope: explicitScope,
      });

      return {
        ok: true,
        proposalDraft,
        provider: result.provider,
        fallbackUsed: fallbackReasons.length > 0,
        fallbackReasons,
        explicitScope,
      };
    } catch (error) {
      fallbackReasons.push(
        `${providerName}:${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const proposalDraft = createDeterministicRepairProposalDraft(input, {
    explicitScope,
    priceBookCandidates,
  });
  return {
    ok: true,
    proposalDraft,
    provider: "deterministic",
    fallbackUsed: true,
    fallbackReasons,
    explicitScope,
  };
}
