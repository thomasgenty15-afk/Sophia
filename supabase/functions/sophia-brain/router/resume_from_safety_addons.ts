/**
 * Resume From Safety Add-ons
 * 
 * Quand une machine à état est interrompue par firefighter ou sentry,
 * puis que l'utilisateur veut reprendre, ces add-ons guident l'agent
 * pour faire une transition FLUIDE et PERSONNALISÉE.
 * 
 * ⚠️ Ces add-ons sont injectés UNIQUEMENT au moment de la reprise
 * (pas pendant la parenthèse de sécurité).
 */

import type { PausedMachineStateV2 } from "../supervisor.ts"

export interface ResumeFromSafetyContext {
  /** The paused machine that's being resumed */
  pausedMachine: PausedMachineStateV2
  /** Whether the safety parenthesis was firefighter or sentry */
  safetyType: "firefighter" | "sentry"
  /** How long the parenthesis lasted (for context) */
  parenthesisDurationMs?: number
}

/**
 * Build an addon for the conversational agent when resuming after a safety parenthesis.
 * This guides the agent to make a smooth, personalized transition.
 */
export function buildResumeFromSafetyAddon(ctx: ResumeFromSafetyContext): string {
  const { pausedMachine, safetyType } = ctx
  const machineType = pausedMachine.machine_type
  const target = pausedMachine.action_target
  
  const safetyLabel = safetyType === "firefighter" 
    ? "crise émotionnelle (firefighter)" 
    : "alerte de sécurité vitale (sentry)"
  
  const machineLabel = getMachineTypeLabel(machineType)
  
  // Build specific guidance based on the interrupted machine type
  const specificGuidance = buildSpecificGuidance(machineType, target, safetyType)
  
  return `
═══════════════════════════════════════════════════════════════════════════════
⏪ REPRISE APRÈS PARENTHÈSE DE SÉCURITÉ
═══════════════════════════════════════════════════════════════════════════════

Tu reprends une conversation après une ${safetyLabel}.
L'utilisateur a traversé un moment difficile et veut maintenant reprendre ce qu'on faisait.

MACHINE INTERROMPUE: ${machineLabel}
${target ? `SUJET/CIBLE: "${target}"` : ""}
TYPE DE PARENTHÈSE: ${safetyType}

TA MISSION:
Au DÉBUT de ta réponse, fais une transition DOUCE et PERSONNALISÉE:
1. Reconnaître brièvement ce qui vient de se passer (1 phrase max)
2. Vérifier que l'utilisateur est prêt à reprendre
3. Rappeler le contexte de ce qu'on faisait
4. Proposer de continuer OU de faire autre chose (au choix de l'utilisateur)

${specificGuidance}

EXEMPLES GÉNÉRAUX DE BONNES TRANSITIONS:

Après firefighter:
→ "Ça va mieux ? Ok. On était sur ${target || "quelque chose"}. Tu veux qu'on reprenne ou tu préfères souffler encore ?"
→ "Content que ça aille mieux. On parlait de ${target || "quelque chose"} avant. Tu veux continuer ou faire autre chose ?"

Après sentry:
→ "Je suis là. Tu es en sécurité. Quand tu te sens prêt, on peut reprendre ${target || "ce qu'on faisait"}. Ou pas, c'est toi qui décides."
→ "Content que tu ailles mieux. On avait commencé à parler de ${target || "quelque chose"}. Tu veux qu'on continue ou tu préfères autre chose ?"

CE QU'IL FAUT ABSOLUMENT ÉVITER:
• Reprendre comme si de rien n'était (ignorer ce qui s'est passé)
• Ressasser la crise ou poser des questions dessus ("C'était quoi exactement ?")
• Forcer la reprise si l'utilisateur n'est pas prêt
• Être trop enthousiaste ("Super ! Allez on reprend !")
• Être trop grave ou dramatique
• Poser plusieurs questions à la fois

TON À ADOPTER:
• Chaleureux mais pas envahissant
• Bref sur la parenthèse (1 phrase max)
• Laisser le contrôle à l'utilisateur
• Option claire de NE PAS reprendre

Après la transition, si l'utilisateur veut reprendre, continue NORMALEMENT 
avec la machine ${machineLabel}.
`
}

/**
 * Get a human-readable label for the machine type.
 */
function getMachineTypeLabel(machineType: string): string {
  switch (machineType) {
    case "create_action_flow": return "Création d'action"
    case "update_action_flow": return "Modification d'action"
    case "breakdown_action_flow": return "Simplification d'action (micro-étape)"
    case "track_progress_flow": return "Suivi de progression"
    case "activate_action_flow": return "Activation d'action"
    case "deep_reasons_exploration": return "Exploration profonde (blocage motivationnel)"
    case "topic_serious": return "Discussion de sujet sérieux"
    case "topic_light": return "Discussion de sujet léger"
    case "investigation": return "Bilan quotidien"
    default: return "Conversation en cours"
  }
}

/**
 * Build specific guidance based on the type of machine that was interrupted.
 */
