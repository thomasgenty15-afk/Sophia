import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { generateWithGemini } from "../../_shared/gemini.ts"
import { getUserState, normalizeScope, updateUserState } from "../state-manager.ts"

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

export async function runSynthesizer(opts: {
  supabase: SupabaseClient
  userId: string
  scopeRaw: unknown
  maxRecentMessages?: number
  minNewMessages?: number
  staleForceMinutes?: number
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string }
}): Promise<{ updated: boolean; reason: string; newMessages: number }> {
  const {
    supabase,
    userId,
    scopeRaw,
    maxRecentMessages = 24,
    minNewMessages = 12,
    staleForceMinutes = 60,
    meta,
  } = opts

  const scope = normalizeScope(scopeRaw, "web")
  const state = await getUserState(supabase, userId, scope)
  const tempMemory = safeObj((state as any)?.temp_memory)
  const prevContext = String(state.short_term_context ?? "").trim()
  const lastSynthMessageAt = asIso(tempMemory.short_context_last_message_at)
  const lastSynthUpdatedAt = asIso(tempMemory.short_context_updated_at)

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

  const latestMessageAt = asIso(recent[recent.length - 1]?.created_at)
  if (lastSynthMessageAt && latestMessageAt && latestMessageAt <= lastSynthMessageAt) {
    return { updated: false, reason: "already_up_to_date", newMessages: 0 }
  }

  const newRows = lastSynthMessageAt
    ? recent.filter((m) => asIso(m.created_at) > lastSynthMessageAt)
    : recent
  const newMessages = newRows.length
  if (newMessages === 0) return { updated: false, reason: "no_new_messages", newMessages: 0 }

  const staleEnough = (() => {
    if (!lastSynthUpdatedAt) return true
    const ms = Date.now() - new Date(lastSynthUpdatedAt).getTime()
    return ms >= staleForceMinutes * 60 * 1000
  })()
  if (newMessages < minNewMessages && !staleEnough) {
    return { updated: false, reason: "below_threshold", newMessages }
  }

  const transcriptRecent = buildTranscript(recent)
  const transcriptNew = buildTranscript(newRows.slice(-Math.min(16, newRows.length)))

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
${transcriptNew}

FENÊTRE RÉCENTE (contexte):
${transcriptRecent}
  `.trim()

  let nextContext = prevContext
  try {
    const raw = await generateWithGemini(systemPrompt, userPrompt, 0.15, true, [], "json", {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-2.5-flash",
      source: "sophia-brain:synthesizer",
      forceRealAi: meta?.forceRealAi,
    })
    const parsed = JSON.parse(String(raw ?? "{}"))
    const candidate = String(parsed?.short_term_context ?? "").trim()
    if (candidate) nextContext = candidate
  } catch (e) {
    console.warn("[Synthesizer] LLM fusion failed, keeping previous context:", e)
  }

  const mergedTempMemory = {
    ...tempMemory,
    short_context_last_message_at: latestMessageAt || lastSynthMessageAt || null,
    short_context_updated_at: new Date().toISOString(),
    short_context_new_messages: newMessages,
  }

  await updateUserState(supabase, userId, scope, {
    short_term_context: nextContext,
    temp_memory: mergedTempMemory,
  } as any)

  return { updated: true, reason: "updated", newMessages }
}


