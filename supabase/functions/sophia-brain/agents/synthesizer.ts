import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { generateWithGemini, getGlobalAiModel } from "../../_shared/gemini.ts"
import { getUserState, normalizeScope } from "../state-manager.ts"

type ChatMessageRow = {
  role: "user" | "assistant" | "system"
  content: string
  created_at: string
}

function asIso(v: unknown): string {
  const s = String(v ?? "").trim()
  if (!s) return ""
  const d = new Date(s)
  return Number.isFinite(d.getTime()) ? d.toISOString() : ""
}

function safeObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function buildTranscript(rows: ChatMessageRow[]): string {
  return rows
    .map((m) => `[${m.created_at}] ${String(m.role).toUpperCase()}: ${String(m.content ?? "")}`)
    .join("\n")
}

function toSafeNonNegativeInt(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.floor(n))
}

export async function runSynthesizer(opts: {
  supabase: SupabaseClient
  userId: string
  scopeRaw: unknown
  maxRecentMessages?: number
  minNewMessages?: number
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string }
}): Promise<{ updated: boolean; reason: string; newMessages: number }> {
  const {
    supabase,
    userId,
    scopeRaw,
    maxRecentMessages = 15,
    minNewMessages = 15,
    meta,
  } = opts

  const scope = normalizeScope(scopeRaw, "web")
  const state = await getUserState(supabase, userId, scope)
  const prevContext = String(state.short_term_context ?? "").trim()
  const unprocessedMessages = toSafeNonNegativeInt((state as any)?.unprocessed_msg_count)
  if (unprocessedMessages < minNewMessages) {
    return { updated: false, reason: "below_threshold", newMessages: unprocessedMessages }
  }

  const { data: recentRows, error: recentErr } = await supabase
    .from("chat_messages")
    .select("role,content,created_at")
    .eq("user_id", userId)
    .eq("scope", scope)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(maxRecentMessages)
  if (recentErr) throw recentErr

  const recent = ((recentRows ?? []) as ChatMessageRow[]).slice().reverse()
  if (recent.length === 0) return { updated: false, reason: "no_messages", newMessages: 0 }

  const transcriptRecent = buildTranscript(recent)
  const latestMessageAt = asIso(recent[recent.length - 1]?.created_at)

  const systemPrompt = `
Tu es le Synthétiseur de contexte court terme de Sophia.
Tu dois FUSIONNER l'ancien contexte + les nouveaux messages.

RÈGLES CRITIQUES :
- Ne paraphrase PAS les derniers messages mot à mot.
- Conserve uniquement l'information utile pour les prochaines réponses.
- Garde les boucles ouvertes, décisions, contraintes immédiates et état émotionnel.
- Supprime les infos obsolètes / réglées.
- Compact, clair, actionnable. Pas de storytelling.
- 900 caractères maximum.

Format de sortie JSON strict :
{
  "short_term_context": "..."
}
  `.trim()

  const userPrompt = `
ANCIEN SHORT TERM CONTEXT:
${prevContext || "(vide)"}

NOUVEAUX MESSAGES (priorité):
${transcriptRecent}
  `.trim()

  let nextContext = prevContext
  try {
    const raw = await generateWithGemini(systemPrompt, userPrompt, 0.15, true, [], "json", {
      requestId: meta?.requestId,
      model: meta?.model ?? getGlobalAiModel("gemini-2.5-flash"),
      source: "sophia-brain:synthesizer",
      forceRealAi: meta?.forceRealAi,
      userId,
    })
    const parsed = JSON.parse(String(raw ?? "{}"))
    const candidate = String(parsed?.short_term_context ?? "").trim()
    if (candidate) nextContext = candidate
  } catch (e) {
    console.warn("[Synthesizer] LLM fusion failed, keeping previous context:", e)
  }

  // Atomic-ish update with optimistic locking to avoid clobbering concurrent
  // increments of unprocessed_msg_count while synthesis is running.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error: rowErr } = await supabase
      .from("user_chat_states")
      .select("unprocessed_msg_count,temp_memory")
      .eq("user_id", userId)
      .eq("scope", scope)
      .maybeSingle()

    if (rowErr) throw rowErr
    if (!row) throw new Error(`user_chat_states row missing for user=${userId} scope=${scope}`)

    const currentCount = toSafeNonNegativeInt((row as any)?.unprocessed_msg_count)
    if (currentCount < minNewMessages) {
      return { updated: false, reason: "below_threshold_race", newMessages: currentCount }
    }
    const nextCount = Math.max(0, currentCount - minNewMessages)

    const tempMemory = safeObj((row as any)?.temp_memory)
    const jobState = safeObj(tempMemory.__job_state)
    const synthState = safeObj(jobState.synthesizer)
    const mergedTempMemory = {
      ...tempMemory,
      __job_state: {
        ...jobState,
        synthesizer: {
          ...synthState,
          last_message_at: latestMessageAt || null,
          updated_at: new Date().toISOString(),
          new_messages: minNewMessages,
        },
      },
    }
    delete (mergedTempMemory as any).short_context_last_message_at
    delete (mergedTempMemory as any).short_context_updated_at
    delete (mergedTempMemory as any).short_context_new_messages

    const { error: updateErr, count } = await supabase
      .from("user_chat_states")
      .update(
        {
          short_term_context: nextContext,
          temp_memory: mergedTempMemory,
          unprocessed_msg_count: nextCount,
        },
        { count: "exact" },
      )
      .eq("user_id", userId)
      .eq("scope", scope)
      .eq("unprocessed_msg_count", currentCount)

    if (updateErr) throw updateErr
    if ((count ?? 0) > 0) {
      return { updated: true, reason: "updated", newMessages: minNewMessages }
    }
  }

  throw new Error(`Could not persist synthesizer update after retries user=${userId} scope=${scope}`)
}
