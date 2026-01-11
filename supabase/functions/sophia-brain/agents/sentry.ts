import { generateWithGemini } from "../../_shared/gemini.ts"

// SENTRY (Le Guetteur) - Safety escalation with a short, personalized message.
export async function runSentry(
  message: string,
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string },
): Promise<string> {
  const m = (message ?? "").toString().trim()

  const fallback =
    "Là, je veux pas prendre de risque.\n\n" +
    "Si tu as du mal à respirer, une douleur dans la poitrine, un malaise, ou si tu te sens en danger: appelle le 15 (SAMU) ou le 112 maintenant.\n\n" +
    "Si tu te sens en danger de te faire du mal: appelle le 3114 (Prévention Suicide) ou le 112.\n\n" +
    "Tu es seul là tout de suite ?"

  try {
    const systemPrompt = `
Tu es Sophia.
Contexte: situation potentiellement urgente (sécurité / santé / crise).

OBJECTIF:
- Donner une réponse TRÈS courte, TRÈS actionnable.
- Aider l'utilisateur à se mettre en sécurité et à contacter les secours si nécessaire.
- Ne pas diagnostiquer. Ne pas donner de posologie. Ne pas minimiser.

FORMAT:
- Français, tutoiement.
- Texte brut uniquement (pas de **).
- 4 à 8 lignes max.
- 1 question max à la fin.

RÈGLES:
- Si difficulté à respirer / douleur thoracique / malaise / réaction allergique sévère: recommande d'appeler 15 ou 112 maintenant.
- Si intention de suicide / automutilation: recommande 3114 ou 112 maintenant.
- Évite "je suis une IA".
  `.trim()

    const out = await generateWithGemini(systemPrompt, m || "Aide-moi.", 0.2, false, [], "auto", {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-2.5-flash",
      source: "sophia-brain:sentry",
      forceRealAi: meta?.forceRealAi,
    })
    if (typeof out !== "string" || !out.trim()) return fallback
    return out.replace(/\*\*/g, "").trim()
  } catch {
    return fallback
  }
}

