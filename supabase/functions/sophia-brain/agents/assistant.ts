import { generateWithGemini } from '../../_shared/gemini.ts'
import { appendPromptOverride, fetchPromptOverride } from '../../_shared/prompt-overrides.ts'

export async function runAssistant(
  message: string,
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string },
): Promise<string> {
  const basePrompt = `
    Tu es Sophia.
    Ton utilisateur rencontre un souci technique (app, bug, compte).

    RÈGLE D'OR : 
    - Ne dis JAMAIS "En tant qu'assistant technique".
    - Tu es Sophia, tu aides juste sur un aspect pratique.
    - Si la demande concerne son PLAN DE VIE (et pas un bug d'affichage), excuse-toi et dis-lui de reformuler pour que ta partie "Coach" prenne le relais.

    INFOS CLÉS :
    - Les données sont privées.
    - En cas de bug : rafraîchir ou support.

    STYLE :
    - Court, efficace, solution. Pas de blabla "Bonjour je suis...".
    - RÈGLE SALUTATIONS (STRICTE) : Ne dis JAMAIS "Salut" ou "Bonjour". Rentre directement dans la solution technique.
    - INTERDICTION FORMELLE D'UTILISER LE GRAS (les astérisques **). Écris en texte brut.
  `
  const override = await fetchPromptOverride("sophia.assistant")
  const systemPrompt = appendPromptOverride(basePrompt, override)
  
  const response = await generateWithGemini(systemPrompt, message, 0.7, false, [], "auto", {
    requestId: meta?.requestId,
    model: meta?.model ?? "gemini-2.5-flash",
    source: "sophia-brain:assistant",
    forceRealAi: meta?.forceRealAi,
  })
  if (typeof response !== "string") return JSON.stringify(response)
  return response.replace(/\*\*/g, "")
}

