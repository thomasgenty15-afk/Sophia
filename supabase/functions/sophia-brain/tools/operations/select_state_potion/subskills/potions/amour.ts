import type { StatePotionDetailSubSkillDefinition } from "./types.ts";

export const AMOUR_POTION_SUBSKILL: StatePotionDetailSubSkillDefinition = {
  potion_type: "amour",
  sub_skill: "amour_intake",
  required_question_ids: ["self_talk", "love_need"],
  tone_rules: [
    "Ramene de la chaleur et de la douceur sans infantiliser.",
    "Ne suppose pas le dialogue interieur actuel s'il n'est pas donne.",
  ],
  extraction_rules: [
    "self_talk = comment le user se parle maintenant.",
    "love_need = douceur, reconfort, ou tendresse si le message permet de choisir; sinon reformule en mots user.",
  ],
};
