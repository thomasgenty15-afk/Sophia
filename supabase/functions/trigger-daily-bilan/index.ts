/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { generateWithGemini } from "../_shared/gemini.ts"

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function envInt(name: string, fallback: number): number {
  const raw = (Deno.env.get(name) ?? "").trim()
  const n = Number(raw)
  if (!raw) return fallback
  if (!Number.isFinite(n)) return fallback
  return Math.floor(n)
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = (Deno.env.get(name) ?? "").trim().toLowerCase()
  if (!raw) return fallback
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true
  if (["0", "false", "no", "n", "off"].includes(raw)) return false
  return fallback
}

function backoffMs(attempt: number): number {
  const base = 800
  const max = 20_000
  const exp = Math.min(max, base * Math.pow(2, attempt - 1))
  const jitter = Math.floor(Math.random() * 350)
  return Math.min(max, exp + jitter)
}

function isMegaTestMode(): boolean {
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim()
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000")
  return megaRaw === "1" || (megaRaw === "" && isLocalSupabase)
}

function normalizeChatText(text: unknown): string {
  return (text ?? "").toString().replace(/\\n/g, "\n").replace(/\*\*/g, "").trim()
}

function fallbackDailyBilanMessage(): string {
  return (
    "Bonsoir 🙂 Petit bilan rapide ?\n\n" +
    "1) Un truc dont tu es fier(e) aujourd’hui ?\n" +
    "2) Un truc à ajuster pour demain ?"
  )
}

async function buildPersonalizedDailyBilanMessage(admin: ReturnType<typeof createClient>, userId: string, fullName: string, requestId: string) {
  // Keep local/test mode deterministic and offline.
  if (isMegaTestMode()) return fallbackDailyBilanMessage()

  const useAi = envBool("DAILY_BILAN_USE_AI", true)
  if (!useAi) return fallbackDailyBilanMessage()

  const maxContext = Math.max(0, Math.min(12, envInt("DAILY_BILAN_CONTEXT_MESSAGES", 6)))

  // Recent WhatsApp conversation snippets (best effort).
  const { data: msgs } = await admin
    .from("chat_messages")
    .select("role, content, created_at, metadata")
    .eq("user_id", userId)
    .filter("metadata->>channel", "eq", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(maxContext)

  const history = (msgs ?? [])
    .slice()
    .reverse()
    .map((m: any) => {
      const role = String(m.role ?? "user")
      const content = String(m.content ?? "").trim()
      return `${role}: ${content}`.trim()
    })
    .filter(Boolean)
    .slice(-maxContext)

  const { data: plan } = await admin
    .from("user_plans")
    .select("title")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const firstName = (fullName ?? "").trim().split(" ")[0] || ""
  const planTitle = String((plan as any)?.title ?? "").trim()

  const systemPrompt = `
Tu es Sophia. Tu envoies un message WhatsApp proactif de bilan du soir.

Objectif: écrire une intro courte (1-2 phrases) qui fait le lien avec le contexte récent (si dispo), puis poser exactement 2 questions:
1) "Un truc dont tu es fier(e) aujourd’hui ?"
2) "Un truc à ajuster pour demain ?"

Contraintes:
- Texte brut uniquement. Pas de JSON.
- Max 420 caractères.
- 0 à 1 emoji (max).
- Ne mens pas: si le contexte est vide, fais une intro générique.
- Évite toute info sensible / médicale. Ne “diagnostique” rien.
- Tutoiement.

Infos:
- Prénom (si dispo): "${firstName}"
- Plan actif (si dispo): "${planTitle}"
- Historique WhatsApp récent:
${history.length > 0 ? history.join("\n") : "(vide)"}
  `.trim()

  const model = (Deno.env.get("DAILY_BILAN_MODEL") ?? "gemini-2.5-flash").trim()
  const res = await generateWithGemini(systemPrompt, "Écris le message.", 0.4, false, [], "auto", {
    requestId,
    model,
    source: "trigger-daily-bilan:copy",
    userId,
  })

  const out = normalizeChatText(res)
  // Safety net: ensure we always include the two questions.
  const hasQ1 = out.includes("1)") || out.toLowerCase().includes("un truc dont tu es fier")
  const hasQ2 = out.includes("2)") || out.toLowerCase().includes("un truc à ajuster")
  if (!out || !hasQ1 || !hasQ2) return fallbackDailyBilanMessage()
  return out.length > 700 ? out.slice(0, 700).trim() : out
}

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

function isHttp429Message(msg: string): boolean {
  const m = (msg ?? "").toString()
  return m.includes("(429)") || m.includes(" 429") || m.toLowerCase().includes("resource exhausted") || m.toLowerCase().includes("throttle")
}

async function callWhatsappSendWithRetry(payload: unknown, opts: { maxAttempts: number; throttleMs: number }) {
  const maxAttempts = Math.max(1, Math.min(10, opts.maxAttempts))
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callWhatsappSend(payload)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Do NOT retry the per-user proactive throttle (it's a policy, not a transient error)
      if (msg.includes("Proactive throttle")) throw e
      const is429 = isHttp429Message(msg)
      const isLast = attempt >= maxAttempts
      if (!is429 || isLast) throw e
      const wait = backoffMs(attempt) + Math.max(0, opts.throttleMs)
      await sleep(wait)
    }
  }
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

    // Throttling for batch sends: helps avoid burst rate-limits on Meta/Graph and our own internal throttles.
    // These envs are optional and safe defaults apply.
    const throttleMs = Math.max(0, envInt("DAILY_BILAN_THROTTLE_MS", 300))
    const maxAttempts = Math.max(1, envInt("DAILY_BILAN_MAX_SEND_ATTEMPTS", 5))

    let sent = 0
    let skipped = 0
    const errors: Array<{ user_id: string; error: string }> = []

    const profilesById = new Map((profiles ?? []).map((p) => [p.id, p]))

    for (let idx = 0; idx < filtered.length; idx++) {
      const userId = filtered[idx]
      try {
        const p = profilesById.get(userId) as any
        const hasBilanOptIn = Boolean(p?.whatsapp_bilan_opted_in)

        // Smooth out bursts (skip the first)
        if (throttleMs > 0 && idx > 0) await sleep(throttleMs)

        if (!hasBilanOptIn) {
          // Send a template to ask for explicit opt-in to the daily bilan.
          await callWhatsappSendWithRetry({
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
          }, { maxAttempts, throttleMs })
        } else {
          const bilanMessage = await buildPersonalizedDailyBilanMessage(
            admin,
            userId,
            String(p?.full_name ?? ""),
            requestId,
          )
          // Already opted in: send the actual bilan prompt (text).
          await callWhatsappSendWithRetry({
            user_id: userId,
            message: { type: "text", body: bilanMessage },
            purpose: "daily_bilan",
            require_opted_in: true,
          }, { maxAttempts, throttleMs })
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
      { success: true, sent, skipped, errors, throttle_ms: throttleMs, max_send_attempts: maxAttempts, request_id: requestId },
      { includeCors: false },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[trigger-daily-bilan] request_id=${requestId}`, error)
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})


