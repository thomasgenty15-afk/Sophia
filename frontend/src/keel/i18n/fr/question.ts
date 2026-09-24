// Pack français — le namespace `question`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `question.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frQuestion = {
  // ── Les questions posées au coach ────────────────────────────────────────
  // Ce qui vivait là était le SQL: « plan_commitments_target_check:
  // target_op='<=' requires target_max ». Un coach ne peut rien en faire, et ne
  // devrait jamais apprendre qu'une telle phrase existe.
  "question.section": "À décider",
  "question.when": "À quel moment de la journée ?",
  "question.how_much": "Combien, exactement ?",
  "question.time": "À quelle heure ?",
  "question.window": "Entre quelles heures ?",
  "question.title": "Qu’est-ce que cette ligne ? Elle n’a pas encore de nom.",
  "question.which_supplement": "De quel complément s’agit-il ?",
  "question.day_or_week": "Est-ce une règle quotidienne ou hebdomadaire ?",
  "question.how_many_days": "Combien de jours par semaine ?",
  "question.how_many_times": "Combien de fois par jour ?",
  // Le repli honnête. Mieux qu'un nom de contrainte, et il dit de qui vient le
  // problème: on n'a pas su lire la ligne, donc on la redemande.
  "question.unreadable": "Je n’ai pas su lire cette ligne — peux-tu la réécrire ?",
  "question.slot_placeholder": "Choisis un moment",
} satisfies TranslatedMessagesOf<"question">;
