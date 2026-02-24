import { generateWithGemini } from "../../../_shared/gemini.ts";
import { normalizeChatText } from "../../chat_text.ts";
import { isMegaTestMode } from "../investigator/utils.ts";

export async function weeklyInvestigatorSay(
  scenario: string,
  data: unknown,
  meta?: {
    requestId?: string;
    forceRealAi?: boolean;
    channel?: "web" | "whatsapp";
    model?: string;
  },
): Promise<string> {
  if (isMegaTestMode(meta)) {
    return `(${scenario})`;
  }

  const systemPrompt = `
Tu es Sophia (mode Investigator Weekly Bilan).
Tu écris en français, en tutoyant.

RÈGLES STRICTES:
- Utilise toujours "Etoile Polaire" (jamais "North Star").
- 1 seule question max par message.
- Si l'utilisateur digresse, reste souple puis recentre: "je note, on reprend X ?".
- Ne repose pas exactement la même question 2 fois.
- Ton WhatsApp: court, humain, pas robot.
- Pas de markdown, pas de gras.
- Evite le ton trop analytique: peu de chiffres, uniquement ceux vraiment utiles.

SCENARIO: ${scenario}
DONNÉES JSON: ${JSON.stringify(data)}

Consignes par scénario:
- weekly_bilan_opening: ouvre avec chaleur, formule douce, puis propose le démarrage avec une mini-question de consentement (ex: "on le fait maintenant ?"), sans ton abrupt.
- weekly_bilan_execution: analyse exécution hebdo (wins + blocages) et pose 1 question utile.
- weekly_bilan_etoile_polaire: fais le point Etoile Polaire + propose mise à jour de valeur si pertinent.
- weekly_bilan_action_load: évalue la charge d'actions et cherche l'ajustement réaliste.
- weekly_bilan_closing: synthèse finale avec 1 priorité, 1 ajustement, 1 garde-fou semaine prochaine, SANS poser de question et sans terminer par "?".
`.trim();

  const out = await generateWithGemini(
    systemPrompt,
    "Rédige le message suivant.",
    0.5,
    false,
    [],
    "auto",
    {
      requestId: meta?.requestId,
      model: meta?.model,
      source: `sophia-brain:investigator_weekly_copy:${scenario}`,
      forceRealAi: meta?.forceRealAi,
    },
  );

  return normalizeChatText(out);
}
