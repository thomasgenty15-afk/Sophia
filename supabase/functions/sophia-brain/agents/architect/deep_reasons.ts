/**
 * Deep Reasons Exploration - State Machine
 * 
 * This module implements the state machine for exploring deep/motivational blockers.
 * It can be triggered from two entry points:
 * 1. Investigator (during bilan) → deferred, then resumed by Architect
 * 2. Architect (outside bilan) → launched directly
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { generateWithGemini } from "../../../_shared/gemini.ts"
import type {
  DeepReasonsState,
  DeepReasonsPhase,
  DeepReasonsPattern,
  DeepReasonsOutcome,
  DeepReasonsInterventionType,
  EnrichedDeferredTopic,
} from "./deep_reasons_types.ts"
import {
  createDeepReasonsState,
  getNextDeepReasonsPhase,
  suggestInterventionType,
} from "./deep_reasons_types.ts"

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect if a user message expresses a motivational/deep blocker.
 * Returns the detected pattern if found, null otherwise.
 */
export function detectDeepReasonsPattern(message: string): DeepReasonsPattern | null {
  const m = String(message ?? "").toLowerCase().trim()
  if (!m) return null

  // Fear patterns
  if (
    /\b(j['']?ai\s+peur|ça\s+me\s+fait\s+peur|je\s+me\s+sens?\s+nul|pas\s+[àa]\s+la\s+hauteur|je\s+vais\s+[eé]chouer|je\s+suis\s+pas\s+capable|peur\s+de\s+l['']?[eé]chec|peur\s+du\s+jugement|anxiété|angoisse)\b/i.test(m)
  ) {
    return "fear"
  }

  // Meaning patterns
  if (
    /\b(je\s+sais?\s+pas\s+pourquoi|ça\s+sert\s+[àa]\s+rien|[àa]\s+quoi\s+bon|quel\s+int[eé]r[eê]t|pas\s+de\s+sens|c['']?est\s+quoi\s+l['']?int[eé]r[eê]t|pourquoi\s+je\s+fais?\s+ça|je\s+vois?\s+pas\s+le\s+but)\b/i.test(m)
  ) {
    return "meaning"
  }

  // Energy patterns
  if (
    /\b(flemme|pas\s+envie|j['']?ai\s+la\s+flemme|[eé]puis[eé]|fatigu[eé]|crev[eé]|aucune\s+[eé]nergie|z[eé]ro\s+motivation|plus\s+la\s+force|pas\s+l['']?[eé]nergie|trop\s+crev[eé]|chronique|toujours\s+fatigu[eé])\b/i.test(m)
  ) {
    return "energy"
  }

  // Ambivalence patterns
  if (
    /\b(une\s+partie\s+de\s+moi|d['']?un\s+c[oô]t[eé]|de\s+l['']?autre|je\s+sais?\s+pas\s+si|j['']?h[eé]site|partagé|tiraillé|envie\s+et\s+pas\s+envie|oui\s+et\s+non|je\s+veux\s+mais)\b/i.test(m)
  ) {
    return "ambivalence"
  }

  // Identity patterns
  if (
    /\b(je\s+suis?\s+pas\s+(?:quelqu['']?un\s+qui|le\s+genre\s+[àa]|fait\s+pour)|c['']?est\s+pas\s+moi|pas\s+mon\s+truc|pas\s+dans\s+ma\s+nature|je\s+suis?\s+pas\s+comme\s+[çc]a|ça\s+me\s+ressemble\s+pas)\b/i.test(m)
  ) {
    return "identity"
  }

  // General motivational blockers (fallback to energy)
  if (
    /\b(j['']?arrive\s+(?:vraiment\s+)?pas|je\s+repousse|j['']?[eé]vite|je\s+procrastin|ça\s+me\s+saoule|ça\s+me\s+gonfle|j['']?en\s+ai\s+marre|j['']?y\s+arrive\s+pas|bloqu[eé]|coinc[eé])\b/i.test(m)
  ) {
    return "unknown" // Will be clarified during the flow
  }

  return null
}

