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
    "drift_target = objet du decrochage, formule simplement et reutilisable dans la plateforme: action, moment, routine, geste a proteger, ou priorite qui se perd.",
    "Si le user parle d'un moment a proteger, d'une fermeture d'ordi, d'une marche, d'un bureau a ranger, ou d'une routine du soir, c'est du drift_target.",
    "Si le user donne plusieurs details concrets pour le meme decrochage (moment, declencheur, geste minimum, alternative utile), conserve-les dans drift_target au lieu de reduire a un libelle generique.",
    "Ne verrouille pas drift_target si la reponse est trop vague et ne dit pas ce qui glisse.",
    "drift_style = exactement une des quatre options: oubli, repousse, laisse_filer, baisse_elan.",
    "Ne demande jamais si c'est lie au plan ou hors plan dans le chat; ce choix appartient a l'UI plateforme.",
    "N'invente jamais de lien avec le plan et ne demande jamais de choisir une action du plan dans le chat.",
  ],
};
