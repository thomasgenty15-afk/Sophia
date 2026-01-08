import { generateWithGemini } from '../../_shared/gemini.ts'
import { appendPromptOverride, fetchPromptOverride } from '../../_shared/prompt-overrides.ts'

function looksLikeGuidedTextRequest(message: string): boolean {
  const m = (message ?? "").toString().toLowerCase()
  // User explicitly asks for a "text/script" to help calm down.
  return /\b(texte|script|guid(?:e|é)|respiration\s+guid(?:e|é)e|exercice|mini[-\s]?texte|petit\s+texte|lis[-\s]?moi|lire|écris[-\s]?moi)\b/i
    .test(m)
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

  const basePrompt = `
    Tu es Sophia. (Mode : Ancrage & Urgence).
    L'utilisateur est en crise (stress, angoisse, craving).
    
    DERNIÈRE RÉPONSE DE SOPHIA : "${lastAssistantMessage.substring(0, 100)}..."

    OBJECTIF :
    - Calmer en restant SIMPLE, concret, question-led.
    - Pas de "poème" / phrases isolées en cascade.

    TON STYLE (SOBRE & SOMATIQUE) :
    - Phrases courtes et naturelles (pas de style poétique).
    - Utilise des mots sensoriels (respirer, sentir, toucher, sol, air).
    - Zéro conseil mental ("tu devrais penser à..."). Priorise un micro-geste physique + une question simple.
    - Tutoiement. Pas de salutations.

    FORMAT PAR DÉFAUT (si l'utilisateur n'a PAS demandé de texte guidé) :
    - 2 à 4 lignes MAX. Pas de lignes vides.
    - Pas de séquence type "Inspire. Expire." en mode mantra.
    - Pose 1 à 2 questions maximum, très simples, pour reprendre du contrôle (ex: "Tu es en sécurité là, maintenant ? (oui/non)", "Sur 0–10, c'est à combien ?").
    - Tu peux proposer UNE option : "Je peux te lire/écrire un mini-texte guidé (30s). Tu veux ?"

    MODE TEXTE GUIDÉ (UNIQUEMENT si l'utilisateur l'a demandé explicitement, ou s'il vient de dire oui) :
    - Tu as le droit d'écrire un texte guidé court (max ~10 lignes), mais reste simple et concret (pas de poésie).
    - Commence par une question de sécurité ("Tu es en sécurité là, maintenant ?").
    - Puis donne 3 à 5 étapes claires (respiration / ancrage).

    RÈGLES DE FORME :
    - Pas de gras (pas d'astérisques **).
    - Pas de pavés.
    - Jamais de "Salut", "Bonjour" ou de formules de politesse.
    - Pas d'emoji par défaut.

    CONTEXTE CRISE :
    ${context ? `${context}\n(Cherche les déclencheurs ici)` : ""}

    IMPORTANT :
    - allow_guided_text = ${allowGuidedText ? "true" : "false"}
    - Si allow_guided_text = false, respecte STRICTEMENT le FORMAT PAR DÉFAUT.
    - Si allow_guided_text = true, utilise le MODE TEXTE GUIDÉ.
    
    IMPORTANT - DÉTECTION DE FIN DE CRISE :
    À la fin de ta réponse, tu dois évaluer si la crise semble passée.
    Si l'utilisateur dit "ça va mieux", "merci", "je suis plus calme", considère que c'est résolu.
    
    SORTIE JSON ATTENDUE :
    {
      "response": "Le texte de ta réponse à l'utilisateur.",
      "resolved": true/false
    }
  `
  const override = await fetchPromptOverride("sophia.firefighter")
  const systemPrompt = appendPromptOverride(basePrompt, override)

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
      content: "Je suis là. Respire avec moi. Inspire... Expire...",
      crisisResolved: false
    }
  }
}
