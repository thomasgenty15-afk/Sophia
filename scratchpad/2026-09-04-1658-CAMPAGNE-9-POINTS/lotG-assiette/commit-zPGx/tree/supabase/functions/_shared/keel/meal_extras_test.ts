import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  buildCompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import {
  EXTRA_BEARING_SLOTS,
  EXTRA_PORTION,
  extraNutrients,
  extrasOf,
  MEAL_EXTRAS,
  MEAL_EXTRAS_SOURCES,
  type MealExtra,
  resolveSlotExtras,
  slotBearsExtras,
  UNANSWERED_EXTRAS_KCAL,
} from "./meal_extras.ts";

// ===========================================================================
// LES EXTRAS SONT DÉRIVÉS DU RÉFÉRENTIEL, PAS ÉCRITS À LA MAIN
//
// ⛔ CE QUE CES CAS EMPÊCHENT DE REVENIR. `MEAL_COMPONENT_KCAL` écrivait
// dessert 120 / fromage 120 / pain 80 — une convention qui ne tenait QUE parce
// que les trois nombres se simplifiaient dans un RATIO. Un forfait est
// retranché en valeur absolue: l'argument meurt, et les nombres se mettraient à
// mentir. On lit donc CIQUAL.
//
// ⚠️ LES VALEURS DU DÉCOR SONT CELLES DE LA MIGRATION `20260810160000`, au
// dixième près. Un décor inventé rendrait ce fichier vert sur des aliments qui
// n'existent pas.
// ===========================================================================

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
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  } as CompositionRef;
}

/** Les cinq représentants, aux valeurs CIQUAL réelles. */
const INDEX = buildCompositionIndex([
  ref({ slug: "white_bread", foodGroupRef: "refined_grain", energyKcal: 278, proteinG: 6.8, carbsG: 46, fatG: 5.5, fiberG: 7, unitGrams: 40 }),
  ref({ slug: "cheddar", foodGroupRef: "dairy_cheese", energyKcal: 399, proteinG: 24, carbsG: 0, fatG: 33.8, fiberG: 0 }),
  ref({ slug: "plain_yogurt", foodGroupRef: "dairy_yogurt", energyKcal: 59, proteinG: 3.5, carbsG: 4.7, fatG: 3.3, fiberG: 0 }),
  ref({ slug: "apple", foodGroupRef: "other_fruit", energyKcal: 47.6, proteinG: 0.3, carbsG: 10.7, fatG: 0.1, fiberG: 1.3, unitGrams: 150 }),
  ref({ slug: "biscuits", foodGroupRef: "sugar_sweets", energyKcal: 448.6, proteinG: 6.8, carbsG: 70, fatG: 15.1, fiberG: 2.8, energyDense: true }),
], []);

/** Un référentiel qui ne connaît AUCUN des cinq. */
const EMPTY = buildCompositionIndex([], []);

Deno.test("les cinq extras se résolvent, avec kcal ET macros", () => {
  // ⚠️ LES MACROS COMPTENT AUTANT QUE LES KCAL: c'est ce que l'algorithme lit
  // pour dimensionner. Un forfait qui ne porterait que l'énergie retirerait des
  // calories sans retirer la protéine qui va avec.
  for (const extra of MEAL_EXTRAS) {
    const got = extraNutrients(INDEX, extra);
    assert(got !== "unknown", `${extra} ne résout pas`);
    assert(got.energyKcal > 0, `${extra} rend ${got.energyKcal} kcal`);
    assert(got.proteinG !== null, `${extra} n'a pas de protéine`);
    assert(got.carbsG !== null && got.fatG !== null, `${extra} macro manquante`);
  }
});

Deno.test("⛔ LE POIDS DU RÉFÉRENTIEL GAGNE SUR LA CONVENTION", () => {
  // `white_bread` porte `unitGrams: 40`, et la table dit 40 aussi — le cas ne
  // discriminerait rien. On le prouve donc sur une valeur DIFFÉRENTE.
  const moved = buildCompositionIndex([
    ref({ slug: "white_bread", foodGroupRef: "refined_grain", energyKcal: 278, unitGrams: 100 }),
  ], []);
  const got = extraNutrients(moved, "bread");
  assert(got !== "unknown");
  // 100 g × 278/100 = 278, et surtout PAS les 40 g de la table locale.
  assertEquals(Math.round(got.energyKcal), 278);
  // ⚠️ ET LA CONVENTION SERT QUAND LE RÉFÉRENTIEL SE TAIT: `cheddar` n'a pas de
  // poids unitaire, donc les 30 g de la table s'appliquent.
  const cheese = extraNutrients(INDEX, "cheese");
  assert(cheese !== "unknown");
  assertEquals(Math.round(cheese.energyKcal), Math.round(399 * 30 / 100));
});

