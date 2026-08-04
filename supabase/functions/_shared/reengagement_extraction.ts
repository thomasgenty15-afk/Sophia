// Chantier réengagement (2026-07-19) — phase 3.
// Extraction post-clôture de la raison du décrochage : un prompt dédié relit
// le transcript complet de l'épisode À FROID (passe cron rejouable), jamais
// le dispatcher live. Principe « comprendre ≠ labelliser » : le flow converse
// et agit, l'extracteur classe. Tout ce qui sort du LLM est coercé en
// default-deny (catégorie hors taxonomie → other/low).

export const REENGAGEMENT_REASON_CATEGORIES = [
  "time",
  "energy",
  "forgetfulness",
  "clarity",
  "action_fit",
  "motivation",
  "emotion",
  "context",
  "other",
] as const;

export type ReengagementReasonCategory =
  typeof REENGAGEMENT_REASON_CATEGORIES[number];

export type ReengagementReasonConfidence = "low" | "medium" | "high";

export interface ReengagementExtractionResult {
  reason_category: ReengagementReasonCategory;
  reason_confidence: ReengagementReasonConfidence;
  reason_user_words: string | null;
  episode_summary: string | null;
  solution_accepted: boolean | null;
}

export interface ReengagementTranscriptTurn {
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ReengagementEpisodeFacts {
  days_inactive_at_open: number;
  replied_at_step: number | null;
  exit_status: string | null;
  solution_offered: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value: unknown, max = 2000): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Transcript compact injecté dans le prompt (borné pour tenir le budget). */
export function formatReengagementTranscript(
  turns: ReengagementTranscriptTurn[],
  maxTurns = 40,
): string {
  return turns
    .slice(-maxTurns)
    .map((turn) => {
      const speaker = turn.role === "user" ? "USER" : "SOPHIA";
      return `${speaker}: ${cleanText(turn.content, 600)}`;
    })
    .join("\n");
}

export function buildReengagementExtractionPrompt(args: {
  transcript: string;
  facts: ReengagementEpisodeFacts;
}): { system: string; user: string } {
  const system = [
    "Tu es un analyste. Tu relis une conversation WhatsApp entre Sophia (coach de transformation personnelle) et un utilisateur qui avait décroché de son plan (plusieurs jours sans activité), puis a répondu à un message de relance.",
    "Ta seule tâche : extraire pourquoi il a décroché, dans une taxonomie fermée, avec un résumé réutilisable. Tu ne juges pas, tu n'inventes rien : si la raison n'est pas exprimée dans la conversation, tu réponds other avec confidence low.",
    "",
    "Taxonomie reason_category (choisis LA dominante) :",
    "- time : pas le temps, emploi du temps débordé, imprévus ponctuels.",
    "- energy : fatigue, épuisement, charge physique/mentale.",
    "- forgetfulness : il n'y pense pas, oublie, l'habitude n'est pas installée.",
    "- clarity : il ne sait plus quoi faire, plan ou fonctionnement flou.",
    "- action_fit : les actions ne lui parlent plus, trop grosses, plus pertinentes.",
    "- motivation : perte d'élan, de sens, découragement sur l'objectif.",
    "- emotion : état émotionnel difficile (stress, tristesse, anxiété…).",
    "- context : la vie a changé (déménagement, maladie, événement familial…).",
    "- other : rien d'exprimé ou rien qui rentre dans les cases.",
    "",
    "Réponds UNIQUEMENT en JSON strict :",
    "{",
    '  "reason_category": "<une des 9 valeurs>",',
    '  "reason_confidence": "low" | "medium" | "high",',
    '  "reason_user_words": "<1 à 3 citations exactes de l\'utilisateur qui portent la raison, ou null>",',
    '  "episode_summary": "<3-4 phrases max, en français : pourquoi il a décroché, ce qui a été proposé, comment il a réagi. Rédigé pour être relu tel quel par Sophia au prochain décrochage>",',
    '  "solution_accepted": true | false | null',
    "}",
    "",
    "solution_accepted : true si l'utilisateur a clairement accepté ce qui lui a été proposé (ajustement, carte, pause, reprise), false s'il a esquivé ou décliné, null si rien n'a été proposé ou si c'est indécidable.",
    "reason_confidence : high seulement si l'utilisateur a exprimé la raison explicitement ; medium si elle est fortement implicite ; low sinon.",
  ].join("\n");

  const factsLines = [
    `Jours d'inactivité au déclenchement : ${args.facts.days_inactive_at_open}`,
    `A répondu à la relance n° : ${args.facts.replied_at_step ?? "aucune (retour spontané)"}`,
    `Fin d'épisode côté système : ${args.facts.exit_status ?? "inconnue"}`,
    `Solution proposée côté système : ${args.facts.solution_offered ?? "aucune"}`,
  ].join("\n");

  const user = [
    "=== FAITS SYSTÈME ===",
    factsLines,
    "",
    "=== CONVERSATION ===",
    args.transcript || "(aucun message)",
    "",
    "Extrais le JSON.",
  ].join("\n");

  return { system, user };
}

/**
 * Parse défensif de la sortie LLM. Tout ce qui est invalide dégrade sans
 * jamais lever : catégorie hors taxonomie → other, confidence invalide → low,
 * textes bornés, solution_accepted non booléen → null.
 */
export function parseReengagementExtractionOutput(
  raw: unknown,
): ReengagementExtractionResult {
  const fallback: ReengagementExtractionResult = {
    reason_category: "other",
    reason_confidence: "low",
    reason_user_words: null,
    episode_summary: null,
    solution_accepted: null,
  };

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const text = raw.trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    try {
      parsed = JSON.parse(text);
    } catch {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          parsed = JSON.parse(text.slice(start, end + 1));
        } catch {
          return fallback;
        }
      } else {
        return fallback;
      }
    }
  }
  if (!isRecord(parsed)) return fallback;

  const categoryRaw = cleanText(parsed.reason_category, 40).toLowerCase();
  const category = (REENGAGEMENT_REASON_CATEGORIES as readonly string[])
      .includes(categoryRaw)
    ? categoryRaw as ReengagementReasonCategory
    : "other";

  const confidenceRaw = cleanText(parsed.reason_confidence, 20).toLowerCase();
  let confidence: ReengagementReasonConfidence =
    confidenceRaw === "high" || confidenceRaw === "medium"
      ? confidenceRaw
      : "low";
  // Une catégorie retombée en other par coercition ne peut pas prétendre à
  // une confiance élevée.
  if (category === "other" && categoryRaw !== "other") confidence = "low";

  const userWords = cleanText(parsed.reason_user_words, 500);
  const summary = cleanText(parsed.episode_summary, 1200);

  return {
    reason_category: category,
    reason_confidence: confidence,
    reason_user_words: userWords || null,
    episode_summary: summary || null,
    solution_accepted: typeof parsed.solution_accepted === "boolean"
      ? parsed.solution_accepted
      : null,
  };
}
