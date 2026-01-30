/**
 * Deferred Signal Add-ons
 * 
 * Quand un signal mère est détecté pendant qu'une machine à état est active,
 * ces add-ons guident l'agent conversationnel pour acquitter le signal de manière
 * PERSONNALISÉE et fluide, en identifiant ce qui a déclenché le signal dans le message.
 * 
 * ⚠️ Ces add-ons sont injectés UNIQUEMENT la première fois qu'un signal est différé
 * (pas lors d'un enrichissement/update du même topic).
 */

import type { DeferredMachineType } from "./deferred_topics_v2.ts"

export interface DeferredSignalAddonContext {
  /** Type de signal différé */
  machine_type: DeferredMachineType
  /** Cible de l'action si applicable (ex: "Méditation") */
  action_target?: string
  /** Message de l'utilisateur qui a déclenché le signal */
  userMessage: string
  /** Nom de la machine actuellement active */
  currentMachineType: string
  /** Cible de la machine actuelle si applicable */
  currentMachineTarget?: string
  /** Est-ce un update d'un topic déjà différé (pas première fois) */
  isUpdate: boolean
  /** Nombre de fois que ce signal a été déclenché */
  triggerCount: number
}

/**
 * Génère un add-on pour guider l'agent à acquitter un signal différé.
 * Retourne une chaîne vide si pas d'acquittement nécessaire (update silencieux).
 */
