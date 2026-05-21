import type { StatePotionDetailSubSkillDefinition } from "./types.ts";

export const RAPPEL_POTION_SUBSKILL: StatePotionDetailSubSkillDefinition = {
  potion_type: "rappel",
  sub_skill: "rappel_intake",
  required_question_ids: ["drift_target", "drift_style"],
  tone_rules: [
    "Parle comme un raccrochage doux, pas comme une relance de performance.",
    "Reste concret sur ce qui glisse et la maniere dont ca glisse.",
  ],
  extraction_rules: [
    "drift_target = ce par rapport a quoi le user decroche: action, moment, routine, geste a proteger, ou priorite qui se perd.",
    "Si le user parle d'un moment a proteger, d'une fermeture d'ordi, d'une marche, d'un bureau a ranger, ou d'une routine du soir, c'est du drift_target.",
    "drift_style = oubli, repousse, laisse_filer, ou baisse_elan si le message permet de choisir; sinon reformule en mots user.",
  ],
};
