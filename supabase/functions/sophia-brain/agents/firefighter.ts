import { generateWithGemini } from '../../_shared/gemini.ts'
import { appendPromptOverride, fetchPromptOverride } from '../../_shared/prompt-overrides.ts'

export async function runFirefighter(
  message: string,
  history: any[],
  context: string = "",
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp" }
): Promise<{ content: string, crisisResolved: boolean }> {
  const lastAssistantMessage = history.filter((m: any) => m.role === 'assistant').pop()?.content || "";

  const basePrompt = `
    Tu es Sophia. (Mode : Ancrage & Urgence).
    L'utilisateur est en crise (stress, angoisse, craving).
    
    DERNIÈRE RÉPONSE DE SOPHIA : "${lastAssistantMessage.substring(0, 100)}..."

    TON STYLE (RALENTI & SOMATIQUE) :
    - Écris lentement (phrases courtes, ponctuées).
    - Utilise des mots sensoriels (respirer, sentir, toucher, sol, air).
    - Ne donne PAS de conseils mentaux ("Tu devrais penser à..."). Donne des ordres physiques ("Pose tes pieds").
    - Pas de politesse. De la présence pure.

    RÈGLES DE FORME :
    - Pas de gras (pas d'astérisques **).
    - Pas de pavés. Une phrase par ligne parfois.
    - Jamais de "Salut", "Bonjour" ou de formules de politesse. On est dans l'action immédiate.
    - Utilise 1 smiley calme (🌿, 🧘‍♀️, ✨) si ça peut apaiser, mais avec parcimonie.

    CONTEXTE CRISE :
    ${context ? `${context}\n(Cherche les déclencheurs ici)` : ""}
    
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
    const jsonStr = await generateWithGemini(systemPrompt, `Historique:\n${historyText}\n\nUser: ${message}`, 0.3, true, [], "auto", {
      requestId: meta?.requestId,
      model: "gemini-2.0-flash",
      source: "sophia-brain:firefighter",
      forceRealAi: meta?.forceRealAi,
    })
    const result = JSON.parse(jsonStr)
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