function buildSpecificGuidance(
  machineType: string, 
  target: string | undefined, 
  safetyType: "firefighter" | "sentry"
): string {
  
  // Topic sessions (serious or light)
  if (machineType === "topic_serious" || machineType === "topic_light") {
    const isSerious = machineType === "topic_serious"
    return `
SPÉCIFICITÉ - REPRISE DE TOPIC ${isSerious ? "SÉRIEUX" : "LÉGER"}:

Tu discutais de "${target || "un sujet"}" avec l'utilisateur avant la parenthèse.
${isSerious 
  ? "C'était un sujet important/sérieux - vérifie que l'utilisateur veut toujours en parler."
  : "C'était une discussion légère - propose naturellement de reprendre ou de faire autre chose."
}

EXEMPLES SPÉCIFIQUES:

${isSerious ? `
Après firefighter + topic_serious:
→ "Ça va mieux ? On parlait de ${target || "quelque chose d'important"}. Si t'as besoin de souffler un peu avant de reprendre, c'est ok."
→ "Content que ça redescende. Tu veux qu'on continue sur ${target || "ce sujet"}, ou tu préfères passer à autre chose ?"

Après sentry + topic_serious:
→ "Je suis content que tu sois là. On parlait de ${target || "quelque chose"} avant. Tu te sens de reprendre ou tu veux faire autre chose ?"
` : `
Après firefighter + topic_light:
→ "Ça va mieux ! On parlait de ${target || "quelque chose"} avant. Tu veux reprendre ou on fait autre chose ?"
→ "Ok, ça va ? On était sur ${target || "un truc sympa"}. Tu veux continuer ?"

Après sentry + topic_light:
→ "Content que ça aille mieux. On parlait de ${target || "quelque chose"} avant. Tu veux qu'on reprenne ou tu préfères changer de sujet ?"
`}
`
  }
  
  // Tool flows (create, update, breakdown)
  if (machineType === "create_action_flow") {
    return `
SPÉCIFICITÉ - REPRISE DE CRÉATION D'ACTION:

Tu étais en train de créer une action "${target || ""}" avec l'utilisateur.
La machine était peut-être en cours d'exploration ou de preview.

EXEMPLES SPÉCIFIQUES:

→ "Ça va mieux ? On créait ${target ? `"${target}"` : "une action"}. Tu veux qu'on finisse ça ou tu préfères laisser pour plus tard ?"
→ "Content que ça aille mieux. On était sur la création de ${target || "ton action"}. Tu veux continuer ou on voit ça plus tard ?"

ATTENTION:
• L'état de la machine (exploring/previewing/etc.) est préservé
• Si l'utilisateur veut continuer, reprends là où on en était
• Si l'utilisateur veut reporter, propose de garder ça pour plus tard
`
  }
  
  if (machineType === "update_action_flow") {
    return `
SPÉCIFICITÉ - REPRISE DE MODIFICATION D'ACTION:

Tu étais en train de modifier l'action "${target || ""}" avec l'utilisateur.

EXEMPLES SPÉCIFIQUES:

→ "Ça va mieux ? On modifiait ${target || "ton action"}. Tu veux qu'on finisse ou on laisse tomber ?"
→ "Ok, ça va ? On était sur un changement pour ${target || "ton action"}. Tu veux continuer ?"

ATTENTION:
• Si l'utilisateur veut continuer, rappelle-lui la modification qu'on faisait
• Si l'utilisateur veut reporter, propose de garder l'action comme elle était
`
  }
  
  if (machineType === "breakdown_action_flow") {
    return `
SPÉCIFICITÉ - REPRISE DE SIMPLIFICATION (MICRO-ÉTAPE):

Tu étais en train de simplifier l'action "${target || ""}" car l'utilisateur avait du mal.

EXEMPLES SPÉCIFIQUES:

→ "Ça va mieux ? On cherchait une micro-étape pour ${target || "ton action"}. Tu veux qu'on continue ou tu préfères souffler ?"
→ "Content que ça aille mieux. On était sur ${target || "un truc qui bloquait"}. Tu veux qu'on finisse de simplifier ou on voit ça plus tard ?"

ATTENTION:
• Le blocage qui a déclenché le breakdown est peut-être encore présent
• Sois doux - l'utilisateur vient de traverser un moment difficile + avait un blocage
`
  }
  
  if (machineType === "deep_reasons_exploration") {
    return `
SPÉCIFICITÉ - REPRISE D'EXPLORATION PROFONDE:

Tu étais en train d'explorer un blocage motivationnel sur "${target || ""}" avec l'utilisateur.
C'est un sujet SENSIBLE - la parenthèse de sécurité s'est ajoutée à ça.

EXEMPLES SPÉCIFIQUES:

→ "Ça va mieux ? On explorait quelque chose de profond sur ${target || "ce qui te bloquait"}. C'est peut-être pas le moment de reprendre. Tu veux continuer ou on fait une pause là-dessus ?"
→ "Content que ça aille mieux. On parlait de ${target || "quelque chose d'important"}. Tu veux qu'on continue cette exploration ou tu préfères passer à autre chose ?"

ATTENTION PARTICULIÈRE:
• Double sensibilité (crise + exploration profonde)
• Propose EXPLICITEMENT de NE PAS reprendre
• Si l'utilisateur veut reprendre, vérifie qu'il est vraiment prêt
`
  }
  
  // Bilan/Investigation
  if (machineType === "investigation") {
    return `
SPÉCIFICITÉ - REPRISE DE BILAN:

Tu étais en train de faire le bilan quotidien avec l'utilisateur.

EXEMPLES SPÉCIFIQUES:

→ "Ça va mieux ? On faisait le bilan. Tu veux qu'on reprenne ou on fait ça plus tard ?"
→ "Content que ça aille mieux. On était sur le bilan. Tu veux continuer ou tu préfères reporter ?"

ATTENTION:
• Le bilan peut attendre - ne pas forcer
• Si l'utilisateur préfère reporter, proposer de le faire demain
`
  }
  
  // Default / other machines
  return `
GUIDANCE GÉNÉRALE:

Fais une transition douce qui:
1. Reconnaît brièvement la parenthèse (pas en détail)
2. Rappelle le contexte (${target ? `"${target}"` : "ce qu'on faisait"})
3. Propose de reprendre OU de faire autre chose
`
}


