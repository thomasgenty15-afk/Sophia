// Pack français — le namespace `unit`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `unit.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frUnit = {
  // ── LES UNITÉS COMME MOTS, accordées à leur nombre ───────────────────────
  // ⚠️ L'ACCORD N'EST PAS LE MÊME QU'EN ANGLAIS, et c'est la seule divergence
  // des deux langues livrées: « 0 days » là-bas, « 0 jour » ici. La bascule vit
  // dans `i18n/plural.ts`; ces tables n'en savent rien, elles portent juste les
  // deux formes.
  //
  // Les symboles (mg, kcal, km) sont identiques dans les deux formes ET dans
  // les deux langues: ce sont des symboles internationaux, pas des mots.
  // `parity.int.test.ts` les nomme un par un plutôt que de tolérer un seuil.
  "unit.one.kcal": "kcal",
  "unit.many.kcal": "kcal",
  "unit.one.g": "g",
  "unit.many.g": "g",
  "unit.one.mg": "mg",
  "unit.many.mg": "mg",
  // « µg » et pas « mcg »: c'est le symbole SI, celui des étiquettes et des
  // ordonnances françaises.
  "unit.one.mcg": "µg",
  "unit.many.mcg": "µg",
  // Unités Internationales.
  "unit.one.IU": "UI",
  "unit.many.IU": "UI",
  "unit.one.ml": "ml",
  "unit.many.ml": "ml",
  "unit.one.l": "L",
  "unit.many.l": "L",
  "unit.one.min": "minute",
  "unit.many.min": "minutes",
  "unit.one.h": "heure",
  "unit.many.h": "heures",
  "unit.one.km": "km",
  "unit.many.km": "km",
  "unit.one.kg": "kg",
  "unit.many.kg": "kg",
  "unit.one.capsule": "capsule",
  "unit.many.capsule": "capsules",
  "unit.one.tablet": "comprimé",
  "unit.many.tablet": "comprimés",
  "unit.one.scoop": "dosette",
  "unit.many.scoop": "dosettes",
  "unit.one.portion": "portion",
  "unit.many.portion": "portions",
  // ⚠️ `serving` ET `portion` TOMBENT SUR LE MÊME MOT, ET C'EST VOULU.
  // L'anglais distingue la portion servie de la portion de référence; le
  // français n'a qu'un mot pour les deux, et en inventer un second (« part »,
  // déjà pris par la part d'un membre du foyer) créerait une distinction que
  // personne ne lit. Les JETONS restent distincts, eux.
  "unit.one.serving": "portion",
  "unit.many.serving": "portions",
  "unit.one.rep": "répétition",
  "unit.many.rep": "répétitions",
  "unit.one.session": "séance",
  "unit.many.session": "séances",
  "unit.one.celsius": "C",
  "unit.many.celsius": "C",
  "unit.one.point": "point",
  "unit.many.point": "points",
  // ⚠️ CES QUATRE VIDES SONT PORTEURS. `quantity()` teste exactement `word ===
  // ""` pour décider de n'imprimer que le nombre: une unité d'horloge n'a pas
  // de mot (« 23:00 minute » n'existe pas) et l'unité `none` non plus. Les
  // remplir imprimerait un mot que la phrase ne demande pas.
  "unit.one.hhmm": "",
  "unit.many.hhmm": "",
  "unit.one.none": "",
  "unit.many.none": "",

  // ── Les unités en pastille (plan_commitments.unit) ───────────────────────
  // Le stockage reste en SI (R4); ce sont des libellés d'affichage. Forme
  // ABRÉGÉE, à côté d'un nombre dans un tableau — la forme en toutes lettres
  // est au-dessus, dans les tables `unit.one.*` / `unit.many.*`.
  "unit.kcal": "kcal",
  "unit.g": "g",
  "unit.mg": "mg",
  "unit.mcg": "µg",
  "unit.IU": "UI",
  "unit.ml": "ml",
  "unit.l": "L",
  "unit.min": "min",
  "unit.h": "h",
  "unit.km": "km",
  "unit.kg": "kg",
  "unit.cm": "cm",
  "unit.capsule": "capsule",
  "unit.tablet": "comprimé",
  "unit.scoop": "dosette",
  "unit.portion": "portion",
  "unit.serving": "portion",
  "unit.rep": "rép",
  "unit.session": "séance",
  "unit.celsius": "C",
  "unit.point": "point",
  "unit.hhmm": "heure",
  // Le vide est PORTEUR: `unitLabel` le rend tel quel pour l'unité `none`, et
  // `targetLabel` teste cette chaîne pour ne pas coller un espace au nombre.
  "unit.none": "",
} satisfies TranslatedMessagesOf<"unit">;
