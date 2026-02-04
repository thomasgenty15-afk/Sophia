/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

export type WhatsAppGraphSendOk = {
  ok: true
  data: any
  wamid_out: string | null
  skipped: boolean
  skip_reason: string | null
  transport: "graph" | "loopback" | "mega_test"
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
  // Eval-only transport: loopback means "pretend we sent it to WhatsApp", but do not call Meta/Graph.
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





