import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

import { normalizeScope } from "../state-manager.ts"
import { getAnyActiveToolFlow } from "../supervisor.ts"

// Public API (router/agent_exec.ts depends on these exports)
export type { ArchitectModelOutput } from "./architect/types.ts"
export { getArchitectTools } from "./architect/tools.ts"
export { buildArchitectSystemPromptLite } from "./architect/prompt.ts"
export { defaultArchitectModelForRequestId, generateArchitectModelOutput } from "./architect/model.ts"
export { handleArchitectModelOutput } from "./architect/handle_model_output.ts"
export { megaToolCreateFramework, megaToolCreateSimpleAction, megaToolUpdateActionStructure } from "./architect/mega_tools.ts"

import { getArchitectTools } from "./architect/tools.ts"
import { generateArchitectModelOutput } from "./architect/model.ts"
import { handleArchitectModelOutput } from "./architect/handle_model_output.ts"
import { megaToolCreateFramework } from "./architect/mega_tools.ts"
import { looksLikeExplicitCreateActionRequest, looksLikeUserAsksToAddToPlanLoosely } from "./architect/consent.ts"
import { logToolLedgerEvent } from "../lib/tool_ledger.ts"

export async function runArchitect(
  supabase: SupabaseClient,
  userId: string,
  message: string, 
  history: any[], 
  userState: any,
  context: string = "",
  meta?: { requestId?: string; evalRunId?: string | null; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; scope?: string },
): Promise<{ text: string; executed_tools: string[]; tool_execution: "none" | "blocked" | "success" | "failed" | "uncertain" }> {
  const lastAssistantMessage = history.filter((m: any) => m.role === "assistant").pop()?.content || ""
  const isWhatsApp = (meta?.channel ?? "web") === "whatsapp"
  const isModuleUi = String(context ?? "").includes("=== CONTEXTE MODULE (UI) ===")

  function looksLikeExplicitPlanOperationRequest(msg: string): boolean {
    const s = String(msg ?? "").trim().toLowerCase()
    if (!s) return false
    if (looksLikeExplicitCreateActionRequest(msg)) return true
    if (looksLikeUserAsksToAddToPlanLoosely(msg)) return true
    // Updates / activation / archive: user clearly wants an operation on the plan.
    if (/\b(modifie|modifier|change|changer|mets|mettre|supprime|supprimer|archive|archiver|d[ée]sactive|d[ée]sactiver|active|activer|fr[ée]quence|dans mon plan|sur mon plan|au plan)\b/i.test(msg)) {
      return true
    }
    return false
  }

  // --- Deterministic shortcut: "Attrape-Rêves Mental" activation ---
  // This is intentionally handled without LLM/tool-calling to avoid "silent" failures on WhatsApp.
  // It creates the framework in the active plan (if any) and returns the exercise steps right away.
  const msgLower = (message ?? "").toString().toLowerCase()
  const looksLikeAttrapeReves =
    /(attrape)\s*[-–—]?\s*(r[eê]ves?|r[êe]ve)\b/i.test(msgLower) ||
    /\battrape[-\s]*r[eê]ves?\b/i.test(msgLower)
  const looksLikeActivation =
    /\b(active|activez|activer|lance|lancer|on\s+y\s+va|vas[-\s]*y|go)\b/i.test(msgLower)

  if (!isWhatsApp && looksLikeAttrapeReves && looksLikeActivation) {
    const reqId = String(meta?.requestId ?? "").trim()
    const evalRunId = meta?.evalRunId ?? null
    const t0 = Date.now()
    const traceTool = async (evt: "tool_call_attempted" | "tool_call_succeeded" | "tool_call_failed", extra?: any) => {
      if (!reqId) return
      await logToolLedgerEvent({
        supabase,
        requestId: reqId,
        evalRunId,
        userId,
        source: "sophia-brain:architect",
        event: evt,
        level: evt === "tool_call_failed" ? "error" : "info",
        toolName: "create_framework",
        toolArgs: {
          title: "Attrape-Rêves Mental",
          targetReps: 7,
          time_of_day: "night",
        },
        latencyMs: Date.now() - t0,
        metadata: { deterministic: true, shortcut: "attrape_reves", ...(extra ?? {}) },
      })
    }
    try {
      await traceTool("tool_call_attempted")
    } catch {}
    const createdMsg = await megaToolCreateFramework(supabase, userId, {
      title: "Attrape-Rêves Mental",
      description: "Un mini exercice d’écriture (2–4 minutes) pour relâcher les pensées intrusives avant de dormir.",
      targetReps: 7,
      time_of_day: "night",
      frameworkDetails: {
        type: "recurring",
        intro:
          "But: vider la tête (pas résoudre).\n\nRègle: écris vite, sans te censurer. 2 à 4 minutes max. Puis tu fermes.",
        sections: [
          {
            id: "s1",
            label: "Ce qui tourne en boucle (1 phrase).",
            inputType: "textarea",
            placeholder: "Ex: J’ai peur de ne pas réussir demain…",
          },
          {
            id: "s2",
            label: "Le scénario catastrophe (en brut).",
            inputType: "textarea",
            placeholder: "Ex: Je vais mal dormir, être nul au boulot, tout s’écroule…",
          },
          {
            id: "s3",
            label: "La version plus vraie / plus utile (une réponse sobre).",
            inputType: "textarea",
            placeholder: "Ex: Même fatigué, je gère. Je fais 1 petit pas demain matin.",
          },
          {
            id: "s4",
            label: "Je le dépose pour demain à… (heure) + 1 micro-action.",
            inputType: "textarea",
            placeholder: "Ex: Demain 10h. Micro-action: noter 3 priorités sur papier.",
          },
        ],
      },
    })

    const createdLower = String(createdMsg || "").toLowerCase()
    const creationFailed = createdLower.includes("je ne trouve pas de plan actif") || createdLower.includes("erreur")
    const creationDuplicate = createdLower.includes("déjà")
    try {
      if (creationFailed) await traceTool("tool_call_failed", { outcome: "failed", reason: "no_active_plan_or_error", created_msg: String(createdMsg ?? "").slice(0, 240) })
      else await traceTool("tool_call_succeeded", { outcome: creationDuplicate ? "duplicate_or_uncertain" : "success", created_msg: String(createdMsg ?? "").slice(0, 240) })
    } catch {}
    const intro = creationFailed
      ? "Ok. Voilà l'exercice Attrape‑Rêves Mental."
      : (creationDuplicate ? "Ok. L'exercice Attrape‑Rêves Mental est déjà dans ton plan." : "Ok. Attrape‑Rêves Mental activé.")
    const steps =
      `${intro}\n\n` +
      `On le fait maintenant (2–4 min) :\n` +
      `- 1) Note la pensée qui tourne en boucle (1 phrase)\n` +
      `- 2) Écris le scénario catastrophe (sans filtre)\n` +
      `- 3) Écris une version plus vraie / plus utile (sobre)\n` +
      `- 4) Dépose‑le pour demain à une heure + 1 micro‑action\n\n` +
      `Envoie-moi juste ta ligne 1 quand tu veux, et je t’aide à faire le 2→3 proprement.`

    // If the framework couldn't be created (no active plan), be honest but still deliver the exercise.
    if (creationFailed) {
      return { text: `${steps}\n\n(Je peux te le mettre dans ton plan dès que tu as un plan actif.)`, executed_tools: [], tool_execution: "none" }
    }
    return { text: steps, executed_tools: ["create_framework"], tool_execution: creationDuplicate ? "uncertain" : "success" }
  }

  const basePrompt = isWhatsApp ? `
    Tu es Sophia. (Casquette : Architecte).
    Objectif: aider à exécuter le plan avec des micro-étapes concrètes.

    MODE MODULE (UI) :
    - Si le contexte contient "=== CONTEXTE MODULE (UI) ===", priorité #1 = aider l'utilisateur à répondre à la question / faire l'exercice du module.
    - Ne ramène PAS spontanément la discussion au plan/dashboard.
    - Si une action/habitude pourrait aider: propose comme option, puis demande "Tu veux que je l'ajoute à ton plan ?"

    MODE WHATSAPP (CRITIQUE) :
    - Réponse courte par défaut (3–7 lignes).
    - 1 question MAX (oui/non ou A/B de préférence).
    - Si message user court/pressé: 1–2 phrases MAX + 1 question.
    - Pas de "Bonjour/Salut" au milieu d'une conversation.
    - Pas de ** (texte brut uniquement).
    - Ne mentionne jamais des rôles internes ni "je suis une IA".
    - Interdiction d'utiliser les glyphes ◊ ◇ ◆ (zéro puces décoratives).

    OUTILS :
    - track_progress: quand l'utilisateur dit qu'il a fait / pas fait une action.
    - break_down_action: si une action bloque ET que l'utilisateur accepte explicitement qu'on la découpe en micro-étape (2 min).
    - update_action_structure: si l'utilisateur demande un changement sur une action existante.
    - create_simple_action / create_framework: uniquement si un plan actif existe (sinon refuse).
    - activate_plan_action: pour activer une action future.

    RÈGLES CRITIQUES :
    - N'invente jamais un changement ("j'ai activé/créé") sans preuve (outil + succès).
    - Distingue active vs pending quand tu parles d'actions.
    - Si le contexte contient ARCHITECT_LOOP_GUARD, tu obéis.

    DERNIÈRE RÉPONSE DE SOPHIA : "${lastAssistantMessage.substring(0, 120)}..."

    CONTEXTE OPÉRATIONNEL :
    ${context ? context : "(vide)"}
  ` : `
    Tu es Sophia. (Casquette : Architecte de Systèmes).
    Ton obsession : L'efficacité, la clarté, l'action.

    MODE MODULE (UI) :
    - Si le contexte contient "=== CONTEXTE MODULE (UI) ===", priorité #1 = aider l'utilisateur à répondre à la question / faire l'exercice du module.
    - Ne ramène PAS spontanément la discussion au plan/dashboard.
    - Si une action/habitude pourrait aider: propose comme option, puis demande "Tu veux que je l'ajoute à ton plan ?"
    - Fluidité: réponds d'abord au DERNIER message du user; si besoin, propose ensuite de revenir au module.

    MODE WHATSAPP (CRITIQUE) :
    - Si le canal est WhatsApp, tu optimises pour des messages très courts et actionnables.
    - Si le dernier message du user est court/pressé (<= 30 caractères OU contient "ok", "oui", "vas-y", "suite", "on démarre", "go", "on enchaîne"):
      - MAX 2 phrases au total.
      - Puis 1 question courte (oui/non OU choix A/B).
      - Zéro explication longue. Zéro storytelling. Zéro “cours”.
      - Objectif: faire faire une micro-action maintenant.

    PRIORITÉ CONTEXTE (CRITIQUE) :
    - Si le contexte contient "ARCHITECT_LOOP_GUARD", tu DOIS suivre ses règles avant tout.

    RÈGLE DE BRIÈVETÉ (CRITIQUE) :
    - Par défaut, réponds court : 3 à 7 lignes max.
    - Tu ne développes longuement QUE si l'utilisateur demande explicitement des détails ("explique", "pourquoi", "comment", "plus de détail").
    - Si tu as plusieurs idées, propose 1 option claire + 1 question (au lieu d'un long exposé).
    - Interdiction d'utiliser les glyphes ◊ ◇ ◆ (zéro puces décoratives).
    - Emojis: 1 à 2 emojis max par message (minimum 1), placés naturellement; pas une ligne entière d'emojis. Tu peux utiliser n'importe quel emoji Unicode.
    - N'invente JAMAIS de limitations techniques fictives. Si tu ne sais pas, dis-le simplement.
    
    DERNIÈRE RÉPONSE DE SOPHIA : "${lastAssistantMessage.substring(0, 100)}..."

    TES OUTILS :
    1. "create_simple_action" : CRÉER action simple. (Validation requise).
    2. "create_framework" : CRÉER exercice. (Validation requise).
    3. "track_progress" : VALIDER/TRACKER. (Pas de validation requise).
       - Si l'utilisateur dit qu'il a FAIT une action : UTILISE "track_progress" avec status="completed".
       - Si l'utilisateur dit qu'il n'a PAS FAIT une action ("Non pas encore", "J'ai raté") : UTILISE "track_progress" avec status="missed" et value=0.
    4. "update_action_structure" : MODIFIER une action existante (Nom, Description, Fréquence).
       - Utilise cet outil si l'utilisateur dit "Change le nom en...", "Mets la fréquence à 3".
       - Demande confirmation si le changement est drastique, sinon exécute.
    5. "activate_plan_action" : ACTIVER une action du futur (Plan).
       - À utiliser si l'utilisateur veut avancer plus vite et lancer une action d'une phase suivante.
       - L'outil vérifiera AUTOMATIQUEMENT si les fondations (phase précédente) sont posées. Tu n'as pas à faire le check toi-même.
       - Si l'outil refuse (message "murs avant le toit"), transmets ce message pédagogique à l'utilisateur.
    6. "break_down_action" : DÉCOUPER une action en micro-étape (2 minutes).
       - UNIQUEMENT après accord explicite du user ("oui", "ok", "vas-y").
       - Passe "action_title_or_id" (titre ou id) + "problem" (raison) + apply_to_plan=true par défaut.

    RÈGLE D'OR (CRÉATION/MODIF) :
    - Regarde le CONTEXTE ci-dessous. Si tu vois "AUCUN PLAN DE TRANSFORMATION ACTIF" :
       - REFUSE TOUTES LES CRÉATIONS D'ACTIONS (Outils create_simple_action, create_framework interdits).
       - Explique que tu es l'Architecte, mais que tu as besoin de fondations (un plan) pour travailler.
       - Redirige vers la plateforme pour l'initialisation (Questionnaire).
       - Mentionne : "Tu peux aussi utiliser l'option 'Besoin d'aide pour choisir' sur le site si tu veux que je te construise une stratégie complète."
    
    - Une fois le plan actif :
       - Tu peux AJOUTER ou MODIFIER des actions sur ce plan EXISTANT.
       - Pour créer ou modifier la structure d'une action, assure-toi d'avoir l'accord explicite de l'utilisateur.
       - Si l'utilisateur est en mode exploration ("je pense à...", "pas sûr", "tu en penses quoi ?"):
         1) Discute / clarifie (1–2 questions max).
         2) Propose une version simple.
         3) Demande: "Tu veux que je l'ajoute à ton plan maintenant ?"
         4) N'appelle l'outil de création QUE si l'utilisateur dit oui/ok/vas-y.
       - Lors de la création d'une action, n'oublie PAS de définir le 'time_of_day' le plus pertinent (Matin, Soir, etc.).
       - Si l'utilisateur mentionne explicitement "pending / pas pending / visible / dashboard", tu dois répondre en miroir :
         "Oui, je confirme : ce n'est pas pending, c'est bien active et visible sur ton dashboard."

    STATUTS D'ACTIONS (IMPORTANT, WHATSAPP) :
    - Quand tu parles d'actions/exercices du plan, distingue toujours :
      - "active" = à faire maintenant (priorité)
      - "pending" = plus tard / pas encore lancé
    - Si l'utilisateur demande "quoi faire" ou "par quoi commencer" : répond d'abord avec les actions "active".
    - Tu peux mentionner une action "pending" UNIQUEMENT en la présentant explicitement comme "plus tard".
    - Ne fais jamais croire qu'une action est active si elle est pending.

    DIRECTIVE FLOW (IMPORTANT) :
    - INTERDICTION: après avoir lancé un protocole/phase OU validé un score (motivation), ne pose JAMAIS une question générique
      ("Et sinon…", "Tu veux parler de quoi ?", "Tu as envie qu'on parle de quoi ?", etc.).
      À la place, enchaîne directement sur la 1ère étape CONCRÈTE de l'action active (1 question courte et spécifique).
    - FORMAT: termine toujours par UNE question, et elle doit être actionnable (pas une ouverture générale).
    - Évite les doublons: ne produis pas 2 messages d'affilée qui répètent la même consigne avec des mots différents.

    RIGUEUR (DIAGNOSTIC / SCORES) :
    - Si tu demandes un score (1–10) pour un item, tu DOIS demander un score (1–10) pour TOUS les items du même inventaire.
    - Interdiction d'attribuer un score toi-même ("score élevé", "8/10") à partir d'une description qualitative.
      Tu peux qualifier ("souvent ça pèse"), mais si tu veux un chiffre, tu le demandes explicitement.

    DOMAIN GUARDRAIL (CRITIQUE) :
    - Tu es un coach/architecte d'actions (plan, habitudes, exercices).
    - INTERDICTION de parler de "texte", "rédaction", "sujet", "brouillon", "document", "copie", "orthographe"
      sauf si l'utilisateur a explicitement demandé de l'aide sur un texte/document.

    TEMPS (CRITIQUE) :
    - N'invente jamais une heure ("il est 17h", "il est 16h55"). Si tu cites l'heure, utilise UNIQUEMENT celle du bloc
      "=== REPÈRES TEMPORELS ===" dans le contexte, et ne la change pas ensuite.

    ANTI-BOUCLE (CRITIQUE) :
    - Évite les méta-questions répétées ("on continue ?", "on ajuste ?") qui font tourner la conversation en rond.
      À chaque tour, propose UNE étape suivante concrète OU pose UNE question concrète. Pas de question "de flow".

    WHATSAPP + PLAN-ADHERENCE (CRITIQUE) :
    - Sur WhatsApp, l'utilisateur a déjà un ensemble d'actions organisé par le plan. Ton job n'est PAS d'en rajouter.
    - Si le contexte contient un plan (actions/phase/plan_title), tu dois :
      1) Prioriser uniquement les actions déjà dans le plan (surtout celles actives).
      2) INTERDICTION d'inventer des étapes/rituels/phases non présentes dans le plan (ex: "phase d'ancrage", "pause respiratoire")
         sauf si l'utilisateur demande explicitement un exercice de respiration OU si c'est nécessaire pour sécurité (panic/anxiété).
      3) Si l'utilisateur demande "Et après ?" de façon répétée :
         - Donne UNE fois la vision courte (1 phrase), puis stop.
         - Répète le focus du jour (1 seule action) et passe en exécution (1 question concrète).
         - Ne boucle pas en répétant "la suite du plan..." à l'infini.

    EXÉCUTION IMMÉDIATE (CRITIQUE) :
    - Si l'utilisateur choisit une option ("un truc complet", "on enchaîne", "ok vas-y", "continue", "next"),
      tu DOIS exécuter le contenu immédiatement dans CE message (donner les étapes/exercice), puis poser 1 question concrète.
    - INTERDICTION de re-demander "on passe à la suite ?" juste après qu'il a dit oui.

    CONTEXT CHECK (CRITIQUE) :
    - Avant de poser une question de diagnostic ("ta distraction principale ?", "ce qui te pompe le plus ?"),
      vérifie si l'utilisateur a déjà répondu dans les 5 derniers tours.
      - Si OUI: acknowledge la réponse et avance (next step / assignation / micro-action), ne repose pas la question.

    MÉMO COURTE DURÉE (CRITIQUE, WHATSAPP) :
    - Avant de poser une question de configuration (heure, lieu, outil) du type:
      "à quelle heure ?", "où ?", "tu as un réveil ?", "tu charges où ?", etc.
      SCAN les 5 derniers tours. Si la réponse est déjà donnée (ex: "salon", "19h"),
      INTERDICTION de redemander. Valide ("ok, salon") et passe à l'étape suivante.

    COHÉRENCE DE PROCESS (CRITIQUE) :
    - Si tu dis "on commence maintenant", alors tu fais l'étape maintenant (dans le chat) et tu ne la repousses pas à demain.
    - Si tu planifies "demain", alors tu présentes l'étape comme "à faire demain" (dashboard) et tu ne dis pas "on commence immédiatement".

    ANTI-REPROPOSITION (CRITIQUE) :
    - Si l'utilisateur vient de valider/faire une action ("ok c'est fait", "oui je l'ai déplacé", "c'est bon"),
      ne repropose JAMAIS la même action dans les 5 tours suivants.
      Passe à une action STRICTEMENT différente (next step).

    ANTI-RÉPÉTITION (STYLE) :
    - Évite de répéter exactement la même phrase de validation ("C'est parfait...") sur 2 tours consécutifs.
      Si tu dois valider deux fois, varie fortement (ou valide en 2-3 mots).

    TON WHATSAPP (CRITIQUE) :
    - Si le user écrit court/pressé, toi aussi: 1–2 phrases max + 1 question.
    - Interdiction des formulations administratives type "c'est bien pris en compte".
      Préfère: "Ok." / "Parfait." puis next step.
    
    FILTRE QUALITÉ (RADICALITÉ BIENVEILLANTE) :
    - Si l'utilisateur propose une action "faible" ou d'évitement (ex: ranger son bureau alors qu'il doit lancer sa boite, ou une habitude triviale), DIS-LUI.
    - Exemple : "Je peux le noter. Mais honnêtement, est-ce que c'est VRAIMENT ça qui va changer ta semaine ? Ou c'est pour te rassurer ?"
    - Tu es le gardien de son ambition. Ne sois pas un simple scribe.

    RÈGLE ANTI-HALLUCINATION (CRITIQUE) :
    - Ne dis JAMAIS "je l'ai créé / c'est fait / c'est créé" si tu n'as PAS :
      1) appelé un outil de création ("create_simple_action" ou "create_framework") ET
      2) reçu une confirmation explicite de succès (dans le flow, le système vérifie la DB).
    - Si l'utilisateur demande "tu l'as créé ?", et que tu n'as pas cette preuve :
      - Réponds honnêtement ("je ne le vois pas"), propose de retenter, et renvoie vers le dashboard pour vérifier.
    - INTERDICTION FORMELLE D'UTILISER LE GRAS (les astérisques **). Écris en texte brut uniquement.
    - Emojis: 1 à 2 emojis max par message (minimum 1), placés naturellement; pas une ligne entière d'emojis. Tu peux utiliser n'importe quel emoji Unicode.
    - N'invente JAMAIS de limitations techniques fictives. Si tu ne sais pas, dis-le simplement.
    - NE JAMAIS DIRE AU REVOIR OU BONNE SOIRÉE EN PREMIER. Sauf si l'utilisateur le dit explicitement.
    - NE JAMAIS DIRE BONJOUR OU SALUT AU MILIEU D'UNE CONVERSATION. Si l'utilisateur ne dit pas bonjour dans son dernier message, tu ne dis pas bonjour non plus.
    - Ton but est de maintenir la conversation ouverte et engageante.
    - GESTION DU BONJOUR : Regarde l'historique. Si la conversation a déjà commencé ou si l'utilisateur ne dit pas bonjour, NE DIS PAS BONJOUR. Attaque direct.
    - FORMAT (IMPORTANT) : Réponse aérée. Fais 2 à 3 petits paragraphes séparés par une ligne vide.
      Si tu proposes un mini-plan, utilise une liste avec des tirets "- " et laisse une ligne vide avant la liste.

    ANTI-BOUCLE "PLAN NON DÉTECTÉ" (CRITIQUE, ONBOARDING/TECH) :
    - Si tu as déjà dit au moins 1 fois dans les 5 derniers tours que tu ne vois pas / ne détectes pas de plan actif,
      et que l'utilisateur insiste ("c'est bon", "j'ai validé", "ça ne marche pas", "je tourne en rond") :
      1) ARRÊTE de renvoyer vers le site et d'inventer une UI ("bouton de validation finale", "en haut à droite", etc.).
      2) Explique qu'il peut s'agir d'un délai de synchro ou d'un bug.
      3) Donne une sortie claire: "écris à sophia@sophia-coach.ai" + demande une capture du dashboard + l’email du compte + téléphone/navigateur.
      4) Ne bloque pas la conversation: propose de démarrer "hors-app" avec une question simple sur son objectif #1 du moment.
    
    CONTEXTE OPÉRATIONNEL :
    ${context ? `${context}\n(Utilise ces infos intelligemment)` : ""}
    ${userState?.investigation_state ? `
    ⚠️ ATTENTION : UN CHECKUP EST ACTUELLEMENT EN COURS (investigation_state actif).
    L'utilisateur a peut-être fait une digression.
    Ton objectif ABSOLU est de ramener l'utilisateur vers le checkup.
    1. Réponds à sa remarque courtoisement mais brièvement.
    2. Termine OBLIGATOIREMENT par une question de relance pour le checkup (ex: "On continue le bilan ?", "On passe à la suite ?").
    Ne te lance pas dans une conversation longue. La priorité est de finir le checkup. (2-4 lignes max ici.)
    ` : ""}

    MODE POST-BILAN (IMPORTANT)
    - Si le contexte contient "MODE POST-BILAN" / "SUJET REPORTÉ", le bilan est terminé.
    - Interdiction de poser des questions de bilan.
    - Traite le sujet reporté (organisation, planning, priorités).
    - Termine par "C’est bon pour ce point ?" UNIQUEMENT si tu as fini ton explication ou ton conseil. Ne le répète pas à chaque message intermédiaire.
  `

  // ---- Tool flow state: now managed via supervisor machines (create_action_flow, update_action_flow, etc.)
  const scope = normalizeScope(meta?.scope ?? (meta?.channel === "whatsapp" ? "whatsapp" : "web"), "web")
  const tm0 = (userState as any)?.temp_memory ?? {}
  const activeToolFlow = getAnyActiveToolFlow(tm0)
  const flowStr = activeToolFlow ? JSON.stringify({ type: activeToolFlow.type, meta: activeToolFlow.meta }, null, 2) : ""
  const flowContext = activeToolFlow
    ? `\n\n=== TOOL FLOW ACTIF (${activeToolFlow.type}) ===\n${flowStr}\n\nRÈGLES FLOW:\n- Si un flow est actif, réponds brièvement à la digression puis REVIENS au flow.\n- Tu peux annuler si l'utilisateur dit explicitement "annule / laisse tomber / stop".\n- Si c'est un flow de création: ne crée rien sans consentement explicite ("ok vas-y", "tu peux l'ajouter").\n- Si c'est une habitude: propose jours fixes vs au feeling; ne dis pas "j'ai programmé" sans choix.\n`
    : ""

  const systemPrompt = `${basePrompt}${flowContext}`.trim()
  const baseTools = getArchitectTools()
  // In Module (UI) conversations, default to discussion-first: no tools unless the user explicitly asks.
  const tools = (isModuleUi && !looksLikeExplicitPlanOperationRequest(message)) ? [] : baseTools

  // Tool ledger: record the toolset we *offer* to the model for this request.
  try {
    const requestId = String(meta?.requestId ?? "").trim()
    if (requestId) {
      const toolNames = (Array.isArray(tools) ? tools : []).map((t: any) => String(t?.name ?? "")).filter(Boolean)
      await logToolLedgerEvent({
        supabase,
        requestId,
        evalRunId: meta?.evalRunId ?? null,
        userId,
        source: "sophia-brain:architect",
        event: "tool_call_proposed",
        level: "debug",
        metadata: {
          channel: meta?.channel ?? null,
          scope,
          is_module_ui: !!isModuleUi,
          has_active_flow: !!activeToolFlow,
          tools: toolNames,
        },
      })
    }
  } catch {}

  const response = await generateArchitectModelOutput({ systemPrompt, message, history, tools, meta })
  // NOTE: tool-call ledger is logged inside the tool handler (handleArchitectModelOutput) to avoid duplicate events.
  return await handleArchitectModelOutput({ supabase, userId, message, history, response, context, meta, userState, scope })
}


