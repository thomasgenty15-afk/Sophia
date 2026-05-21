import { POTION_DEFINITIONS } from "../../../../_shared/v2-potions.ts";
import type {
  PotionDefinition,
  PotionQuestion,
  PotionType,
} from "../../../../_shared/v2-types.ts";

export const STATE_POTION_TYPES: PotionType[] = [
  "rappel",
  "courage",
  "guerison",
  "clarte",
  "amour",
  "apaisement",
];

function formatQuestion(question: PotionQuestion): string {
  return [
    `question: ${question.label}`,
    question.helper_text ? `aide: ${question.helper_text}` : null,
    question.placeholder ? `exemple: ${question.placeholder}` : null,
  ].filter(Boolean).join(" ; ");
}

function formatPotionDefinition(definition: PotionDefinition): string {
  const followUp = definition.default_follow_up_strategy;
  const durationDays = followUp.suggested_duration_days ??
    followUp.scheduled_duration_days ?? 7;
  const cadence = followUp.suggested_delay_hours
    ? `tous les ${followUp.suggested_delay_hours}h`
    : followUp.scheduled_local_time_hhmm
    ? `a ${followUp.scheduled_local_time_hhmm}`
    : "quotidien";

  return [
    `### ${definition.type} - ${definition.title}`,
    `Description: ${definition.short_description}`,
    `Etats typiques: ${definition.state_trigger.join(" / ")}`,
    `Objectifs: ${definition.effect_goal.join(" / ")}`,
    `Questions exemples: ${
      definition.questionnaire.map(formatQuestion).join(" || ")
    }`,
    `Champ libre: ${definition.free_text_label} Exemple: ${definition.free_text_placeholder}`,
    `Follow-up: ${
      followUp.rationale ?? "suivi court"
    } Cadence: ${cadence}. Duree indicative: ${durationDays} jours.`,
  ].join("\n");
}

export function buildStatePotionCatalogPrompt(): string {
  return [
    "## Catalogue canonique des potions d'etat",
    "Utilise ce catalogue pour comprendre les nuances, recommander les deux meilleures potions, poser une question dans le bon ton, et rediger le draft.",
    "Ne recopie pas mecaniquement les questions: elles servent d'exemples de ton et de niveau de precision.",
    "Les options internes ne doivent jamais devenir une liste visible. Elles servent a classer mentalement, pas a interroger le user comme un formulaire.",
    "Les questions visibles doivent rester courtes, tutoyantes, humaines, non medicales, sans jargon et sans pression.",
    "Le suivi par defaut est un reminder court sur 7 jours, mais courage, clarte et rappel peuvent etre cales sur une action ponctuelle ou recurrente quand le user donne ce contexte.",
    ...STATE_POTION_TYPES.map((type) =>
      formatPotionDefinition(POTION_DEFINITIONS[type])
    ),
  ].join("\n\n");
}
