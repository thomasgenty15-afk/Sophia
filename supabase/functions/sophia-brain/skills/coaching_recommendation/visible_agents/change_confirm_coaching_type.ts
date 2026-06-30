import {
  type CoachingVisibleAgentInput,
  type CoachingVisibleAgentOutput,
  runSpecializedVisibleAgent,
} from "./shared.ts";

function coachingTypeLabel(value: string | null | undefined): string | null {
  if (value === "plan_action") return "une action de ton plan";
  if (value === "no_plan_action") return "une action hors plan";
  if (value === "emotional") return "un état émotionnel";
  return null;
}

export const CHANGE_CONFIRM_COACHING_TYPE_ROLE_LINES = [
  "Tu es le visible agent qui confirme le type de coaching.",
  "Ta mission: aider a clarifier le besoin concret sans exposer les categories internes action du plan/action hors plan/etat emotionnel comme un formulaire.",
  "Tu poses une seule question courte si le cadre n'est pas clair.",
  "Clarification naturelle attendue: demande d'abord par rapport a quoi le user veut se debloquer, ce qui bloque, ou quelle situation il veut traiter.",
  'Contre-exemple interdit: apres une comparaison produit, si le user dit "je veux juste me debloquer maintenant sans toucher au plan, c\'est lequel ?", ne reponds pas "action de ton plan, action hors plan ou etat emotionnel ?".',
  'Forme attendue pour ce cas: "Plutot une carte d\'attaque si tu veux te debloquer sans modifier le plan. Mais pour te guider proprement: tu veux te debloquer par rapport a quoi exactement ?"',
  "Tu peux confirmer sobrement un changement de cadre si le contexte est deja assez clair.",
  "Si step_context.candidate_coaching_type est present, utilise-le pour poser une question de confirmation ciblee, mais avec des mots user-facing.",
  "Si step_context.candidate_coaching_type est null, ne liste pas les trois cadres internes; pose une question ouverte et precise sur la situation a debloquer.",
  "Tu ne recommandes aucune feature nouvelle et tu ne donnes aucun conseil produit hors de ce qui est deja decide dans step_context.",
  "Tu ne mentionnes jamais dispatcher, coaching_type, JSON, route ou interne.",
];

export function runChangeConfirmCoachingTypeVisibleAgent(
  input: CoachingVisibleAgentInput,
): Promise<CoachingVisibleAgentOutput | null> {
  return runSpecializedVisibleAgent({
    input,
    source: "coaching_recommendation.visible.change_confirm_coaching_type",
    roleLines: CHANGE_CONFIRM_COACHING_TYPE_ROLE_LINES,
    fallback: (value) => {
      const step =
        value.step_context.task_kind === "change_confirm_coaching_type"
          ? value.step_context
          : null;
      const candidate = coachingTypeLabel(step?.candidate_coaching_type);
      if (candidate) {
        return `Je veux juste comprendre le point à débloquer: c'est quoi la situation concrète derrière ${candidate} ?`;
      }
      return step?.confirmation_question ||
        "Je veux juste comprendre le point à débloquer: tu veux te débloquer par rapport à quoi exactement ?";
    },
  });
}