Deno.test("⛔ UN EXTRA NON RÉSOLU SE COMPTE, IL NE VAUT PAS ZÉRO", () => {
  // ⚠️ SANS `unresolved`, « personne n'a coché » et « le référentiel n'a rien
  // trouvé » rendent le même zéro — et le second est une panne qui sur-nourrit
  // en silence.
  assertEquals(extraNutrients(EMPTY, "cheese"), "unknown");
  const total = extrasOf(EMPTY, ["bread", "cheese"]);
  assertEquals(total.nutrients.energyKcal, 0);
  assertEquals(total.unresolved.sort(), ["bread", "cheese"]);
  // ⚠️ LE CAS QUI PASSE: rien coché rend AUSSI zéro, mais sans inconnu. C'est
  // ce qui distingue les deux.
  const none = extrasOf(EMPTY, []);
  assertEquals(none.nutrients.energyKcal, 0);
  assertEquals(none.unresolved, []);
});

Deno.test("la somme additionne, et les doublons ne comptent qu'une fois", () => {
  const one = extrasOf(INDEX, ["bread"]);
  const twice = extrasOf(INDEX, ["bread", "bread"]);
  assertEquals(twice.nutrients.energyKcal, one.nutrients.energyKcal);
  // Deux extras distincts s'ajoutent bien.
  const both = extrasOf(INDEX, ["bread", "cheese"]);
  const cheese = extrasOf(INDEX, ["cheese"]);
  assertEquals(
    Math.round(both.nutrients.energyKcal),
    Math.round(one.nutrients.energyKcal + cheese.nutrients.energyKcal),
  );
});

Deno.test("⛔ UNE MACRO ABSENTE SE PROPAGE EN `null`, elle ne devient pas zéro", () => {
  // Même règle que `nutrientsOf`: on ne peut pas mentir sur ce qu'on a lu. Un
  // zéro dirait « ce fromage n'a pas de lipides ».
  const partial = buildCompositionIndex([
    ref({ slug: "cheddar", foodGroupRef: "dairy_cheese", energyKcal: 399, fatG: null }),
  ], []);
  const got = extrasOf(partial, ["cheese"]);
  assertEquals(got.nutrients.fatG, null);
  assert(got.nutrients.energyKcal > 0, "l'énergie, elle, reste lisible");
});

Deno.test("⛔ DEUX MOMENTS PORTENT DES EXTRAS, ET PAS SIX", () => {
  // Le défaut que ce module ferme: la convention du dîner français appliquée au
  // petit-déjeuner, que le plan compose ENTIÈREMENT.
  assertEquals([...EXTRA_BEARING_SLOTS], ["lunch", "dinner"]);
  assert(slotBearsExtras("lunch"));
  assert(slotBearsExtras("dinner"));
  for (const slot of ["breakfast", "snack_am", "snack_pm", "before_bed", "snack"]) {
    assert(!slotBearsExtras(slot), `${slot} ne devrait pas porter d'extras`);
  }
});

Deno.test("⛔ LE REPLI DE LA FICHE MUETTE EST ZÉRO — RIEN DE DÉCLARÉ, RIEN À RETRANCHER", () => {
  // ⟳ 2026-09-04 — CE TEST EST LE RENVERSEMENT DE CELUI D'AVANT, qui épinglait
  // 0,58 en écrivant « retrancher zéro affirmerait que le plat porte 100 % du
  // déjeuner ». Le raisonnement supposait que le silence est RARE.
  //
  // ⛔ MESURÉ EN BASE: 4 bouches sur 143 ont déclaré un extra au déjeuner ou au
  // dîner. Une valeur par défaut qui couvre 97 % d'une population n'arbitre
  // plus une incertitude — elle EST le produit.
  //
  // Traduit en pain (278 kcal/100 g): 58 % supposait 376 g/jour hors plan pour
  // un adulte à 2 400 kcal, et 704 g pour un corps à 4 501. Une baguette pèse
  // 250 g.
  assertEquals(UNANSWERED_EXTRAS_KCAL, 0);
});

Deno.test("⛔ ET UNE FICHE QUI A RÉPONDU GARDE SON RETRAIT, AU KCAL PRÈS", () => {
  // ⚠️ LA MOITIÉ QUI NE CHANGE PAS, et sans elle le renversement se lirait
  // « les extras n'existent plus ». Ils existent: ils sont juste DÉCLARÉS
  // plutôt que supposés, et sommés extra par extra sur des portions réelles du
  // référentiel — pain + fromage + yaourt + fruit + dessert.
  //
  // C'est cette branche-là qui portait déjà la bonne unité: un nombre de kcal,
  // pas une fraction du besoin. Du pain reste du pain quel que soit le gabarit
  // de qui le mange.
  const un = extrasOf(INDEX, ["bread"]).nutrients.energyKcal;
  const deux = extrasOf(INDEX, ["bread", "cheese"]).nutrients.energyKcal;
  assert(un > 0, "un extra déclaré ne coûte rien");
  assert(
    deux > un,
    `deux extras doivent s'additionner: ${un} puis ${deux}`,
  );
});

Deno.test("les cinq portions nomment un aliment RÉEL du référentiel", () => {
  // ⚠️ UNE TABLE QUI POINTE SUR UN SLUG INEXISTANT rendrait tous les forfaits
  // « inconnus » en production, et les tests du dessus resteraient verts sur
  // leur propre décor. Ce cas relit la table contre l'index.
  for (const extra of MEAL_EXTRAS) {
    const portion = EXTRA_PORTION[extra as MealExtra];
    assert(portion.grams > 0, `${extra}: portion ${portion.grams}`);
    assert(
      extraNutrients(INDEX, extra) !== "unknown",
      `${extra} pointe sur « ${portion.slug} », absent du référentiel`,
    );
  }
});

