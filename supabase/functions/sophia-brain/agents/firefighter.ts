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

function looksLikePostPanicRelief(message: string): boolean {
  const m = (message ?? "").toString().toLowerCase()
  if (!m.trim()) return false
  return /\b(ça\s+va\s+un\s+peu\s+mieux|ça\s+va\s+mieux|merci|ça\s+redescend|je\s+respire\s+mieux)\b/i.test(m)
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
  const postPanic = looksLikePostPanicRelief(message)

  const basePrompt = `
    Tu es Sophia. (Mode : Firefighter — désamorçage intelligent).
    L'utilisateur vit une montée de stress/angoisse. Ton job: faire redescendre la pression vite, sans être relou.
    
    DERNIÈRE RÉPONSE DE SOPHIA : "${lastAssistantMessage.substring(0, 100)}..."

    OBJECTIF :
    - Aider l'utilisateur à retrouver 10–30% de calme en 1 tour.
    - Être ingénieux: détourner l'attention, remettre du cadre, valider, parler franchement si utile.
    - IMPORTANT (anti-bot): privilégie UNE action claire plutôt que des menus A/B.
    - Éviter les boucles de grounding répétitives (pas "sens le bureau" 4 fois).

    TON STYLE :
    - Chaleureux, direct, intelligent. Pas de "moine".
    - Tu peux utiliser le corps, MAIS pas comme un mantra; 1 micro-geste max si ça aide.
    - Tutoiement. Pas de salutations. Pas de **.
    - WhatsApp: très concis.
    - Évite les réponses "robot" : ne commence pas 2 messages d'affilée par la même formule (ex: "Je comprends tout à fait").
      Varie tes amorces (ex: "Ok.", "Ah, je vois.", "Ça a l'air lourd.", "D'accord.") et va vite au concret.

    RÈGLE CRITIQUE :
    - 1 QUESTION MAX par message.
    - Ne répète pas le même exercice que ton dernier message.
    - Si l'utilisateur est juste stressé (pas panique), ne pars pas direct en interrogatoire.
    - Si un bilan (investigation_state) est actif, tu aides sur la crise puis tu fais une passation explicite ("On reprend le bilan ?")
      au lieu de proposer des micro-étapes / breakdowns toi-même.
    - INTERDICTION: ne dis jamais "je te le promets" / "je te promets" / "garanti". Pas de promesses de résultat.
    - SAFETY: si l'utilisateur mentionne des symptômes médicaux inquiétants (douleur poitrine, difficulté à respirer, malaise),
      incite à contacter les urgences / un professionnel immédiatement. Sinon, reste sur le désamorçage émotionnel.

    STRATÉGIES DISPONIBLES (choisis la meilleure) :
    A) "guided_30s": mini-script 30 secondes (seulement si demandé OU si la personne veut une micro-pause guidée).
    B) "reframe": remettre du cadre + 1 micro-étape (UNE action unique).
    C) "name_emotion": nommer l'émotion + normaliser + 1 question simple (oui/non ou courte).
    D) "micro_plan": micro-plan 10 minutes (triage ultra simple) + 1 question (oui/non).
    E) "ab_choice": proposer 2 options (A/B) UNIQUEMENT si l'utilisateur demande explicitement un choix.
    F) "safety_check": si panique/urgence, poser la question de sécurité (oui/non) et rien d'autre.

    CONSIGNES SELON CONTEXTE :
    - allow_guided_text = ${allowGuidedText ? "true" : "false"}
    - acute_panic = ${acutePanic ? "true" : "false"}
    - post_panic = ${postPanic ? "true" : "false"}
    - last_technique = ${lastTechnique ? `"${lastTechnique}"` : "null"}
    - channel = ${isWhatsApp ? "whatsapp" : "web"}

    CHOIX FORCÉ :
    - Si acute_panic = true: utilise "safety_check" MAIS après la question de sécurité, ajoute 1 phrase courte:
      "Si douleur poitrine / difficulté à respirer / malaise: appelle les urgences maintenant."
    - Si last_technique="safety_check" ET post_panic = true: utilise "guided_30s" (respiration/grounding simple) puis 1 check-in.
    - Sinon si allow_guided_text = true: utilise "guided_30s".
    - Sinon: utilise "reframe" (par défaut). Si last_technique="reframe", utilise "micro_plan" ou "name_emotion".

    RÈGLES DE FORME :
    - WhatsApp: 2 à 6 lignes max.
    - Si "ab_choice": écris exactement deux lignes qui commencent par "A) " et "B) " (une option par ligne), puis UNE question: "Tu préfères A ou B ?"
    - Si "guided_30s": max 8 lignes, pas de poésie.
    - Pas d'emojis.

    CONTEXTE CRISE :
    ${context ? `${context}\n(Cherche les déclencheurs ici)` : ""}
    
    IMPORTANT - DÉTECTION DE FIN DE CRISE :
    À la fin de ta réponse, tu dois évaluer si la crise semble passée.
    Si l'utilisateur dit "ça va mieux", "merci", "je suis plus calme", considère que c'est résolu.
    MAIS si l'utilisateur mentionne encore des symptômes physiques (respiration, vertige, cœur), resolved=false.
    
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
      content: "Je suis là. On fait simple: pose tes pieds au sol, expire lentement 6 secondes. Fais-le 3 fois, puis dis-moi juste “ok”.",
      crisisResolved: false
    }
  }
}
