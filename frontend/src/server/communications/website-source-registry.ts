import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type {
  DatabaseInboundSourceChannel,
  Json,
} from "@/lib/supabase/types";

const WEBSITE_SOURCE_CHANNELS = [
  "website_form",
  "booking_widget",
  "lead_generator",
] as const satisfies readonly DatabaseInboundSourceChannel[];

type WebsiteSourceChannel = (typeof WEBSITE_SOURCE_CHANNELS)[number];

type InboundSourceRegistryRow = {
  id: string;
  company_id: string;
  source_key: string;
  channel: DatabaseInboundSourceChannel;
  source_name: string;
  provider_name: string | null;
  domain: string | null;
  allowed_domains: string[];
  campaign: string | null;
  default_service_type: string | null;
  communication_source_account_id: string | null;
  is_active: boolean;
  metadata: Json;
};

export type WebsiteSourceIdentity = {
  companyId: string;
  inboundSourceId: string;
  sourceKey: string;
  channel: WebsiteSourceChannel;
  sourceName: string;
  providerName: string | null;
  registeredDomain: string | null;
  matchedDomain: string;
  campaign: string | null;
  defaultServiceType: string | null;
  sourceAccountId: string | null;
  metadata: Json;
};

export type WebsiteSourceResolutionInput = {
  sourceKey?: string | null;
  domain: string;
  channel?: WebsiteSourceChannel | null;
  sourceAccountId?: string | null;
  expectedCompanyId?: string | null;
};

export type WebsiteSourceRegistrationInput = {
  companyId: string;
  sourceKey: string;
  channel: WebsiteSourceChannel;
  sourceName: string;
  domain: string;
  allowedDomains?: readonly string[] | null;
  providerName?: string | null;
  campaign?: string | null;
  defaultServiceType?: string | null;
  sourceAccountId?: string | null;
  metadata?: Json;
};

export type WebsiteSourceRegistrationDraft = {
  company_id: string;
  source_key: string;
  channel: WebsiteSourceChannel;
  source_name: string;
  provider_name: string | null;
  domain: string;
  allowed_domains: string[];
  campaign: string | null;
  default_service_type: string | null;
  communication_source_account_id: string | null;
  metadata: Json;
};

export type WebsiteSourceResolutionResult =
  | {
      ok: true;
      source: WebsiteSourceIdentity;
    }
  | {
      ok: false;
      code:
        | "invalid_domain"
        | "invalid_source_key"
        | "source_lookup_failed"
        | "source_not_found"
        | "ambiguous_source"
        | "source_company_mismatch";
      reason: string;
    };

export type WebsiteSourceRegistrationValidationResult =
  | {
      ok: true;
      registration: WebsiteSourceRegistrationDraft;
    }
  | {
      ok: false;
      errors: string[];
    };

function cleanOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanSourceKey(value: string | null | undefined): string | null {
  const sourceKey = cleanOptionalText(value);
  return sourceKey ? sourceKey.toLowerCase() : null;
}

function isValidAsciiHostname(hostname: string): boolean {
  if (hostname.length < 1 || hostname.length > 253) {
    return false;
  }

  const labels = hostname.split(".");
  if (labels.length < 2) {
    return false;
  }

  return labels.every((label) => {
    if (label.length < 1 || label.length > 63) {
      return false;
    }

    return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label);
  });
}

function normalizeHostname(hostname: string): string | null {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");

  return isValidAsciiHostname(normalized) ? normalized : null;
}

export function normalizeWebsiteSourceDomain(
  value: string | null | undefined,
): string | null {
  const text = cleanOptionalText(value);
  if (!text) {
    return null;
  }

  try {
    const parsed = new URL(text.includes("://") ? text : `https://${text}`);
    return normalizeHostname(parsed.hostname);
  } catch {
    return null;
  }
}

function uniqueNormalizedDomains(values: readonly string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeWebsiteSourceDomain(value))
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function sourceMatchesDomain(
  source: InboundSourceRegistryRow,
  normalizedDomain: string,
): boolean {
  const registeredDomains = uniqueNormalizedDomains([
    source.domain ?? "",
    ...source.allowed_domains,
  ]);

  return registeredDomains.includes(normalizedDomain);
}

function toWebsiteSourceIdentity(
  source: InboundSourceRegistryRow,
  matchedDomain: string,
): WebsiteSourceIdentity {
  return {
    companyId: source.company_id,
    inboundSourceId: source.id,
    sourceKey: source.source_key,
    channel: source.channel as WebsiteSourceChannel,
    sourceName: source.source_name,
    providerName: source.provider_name,
    registeredDomain: normalizeWebsiteSourceDomain(source.domain),
    matchedDomain,
    campaign: source.campaign,
    defaultServiceType: source.default_service_type,
    sourceAccountId: source.communication_source_account_id,
    metadata: source.metadata,
  };
}

