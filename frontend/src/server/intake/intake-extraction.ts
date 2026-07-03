import type { Json } from "@/lib/supabase/types";

export type IntakeExtractionInput = {
  rawMessage?: string | null;
  transcript?: string | null;
};

export type IntakeExtractionResult = {
  source: "openai" | "local" | "none";
  fields: Record<string, Json>;
  confidence: number | null;
  warning: string | null;
};

const OPENAI_TIMEOUT_MS = 12000;

function extractLocal(input: IntakeExtractionInput): IntakeExtractionResult {
  const text = `${input.rawMessage ?? ""}\n${input.transcript ?? ""}`.trim();

  if (!text) {
    return {
      source: "none",
      fields: {},
      confidence: null,
      warning: null,
    };
  }

  const phoneMatch = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/.exec(text);
  const emailMatch = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text);
  const zipMatch = /\b\d{5}\b/.exec(text);
  const nameMatch = /(?:name|customer|caller)\s*[:\-]\s*([A-Z][a-z]+)(?:\s+([A-Z][a-z]+))?/i.exec(text);
  const applianceTerms = [
    "refrigerator",
    "freezer",
    "ice maker",
    "wine cooler",
    "dishwasher",
    "washer",
    "dryer",
    "range",
    "oven",
    "cooktop",
    "microwave",
    "vent hood",
  ];
  const lower = text.toLowerCase();
  const applianceType =
    applianceTerms.find((term) => lower.includes(term)) ?? null;
  const fields = Object.fromEntries(
    [
      [
        "customer_phone",
        phoneMatch
          ? `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}`
          : null,
      ],
      ["customer_first_name", nameMatch?.[1] ?? null],
      ["customer_last_name", nameMatch?.[2] ?? null],
      [
        "customer_name",
        nameMatch?.[1]
          ? [nameMatch[1], nameMatch[2]].filter(Boolean).join(" ")
          : null,
      ],
      ["customer_email", emailMatch?.[0] ?? null],
      ["zip_code", zipMatch?.[0] ?? null],
      [
        "appliance_type",
        applianceType
          ? applianceType.replace(/\b\w/g, (char) => char.toUpperCase())
          : null,
      ],
      ["problem_description", text.slice(0, 1200)],
    ].filter(([, item]) => typeof item === "string" && item.length > 0),
  ) as Record<string, Json>;

  return {
    source: "local",
    fields,
    confidence: 0.35,
    warning: "Local extraction only. Review fields before converting.",
  };
}

function sanitizeExtractedFields(value: unknown): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const allowedKeys = [
    "customer_first_name",
    "customer_last_name",
    "customer_name",
    "customer_phone",
    "customer_email",
    "service_address",
    "city",
    "state",
    "zip_code",
    "appliance_type",
    "brand",
    "model_number",
    "serial_number",
    "problem_description",
    "preferred_appointment_window",
    "urgency",
    "notes",
  ];

  return Object.fromEntries(
    allowedKeys
      .map((key) => [key, record[key]])
      .filter(([, item]) => typeof item === "string" && item.trim().length > 0)
      .map(([key, item]) => [key, (item as string).trim()]),
  );
}

export async function extractIntakeFields(
  input: IntakeExtractionInput,
): Promise<IntakeExtractionResult> {
  const text = `${input.rawMessage ?? ""}\n${input.transcript ?? ""}`.trim();

  if (!text) {
    return extractLocal(input);
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return extractLocal(input);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.INTAKE_EXTRACTION_MODEL ?? "gpt-4o-mini",
        input: [
          {
            role: "system",
            content:
              "Extract home-service intake fields. Return only strict JSON with fields and confidence. Do not invent missing values.",
          },
          {
            role: "user",
            content: JSON.stringify({
              transcript: input.transcript,
              raw_message: input.rawMessage,
              schema: {
                fields: {
                  customer_name: "string|null",
                  customer_first_name: "string|null",
                  customer_last_name: "string|null",
                  customer_phone: "string|null",
                  customer_email: "string|null",
                  service_address: "string|null",
                  city: "string|null",
                  state: "string|null",
                  zip_code: "string|null",
                  appliance_type: "string|null",
                  brand: "string|null",
                  model_number: "string|null",
                  serial_number: "string|null",
                  problem_description: "string|null",
                  preferred_appointment_window: "string|null",
                  urgency: "string|null",
                  notes: "string|null",
                },
                confidence: "number 0..1",
              },
            }),
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "intake_extraction",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["fields", "confidence"],
              properties: {
                fields: {
                  type: "object",
                  additionalProperties: { type: ["string", "null"] },
                },
                confidence: { type: "number", minimum: 0, maximum: 1 },
              },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      return {
        ...extractLocal(input),
        warning: `AI extraction unavailable (${response.status}). Local extraction used.`,
      };
    }

    const payload = (await response.json()) as {
      output_text?: unknown;
      output?: Array<{
        content?: Array<{ text?: unknown }>;
      }>;
    };
    const outputText =
      typeof payload.output_text === "string"
        ? payload.output_text
        : typeof payload.output?.[0]?.content?.[0]?.text === "string"
          ? payload.output[0].content[0].text
          : null;

    if (!outputText) {
      return {
        ...extractLocal(input),
        warning: "AI extraction returned no structured output. Local extraction used.",
      };
    }

    const parsed = JSON.parse(outputText) as {
      fields?: unknown;
      confidence?: unknown;
    };

    return {
      source: "openai",
      fields: sanitizeExtractedFields(parsed.fields),
      confidence:
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : null,
      warning: null,
    };
  } catch (error) {
    const fallback = extractLocal(input);

    return {
      ...fallback,
      warning:
        error instanceof Error
          ? `AI extraction unavailable (${error.message}). Local extraction used.`
          : "AI extraction unavailable. Local extraction used.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
