import { generateWithGemini } from '../../_shared/gemini.ts'

type FirefighterTechnique =
  | "safety_check"
  | "ab_choice"
  | "guided_30s"
  | "name_emotion"
  | "reframe"
  | "micro_plan";

function looksLikeGuidedTextRequest(message: string): boolean {
  const m = (message ?? "").toString().toLowerCase()
  // User explicitly asks for a "text/script" to help calm down.
  return /\b(texte|script|guid(?:e|é)|respiration\s+guid(?:e|é)e|exercice|mini[-\s]?texte|petit\s+texte|lis[-\s]?moi|lire|écris[-\s]?moi)\b/i
    .test(m)
}

function detectLastTechniqueFromAssistant(lastAssistantMessage: string): FirefighterTechnique | null {
  const t = (lastAssistantMessage ?? "").toString().toLowerCase()
  if (!t.trim()) return null
  if (/\b(en\s+s[ée]curit[ée]|tu\s+es\s+en\s+s[ée]curit[ée])\b/i.test(t)) return "safety_check"
  if (/\b(a\)|option\s+a|b\)|option\s+b)\b/i.test(t)) return "ab_choice"
  if (/\bmini[-\s]?texte|texte\s+guid[ée]|script\b/i.test(t)) return "guided_30s"
  if (/\b(quelle\s+[ée]motion|nomme|[ée]motion)\b/i.test(t)) return "name_emotion"
  if (/\b(au\s+fond|l['’]essentiel|remettre|priorit[ée])\b/i.test(t)) return "reframe"
  if (/\b(dans\s+les?\s+10\s+minutes|micro[-\s]?plan|prochaine\s+[ée]tape)\b/i.test(t)) return "micro_plan"
  return null
}

function looksLikeAcutePanic(message: string): boolean {
  const m = (message ?? "").toString().toLowerCase()
  return /\b(panique|crise|angoisse\s+forte|urgence|je\s+craque|au\s+bout)\b/i.test(m)
}

function looksAffirmative(message: string): boolean {
  const m = (message ?? "").toString().trim().toLowerCase()
  return /^(?:oui|ouais|ok|d['’]?accord|vas[-\s]?y|go|stp|s'il te pla[iî]t|pourquoi pas|je veux bien)\b/i.test(m)
}

function lastAssistantOfferedGuidedText(lastAssistantMessage: string): boolean {
  const m = (lastAssistantMessage ?? "").toString().toLowerCase()
  // Keep permissive: we only use this to accept a clear "oui" to proceed.
  return /\b(texte|script)\b/.test(m) && /\b(tu\s+veux|tu\s+en\s+veux|je\s+peux|si\s+tu\s+veux)\b/.test(m)
}

export async function runFirefighter(
  message: string,
  history: any[],
  context: string = "",
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string }
): Promise<{ content: string, crisisResolved: boolean }> {
  const lastAssistantMessage = history.filter((m: any) => m.role === 'assistant').pop()?.content || "";
  const allowGuidedText =
    looksLikeGuidedTextRequest(message) ||
    (lastAssistantOfferedGuidedText(lastAssistantMessage) && looksAffirmative(message))
  const lastTechnique = detectLastTechniqueFromAssistant(lastAssistantMessage)
  const isWhatsApp = (meta?.channel ?? "web") === "whatsapp"
  const acutePanic = looksLikeAcutePanic(message)

  const basePrompt = `
    Tu es Sophia. (Mode : Firefighter — désamorçage intelligent).
    L'utilisateur vit une montée de stress/angoisse. Ton job: faire redescendre la pression vite, sans être relou.
    
    DERNIÈRE RÉPONSE DE SOPHIA : "${lastAssistantMessage.substring(0, 100)}..."

    OBJECTIF :
    - Aider l'utilisateur à retrouver 10–30% de calme en 1 tour.
    - Être ingénieux: détourner l'attention, remettre du cadre, valider, proposer 2 options, parler franchement si utile.
    - Éviter les boucles de grounding répétitives (pas "sens le bureau" 4 fois).

    TON STYLE :
    - Chaleureux, direct, intelligent. Pas de "moine".
    - Tu peux utiliser le corps, MAIS pas comme un mantra; 1 micro-geste max si ça aide.
    - Tutoiement. Pas de salutations. Pas de **.
    - WhatsApp: très concis.

    RÈGLE CRITIQUE :
    - 1 QUESTION MAX par message.
    - Ne répète pas le même exercice que ton dernier message.
    - Si l'utilisateur est juste stressé (pas panique), ne pars pas direct en interrogatoire.

    STRATÉGIES DISPONIBLES (choisis la meilleure) :
    A) "ab_choice": proposer 2 options très différentes (A/B) et demander le choix (c'est ta stratégie par défaut).
    B) "reframe": remettre du cadre (église au milieu du village) + 1 micro-étape.
    C) "name_emotion": nommer l'émotion + normaliser + 1 question simple d'identification.
    D) "micro_plan": micro-plan 10 minutes (triage ultra simple) + 1 question.
    E) "guided_30s": mini-script 30 secondes (seulement si demandé).
    F) "safety_check": si panique/urgence, poser la question de sécurité (oui/non) et rien d'autre.

    CONSIGNES SELON CONTEXTE :
    - allow_guided_text = ${allowGuidedText ? "true" : "false"}
    - acute_panic = ${acutePanic ? "true" : "false"}
    - last_technique = ${lastTechnique ? `"${lastTechnique}"` : "null"}
    - channel = ${isWhatsApp ? "whatsapp" : "web"}

    CHOIX FORCÉ :
    - Si acute_panic = true: utilise "safety_check".
    - Sinon si allow_guided_text = true: utilise "guided_30s".
    - Sinon: utilise "ab_choice" (par défaut), sauf si last_technique="ab_choice" alors choisis "reframe" ou "micro_plan".

    RÈGLES DE FORME :
    - WhatsApp: 2 à 6 lignes max.
    - Si "ab_choice": écris exactement deux lignes qui commencent par "A) " et "B) " (une option par ligne), puis UNE question: "Tu préfères A ou B ?"
    - Si "guided_30s": max 8 lignes, pas de poésie.
    - Pas d'emojis par défaut (tu peux en mettre 0–1 max si WhatsApp et si ça sert).

    CONTEXTE CRISE :
    ${context ? `${context}\n(Cherche les déclencheurs ici)` : ""}
    
    IMPORTANT - DÉTECTION DE FIN DE CRISE :
    À la fin de ta réponse, tu dois évaluer si la crise semble passée.
    Si l'utilisateur dit "ça va mieux", "merci", "je suis plus calme", considère que c'est résolu.
    
    SORTIE JSON ATTENDUE :
    {
      "response": "Le texte de ta réponse à l'utilisateur.",
      "technique": "one of: safety_check | ab_choice | guided_30s | name_emotion | reframe | micro_plan",
      "resolved": true/false
    }
  `
  const systemPrompt = basePrompt

  const historyText = history.slice(-3).map((m: any) => `${m.role}: ${m.content}`).join('\n')
  
  try {
    const out = await generateWithGemini(systemPrompt, `Historique:\n${historyText}\n\nUser: ${message}`, 0.3, true, [], "auto", {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-2.5-flash",
      source: "sophia-brain:firefighter",
      forceRealAi: meta?.forceRealAi,
    })
    if (typeof out !== "string") throw new Error("Expected JSON string, got tool call")
    const result = JSON.parse(out)
    return {
      content: result.response.replace(/\*\*/g, ''),
      crisisResolved: result.resolved
    }
  } catch (e) {
    console.error("Erreur parsing Pompier:", e)
    return {
      content: "Je suis là. On fait simple: tu préfères A) vider ce qui te pèse (2 minutes) ou B) un micro-plan pour les 10 prochaines minutes ?",
      crisisResolved: false
    }
  }
}
