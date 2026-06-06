import type { StatePotionDetailSubSkillDefinition } from "./types.ts";

export const APAISEMENT_POTION_SUBSKILL: StatePotionDetailSubSkillDefinition = {
  potion_type: "apaisement",
  sub_skill: "apaisement_intake",
  required_question_ids: ["pressure_source", "pressure_state"],
  tone_rules: [
    "Fais redescendre la pression; n'ajoute pas une exigence de performance.",
    "Privilegie la deceleration et une presence simple.",
    "Ne demande jamais si c'est lie au plan ou hors plan: ce choix appartient a la plateforme.",
  ],
  extraction_rules: [
    "pressure_source = ce qui met le user sous pression maintenant.",
    "Ne verrouille pas pressure_source sur une reponse trop vague si on ne sait pas ce qui met vraiment le user sous pression; propose une formulation et demande validation.",
    "pressure_state = une option canonique parmi stresse, a_cran, submerge.",
    "Ne demande pas quelle action du plan est concernee et n'invente pas d'action du plan.",
    "Si le user exprime avoir besoin de respirer, ralentir ou relacher, utilise-le seulement pour colorer generated_user_message; ce n'est pas un champ requis.",
  ],
};
