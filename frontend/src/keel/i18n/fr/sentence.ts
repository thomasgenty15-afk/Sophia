// Pack français — le namespace `sentence`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `sentence.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frSentence = {
  // ══ LA PHRASE DU COACH (api/labels.ts::commitmentSentence) ═══════════════
  // Une ligne de plan, reconstruite sur un squelette fixe:
  //     QUAND — COMBIEN ( de ) QUOI
  // Tout ce qui suit est un fragment de ce squelette, écrit pour être COMPOSÉ:
  // la plupart sont en minuscules et prennent leur majuscule à l'assemblage.
  //
  // ⚠️ LE FRANÇAIS A DÉPLACÉ DEUX CHOSES DANS CETTE SECTION, et les deux sont
  // des changements de CODE, pas de mot:
  //   · la préposition « de » est passée du gabarit à l'objet
  //     (`food_group.of.*`), parce qu'elle touche le mot qu'elle gouverne;
  //   · l'accord singulier/pluriel est passé de `count === 1` à `plural()`,
  //     parce que le français range 0 avec le singulier.
  // Les deux sont expliqués là où ils vivent (`api/labels.ts`, `i18n/plural.ts`).

  // ⚠️ LES ESPACES DE BORD DE CES DEUX CLÉS SONT PORTEUSES. Elles sont collées
  // à leurs voisines par `join()` et par une concaténation; les rogner souderait
  // les mots. `parity.int.test.ts` les nomme pour cette raison.
  "sentence.separator": " — ",
  "sentence.amount_of": "{amount} {object}",
  // Dit sur CHAQUE ligne d'observation. Un élève qui se croit noté sur un poids
  // ou une humeur commence à cacher les mauvais; le coach lit alors une semaine
  // choisie. Cette incise est toute la défense.
  "sentence.tracked_suffix": " · suivi, pas noté",
} satisfies TranslatedMessagesOf<"sentence">;