// ===========================================================================
// LA PRÉCÉDENCE ENTRE LA FICHE PAR MOMENT ET LES TROIS BOOLÉENS
//
// ⛔ CE QUE CES CAS EMPÊCHENT. Le report des booléens `takes_bread / cheese /
// dessert` survit à ce lot, et il ne doit JAMAIS écraser une réponse par
// moment ni en inventer une. Les trois règles de `resolveSlotExtras` sont ici,
// une par cas, et chacune doit rougir seule.
// ===========================================================================

Deno.test("① ce qui est déclaré PAR MOMENT gagne sur les booléens", () => {
  const r = resolveSlotExtras({
    declared: { lunch: ["yoghurt"], dinner: [] },
    carried: ["bread", "cheese", "dessert"],
  });
  assertEquals(r.bySlot, { lunch: ["yoghurt"], dinner: [] });
  assertEquals(r.source, "per_slot");
});

Deno.test("② le report se fait MOMENT PAR MOMENT, jamais en bloc", () => {
  // Le dîner est répondu; le déjeuner ne l'est pas et garde ses booléens.
  const r = resolveSlotExtras({
    declared: { dinner: ["fruit"] },
    carried: ["bread"],
  });
  assertEquals(r.bySlot.dinner, ["fruit"]);
  assertEquals(r.bySlot.lunch, ["bread"]);
  // ⚠️ `mixed` EST LE CAS QUI INTERDIT DE SUPPRIMER LES COLONNES TROP TÔT.
  // Une bouche peut avoir migré à moitié; un histogramme à deux états le
  // cacherait derrière `per_slot`.
  assertEquals(r.source, "mixed");
});

Deno.test("⛔ un moment DÉCLARÉ VIDE n'est pas rempli par les booléens", () => {
  // « J'ai répondu: rien à côté du plat le midi » — le report l'écraserait.
  const r = resolveSlotExtras({ declared: { lunch: [] }, carried: ["cheese"] });
  assertEquals(r.bySlot.lunch, []);
  assertEquals(r.bySlot.dinner, ["cheese"]);
});

Deno.test("③ rien nulle part ⇒ AUCUNE clé, et surtout pas `[]`", () => {
  const r = resolveSlotExtras({ declared: {}, carried: null });
  assertEquals(Object.keys(r.bySlot), []);
  assertEquals(r.source, "none");
  // ⛔ LE POINT: une clé posée à `[]` dirait « cette personne ne prend rien à
  // côté », donc ×2,4 sur la cible de toute la population jamais interrogée.
  for (const slot of EXTRA_BEARING_SLOTS) {
    assert(!Object.prototype.hasOwnProperty.call(r.bySlot, slot));
  }
});

Deno.test("⚠️ `carried: []` N'EST PAS `carried: null`", () => {
  // Trois booléens posés à « non » sont une RÉPONSE; jamais posés n'en est pas.
  const answered = resolveSlotExtras({ declared: {}, carried: [] });
  assertEquals(answered.source, "legacy_booleans");
  assertEquals(answered.bySlot, { lunch: [], dinner: [] });
  const never = resolveSlotExtras({ declared: {}, carried: null });
  assertEquals(never.source, "none");
  assertEquals(never.bySlot, {});
});

Deno.test("⛔ un moment qui NE PORTE PAS d'extras n'entre pas", () => {
  // Le plan compose le petit-déjeuner en entier: rien n'y est « à côté ».
  const r = resolveSlotExtras({
    declared: { breakfast: ["bread"], lunch: ["fruit"] },
    carried: null,
  });
  assert(!Object.prototype.hasOwnProperty.call(r.bySlot, "breakfast"));
  assertEquals(r.source, "per_slot");
});

Deno.test("le résultat NE PARTAGE AUCUN TABLEAU avec ses entrées", () => {
  // Une mutation en aval ne doit pas remonter dans la fiche lue en base.
  const declared: Record<string, MealExtra[]> = { lunch: ["bread"] };
  const carried: MealExtra[] = ["cheese"];
  const r = resolveSlotExtras({ declared, carried });
  r.bySlot.lunch.push("fruit");
  r.bySlot.dinner.push("fruit");
  assertEquals(declared.lunch, ["bread"]);
  assertEquals(carried, ["cheese"]);
});

Deno.test("les quatre sources sont atteignables, et il n'y en a pas cinq", () => {
  const seen = new Set<string>([
    resolveSlotExtras({ declared: { lunch: [], dinner: [] }, carried: null }).source,
    resolveSlotExtras({ declared: {}, carried: [] }).source,
    resolveSlotExtras({ declared: { lunch: [] }, carried: [] }).source,
    resolveSlotExtras({ declared: {}, carried: null }).source,
  ]);
  assertEquals([...seen].sort(), [...MEAL_EXTRAS_SOURCES].sort());
});
