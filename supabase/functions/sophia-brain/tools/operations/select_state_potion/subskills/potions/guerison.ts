import type { StatePotionDetailSubSkillDefinition } from "./types.ts";

export const GUERISON_POTION_SUBSKILL: StatePotionDetailSubSkillDefinition = {
  potion_type: "guerison",
  sub_skill: "guerison_intake",
  required_question_ids: ["recent_hurt", "dominant_feeling"],
  tone_rules: [
    "Repare sans culpabiliser et sans figer l'utilisateur dans la honte.",
    "Ne transforme pas l'episode en jugement moral.",
  ],
  extraction_rules: [
    "recent_hurt = l'episode qui a fait mal, le craquage, l'echec, ou la blessure recente.",
    "dominant_feeling = culpabilite, honte, decouragement, ou fatigue si le message permet de choisir; sinon reformule en mots user.",
  ],
};
