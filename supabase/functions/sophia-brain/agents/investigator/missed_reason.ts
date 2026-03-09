import { generateWithGemini } from "../../../_shared/gemini.ts"
import type { PendingMissedReason } from "./types.ts"

export type MissedReasonDecision = {
  matched_entry_ids: string[]
  reason: string | null
}

export async function detectMissedReasonUpdate(opts: {
  message: string
  pending: PendingMissedReason[]
  history: any[]
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string }
}): Promise<MissedReasonDecision> {
  const message = String(opts.message ?? "").trim()
  if (!message || !Array.isArray(opts.pending) || opts.pending.length === 0) {
    return { matched_entry_ids: [], reason: null }
  }

  const pendingBlock = opts.pending.map((item) =>
    `- entry_id: ${item.entry_id}\n  item_title: ${item.item_title}\n  item_type: ${item.item_type}`
  ).join("\n")
  const historyBlock = (opts.history ?? []).slice(-8).map((m) => `${m.role}: ${m.content}`).join("\n")

  const prompt = `
Tu détermines si le prochain message utilisateur apporte une justification à un ou plusieurs items déjà loggés comme "missed".

RÈGLES:
- Ne retourne un match que si le message contient une vraie justification exploitable.
- Si le message répond juste à autre chose, est vague, ou ne parle pas clairement du missed, retourne zéro match.
- La raison doit être courte, reformulée proprement, sans recopier tout le message.
- Retourne uniquement du JSON valide.

JSON attendu:
{
  "matched_entry_ids": string[],
  "reason": string | null
}

MISSED EN ATTENTE:
${pendingBlock}

HISTORIQUE RÉCENT:
${historyBlock}
`.trim()

  try {
    const raw = await generateWithGemini(
      prompt,
      message,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: opts.meta?.requestId,
        model: opts.meta?.model,
        source: "sophia-brain:investigator:missed-reason",
        forceRealAi: opts.meta?.forceRealAi,
      },
    )
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
    return {
      matched_entry_ids: Array.isArray(parsed?.matched_entry_ids)
        ? parsed.matched_entry_ids.map((id: unknown) => String(id ?? "").trim()).filter(Boolean)
        : [],
      reason: typeof parsed?.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim().slice(0, 220)
        : null,
    }
  } catch (error) {
    console.warn("[Investigator] missed reason detection failed (non-blocking):", error)
    return { matched_entry_ids: [], reason: null }
  }
}
