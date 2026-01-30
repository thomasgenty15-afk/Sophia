/**
 * Relaunch Consent Add-ons
 * 
 * Add-ons pour gérer la demande et l'analyse du consentement de reprise de sujet différé.
 * 
 * 1. Add-on AGENT : Guide l'agent pour poser une question de consentement personnalisée
 * 2. Add-on DISPATCHER : Fait analyser la réponse par le dispatcher (consent_to_relaunch signal)
 */

import type { DeferredMachineType } from "./deferred_topics_v2.ts"

// ═══════════════════════════════════════════════════════════════════════════════
// ADD-ON AGENT : Pour demander le consentement de manière personnalisée
// ═══════════════════════════════════════════════════════════════════════════════

export interface RelaunchConsentContext {
  machine_type: DeferredMachineType
  action_target?: string
  summaries: string[]
}

/**
 * Génère un add-on pour l'agent conversationnel qui doit demander le consentement.
 * L'agent va personnaliser la question avec son style naturel.
 */
export function buildRelaunchConsentAgentAddon(ctx: RelaunchConsentContext): string {
  const { machine_type, action_target, summaries } = ctx
  const latestSummary = summaries.length > 0 ? summaries[summaries.length - 1] : null
  
  const machineLabel = getMachineTypeLabel(machine_type)
  const contextInfo = buildContextInfo(machine_type, action_target, latestSummary)

  return `
═══════════════════════════════════════════════════════════════════════════════
⏸️ DEMANDE DE CONSENTEMENT POUR REPRISE DE SUJET
═══════════════════════════════════════════════════════════════════════════════

Un sujet a été mis en attente et tu dois maintenant demander à l'utilisateur 
s'il veut qu'on s'en occupe.

TYPE DE SUJET: ${machineLabel}
${contextInfo}

TA MISSION:
À la FIN de ta réponse (après avoir répondu normalement si nécessaire), 
pose une QUESTION de consentement pour savoir si l'utilisateur veut reprendre ce sujet.

POINTS CRITIQUES:
• La question doit être PERSONNALISÉE et NATURELLE (pas un template robotique)
• L'utilisateur doit pouvoir répondre OUI ou NON clairement
• Ne force pas, propose simplement
• Si l'utilisateur a dit autre chose dans son message, réponds d'abord à ça, puis pose la question

EXEMPLES DE BONNES QUESTIONS:

Pour breakdown_action (${action_target || "une action"}):
→ "Au fait, tu me parlais de ${action_target || "quelque chose"} qui bloquait. Tu veux qu'on s'en occupe maintenant ?"
→ "Sinon, on avait laissé en suspens ${action_target || "un truc"}. Tu veux qu'on regarde ça ?"

Pour create_action:
→ "Et pour ${action_target || "l'action"} que tu voulais créer, on s'y met ?"
→ "Tu voulais ajouter quelque chose à ton plan tout à l'heure. On le fait maintenant ?"

Pour deep_reasons:
→ "Au fait, tu voulais qu'on creuse un peu plus ${action_target || "ce qui bloquait"}. Tu veux en parler ?"
→ "On avait commencé à explorer quelque chose de plus profond. Tu veux qu'on continue ?"

Pour topic_serious/topic_light:
→ "Tu voulais parler de ${action_target || "quelque chose"}. On y va ?"
→ "Au fait, ${action_target || "le sujet de tout à l'heure"}, tu veux en discuter maintenant ?"

CE QU'IL FAUT ÉVITER:
• Questions robotiques ("Voulez-vous reprendre le sujet X ?")
• Forcer ou insister
• Oublier de poser la question
• Poser la question AVANT de répondre au message actuel de l'utilisateur
`
}

/**
 * Get a human-readable label for the machine type.
 */
function getMachineTypeLabel(machineType: DeferredMachineType): string {
  switch (machineType) {
    case "breakdown_action": return "Simplification d'action (micro-étape)"
    case "create_action": return "Création d'action"
    case "update_action": return "Modification d'action"
    case "track_progress": return "Suivi de progression"
    case "deep_reasons": return "Exploration profonde (blocage motivationnel)"
    case "topic_serious": return "Sujet sérieux"
    case "topic_light": return "Sujet de discussion"
    case "checkup": return "Bilan"
    case "user_profile_confirmation": return "Confirmation de préférences"
    default: return "Sujet en attente"
  }
}

/**
 * Build context info based on machine type and target.
 */
function buildContextInfo(
  machineType: DeferredMachineType, 
  actionTarget?: string, 
  summary?: string | null
): string {
  const parts: string[] = []
  
  if (actionTarget) {
    parts.push(`CIBLE: "${actionTarget}"`)
  }
  
  if (summary) {
    parts.push(`CONTEXTE: ${summary}`)
  }
  
  return parts.length > 0 ? parts.join("\n") : "(pas de contexte spécifique)"
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD-ON DISPATCHER : Pour analyser la réponse au consentement
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Génère un add-on pour le dispatcher quand il doit analyser une réponse de consentement.
 * Le dispatcher va extraire le signal consent_to_relaunch.
 */
export function buildRelaunchConsentDispatcherAddon(ctx: RelaunchConsentContext): string {
  const { machine_type, action_target } = ctx
  const machineLabel = getMachineTypeLabel(machine_type)

  return `
═══════════════════════════════════════════════════════════════════════════════
🎯 ANALYSE DE CONSENTEMENT DE REPRISE (PRIORITAIRE)
═══════════════════════════════════════════════════════════════════════════════

Sophia vient de demander à l'utilisateur s'il veut reprendre un sujet mis en attente.
Tu dois analyser la réponse pour extraire le signal consent_to_relaunch.

SUJET PROPOSÉ: ${machineLabel}
${action_target ? `CIBLE: "${action_target}"` : ""}

SIGNAL À EXTRAIRE (PRIORITAIRE):
{
  "consent_to_relaunch": true | false | "unclear"
}

RÈGLES D'INTERPRÉTATION:

consent_to_relaunch = true si:
• "oui", "ok", "d'accord", "vas-y", "go", "on y va", "allez"
• "avec plaisir", "carrément", "volontiers", "bien sûr"
• "c'est bon", "oui on fait ça", "ok on s'y met"
• Réponse courte positive (< 30 caractères) avec "oui" ou "ok"

consent_to_relaunch = false si:
• "non", "nan", "nope", "pas maintenant", "plus tard"
• "laisse", "pas envie", "une autre fois", "on verra"
• "j'ai pas le temps", "pas aujourd'hui"
• Réponse courte négative (< 40 caractères) avec "non" ou refus

consent_to_relaunch = "unclear" si:
• L'utilisateur parle d'autre chose sans répondre à la question
• Réponse ambiguë qui n'est ni oui ni non
• "je sais pas", "peut-être", "hmm"

IMPORTANT:
• Ce signal est PRIORITAIRE - analyse-le en PREMIER
• Si la réponse est claire (oui/non), les autres signaux sont secondaires
• Si "unclear", continue l'analyse normale des autres signaux
`
}

