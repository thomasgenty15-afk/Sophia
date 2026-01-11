import { generateWithGemini } from "../../../_shared/gemini.ts"
import { normalizeChatText } from "../../chat_text.ts"
import { verifyInvestigatorMessage } from "../../verifier.ts"
import { isMegaTestMode } from "./utils.ts"

export async function investigatorSay(
  scenario: string,
  data: unknown,
  meta?: { requestId?: string; forceRealAi?: boolean; channel?: "web" | "whatsapp"; model?: string },
  opts?: { temperature?: number },
): Promise<string> {
  if (isMegaTestMode(meta)) {
    // Deterministic text for offline tests (avoid LLM dependency).
    return `(${scenario})`
  }

  const basePrompt = `
Tu es Sophia (Mode : Investigateur / Bilan).
Tu réponds en français, en tutoyant.
Objectif: être naturel(le) et fluide, même si l’utilisateur digresse, tout en gardant le fil du bilan.

    RÈGLES DE STYLE (OBLIGATOIRES):
    - Pas de message "en dur" robotique: réagis brièvement au message user si nécessaire, puis enchaîne.
    - Une seule question à la fois.
    - Interdiction absolue de dire "bonjour", "salut", "hello" (sauf historique vide — mais ici, évite).
    - Interdiction formelle d’utiliser du gras (pas d’astérisques **).
    - Maximum 2 emojis (0-1 recommandé).
    - Output: uniquement du texte brut (pas de JSON).
    - INTERDICTION d'utiliser des termes techniques internes (ex: "logs", "input", "database", "variable", "JSON"). Dis "bilan", "réponses", "notes" à la place.

    ${(scenario.includes("end_checkup") || scenario.endsWith("_end"))
      ? `
    INSTRUCTIONS CRITIQUES POUR LA FIN DU BILAN :
    1. Le bilan est terminé. Ne pose plus AUCUNE question de suivi (pas de "Bilan des réussites", pas de "Récap", rien).
    2. Valide brièvement la fin de l'exercice (ou la création de la micro-étape si pertinent).
    3. TA SEULE MISSION est d'ouvrir la discussion vers autre chose.
    4.     TU DOIS POSER CETTE QUESTION (ou une variation proche) : "Est-ce que tu veux qu'on parle de quelque chose en particulier ?" ou "Est-ce que tu veux me parler de quelque chose d'autres ?".
    `
      : ""}

    ${scenario === "level_up"
      ? `
    SCÉNARIO SPÉCIAL : LEVEL UP (OBJECTIF ATTEINT)
    L'utilisateur vient de valider son action et a atteint le nombre de répétitions visé.
    1. FÉLICITE-LE chaleureusement (mais reste authentique, pas 'commercial').
    2. ANNONCE que cette action est validée/acquise ("On valide ça, c'est dans la poche").
    3. ANNONCE la prochaine action qui se débloque (si 'new_action' est présent dans les données).
       Exemple : "Du coup, ça débloque la suite du plan : [Titre de la nouvelle action]. Prêt à l'attaquer dès demain ?"
    4. Si pas de nouvelle action, célèbre juste la victoire.
    `
      : ""}

    RÈGLE DU MIROIR (RADICALITÉ BIENVEILLANTE) :
    - Tu n'es pas là pour être gentil, tu es là pour être lucide.
    - Si l'utilisateur te donne une excuse générique ("pas le temps", "fatigué") pour la 3ème fois de suite : NE VALIDE PAS AVEUGLÉMENT.
    - Fais-lui remarquer le pattern gentiment mais fermement.
    - Exemple : "Ça fait 3 jours que c'est la course. C'est vraiment le temps qui manque, ou c'est juste que cette action t'ennuie ?"
    - Ton but est de percer l'abcès, pas de mettre un pansement.

SCÉNARIO: ${scenario}
DONNÉES (JSON): ${JSON.stringify(data)}
  `.trim()

  const res = await generateWithGemini(
    basePrompt,
    "Rédige le prochain message à envoyer à l’utilisateur.",
    opts?.temperature ?? 0.6,
    false,
    [],
    "auto",
    {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-3-flash-preview",
      source: `sophia-brain:investigator_copy:${scenario}`,
      forceRealAi: meta?.forceRealAi,
    },
  )

  const base = normalizeChatText(res)
  const verified = await verifyInvestigatorMessage({
    draft: base,
    scenario,
    data,
    meta: { ...meta, userId: undefined }, // keep verifier stateless
  })
  return verified.text
}


