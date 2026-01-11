import type { AgentMode } from "../state-manager.ts"
import { generateWithGemini } from "../../_shared/gemini.ts"

export async function analyzeIntentAndRisk(
  message: string,
  currentState: any,
  lastAssistantMessage: string,
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string },
): Promise<{ targetMode: AgentMode; riskScore: number; nCandidates: 1 | 3 }> {
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
    3. investigator (DATA & BILAN) : L'utilisateur veut faire son bilan ("Check du soir", "Bilan"), donne des chiffres (cigarettes, sommeil), dit "J'ai fait mon sport", OU répond "Oui" à une invitation au bilan.
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
    - Si \`investigation_state.status = post_checkup\`, le bilan est terminé.
    - Tu ne dois JAMAIS proposer de "continuer/reprendre le bilan".
    - Tu dois router vers l’agent adapté au sujet reporté (companion par défaut, architect si organisation/planning/priorités, firefighter si détresse).
    
    2. Si le mode en cours est 'architect' :
       - RESTE en 'architect' sauf si c'est une URGENCE VITALE (Sentry).
       - Même si l'utilisateur râle ("ça marche pas", "je ne vois rien"), l'Architecte est le mieux placé pour réessayer. L'assistant technique ne sert à rien pour le contenu du plan.
    
    MULTI-CANDIDATE (QUALITÉ PREMIUM) :
    - Tu peux demander 3 candidates (nCandidates=3) UNIQUEMENT pour: companion, architect, librarian.
    - nCandidates=3 quand le message est compliqué/ambigü, émotionnel, long, ou demande une explication/nuance.
    - Sinon nCandidates=1 (par défaut).

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
    const targetMode = (allowed as string[]).includes(rawMode) ? rawMode : "companion"
    const riskScore = Math.max(0, Math.min(10, Number(obj?.riskScore ?? 0) || 0))
    const rawN = Number(obj?.nCandidates ?? 1)
    const candidateAllowed = targetMode === "companion" || targetMode === "architect" || targetMode === "librarian"
    const nCandidates = (candidateAllowed && rawN === 3) ? 3 : 1
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
  // Keep conservative: only clear crisis/panic language.
  return /\b(panique|crise|je\s+craque|je\s+n['’]en\s+peux\s+plus|au\s+bout|d[ée]tresse|angoisse\s+(?:forte|intense)|aide\s+vite|urgence)\b/i
    .test(s)
}


