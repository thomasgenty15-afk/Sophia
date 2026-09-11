/**
 * LOT 5 · L'ÉNERGIE D'UNE CASSEROLE, MESURÉE COMME SA MASSE.
 *
 * ⛔ CE QUE CETTE FONCTION SERT À VOIR: la lane du foyer MESURE les plats, puis
 * REGRAMME les casseroles bien plus bas, puis écrit la ligne. Un ingrédient
 * plafonné ou une casserole retirée entre les deux fait que l'énergie écrite a
 * été mesurée sur un pot qui n'existe plus.
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  preparationReadyGrams,
  preparationReadyKcal,
} from "./meal_generation.ts";
import type { CompositionIndex, CompositionRef } from "./food_composition.ts";
import { buildCompositionIndex } from "./food_composition.ts";

/** Même décor que `composition_reading_index_test.ts`: une référence complète. */
function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
    source: "ciqual",
    energyKcal: 100,
    proteinG: 2,
    carbsG: 10,
    fatG: 1,
    fiberG: 2,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    yieldFactor: null,
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  };
}

const INDEX: CompositionIndex = buildCompositionIndex([
  // ⚠️ `grain_absorbs` EST LE POINT DU FICHIER: c'est la classe qui fait
  // diverger la masse servie et l'énergie.
  ref({
    slug: "rice",
    foodGroupRef: "refined_grain",
    energyKcal: 350,
    yieldClass: "grain_absorbs",
  }),
  ref({ slug: "water", foodGroupRef: "water", energyKcal: 0 }),
  ref({ slug: "oil", foodGroupRef: "olive_oil", energyKcal: 900 }),
], []);

function ing(term: string, gramsRaw: number | null) {
  // deno-lint-ignore no-explicit-any
  return { term, quantity: null, gramsRaw, in_pantry: false } as any;
}

Deno.test("100 g de riz cru = 350 kcal, et l'eau n'en ajoute aucune", () => {
  // ⛔ LES NOMBRES SONT DÉRIVÉS À LA MAIN. Un test qui recopie la sortie reste
  // vert quand la formule change de sens.
  assertEquals(
    preparationReadyKcal([ing("rice", 100), ing("water", 200)], INDEX),
    350,
  );
});

Deno.test("l'énergie NE SUIT PAS le rendement — la masse, si", () => {
  // ⚠️ LE POINT QUI FAIT LA PAIRE. Le riz absorbe: sa MASSE servie est plus
  // grande que sa masse crue, son ÉNERGIE est la même. Une casserole ne gagne
  // pas de calories en absorbant de l'eau, et confondre les deux ferait
  // compter l'eau comme un aliment.
  const grammes = preparationReadyGrams(
    [ing("rice", 100), ing("water", 200)],
    INDEX,
  )!;
  const kcal = preparationReadyKcal(
    [ing("rice", 100), ing("water", 200)],
    INDEX,
  )!;
  assertEquals(grammes > 100, true, `masse servie ${grammes}`);
  assertEquals(kcal, 350);
  // La densité SERVIE est donc bien plus basse que 350 kcal/100 g.
  assertEquals(Math.round((kcal / grammes) * 100) < 350, true);
});

Deno.test("UN REGRAMMAGE PROPORTIONNEL NE DÉPLACE PAS LA DENSITÉ", () => {
  // ⛔ C'EST LE CAS NOMINAL, ET IL DOIT RENDRE ZÉRO DÉRIVE. Le compteur du
  // générateur ne doit sonner que sur un PLAFOND ou un RETRAIT.
  const avant = [ing("rice", 100), ing("oil", 10)];
  const apres = [ing("rice", 120), ing("oil", 12)];
  const d = (l: typeof avant) =>
    (preparationReadyKcal(l, INDEX)! / preparationReadyGrams(l, INDEX)!) * 100;
  assertEquals(Math.abs(d(apres) - d(avant)) < d(avant) * 0.01, true);
});

Deno.test("UN PLAFOND CASSE LA PROPORTION, ET LA DENSITÉ BOUGE", () => {
  // ⛔ LE CAS QUE LE COMPTEUR DOIT ATTRAPER: le riz suit le facteur, l'huile
  // est plafonnée. La casserole ne change pas seulement de taille — elle
  // change de composition.
  const avant = [ing("rice", 100), ing("oil", 10)];
  const plafonne = [ing("rice", 200), ing("oil", 10)];
  const d = (l: typeof avant) =>
    (preparationReadyKcal(l, INDEX)! / preparationReadyGrams(l, INDEX)!) * 100;
  assertEquals(Math.abs(d(plafonne) - d(avant)) > d(avant) * 0.01, true);
});

Deno.test("UN INGRÉDIENT SANS GRAMMES REND `null`, jamais un demi-total", () => {
  // ⚠️ MÊME ABSTENTION QUE `preparationReadyGrams`. Un demi-total aurait
  // l'air d'une mesure, et c'est pire qu'aucune.
  assertEquals(
    preparationReadyKcal([ing("rice", 100), ing("oil", null)], INDEX),
    null,
  );
  assertEquals(preparationReadyKcal([ing("inconnu total", 100)], INDEX), null);
  assertEquals(preparationReadyKcal([], INDEX), null);
  assertEquals(preparationReadyKcal([ing("rice", 100)], null), null);
});
