import type { StatePotionDetailSubSkillDefinition } from "./types.ts";

export const APAISEMENT_POTION_SUBSKILL: StatePotionDetailSubSkillDefinition = {
  potion_type: "apaisement",
  sub_skill: "apaisement_intake",
  required_question_ids: ["pressure_source", "pressure_state"],
  tone_rules: [
    "Fais redescendre la pression; n'ajoute pas une exigence de performance.",
    "Privilegie la deceleration et une presence simple.",
  ],
  extraction_rules: [
    "pressure_source = ce qui met le user sous pression maintenant.",
    "pressure_state = stresse, a_cran, ou submerge si le message permet de choisir; sinon reformule en mots user.",
  ],
};
