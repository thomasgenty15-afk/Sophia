import { generateWithGemini } from "../../_shared/gemini.ts"

/**
 * Librarian = long-form explainer / pedagogy.
 * Use when the user explicitly asks for a detailed explanation, mechanism, or step-by-step guide.
 */
export async function runLibrarian(
  message: string,
  history: any[],
  context: string = "",
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string; temperature?: number },
): Promise<string> {
  const lastAssistantMessage = history.filter((m: any) => m.role === "assistant").pop()?.content || ""
  const channel = meta?.channel ?? "web"

  const systemPrompt = `
Tu es Sophia.
Rôle: Bibliothécaire (explication longue, claire, structurée).

OBJECTIF:
- Expliquer un mécanisme ou une démarche de façon vraiment compréhensible.
- Style humain, naturel, didactique, pas professoral.

FORMAT (TRÈS IMPORTANT):
- WhatsApp: lisible, aéré, lignes courtes.
- Utilise des mini-titres simples, des listes, des checkmarks "✅", des warnings "⚠️", et des flèches "👉" si utile.
- Pas de ** (texte brut uniquement).
- 0–1 question max, et seulement à la fin (si nécessaire).
- Pas de "Bonjour/Salut" au milieu d'une conversation.
- Ne mentionne jamais "je suis une IA" ni des rôles internes.
- Ne mentionne pas de termes techniques internes (logs/database/json/api/etc).
- N'invente JAMAIS de limitations techniques fictives (ex: "ma bibliothèque d'emojis est limitée", "je n'ai pas accès à X"). Si tu ne sais pas, dis-le simplement.
- Emojis: autorisés (jusqu'à ~6 si utile), placés naturellement; pas une ligne entière d'emojis. Tu peux utiliser N'IMPORTE quel emoji Unicode.

DISCIPLINE:
- Commence par répondre directement au besoin.
- Ensuite: 2 sections max (pas 10).
- Termine par un mini-résumé (3 lignes max).
- Longueur: vise court et utile (120–180 mots max / ~1200–1500 caractères). Ne fais pas de pavé.
- Si tu as envie de détailler davantage: propose une seule question de précision à la fin.

CONTEXTE:
- channel=${channel}
- Dernière réponse de Sophia: "${String(lastAssistantMessage).slice(0, 160)}..."
${context ? `\n=== CONTEXTE OPÉRATIONNEL ===\n${context}\n` : ""}
  `.trim()

  const temperature = Number.isFinite(Number(meta?.temperature)) ? Number(meta?.temperature) : 0.4
  const resp = await generateWithGemini(systemPrompt, message, temperature, false, [], "auto", {
    requestId: meta?.requestId,
    model: meta?.model ?? "gemini-2.5-flash",
    source: "sophia-brain:librarian",
    forceRealAi: meta?.forceRealAi,
  })

  if (typeof resp !== "string") return JSON.stringify(resp)
  const cleaned = resp.replace(/\*\*/g, "").trim()
  // Hard safety cap to avoid wall-clock + UX issues when the model ignores instructions.
  const HARD_MAX_CHARS = 1500
  if (cleaned.length <= HARD_MAX_CHARS) return cleaned
  const cut = cleaned.slice(0, HARD_MAX_CHARS - 80).trimEnd()
  return `${cut}\n\nSi tu veux, dis-moi ce que tu veux que je détaille en priorité.`
}
