import { VISIBLE_OUTPUT_STYLE_RULES } from "../../sophia-brain/router/response_style_policy.ts";

export type DailyActionReviewOpeningTarget = {
  title?: string | null;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

const FORBIDDEN_OPENING_PATTERNS = [
  /\bcarte\b/i,
  /\bpotion\b/i,
  /\bajust(e|er|ement)\b/i,
  /\bsolution\b/i,
  /\bprotocole\b/i,
  /\bd[eé]j[aà]\s+(fait|rat[eé]|not[eé]|report[eé])/i,
];

export function openingHasForbiddenDailyReviewCoaching(
  message: string,
): boolean {
  return FORBIDDEN_OPENING_PATTERNS.some((pattern) => pattern.test(message));
}

export function renderDailyActionReviewOpeningInstruction(
  targets: DailyActionReviewOpeningTarget[],
  options: { allowGreeting?: boolean } = {},
): string {
  const cleaned = targets
    .map((target, index) => ({
      index: index + 1,
      title: cleanText(target.title) || "Action",
      required_words: cleanText(target.title)
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .split(" ")
        .filter((token) => token.length >= 4)
        .slice(0, 4),
    }))
    .filter((target) => target.title);
  return [
    "Message WhatsApp de bilan daily action review.",
    VISIBLE_OUTPUT_STYLE_RULES,
    "Objectif: demander au user, naturellement, ce qui s'est passe pour les actions ciblees par current_focus_occurrence_ids.",
    "Tu dois poser une seule question principale et laisser le user repondre librement.",
    "Les actions ciblees sont des occurrences ouvertes a verifier maintenant: ne les presente jamais comme deja faites, deja notees, deja ratees ou deja reportees dans ce message d'ouverture.",
    "Le contexte recent peut aider le ton, mais il ne doit pas remplacer le check des targets courantes.",
    "Ne propose pas de solution, carte, potion, ajustement de plan ou coaching dans ce premier message.",
    "Ne dis pas que tu vas automatiquement reporter; tu peux seulement ouvrir la porte a comprendre si une action non faite reste utile.",
    'Ne force pas les mots "fait" ou "pas fait"; la reponse libre sera analysee ensuite.',
    "Varie fortement l'ouverture par rapport aux relances d'action recentes. Ne commence pas par 'Je repense a ton action' si une formule proche existe deja dans l'historique.",
    "Angle attendu: bilan du jour au moment present, pas relance du lendemain matin. Change le premier groupe de mots et le verbe d'accroche entre deux bilans.",
    options.allowGreeting
      ? "Comme aucune conversation recente n'a eu lieu, commence par une salutation courte et naturelle, variee, avant la question."
      : "Comme une conversation recente existe deja, ne commence pas par une salutation.",
    "Mentionne explicitement chaque action ciblee, mais sans format questionnaire lourd.",
    "Si une seule action est ciblee, fais une phrase directe et humaine.",
    "Si deux actions sont ciblees, reprends les deux titres exacts au moins une fois, puis formule la question naturellement.",
    "Si plusieurs actions sont ciblees, regroupe proprement et invite a repondre en une seule phrase.",
    cleaned.length > 1
      ? `Mots distinctifs a faire apparaitre dans la question: ${
        cleaned.map((target) =>
          `"${target.title}" -> ${target.required_words.join(", ")}`
        ).join(" ; ")
      }.`
      : "",
    "Ne mentionne aucune action qui n'est pas dans current_focus_occurrence_ids.",
    `Nombre d'actions ciblees: ${cleaned.length}.`,
    cleaned.length > 1
      ? `Actions a couvrir dans la question: ${
        cleaned.map((target) => `"${target.title}"`).join(" ; ")
      }.`
      : "",
  ].join("\n");
}