/**
 * Check if user wants to stop the exploration
 */
export function userWantsToStopExploration(message: string): boolean {
  const m = String(message ?? "").toLowerCase().trim()
  return /\b(stop|arr[eê]te|on\s+arr[eê]te|j['']?arr[eê]te|pas\s+maintenant|plus\s+tard|non\s+merci|laisse\s+tomber|c['']?est\s+bon|pas\s+envie\s+d['']?en\s+parler|trop\s+dur|trop\s+lourd)\b/i.test(m)
}

/**
 * Check if user consents to exploration
 */
export function userConsentsToExploration(message: string): boolean {
  const m = String(message ?? "").toLowerCase().trim()
  return /\b(oui|ok|d['']?accord|vas[-\s]?y|go|on\s+y\s+va|je\s+veux\s+bien|pourquoi\s+pas|allons[-\s]?y|c['']?est\s+parti)\b/i.test(m) &&
    !userWantsToStopExploration(message)
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE MACHINE RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

export interface DeepReasonsRunResult {
  /** Response content to send to user */
  content: string
  /** Updated state (null if exploration ended) */
  newState: DeepReasonsState | null
  /** Outcome if exploration ended */
  outcome?: DeepReasonsOutcome
}

/**
 * Main state machine runner for deep reasons exploration.
 */
export async function runDeepReasonsExploration(opts: {
  supabase: SupabaseClient
  userId: string
  message: string
  history: any[]
  currentState: DeepReasonsState
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string }
}): Promise<DeepReasonsRunResult> {
  const { message, currentState, meta } = opts
  const channel = meta?.channel ?? "web"

  // Always allow user to stop
  if (userWantsToStopExploration(message)) {
    return {
      content: await generateClosingMessage("user_stop", currentState, channel, meta),
      newState: null,
      outcome: "user_stop",
    }
  }

  // Increment turn count
  const state: DeepReasonsState = {
    ...currentState,
    turn_count: currentState.turn_count + 1,
  }

  // Dispatch based on current phase
  switch (state.phase) {
    case "re_consent":
      return handleReConsentPhase(message, state, channel, meta)
    case "clarify":
      return handleClarifyPhase(message, state, channel, meta)
    case "hypotheses":
      return handleHypothesesPhase(message, state, channel, meta)
    case "resonance":
      return handleResonancePhase(message, state, channel, meta)
    case "intervention":
      return handleInterventionPhase(message, state, channel, meta)
    case "closing":
      return handleClosingPhase(message, state, channel, meta)
    default:
      console.error(`[DeepReasons] Unknown phase: ${state.phase}`)
      return {
        content: "Je me suis un peu perdue. On peut reprendre ?",
        newState: { ...state, phase: "clarify" },
      }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

async function handleReConsentPhase(
  message: string,
  state: DeepReasonsState,
  channel: "web" | "whatsapp",
  meta?: any,
): Promise<DeepReasonsRunResult> {
  // Check if user consents to continue
  if (userConsentsToExploration(message)) {
    const nextState: DeepReasonsState = { ...state, phase: "clarify" }
    return {
      content: await generateClarifyPrompt(state, channel, meta),
      newState: nextState,
    }
  }

  // If user declines or is ambiguous
  if (/\b(non|pas\s+maintenant|plus\s+tard)\b/i.test(message.toLowerCase())) {
    return {
      content: "Pas de souci, on garde ça pour plus tard. Tu me fais signe quand tu veux. 🙂",
      newState: null,
      outcome: "defer_continue",
    }
  }

  // Re-ask for consent
  const actionTitle = state.action_context?.title ?? "ce blocage"
  return {
    content: `Je voulais revenir sur ${actionTitle}. Tu m'avais dit "${state.user_words.slice(0, 60)}..."\n\nTu veux qu'on prenne 5 minutes pour explorer ce qui se passe vraiment ? (tu peux dire non)`,
    newState: state,
  }
}

async function handleClarifyPhase(
  message: string,
  state: DeepReasonsState,
  channel: "web" | "whatsapp",
  meta?: any,
): Promise<DeepReasonsRunResult> {
  // User is describing what happens
  const updatedState: DeepReasonsState = {
    ...state,
    user_words: `${state.user_words} | ${message.slice(0, 150)}`,
    phase: "hypotheses",
  }

  // Try to detect/refine the pattern from their description
  const detectedPattern = detectDeepReasonsPattern(message)
  if (detectedPattern && detectedPattern !== "unknown") {
    updatedState.detected_pattern = detectedPattern
  }

  return {
    content: await generateHypothesesPrompt(updatedState, channel, meta),
    newState: updatedState,
  }
}

async function handleHypothesesPhase(
  message: string,
  state: DeepReasonsState,
  channel: "web" | "whatsapp",
  meta?: any,
): Promise<DeepReasonsRunResult> {
  // User is receiving hypotheses, move to resonance
  const nextState: DeepReasonsState = { ...state, phase: "resonance" }
  
  return {
    content: await generateResonancePrompt(state, message, channel, meta),
    newState: nextState,
  }
}

async function handleResonancePhase(
  message: string,
  state: DeepReasonsState,
  channel: "web" | "whatsapp",
  meta?: any,
): Promise<DeepReasonsRunResult> {
  // User is indicating which hypothesis resonates
  const selectedHypothesis = message.slice(0, 200)
  
  // Determine intervention type based on what resonated
  const interventionType = determineInterventionFromResponse(message, state.detected_pattern)
  
  const nextState: DeepReasonsState = {
    ...state,
    phase: "intervention",
    selected_hypothesis: selectedHypothesis,
    intervention_type: interventionType,
  }

  return {
    content: await generateInterventionPrompt(nextState, channel, meta),
    newState: nextState,
  }
}

async function handleInterventionPhase(
  message: string,
  state: DeepReasonsState,
  channel: "web" | "whatsapp",
  meta?: any,
): Promise<DeepReasonsRunResult> {
  // User is receiving intervention, move to closing
  const nextState: DeepReasonsState = { ...state, phase: "closing" }

  return {
    content: await generateClosingPrompt(state, message, channel, meta),
    newState: nextState,
  }
}

async function handleClosingPhase(
  message: string,
  state: DeepReasonsState,
  channel: "web" | "whatsapp",
  meta?: any,
): Promise<DeepReasonsRunResult> {
  // User is responding to micro-commitment proposal
  const accepted = userConsentsToExploration(message)
  
  const microCommitment = accepted ? message.slice(0, 150) : undefined
  const finalState: DeepReasonsState = {
    ...state,
    micro_commitment: microCommitment,
  }

  return {
    content: await generateClosingMessage(accepted ? "resolved" : "defer_continue", finalState, channel, meta),
    newState: null,
    outcome: accepted ? "resolved" : "defer_continue",
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT GENERATORS (AI-assisted responses)
// ═══════════════════════════════════════════════════════════════════════════════

async function generateClarifyPrompt(
  state: DeepReasonsState,
  channel: "web" | "whatsapp",
  meta?: any,
): Promise<string> {
  const actionContext = state.action_context?.title ?? "cette chose"
  const isWhatsApp = channel === "whatsapp"

  const prompt = `Tu es Sophia, coach bienveillant. L'utilisateur a accepté d'explorer un blocage sur "${actionContext}".
Il avait dit: "${state.user_words.slice(0, 200)}"

Ta mission: poser UNE question ouverte et douce pour comprendre ce qui se passe.
Exemples de bonnes questions:
- "Qu'est-ce qui se passe juste avant que tu décroches ?"
- "Quand tu penses à le faire, qu'est-ce qui vient en premier ?"
- "C'est quoi la sensation ou la pensée qui arrive ?"

RÈGLES:
- Ton chaleureux, pas clinique
- UNE seule question
- ${isWhatsApp ? "Max 3 lignes" : "Max 4 lignes"}
- Pas de "Bonjour" ni de formalités
- Pas de ** (texte brut)
- 1 emoji max

Génère uniquement ta réponse:`

  try {
    const response = await generateWithGemini(prompt, "", 0.7, true, [], "auto", {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-2.5-flash",
      source: "sophia-brain:deep_reasons:clarify",
    })
    return String(response ?? "").trim() || `Qu'est-ce qui se passe pour toi quand tu penses à ${actionContext} ? 🙂`
  } catch {
    return `Qu'est-ce qui se passe pour toi juste avant de décrocher sur ${actionContext} ? 🙂`
  }
}

async function generateHypothesesPrompt(
  state: DeepReasonsState,
  channel: "web" | "whatsapp",
  meta?: any,
): Promise<string> {
  const pattern = state.detected_pattern
  const userWords = state.user_words
  const isWhatsApp = channel === "whatsapp"

  const prompt = `Tu es Sophia, coach bienveillant. L'utilisateur a décrit son blocage:
"${userWords.slice(0, 300)}"

Pattern détecté initialement: ${pattern}

Ta mission: proposer 3-4 hypothèses bienveillantes sur ce qui pourrait se passer en profondeur.
Les hypothèses doivent couvrir différentes pistes:
- Peur (échec, jugement, pas à la hauteur)
- Sens (pourquoi je fais ça, quel intérêt)
- Énergie (fatigue, surcharge, épuisement)
- Ambivalence (une partie veut, une partie résiste)
- Identité (ce n'est pas moi, pas mon truc)

RÈGLES:
- Ton chaleureux, pas diagnostic
- Formule comme des possibilités ("peut-être que...", "parfois c'est...")
- ${isWhatsApp ? "Max 6 lignes" : "Max 8 lignes"}
- Pas de liste numérotée (trop clinique)
- Termine par "Laquelle te parle le plus ?" ou équivalent
- Pas de ** (texte brut)
- 1 emoji max

Génère uniquement ta réponse:`

  try {
    const response = await generateWithGemini(prompt, "", 0.7, true, [], "auto", {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-2.5-flash",
      source: "sophia-brain:deep_reasons:hypotheses",
    })
    return String(response ?? "").trim() || generateFallbackHypotheses(pattern)
  } catch {
    return generateFallbackHypotheses(pattern)
  }
}

function generateFallbackHypotheses(pattern: DeepReasonsPattern): string {
  return `Je vois plusieurs pistes possibles...

Peut-être que c'est de la fatigue pure (le cerveau qui dit "pas maintenant").
Ou alors une partie de toi n'est pas convaincue que ça vaut le coup.
Parfois c'est aussi une forme de peur déguisée, la peur de ne pas bien faire ou d'échouer.

Laquelle te parle le plus ? 🙂`
}

async function generateResonancePrompt(
  state: DeepReasonsState,
  userResponse: string,
  channel: "web" | "whatsapp",
  meta?: any,
): Promise<string> {
  const isWhatsApp = channel === "whatsapp"

  const prompt = `Tu es Sophia, coach bienveillant. L'utilisateur vient de répondre à tes hypothèses.
Sa réponse: "${userResponse.slice(0, 200)}"
Contexte initial: "${state.user_words.slice(0, 150)}"

Ta mission: 
1. Valider ce qu'il a dit avec empathie (1 phrase)
2. Approfondir légèrement ("qu'est-ce qui fait que..." ou "depuis quand...")
3. Poser UNE question pour préciser

RÈGLES:
- Ton chaleureux, pas clinique
- ${isWhatsApp ? "Max 4 lignes" : "Max 5 lignes"}
- Pas de ** (texte brut)
- 1 emoji max

Génère uniquement ta réponse:`

  try {
    const response = await generateWithGemini(prompt, "", 0.7, true, [], "auto", {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-2.5-flash",
      source: "sophia-brain:deep_reasons:resonance",
    })
    return String(response ?? "").trim() || "Je comprends. Et qu'est-ce qui fait que c'est difficile pour toi en ce moment ? 🙂"
  } catch {
    return "Je comprends. Et qu'est-ce qui fait que c'est difficile pour toi en ce moment ? 🙂"
  }
}

async function generateInterventionPrompt(
  state: DeepReasonsState,
  channel: "web" | "whatsapp",
  meta?: any,
): Promise<string> {
  const interventionType = state.intervention_type ?? "reduce_friction"
  const userWords = state.user_words
  const selectedHypothesis = state.selected_hypothesis ?? ""
  const isWhatsApp = channel === "whatsapp"

  const interventionGuidelines: Record<DeepReasonsInterventionType, string> = {
    reduce_friction: "Propose de réduire la friction: version mini (2 min), enlever un obstacle, rendre plus facile",
    reconnect_meaning: "Aide à reconnecter au sens: pourquoi c'est important, quelle valeur ça sert, quel futur ça construit",
    reframe_fear: "Aide à recadrer la peur: normaliser, proposer une micro-expérience safe, montrer que l'échec fait partie du process",
    negotiate_ambivalence: "Explore l'ambivalence: qu'est-ce que chaque partie veut protéger, trouver un compromis",
  }

  const prompt = `Tu es Sophia, coach bienveillant. L'utilisateur a identifié son blocage:
"${selectedHypothesis.slice(0, 200)}"
Contexte: "${userWords.slice(0, 150)}"

Type d'intervention: ${interventionType}
Guideline: ${interventionGuidelines[interventionType]}

Ta mission: proposer UNE intervention concrète et douce, adaptée à ce qu'il a dit.

RÈGLES:
- Ton chaleureux, pas prescriptif
- Propose, n'impose pas
- ${isWhatsApp ? "Max 5 lignes" : "Max 6 lignes"}
- Termine par une question ouverte ("Tu en penses quoi ?", "Ça te parle ?")
- Pas de ** (texte brut)
- 1 emoji max

Génère uniquement ta réponse:`

  try {
    const response = await generateWithGemini(prompt, "", 0.7, true, [], "auto", {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-2.5-flash",
      source: "sophia-brain:deep_reasons:intervention",
    })
    return String(response ?? "").trim() || generateFallbackIntervention(interventionType)
  } catch {
    return generateFallbackIntervention(interventionType)
  }
}

function generateFallbackIntervention(type: DeepReasonsInterventionType): string {
  const fallbacks: Record<DeepReasonsInterventionType, string> = {
    reduce_friction: "Et si on rendait ça plus facile ? Une version mini de 2 minutes, juste pour commencer. Pas besoin que ce soit parfait. Tu en penses quoi ? 🙂",
    reconnect_meaning: "Ce qui pourrait aider, c'est de te reconnecter à pourquoi c'est important pour toi. Qu'est-ce que ça t'apporterait si tu y arrivais ? 🙂",
    reframe_fear: "La peur de mal faire, c'est normal. Et si tu te donnais la permission d'essayer imparfaitement, juste une fois ? Sans enjeu. Ça te parle ? 🙂",
    negotiate_ambivalence: "Les deux parties de toi ont sûrement des raisons valables. Qu'est-ce que la partie qui résiste essaie de protéger ? 🙂",
  }
  return fallbacks[type]
}

async function generateClosingPrompt(
  state: DeepReasonsState,
  userResponse: string,
  channel: "web" | "whatsapp",
  meta?: any,
): Promise<string> {
  const isWhatsApp = channel === "whatsapp"

  const prompt = `Tu es Sophia, coach bienveillant. L'utilisateur a répondu à ton intervention:
"${userResponse.slice(0, 200)}"

Ta mission: proposer un micro-engagement très concret pour les prochaines 24-48h.
- Quelque chose de TRÈS petit et facile
- Pas d'obligation, juste une proposition
- Reformule ce qu'on a découvert ensemble (1 phrase)

RÈGLES:
- Ton chaleureux, encourageant
- ${isWhatsApp ? "Max 4 lignes" : "Max 5 lignes"}
- Termine par une question simple ("Tu veux essayer ?" ou "On part là-dessus ?")
- Pas de ** (texte brut)
- 1 emoji max

Génère uniquement ta réponse:`

  try {
    const response = await generateWithGemini(prompt, "", 0.7, true, [], "auto", {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-2.5-flash",
      source: "sophia-brain:deep_reasons:closing",
    })
    return String(response ?? "").trim() || "Ok. Et si demain, tu faisais juste la version la plus mini possible, 2 minutes ? Juste pour voir. Tu veux essayer ? 🙂"
  } catch {
    return "Ok. Et si demain, tu faisais juste la version la plus mini possible, 2 minutes ? Juste pour voir. Tu veux essayer ? 🙂"
  }
}

async function generateClosingMessage(
  outcome: DeepReasonsOutcome,
  state: DeepReasonsState,
  channel: "web" | "whatsapp",
  meta?: any,
): Promise<string> {
  const messages: Record<DeepReasonsOutcome, string> = {
    resolved: `Super. On a fait du bon travail ensemble. ${state.micro_commitment ? `Tu vas essayer "${state.micro_commitment.slice(0, 50)}..."` : "Tu as un petit pas pour la suite."} Je suis là si tu veux en reparler. 🙂`,
    defer_continue: "Pas de souci, on garde ça pour plus tard. Tu me fais signe quand tu veux. 🙂",
    user_stop: "Ok, on arrête là. C'est déjà bien d'avoir osé regarder ça. Je suis là si tu veux reprendre. 🙂",
    needs_human_support: "Je sens que c'est un sujet important pour toi. Si tu ressens le besoin d'en parler à quelqu'un, n'hésite pas à te tourner vers un professionnel. Je reste disponible pour t'accompagner sur le reste. 💙",
  }
  return messages[outcome]
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function determineInterventionFromResponse(
  response: string,
  currentPattern: DeepReasonsPattern,
): DeepReasonsInterventionType {
  const m = response.toLowerCase()

  // Check for specific keywords that indicate the underlying issue
  if (/\b(peur|effray|angoiss|stress|anxiété|échec|jugement|nul)\b/i.test(m)) {
    return "reframe_fear"
  }
  if (/\b(sens|pourquoi|intérêt|but|raison|valeur|important)\b/i.test(m)) {
    return "reconnect_meaning"
  }
  if (/\b(partie|côté|moitié|veut.*mais|oui.*non|hésite)\b/i.test(m)) {
    return "negotiate_ambivalence"
  }
  if (/\b(fatigue|énergie|flemme|lourd|effort|dur|difficile)\b/i.test(m)) {
    return "reduce_friction"
  }

  // Fall back to suggestion based on detected pattern
  return suggestInterventionType(currentPattern)
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT: START EXPLORATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initialize a new deep reasons exploration (called by Architect tool).
 */
export function startDeepReasonsExploration(opts: {
  action_title?: string
  action_id?: string
  detected_pattern: DeepReasonsPattern
  user_words: string
  source: "deferred" | "direct"
  skip_re_consent?: boolean
}): DeepReasonsState {
  return createDeepReasonsState({
    phase: opts.skip_re_consent ? "clarify" : (opts.source === "deferred" ? "re_consent" : "clarify"),
    action_context: opts.action_title ? { id: opts.action_id, title: opts.action_title } : undefined,
    detected_pattern: opts.detected_pattern,
    user_words: opts.user_words,
    source: opts.source,
  })
}

/**
 * Resume a deep reasons exploration from a deferred topic.
 */
export function resumeDeepReasonsFromDeferred(
  deferredTopic: EnrichedDeferredTopic,
): DeepReasonsState {
  const ctx = deferredTopic.context
  return createDeepReasonsState({
    phase: "re_consent",
    action_context: ctx?.action_title ? { id: ctx.action_id, title: ctx.action_title } : undefined,
    detected_pattern: ctx?.detected_pattern ?? "unknown",
    user_words: ctx?.user_words ?? deferredTopic.topic,
    source: "deferred",
  })
}


