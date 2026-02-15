/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { generateWithGemini } from "../_shared/gemini.ts"
import { buildUserTimeContextFromValues } from "../_shared/user_time_context.ts"
import { whatsappLangFromLocale } from "../_shared/locale.ts"
import { deferSignal, type DeferredMachineType } from "../sophia-brain/router/deferred_topics_v2.ts"
import {
  cleanupHardExpiredStateMachines,
  clearActiveMachineForDailyBilan,
  hasActiveStateMachine,
} from "./state_machine_check.ts"

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

async function logComm(admin: ReturnType<typeof createClient>, args: {
  user_id: string
  channel: "whatsapp" | "email" | "sms"
  type: string
  status: string
  metadata?: Record<string, unknown>
}) {
  try {
    await admin.from("communication_logs").insert({
      user_id: args.user_id,
      channel: args.channel,
      type: args.type,
      status: args.status,
      metadata: args.metadata ?? {},
    } as any)
  } catch {
    // best-effort
  }
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

function lastWhatsappActivityMs(profile: any): number | null {
  const inbound = profile?.whatsapp_last_inbound_at ? new Date(profile.whatsapp_last_inbound_at).getTime() : null
  const outbound = profile?.whatsapp_last_outbound_at ? new Date(profile.whatsapp_last_outbound_at).getTime() : null
  const last = Math.max(inbound ?? 0, outbound ?? 0)
  return last > 0 ? last : null
}

function machineLabelToDeferredType(machineLabel: string | null): DeferredMachineType | null {
  switch (machineLabel) {
    case "create_action":
    case "create_action_flow":
      return "create_action"
    case "update_action":
    case "update_action_flow":
    case "update_consent":
      return "update_action"
    case "breakdown_action":
    case "breakdown_action_flow":
      return "breakdown_action"
    case "activate_action":
    case "activate_action_flow":
      return "activate_action"
    case "delete_action":
    case "delete_action_flow":
      return "delete_action"
    case "deactivate_action":
    case "deactivate_action_flow":
      return "deactivate_action"
    case "track_progress":
    case "track_progress_flow":
      return "track_progress"
    case "topic_serious":
      return "topic_serious"
    case "topic_light":
      return "topic_light"
    case "deep_reasons":
    case "deep_reasons_exploration":
      return "deep_reasons"
    case "checkup_entry_pending":
      return "checkup"
    default:
      return null
  }
}

function extractActionTargetFromState(chatState: any, machineLabel: string | null): string | undefined {
  const tm = chatState?.temp_memory ?? {}
  const stack = tm?.supervisor?.stack
  if (Array.isArray(stack) && machineLabel) {
    const active = stack.find((s: any) => String(s?.status ?? "") === "active" && String(s?.type ?? "") === machineLabel)
    const target = String(
      active?.meta?.target_action ??
        active?.meta?.candidate?.target_action?.title ??
        active?.meta?.candidate?.label ??
        active?.topic ??
        "",
    ).trim()
    if (target) return target
  }

  const byKey = (key: string) => {
    const raw = (tm as any)?.[key]
    const t = String(raw?.target_action ?? raw?.candidate?.target_action?.title ?? raw?.candidate?.label ?? raw?.topic ?? "").trim()
    return t || undefined
  }

  switch (machineLabel) {
    case "create_action":
      return byKey("create_action_flow")
    case "update_action":
    case "update_consent":
      return byKey("update_action_flow")
    case "breakdown_action":
      return byKey("breakdown_action_flow")
    case "activate_action":
      return byKey("activate_action_flow")
    case "delete_action":
      return byKey("delete_action_flow")
    case "deactivate_action":
      return byKey("deactivate_action_flow")
    case "track_progress":
      return byKey("track_progress_flow")
    case "deep_reasons":
      return String((tm as any)?.deep_reasons_state?.action_title ?? "").trim() || undefined
    default:
      return undefined
  }
}

function parkInterruptedMachineAsDeferred(chatState: any, machineLabel: string | null): { chatState: any; parked: boolean } {
  const machineType = machineLabelToDeferredType(machineLabel)
  if (!machineType || !chatState || typeof chatState !== "object") return { chatState, parked: false }
  const actionTarget = extractActionTargetFromState(chatState, machineLabel)
  const summary = actionTarget
    ? `Interrompu pour bilan: ${actionTarget}`
    : "Interrompu pour bilan du soir"
  const tm = chatState?.temp_memory ?? {}
  const result = deferSignal({
    tempMemory: tm,
    machine_type: machineType,
    action_target: actionTarget,
    summary,
  })
  return {
    chatState: {
      ...chatState,
      temp_memory: result.tempMemory,
    },
    parked: true,
  }
}

function fallbackDailyBilanMessage(): string {
  return (
    "Bonsoir 🙂 C'est le moment du bilan ! Tu es dispo pour qu'on fasse le point sur ta journée ?\n\n" +
    "Un truc dont tu es fier(e) aujourd'hui ?"
  )
}

async function buildPersonalizedDailyBilanMessage(admin: ReturnType<typeof createClient>, args: {
  userId: string
  fullName: string
  requestId: string
  timezone?: string | null
  locale?: string | null
}) {
  // Keep local/test mode deterministic and offline.
  if (isMegaTestMode()) return fallbackDailyBilanMessage()

  const useAi = envBool("DAILY_BILAN_USE_AI", true)
  if (!useAi) return fallbackDailyBilanMessage()

  const maxContext = Math.max(0, Math.min(12, envInt("DAILY_BILAN_CONTEXT_MESSAGES", 6)))

  // Recent WhatsApp conversation snippets (best effort).
  const { data: msgs } = await admin
    .from("chat_messages")
    .select("role, content, created_at, metadata")
    .eq("user_id", args.userId)
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
    .eq("user_id", args.userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const firstName = (args.fullName ?? "").trim().split(" ")[0] || ""
  const planTitle = String((plan as any)?.title ?? "").trim()
  const tctx = buildUserTimeContextFromValues({ timezone: args.timezone ?? null, locale: args.locale ?? null })

  const systemPrompt = `
Tu es Sophia. Tu envoies un message WhatsApp proactif pour INVITER l'utilisateur à faire son bilan du soir.

IMPORTANT: Ce message est une INVITATION au bilan. Tu dois:
1. Faire comprendre clairement que c'est le moment de faire le bilan de la journée
2. Demander si l'utilisateur est disponible pour faire le point maintenant
3. Glisser naturellement la question: "Un truc dont tu es fier(e) aujourd'hui ?" pour amorcer

Objectif: écrire un message court (2-3 phrases max) qui:
- Indique clairement que c'est l'heure du bilan / du point de la journée
- Demande si l'utilisateur est dispo pour en parler
- Fait le lien avec le contexte récent (si dispo)
- Mentionne "un truc dont tu es fier(e) aujourd'hui" pour donner envie

Contraintes:
- Texte brut uniquement. Pas de JSON.
- Max 420 caractères.
- 0 à 1 emoji (max).
- Ne mens pas: si le contexte est vide, fais une intro générique.
- Évite toute info sensible / médicale. Ne "diagnostique" rien.
- Tutoiement.
- NE pose PAS la question "un truc à ajuster pour demain" — elle viendra plus tard dans le bilan.

Infos:
- Repères temporels (critiques):\n${tctx.prompt_block}
- Prénom (si dispo): "${firstName}"
- Plan actif (si dispo): "${planTitle}"
- Historique WhatsApp récent:
${history.length > 0 ? history.join("\n") : "(vide)"}
  `.trim()

  const model = (Deno.env.get("DAILY_BILAN_MODEL") ?? "gemini-2.5-flash").trim()
  let res = ""
  try {
    res = await generateWithGemini(systemPrompt, "Écris le message.", 0.4, false, [], "auto", {
      requestId: args.requestId,
      model,
      source: "trigger-daily-bilan:copy",
      userId: args.userId,
    })
  } catch {
    // Never fail the nightly send because the LLM is temporarily unavailable.
    // Fall back to a deterministic, safe message.
    return fallbackDailyBilanMessage()
  }

  const out = normalizeChatText(res)
  // Safety net: ensure the message mentions the bilan/point and something to be proud of.
  const mentionsBilan = /\b(bilan|point|journée|soir)\b/i.test(out)
  const mentionsFier = out.toLowerCase().includes("fier") || out.toLowerCase().includes("fière")
  if (!out || (!mentionsBilan && !mentionsFier)) return fallbackDailyBilanMessage()
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

function classifyWhatsappSendFailure(msg: string): { kind: "skip"; reason: string } | { kind: "error" } {
  const m = String(msg ?? "")
  const match = m.match(/whatsapp-send failed \((\d{3})\):\s*(\{[\s\S]*\})\s*$/)
  const status = match ? Number(match[1]) : NaN
  let data: any = null
  if (match?.[2]) {
    try {
      data = JSON.parse(match[2])
    } catch {
      data = null
    }
  }
  const err = String(data?.error ?? "").toLowerCase()
  // Permanent-ish gating failures: do not retry all evening.
  if (status === 402) return { kind: "skip", reason: "paywall" }
  if (status === 404) return { kind: "skip", reason: "profile_not_found" }
  if (status === 409) {
    if (err.includes("phone")) return { kind: "skip", reason: "phone_invalid" }
    if (err.includes("opted")) return { kind: "skip", reason: "not_opted_in" }
    return { kind: "skip", reason: "conflict_409" }
  }
  if (status === 400) return { kind: "skip", reason: "bad_request" }
  return { kind: "error" }
}

/**
 * Defer the bilan by writing a "checkup" deferred topic to the user's temp_memory.
 * When the current state machine closes, applyAutoRelaunchFromDeferred will pick it up.
 */
async function deferBilanToTopics(
  admin: ReturnType<typeof createClient>,
  userId: string,
  machineLabel: string,
): Promise<boolean> {
  try {
    // Read current state
    const { data: chatState, error } = await admin
      .from("user_chat_states")
      .select("temp_memory")
      .eq("user_id", userId)
      .eq("scope", "whatsapp")
      .maybeSingle()

    if (error) {
      console.error(`[trigger-daily-bilan] Failed to read chat state for ${userId}:`, error)
      return false
    }

    const tm = (chatState?.temp_memory && typeof chatState.temp_memory === "object")
      ? { ...chatState.temp_memory }
      : {}

    // Build deferred topic entry (mirrors deferred_topics_v2.ts createDeferredTopicV2)
    const now = new Date()
    const nowStr = now.toISOString()
    const deferTtlMinutes = Math.max(30, envInt("DAILY_BILAN_DEFER_TTL_MINUTES", 240))
    const ttlMs = deferTtlMinutes * 60 * 1000
    const rand = Math.random().toString(36).slice(2, 8)
    const topicId = `def_bilan_${nowStr.replace(/[:.]/g, "-")}_${rand}`
    const deferredMarker = {
      source: "trigger-daily-bilan",
      created_at: nowStr,
      blocked_by_machine: machineLabel,
      topic_id: topicId,
    }

    const newTopic = {
      id: topicId,
      machine_type: "checkup",
      signal_summaries: [{
        summary: "Bilan du soir (proactif, différé car machine active)",
        timestamp: nowStr,
      }],
      created_at: nowStr,
      last_updated_at: nowStr,
      trigger_count: 1,
      expires_at: new Date(now.getTime() + ttlMs).toISOString(),
    }

    // Read existing deferred state
    const deferredState = (tm as any).deferred_topics_v2 ?? { topics: [] }
    const existingTopics = Array.isArray(deferredState.topics) ? deferredState.topics : []
    const freshTopics = existingTopics.filter((t: any) => {
      const expiresAt = new Date(String(t?.expires_at ?? "")).getTime()
      if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) return false
      const createdAt = new Date(String(t?.created_at ?? "")).getTime()
      if (Number.isFinite(createdAt) && now.getTime() - createdAt > ttlMs) return false
      return true
    })

    // Check if a checkup deferred already exists (avoid duplicates)
    const alreadyHasCheckup = freshTopics.some(
      (t: any) => t.machine_type === "checkup" && new Date(t.expires_at).getTime() > now.getTime()
    )
    if (alreadyHasCheckup) {
      const updatedTm = {
        ...tm,
        __deferred_bilan_pending: deferredMarker,
      }
      const { data: existingWrite, error: existingWriteErr } = await admin
        .from("user_chat_states")
        .update({ temp_memory: updatedTm })
        .eq("user_id", userId)
        .eq("scope", "whatsapp")
        .select("user_id")
        .maybeSingle()
      if (existingWriteErr || !existingWrite) {
        console.error(`[trigger-daily-bilan] Failed to update deferred marker for ${userId}:`, existingWriteErr ?? "no chat_state row")
        return false
      }
      console.log(`[trigger-daily-bilan] Checkup already deferred for ${userId}, marker refreshed.`)
      return true
    }

    // Add new topic (max 5, FIFO)
    let updatedTopics = [...freshTopics, newTopic]
    if (updatedTopics.length > 5) {
      updatedTopics = updatedTopics.slice(-5)
    }

    const updatedTm = {
      ...tm,
      __deferred_bilan_pending: deferredMarker,
      deferred_topics_v2: {
        ...deferredState,
        topics: updatedTopics,
      },
    }

    // Write back
    const { data: writeData, error: writeErr } = await admin
      .from("user_chat_states")
      .update({ temp_memory: updatedTm })
      .eq("user_id", userId)
      .eq("scope", "whatsapp")
      .select("user_id")
      .maybeSingle()

    if (writeErr || !writeData) {
      console.error(`[trigger-daily-bilan] Failed to write deferred bilan for ${userId}:`, writeErr ?? "no chat_state row")
      return false
    }

    console.log(`[trigger-daily-bilan] Bilan deferred for ${userId} (active machine: ${machineLabel})`)
    return true
  } catch (e) {
    console.error(`[trigger-daily-bilan] deferBilanToTopics error for ${userId}:`, e)
    return false
  }
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

    const body = await req.json().catch(() => ({} as any)) as any
    const userIdsOverride = Array.isArray(body?.user_ids) ? (body.user_ids as any[]).map((x) => String(x ?? "").trim()).filter(Boolean) : []

    // Users eligible for WhatsApp check-ins (phone ok + WhatsApp opted in).
    // Scheduler can pass a user_ids filter; otherwise we keep legacy behavior.
    const q = admin
      .from("profiles")
      .select("id, full_name, whatsapp_bilan_opted_in, timezone, locale, whatsapp_last_inbound_at, whatsapp_last_outbound_at")
      .eq("whatsapp_opted_in", true)
      .eq("phone_invalid", false)
      .not("phone_number", "is", null)

    // Batch cap guard: the previous hard limit(200) could silently exclude eligible users
    // when the scheduler doesn't pass explicit user_ids. Keep it configurable and high by default.
    const profileLimit = Math.max(0, Math.min(5000, envInt("DAILY_BILAN_PROFILE_LIMIT", 2000)))

    const { data: profiles, error } = userIdsOverride.length > 0
      ? await q.in("id", userIdsOverride)
      : (profileLimit > 0 ? await q.limit(profileLimit) : await q)

    if (error) throw error
    const userIds = (profiles ?? []).map((p) => p.id)
    if (userIds.length === 0) {
      return jsonResponse(req, { message: "No opted-in users", request_id: requestId }, { includeCors: false })
    }

    // Optional: restrict to users with an active-ish plan.
    // IMPORTANT: scope this query to the current candidate user IDs.
    // Previously this query was unscoped + limited, which could randomly exclude eligible users
    // (especially when called by the scheduler with user_ids), leading to infinite retries with no send.
    const { data: plans, error: planErr } = await admin
      .from("user_plans")
      .select("user_id")
      .in("user_id", userIds)
      .in("status", ["active", "in_progress", "pending"])

    if (planErr) throw planErr
    const allowed = new Set((plans ?? []).map((p) => p.user_id))
    const filtered = userIds.filter((id) => allowed.has(id))

    // Throttling for batch sends: helps avoid burst rate-limits on Meta/Graph and our own internal throttles.
    // These envs are optional and safe defaults apply.
    const throttleMs = Math.max(0, envInt("DAILY_BILAN_THROTTLE_MS", 300))
    const maxAttempts = Math.max(1, envInt("DAILY_BILAN_MAX_SEND_ATTEMPTS", 5))
    const logSkips = envBool("DAILY_BILAN_LOG_SKIPS", false)
    const forceInterruptInactivityMs = Math.max(1, envInt("DAILY_BILAN_FORCE_INTERRUPT_INACTIVITY_MINUTES", 15)) * 60 * 1000
    const machineHardTtlMs = Math.max(30, envInt("DAILY_BILAN_MACHINE_HARD_TTL_MINUTES", 240)) * 60 * 1000

    let sent = 0
    let skipped = 0
    const errors: Array<{ user_id: string; error: string }> = []
    const sentUserIds: string[] = []
    const skippedUserIds: string[] = []
    const skippedReasons: Record<string, string> = {}

    const profilesById = new Map((profiles ?? []).map((p) => [p.id, p]))

    // ═══════════════════════════════════════════════════════════════════════════
    // BATCH FETCH: Load chat states for all users to check for active machines.
    // If a user already has an active state machine, we defer the bilan instead
    // of interrupting the current conversation.
    // ═══════════════════════════════════════════════════════════════════════════
    const chatStatesById = new Map<string, any>()
    let deferred = 0
    const deferredUserIds: string[] = []
    try {
      const { data: chatStates } = await admin
        .from("user_chat_states")
        .select("user_id, investigation_state, temp_memory")
        .eq("scope", "whatsapp")
        .in("user_id", filtered)

      for (const cs of (chatStates ?? [])) {
        chatStatesById.set(cs.user_id, cs)
      }
    } catch (e) {
      // Non-blocking: if we can't read chat states, proceed without the check.
      console.error("[trigger-daily-bilan] Failed to batch-read chat states:", e)
    }

    async function persistChatState(userId: string, chatState: any): Promise<boolean> {
      try {
        const { error: stErr } = await admin
          .from("user_chat_states")
          .update({
            investigation_state: (chatState as any)?.investigation_state ?? null,
            temp_memory: (chatState as any)?.temp_memory ?? {},
          })
          .eq("user_id", userId)
          .eq("scope", "whatsapp")
        if (stErr) {
          console.error(`[trigger-daily-bilan] Failed to persist chat state for ${userId}:`, stErr)
          return false
        }
        chatStatesById.set(userId, chatState)
        return true
      } catch (e) {
        console.error(`[trigger-daily-bilan] Persist chat state exception for ${userId}:`, e)
        return false
      }
    }

    for (let idx = 0; idx < filtered.length; idx++) {
      const userId = filtered[idx]
      try {
        const p = profilesById.get(userId) as any
        const hasBilanOptIn = Boolean(p?.whatsapp_bilan_opted_in)
        let chatState = chatStatesById.get(userId)

        // Hard cleanup (4h by default): if a machine has been stale too long,
        // clear it now so proactive scheduling is not blocked forever.
        if (chatState) {
          const cleaned = cleanupHardExpiredStateMachines(chatState, { hardTtlMs: machineHardTtlMs })
          if (cleaned.changed) {
            chatState = cleaned.chatState
            await persistChatState(userId, chatState)
            if (logSkips) {
              await logComm(admin, {
                user_id: userId,
                channel: "whatsapp",
                type: "daily_bilan_machine_expired_cleanup",
                status: "cleaned",
                metadata: {
                  cleaned_keys: cleaned.cleaned,
                  request_id: requestId,
                  hard_ttl_minutes: Math.round(machineHardTtlMs / 60000),
                },
              })
            }
          }
        }

        let machineCheck = hasActiveStateMachine(chatState)
        const lastActivity = lastWhatsappActivityMs(p)
        const inactiveForMs = lastActivity ? Math.max(0, Date.now() - lastActivity) : null
        const shouldForceInterrupt = Boolean(
          hasBilanOptIn &&
          machineCheck.active &&
          machineCheck.interruptible &&
          inactiveForMs !== null &&
          inactiveForMs >= forceInterruptInactivityMs,
        )

        // Smooth out bursts (skip the first)
        if (throttleMs > 0 && idx > 0) await sleep(throttleMs)

        // STATE MACHINE CHECK (all proactive sends):
        // while a machine is active, avoid injecting proactive prompts.
        if (machineCheck.active && !hasBilanOptIn) {
          skipped++
          skippedUserIds.push(userId)
          skippedReasons[userId] = `active_state_machine:${machineCheck.machineLabel}`
          if (logSkips) {
            await logComm(admin, {
              user_id: userId,
              channel: "whatsapp",
              type: "daily_bilan_skipped",
              status: "skipped",
              metadata: {
                reason: "active_state_machine",
                active_machine: machineCheck.machineLabel,
                request_id: requestId,
                mode: "template_optin",
              },
            })
          }
          continue
        }

        if (!hasBilanOptIn) {
          // Send a template to ask for explicit opt-in to the daily bilan.
          const resp = await callWhatsappSendWithRetry({
            user_id: userId,
            message: {
              type: "template",
              name: (Deno.env.get("WHATSAPP_BILAN_TEMPLATE_NAME") ?? "sophia_bilan_v1").trim(),
              // For now, UI locks language to French; this mapping is future-proof for multi-lang.
              language: whatsappLangFromLocale((p as any)?.locale ?? null, (Deno.env.get("WHATSAPP_BILAN_TEMPLATE_LANG") ?? "fr").trim()),
              // components will be auto-filled by whatsapp-send with {{1}} = full_name
            },
            purpose: "daily_bilan",
            require_opted_in: true,
            force_template: true,
          }, { maxAttempts, throttleMs })
          if ((resp as any)?.skipped) {
            skipped++
            skippedUserIds.push(userId)
            const reason = String((resp as any)?.skip_reason ?? "skipped")
            skippedReasons[userId] = reason
            if (logSkips) {
              await logComm(admin, {
                user_id: userId,
                channel: "whatsapp",
                type: "daily_bilan_skipped",
                status: "skipped",
                metadata: { reason, request_id: requestId, mode: "template_optin" },
              })
            }
          } else {
            sent++
            sentUserIds.push(userId)
          }
        } else {
          if (shouldForceInterrupt && machineCheck.machineLabel) {
            const interruptedLabel = machineCheck.machineLabel
            const parked = parkInterruptedMachineAsDeferred(chatState, interruptedLabel)
            chatState = parked.chatState
            const interrupted = clearActiveMachineForDailyBilan(chatState, interruptedLabel)
            if (interrupted.changed || parked.parked) {
              chatState = interrupted.chatState
              await persistChatState(userId, chatState)
            }
            machineCheck = hasActiveStateMachine(chatState)
            if (logSkips) {
              await logComm(admin, {
                user_id: userId,
                channel: "whatsapp",
                type: "daily_bilan_forced_interrupt",
                status: "forced",
                metadata: {
                  interrupted_machine: interruptedLabel,
                  parked_as_deferred: parked.parked,
                  inactivity_minutes: inactiveForMs !== null ? Math.round(inactiveForMs / 60000) : null,
                  threshold_minutes: Math.round(forceInterruptInactivityMs / 60000),
                  request_id: requestId,
                },
              })
            }
          }

          // ═══════════════════════════════════════════════════════════════════
          // STATE MACHINE CHECK: If user has an active state machine, defer
          // the bilan to deferred_topics_v2 instead of interrupting.
          // The bilan will auto-relaunch when the current machine closes.
          // ═══════════════════════════════════════════════════════════════════
          if (machineCheck.active) {
            const didDefer = await deferBilanToTopics(admin, userId, machineCheck.machineLabel!)
            if (didDefer) {
              deferred++
              deferredUserIds.push(userId)
              skippedReasons[userId] = `deferred:active_machine:${machineCheck.machineLabel}`
              if (logSkips) {
                await logComm(admin, {
                  user_id: userId,
                  channel: "whatsapp",
                  type: "daily_bilan_deferred",
                  status: "deferred",
                  metadata: {
                    reason: "active_state_machine",
                    active_machine: machineCheck.machineLabel,
                    request_id: requestId,
                  },
                })
              }
              continue // Skip sending, bilan is deferred
            }
            // If deferral failed, fall through and try to send anyway.
          }

          const bilanMessage = await buildPersonalizedDailyBilanMessage(admin, {
            userId,
            fullName: String(p?.full_name ?? ""),
            requestId,
            timezone: (p as any)?.timezone ?? null,
            locale: (p as any)?.locale ?? null,
          })
          // Already opted in: send the actual bilan prompt (text).
          const resp = await callWhatsappSendWithRetry({
            user_id: userId,
            message: { type: "text", body: bilanMessage },
            purpose: "daily_bilan",
            require_opted_in: true,
          }, { maxAttempts, throttleMs })
          if ((resp as any)?.skipped) {
            skipped++
            skippedUserIds.push(userId)
            const reason = String((resp as any)?.skip_reason ?? "skipped")
            skippedReasons[userId] = reason
            if (logSkips) {
              await logComm(admin, {
                user_id: userId,
                channel: "whatsapp",
                type: "daily_bilan_skipped",
                status: "skipped",
                metadata: { reason, request_id: requestId, mode: "text_prompt" },
              })
            }
          } else {
            sent++
            sentUserIds.push(userId)
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // Do not fail the whole batch on one user.
        if (msg.includes("Proactive throttle")) {
          skipped++
          skippedUserIds.push(userId)
          skippedReasons[userId] = "proactive_throttle_2_per_10h"
          if (logSkips) {
            await logComm(admin, {
              user_id: userId,
              channel: "whatsapp",
              type: "daily_bilan_skipped",
              status: "skipped",
              metadata: { reason: "proactive_throttle_2_per_10h", request_id: requestId },
            })
          }
        }
        else {
          const cls = classifyWhatsappSendFailure(msg)
          if (cls.kind === "skip") {
            skipped++
            skippedUserIds.push(userId)
            skippedReasons[userId] = cls.reason
            if (logSkips) {
              await logComm(admin, {
                user_id: userId,
                channel: "whatsapp",
                type: "daily_bilan_skipped",
                status: "skipped",
                metadata: { reason: cls.reason, request_id: requestId, mode: "whatsapp_send_failure" },
              })
            }
          } else {
            errors.push({ user_id: userId, error: msg })
          }
        }
      }
    }

    return jsonResponse(
      req,
      {
        success: true,
        sent,
        skipped,
        deferred,
        sent_user_ids: sentUserIds,
        skipped_user_ids: skippedUserIds,
        deferred_user_ids: deferredUserIds,
        skipped_reasons: skippedReasons,
        errors,
        throttle_ms: throttleMs,
        max_send_attempts: maxAttempts,
        request_id: requestId,
      },
      { includeCors: false },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[trigger-daily-bilan] request_id=${requestId}`, error)
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})
