/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { isWhatsAppDeliveryEnabled } from "./delivery.ts"

export type WhatsAppGraphSendOk = {
  ok: true
  data: any
  wamid_out: string | null
  skipped: boolean
  skip_reason: string | null
  transport: "graph" | "loopback" | "mega_test" | "disabled"
}

export type WhatsAppGraphSendErr = {
  ok: false
  http_status: number | null
  meta_code: number | null
  meta_subcode: number | null
  error: any
  retryable: boolean
  non_retry_reason: string | null
  transport: "graph"
}

export type WhatsAppGraphSendResult = WhatsAppGraphSendOk | WhatsAppGraphSendErr

function denoEnv(name: string): string | undefined {
  return (globalThis as any)?.Deno?.env?.get?.(name)
}

function isMegaTestMode(): boolean {
  const megaRaw = (denoEnv("MEGA_TEST_MODE") ?? "").trim()
  const isLocalSupabase =
    (denoEnv("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (denoEnv("SUPABASE_URL") ?? "").includes("http://kong:8000") ||
    (denoEnv("SUPABASE_URL") ?? "").includes(":54321")
  return megaRaw === "1" || (megaRaw === "" && isLocalSupabase)
}

function graphEndpoint(): { url: string; phoneNumberId: string; token: string } {
  const token = (denoEnv("WHATSAPP_ACCESS_TOKEN") ?? "").trim()
  const phoneNumberId = (denoEnv("WHATSAPP_PHONE_NUMBER_ID") ?? "").trim()
  if (!token || !phoneNumberId) throw new Error("Missing WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID")
  return {
    token,
    phoneNumberId,
    url: `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
  }
}

function classifyMetaError(httpStatus: number | null, data: any): { retryable: boolean; non_retry_reason: string | null } {
  const metaCode = Number((data as any)?.error?.code)
  const details = String((data as any)?.error?.error_data?.details ?? "")
  const message = String((data as any)?.error?.message ?? "")
  const blob = `${details}\n${message}`.toLowerCase()

  // Explicit non-retry cases (visible/support-heavy; retrying just loops/costs).
  if (metaCode === 131030) return { retryable: false, non_retry_reason: "recipient_not_allowed_list" } // Meta test mode allowlist
  if (metaCode === 470) return { retryable: false, non_retry_reason: "user_opted_out" }
  if (metaCode === 100) return { retryable: false, non_retry_reason: "invalid_parameters" }
  if (blob.includes("not a valid whatsapp user") || blob.includes("invalid phone")) {
    return { retryable: false, non_retry_reason: "invalid_recipient" }
  }
  if (blob.includes("template") && blob.includes("required")) {
    return { retryable: false, non_retry_reason: "template_required" }
  }

  // Retryable: transient server/network issues + 429 throttle.
  if (httpStatus === 429) return { retryable: true, non_retry_reason: null }
  if (httpStatus != null && httpStatus >= 500) return { retryable: true, non_retry_reason: null }
  return { retryable: false, non_retry_reason: "unknown_non_retryable" }
}

export async function sendWhatsAppGraph(payload: unknown): Promise<WhatsAppGraphSendResult> {
  if (!isWhatsAppDeliveryEnabled()) {
    return {
      ok: true,
      data: { messages: [{ id: "wamid_DISABLED" }], delivery_disabled: true },
      wamid_out: "wamid_DISABLED",
      skipped: true,
      skip_reason: "delivery_disabled",
      transport: "disabled",
    }
  }

  // Test-only transport: loopback means "pretend we sent it to WhatsApp", but do not call Meta/Graph.
  if (Boolean((globalThis as any).__SOPHIA_WA_LOOPBACK)) {
    const wamid = "wamid_LOOPBACK"
    return { ok: true, data: { messages: [{ id: wamid }], loopback: true }, wamid_out: wamid, skipped: false, skip_reason: null, transport: "loopback" }
  }

  // In tests/local deterministic runs we never want to call Meta/Graph.
  if (isMegaTestMode()) {
    const wamid = "wamid_MEGA_TEST"
    return { ok: true, data: { messages: [{ id: wamid }], mega_test_mode: true }, wamid_out: wamid, skipped: false, skip_reason: null, transport: "mega_test" }
  }

  const { url, token, phoneNumberId } = graphEndpoint()
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const metaCode = Number((data as any)?.error?.code)
      if (res.status === 400 && metaCode === 131030) {
        // Meta test mode allowlist
        return {
          ok: true,
          data: { skipped: true, reason: "recipient_not_allowed_list", meta: data, phone_number_id: phoneNumberId },
          wamid_out: null,
          skipped: true,
          skip_reason: "recipient_not_allowed_list",
          transport: "graph",
        }
      }
      const cls = classifyMetaError(res.status, data)
      return {
        ok: false,
        http_status: res.status,
        meta_code: Number.isFinite(metaCode) ? metaCode : null,
        meta_subcode: Number.isFinite(Number((data as any)?.error?.error_subcode)) ? Number((data as any)?.error?.error_subcode) : null,
        error: data,
        retryable: cls.retryable,
        non_retry_reason: cls.non_retry_reason,
        transport: "graph",
      }
    }
    const wamid = (data as any)?.messages?.[0]?.id ?? null
    return { ok: true, data, wamid_out: wamid ? String(wamid) : null, skipped: false, skip_reason: null, transport: "graph" }
  } catch (e) {
    // Network/timeout: retryable, but no provider_message_id.
    return {
      ok: false,
      http_status: null,
      meta_code: null,
      meta_subcode: null,
      error: { message: (e as any)?.message ?? String(e) },
      retryable: true,
      non_retry_reason: null,
      transport: "graph",
    }
  }
}





// ===========================================================================
// INBOUND MEDIA — KEEL W5.1
//
// THE ONE THING THAT MATTERS: BOTH GETS HAPPEN IN THE SAME INVOKE.
// Meta's media flow is two hops. Hop 1 (`GET /<media_id>`) returns metadata
// containing a `url` on `lookaside.fbsbx.com`. That url is SHORT-LIVED and
// bound to the requesting app; hop 2 (`GET <url>` WITH the same Bearer, which
// people forget because the host is no longer graph.facebook.com) must follow
// immediately. Anything that defers hop 2 — a queue row, a retry cron, a
// "download later" job — collects 404/403 instead of bytes. So this function
// returns BYTES, never a url, and no caller can accidentally persist a handle
// that will be dead by the time it is used.
//
// TEST/LOCAL TRANSPORTS, same three doors as `sendWhatsAppGraph`:
// delivery-disabled, `__SOPHIA_WA_LOOPBACK`, `isMegaTestMode()`. Without them a
// local QA run would hit Meta for real on every inbound photo — the exact
// failure the send path already guards against.
// ===========================================================================

/** Refuse anything larger than this. WhatsApp caps images at 5 MB; the margin
 * covers documents while keeping a hostile payload out of edge memory. */
export const WHATSAPP_MEDIA_MAX_BYTES = 8 * 1024 * 1024

/** Deterministic 1x1 PNG returned by the non-network transports. Real bytes, so
 * callers exercise the full upload/insert path in local QA. */
const STUB_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

function stubMediaBytes(): Uint8Array {
  const binary = atob(STUB_PNG_BASE64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export type WhatsAppMediaTransport = "graph" | "loopback" | "mega_test" | "disabled"

export type WhatsAppMediaFetchOk = {
  ok: true
  media_id: string
  /** The payload itself. There is deliberately no `url` field (see header). */
  bytes: Uint8Array
  mime_type: string
  sha256: string | null
  /** Size Meta declared in the metadata hop, when it declared one. */
  declared_size: number | null
  byte_length: number
  transport: WhatsAppMediaTransport
}

export type WhatsAppMediaFetchErr = {
  ok: false
  media_id: string
  /** Which hop failed — a metadata failure and a binary failure are different bugs. */
  stage: "config" | "metadata" | "binary" | "too_large"
  http_status: number | null
  error: any
  retryable: boolean
  transport: WhatsAppMediaTransport
}

export type WhatsAppMediaFetchResult = WhatsAppMediaFetchOk | WhatsAppMediaFetchErr

function mediaMetadataUrl(mediaId: string): string {
  return `https://graph.facebook.com/v20.0/${encodeURIComponent(mediaId)}`
}

function retryableHttp(status: number | null): boolean {
  if (status === 429) return true
  return status != null && status >= 500
}

/**
 * Download an inbound WhatsApp media object, metadata + binary, in one call.
 *
 * @param mediaId `message.<type>.id` as preserved by `wa_parse.ts`.
 * @param opts.expectedMimePrefix e.g. `"image/"` — a document/video that lies
 *        about its type is rejected at `metadata` rather than handed to a
 *        vision model. Omit to accept any type.
 */
export async function fetchWhatsAppMedia(
  mediaId: string,
  opts?: { expectedMimePrefix?: string; maxBytes?: number },
): Promise<WhatsAppMediaFetchResult> {
  const id = String(mediaId ?? "").trim()
  const maxBytes = Math.max(1, Number(opts?.maxBytes ?? WHATSAPP_MEDIA_MAX_BYTES))

  if (!id) {
    return {
      ok: false, media_id: "", stage: "config", http_status: null,
      error: { message: "empty media id" }, retryable: false, transport: "graph",
    }
  }

  const stub = (transport: WhatsAppMediaTransport): WhatsAppMediaFetchOk => {
    const bytes = stubMediaBytes()
    return {
      ok: true, media_id: id, bytes, mime_type: "image/png", sha256: null,
      declared_size: bytes.byteLength, byte_length: bytes.byteLength, transport,
    }
  }

  // Same precedence as the send path, so one env flips both directions.
  if (!isWhatsAppDeliveryEnabled()) return stub("disabled")
  if (Boolean((globalThis as any).__SOPHIA_WA_LOOPBACK)) return stub("loopback")
  if (isMegaTestMode()) return stub("mega_test")

  const token = (denoEnv("WHATSAPP_ACCESS_TOKEN") ?? "").trim()
  if (!token) {
    return {
      ok: false, media_id: id, stage: "config", http_status: null,
      error: { message: "Missing WHATSAPP_ACCESS_TOKEN" }, retryable: false, transport: "graph",
    }
  }
  const authHeaders = { Authorization: `Bearer ${token}` }

  // --- Hop 1: metadata -----------------------------------------------------
  let meta: any
  try {
    const res = await fetch(mediaMetadataUrl(id), { method: "GET", headers: authHeaders })
    meta = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        ok: false, media_id: id, stage: "metadata", http_status: res.status,
        error: meta, retryable: retryableHttp(res.status), transport: "graph",
      }
    }
  } catch (e) {
    return {
      ok: false, media_id: id, stage: "metadata", http_status: null,
      error: { message: (e as any)?.message ?? String(e) }, retryable: true, transport: "graph",
    }
  }

  const downloadUrl = String(meta?.url ?? "").trim()
  const mimeType = String(meta?.mime_type ?? "").trim()
  const declaredSizeRaw = Number(meta?.file_size)
  const declaredSize = Number.isFinite(declaredSizeRaw) ? declaredSizeRaw : null

  if (!downloadUrl) {
    return {
      ok: false, media_id: id, stage: "metadata", http_status: null,
      // NOTE: `meta` is echoed WITHOUT the url on purpose — a signed lookaside
      // url in a log line is a credential in a log line.
      error: { message: "metadata carried no url", mime_type: mimeType },
      retryable: false, transport: "graph",
    }
  }
  const prefix = String(opts?.expectedMimePrefix ?? "")
  if (prefix && !mimeType.toLowerCase().startsWith(prefix.toLowerCase())) {
    return {
      ok: false, media_id: id, stage: "metadata", http_status: null,
      error: { message: `unexpected mime_type ${JSON.stringify(mimeType)}`, expected_prefix: prefix },
      retryable: false, transport: "graph",
    }
  }
  if (declaredSize != null && declaredSize > maxBytes) {
    return {
      ok: false, media_id: id, stage: "too_large", http_status: null,
      error: { message: "declared size over cap", declared_size: declaredSize, max_bytes: maxBytes },
      retryable: false, transport: "graph",
    }
  }

  // --- Hop 2: the binary, immediately, with the SAME Bearer ----------------
  try {
    const res = await fetch(downloadUrl, { method: "GET", headers: authHeaders })
    if (!res.ok) {
      return {
        ok: false, media_id: id, stage: "binary", http_status: res.status,
        error: { message: `binary fetch failed with ${res.status}` },
        retryable: retryableHttp(res.status), transport: "graph",
      }
    }
    const buffer = await res.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    if (bytes.byteLength === 0) {
      return {
        ok: false, media_id: id, stage: "binary", http_status: res.status,
        error: { message: "empty media body" }, retryable: true, transport: "graph",
      }
    }
    if (bytes.byteLength > maxBytes) {
      return {
        ok: false, media_id: id, stage: "too_large", http_status: res.status,
        error: { message: "body over cap", byte_length: bytes.byteLength, max_bytes: maxBytes },
        retryable: false, transport: "graph",
      }
    }
    return {
      ok: true, media_id: id, bytes,
      // Meta's metadata mime wins; the response header is a fallback only.
      mime_type: mimeType || String(res.headers.get("content-type") ?? "").split(";")[0].trim() ||
        "application/octet-stream",
      sha256: (() => { const s = String(meta?.sha256 ?? "").trim(); return s === "" ? null : s })(),
      declared_size: declaredSize,
      byte_length: bytes.byteLength,
      transport: "graph",
    }
  } catch (e) {
    return {
      ok: false, media_id: id, stage: "binary", http_status: null,
      error: { message: (e as any)?.message ?? String(e) }, retryable: true, transport: "graph",
    }
  }
}
