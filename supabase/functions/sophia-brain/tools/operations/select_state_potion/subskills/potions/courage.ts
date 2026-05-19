import type { StatePotionDetailSubSkillDefinition } from "./types.ts";

export const COURAGE_POTION_SUBSKILL: StatePotionDetailSubSkillDefinition = {
  potion_type: "courage",
  sub_skill: "courage_intake",
  required_question_ids: ["avoidance_target", "blocker_kind"],
  tone_rules: [
    "Parle de courage sans pousser brutalement a l'action.",
    "Cherche le premier appui face a l'inconfort, pas une injonction.",
    "Si la peur concerne une action, distingue action ponctuelle et action recurrente avant le draft.",
  ],
  extraction_rules: [
    "avoidance_target = ce que le user evite maintenant.",
    "blocker_kind = resultat, regard, inconfort, ou conflit si le message permet de choisir; sinon reformule en mots user.",
    "Si avoidance_target est une action mais que le timing est absent, generated_user_message doit demander si c'est un moment precis ou une situation qui revient.",
  ],
};
