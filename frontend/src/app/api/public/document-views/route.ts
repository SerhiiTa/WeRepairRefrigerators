import { getSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

const MAX_BYTES = 2048;
const HEX = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const response = (status = 204) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return response(403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return response(415);
  if (Number(request.headers.get("content-length")) > MAX_BYTES) return response(413);
  const reader = request.body?.getReader();
  if (!reader) return response(400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  let payload: Record<string, unknown>;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); return response(413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return response(400);
    payload = parsed as Record<string, unknown>;
  } catch { return response(400); }
  finally { reader.releaseLock(); }
  if (Object.keys(payload).some(key => !["documentType", "token", "sessionHash", "eventId"].includes(key)) ||
    !["estimate", "invoice"].includes(String(payload.documentType)) ||
    typeof payload.token !== "string" || !HEX.test(payload.token) ||
    typeof payload.sessionHash !== "string" || !HEX.test(payload.sessionHash) ||
    typeof payload.eventId !== "string" || !UUID.test(payload.eventId)) return response(400);
  try {
    const db = getSupabaseServiceRoleClient();
    if (db) await db.rpc("record_document_view_rpc" as never, {
      p_document_type: payload.documentType, p_token: payload.token,
      p_session_hash: payload.sessionHash, p_event_id: payload.eventId,
    } as never);
  } catch { /* Do not log token-bearing requests or provider/database errors. */ }
  // Same acknowledgement for invalid/expired tokens, busy, caps and DB failure.
  // No aggregate or document information is disclosed to public callers.
  return response();
}
