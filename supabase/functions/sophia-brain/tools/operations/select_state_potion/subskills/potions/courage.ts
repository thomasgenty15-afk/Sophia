import type { StatePotionDetailSubSkillDefinition } from "./types.ts";

export const COURAGE_POTION_SUBSKILL: StatePotionDetailSubSkillDefinition = {
  potion_type: "courage",
  sub_skill: "courage_intake",
  required_question_ids: ["avoidance_target", "blocker_kind"],
  tone_rules: [
    "Parle de courage sans pousser brutalement a l'action.",
    "Cherche le premier appui face a l'inconfort, pas une injonction.",
    "Ne demande jamais si c'est lie au plan, hors plan, ou quelle action du plan est visee.",
  ],
  extraction_rules: [
    "avoidance_target = ce que le user evite concretement maintenant; ne verrouille pas une reponse vague si on ne sait pas ce qui est evite.",
    "blocker_kind = resultat, regard, inconfort, ou conflit si le message permet de choisir; sinon propose la meilleure lecture et demande validation.",
    "Si le user parle de premier pas, utilise-le comme nuance de formulation, mais ne cree pas de champ requis.",
    "N'invente jamais une action du plan.",
  ],
};
