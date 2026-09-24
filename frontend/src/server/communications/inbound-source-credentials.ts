import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type {
  DatabaseInboundSourceChannel,
  Json,
} from "@/lib/supabase/types";

const SUPPORTED_WEBSITE_CREDENTIAL_CHANNELS = [
  "website_form",
  "booking_widget",
  "lead_generator",
] as const satisfies readonly DatabaseInboundSourceChannel[];

type SupportedWebsiteCredentialChannel =
  (typeof SUPPORTED_WEBSITE_CREDENTIAL_CHANNELS)[number];

type InboundSourceCredentialRow = {
  id: string;
  inbound_source_id: string;
  public_key: string;
  secret_hash: string;
  secret_hash_algorithm: string;
  is_active: boolean;
  revoked_at: string | null;
};

type InboundSourceCredentialSourceRow = {
  id: string;
  company_id: string;
  source_key: string;
  channel: DatabaseInboundSourceChannel;
  source_name: string;
  provider_name: string | null;
  communication_source_account_id: string | null;
  is_active: boolean;
  metadata: Json;
};

export type VerifiedInboundSourceCredential = {
  credentialId: string;
  publicKey: string;
  inboundSourceId: string;
  companyId: string;
  sourceKey: string;
  channel: SupportedWebsiteCredentialChannel;
  sourceName: string;
  providerName: string | null;
  sourceAccountId: string | null;
  metadata: Json;
};

export type VerifyInboundSourceCredentialResult =
  | {
      ok: true;
      credential: VerifiedInboundSourceCredential;
    }
  | {
      ok: false;
      code:
        | "server_not_configured"
        | "invalid_credential"
        | "unsupported_source_channel";
      reason: string;
    };

export function getCredentialPepper(): string | null {
  return process.env.WRA_INBOUND_SOURCE_CREDENTIAL_PEPPER?.trim() || null;
}

export function hmacSha256Hex(secret: string, pepper: string): string {
  return createHmac("sha256", pepper).update(secret, "utf8").digest("hex");
}

function constantTimeHexEquals(storedHex: string, candidateHex: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(storedHex)) {
    return false;
  }

  const stored = Buffer.from(storedHex, "hex");
  const candidate = Buffer.from(candidateHex, "hex");

  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

function isSupportedWebsiteCredentialChannel(
  channel: DatabaseInboundSourceChannel,
): channel is SupportedWebsiteCredentialChannel {
  return SUPPORTED_WEBSITE_CREDENTIAL_CHANNELS.includes(
    channel as SupportedWebsiteCredentialChannel,
  );
}

export async function verifyInboundSourceCredential(input: {
  publicKey: string;
  secret: string;
  requestIp?: string | null;
}): Promise<VerifyInboundSourceCredentialResult> {
  const publicKey = input.publicKey.trim();
  const secret = input.secret;
  const pepper = getCredentialPepper();
  const supabase = getSupabaseServiceRoleClient();

  if (!pepper || !supabase) {
    return {
      ok: false,
      code: "server_not_configured",
      reason: "Trusted inbound credential verification is not configured.",
    };
  }

  if (!publicKey || Buffer.byteLength(secret, "utf8") < 32) {
    return {
      ok: false,
      code: "invalid_credential",
      reason: "Inbound source credential is invalid.",
    };
  }

  const { data: credentialData, error: credentialError } = await supabase
    .from("inbound_source_credentials")
    .select(
      "id,inbound_source_id,public_key,secret_hash,secret_hash_algorithm,is_active,revoked_at",
    )
    .eq("public_key", publicKey)
    .maybeSingle();

  if (credentialError) {
    console.warn("Trusted inbound credential lookup failed", {
      code: credentialError.code,
      message: credentialError.message,
    });
    return {
      ok: false,
      code: "invalid_credential",
      reason: "Inbound source credential is invalid.",
    };
  }

  const credential = credentialData as InboundSourceCredentialRow | null;
  if (
    !credential ||
    !credential.is_active ||
    credential.revoked_at ||
    credential.secret_hash_algorithm !== "hmac-sha256"
  ) {
    return {
      ok: false,
      code: "invalid_credential",
      reason: "Inbound source credential is invalid.",
    };
  }

  const candidateHash = hmacSha256Hex(secret, pepper);
  if (!constantTimeHexEquals(credential.secret_hash, candidateHash)) {
    return {
      ok: false,
      code: "invalid_credential",
      reason: "Inbound source credential is invalid.",
    };
  }

  const { data: sourceData, error: sourceError } = await supabase
    .from("inbound_sources")
    .select(
      "id,company_id,source_key,channel,source_name,provider_name,communication_source_account_id,is_active,metadata",
    )
    .eq("id", credential.inbound_source_id)
    .maybeSingle();

  if (sourceError) {
    console.warn("Trusted inbound source lookup failed", {
      code: sourceError.code,
      message: sourceError.message,
    });
    return {
      ok: false,
      code: "invalid_credential",
      reason: "Inbound source credential is invalid.",
    };
  }

  const source = sourceData as InboundSourceCredentialSourceRow | null;
  if (!source || !source.is_active) {
    return {
      ok: false,
      code: "invalid_credential",
      reason: "Inbound source credential is invalid.",
    };
  }

  if (!isSupportedWebsiteCredentialChannel(source.channel)) {
    return {
      ok: false,
      code: "unsupported_source_channel",
      reason: "Inbound source channel is not supported by this endpoint.",
    };
  }

  const { error: lastUsedError } = await supabase
    .from("inbound_source_credentials")
    .update({
      last_used_at: new Date().toISOString(),
      last_used_ip: input.requestIp?.trim() || null,
    })
    .eq("id", credential.id);

  if (lastUsedError) {
    console.warn("Trusted inbound credential last-used update failed", {
      code: lastUsedError.code,
      message: lastUsedError.message,
    });
  }

  return {
    ok: true,
    credential: {
      credentialId: credential.id,
      publicKey: credential.public_key,
      inboundSourceId: source.id,
      companyId: source.company_id,
      sourceKey: source.source_key,
      channel: source.channel,
      sourceName: source.source_name,
      providerName: source.provider_name,
      sourceAccountId: source.communication_source_account_id,
      metadata: source.metadata,
    },
  };
}
