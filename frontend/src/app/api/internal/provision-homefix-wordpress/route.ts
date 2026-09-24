import { randomBytes, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import type { DatabaseInboundSourceChannel, Json } from "@/lib/supabase/types";
import {
  getCredentialPepper,
  hmacSha256Hex,
} from "@/server/communications/inbound-source-credentials";

export const runtime = "nodejs";

const COMPANY_ID = "f0639d2c-6fcf-4ab5-93a2-cde8f3ba9633";
const COMPANY_NAME = "HomeFix Appliance Repair";
const SOURCE_KEY = "homefix-wordpress";
const CREDENTIAL_LABEL = "HomeFix WordPress WPForms";
const SOURCE_CHANNEL: DatabaseInboundSourceChannel = "website_form";

const SOURCE_CONFIGURATION = {
  company_id: COMPANY_ID,
  source_key: SOURCE_KEY,
  channel: SOURCE_CHANNEL,
  source_name: "HomeFix Website",
  provider_name: "appliancerepair-homefix.com",
  domain: "appliancerepair-homefix.com",
  allowed_domains: ["appliancerepair-homefix.com"],
  campaign: null,
  default_service_type: null,
  communication_source_account_id: null,
  is_active: true,
  metadata: {
    platform: "wordpress",
    integration: "wpforms",
    form_routing: {
      "695": "booking_request",
      "162": "lead",
      "168": "lead",
    },
    excluded_forms: ["181", "4521"],
  } satisfies Json,
};

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim();
  const prefix = "Bearer ";

  return authorization?.startsWith(prefix)
    ? authorization.slice(prefix.length).trim()
    : null;
}

function authorizeProvisioningRequest(request: Request):
  | { ok: true }
  | { ok: false; status: number; message: string } {
  const expectedToken = process.env.WRA_CREDENTIAL_PROVISIONING_TOKEN?.trim();
  if (!expectedToken) {
    return {
      ok: false,
      status: 503,
      message: "Credential provisioning is not configured.",
    };
  }

  const suppliedToken = getBearerToken(request);
  if (!suppliedToken) {
    return {
      ok: false,
      status: 401,
      message: "Credential provisioning authorization is required.",
    };
  }

  if (!constantTimeEquals(suppliedToken, expectedToken)) {
    return {
      ok: false,
      status: 403,
      message: "Credential provisioning authorization is invalid.",
    };
  }

  return { ok: true };
}

function createCredentialMaterial(pepper: string): {
  publicKey: string;
  plaintextSecret: string;
  secretHash: string;
} {
  const publicKey = `wra_${randomBytes(24).toString("hex")}`;
  const plaintextSecret = randomBytes(48).toString("base64url");
  const secretHash = hmacSha256Hex(plaintextSecret, pepper);

  return { publicKey, plaintextSecret, secretHash };
}

export async function POST(request: Request) {
  const authorization = authorizeProvisioningRequest(request);
  if (!authorization.ok) {
    return NextResponse.json(
      { ok: false, message: authorization.message },
      { status: authorization.status },
    );
  }

  const pepper = getCredentialPepper();
  if (!pepper) {
    return NextResponse.json(
      { ok: false, message: "Trusted inbound credential pepper is not configured." },
      { status: 503 },
    );
  }

  const supabase = getSupabaseServiceRoleClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, message: "Supabase service role client is not configured." },
      { status: 503 },
    );
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id,name")
    .eq("id", COMPANY_ID)
    .maybeSingle();

  if (companyError) {
    console.warn("HomeFix WordPress provisioning company lookup failed", {
      code: companyError.code,
      message: companyError.message,
    });
    return NextResponse.json(
      { ok: false, message: "Unable to verify HomeFix company." },
      { status: 500 },
    );
  }

  if (!company || company.name !== COMPANY_NAME) {
    return NextResponse.json(
      { ok: false, message: "Expected HomeFix company was not found." },
      { status: 404 },
    );
  }

  const { data: source, error: sourceError } = await supabase
    .from("inbound_sources")
    .upsert(SOURCE_CONFIGURATION, {
      onConflict: "company_id,source_key",
    })
    .select("id,company_id,source_key,channel,source_name,provider_name,domain,allowed_domains,is_active,metadata")
    .single();

  if (sourceError) {
    console.warn("HomeFix WordPress source upsert failed", {
      code: sourceError.code,
      message: sourceError.message,
    });
    return NextResponse.json(
      { ok: false, message: "Unable to provision HomeFix inbound source." },
      { status: 500 },
    );
  }

  const { data: existingCredential, error: credentialLookupError } = await supabase
    .from("inbound_source_credentials")
    .select("id,public_key,inbound_source_id,label,is_active,revoked_at")
    .eq("inbound_source_id", source.id)
    .eq("label", CREDENTIAL_LABEL)
    .eq("is_active", true)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();

  if (credentialLookupError) {
    console.warn("HomeFix WordPress credential lookup failed", {
      code: credentialLookupError.code,
      message: credentialLookupError.message,
    });
    return NextResponse.json(
      { ok: false, message: "Unable to verify existing HomeFix credential." },
      { status: 500 },
    );
  }

  if (existingCredential?.id) {
    return NextResponse.json({
      ok: true,
      created: false,
      message:
        "Active HomeFix WordPress credential already exists. Plaintext secret cannot be recovered.",
      inboundSourceId: source.id,
      credentialId: existingCredential.id,
      publicKey: existingCredential.public_key,
      source,
    });
  }

  const credential = createCredentialMaterial(pepper);
  const { data: createdCredential, error: insertError } = await supabase
    .from("inbound_source_credentials")
    .insert({
      inbound_source_id: source.id,
      public_key: credential.publicKey,
      secret_hash: credential.secretHash,
      secret_hash_algorithm: "hmac-sha256",
      label: CREDENTIAL_LABEL,
      is_active: true,
      metadata: {
        integration: "wordpress-wpforms",
        source_key: SOURCE_KEY,
      },
    })
    .select("id,public_key,inbound_source_id,label,is_active")
    .single();

  if (insertError) {
    console.warn("HomeFix WordPress credential insert failed", {
      code: insertError.code,
      message: insertError.message,
    });
    return NextResponse.json(
      { ok: false, message: "Unable to create HomeFix credential." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    created: true,
    message:
      "HomeFix WordPress source and credential created. Store the plaintext secret securely; it cannot be recovered later.",
    inboundSourceId: source.id,
    credentialId: createdCredential.id,
    publicKey: createdCredential.public_key,
    plaintextSecret: credential.plaintextSecret,
    source,
  });
}
