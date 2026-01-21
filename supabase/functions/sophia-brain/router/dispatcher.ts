import type { AgentMode } from "../state-manager.ts"
import { generateWithGemini } from "../../_shared/gemini.ts"

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
    if (currentState?.current_mode === "architect") {
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


