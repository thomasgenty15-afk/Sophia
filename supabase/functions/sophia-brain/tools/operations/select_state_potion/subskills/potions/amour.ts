import type { StatePotionDetailSubSkillDefinition } from "./types.ts";

export const AMOUR_POTION_SUBSKILL: StatePotionDetailSubSkillDefinition = {
  potion_type: "amour",
  sub_skill: "amour_intake",
  required_question_ids: ["love_lack_context", "love_state"],
  tone_rules: [
    "Ramene de la chaleur et de la douceur sans infantiliser.",
    "Ne suppose pas l'objet du manque d'amour s'il n'est pas donne.",
    "ne demande jamais lie au plan/hors plan dans le chat: ce choix est fait dans la plateforme.",
    "N'invente jamais une action du plan.",
  ],
  extraction_rules: [
    "love_lack_context = par rapport a quoi le user manque d'amour: sujet, partie de soi, situation, action, echec, ou endroit ou il se juge.",
    "Ne verrouille pas love_lack_context si la reponse reste trop vague et qu'on ne sait pas l'objet du manque d'amour.",
    "love_state = option canonique dur, seul, ou vide selon la maniere dont le manque de douceur se manifeste.",
    "Si le user exprime un besoin de douceur, reconfort ou regard plus tendre, utilise-le comme nuance de wording, jamais comme champ requis.",
  ],
};
