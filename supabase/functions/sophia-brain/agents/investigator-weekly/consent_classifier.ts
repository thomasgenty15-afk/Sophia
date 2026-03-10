import { generateWithGemini } from "../../../_shared/gemini.ts";
import { resolveBinaryConsent } from "../investigator/utils.ts";

export type WeeklyConsentDecision = "go" | "unclear" | "cancel";

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

export async function classifyWeeklyStartConsent(opts: {
  message: string;
  history: any[];
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string };
}): Promise<WeeklyConsentDecision> {
  const binary = resolveBinaryConsent(opts.message);
  if (binary === "yes") return "go";
  if (binary === "no") return "cancel";

  const prompt = [
    "Tu classes la reponse d'un utilisateur a une proposition de lancer un bilan hebdomadaire maintenant.",
    "Reponds UNIQUEMENT en JSON.",
    'Format: {"decision":"go|unclear|cancel"}',
    "Règles:",
    "- go: l'utilisateur accepte de lancer le bilan maintenant, meme si c'est formule de facon naturelle.",
    "- cancel: l'utilisateur refuse, reporte clairement, ou veut parler d'autre chose a la place.",
    "- unclear: ce n'est pas assez clair pour decider.",
    `recent_history=${JSON.stringify((opts.history ?? []).slice(-8))}`,
    `user_message=${JSON.stringify(opts.message)}`,
  ].join("\n");

  try {
    const raw = await generateWithGemini(
      prompt,
      "Classe cette reponse de consentement.",
      0.1,
      true,
      [],
      "auto",
      {
        requestId: opts.meta?.requestId,
        model: opts.meta?.model,
        source: "sophia-brain:investigator_weekly_consent_classifier",
        forceRealAi: opts.meta?.forceRealAi,
      },
    );
    const parsed = safeJsonParse(raw) ?? {};
    const decision = String(parsed?.decision ?? "").trim();
    return decision === "go" || decision === "cancel" ? decision : "unclear";
  } catch {
    return "unclear";
  }
}
