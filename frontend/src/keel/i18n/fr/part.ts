// Pack français — le namespace `part`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `part.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frPart = {
  // ── LES DEUX PARTIES D'UN PLAN (+ ce qui n'est que regardé) ──────────────
  // Les titres que le coach lit au-dessus de son propre plan, et ceux que
  // l'élève lit au-dessus de sa journée. La PARTITION est la même des deux
  // côtés — c'est le vocabulaire qui change, pas le rangement.
  "part.food": "Alimentation",
  "part.actions": "Actions",
  "part.observations": "Observations",
  "part.unsorted": "Pas encore classé",
  "part.hint.food": "Ce que ton client mange — repas, aliments et compléments.",
  "part.hint.actions":
    "Ce que ton client fait — mouvement, sommeil, lumière, récupération.",
  "part.hint.observations":
    "Suivi, pas noté. Ce que ton client relève pour toi — jamais une consigne à tenir, donc jamais comptée comme telle.",
  "part.hint.unsorted":
    "Nous n’avons pas su dire de quoi il s’agit. Ouvres-en une et dis-le.",

  // Les mêmes trois parties, dites à l'élève.
  "part.student.food": "Ce que je mange",
  "part.student.actions": "Ce que je fais",
  "part.student.observations": "Ce que je note",
  "part.student.unsorted": "Pas encore classé",
  "part.student.hint.food": "Dans l’ordre de ta journée.",
  "part.student.hint.actions": "Mouvement, sommeil, lumière, récupération.",
  "part.student.hint.observations": "Suivi, pas noté.",
  "part.student.hint.unsorted": "Ton coach n’a pas encore dit ce que c’est.",
} satisfies TranslatedMessagesOf<"part">;
