/**
 * Next Topic Add-ons
 * 
 * Add-ons pour proposer le sujet suivant dans la file d'attente
 * quand une machine topic/deep_reasons se ferme.
 */

import type { DeferredTopicV2 } from "./deferred_topics_v2.ts"

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface PendingNextTopic {
  type: string
  topic_id: string
  briefs: string[]
  action_target?: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD-ON BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build an add-on to guide the agent to propose the next topic in queue.
 * Used when a topic/deep_reasons machine closes and there's another waiting.
 */
export function buildNextTopicProposalAddon(ctx: {
  type: string
  briefs: string[]
  action_target?: string
}): string {
  const { type, briefs, action_target } = ctx
  
  const getMachineLabel = (t: string): string => {
    switch (t) {
      case "topic_serious": return "sujet sérieux"
      case "topic_light": return "sujet de discussion"
      case "deep_reasons": return "exploration profonde"
      default: return t
    }
  }
  
  const label = getMachineLabel(type)
  const topicSummary = briefs.slice(0, 2).map(b => `"${b.slice(0, 60)}"`).join(" / ")
  
  return `
═══════════════════════════════════════════════════════════════════════════════
📌 SUJET SUIVANT EN ATTENTE
═══════════════════════════════════════════════════════════════════════════════

Type: ${label}
${action_target ? `Cible: "${action_target}"` : ""}
Contexte: ${topicSummary || "aucun contexte"}

DIRECTIVE:
À la FIN de ta réponse actuelle, propose NATURELLEMENT d'aborder ce sujet.

EXEMPLES DE TRANSITIONS NATURELLES:

Si sujet sérieux:
→ "Au fait, tu avais aussi mentionné quelque chose sur [sujet]. On en parle maintenant ou tu préfères faire une pause ?"
→ "Il y avait aussi [sujet] dont tu voulais parler. C'est le bon moment ?"

Si sujet léger:
→ "D'ailleurs, tu voulais aussi parler de [sujet], non ? On enchaîne ?"
→ "Et sinon, il y avait cette histoire de [sujet]. Ça te dit ?"

Si exploration profonde:
→ "Au fait, on avait repéré un truc intéressant sur [sujet]. T'es partant pour creuser ?"
→ "Il y avait aussi cette réflexion sur [sujet]. On explore ?"

IMPORTANT:
- La proposition doit être NATURELLE, pas administrative
- Laisser le choix à l'utilisateur (pas de pression)
- Si l'utilisateur décline, le sujet reste en attente pour plus tard
- NE PAS commencer par la proposition - d'abord terminer le sujet actuel proprement
`
}

/**
 * Build an add-on for when the user declines the proposed next topic.
 */
export function buildNextTopicDeclinedAddon(): string {
  return `
═══════════════════════════════════════════════════════════════════════════════
✓ SUJET DÉCLINÉ - STOCKÉ POUR PLUS TARD
═══════════════════════════════════════════════════════════════════════════════

L'utilisateur a décliné le sujet proposé. C'est OK !
Le sujet reste en file d'attente et sera reproposé plus tard si pertinent.

DIRECTIVE:
- Accusé de réception simple ("Pas de souci", "Ok, on verra plus tard")
- Passer à autre chose ou clôturer naturellement
- PAS de relance ou de culpabilisation
`
}

/**
 * Check if a deferred topic matches a closed machine type.
 * Used to find the next topic to propose.
 */
export function findNextSameTypeTopic(
  deferredTopics: DeferredTopicV2[],
  closedMachineType: string
): DeferredTopicV2 | null {
  // Map session types to deferred machine types
  const typeMapping: Record<string, string> = {
    "topic_serious": "topic_serious",
    "topic_light": "topic_light",
    "deep_reasons_exploration": "deep_reasons",
  }
  
  const targetType = typeMapping[closedMachineType]
  if (!targetType) return null
  
  return deferredTopics.find(t => t.machine_type === targetType) ?? null
}