export function prepareWebsiteSourceRegistration(
  input: WebsiteSourceRegistrationInput,
): WebsiteSourceRegistrationValidationResult {
  const errors: string[] = [];
  const companyId = cleanOptionalText(input.companyId);
  const sourceKey = cleanSourceKey(input.sourceKey);
  const sourceName = cleanOptionalText(input.sourceName);
  const domain = normalizeWebsiteSourceDomain(input.domain);

  if (!companyId) {
    errors.push("companyId is required.");
  }
  if (!sourceKey) {
    errors.push("sourceKey is required.");
  }
  if (!sourceName) {
    errors.push("sourceName is required.");
  }
  if (!domain) {
    errors.push("A valid canonical domain is required.");
  }
  if (!WEBSITE_SOURCE_CHANNELS.includes(input.channel)) {
    errors.push("channel must be website_form, booking_widget, or lead_generator.");
  }

  const allowedDomains = uniqueNormalizedDomains([
    domain ?? "",
    ...(input.allowedDomains ?? []),
  ]);

  if (allowedDomains.length === 0) {
    errors.push("At least one allowed domain is required.");
  }

  if (errors.length > 0 || !companyId || !sourceKey || !sourceName || !domain) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    registration: {
      company_id: companyId,
      source_key: sourceKey,
      channel: input.channel,
      source_name: sourceName,
      provider_name: cleanOptionalText(input.providerName),
      domain,
      allowed_domains: allowedDomains,
      campaign: cleanOptionalText(input.campaign),
      default_service_type: cleanOptionalText(input.defaultServiceType),
      communication_source_account_id: cleanOptionalText(input.sourceAccountId),
      metadata: input.metadata ?? {},
    },
  };
}

export async function resolveWebsiteInboundSource(
  input: WebsiteSourceResolutionInput,
): Promise<WebsiteSourceResolutionResult> {
  const normalizedDomain = normalizeWebsiteSourceDomain(input.domain);
  if (!normalizedDomain) {
    return {
      ok: false,
      code: "invalid_domain",
      reason: "A valid website domain is required.",
    };
  }

  const sourceKey = cleanSourceKey(input.sourceKey);
  if (input.sourceKey !== undefined && !sourceKey) {
    return {
      ok: false,
      code: "invalid_source_key",
      reason: "A non-empty source key is required when sourceKey is supplied.",
    };
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return {
      ok: false,
      code: "source_lookup_failed",
      reason: "Server Supabase service client is not configured.",
    };
  }

  let query = supabase
    .from("inbound_sources")
    .select(
      "id,company_id,source_key,channel,source_name,provider_name,domain,allowed_domains,campaign,default_service_type,communication_source_account_id,is_active,metadata",
    )
    .eq("is_active", true);

  if (sourceKey) {
    query = query.eq("source_key", sourceKey);
  }
  if (input.channel) {
    query = query.eq("channel", input.channel);
  } else {
    query = query.in("channel", [...WEBSITE_SOURCE_CHANNELS]);
  }
  const sourceAccountId = cleanOptionalText(input.sourceAccountId);
  if (sourceAccountId) {
    query = query.eq(
      "communication_source_account_id",
      sourceAccountId,
    );
  }

  const { data, error } = await query;
  if (error) {
    return {
      ok: false,
      code: "source_lookup_failed",
      reason: "Unable to verify website source identity.",
    };
  }

  const matches = ((data as InboundSourceRegistryRow[] | null) ?? []).filter(
    (source) => sourceMatchesDomain(source, normalizedDomain),
  );

  if (matches.length === 0) {
    return {
      ok: false,
      code: "source_not_found",
      reason: "No active website source matched the supplied source identity.",
    };
  }

  if (matches.length > 1) {
    return {
      ok: false,
      code: "ambiguous_source",
      reason:
        "Multiple active website sources matched the supplied source identity.",
    };
  }

  const [source] = matches;
  const expectedCompanyId = cleanOptionalText(input.expectedCompanyId);
  if (expectedCompanyId && source.company_id !== expectedCompanyId) {
    return {
      ok: false,
      code: "source_company_mismatch",
      reason:
        "Supplied company does not match the company established from the website source.",
    };
  }

  return {
    ok: true,
    source: toWebsiteSourceIdentity(source, normalizedDomain),
  };
}
