import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../_shared/gemini.ts";

export type StaleBilanDecision =
  | "resume_bilan"
  | "stop_for_today"
  | "other_topic";

export async function classifyStaleBilanResponse(params: {
  userMessage: string;
  lastAssistantMessage: string;
  history: Array<{ role?: string; content?: string }>;
  requestId?: string;
  userId?: string | null;
}): Promise<StaleBilanDecision> {
  const text = String(params.userMessage ?? "").trim();
  if (!text) return "other_topic";

  const recentContext = params.history.slice(-4).map((m) =>
    `${m.role === "assistant" ? "SOPHIA" : "USER"}: ${
      String(m.content ?? "").trim()
    }`
  ).join("\n");

  const systemPrompt = [
    "Tu classes la réponse d'un utilisateur à un bilan quotidien WhatsApp resté en pause plus de 4 heures.",
    "Le bilan était en cours plus tôt, mais il a expiré.",
    "Tu dois choisir UNE seule décision parmi :",
    '- "resume_bilan" : l\'utilisateur veut clairement reprendre le bilan maintenant',
    '- "stop_for_today" : l\'utilisateur dit non, veut reporter, arrêter, ou reprendre demain/plus tard',
    "- \"other_topic\" : l'utilisateur parle d'autre chose, pose une question différente, ou change de sujet",
    "",
    "Règles importantes :",
    "- Si l'utilisateur veut reprendre plus tard, demain, ou n'est pas dispo maintenant => stop_for_today.",
    "- Si l'utilisateur envoie un vrai nouveau sujet sans parler du bilan => other_topic.",
    "- N'utilise resume_bilan que si l'intention de reprendre le bilan maintenant est claire.",
    "",
    "Dernier message de Sophia :",
    params.lastAssistantMessage || "(vide)",
    "",
    "Contexte récent :",
    recentContext || "(vide)",
    "",
    'Réponds UNIQUEMENT en JSON valide: {"decision":"resume_bilan"|"stop_for_today"|"other_topic"}',
  ].join("\n");

  try {
    const raw = await generateWithGemini(
      systemPrompt,
      `Message utilisateur: "${text}"`,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: params.requestId,
        userId: params.userId ?? undefined,
        model: getGlobalAiModel(),
        source: "bilan_stale_classify",
        forceRealAi: true,
      },
    );
    const cleaned = String(raw ?? "")
      .replace(/```json?\s*/gi, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    const decision = String(parsed?.decision ?? "").trim();
    if (
      decision === "resume_bilan" ||
      decision === "stop_for_today" ||
      decision === "other_topic"
    ) {
      return decision;
    }
  } catch (e) {
    console.warn(
      "[Router] stale bilan classification failed:",
      e,
    );
  }

  return "other_topic";
}
