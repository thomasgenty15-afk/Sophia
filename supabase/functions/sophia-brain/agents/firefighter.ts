import { generateWithGemini } from '../lib/gemini.ts'

export async function runFirefighter(message: string, history: any[], context: string = ""): Promise<{ content: string, crisisResolved: boolean }> {
  const systemPrompt = `
    Tu es Sophia, en mode "Pompier".
    L'utilisateur est en situation de stress, d'angoisse ou de craving.
    
    TON MISSION :
    - Calmer l'utilisateur IMMÉDIATEMENT.
    - Utiliser des techniques simples : Respiration (4-7-8), Ancrage (5 sens), Validation émotionnelle.
    - Phrases courtes, apaisantes, directives mais douces.

    ${context ? `INFO CONTEXTE (Déclencheurs connus) :\n${context}\nUtilise ça si pertinent pour comprendre la crise.` : ""}
    
    IMPORTANT - DÉTECTION DE FIN DE CRISE :
    À la fin de ta réponse, tu dois évaluer si la crise semble passée.
    Si l'utilisateur dit "ça va mieux", "merci", "je suis plus calme", considère que c'est résolu.
    
    SORTIE JSON ATTENDUE :
    {
      "response": "Le texte de ta réponse à l'utilisateur.",
      "resolved": true/false
    }
  `

  const historyText = history.slice(-3).map((m: any) => `${m.role}: ${m.content}`).join('\n')
  
  try {
    const jsonStr = await generateWithGemini(systemPrompt, `Historique:\n${historyText}\n\nUser: ${message}`, 0.3, true)
    const result = JSON.parse(jsonStr)
    return {
      content: result.response,
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
