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
    definition.free_text_label
      ? `Champ libre: ${definition.free_text_label} Exemple: ${
        definition.free_text_placeholder ?? ""
      }`
      : "Champ libre: absent",
    `Follow-up: ${
      followUp.rationale ?? "suivi court"
    } Cadence: ${cadence}. Duree indicative: ${durationDays} jours.`,
  ].join("\n");
}

const STATE_POTION_BOUNDARIES = [
  "Frontiere temporelle: une potion est utile quand l'etat a deja ete assez formule pour en faire un support durable/plateforme, ou quand le user demande explicitement une potion.",
  "Si le user dit que son plan n'a plus de sens, qu'il ne voit plus le lien entre ses actions et son pourquoi profond, ou qu'il agit mecaniquement, clarte est pertinente quand le besoin est de reconnecter le plan a ce pourquoi.",
  "Ne choisis pas clarte pour seulement prioriser, trouver la prochaine action, decouper une action trop grosse, ou savoir par ou commencer dans l'execution.",
  "Ne choisis pas guerison/amour comme reponse primaire quand la honte, la culpabilite forte, l'auto-attaque ou la detresse occupent encore tout l'espace; ces potions demandent un episode ou un besoin de douceur deja suffisamment pose.",
  "Ne propose jamais de potion si le user refuse une potion, un outil, un protocole ou un reset.",
];

const STATE_POTION_USE_CASES = [
  "Potion anti-decrochage (ID technique actuel: rappel): le user sait deja le geste/cap a proteger mais sent qu'il laisse filer. Sous-cas: oubli, report, glissement progressif, baisse d'elan. Pas pour une perte de sens profonde. Ne jamais rendre rappel comme nom visible.",
  "Potion de courage: peur, apprehension ou evitement face a une action/intention intimidante. Sous-cas: peur du resultat, du regard, de l'inconfort ou du conflit. Pas pour une simple priorisation.",
  "Potion de guérison: apres un episode qui a fait mal, un craquage, une blessure, un echec ou une culpabilite deja nommee. Sous-cas: honte, culpabilite, decouragement, fatigue apres l'episode. Si l'emotion occupe encore tout l'espace, attendre qu'elle soit assez posee pour en faire un support durable. Ne jamais rendre reparation comme nom visible.",
  "Potion de clarté: perte de sens du plan, lien brouille entre actions et pourquoi profond, plan qui ne ressemble plus au user, actions devenues mecaniques. Pas pour generer un plan, un breakdown, une priorite ou une prochaine action.",
  "Potion d'amour: durete envers soi, manque de chaleur, dialogue interieur froid ou besoin de douceur durable. Sous-cas: douceur, reconfort, regard plus tendre. Si l'auto-attaque domine encore, attendre qu'un besoin de douceur formulable apparaisse.",
  "Potion d'apaisement: pression, stress, tension ou saturation qui demande a redescendre. Sous-cas: tres stresse, a cran, submerge. Si la panique ou la detresse domine, ne transforme pas encore l'etat en potion durable. Ne jamais rendre apaisement court comme nom visible.",
];

export function buildStatePotionCatalogPrompt(): string {
  return [
    "## Catalogue canonique des potions d'etat",
    "Utilise ce catalogue pour comprendre les nuances, recommander les deux meilleures potions, poser une question dans le bon ton, et rediger le draft.",
    "Une potion n'est pas le skill conversationnel qui repare le tour courant: c'est un support d'etat a proposer ou preparer avec consentement.",
    "Ne recopie pas mecaniquement les questions: elles servent d'exemples de ton et de niveau de precision.",
    "Les options internes ne doivent jamais devenir une liste visible. Elles servent a classer mentalement, pas a interroger le user comme un formulaire.",
    "Les questions visibles doivent rester courtes, tutoyantes, humaines, non medicales, sans jargon et sans pression.",
    "Labels visibles autorises uniquement: Potion anti-décrochage, Potion de courage, Potion de guérison, Potion de clarté, Potion d'amour, Potion d'apaisement.",
    "Interdits visibles: potion rappel, rappel comme nom de potion, potion de reparation, reparation comme nom de potion, apaisement court.",
    "Le suivi par defaut est un reminder court sur 7 jours; le chat prepare le choix et les champs UI, puis la plateforme gere l'activation et le contexte eventuel.",
    "## Frontieres canoniques",
    ...STATE_POTION_BOUNDARIES.map((rule) => `- ${rule}`),
    "## Use cases et sous-use cases",
    ...STATE_POTION_USE_CASES.map((rule) => `- ${rule}`),
    ...STATE_POTION_TYPES.map((type) =>
      formatPotionDefinition(POTION_DEFINITIONS[type])
    ),
  ].join("\n\n");
}
