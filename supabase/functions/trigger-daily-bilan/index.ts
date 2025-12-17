/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { getRequestId, jsonResponse } from "../_shared/http.ts"

function internalSecret(): string {
  return (Deno.env.get("INTERNAL_FUNCTION_SECRET")?.trim() || Deno.env.get("SECRET_KEY")?.trim() || "")
}

function functionsBaseUrl(): string {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim()
  if (!supabaseUrl) return "http://kong:8000"
  // Local Supabase edge runtime uses kong inside the network.
  if (supabaseUrl.includes("http://kong:8000")) return "http://kong:8000"
  // Otherwise keep the configured URL (cloud)
  return supabaseUrl.replace(/\/+$/, "")
}

async function callWhatsappSend(payload: unknown) {
  const secret = internalSecret()
  if (!secret) throw new Error("Missing INTERNAL_FUNCTION_SECRET")
  const url = `${functionsBaseUrl()}/functions/v1/whatsapp-send`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": secret,
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`whatsapp-send failed (${res.status}): ${JSON.stringify(data)}`)
  }
  return data
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    // Users eligible for WhatsApp check-ins (phone ok + WhatsApp opted in).
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, full_name, whatsapp_bilan_opted_in")
      .eq("whatsapp_opted_in", true)
      .eq("phone_invalid", false)
      .not("phone_number", "is", null)
      .limit(200)

    if (error) throw error
    const userIds = (profiles ?? []).map((p) => p.id)
    if (userIds.length === 0) {
      return jsonResponse(req, { message: "No opted-in users", request_id: requestId }, { includeCors: false })
    }

    // Optional: restrict to users with an active plan.
    const { data: plans, error: planErr } = await admin
      .from("user_plans")
      .select("user_id")
      .in("status", ["active", "in_progress", "pending"])
      .limit(1000)

    if (planErr) throw planErr
    const allowed = new Set((plans ?? []).map((p) => p.user_id))
    const filtered = userIds.filter((id) => allowed.has(id))

    const bilanMessage =
      "Bonsoir 🙂 Petit bilan rapide ?\n\n" +
      "1) Un truc dont tu es fier(e) aujourd’hui ?\n" +
      "2) Un truc à ajuster pour demain ?"

    let sent = 0
    let skipped = 0
    const errors: Array<{ user_id: string; error: string }> = []

    const profilesById = new Map((profiles ?? []).map((p) => [p.id, p]))

    for (const userId of filtered) {
      try {
        const p = profilesById.get(userId) as any
        const hasBilanOptIn = Boolean(p?.whatsapp_bilan_opted_in)

        if (!hasBilanOptIn) {
          // Send a template to ask for explicit opt-in to the daily bilan.
          await callWhatsappSend({
            user_id: userId,
            message: {
              type: "template",
              name: (Deno.env.get("WHATSAPP_BILAN_TEMPLATE_NAME") ?? "sophia_bilan_v1").trim(),
              language: (Deno.env.get("WHATSAPP_BILAN_TEMPLATE_LANG") ?? "fr").trim(),
              // components will be auto-filled by whatsapp-send with {{1}} = full_name
            },
            purpose: "daily_bilan",
            require_opted_in: true,
            force_template: true,
          })
        } else {
          // Already opted in: send the actual bilan prompt (text).
          await callWhatsappSend({
            user_id: userId,
            message: { type: "text", body: bilanMessage },
            purpose: "daily_bilan",
            require_opted_in: true,
          })
        }
        sent++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // Do not fail the whole batch on one user.
        if (msg.includes("Proactive throttle")) skipped++
        else errors.push({ user_id: userId, error: msg })
      }
    }

    return jsonResponse(
      req,
      { success: true, sent, skipped, errors, request_id: requestId },
      { includeCors: false },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[trigger-daily-bilan] request_id=${requestId}`, error)
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})


