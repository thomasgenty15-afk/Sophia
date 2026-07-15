import { generateWithGemini, getGlobalAiModel } from "./gemini.ts";

export type PotionSupportFocusKind =
  | "unresolved_thread"
  | "progress"
  | "baseline";

export type PotionSupportFocusFreshness = "fresh" | "carried";

export type PotionSupportFocusContinuity =
  | "new_thread"
  | "evolved_thread"
  | "same_thread";

export type PotionSupportVisibleTask = {
  kind: "potion_support_opening";
  day_index: number;
  focus: {
    kind: PotionSupportFocusKind;
    text: string;
    freshness: PotionSupportFocusFreshness;
    continuity: PotionSupportFocusContinuity;
  };
  progress_facts: Array<{ text: string }>;
  continuity: {
    /** Continuity aid only. These sentences are not eligible factual input. */
    previous_openings: string[];
  };
};

export type PotionSupportVisibleAgentResult = {
  opening_text: string;
  question_text: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, max: number): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function parseVisibleResult(
  raw: unknown,
): PotionSupportVisibleAgentResult | null {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(
        raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim(),
      );
    } catch {
      return null;
    }
  }
  if (!isRecord(parsed)) return null;
  const openingText = cleanText(parsed.opening_text, 520);
  if (!openingText) return null;
  return {
    opening_text: openingText,
    question_text: cleanText(parsed.question_text, 280) || null,
  };
}

const SYSTEM_PROMPT = [
  "Tu es l'agent visible qui rédige une ouverture proactive de soutien émotionnel pour Sophia.",
  "Le reducer en amont a déjà choisi le focus et les faits de progrès autorisés. Tu ne changes pas cette décision.",
  "Écris comme une présence humaine sobre et attentive, en français naturel, en 1 à 3 phrases.",
  "Le message peut reconnaître un progrès puis rester centré sur le focus. Pose au maximum une question réellement utile.",
  "N'ajoute aucun fait, état émotionnel, événement, résultat, intention, diagnostic, conseil, technique ou proposition de produit absent de focus/progress_facts.",
  "previous_openings sert uniquement à éviter une répétition de formulation. N'en réutilise jamais le contenu comme fait.",
  "Ne mentionne ni potion, ni flow, ni mémoire, ni preuve, ni contexte interne.",
  "Réponds uniquement en JSON: {opening_text, question_text}. question_text vaut null s'il n'y a pas de question.",
].join("\n");

export async function renderPotionSupportOpening(input: {
  task: PotionSupportVisibleTask;
  userId: string;
  requestId?: string;
  runner?: (systemPrompt: string, userPrompt: string) => Promise<unknown>;
}): Promise<PotionSupportVisibleAgentResult | null> {
  const userPrompt = JSON.stringify(input.task);
  const raw = input.runner
    ? await input.runner(SYSTEM_PROMPT, userPrompt)
    : await generateWithGemini(
      SYSTEM_PROMPT,
      userPrompt,
      0.45,
      true,
      [],
      "auto",
      {
        requestId: input.requestId,
        userId: input.userId,
        source: "potion-support-visible-agent-v1",
        model: getGlobalAiModel("gemini-2.5-flash"),
        maxRetries: 1,
        httpTimeoutMs: 20_000,
      },
    );
  return parseVisibleResult(raw);
}
