import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import type { AgentMode } from "../state-manager.ts"
import { generateWithGemini } from "../../_shared/gemini.ts"

export async function enqueueLlmRetryJob(opts: {
  supabase: SupabaseClient
  userId: string
  scope: string
  channel: "web" | "whatsapp"
  userMessage: string
  investigationActive: boolean
  requestId?: string
  reason: string
}): Promise<string | null> {
  const { supabase, userId, scope, channel, userMessage, investigationActive, requestId, reason } = opts
  try {
    const { data, error } = await supabase.rpc("enqueue_llm_retry_job", {
      p_user_id: userId,
      p_scope: scope,
      p_channel: channel,
      p_message: userMessage,
      p_metadata: {
        reason,
        request_id: requestId ?? null,
        source: "sophia-brain:router",
        investigation_active: Boolean(investigationActive),
      },
    })
    if (error) throw error
    return data ? String(data) : null
  } catch (e) {
    console.error("[Router] enqueue_llm_retry_job failed (non-blocking):", e)
    return null
  }
}

export async function tryEmergencyAiReply(opts: {
  userMessage: string
  targetMode: AgentMode
  checkupActive: boolean
  isPostCheckup: boolean
  requestId?: string
  userId?: string
  forceRealAi?: boolean
}): Promise<string | null> {
  const { userMessage } = opts
  try {
    const emergencySystem = `
Tu es Sophia.
Contrainte: le système a eu un souci temporaire, mais tu DOIS quand même répondre utilement et naturellement.

RÈGLES:
- Français, tutoiement.
- Ne mentionne pas d'erreur technique, pas de "je suis saturée", pas de "renvoie ton message".
- Réponse courte (max ~6 lignes). 1 question max.
- Si CHECKUP actif: ne pars pas sur un autre sujet, garde le fil.
- Si POST-BILAN actif: traite le sujet en cours, ne propose jamais de "reprendre le bilan".

CONTEXTE:
- targetMode=${opts.targetMode}
- checkupActive=${opts.checkupActive ? "true" : "false"}
- postCheckup=${opts.isPostCheckup ? "true" : "false"}
      `.trim()

    const model =
      ((((globalThis as any)?.Deno?.env?.get?.("GEMINI_FALLBACK_MODEL") ?? "") as string).trim()) ||
      // Last resort: stable model name
      "gemini-2.0-flash"

    const out = await generateWithGemini(emergencySystem, userMessage, 0.2, false, [], "auto", {
      requestId: opts.requestId,
      userId: opts.userId,
      model,
      source: "sophia-brain:router_emergency",
      forceRealAi: opts.forceRealAi,
    })
    if (typeof out === "string" && out.trim()) return out
    return null
  } catch (e) {
    console.error("[Router] emergency AI reply failed:", e)
    return null
  }
}


