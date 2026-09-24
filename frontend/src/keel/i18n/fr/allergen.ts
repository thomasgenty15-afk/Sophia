// Pack français — le namespace `allergen`, et lui seul.
// Assemblé dans `../fr.ts`; une clé `allergen.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).
// `satisfies` exige ICI toutes les clés traduites du namespace, et aucune autre.

import type { TranslatedMessagesOf } from "../catalog";

export const frAllergen = {
  // ── LES TREIZE ALLERGÈNES ────────────────────────────────────────────────
  // ⚠️ SEUL LE MOT CHANGE. Le slug (`tree_nut`, `shellfish`) est la donnée que
  // le verrou de sortie compare pour refuser un plat: il ne se traduit pas, et
  // un test de parité avec le catalogue moteur le vérifie dans l'ordre.
  //
  // « Fruits à coque » et pas « Noix »: c'est le terme de l'étiquetage
  // réglementaire français (règlement INCO), donc celui qu'une personne
  // allergique a déjà lu cent fois sur un emballage.
  "allergen.peanut": "Arachides",
  "allergen.tree_nut": "Fruits à coque",
  "allergen.gluten": "Gluten",
  "allergen.wheat": "Blé",
  "allergen.dairy": "Produits laitiers",
  "allergen.egg": "Œufs",
  "allergen.fish": "Poisson",
  "allergen.shellfish": "Crustacés",
  "allergen.mollusc": "Mollusques",
  "allergen.sesame": "Sésame",
  "allergen.soy": "Soja",
  "allergen.pork": "Porc",
  "allergen.alcohol": "Alcool",
  "allergen.celery": "Céleri",
  "allergen.mustard": "Moutarde",
  "allergen.sulphite": "Sulfites",
  // Le mot est le même dans les deux langues, comme « Gluten »: il rejoint donc
  // la liste blanche de `parity.int.test.ts`, qui refuse par défaut deux
  // traductions identiques (une clé non traduite s'y voit exactement pareil).
  "allergen.lupin": "Lupin",
} satisfies TranslatedMessagesOf<"allergen">;
