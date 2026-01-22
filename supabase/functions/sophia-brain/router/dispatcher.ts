import type { AgentMode } from "../state-manager.ts"
import { generateWithGemini } from "../../_shared/gemini.ts"

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCHER V2: STRUCTURED SIGNALS
// Goal: IA interprets the turn → produces signals → Supervisor applies deterministic policy
// ═══════════════════════════════════════════════════════════════════════════════

export type SafetyLevel = "NONE" | "FIREFIGHTER" | "SENTRY"
export type UserIntentPrimary = "CHECKUP" | "PLAN" | "EMOTIONAL_SUPPORT" | "SMALL_TALK" | "PREFERENCE" | "BREAKDOWN" | "UNKNOWN"
export type InterruptKind = "NONE" | "EXPLICIT_STOP" | "BORED" | "SWITCH_TOPIC" | "DIGRESSION"
export type FlowResolutionKind = "NONE" | "ACK_DONE" | "WANTS_RESUME" | "DECLINES_RESUME" | "WANTS_PAUSE"

export interface DispatcherSignals {
  safety: {
    level: SafetyLevel
    confidence: number // 0..1
    immediacy?: "acute" | "non_acute" | "unknown"
  }
  user_intent_primary: UserIntentPrimary
  user_intent_confidence: number // 0..1
  interrupt: {
    kind: InterruptKind
    confidence: number // 0..1
    /** If DIGRESSION or SWITCH_TOPIC, the formalized topic to defer (e.g., "la situation avec ton boss") */
    deferred_topic_formalized?: string | null
  }
  flow_resolution: {
    kind: FlowResolutionKind
    confidence: number // 0..1
  }
  wants_tools: boolean
  risk_score: number // 0..10 (legacy compatibility)
}

const DEFAULT_SIGNALS: DispatcherSignals = {
  safety: { level: "NONE", confidence: 0.9 },
  user_intent_primary: "UNKNOWN",
  user_intent_confidence: 0.5,
  interrupt: { kind: "NONE", confidence: 0.9 },
  flow_resolution: { kind: "NONE", confidence: 0.9 },
  wants_tools: false,
  risk_score: 0,
}

/**
 * Dispatcher v2: produces structured signals instead of directly choosing a mode.
 * The supervisor then applies deterministic policies based on these signals.
 */
