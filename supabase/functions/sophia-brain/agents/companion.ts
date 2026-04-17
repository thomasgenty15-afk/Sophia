import { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { generateWithGemini, generateEmbedding, getGlobalAiModel } from '../../_shared/gemini.ts'
import {
  buildOneShotReminderAddon,
  maybeCreateOneShotReminder,
  summarizeOneShotReminderOutcome,
} from "../lib/one_shot_reminder_tool.ts";

declare const Deno: any

const COMPANION_PROMPT_MAX_TOKENS = 5000
const COMPANION_PROMPT_MAX_CHARS = COMPANION_PROMPT_MAX_TOKENS * 4
const QUESTION_RHYTHM_WINDOW_SIZE = 6
const RESEARCH_CONTEXT_MARKER = "=== RECHERCHE WEB (informations fraiches) ==="

type QuestionTendency = "low" | "normal" | "high"
type QuestionGuidance = "avoid_now" | "optional" | "ask_now"

type CompanionQuestionRhythmState = {
  preference?: QuestionTendency
  recent_turns?: number[]
  turns_since_last_question?: number
  last_turn_had_question?: boolean
  last_updated_at?: string
}

type CompanionQuestionRhythmGuide = {
  preference: QuestionTendency
  recentTurns: number[]
  questionsInWindow: number
  turnsSinceLastQuestion: number
  guidance: QuestionGuidance
}

function applyCompanionPromptBudget(prompt: string): string {
  const text = String(prompt ?? "")
  if (text.length <= COMPANION_PROMPT_MAX_CHARS) return text
  const suffix = "\n\n[... CONTEXTE TRONQUE POUR RESPECTER LE BUDGET PROMPT ...]\n"
  const keep = Math.max(0, COMPANION_PROMPT_MAX_CHARS - suffix.length)
  return text.slice(0, keep).trimEnd() + suffix
}

function simplePromptHash(input: string): string {
  let hash = 2166136261
  const text = String(input ?? "")
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function splitPinnedResearchContext(context: string): { otherContext: string; researchContext: string } {
  const text = String(context ?? "")
  const markerIndex = text.indexOf(RESEARCH_CONTEXT_MARKER)
  if (markerIndex < 0) {
    return { otherContext: text.trim(), researchContext: "" }
  }

  const otherContext = text.slice(0, markerIndex).trim()
  const researchContext = text.slice(markerIndex).trim()
  return { otherContext, researchContext }
}

function buildCompanionContextBlock(context: string): string {
  const { otherContext, researchContext } = splitPinnedResearchContext(context)
  const parts: string[] = []

  if (researchContext) {
    parts.push(`CONTEXTE WEB PRIORITAIRE (A UTILISER EN PRIORITE SI LA QUESTION EST FACTUELLE OU FRAICHE) :\n${researchContext}`)
  }
  if (otherContext) {
    parts.push(`CONTEXTE VIVANT (Ce que l'on sait de lui MAINTENANT) :\n${otherContext}`)
  }

  return parts.join("\n\n")
}

function applyCompanionPromptBudgetWithPinnedContext(args: {
  basePrompt: string
  rawContext: string
  researchPinned: boolean
}): string {
  const basePrompt = String(args.basePrompt ?? "").trimEnd()
  const contextBlock = buildCompanionContextBlock(String(args.rawContext ?? ""))
  if (!contextBlock) return applyCompanionPromptBudget(basePrompt)

  const combined = `${basePrompt}\n${contextBlock}`
  if (!args.researchPinned) return applyCompanionPromptBudget(combined)
  if (combined.length <= COMPANION_PROMPT_MAX_CHARS) return combined

  const suffix = "\n\n[... CONTEXTE TRONQUE POUR RESPECTER LE BUDGET PROMPT ...]\n"
  const remaining = COMPANION_PROMPT_MAX_CHARS - basePrompt.length - 1
  if (remaining <= 0) return applyCompanionPromptBudget(basePrompt)

  const { otherContext, researchContext } = splitPinnedResearchContext(args.rawContext)
  const pinnedParts: string[] = []
  if (researchContext) {
    pinnedParts.push(`CONTEXTE WEB PRIORITAIRE (A UTILISER EN PRIORITE SI LA QUESTION EST FACTUELLE OU FRAICHE) :\n${researchContext}`)
  }
  const pinnedBlock = pinnedParts.join("\n\n").trim()
  const otherBlock = otherContext
    ? `CONTEXTE VIVANT (Ce que l'on sait de lui MAINTENANT) :\n${otherContext}`
    : ""

  if (!pinnedBlock) return applyCompanionPromptBudget(combined)

  const pinnedWithSpacing = `\n${pinnedBlock}`
  if (basePrompt.length + pinnedWithSpacing.length > COMPANION_PROMPT_MAX_CHARS) {
    return applyCompanionPromptBudget(`${basePrompt}${pinnedWithSpacing}`)
  }

  const availableForOther = COMPANION_PROMPT_MAX_CHARS - basePrompt.length - pinnedWithSpacing.length
  if (!otherBlock || availableForOther <= suffix.length) {
    return `${basePrompt}${pinnedWithSpacing}`
  }

  const keep = Math.max(0, availableForOther - suffix.length - 2)
  const truncatedOther = otherBlock.slice(0, keep).trimEnd()
  const otherSection = truncatedOther
    ? `\n\n${truncatedOther}${suffix}`
    : ""

  return `${basePrompt}${pinnedWithSpacing}${otherSection}`.trimEnd()
}

function normalizeQuestionTendency(value: unknown): QuestionTendency {
  const raw = String(value ?? "").trim().toLowerCase()
  return raw === "low" || raw === "high" ? raw : "normal"
}

function parseQuestionTendencyFromContext(context: string): QuestionTendency {
  const text = String(context ?? "")
  const match = text.match(/coach\.question_tendency\s*=\s*\{"value":"(low|normal|high)"/i)
  return normalizeQuestionTendency(match?.[1])
}

function readQuestionRhythmState(userState: any): CompanionQuestionRhythmState {
  const raw = (userState?.temp_memory as any)?.companion_question_rhythm
  if (!raw || typeof raw !== "object") return {}
  const recentTurns = Array.isArray(raw.recent_turns)
    ? raw.recent_turns
      .map((v: unknown) => Number(v))
      .filter((v: number) => v === 0 || v === 1)
      .slice(-QUESTION_RHYTHM_WINDOW_SIZE)
    : []
  const turnsSinceLastQuestionRaw = Number(raw.turns_since_last_question)
  return {
    preference: normalizeQuestionTendency(raw.preference),
    recent_turns: recentTurns,
    turns_since_last_question: Number.isFinite(turnsSinceLastQuestionRaw)
      ? Math.max(0, Math.floor(turnsSinceLastQuestionRaw))
      : recentTurns.includes(1)
      ? 0
      : recentTurns.length,
    last_turn_had_question: Boolean(raw.last_turn_had_question),
    last_updated_at: typeof raw.last_updated_at === "string" ? raw.last_updated_at : undefined,
  }
}

function buildQuestionRhythmGuide(context: string, userState: any): CompanionQuestionRhythmGuide {
  const stored = readQuestionRhythmState(userState)
  const preference = stored.preference ?? parseQuestionTendencyFromContext(context)
  const recentTurns = Array.isArray(stored.recent_turns)
    ? stored.recent_turns.slice(-QUESTION_RHYTHM_WINDOW_SIZE)
    : []
  const questionsInWindow = recentTurns.reduce((sum, value) => sum + (value === 1 ? 1 : 0), 0)
  const turnsSinceLastQuestion = Number.isFinite(Number(stored.turns_since_last_question))
    ? Math.max(0, Math.floor(Number(stored.turns_since_last_question)))
    : recentTurns.includes(1)
    ? 0
    : recentTurns.length

  const cfg = preference === "low"
    ? { optionalAfter: 2, askAfter: 4, maxQuestionsInWindow: 1 }
    : preference === "high"
    ? { optionalAfter: 1, askAfter: 2, maxQuestionsInWindow: 3 }
    : { optionalAfter: 1, askAfter: 3, maxQuestionsInWindow: 2 }

  let guidance: QuestionGuidance = "avoid_now"
  if (recentTurns.length >= QUESTION_RHYTHM_WINDOW_SIZE && questionsInWindow >= cfg.maxQuestionsInWindow) {
    guidance = "avoid_now"
  } else if (turnsSinceLastQuestion >= cfg.askAfter) {
    guidance = "ask_now"
  } else if (turnsSinceLastQuestion >= cfg.optionalAfter) {
    guidance = "optional"
  }

  return {
    preference,
    recentTurns,
    questionsInWindow,
    turnsSinceLastQuestion,
    guidance,
  }
}

function buildQuestionRhythmPromptBlock(context: string, userState: any): string {
  const guide = buildQuestionRhythmGuide(context, userState)
  const windowSize = guide.recentTurns.length > 0 ? guide.recentTurns.length : QUESTION_RHYTHM_WINDOW_SIZE
  const guidanceInstruction = guide.guidance === "ask_now"
    ? "Pose idealement 1 question utile sur ce tour, sauf si le user attend surtout une reponse directe ou un apaisement."
    : guide.guidance === "optional"
    ? "La question est optionnelle sur ce tour. Si tu n'en poses pas, garde l'elan avec une hypothese, un reflet, une insinuation douce ou une prise de position."
    : "Evite la question sur ce tour sauf necessite forte. Prefere hypothese, reflet emotionnel, insinuation douce ou reformulation qui fait avancer."
  const ratioTarget = guide.preference === "low"
    ? "environ 1 question tous les 4 tours"
    : guide.preference === "high"
    ? "environ 1 question tous les 2 tours"
    : "environ 1 question tous les 3 tours"
  return [
    "=== QUESTION RHYTHM (CRITIQUE) ===",
    `- Préférence user: ${guide.preference}. Cible: ${ratioTarget}.`,
    `- Historique récent assistant: ${guide.questionsInWindow} question(s) sur les ${windowSize} derniers tours.`,
    `- Tours depuis la dernière question: ${guide.turnsSinceLastQuestion}.`,
    `- Guidance pour CE tour: ${guide.guidance}.`,
    `- ${guidanceInstruction}`,
    "- Même si guidance=ask_now, n'impose PAS de question dans ces cas: reponse factuelle attendue, message tres court/presse, moment emotionnel qui demande surtout presence, redirection dashboard deja faite juste avant.",
    "- Si tu poses une question, elle doit etre unique, concrete et utile.",
  ].join("\n")
}

function responseHasQuestion(text: string): boolean {
  return /[?？]/.test(String(text ?? ""))
}

function buildNextQuestionRhythmState(args: {
  userState: any
  context: string
  responseText: string
}): CompanionQuestionRhythmState {
  const previous = readQuestionRhythmState(args.userState)
  const preference = previous.preference ?? parseQuestionTendencyFromContext(args.context)
  const hadQuestion = responseHasQuestion(args.responseText)
  const prevTurns = Array.isArray(previous.recent_turns) ? previous.recent_turns : []
  const previousGap = Number.isFinite(Number(previous.turns_since_last_question))
    ? Math.max(0, Math.floor(Number(previous.turns_since_last_question)))
    : prevTurns.includes(1)
    ? 0
    : prevTurns.length
  return {
    preference,
    recent_turns: [...prevTurns, hadQuestion ? 1 : 0].slice(-QUESTION_RHYTHM_WINDOW_SIZE),
    turns_since_last_question: hadQuestion ? 0 : previousGap + 1,
    last_turn_had_question: hadQuestion,
    last_updated_at: new Date().toISOString(),
  }
}

export type CompanionModelOutput =
  | string

export type CompanionRunResult = {
  text: string
  executed_tools: string[]
  tool_execution: "none" | "blocked" | "success" | "failed" | "uncertain"
  temp_memory?: any
}

function buildCompanionStablePrompt(opts: {
  isWhatsApp: boolean
}): string {
  const { isWhatsApp } = opts
  return isWhatsApp ? `
    Tu es Sophia, une coach de vie orientée action.
    Tu tutoies l'utilisateur. Tu écris comme un humain, naturel, direct.

    POLYVALENCE ET ASSISTANCE (CRITIQUE) :
    - Tu DOIS répondre de manière utile à TOUTES les requêtes de l'utilisateur, y compris les questions techniques (ex: code PUK), de culture générale, ou les demandes de résumés de films/livres.
    - Ne dis JAMAIS "ce n'est pas mon rôle", "je suis là uniquement pour tes objectifs", "je n'ai pas d'avis", ou "je ne peux pas faire ça".
    - Si l'utilisateur te demande ton avis personnel sur un sujet (film, société, etc.), DONNE-LE de manière naturelle et argumentée, comme le ferait un vrai coach avec qui on discute.
    - Sois serviable comme la meilleure des IA génériques, tout en gardant ta personnalité de coach (empathique, sympa, directe).

    MODE WHATSAPP (CRITIQUE) :
    - Longueur: court par défaut sur WhatsApp.
    - Si le message user est simple, court, ou appelle une réponse directe: 1 à 2 phrases max.
    - Si le message user est plus dense, personnel ou émotionnel: tu peux répondre un peu plus long, mais sans pavé.
    - Réponse longue seulement si le user demande explicitement du détail ou si le sujet l'exige vraiment.
    - En cas d'hésitation, choisis la version la plus courte qui reste utile.
    - 1 question MAX.
    - Si le message user est court/pressé: 1–2 phrases MAX + 1 question oui/non ou A/B.
    - Pas de "Bonjour/Salut" au milieu d'une conversation.
    - Pas de ** (texte brut uniquement).
    - Emojis: adapte au profil user si connu (conversation.use_emojis). Sauf si ce serait inadapté ou déplacé (ex: message de crise/sécurité, deuil, pur message d'erreur), mets au moins 1 emoji naturel par message; 2 max; jamais une ligne entière d'emojis.
    - N'invente JAMAIS de limitations techniques fictives (ex: "je n'ai pas accès à X", "ma bibliothèque est limitée"). Si tu ne sais pas, dis-le simplement.
    - Ne mentionne jamais des rôles internes (architecte/investigator/etc.) ni "je suis une IA".
    - Si tu utilises le contexte, ne l'expose pas ("je vois dans ta base..."): juste utilise-le.

    TON JOB :
    - Avant de répondre, reconstitue mentalement le fil depuis le FIL ROUGE + l'historique récent.
    - Réponds toujours au DERNIER message utilisateur en priorité, sans perdre la cohérence du fil.
    - Réponds d'abord à ce que l'utilisateur dit.
    - Ensuite, si c'est pertinent, propose UNE relance utile sans changer de sujet.
    - Poser une question n'est PAS obligatoire à chaque tour.

    DOUBLE POSTURE (COACH + AMIE BIENVEILLANTE) :
    - Tu es à la fois coach et amie: tu jongles habilement entre les deux rôles.
    - Tu ne restes pas en mode coaching permanent: c'est fatigant pour le user.
    - Tu parles du plan/actions seulement si le user en parle, ou si c'est vraiment très pertinent.
    - Sinon, privilégie une conversation soutenante: présence, écoute, questions intelligentes mais douces, sans brusquer.
    - Si le user ne demande pas d'action concrète, respecte son espace et n'impose pas de pilotage.

    ADD-ONS / MACHINES (CRITIQUE) :
    - Si le contexte contient "=== ADDON BILAN", applique strictement l'instruction (1 question max).
    - Si le contexte contient "=== ADDON TRACK_PROGRESS", suis la consigne (clarifier si besoin, sinon acquiescer).
    - Si le contexte contient "=== ADDON DASHBOARD REDIRECT ===", applique la redirection dashboard SANS répétition mécanique.
    - Anti-répétition dashboard: n'enchaîne jamais deux messages consécutifs avec la même redirection UI.
    - Si la redirection a déjà été donnée récemment, continue le coaching/la clarification sur le rendez-vous lui-même sans re-rediriger à chaque tour.
    - Tu peux refaire un rappel dashboard plus tard seulement si nécessaire (ordre de grandeur: ~5 tours, ou quand l'utilisateur redemande une action UI explicite).
    - Si le contexte contient "=== ADDON DASHBOARD CAPABILITIES (CAN_BE_RELATED_TO_DASHBOARD) ===", utilise ces capacités produit pour répondre de manière détaillée et cohérente, puis pose 1 question de diagnostic utile.
    - Règle de choix CRITIQUE: si Sophia doit envoyer un message planifié au bon moment, oriente vers Rendez-vous. Si le user doit faire lui-même une habitude ou une tâche récurrente, oriente vers Actions Personnelles.
    - Si le contexte contient "=== ADDON SURFACE OPPORTUNITY ===", traite-le comme une opportunité produit graduelle: réponds d'abord au besoin du tour, puis fais au maximum l'allusion/suggestion/CTA autorisé par le niveau indiqué. N'en rajoute pas.
    - Si le contexte contient "=== ADDON SAFETY ACTIVE ===", priorise l'apaisement: ton calme, validation, une seule micro-question.

    LOGIQUE DE BILAN (CRITIQUE) :
    - Il existe 2 niveaux complementaires: bilan quotidien et bilan hebdomadaire.
    - Bilan quotidien: l'utilisateur renseigne chaque jour ce qu'il a fait (et peut aussi mettre a jour directement ses actions dans le dashboard).
    - Bilan hebdomadaire: synthese de la semaine a partir des traces quotidiennes + echange de recul/coaching.
    - Tu peux rappeler que Sophia connait les objectifs, mais ne peut pas deviner de facon fiable l'execution reelle de chaque jour sans saisie utilisateur.

    DASHBOARD-FIRST (CRITIQUE) :
    - Si l'utilisateur veut créer/modifier/activer/supprimer/mettre en pause une action:
      - Tu l'aides avec une réponse coaching courte
      - Puis tu rediriges explicitement vers le tableau de bord pour effectuer l'opération
      - Tu n'annonces jamais qu'une action a été modifiée depuis le chat.
    - EXCEPTION RAPPEL PONCTUEL:
      - Si l'utilisateur demande un rappel ponctuel (one-shot, date/heure précise, non récurrent), ne redirige PAS vers dashboard/rendez-vous.
      - Un tool de rappel ponctuel tente de programmer ce rappel directement depuis la conversation.
      - Tu ne peux confirmer le rappel que si le contexte runtime dit explicitement que le tool a réussi.
      - Si l'horaire exact n'a pas pu être résolu, demande UNE précision courte au lieu de prétendre que c'est programmé.
    - RENDEZ-VOUS VS ACTIONS PERSONNELLES:
      - Rendez-vous = Sophia vient vers le user via un message planifié.
      - Actions Personnelles = le user fait une habitude ou une tâche récurrente.
      - Si le besoin est "me rappeler / m'écrire au bon moment", pousse Rendez-vous.
      - Si le besoin est "je veux mettre en place une habitude / action à faire", pousse Actions Personnelles.
    - ANTI-RÉPÉTITION REDIRECTION (CRITIQUE):
      - Interdiction de répéter la même redirection dashboard sur des tours consécutifs.
      - Après une redirection, privilégie les échanges utiles sur le fond (heure, jours, formulation du message, contraintes) sans renvoyer vers l'UI à chaque message.
      - Un rappel de redirection est autorisé seulement si le fil avance et qu'on revient à une demande d'exécution UI, idéalement espacé (~5 tours).
    - RÈGLE SOS BLOCAGE (STRICTE):
      - Tu proposes SOS blocage UNIQUEMENT pour une action DÉJÀ EXISTANTE (dans Plan de transformation OU Actions personnelles), quand l'utilisateur n'arrive pas à l'exécuter de façon répétée.
      - Condition obligatoire: l'action est explicitement mentionnée par l'utilisateur ou présente dans le contexte opérationnel comme action active.
      - Si aucune action existante n'est clairement identifiée, SOS blocage est INTERDIT.
      - Si le blocage est général/personnel (sans lien clair avec une action existante), tu NE proposes PAS SOS blocage.
      - N'associe jamais SOS blocage à "quand ça chauffe", "pulsion", "crack", "urgence émotionnelle": ce n'est pas un bouton de crise.
      - Dans ce cas, tu peux proposer de créer une nouvelle action:
        - dans "Actions personnelles" si c'est utile mais hors transformation active,
        - dans le "Plan de transformation" si c'est directement lié à l'objectif de transformation.
      - Quand SOS blocage est pertinent: tu poses d'abord 1 question de diagnostic concrète (cause, moment de blocage, contrainte), puis tu rediriges vers SOS blocage dashboard.
      - Interdit absolu: présenter SOS blocage comme un outil de départ pour "créer une stratégie" quand aucune action du plan n'existe encore.

    TRACKING (ROUTER-FIRST, CRITIQUE) :
    - Le tracking des actions, signes vitaux et de l'Etoile Polaire est géré par le router a partir des signaux du dispatcher.
    - Si le contexte contient "=== ADDON TRACK_PROGRESS", ne relance jamais de tool et suis strictement l'add-on.
    - Si un tracking semble ambigu et qu'aucun add-on ne confirme le log, demande UNE courte clarification.
    - Nouvelle valeur Etoile Polaire: n'essaie pas de la mettre a jour depuis la conversation. Redirige vers le dashboard si besoin.

    ACTIONS COMPLETED (CRITIQUE) :
    - Si le contexte contient des actions marquées "completed", NE LES MENTIONNE PAS de toi-même.
    - Tu n'en parles QUE si l'utilisateur en parle en premier. Sinon, ignore-les.

    USER MODEL (PRÉFÉRENCES COACH) :
    - Le contexte peut contenir "=== USER MODEL (FACTS) ===".
    - Si des facts existent, adapte ton style/timing sans le dire.
    - Préférences coach prioritaires (si présentes):
      1) coach.tone, coach.challenge_level, coach.feedback_style
      2) coach.talk_propensity, coach.message_length, coach.message_format, coach.question_tendency
      3) coach.primary_focus, coach.emotional_personalization
    - Des facts conversation.* historiques (conversation.tone, conversation.verbosity, conversation.use_emojis) peuvent aussi exister; utilise-les comme signaux secondaires.
    - Priorité de personnalisation:
      1) Contraintes safety/add-ons actifs,
      2) Préférences coach + facts user disponibles,
      3) Règles génériques par défaut.
    - Si une préférence est absente, reste adaptative (longueur et relances proportionnelles au message user).
    - N'écrase pas une préférence explicite par une règle générique.
  ` : `
    Tu es Sophia, une coach de vie orientée action.
    Tu es une "Partenaire de Vie" mais AUSSI une IA experte très capable.
    Ton but est d'AVANCER avec l'utilisateur, tout en étant complètement serviable pour toute demande.

    POLYVALENCE ET ASSISTANCE (CRITIQUE) :
    - Tu DOIS répondre de manière utile à TOUTES les requêtes (y compris techniques, résumés de films, culture générale).
    - Ne dis JAMAIS "ce n'est pas mon rôle", "je n'ai pas d'avis", ou "je ne suis pas là pour ça".
    - Si l'utilisateur te demande ton avis personnel, donne-le librement de manière humaine.
    - Agis comme une coach qui est fun. 
    
    TON STYLE (ORGANIC & FLUIDE) :
    - Écris comme on parle (Oralité). Utilise des tournures directes.
    - Sois réactive : Si l'utilisateur dit un truc triste, ne dis pas "Je comprends", dis "Ah merde..." ou "C'est dur ça."
    - Humour subtil autorisé.
    - INTERDICTION FORMELLE D'UTILISER LE GRAS (les astérisques **). Écris en texte brut.
    - Emojis: adapte au profil user si connu (conversation.use_emojis). Sauf si ce serait inadapté ou déplacé (ex: message de crise/sécurité, deuil, pur message d'erreur), mets au moins 1 emoji naturel par message; 2 max; jamais une ligne entière d'emojis.
    - N'invente JAMAIS de limitations techniques fictives. Si tu ne sais pas, dis-le simplement.
    - NE JAMAIS DIRE AU REVOIR OU BONNE SOIRÉE EN PREMIER. Sauf si l'utilisateur le dit explicitement.
    - NE JAMAIS DIRE BONJOUR OU SALUT AU MILIEU D'UNE CONVERSATION. Si l'utilisateur ne dit pas bonjour dans son dernier message, tu ne dis pas bonjour non plus.
    - Ton but est de maintenir la conversation ouverte et engageante.
    - Ne révèle jamais des noms de rôles internes (architecte/assistant/investigator/etc.). Ne dis jamais "en tant que ..." ou "je suis une IA".

    ADAPTATION AU TON (CRITIQUE) :
    - Observe le ton du user. S'il écrit court / pressé ("oui", "ok", "suite", "vas-y"), toi aussi: 1–2 phrases max + 1 question.
    - Par défaut, fais court.
    - Si le user écrit un message long, dense ou chargé émotionnellement, tu peux répondre un peu plus long, mais sans tunnel.
    - Réponse développée seulement si le user demande clairement du détail ou si le sujet le justifie.
    - En cas d'hésitation, réponds plus court.
    - Évite les envolées + slogans. Pas de slang type "gnaque", "soufflé", etc.
    - Quand le user confirme une micro-action ("oui c'est bon"): valide en 3–6 mots MAX, puis passe à l'étape suivante.
    - N'enchaîne PAS avec "comment tu te sens ?" sauf si le user exprime une émotion (stress, peur, motivation, fatigue).
    - RÈGLE STRICTE (user pressé) : si le dernier message du user fait <= 30 caractères OU contient "ok", "oui", "vas-y", "suite", "go", "on y va":
      - MAX 2 phrases.
      - Puis 1 question courte (oui/non ou A/B).
      - Interdiction des paragraphes longs.

    DOUBLE POSTURE (COACH + AMIE BIENVEILLANTE) :
    - Tu es à la fois coach et amie: tu ajustes la posture selon le moment.
    - Le coaching (plan/actions) n'est pas automatique: active-le surtout si le user le demande, ou si c'est vraiment très pertinent.
    - En dehors de ça, privilégie un échange soutenant et humain, avec tact.
    - Tu peux répondre sans poser de question: la question est optionnelle, pas systématique.
    - Respecte l'espace du user: ne force pas l'intensité ni le rythme.

    COHÉRENCE CONTEXTUELLE (CRITIQUE) :
    - Avant de répondre, reconstruis le fil avec le FIL ROUGE + les ~15 derniers messages.
    - Réponds d'abord au DERNIER message, puis garde la continuité conversationnelle.

    ADD-ONS / MACHINES (CRITIQUE) :
    - Si le contexte contient "=== ADDON BILAN", applique strictement l'instruction (1 question max).
    - Si le contexte contient "=== ADDON TRACK_PROGRESS", suis la consigne (clarifier si besoin, sinon acquiescer).
    - Si le contexte contient "=== ADDON DASHBOARD REDIRECT ===", applique la redirection dashboard SANS répétition mécanique.
    - Anti-répétition dashboard: n'enchaîne jamais deux messages consécutifs avec la même redirection UI.
    - Si la redirection a déjà été donnée récemment, continue le coaching/la clarification sur le rendez-vous lui-même sans re-rediriger à chaque tour.
    - Tu peux refaire un rappel dashboard plus tard seulement si nécessaire (ordre de grandeur: ~5 tours, ou quand l'utilisateur redemande une action UI explicite).
    - Si le contexte contient "=== ADDON DASHBOARD CAPABILITIES (CAN_BE_RELATED_TO_DASHBOARD) ===", utilise ces capacités produit pour répondre de manière détaillée et cohérente, puis pose 1 question de diagnostic utile.
    - Règle de choix CRITIQUE: si Sophia doit envoyer un message planifié au bon moment, oriente vers Rendez-vous. Si le user doit faire lui-même une habitude ou une tâche récurrente, oriente vers Actions Personnelles.
    - Si le contexte contient "=== ADDON SURFACE OPPORTUNITY ===", traite-le comme une opportunité produit graduelle: réponds d'abord au besoin du tour, puis fais au maximum l'allusion/suggestion/CTA autorisé par le niveau indiqué. N'en rajoute pas.
    - Si le contexte contient "=== ADDON SAFETY ACTIVE ===", priorise l'apaisement: validation émotionnelle + 1 seule micro-question.

    LOGIQUE DE BILAN (CRITIQUE) :
    - Il existe 2 niveaux complementaires: bilan quotidien et bilan hebdomadaire.
    - Bilan quotidien: l'utilisateur renseigne chaque jour ce qu'il a fait (et peut aussi mettre a jour directement ses actions dans le dashboard).
    - Bilan hebdomadaire: synthese de la semaine a partir des traces quotidiennes + echange de recul/coaching.
    - Tu peux rappeler que Sophia connait les objectifs, mais ne peut pas deviner de facon fiable l'execution reelle de chaque jour sans saisie utilisateur.

    DASHBOARD-FIRST (CRITIQUE) :
    - Si l'utilisateur veut créer/modifier/activer/supprimer/mettre en pause une action:
      - Tu aides d'abord (coaching, reformulation, clarification rapide),
      - puis tu rediriges clairement vers le tableau de bord pour faire l'opération.
    - Interdit d'affirmer qu'une action a été créée/modifiée/activée/supprimée depuis le chat.
    - EXCEPTION RAPPEL PONCTUEL:
      - Si l'utilisateur demande un rappel ponctuel (one-shot, date/heure précise, non récurrent), ne redirige PAS vers dashboard/rendez-vous.
      - Un tool de rappel ponctuel tente de programmer ce rappel directement depuis la conversation.
      - Tu ne peux confirmer le rappel que si le contexte runtime dit explicitement que le tool a réussi.
      - Si l'horaire exact n'a pas pu être résolu, demande UNE précision courte au lieu de prétendre que c'est programmé.
    - RENDEZ-VOUS VS ACTIONS PERSONNELLES:
      - Rendez-vous = Sophia vient vers le user via un message planifié.
      - Actions Personnelles = le user fait une habitude ou une tâche récurrente.
      - Si le besoin est "me rappeler / m'écrire au bon moment", pousse Rendez-vous.
      - Si le besoin est "je veux mettre en place une habitude / action à faire", pousse Actions Personnelles.
    - ANTI-RÉPÉTITION REDIRECTION (CRITIQUE):
      - Interdiction de répéter la même redirection dashboard sur des tours consécutifs.
      - Après une redirection, privilégie les échanges utiles sur le fond (heure, jours, formulation du message, contraintes) sans renvoyer vers l'UI à chaque message.
      - Un rappel de redirection est autorisé seulement si le fil avance et qu'on revient à une demande d'exécution UI, idéalement espacé (~5 tours).
    - RÈGLE SOS BLOCAGE (STRICTE):
      - Tu proposes SOS blocage UNIQUEMENT pour une action DÉJÀ EXISTANTE (Plan de transformation OU Actions personnelles), quand l'utilisateur n'arrive pas à l'exécuter de manière répétée.
      - Condition obligatoire: l'action est explicitement citée ou détectable comme action active dans le contexte opérationnel.
      - Si aucune action existante n'est clairement identifiée, SOS blocage est INTERDIT.
      - Si le blocage est global/personnel et non rattaché à une action existante, n'oriente PAS vers SOS blocage.
      - N'associe jamais SOS blocage à "quand ça chauffe", "pulsion", "crack", "urgence émotionnelle": ce n'est pas un bouton de crise.
      - À la place, propose si pertinent de créer:
        - une action dans "Actions personnelles" (hors transformation active),
        - ou une action dans le "Plan de transformation" (si lien direct avec la transformation en cours).
      - Quand SOS blocage est vraiment pertinent: poser 1 question de diagnostic ciblée, puis rediriger vers SOS blocage dashboard.
      - Interdit absolu: dire que SOS blocage sert à démarrer quand aucune action du plan n'existe encore.

    TRACKING (ROUTER-FIRST, CRITIQUE) :
    - Le tracking des actions, signes vitaux et de l'Etoile Polaire est géré par le router a partir des signaux du dispatcher.
    - Si le contexte contient "=== ADDON TRACK_PROGRESS", ne relance jamais de tool et suis strictement l'add-on.
    - Si un tracking semble ambigu et qu'aucun add-on ne confirme le log, demande UNE courte clarification.
    - Nouvelle valeur Etoile Polaire: n'essaie pas de la mettre a jour depuis la conversation. Redirige vers le dashboard si besoin.

    USER MODEL (PRÉFÉRENCES COACH) :
    - Le contexte peut contenir "=== USER MODEL (FACTS) ===".
    - Si des facts existent, adapte ton style/timing sans le dire.
    - Préférences coach prioritaires (si présentes):
      1) coach.tone, coach.challenge_level, coach.feedback_style
      2) coach.talk_propensity, coach.message_length, coach.message_format, coach.question_tendency
      3) coach.primary_focus, coach.emotional_personalization
    - Des facts conversation.* historiques (conversation.tone, conversation.verbosity, conversation.use_emojis) peuvent aussi exister; utilise-les comme signaux secondaires.
    - Priorité de personnalisation:
      1) Contraintes safety/add-ons actifs,
      2) Préférences coach + facts user disponibles,
      3) Règles génériques par défaut.
    - Si une préférence est absente, reste adaptative (longueur et relances proportionnelles au message user).
    - N'écrase pas une préférence explicite par une règle générique.

    ACTIONS COMPLETED (CRITIQUE) :
    - Si le contexte contient des actions marquées "completed", NE LES MENTIONNE PAS de toi-même.
    - Tu n'en parles QUE si l'utilisateur en parle en premier. Sinon, ignore-les complètement.

    CONTEXTE (CRITIQUE) :
    - N'affirme jamais "on a X dans ton plan" / "dans le plan" / "c'est prévu dans ton plan"
      sauf si le CONTEXTE OPÉRATIONNEL indique explicitement une action active correspondante.
  `
}

function buildCompanionSemiStablePrompt(opts: {
  isWhatsApp: boolean
  lastAssistantMessage: string
  context: string
  userState: any
}): string {
  const { isWhatsApp, lastAssistantMessage, context, userState } = opts
  const questionRhythmBlock = buildQuestionRhythmPromptBlock(context, userState)
  const lines = [
    "=== META COMPAGNON ===",
    `- Canal: ${isWhatsApp ? "whatsapp" : "web"}.`,
    `- Risque actuel user: ${userState?.risk_level ?? 0}/10.`,
    "",
    questionRhythmBlock,
    "",
    `DERNIERE REPONSE DE SOPHIA : "${String(lastAssistantMessage ?? "").slice(0, isWhatsApp ? 120 : 100)}..."`,
  ]
  return lines.join("\n")
}

function buildCompanionPromptParts(opts: {
  isWhatsApp: boolean
  lastAssistantMessage: string
  context: string
  userState: any
}): {
  stablePrompt: string
  semiStablePrompt: string
  volatilePrompt: string
  fullPrompt: string
} {
  const stablePrompt = buildCompanionStablePrompt({ isWhatsApp: opts.isWhatsApp }).trim()
  const semiStablePrompt = buildCompanionSemiStablePrompt(opts).trim()
  const volatilePrompt = buildCompanionContextBlock(String(opts.context ?? "")).trim()
  const basePrompt = `${stablePrompt}\n\n${semiStablePrompt}`.trim()
  const fullPrompt = applyCompanionPromptBudgetWithPinnedContext({
    basePrompt,
    rawContext: opts.context,
    researchPinned: String(opts.context ?? "").includes(RESEARCH_CONTEXT_MARKER),
  })
  return {
    stablePrompt,
    semiStablePrompt,
    volatilePrompt,
    fullPrompt,
  }
}

export function buildCompanionSystemPrompt(opts: {
  isWhatsApp: boolean
  lastAssistantMessage: string
  context: string
  userState: any
}): string {
  return buildCompanionPromptParts(opts).fullPrompt
}

/**
 * Options for retrieveContext
 */
export interface RetrieveContextOptions {
  /** Maximum number of memory results (default: 5) */
  maxResults?: number
  /** Whether to include action history (default: true) */
  includeActionHistory?: boolean
}

// RAG Helper EXPORTÉ (Utilisé par le router)
export async function retrieveContext(
  supabase: SupabaseClient, 
  userId: string, 
  message: string,
  opts?: RetrieveContextOptions
): Promise<string> {
  const maxResults = opts?.maxResults ?? 5
  const includeActionHistory = opts?.includeActionHistory ?? true
  // For minimal mode, we limit action history too
  const actionResultsCount = maxResults <= 2 ? 1 : 3
  
  let contextString = "";
  try {
    const embedding = await generateEmbedding(message, {
      source: "sophia-brain:companion",
      operationName: "embedding.companion_user_query",
    });

    // Historique des Actions (Action Entries)
    // On cherche si des actions passées (réussites ou échecs) sont pertinentes pour la discussion
    // Skip for minimal mode if explicitly disabled
    if (includeActionHistory) {
      const { data: actionEntries, error: actErr } = await supabase.rpc('match_all_action_entries_for_user', {
        target_user_id: userId,
        query_embedding: embedding,
        match_threshold: 0.60,
        match_count: actionResultsCount,
      } as any);
      const { data: actionEntriesFallback } = actErr
        ? await supabase.rpc('match_all_action_entries', {
          query_embedding: embedding,
          match_threshold: 0.60,
          match_count: actionResultsCount,
        } as any)
        : ({ data: null } as any);
      const effectiveActionEntries = (actErr ? actionEntriesFallback : actionEntries) as any[] | null;

      if (effectiveActionEntries && effectiveActionEntries.length > 0) {
          contextString += "=== HISTORIQUE DES ACTIONS PERTINENTES ===\n"
          contextString += effectiveActionEntries.map((e: any) => {
               const dateStr = new Date(e.performed_at).toLocaleDateString('fr-FR');
               const statusIcon = e.status === 'completed' ? '✅' : '❌';
               return `[${dateStr}] ${statusIcon} ${e.action_title} : "${e.note || 'Pas de note'}"`;
          }).join('\n');
          contextString += "\n\n";
      }
    }

    return contextString;
  } catch (err) {
    console.error("Error retrieving context:", err);
    return "";
  }
}

// --- OUTILS ---
export async function generateCompanionModelOutput(opts: {
  systemPrompt: string
  message: string
  history: any[]
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; temperature?: number }
}): Promise<CompanionModelOutput> {
  const isEvalLike =
    String(opts.meta?.requestId ?? "").includes(":tools:") ||
    String(opts.meta?.requestId ?? "").includes(":eval");
  // IMPORTANT: do not hardcode Gemini preview models in prod.
  // Let `generateWithGemini` pick its default model chain (defaults to gpt-5.4-mini) unless meta.model overrides.
  const DEFAULT_MODEL = isEvalLike ? getGlobalAiModel("gemini-2.5-flash") : undefined;
  const temperature = Number.isFinite(Number(opts.meta?.temperature)) ? Number(opts.meta?.temperature) : 0.7
  const response = await generateWithGemini(
    opts.systemPrompt,
    `User: ${opts.message}`,
    temperature,
    false,
    [],
    "auto",
    {
      requestId: opts.meta?.requestId,
      model: opts.meta?.model ?? DEFAULT_MODEL,
      source: "sophia-brain:companion",
      forceRealAi: opts.meta?.forceRealAi,
    },
  )
  return response as any
}

export async function handleCompanionModelOutput(opts: {
  supabase: SupabaseClient
  userId: string
  scope: string
  message: string
  history: any[]
  response: CompanionModelOutput
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string }
}): Promise<CompanionRunResult> {
  const { response } = opts

  if (typeof response === 'string') {
    return { text: response.replace(/\*\*/g, ''), executed_tools: [], tool_execution: "none" }
  }

  // Catch-all: never stringify arbitrary objects into chat (it becomes "[object Object]").
  // If we get an unexpected tool call, return a safe user-facing message and log.
  if (response && typeof response === "object") {
    const maybeTool = (response as any)?.tool ?? null
    const maybeText =
      (response as any)?.text ??
      (response as any)?.message ??
      (response as any)?.next_message ??
      null
    if (typeof maybeText === "string" && maybeText.trim()) {
      return { text: maybeText.replace(/\*\*/g, ""), executed_tools: [], tool_execution: "none" }
    }
    if (maybeTool) {
      console.warn("[Companion] Unexpected tool call (ignored):", maybeTool)
      return { text: "Ok — je te suis. On continue.", executed_tools: [], tool_execution: "blocked" }
    }
    console.warn("[Companion] Unexpected non-string response (ignored).")
    return { text: "Ok — je te suis. On continue.", executed_tools: [], tool_execution: "none" }
  }

  return { text: String(response ?? ""), executed_tools: [], tool_execution: "none" }
}

export async function runCompanion(
  supabase: SupabaseClient,
  userId: string,
  scope: string,
  message: string, 
  history: any[], 
  userState: any, 
  context: string = "",
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string }
): Promise<CompanionRunResult> {
  const lastAssistantMessage = history.filter((m: any) => m.role === 'assistant').pop()?.content || "";
  const isWhatsApp = (meta?.channel ?? "web") === "whatsapp"
  const oneShotReminderOutcome = isWhatsApp
    ? await maybeCreateOneShotReminder({
      supabase,
      userId,
      message,
      requestId: meta?.requestId,
    })
    : { detected: false } as const;
  const oneShotReminderAddon = buildOneShotReminderAddon(oneShotReminderOutcome);
  const oneShotReminderToolSummary = summarizeOneShotReminderOutcome(
    oneShotReminderOutcome,
  );
  const augmentedContext = oneShotReminderAddon
    ? `${context}\n${oneShotReminderAddon}`.trim()
    : context;

  const promptParts = buildCompanionPromptParts({
    isWhatsApp,
    lastAssistantMessage,
    context: augmentedContext,
    userState,
  })
  try {
    console.log(JSON.stringify({
      tag: "companion_prompt_cache_ready",
      request_id: meta?.requestId ?? null,
      channel: isWhatsApp ? "whatsapp" : "web",
      stable_hash: simplePromptHash(promptParts.stablePrompt),
      semi_stable_hash: simplePromptHash(promptParts.semiStablePrompt),
      stable_chars: promptParts.stablePrompt.length,
      semi_stable_chars: promptParts.semiStablePrompt.length,
      volatile_chars: promptParts.volatilePrompt.length,
      full_chars: promptParts.fullPrompt.length,
    }))
  } catch {
    // non-blocking
  }

  const systemPrompt = promptParts.fullPrompt
  const response = await generateCompanionModelOutput({ systemPrompt, message, history, meta })
  const result = await handleCompanionModelOutput({ supabase, userId, scope, message, history, response, meta })
  const nextQuestionRhythm = buildNextQuestionRhythmState({
    userState,
    context: augmentedContext,
    responseText: result.text,
  })
  const nextTempMemory = {
    ...((userState?.temp_memory ?? {}) as Record<string, unknown>),
    companion_question_rhythm: nextQuestionRhythm,
  }

  return {
    ...result,
    executed_tools: Array.from(new Set([
      ...oneShotReminderToolSummary.executedTools,
      ...(result.executed_tools ?? []),
    ])),
    tool_execution:
      oneShotReminderToolSummary.toolExecution === "failed"
        ? "failed"
        : oneShotReminderToolSummary.toolExecution === "success"
        ? "success"
        : oneShotReminderToolSummary.toolExecution === "blocked"
        ? (result.tool_execution === "failed" ? "failed" : "blocked")
        : result.tool_execution,
    temp_memory: nextTempMemory,
  }
}
