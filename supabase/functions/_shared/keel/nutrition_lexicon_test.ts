// KEEL — ceintures du lexique nutritionnel des détecteurs de fuite.
//
// L'invariant gardé ici est SANS LANGUE: « aucune cible chiffrée n'atteint un
// élève ». Ce sont ses noms de nutriments qui en ont une, d'où l'union — et
// d'où ces tests, qui vérifient les deux langues sur le MÊME appel, sans
// jamais passer de locale.

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  findNumericNutritionTarget,
  FORBIDDEN_METRIC_TERMS,
} from "./nutrition_lexicon.ts";

Deno.test("l'union mord en français comme en anglais, depuis le même appel", () => {
  // Condition de désarmement: aucune. Un détecteur paramétré par la locale
  // laisserait passer « 38 g de protéines » dans un fil anglais — c'est
  // exactement ce que l'union existe pour rendre impossible.
  const shouldBite: Array<[string, string]> = [
    ["30 g of protein", "macro_quantity"],
    ["38 g de protéines", "macro_quantity"],
    ["38 g de proteines", "macro_quantity"],
    ["protein: 30 g", "macro_quantity_reversed"],
    ["protéines : 30 g", "macro_quantity_reversed"],
    ["1800 kcal", "energy_unit"],
    ["1800 kilocalories", "energy_unit"],
    ["2000 kilojoules", "energy_unit"],
    ["50% de glucides", "macro_percentage"],
    ["carbs 50%", "macro_percentage"],
    ["25 g de lipides", "macro_quantity"],
    ["20 grammes de sucre", "macro_quantity"],
  ];
  for (const [text, expected] of shouldBite) {
    assertEquals(
      findNumericNutritionTarget(text),
      expected,
      `aurait dû mordre (${expected}): ${JSON.stringify(text)}`,
    );
  }
});

Deno.test("FAUX POSITIF documenté: un VOLUME n'est pas une cible de macro", () => {
  // Régression payée: `ml|cl|l` étaient dans les unités de masse, et
  // « Swap the sugary drink for 1 l of water » — une ligne qui APPLIQUE une
  // conviction du coach — était rejetée par le filtre censé protéger les
  // lignes. Un faux positif ici est SILENCIEUX: la ligne disparaît du plan
  // sans que personne la voie manquer.
  //
  // Condition de désarmement: aucune tant qu'une cible s'écrit en grammes ou
  // en pourcents. Le jour où un coach écrirait une cible en litres, c'est le
  // modèle produit qui aurait changé, pas ce test.
  for (
    const text of [
      "Swap the sugary drink for 1 l of water",
      "Remplace la boisson sucrée par 1 l d'eau",
      "2 l d'eau par jour",
    ]
  ) {
    assertEquals(
      findNumericNutritionTarget(text),
      null,
      `faux positif: ${JSON.stringify(text)}`,
    );
  }
});

Deno.test("le VOCABULAIRE seul reste licite — un chiffre est requis", () => {
  // Un détecteur qui bannirait le vocabulaire forcerait le produit à être MUET
  // plutôt qu'honnête. « une assiette riche en protéines » doit rester dicible.
  for (
    const text of [
      "a protein-rich plate",
      "une assiette riche en protéines",
      "mets des fibres au petit-déjeuner",
    ]
  ) {
    assertEquals(
      findNumericNutritionTarget(text),
      null,
      `le vocabulaire seul ne doit pas mordre: ${JSON.stringify(text)}`,
    );
  }
});

Deno.test("le vocabulaire métrique interdit couvre les DEUX langues", () => {
  // La liste était anglaise seulement, et tournait sur la lane CLINIQUE — celle
  // où un chiffre coûte le plus cher. « kilos », « poids », « assiduité »,
  // « IMC » la traversaient tous.
  for (
    const term of [
      "kcal",
      "bmi",
      "weight",
      "adherence",
      // FR — absents avant
      "imc",
      "kilos",
      "poids",
      "assiduite",
      "pesee",
      "serie",
    ]
  ) {
    assert(
      FORBIDDEN_METRIC_TERMS.includes(term),
      `terme métrique manquant dans l'union: ${term}`,
    );
  }
});
