import { generateWithGemini } from "../../../_shared/gemini.ts"
import type { CheckupItem } from "./types.ts"

export type OpeningDecision = {
  decision: "open_now" | "open_softly" | "defer"
  opening_message: string | null
  reason: string | null
}

function sanitizeDecision(raw: unknown): OpeningDecision {
  const obj = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  const decisionRaw = String(obj.decision ?? "").trim()
  const decision = decisionRaw === "open_now" || decisionRaw === "open_softly" || decisionRaw === "defer"
    ? decisionRaw
    : "open_softly"
  const openingMessage = typeof obj.opening_message === "string"
    ? obj.opening_message.trim()
    : ""
  const reason = typeof obj.reason === "string" ? obj.reason.trim() : ""
  return {
    decision,
    opening_message: openingMessage || null,
    reason: reason || null,
  }
}

export async function decideCheckupOpening(opts: {
  message: string
  history: any[]
  focusItems: CheckupItem[]
  summaryYesterday?: unknown
  openingContext?: {
    mode: "cold_relaunch" | "ongoing_conversation"
    allow_relaunch_greeting: boolean
    hours_since_last_message: number | null
    last_message_at: string | null
  }
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string; channel?: "web" | "whatsapp" }
}): Promise<OpeningDecision> {
  const historyBlock = (opts.history ?? [])
    .slice(-10)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")
  const itemsBlock = opts.focusItems.map((item) => `${item.type}: ${item.title}`).join(" | ")

  const prompt = `
Tu décides comment ouvrir un bilan quotidien dans une conversation déjà en cours.

MISSION:
1. Regarder les derniers tours.
2. Décider s'il est pertinent de lancer le bilan maintenant.
3. Si oui, produire un message d'ouverture naturel qui propose le bilan de façon fluide et se termine par une question large sur la journée.
4. Considérer l'historique comme un contexte indicatif de continuité, pas comme une demande à laquelle il faudrait répondre point par point.

SORTIES POSSIBLES:
- "open_now": le bilan peut démarrer directement.
- "open_softly": le bilan peut démarrer mais il faut une transition douce.
- "defer": le contexte est trop sensible / trop lourd / trop déplacé pour lancer le bilan maintenant.

RÈGLES:
- Si la conversation est émotionnellement lourde, en crise, ou centrée sur un événement important encore actif, préfère "defer".
- Si la conversation est compatible mais déjà engagée sur un autre sujet, préfère "open_softly".
- Si tu ouvres le bilan, le message doit inclure l'idée du point du jour puis finir par une variante naturelle de "Comment ça s'est passé aujourd'hui ?"
- Si tu diffères, le message ne lance PAS le bilan. Il reste humain, bref, et suit le contexte.
- Le message d'ouverture est une initiative proactive autonome, pas une réponse directe à un message précis.
- L'historique récent sert surtout à doser la douceur d'entrée et éviter les faux raccords.
- Un acquiescement de départ ("Ça marche", "Ok", "D'accord", "Parfait", etc.) n'est autorisé QUE si le dernier message utilisateur est très récent et appelle explicitement une validation.
- Si l'historique est ancien, vide, ou sans demande/accord explicite sur le bilan, interdiction de commencer par un acquiescement.
- "Entrer en douceur" ne veut pas dire approuver le dernier message; cela veut dire raccorder naturellement sans effet de réponse automatique.
- Pas de ton robotique. Pas de jargon technique. Français uniquement.
- Retourne uniquement du JSON valide.

JSON attendu:
{
  "decision": "open_now" | "open_softly" | "defer",
  "opening_message": string | null,
  "reason": string | null
}

CANAL: ${opts.meta?.channel ?? "web"}
FOCUS ITEMS: ${itemsBlock}
SUMMARY YESTERDAY: ${JSON.stringify(opts.summaryYesterday ?? null)}
OPENING CONTEXT: ${JSON.stringify(opts.openingContext ?? null)}
HISTORIQUE RÉCENT:
${historyBlock}
`.trim()

  try {
    const raw = await generateWithGemini(
      prompt,
      String(opts.message ?? "").trim() || "Prépare l'ouverture du bilan.",
      0.1,
      true,
      [],
      "auto",
      {
        requestId: opts.meta?.requestId,
        model: opts.meta?.model,
        source: "sophia-brain:investigator:opening-decider",
        forceRealAi: opts.meta?.forceRealAi,
      },
    )
    return sanitizeDecision(typeof raw === "string" ? JSON.parse(raw) : raw)
  } catch (error) {
    console.warn("[Investigator] opening_decider failed (non-blocking):", error)
    return {
      decision: "open_softly",
      opening_message: null,
      reason: "fallback",
    }
  }
}
