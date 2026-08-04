import type { WeeklyReviewDecision } from "./contract.ts";
import type { WeeklyReviewEffectsResult } from "./effects.ts";

const INTERNAL_LABELS =
  /\bbridge_week\b|\bcarry_over\b|\brepeat_week\b|\blevel_review\b|\bplan_patch\b|\bitem_decision\b|\bnot_relevant\b|\boperation\b/iu;

function stripInternalLabels(text: string): string {
  return text
    .replace(/\bbridge_week\b/gi, "semaine allegee")
    .replace(/\bcarry_over\b/gi, "report")
    .replace(/\brepeat_week\b/gi, "refaire la meme semaine")
    .replace(/\blevel_review\b/gi, "revoir la forme du niveau")
    .replace(/\bplan_patch\b/gi, "proposition d'organisation")
    .replace(/\bitem_decision\b/gi, "decision sur l'action")
    .replace(/\bnot_relevant\b/gi, "pas assez adapte")
    .replace(/\boperation\b/gi, "ajustement");
}

function oneQuestionOnly(text: string): string {
  const firstQuestion = text.indexOf("?");
  if (firstQuestion < 0) return text;
  return text.slice(0, firstQuestion + 1) +
    text.slice(firstQuestion + 1).replace(/\?/g, ".");
}

export function renderWeeklyReviewDecision(
  decision: WeeklyReviewDecision,
): string {
  let message: string;
  if (decision.status === "ask_question" && decision.question) {
    message = decision.question.text;
  } else if (decision.status === "ready_for_confirmation") {
    if (decision.week_strategy.decision === "bridge_week") {
      message =
        "Je propose une semaine allegee: on garde le cap, mais on baisse la charge. Rien n'est applique sans ta confirmation. Tu confirmes ?";
    } else if (decision.week_strategy.decision === "repeat_week") {
      message =
        "Je propose de refaire la meme semaine pour consolider avant d'avancer. Rien n'est applique sans ta confirmation. Tu confirmes ?";
    } else if (decision.week_strategy.decision === "level_review") {
      message =
        "Ce point semble toucher la forme du niveau. Je propose d'ouvrir une revue du niveau plutot que de modifier l'objectif ici. Tu confirmes ?";
    } else {
      message =
        "Je propose de passer a la suite prudemment, en reportant seulement ce qui reste utile. Rien n'est applique sans ta confirmation. Tu confirmes ?";
    }
  } else if (decision.status === "no_change") {
    message = "Je ne vois pas de changement utile a proposer pour l'instant.";
  } else if (decision.status === "stopped") {
    message = "Pas de souci, on laisse le point weekly de cote.";
  } else if (decision.status === "blocked") {
    message = "Je bloque le weekly ici: il manque une condition de securite.";
  } else {
    message =
      "On garde le point weekly ouvert tant que la proposition n'est pas confirmee.";
  }
  const cleaned = oneQuestionOnly(stripInternalLabels(message));
  if (INTERNAL_LABELS.test(cleaned)) {
    return "Je propose d'ajuster la semaine prochaine en mots simples, sans rien appliquer sans ta confirmation. Tu confirmes ?";
  }
  return cleaned;
}

export function renderWeeklyEffectsAck(args: {
  result: WeeklyReviewEffectsResult;
  fallback?: string;
}): string {
  if (args.result.committed_effects.length === 0) {
    return args.result.failed_effects.length > 0
      ? "L'ecriture a echoue. Aucun changement n'est marque comme fait."
      : "Aucun changement n'est fait: il manque une confirmation explicite.";
  }
  return args.fallback ??
    "C'est applique: la proposition confirmee a bien ete enregistree.";
}
