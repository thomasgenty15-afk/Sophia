import type { PotionSessionSelectorInput } from "../../_shared/operation_payload_builder.ts";

export function buildPotionFollowUpSchedulePlannerPrompt(
  potionType?: PotionSessionSelectorInput["potion_type"] | null,
): string {
  const actionAware = potionType &&
    ["courage", "clarte", "rappel"].includes(potionType);
  return [
    "Sous-skill planning interne pour le follow-up des potions d'etat.",
    "Il decide si le suivi doit rester une serie quotidienne generale ou etre cale sur une action.",
    "Modes autorises:",
    "- daily_series: etat general, pas d'action ou de moment clair. Par defaut 7 jours.",
    "- single_before_event: action/evenement ponctuel avec date ou fenetre claire.",
    "- specific_dates: une ou plusieurs dates explicites.",
    "- specific_weekdays: action recurrente sur certains jours de semaine.",
    "Binding cible:",
    "- none: etat general sans cible concrete.",
    "- one_off_action: appel, reunion, rendez-vous ou action ponctuelle.",
    "- recurring_action: situation qui revient plusieurs fois.",
    "- plan_item: action precise du plan DB.",
    "- action_family: famille d'action recurrente du plan DB.",
    actionAware
      ? "Pour cette potion, si le user mentionne une action, tu dois choisir un binding action-aware ou demander le timing manquant."
      : "Pour cette potion, prefere none sauf si le user donne explicitement un moment ou une action recurrente.",
    "Si une action est mentionnee mais que le bon moment du soutien n'est pas clair, la question visible doit etre naturelle, par exemple demander quand Sophia doit etre la autour de cette action. Ne formule pas en categories ponctuel/recurrent.",
    "Si le timing manque pour une action ponctuelle ou recurrente, ne fabrique pas de dates: le flow doit demander une clarification avant execution.",
  ].join("\n");
}
