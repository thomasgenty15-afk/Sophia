import { generateWithGemini } from "../../../_shared/gemini.ts";

export type DailyOpeningResponseDecision =
  | "continue_bilan"
  | "unclear"
  | "cancel"
  | "stay_human";

function safeJsonParse(raw: unknown): any {
  const text = String(raw ?? "")
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function classifyDailyOpeningResponse(opts: {
  message: string;
  history: any[];
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string; channel?: "web" | "whatsapp" };
}): Promise<DailyOpeningResponseDecision> {
  const prompt = [
    "Tu classes la reponse de l'utilisateur a la premiere question large d'un bilan quotidien.",
    "Contexte: Sophia vient de demander globalement comment la journee s'est passee.",
    "Reponds UNIQUEMENT en JSON.",
    'Format: {"decision":"continue_bilan|unclear|cancel|stay_human"}',
    "Règles:",
    "- continue_bilan: la reponse peut nourrir normalement le bilan.",
    "- stay_human: la reponse est trop lourde/sensible/chargee emotionnellement pour continuer le bilan tout de suite; il faut d'abord rester humainement avec la personne.",
    "- cancel: l'utilisateur ne veut pas faire le bilan / veut arreter / reporter clairement.",
    "- unclear: impossible de savoir.",
    `channel=${JSON.stringify(opts.meta?.channel ?? "web")}`,
    `recent_history=${JSON.stringify((opts.history ?? []).slice(-10))}`,
    `user_message=${JSON.stringify(opts.message)}`,
  ].join("\n");

  try {
    const raw = await generateWithGemini(
      prompt,
      "Classe cette reponse d'ouverture du bilan quotidien.",
      0.1,
      true,
      [],
      "auto",
      {
        requestId: opts.meta?.requestId,
        model: opts.meta?.model,
        source: "sophia-brain:investigator_daily_opening_response_classifier",
        forceRealAi: opts.meta?.forceRealAi,
      },
    );
    const parsed = safeJsonParse(raw) ?? {};
    const decision = String(parsed?.decision ?? "").trim();
    if (
      decision === "continue_bilan" ||
      decision === "cancel" ||
      decision === "stay_human"
    ) {
      return decision;
    }
    return "unclear";
  } catch {
    return "continue_bilan";
  }
}