export async function analyzeSignals(
  message: string,
  stateSnapshot: {
    current_mode?: string
    investigation_active?: boolean
    investigation_status?: string
    toolflow_active?: boolean
    toolflow_kind?: string
    profile_confirm_pending?: boolean
    topic_session_phase?: string
    risk_level?: string
  },
  lastAssistantMessage: string,
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string },
): Promise<DispatcherSignals> {
  // Deterministic test mode
  const mega =
    (((globalThis as any)?.Deno?.env?.get?.("MEGA_TEST_MODE") ?? "") as string).trim() === "1" &&
    !meta?.forceRealAi
  if (mega) {
    return { ...DEFAULT_SIGNALS }
  }

  const prompt = `Tu es le Dispatcher de Sophia. Ton rôle est d'analyser le message utilisateur et produire des SIGNAUX structurés (pas de décision de routage).

DERNIER MESSAGE ASSISTANT:
"${(lastAssistantMessage ?? "").slice(0, 300)}"

ÉTAT ACTUEL (snapshot):
- Mode en cours: ${stateSnapshot.current_mode ?? "unknown"}
- Bilan actif: ${stateSnapshot.investigation_active ? "OUI" : "NON"}${stateSnapshot.investigation_status ? ` (${stateSnapshot.investigation_status})` : ""}
- Toolflow actif: ${stateSnapshot.toolflow_active ? `OUI (${stateSnapshot.toolflow_kind ?? "unknown"})` : "NON"}
- Confirmation profil en attente: ${stateSnapshot.profile_confirm_pending ? "OUI" : "NON"}
- Topic session phase: ${stateSnapshot.topic_session_phase ?? "none"}

SIGNAUX À PRODUIRE (JSON strict):

1. **safety** — Détresse/danger?
   - level: "NONE" | "FIREFIGHTER" (détresse émotionnelle aiguë) | "SENTRY" (danger vital)
   - confidence: 0.0 à 1.0
   - immediacy: "acute" | "non_acute" | "unknown" (si safety != NONE)

2. **user_intent_primary** — Intention principale?
   - "CHECKUP" (veut faire/continuer un bilan)
   - "PLAN" (veut travailler sur son plan/actions)
   - "EMOTIONAL_SUPPORT" (veut parler émotions sans danger)
   - "SMALL_TALK" (bavardage, "salut", "ça va")
   - "PREFERENCE" (veut changer style/ton/emoji/préférences)
   - "BREAKDOWN" (demande de découper une action, micro-étapes)
   - "UNKNOWN"

3. **user_intent_confidence**: 0.0 à 1.0

4. **interrupt** — L'utilisateur interrompt le flow actuel?
   - kind: "NONE" | "EXPLICIT_STOP" | "BORED" | "SWITCH_TOPIC" | "DIGRESSION"
   - confidence: 0.0 à 1.0
   - deferred_topic_formalized: SI kind="DIGRESSION" ou "SWITCH_TOPIC", extrait le VRAI sujet (pas "je sais pas") et reformule-le en 3-8 mots avec "ton/ta/tes" (ex: "la situation avec ton boss", "ton stress au travail"). Si le message ne contient pas de vrai sujet concret, mets null.

5. **flow_resolution** — L'utilisateur indique un état de flow?
   - kind: "NONE" | "ACK_DONE" (confirme avoir fini) | "WANTS_RESUME" | "DECLINES_RESUME" | "WANTS_PAUSE"
   - confidence: 0.0 à 1.0

6. **wants_tools**: true si l'utilisateur demande explicitement d'activer/créer/modifier une action

7. **risk_score**: 0 (calme) à 10 (danger vital)

RÈGLES:
- Produis UNIQUEMENT le JSON, pas de prose.
- Sois conservateur sur safety (confidence >= 0.75 pour FIREFIGHTER/SENTRY).
- "stop", "arrête", "on arrête" = EXPLICIT_STOP (confidence élevée).
- "ok.", "bon.", réponses très courtes après question = potentiellement BORED.
- "plus tard", "pas maintenant" = DIGRESSION ou WANTS_PAUSE, PAS un stop.

MESSAGE UTILISATEUR:
"${(message ?? "").slice(0, 800)}"

Réponds UNIQUEMENT avec le JSON:`

  try {
    const response = await generateWithGemini(prompt, "", 0.0, true, [], "auto", {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-2.5-flash",
      source: "sophia-brain:dispatcher-v2",
    })
    const obj = JSON.parse(response as string) as any

    // Parse and validate signals
    const safetyLevel = (["NONE", "FIREFIGHTER", "SENTRY"] as SafetyLevel[]).includes(obj?.safety?.level)
      ? obj.safety.level as SafetyLevel
      : "NONE"
    const safetyConf = Math.max(0, Math.min(1, Number(obj?.safety?.confidence ?? 0.9) || 0.9))
    const immediacy = (["acute", "non_acute", "unknown"] as const).includes(obj?.safety?.immediacy)
      ? obj.safety.immediacy
      : "unknown"

    const intentPrimary = ([
      "CHECKUP", "PLAN", "EMOTIONAL_SUPPORT", "SMALL_TALK", "PREFERENCE", "BREAKDOWN", "UNKNOWN"
    ] as UserIntentPrimary[]).includes(obj?.user_intent_primary)
      ? obj.user_intent_primary as UserIntentPrimary
      : "UNKNOWN"
    const intentConf = Math.max(0, Math.min(1, Number(obj?.user_intent_confidence ?? 0.5) || 0.5))

    const interruptKind = (["NONE", "EXPLICIT_STOP", "BORED", "SWITCH_TOPIC", "DIGRESSION"] as InterruptKind[])
      .includes(obj?.interrupt?.kind)
      ? obj.interrupt.kind as InterruptKind
      : "NONE"
    const interruptConf = Math.max(0, Math.min(1, Number(obj?.interrupt?.confidence ?? 0.9) || 0.9))
    // Extract formalized deferred topic if present (for DIGRESSION/SWITCH_TOPIC)
    const deferredTopicRaw = obj?.interrupt?.deferred_topic_formalized
    const deferredTopicFormalized = (
      typeof deferredTopicRaw === "string" && 
      deferredTopicRaw.trim().length >= 3 && 
      deferredTopicRaw.trim().length <= 120 &&
      !/^(je\s+sais?\s+pas|null|undefined|none)$/i.test(deferredTopicRaw.trim())
    ) ? deferredTopicRaw.trim() : null

    const flowKind = (["NONE", "ACK_DONE", "WANTS_RESUME", "DECLINES_RESUME", "WANTS_PAUSE"] as FlowResolutionKind[])
      .includes(obj?.flow_resolution?.kind)
      ? obj.flow_resolution.kind as FlowResolutionKind
      : "NONE"
    const flowConf = Math.max(0, Math.min(1, Number(obj?.flow_resolution?.confidence ?? 0.9) || 0.9))

    const wantsTools = Boolean(obj?.wants_tools)
    const riskScore = Math.max(0, Math.min(10, Number(obj?.risk_score ?? 0) || 0))

    return {
      safety: { level: safetyLevel, confidence: safetyConf, immediacy: safetyLevel !== "NONE" ? immediacy : undefined },
      user_intent_primary: intentPrimary,
      user_intent_confidence: intentConf,
      interrupt: { 
        kind: interruptKind, 
        confidence: interruptConf,
        deferred_topic_formalized: (interruptKind === "DIGRESSION" || interruptKind === "SWITCH_TOPIC") ? deferredTopicFormalized : undefined,
      },
      flow_resolution: { kind: flowKind, confidence: flowConf },
      wants_tools: wantsTools,
      risk_score: riskScore,
    }
  } catch (e) {
    console.error("[Dispatcher v2] JSON parse error:", e)
    return { ...DEFAULT_SIGNALS }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCHER V1 (LEGACY) — kept for backward compatibility
// ═══════════════════════════════════════════════════════════════════════════════

export async function analyzeIntentAndRisk(
  message: string,
  currentState: any,
  lastAssistantMessage: string,
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string },
): Promise<{ targetMode: AgentMode; riskScore: number; nCandidates: 1 | 3 }> {
  // Multi-candidate is expensive (extra LLM calls). We only enable it for truly complex inputs.
  // This is an enforced heuristic (not left to the model), to keep WhatsApp latency stable.
  function isVeryComplexMessage(m: string): boolean {
    const s = (m ?? "").toString().trim();
    if (!s) return false;
    const len = s.length;
    const q = (s.match(/\?/g) ?? []).length;
    const lines = s.split("\n").filter((x) => x.trim()).length;
    const hasList = /(^|\n)\s*([-*]|\d+\.)\s+\S/.test(s);
    const askedForDeep = /\b(en\s+d[ée]tail|d[ée]taille|guide|pas[- ]?à[- ]?pas|analyse|nuance|compar(?:e|aison)|avantages|inconv[ée]nients)\b/i.test(s);
    // Strict thresholds:
    // - long message OR multiple questions OR multi-line/list content OR explicit request for deep explanation.
    return len >= 260 || q >= 2 || lines >= 4 || hasList || askedForDeep;
  }

  function looksLikeCheckupIntent(m: string, lastAssistant: string): boolean {
    const s = (m ?? "").toString();
    const last = (lastAssistant ?? "").toString();
    // Explicit bilan/checkup keywords
    if (/\b(bilan|checkup|check)\b/i.test(s)) return true;
    // If the assistant explicitly asked to do a checkup/bilan, "oui" can be a checkup confirmation.
    if (/\b(bilan|checkup|check)\b/i.test(last) && /\b(oui|ok|d['’]accord)\b/i.test(s)) return true;
    return false;
  }

  function looksLikeBreakdownIntent(m: string): boolean {
    const s = (m ?? "").toString().toLowerCase()
    if (!s.trim()) return false
    return /\b(micro[-\s]?etape|d[ée]compos|d[ée]coup|d[ée]taill|petit\s+pas|[ée]tape\s+minuscule|je\s+bloqu|j['’]y\s+arrive\s+pas|trop\s+dur|insurmontable)\b/i
      .test(s)
  }

  // User preference confirmation intents should always route to Companion (unless safety overrides).
  // This prevents the dispatcher from sending "plan" preference messages to Architect.
  function looksLikePreferenceChangeIntent(m: string): boolean {
    const s = (m ?? "").toString().toLowerCase().trim()
    if (!s) return false
    // Direct/soft tone
    if (/\b(plus\s+direct|plut[oô]t\s+direct|sois\s+direct|ton\s+direct|direct\s+(?:avec|stp|s'il\s+te\s+pla[iî]t)|plut[oô]t\s+doux|plus\s+doux)\b/i.test(s)) return true
    // Short/detailed verbosity
    if (/\b(r[ée]ponses?\s+(?:plus\s+)?courtes?|r[ée]ponses?\s+courtes|fais\s+court|fais\s+des\s+r[ée]ponses?\s+courtes|r[ée]ponses?\s+br[èe]ves?|plus\s+concis|plus\s+succinct|moins\s+long|moins\s+d[ée]taill[ée])\b/i.test(s)) return true
    // Emojis preference
    if (/\b(emoji|emojis|smiley|smileys)\b/i.test(s)) return true
    // Plan push preference (wording varies; keep broad but still "preference-y")
    if (/\b(ne\s+me\s+ram[eè]ne\s+pas|arr[êe]te\s+de\s+me\s+ramener|[ée]vite\s+de\s+me\s+ramener)\b[\s\S]{0,40}\b(plan|objectifs?|actions?)\b/i.test(s)) return true
    // Explicit confirmation framing
    if (/\b(on\s+confirme|tu\s+peux\s+confirmer|je\s+valide|je\s+veux\s+valider)\b/i.test(s)) return true
    return false
  }

  // Deterministic test mode: avoid LLM dependency and avoid writing invalid risk levels.
  const mega =
    (((globalThis as any)?.Deno?.env?.get?.("MEGA_TEST_MODE") ?? "") as string).trim() === "1" &&
    !meta?.forceRealAi
  if (mega) {
    const m = (message ?? "").toString().toLowerCase()
    // If an investigation is already active, ALWAYS keep investigator unless explicit stop.
    const hasStop = /\b(stop|arr[êe]te|on arr[êe]te|pause)\b/i.test(message ?? "")
    if (currentState?.investigation_state && !hasStop) return { targetMode: "investigator", riskScore: 0, nCandidates: 1 }
    // Trigger investigator on common checkup intents.
    if (/\b(check|checkup|bilan)\b/i.test(m)) return { targetMode: "investigator", riskScore: 0, nCandidates: 1 }
    return { targetMode: "companion", riskScore: 0, nCandidates: 1 }
  }

  const basePrompt = `
    Tu es le "Chef de Gare" (Dispatcher) du système Sophia.
    Ton rôle est d'analyser le message de l'utilisateur pour décider QUEL AGENT doit répondre.
    
    DERNIER MESSAGE DE L'ASSISTANT (Contexte) :
    "${lastAssistantMessage.substring(0, 200)}..."
    
    LES AGENTS DISPONIBLES :
    1. sentry (DANGER VITAL) : Suicide, automutilation, violence immédiate. PRIORITÉ ABSOLUE.
    2. firefighter (URGENCE ÉMOTIONNELLE) : Panique, angoisse, craving fort, pleurs.
    3. investigator (DATA & BILAN) : L'utilisateur veut faire son bilan ("Check du soir", "Bilan") OU répond à un prompt de bilan/check.
       IMPORTANT: hors bilan, ne déclenche PAS investigator juste parce que l'utilisateur parle d'une action ("j'ai fait / pas fait").
       Dans ce cas, route plutôt companion (par défaut) ou architect si on doit ajuster le plan.
    4. architect (DEEP WORK & AIDE MODULE) : L'utilisateur parle de ses Valeurs, Vision, Identité, ou demande de l'aide pour un exercice. C'est AUSSI lui qui gère la création/modification du plan.
    5. librarian (EXPLICATION LONGUE) : L'utilisateur demande explicitement une explication détaillée, un mécanisme ("comment ça marche"), une réponse longue structurée, ou un guide pas-à-pas.
       Exemples: "Explique-moi en détail", "Tu peux développer ?", "Décris le mécanisme", "Fais-moi un guide complet".
    6. assistant (TECHNIQUE PUR) : BUGS DE L'APPLICATION (Crash, écran blanc, login impossible). ATTENTION : Si l'utilisateur dit "Tu n'as pas créé l'action" ou "Je ne vois pas le changement", C'EST ENCORE DU RESSORT DE L'ARCHITECTE. Ne passe à 'assistant' que si l'app est cassée techniquement.
    7. companion (DÉFAUT) : Tout le reste. Discussion, "Salut", "Ça va", partage de journée.
    
    ÉTAT ACTUEL :
    Mode en cours : "${currentState.current_mode}"
    Checkup en cours : ${currentState.investigation_state ? "OUI" : "NON"}
    Risque précédent : ${currentState.risk_level}
    
    RÈGLE DE STABILITÉ (CRITIQUE) :
    1. Si un CHECKUP est en cours (investigation_state = OUI) :
       - RESTE sur 'investigator' si l'utilisateur répond à la question, même s'il râle, se plaint du budget ou fait une remarque.
       - L'investigateur doit finir son travail.
       - Ne change de mode que si l'utilisateur demande EXPLICITEMENT d'arrêter ("Stop", "Je veux parler d'autre chose").

    STABILITÉ CHECKUP (RENFORCÉE) :
    - Si \`investigation_state\` est actif (bilan en cours), tu renvoies \`investigator\` dans 100% des cas.
    - SEULE EXCEPTION: l’utilisateur demande explicitement d’arrêter le bilan / changer de sujet (ex: "stop le bilan", "arrête le check", "on arrête", "on change de sujet").
    - "plus tard", "pas maintenant", "on en reparlera" NE sont PAS des stops.

    POST-BILAN (PARKING LOT) :
    RÈGLE "BESOIN DE DÉCOUPER" (HORS BILAN) :
    - Si l'utilisateur exprime qu'il est bloqué sur une action / n'arrive pas à démarrer / que c'est trop dur
      (ex: "je bloque", "j'y arrive pas", "c'est trop dur", "ça me demande trop d'effort", "insurmontable", "je repousse"),
      OU s'il demande une version plus simple (ex: "un petit pas", "une étape minuscule", "encore plus simple"),
      OU s'il demande explicitement de "découper / décomposer / micro-étape" une action,
      ALORS route vers ARCHITECT (outil break_down_action) plutôt que companion.
      Cela ne doit PAS être traité comme un bilan.

    - Si \`investigation_state.status = post_checkup\`, le bilan est terminé.
    - Tu ne dois JAMAIS proposer de "continuer/reprendre le bilan".
    - Tu dois router vers l’agent adapté au sujet reporté (companion par défaut, architect si organisation/planning/priorités, firefighter si détresse).
    
    2. Si le mode en cours est 'architect' :
       - RESTE en 'architect' sauf si c'est une URGENCE VITALE (Sentry).
       - Même si l'utilisateur râle ("ça marche pas", "je ne vois rien"), l'Architecte est le mieux placé pour réessayer. L'assistant technique ne sert à rien pour le contenu du plan.
    
    MULTI-CANDIDATE (QUALITÉ PREMIUM) :
    - Tu peux demander 3 candidates (nCandidates=3) UNIQUEMENT pour: companion, architect, librarian.
    - RÈGLE DURCIE: nCandidates=3 UNIQUEMENT si le message est VRAIMENT complexe (très long, plusieurs questions, multi-sujets, ou demande explicite d'analyse/guide).
    - Sinon nCandidates=1 (par défaut) pour limiter la latence.

    SORTIE JSON ATTENDUE :
    {
      "targetMode": "le_nom_du_mode",
      "riskScore": (0 = calme, 10 = danger vital),
      "nCandidates": 1 ou 3
    }
  `

  try {
    const response = await generateWithGemini(basePrompt, message, 0.0, true, [], "auto", {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-2.5-flash",
      source: "sophia-brain:dispatcher",
    })
    const obj = JSON.parse(response as string) as any
    // IMPORTANT: dispatcher must never return internal worker modes (watcher/dispatcher).
    const allowed: AgentMode[] = ["sentry", "firefighter", "investigator", "architect", "librarian", "assistant", "companion"]
    const rawMode = String(obj?.targetMode ?? "").trim() as AgentMode
    let targetMode = (allowed as string[]).includes(rawMode) ? rawMode : "companion"
    const riskScore = Math.max(0, Math.min(10, Number(obj?.riskScore ?? 0) || 0))
    const rawN = Number(obj?.nCandidates ?? 1)
    const candidateAllowed = targetMode === "companion" || targetMode === "architect" || targetMode === "librarian"
    const wantsMulti = candidateAllowed && rawN === 3
    const nCandidates = (wantsMulti && isVeryComplexMessage(message)) ? 3 : 1

    // HARD GUARD: if we're already in architect mode, keep architect unless there is acute distress (firefighter/sentry).
    // This prevents mid-flow bouncing to companion which causes tool/consent loops.
    //
    // EXCEPTION: preference confirmations MUST route to companion, even if the current mode is architect.
    // Otherwise user_profile_confirm gets stuck (common when the preference mentions "plan").
    if (currentState?.current_mode === "architect" && !looksLikePreferenceChangeIntent(message)) {
      const acute = looksLikeAcuteDistress(message)
      const wantsCheckup = looksLikeCheckupIntent(message, lastAssistantMessage)
      // Checkup intent should override "stay in architect" stability.
      if (!acute && !wantsCheckup && targetMode !== "architect") {
        targetMode = "architect"
      }
    }

    // HARD FORCE: explicit checkup intent always routes to investigator (unless user asked to stop a checkup).
    // This is critical for eval scenarios (and for real UX) where "on fait le bilan" must not be ignored.
    if (!currentState?.investigation_state && looksLikeCheckupIntent(message, lastAssistantMessage)) {
      targetMode = "investigator"
    }

    // HARD FORCE: preference change / confirmation is Companion work (unless investigator/safety).
    if (
      targetMode !== "sentry" &&
      targetMode !== "firefighter" &&
      targetMode !== "investigator" &&
      looksLikePreferenceChangeIntent(message)
    ) {
      targetMode = "companion"
    }

    // HARD GUARD: investigator is ONLY for active checkups or explicit checkup intent.
    // This prevents "investigator" from hijacking normal WhatsApp onboarding / small-talk.
    if (
      targetMode === "investigator" &&
      !currentState?.investigation_state &&
      !looksLikeCheckupIntent(message, lastAssistantMessage)
    ) {
      targetMode = "companion"
    }

    // If the user clearly asks for a micro-step breakdown and there is no acute distress,
    // do not route to firefighter just because the message is emotional.
    if (!looksLikeAcuteDistress(message) && looksLikeBreakdownIntent(message) && targetMode === "firefighter") {
      targetMode = "architect"
    }
    return { targetMode, riskScore, nCandidates }
  } catch (e) {
    console.error("Erreur Dispatcher Gemini:", e)
    // Fallback de sécurité
    return { targetMode: "companion", riskScore: 0, nCandidates: 1 }
  }
}

export function looksLikeAcuteDistress(message: string): boolean {
  const s = (message ?? "").toString().toLowerCase()
  if (!s.trim()) return false
  // Keep conservative: route to firefighter on clear acute distress signals (panic/overwhelm/physical stress cues),
  // but avoid over-triggering on generic "stress" talk.
  return /\b(panique|crise|je\s+craque|je\s+n['’]en\s+peux\s+plus|au\s+bout|d[ée]tresse|angoisse\s+(?:forte|intense)|aide\s+vite|urgence|envie\s+de\s+pleurer|j['’]ai\s+envie\s+de\s+pleurer|boule\s+au\s+ventre|submerg[ée]?|d[ée]bord[ée]?|je\s+n['’]arrive\s+plus\s+à\s+me\s+concentrer|j['’]arrive\s+pas\s+à\s+me\s+concentrer|pression\s+non\s+stop|pression\s+impossible)\b/i
    .test(s)
}