export function buildDeferredSignalAddon(ctx: DeferredSignalAddonContext): string {
  // Si c'est un update (pas la première fois), on reste subtil ou silencieux
  if (ctx.isUpdate) {
    if (ctx.triggerCount >= 3) {
      // 3+ fois mentionné: silencieux
      return ""
    }
    // 2ème fois: très subtil, pas besoin d'add-on complexe
    return `
═══════════════════════════════════════════════════════════════════════════════
⏸️ SIGNAL DÉJÀ NOTÉ (${ctx.triggerCount}ème mention)
═══════════════════════════════════════════════════════════════════════════════

L'utilisateur a RE-MENTIONNÉ quelque chose qu'on a déjà noté pour plus tard.
Tu peux l'acquitter subtilement (ex: "Oui j'ai bien noté aussi pour ça")
ou rester silencieux si c'est redondant. Continue ensuite avec le sujet en cours.
`
  }

  // Première fois: add-on complet pour personnaliser l'acquittement
  switch (ctx.machine_type) {
    case "deep_reasons":
      return buildDeepReasonsAddon(ctx)
    case "breakdown_action":
      return buildBreakdownAddon(ctx)
    case "create_action":
      return buildCreateActionAddon(ctx)
    case "update_action":
      return buildUpdateActionAddon(ctx)
    case "track_progress":
      return buildTrackProgressAddon(ctx)
    case "checkup":
      return buildCheckupAddon(ctx)
    case "topic_serious":
      return buildTopicSeriousAddon(ctx)
    case "topic_light":
      return buildTopicLightAddon(ctx)
    case "user_profile_confirmation":
      return buildProfileConfirmAddon(ctx)
    default:
      return buildGenericAddon(ctx)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADD-ONS PAR TYPE DE SIGNAL
// ═══════════════════════════════════════════════════════════════════════════════

function buildDeepReasonsAddon(ctx: DeferredSignalAddonContext): string {
  return `
═══════════════════════════════════════════════════════════════════════════════
⏸️ SIGNAL DIFFÉRÉ: DEEP_REASONS (Exploration profonde)
═══════════════════════════════════════════════════════════════════════════════

Le dispatcher a détecté un BLOCAGE MOTIVATIONNEL dans ce message:
"${ctx.userMessage.slice(0, 200)}${ctx.userMessage.length > 200 ? "..." : ""}"

CE QUI A DÉCLENCHÉ LE SIGNAL:
L'utilisateur a exprimé quelque chose de profond (flemme, peur, "je sais pas pourquoi", 
ambivalence, résistance émotionnelle) qui mérite une exploration plus approfondie.

${ctx.action_target ? `Action concernée: "${ctx.action_target}"` : ""}

TA MISSION:
Au DÉBUT de ta réponse, acquitte ce signal de manière PERSONNALISÉE:
1. Identifie les mots/expressions qui montrent le blocage motivationnel
2. Reformule-les avec empathie pour montrer que tu as capté
3. Indique qu'on y reviendra après avoir terminé ${ctx.currentMachineTarget || "le sujet en cours"}

EXEMPLES DE BONNES FORMULATIONS:

Si user dit "j'ai la flemme de faire du sport, je sais pas pourquoi":
→ "Je capte qu'il y a un truc plus profond derrière la flemme. On pourra creuser ça après, 
   si tu veux. Mais d'abord, finissons [sujet en cours]."

Si user dit "une partie de moi veut pas vraiment méditer":
→ "Cette partie de toi qui résiste, c'est intéressant. On en parlera juste après. 
   Pour l'instant, continuons sur [sujet en cours]."

Si user dit "ça me saoule, j'ai pas envie":
→ "Je note que t'as pas envie, et c'est ok de le dire. On explorera ça ensemble après 
   qu'on ait fini avec [sujet en cours]."

CE QU'IL FAUT ÉVITER:
• Templates génériques ("J'ai noté pour plus tard")
• Ignorer le signal sans l'acquitter
• Faire la morale ("tu devrais quand même...")
• Commencer l'exploration maintenant (on finit d'abord le sujet en cours)

Après l'acquittement, continue NORMALEMENT avec ${ctx.currentMachineTarget || "le sujet en cours"}.
`
}

function buildBreakdownAddon(ctx: DeferredSignalAddonContext): string {
  return `
═══════════════════════════════════════════════════════════════════════════════
⏸️ SIGNAL DIFFÉRÉ: BREAKDOWN_ACTION (Micro-étape)
═══════════════════════════════════════════════════════════════════════════════

Le dispatcher a détecté une DEMANDE DE SIMPLIFICATION dans ce message:
"${ctx.userMessage.slice(0, 200)}${ctx.userMessage.length > 200 ? "..." : ""}"

CE QUI A DÉCLENCHÉ LE SIGNAL:
L'utilisateur exprime qu'une action est trop difficile, trop longue, ou qu'il n'arrive pas 
à la faire. Il a besoin d'une micro-étape.

${ctx.action_target ? `Action concernée: "${ctx.action_target}"` : ""}

TA MISSION:
Au DÉBUT de ta réponse, acquitte ce signal de manière PERSONNALISÉE:
1. Identifie l'action ou le blocage pratique mentionné
2. Valide que c'est normal de vouloir simplifier
3. Indique qu'on s'en occupe juste après ${ctx.currentMachineTarget || "le sujet en cours"}

EXEMPLES DE BONNES FORMULATIONS:

Si user dit "je galère à tenir mes 30 min de sport":
→ "Les 30 min qui bloquent, c'est noté. On verra comment simplifier ça 
   juste après qu'on ait fini avec [sujet en cours]."

Si user dit "c'est trop long ma routine du matin":
→ "Ta routine du matin qui est trop longue, j'ai capté. On la découpe 
   dès qu'on termine [sujet en cours]."

Si user dit "j'arrive jamais à commencer ma méditation":
→ "Commencer qui bloque, ok. On trouvera une micro-étape pour ça 
   après [sujet en cours]."

CE QU'IL FAUT ÉVITER:
• Templates génériques
• Proposer la micro-étape maintenant (on finit d'abord le sujet en cours)
• Minimiser le blocage

Après l'acquittement, continue NORMALEMENT avec ${ctx.currentMachineTarget || "le sujet en cours"}.
`
}

function buildCreateActionAddon(ctx: DeferredSignalAddonContext): string {
  return `
═══════════════════════════════════════════════════════════════════════════════
⏸️ SIGNAL DIFFÉRÉ: CREATE_ACTION (Nouvelle action)
═══════════════════════════════════════════════════════════════════════════════

Le dispatcher a détecté une INTENTION DE CRÉER UNE ACTION dans ce message:
"${ctx.userMessage.slice(0, 200)}${ctx.userMessage.length > 200 ? "..." : ""}"

CE QUI A DÉCLENCHÉ LE SIGNAL:
L'utilisateur veut ajouter quelque chose à son plan (nouvelle habitude, action, objectif).

${ctx.action_target ? `Action suggérée: "${ctx.action_target}"` : ""}

TA MISSION:
Au DÉBUT de ta réponse, acquitte ce signal de manière PERSONNALISÉE:
1. Identifie l'action ou l'idée d'action mentionnée
2. Montre de l'intérêt (sans être trop enthousiaste)
3. Indique qu'on la crée après ${ctx.currentMachineTarget || "le sujet en cours"}

EXEMPLES DE BONNES FORMULATIONS:

Si user dit "tiens je devrais peut-être méditer le matin":
→ "Méditer le matin, bonne idée. On crée ça juste après qu'on ait fini 
   avec [sujet en cours]."

Si user dit "j'ai envie de commencer à lire":
→ "Commencer à lire, j'aime bien. On voit ça ensemble après [sujet en cours]."

Si user dit "faudrait que je fasse plus de sport":
→ "Plus de sport, noté. On regarde comment ajouter ça après [sujet en cours]."

CE QU'IL FAUT ÉVITER:
• Être trop enthousiaste ("Super idée !!!")
• Commencer à créer l'action maintenant
• Demander des détails maintenant

Après l'acquittement, continue NORMALEMENT avec ${ctx.currentMachineTarget || "le sujet en cours"}.
`
}

function buildUpdateActionAddon(ctx: DeferredSignalAddonContext): string {
  return `
═══════════════════════════════════════════════════════════════════════════════
⏸️ SIGNAL DIFFÉRÉ: UPDATE_ACTION (Modification d'action)
═══════════════════════════════════════════════════════════════════════════════

Le dispatcher a détecté une INTENTION DE MODIFIER UNE ACTION dans ce message:
"${ctx.userMessage.slice(0, 200)}${ctx.userMessage.length > 200 ? "..." : ""}"

CE QUI A DÉCLENCHÉ LE SIGNAL:
L'utilisateur veut changer quelque chose dans une action existante (fréquence, moment, etc).

${ctx.action_target ? `Action à modifier: "${ctx.action_target}"` : ""}

TA MISSION:
Au DÉBUT de ta réponse, acquitte ce signal de manière PERSONNALISÉE:
1. Identifie l'action et le type de modification mentionné
2. Valide que c'est normal d'ajuster
3. Indique qu'on fait la modif après ${ctx.currentMachineTarget || "le sujet en cours"}

EXEMPLES DE BONNES FORMULATIONS:

Si user dit "faudrait que je change ma méditation pour le soir":
→ "Passer la méditation au soir, noté. On fait ce changement juste après 
   [sujet en cours]."

Si user dit "3 fois par semaine c'est trop, je veux réduire":
→ "Réduire la fréquence, ok. On ajuste ça après qu'on ait terminé 
   [sujet en cours]."

CE QU'IL FAUT ÉVITER:
• Commencer la modification maintenant
• Juger le changement demandé

Après l'acquittement, continue NORMALEMENT avec ${ctx.currentMachineTarget || "le sujet en cours"}.
`
}

function buildTrackProgressAddon(ctx: DeferredSignalAddonContext): string {
  return `
═══════════════════════════════════════════════════════════════════════════════
⏸️ SIGNAL DIFFÉRÉ: TRACK_PROGRESS (Suivi de progression)
═══════════════════════════════════════════════════════════════════════════════

Le dispatcher a détecté une MENTION DE PROGRÈS dans ce message:
"${ctx.userMessage.slice(0, 200)}${ctx.userMessage.length > 200 ? "..." : ""}"

CE QUI A DÉCLENCHÉ LE SIGNAL:
L'utilisateur mentionne avoir fait ou pas fait quelque chose.

TA MISSION:
Au DÉBUT de ta réponse, acquitte ce signal de manière PERSONNALISÉE:
1. Identifie ce que l'utilisateur a fait ou pas fait
2. Reconnaître brièvement (féliciter si fait, pas de jugement si pas fait)
3. Indiquer qu'on note ça après ${ctx.currentMachineTarget || "le sujet en cours"}

EXEMPLES:
→ "Ah t'as fait ton sport aujourd'hui, cool ! Je note ça après [sujet en cours]."
→ "Ok t'as pas eu le temps pour la méditation, pas de souci. On voit ça après."

Après l'acquittement, continue NORMALEMENT avec ${ctx.currentMachineTarget || "le sujet en cours"}.
`
}

function buildCheckupAddon(ctx: DeferredSignalAddonContext): string {
  return `
═══════════════════════════════════════════════════════════════════════════════
⏸️ SIGNAL DIFFÉRÉ: CHECKUP (Bilan)
═══════════════════════════════════════════════════════════════════════════════

Le dispatcher a détecté une DEMANDE DE BILAN dans ce message:
"${ctx.userMessage.slice(0, 200)}${ctx.userMessage.length > 200 ? "..." : ""}"

CE QUI A DÉCLENCHÉ LE SIGNAL:
L'utilisateur veut faire le point sur sa semaine, ses actions, ou son plan.

TA MISSION:
Au DÉBUT de ta réponse, acquitte ce signal de manière PERSONNALISÉE:
1. Identifie ce qui montre la demande de bilan
2. Valide l'intérêt de faire le point
3. Indiquer qu'on fait ça après ${ctx.currentMachineTarget || "le sujet en cours"}

EXEMPLES:
→ "Faire le point sur ta semaine, bonne idée. On s'y met juste après [sujet en cours]."
→ "Voir où t'en es, j'ai capté. On fait ce bilan après qu'on termine ici."

Après l'acquittement, continue NORMALEMENT avec ${ctx.currentMachineTarget || "le sujet en cours"}.
`
}

function buildTopicSeriousAddon(ctx: DeferredSignalAddonContext): string {
  return `
═══════════════════════════════════════════════════════════════════════════════
⏸️ SIGNAL DIFFÉRÉ: TOPIC_SERIOUS (Sujet sérieux/important)
═══════════════════════════════════════════════════════════════════════════════

Le dispatcher a détecté un SUJET SÉRIEUX dans ce message:
"${ctx.userMessage.slice(0, 200)}${ctx.userMessage.length > 200 ? "..." : ""}"

CE QUI A DÉCLENCHÉ LE SIGNAL:
L'utilisateur mentionne quelque chose d'important qui mérite une vraie discussion 
(problème perso, situation stressante, question de vie, etc).

${ctx.action_target ? `Sujet identifié: "${ctx.action_target}"` : ""}

TA MISSION:
Au DÉBUT de ta réponse, acquitte ce signal avec EMPATHIE:
1. Identifie le sujet sérieux mentionné
2. Montre que tu as capté l'importance
3. Indiquer qu'on y revient après ${ctx.currentMachineTarget || "le sujet en cours"}

EXEMPLES:

Si user mentionne un souci au travail:
→ "Ce qui se passe avec ton boulot, ça a l'air pesant. On en parle 
   dès qu'on termine [sujet en cours], promis."

Si user mentionne un conflit:
→ "La situation avec [personne], j'ai bien noté. On prend le temps 
   d'en parler après [sujet en cours]."

CE QU'IL FAUT ÉVITER:
• Minimiser le sujet
• Dire juste "j'ai noté" sans empathie
• Commencer à en parler maintenant

Après l'acquittement, continue NORMALEMENT avec ${ctx.currentMachineTarget || "le sujet en cours"}.
`
}

function buildTopicLightAddon(ctx: DeferredSignalAddonContext): string {
  return `
═══════════════════════════════════════════════════════════════════════════════
⏸️ SIGNAL DIFFÉRÉ: TOPIC_LIGHT (Sujet léger/digression)
═══════════════════════════════════════════════════════════════════════════════

Le dispatcher a détecté un CHANGEMENT DE SUJET dans ce message:
"${ctx.userMessage.slice(0, 200)}${ctx.userMessage.length > 200 ? "..." : ""}"

CE QUI A DÉCLENCHÉ LE SIGNAL:
L'utilisateur change de sujet ou fait une digression (pas urgent).

${ctx.action_target ? `Sujet identifié: "${ctx.action_target}"` : ""}

TA MISSION:
Au DÉBUT de ta réponse, acquitte ce signal de manière LÉGÈRE:
1. Identifie le nouveau sujet mentionné
2. Montre de l'intérêt (ton léger)
3. Indiquer qu'on y revient après ${ctx.currentMachineTarget || "le sujet en cours"}

EXEMPLES:
→ "Ah ${ctx.action_target || "ça"} ! On en parle juste après, d'abord on finit [sujet en cours]."
→ "Intéressant ça. On y revient dans 2 minutes, promis."

Après l'acquittement, continue NORMALEMENT avec ${ctx.currentMachineTarget || "le sujet en cours"}.
`
}

function buildProfileConfirmAddon(ctx: DeferredSignalAddonContext): string {
  return `
═══════════════════════════════════════════════════════════════════════════════
⏸️ SIGNAL DIFFÉRÉ: PROFILE_CONFIRMATION (Info personnelle)
═══════════════════════════════════════════════════════════════════════════════

Le dispatcher a détecté une INFO PERSONNELLE dans ce message:
"${ctx.userMessage.slice(0, 200)}${ctx.userMessage.length > 200 ? "..." : ""}"

CE QUI A DÉCLENCHÉ LE SIGNAL:
L'utilisateur a mentionné quelque chose sur lui (préférences, situation, etc).

TA MISSION:
Tu n'as PAS BESOIN d'acquitter explicitement ce signal. Continue normalement.
L'info sera confirmée plus tard automatiquement.
`
}

function buildGenericAddon(ctx: DeferredSignalAddonContext): string {
  return `
═══════════════════════════════════════════════════════════════════════════════
⏸️ SIGNAL DIFFÉRÉ: ${ctx.machine_type.toUpperCase()}
═══════════════════════════════════════════════════════════════════════════════

Le dispatcher a détecté un signal dans ce message:
"${ctx.userMessage.slice(0, 200)}${ctx.userMessage.length > 200 ? "..." : ""}"

${ctx.action_target ? `Cible: "${ctx.action_target}"` : ""}

TA MISSION:
Au DÉBUT de ta réponse, acquitte ce signal de manière naturelle:
1. Identifie ce qui a déclenché le signal
2. Montre que tu as capté
3. Indique qu'on y revient après ${ctx.currentMachineTarget || "le sujet en cours"}

Après l'acquittement, continue NORMALEMENT avec ${ctx.currentMachineTarget || "le sujet en cours"}.
`
}

