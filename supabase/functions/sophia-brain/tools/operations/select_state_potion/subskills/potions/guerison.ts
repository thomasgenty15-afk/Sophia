import type { StatePotionDetailSubSkillDefinition } from "./types.ts";

export const GUERISON_POTION_SUBSKILL: StatePotionDetailSubSkillDefinition = {
  potion_type: "guerison",
  sub_skill: "guerison_intake",
  required_question_ids: ["recent_hurt", "dominant_feeling"],
  tone_rules: [
    "Repare sans culpabiliser et sans figer l'utilisateur dans la honte.",
    "Ne transforme pas l'episode en jugement moral.",
    "Ne demande jamais si c'est lie au plan ou hors plan dans le chat.",
    "N'invente jamais une action du plan.",
  ],
  extraction_rules: [
    "recent_hurt = l'episode ou la retombee qui a fait mal; ne verrouille pas une reponse trop vague si on ne sait pas ce qui a fait mal.",
    "dominant_feeling = une des quatre options: culpabilite, honte, decouragement, ou fatigue.",
    "Si le user exprime un besoin de pardon ou de reprise douce, utilise-le seulement comme nuance de wording, jamais comme champ requis.",
  ],
};
