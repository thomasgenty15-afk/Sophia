import type { StatePotionDetailSubSkillDefinition } from "./types.ts";

export const CLARTE_POTION_SUBSKILL: StatePotionDetailSubSkillDefinition = {
  potion_type: "clarte",
  sub_skill: "clarte_intake",
  required_question_ids: ["plan_meaning_loss_reason"],
  tone_rules: [
    "La potion de clarte concerne une perte de sens du plan: elle reconnecte les actions du plan au pourquoi profond, sans devenir un outil de planification.",
    "Ne reduis pas clarte a prioriser, trouver quoi faire, decouper une action ou produire un plan: si c'est le besoin principal, clarifie plan/breakdown vs perte de sens du plan.",
    "Utilise le pourquoi profond DB quand il est disponible, mais ne l'invente jamais si le contexte ne le donne pas.",
    "Reformule toujours vers le lien plan -> pourquoi profond quand le user parle de flou, d'actions mecaniques, de perte de cap ou de plan qui ne lui ressemble plus.",
    "Ne verrouille pas une formule vague comme 'je suis en vrac' si elle ne dit pas pourquoi le plan a perdu son sens.",
    "La valeur verrouillee doit etre directement copiable dans le champ plateforme, par exemple: Je ne vois plus bien le lien entre les actions de mon plan et la raison profonde pour laquelle j'ai commence.",
  ],
  extraction_rules: [
    "plan_meaning_loss_reason = la raison concrete pour laquelle le plan semble avoir perdu son sens aujourd'hui: actions mecaniques, lien perdu avec le pourquoi profond, plan qui ne ressemble plus au user, cap devenu vide.",
    "Si le user demande surtout 'quoi faire', 'par ou commencer', une priorite ou un breakdown, ne remplis pas automatiquement le champ; generated_user_message clarifie si le besoin est de reconstruire le plan ou de retrouver le sens du plan.",
    "Si le user dit seulement 'je suis en vrac', 'tout est flou' ou 'je suis perdu', propose une formulation centree plan/pourquoi et demande validation ou correction.",
    "Si le user donne une phrase claire du type 'je ne vois plus le lien entre mes actions et mon pourquoi profond', verrouille plan_meaning_loss_reason avec ses mots, sans ajouter un pourquoi invente.",
  ],
};
