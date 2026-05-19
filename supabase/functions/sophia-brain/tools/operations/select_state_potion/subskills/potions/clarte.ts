import type { StatePotionDetailSubSkillDefinition } from "./types.ts";

export const CLARTE_POTION_SUBSKILL: StatePotionDetailSubSkillDefinition = {
  potion_type: "clarte",
  sub_skill: "clarte_intake",
  required_question_ids: ["clarity_problem", "clarity_need"],
  tone_rules: [
    "Aide a retrouver du sens et une priorite, sans transformer la potion en plan complet.",
    "Utilise le pourquoi profond DB quand il est disponible.",
    "Si la clarte vise une action ou decision precise, distingue ponctuel et recurrent avant le draft.",
  ],
  extraction_rules: [
    "clarity_problem = ce qui est flou, melange, trop lourd ou confus maintenant.",
    "clarity_need = quoi_faire, par_ou_commencer, ou ce_qui_compte si le message permet de choisir; sinon reformule en mots user.",
    "Si clarity_problem concerne une action/decision mais que le timing est absent, generated_user_message doit demander si c'est un moment precis ou une situation qui revient.",
  ],
};
