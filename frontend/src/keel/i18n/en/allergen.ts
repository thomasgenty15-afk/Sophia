// Seed anglais — le namespace `allergen`, et lui seul.
// Assemblé dans `../en.ts`; une clé `allergen.*` ne vit qu'ici (`dictionaryChunks.int.test.ts`).

export const enAllergen = {
  // ═════════════════════════════════════════════════════════════════════════
  // LES ALLERGÈNES PROPOSÉS (`copy/allergens.ts`)
  //
  // ⚠️ LE LIBELLÉ SE TRADUIT, LE SLUG JAMAIS. Le slug est la donnée que le
  // VERROU DE SORTIE compare pour refuser un plat; le traduire romprait la
  // protection d'un élève anaphylactique et le test de parité avec le
  // catalogue moteur le refuse, dans l'ordre. Ces treize clés sont le seul
  // endroit où le mot change de langue.
  //
  // Un namespace À PART et pas `setup.*`: la même liste est rendue par
  // `/app/health` et par la carte de contraintes du coach. La ranger sous le
  // tunnel d'entrée aurait déclaré une dette de traduction au nom d'un écran
  // qui ne la porte pas.
  // ═════════════════════════════════════════════════════════════════════════
  "allergen.peanut": "Peanuts",
  "allergen.tree_nut": "Tree nuts",
  "allergen.gluten": "Gluten",
  "allergen.wheat": "Wheat",
  "allergen.dairy": "Dairy",
  "allergen.egg": "Eggs",
  "allergen.fish": "Fish",
  "allergen.shellfish": "Shellfish",
  "allergen.mollusc": "Molluscs",
  "allergen.sesame": "Sesame",
  "allergen.soy": "Soy",
  "allergen.pork": "Pork",
  "allergen.alcohol": "Alcohol",
  "allergen.celery": "Celery",
  "allergen.mustard": "Mustard",
  "allergen.sulphite": "Sulphites",
  "allergen.lupin": "Lupin",
} as const
