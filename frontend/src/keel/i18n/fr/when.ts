// Pack français — le namespace `when`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `when.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frWhen = {
  // QUAND — quels jours
  "when.every_day": "Tous les jours",
  "when.weekdays": "En semaine",
  "when.weekends": "Le week-end",
  // « Chaque » et pas « Tous les »: la liste arrive au singulier
  // (« lundi, mercredi et vendredi »), et « Tous les lundi et vendredi » serait
  // faux. « Chaque lundi et vendredi » se lit et reste juste à un seul jour.
  "when.every_named": "Chaque {days}",
  "when.each_week": "Chaque semaine",
  "when.one_day_per_week": "Un jour par semaine",
  "when.days_per_week": "{count} jours par semaine",
  // `required_days_per_week`, dit à voix haute. C'est la différence entre trois
  // portions le dimanche et trois jours séparés — la raison pour laquelle le
  // coach l'a écrit.
  "when.different_days_per_week": "{count} jours différents par semaine",
  "when.at_clock": "à {time}",
  "when.between_clock": "entre {from} et {to}",

  // QUAND — où dans la journée, sur une ligne à faire/à éviter (un ACCOMPAGNEMENT)
  "when.at.on_waking": "au réveil",
  "when.at.breakfast": "au petit-déjeuner",
  "when.at.snack_am": "à la collation du matin",
  "when.at.pre_workout": "avant l’entraînement",
  "when.at.lunch": "au déjeuner",
  "when.at.post_workout": "après l’entraînement",
  "when.at.snack_pm": "à la collation de l’après-midi",
  "when.at.dinner": "au dîner",
  "when.at.before_bed": "au coucher",
  "when.at.any_meal": "à chaque repas",
  "when.at.any_time": "à n’importe quel moment de la journée",

  // QUAND — le même endroit, sur une ligne d'OBSERVATION. « au dîner » se
  // lirait comme une consigne de manger; « chaque soir » se lit comme le moment
  // où l'on note le chiffre, ce qu'est une ligne d'observation.
  "when.observe.on_waking": "au réveil",
  "when.observe.breakfast": "chaque matin au petit-déjeuner",
  "when.observe.snack_am": "chaque matin",
  "when.observe.pre_workout": "avant chaque séance",
  "when.observe.lunch": "chaque midi",
  "when.observe.post_workout": "après chaque séance",
  "when.observe.snack_pm": "chaque après-midi",
  "when.observe.dinner": "chaque soir",
  "when.observe.before_bed": "chaque soir, au coucher",
  "when.observe.any_meal": "à chaque repas",
  "when.observe.any_time": "à n’importe quel moment de la journée",

  // QUAND — le même moment d'observation, DÉPOUILLÉ de sa récurrence, pour les
  // phrases qui impriment déjà une clause de jour. « Chaque samedi, chaque
  // matin au petit-déjeuner » quantifie deux fois une seule récurrence, et la
  // seconde contredit la première.
  "when.moment.on_waking": "au réveil",
  "when.moment.breakfast": "au petit-déjeuner",
  "when.moment.snack_am": "à la collation du matin",
  "when.moment.pre_workout": "avant la séance",
  "when.moment.lunch": "au déjeuner",
  "when.moment.post_workout": "après la séance",
  "when.moment.snack_pm": "à la collation de l’après-midi",
  "when.moment.dinner": "le soir",
  "when.moment.before_bed": "au coucher",
  "when.moment.any_meal": "à chaque repas",
  "when.moment.any_time": "à n’importe quel moment de la journée",
} satisfies TranslatedMessagesOf<"when">;
