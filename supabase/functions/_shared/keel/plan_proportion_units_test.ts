/**
 * LOT E — L'AJUSTEUR DÉTERMINISTE, BRANCHÉ SUR UN PLAN RÉEL.
 *
 * ⛔ CE QUE CE FICHIER PROUVE, ET CE QU'IL NE PROUVE PAS. Il prouve que les
 * trois traductions du branchement sont justes: les unités, les consommateurs,
 * l'application. Il NE prouve rien sur le modèle — aucun appel n'est fait, et le
 * lot E n'en a fait aucun.
 *
 * Le décor est celui de GAIN `a18f522e-41f9-469e-9c50-1d693d892ce6` et du cas
 * PERTE de `docs/keel/ENQUETE-DEUX-DIRECTIONS-2026-09-11.md`: les mêmes
 * aliments, les mêmes règles d'eau, les mêmes tirages.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  buildCompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import { measureFresh, measurePlate, measurePreparation } from "./preparation_mass.ts";
import { adjustProportions, DENSITY_TOLERANCE_PER_100G } from "./proportion_adjust.ts";
import {
  applyAdjustment,
  type AdjustablePlanDish,
  type AdjustablePlanPreparation,
  consumersOfPlan,
  dishUnitId,
  measureOfPlan,
  methodSpellsQuantities,
  prepUnitId,
  rewriteLeadingNumber,
  unitsOfPlan,
} from "./plan_proportion_units.ts";

// ---------------------------------------------------------------------------
// LE RÉFÉRENTIEL — copié de `preparation_mass_test.ts`, donc de la base
// ---------------------------------------------------------------------------
function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
    source: "ciqual",
    energyKcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    yieldFactor: null,
    atwaterDiscount: 1.0,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  } as CompositionRef;
}

const REFS: CompositionRef[] = [
  ref({ slug: "chicken_breast", foodGroupRef: "poultry", energyKcal: 121, proteinG: 23, carbsG: 0, fatG: 2.6, fiberG: 0, yieldClass: "meat_shrinks" }),
  ref({ slug: "quinoa", foodGroupRef: "whole_grain", energyKcal: 350, proteinG: 13, carbsG: 62, fatG: 6, fiberG: 7, yieldClass: "grain_absorbs" }),
  ref({ slug: "courgette", energyKcal: 16.5, proteinG: 1.2, carbsG: 1.8, fatG: 0.3, fiberG: 1.1, yieldClass: "veg_shrinks", unitGrams: 200 }),
  ref({ slug: "tomato", energyKcal: 19.3, proteinG: 0.9, carbsG: 2.5, fatG: 0.3, fiberG: 1.2, unitGrams: 100 }),
  ref({ slug: "olive_oil", foodGroupRef: "olive_oil", energyKcal: 900, proteinG: 0, carbsG: 0, fatG: 99.9, fiberG: 0, energyDense: true }),
  ref({ slug: "water", foodGroupRef: "water", condimentGrams: 1 }),
  ref({ slug: "salt", foodGroupRef: "sauce_dressing", condimentGrams: 0.5 }),
  ref({ slug: "yogurt_plain", foodGroupRef: "dairy_yogurt", energyKcal: 61, proteinG: 3.5, carbsG: 4.7, fatG: 3.3, fiberG: 0 }),
  ref({ slug: "egg", foodGroupRef: "eggs", energyKcal: 145, proteinG: 12.6, carbsG: 0.3, fatG: 10.3, fiberG: 0, unitGrams: 50 }),
];

const ALIASES = [
  { alias: "blanc de poulet", slug: "chicken_breast" },
  { alias: "huile d'olive", slug: "olive_oil" },
  { alias: "eau", slug: "water" },
  { alias: "sel", slug: "salt" },
  { alias: "courgettes", slug: "courgette" },
  { alias: "yaourt nature", slug: "yogurt_plain" },
  { alias: "oeuf", slug: "egg" },
];

const INDEX = buildCompositionIndex(REFS, ALIASES);

/** Une ligne de plan, comme le parseur l'écrit. */
function ing(
  term: string,
  amount: number | null,
  unit: "g" | "ml" | "tbsp" | "unit" | null,
  gramsRaw: number | null,
  quantity: string | null,
  /**
   * ⟳ LOT D — LE COMPOSANT CULINAIRE QUE LA LIGNE CITE. `null` par défaut, et
   * c'est le cas NOMINAL des plans d'avant le contrat: sans lui, `bodiesOfUnit`
   * retombe sur le traitement conservateur et l'unité entière est figée en
   * proportions. Les cas de ce fichier qui n'en donnent pas testent les
   * TRADUCTIONS (identifiants, mesure, prose), pas l'ajustement.
   */
  part: string | null = null,
) {
  return { term, amount, unit, state: "raw" as const, gramsRaw, quantity, group: null, part };
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LES IDENTIFIANTS — préfixés par leur unité, sinon la mesure se trompe
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LA MÊME HUILE DANS TROIS UNITÉS A TROIS IDENTIFIANTS", () => {
  // Le lot D le dit en toutes lettres: « huile d'olive » vit dans trois unités
  // du même plan, et la `MeasureFn` reçoit une liste NUE. Sans préfixe, elle ne
  // saurait pas de quelle casserole elle parle.
  const preparations: AdjustablePlanPreparation[] = [
    { id: "prep_a", method: "", ingredients: [ing("huile d'olive", 10, "g", 10, "10 g")] },
    { id: "prep_b", method: "", ingredients: [ing("huile d'olive", 20, "g", 20, "20 g")] },
  ];
  const dishes: AdjustablePlanDish[] = [
    { method: "", ingredients: [ing("huile d'olive", 5, "g", 5, "5 g")], uses: [] },
  ];
  const built = unitsOfPlan({ index: INDEX, dishes, preparations, baselineOf: () => null });
  const ids = built.units.flatMap((u) => u.ingredients.map((i) => i.ingredientId));
  assertEquals(new Set(ids).size, 3, ids.join(" / "));
  assert(ids[0].startsWith("prep:prep_a#"), ids[0]);
  assert(ids[1].startsWith("prep:prep_b#"), ids[1]);
  assert(ids[2].startsWith("dish:0#"), ids[2]);
  // Et la ligne du plan est retrouvable par cet identifiant — c'est par là que
  // l'application écrit.
  assertEquals(built.lines.get(ids[0]), preparations[0].ingredients[0]);
});

Deno.test("⛔ DEUX LIGNES HOMONYMES DE LA MÊME CASSEROLE restent distinctes", () => {
  // Le sel de cuisson et le sel de finition existent dans de vrais plans.
  const preparations: AdjustablePlanPreparation[] = [{
    id: "prep_a",
    method: "",
    ingredients: [ing("sel", 2, "g", 2, "2 g"), ing("sel", 1, "g", 1, "1 g")],
  }];
  const built = unitsOfPlan({ index: INDEX, dishes: [], preparations, baselineOf: () => null });
  const ids = built.units[0].ingredients.map((i) => i.ingredientId);
  assertEquals(new Set(ids).size, 2, ids.join(" / "));
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LE GROUPE VIENT DU RÉFÉRENTIEL, PAS DU CHAMP DÉCLARÉ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LA GARDE DE L'HUILE EST ARMÉE MÊME SANS RÉGIME DÉCLARÉ", () => {
  // ⛔ LE PIÈGE, ET IL EST STRUCTUREL. `DishIngredient.group` n'est demandé au
  // modèle QUE lorsqu'un régime est déclaré; sur toute la population sans
  // régime il vaut `null`. Lire ce champ ferait tomber l'huile dans la bande
  // générique [50 %, 200 %] — c'est-à-dire désarmerait la seule garde nommée du
  // lot D, celle qui empêche de noyer l'assiette d'huile pour fermer un couloir.
  const preparations: AdjustablePlanPreparation[] = [{
    id: "prep_a",
    method: "",
    // `group: null` sur la ligne, exactement comme un plan sans régime.
    ingredients: [ing("huile d'olive", 10, "g", 10, "10 g")],
  }];
  const built = unitsOfPlan({ index: INDEX, dishes: [], preparations, baselineOf: () => null });
  assertEquals(built.units[0].ingredients[0].group, "olive_oil");
});

Deno.test("une ligne que le référentiel ne résout pas est VERROUILLÉE et comptée", () => {
  const preparations: AdjustablePlanPreparation[] = [{
    id: "prep_a",
    method: "",
    ingredients: [ing("zqxwv", 10, "g", null, "10 g")],
  }];
  const built = unitsOfPlan({ index: INDEX, dishes: [], preparations, baselineOf: () => null });
  assertEquals(built.units[0].ingredients[0].fixed, true);
  assertEquals(built.counts.lines_locked.unresolved, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ CE QU'ON REFUSE DE TOUCHER
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ UNE MÉTHODE QUI ÉCRIT DES GRAMMES REND SON UNITÉ FIXE", () => {
  // Sinon l'ajustement laisse une ancienne quantité dans le texte lu à la
  // cuisine — chantier C.7, et l'avertissement du lot D.
  assert(methodSpellsQuantities("Verser les 300 g de quinoa dans l'eau"));
  assert(methodSpellsQuantities("Add 2 tbsp of olive oil"));
  assert(methodSpellsQuantities("Faire chauffer 1,5 l d'eau"));
  // ⚠️ ET UN DEGRÉ N'EST PAS UNE MASSE: `180°C` ne doit pas figer une casserole.
  assertEquals(methodSpellsQuantities("Enfourner à 180°C pendant 25 min"), false);
  assertEquals(methodSpellsQuantities("Mélanger le poulet et les courgettes"), false);

  const preparations: AdjustablePlanPreparation[] = [{
    id: "prep_a",
    method: "Verser les 300 g de quinoa",
    ingredients: [ing("quinoa", 300, "g", 300, "300 g")],
  }];
  const built = unitsOfPlan({ index: INDEX, dishes: [], preparations, baselineOf: () => null });
  assertEquals(built.units[0].adjustable, false);
  assertEquals(built.units[0].fixedReason, "method_spells_quantities");
  assertEquals(built.counts.units_fixed_method, 1);
});

Deno.test("⛔ « 2 ŒUFS » NE DEVIENT PAS « 2,4 ŒUFS »", () => {
  const preparations: AdjustablePlanPreparation[] = [{
    id: "prep_a",
    method: "",
    ingredients: [ing("oeuf", 2, "unit", 100, "2 oeufs")],
  }];
  const built = unitsOfPlan({ index: INDEX, dishes: [], preparations, baselineOf: () => null });
  assertEquals(built.units[0].ingredients[0].fixed, true);
  assertEquals(built.counts.lines_locked.counted_unit, 1);
});

Deno.test("⛔ UNE PROSE QUI NE COMMENCE PAS PAR UN NOMBRE VERROUILLE SA LIGNE", () => {
  // « une pincée de sel » n'a pas de nombre à remplacer: réécrire l'`amount`
  // sans réécrire la prose laisserait deux quantités qui se contredisent.
  const preparations: AdjustablePlanPreparation[] = [{
    id: "prep_a",
    method: "",
    ingredients: [ing("sel", 3, "g", 3, "une pincée")],
  }];
  const built = unitsOfPlan({ index: INDEX, dishes: [], preparations, baselineOf: () => null });
  assertEquals(built.units[0].ingredients[0].fixed, true);
  assertEquals(built.counts.lines_locked.prose_not_numeric, 1);
});

Deno.test("la prose garde SES MOTS: seul le nombre change", () => {
  // ⛔ AUCUN MOT N'EST TRADUIT NI DEVINÉ. Ce dépôt n'a pas de détecteur de
  // langue et n'a pas le droit d'en écrire un.
  assertEquals(rewriteLeadingNumber("2 tbsp olive oil", 3), "3 tbsp olive oil");
  assertEquals(rewriteLeadingNumber("150 g", 187.5), "187.5 g");
  // ⚠️ LE SÉPARATEUR DÉCIMAL SUIT CELUI DE LA LIGNE D'ORIGINE, et le POINT est
  // le repli quand elle n'en portait pas. C'est une LIMITE CONNUE et cosmétique:
  // « 2 cuillères à soupe » devient « 2.4 cuillères à soupe » dans un plan
  // français. La réparer demanderait de décider de la langue du texte — un
  // détecteur de langue maison, que ce dépôt s'interdit (« jamais de matcher
  // maison »). Le nombre reste juste; c'est la virgule qui manque.
  assertEquals(rewriteLeadingNumber("2 cuillères à soupe", 2.4), "2.4 cuillères à soupe");
  assertEquals(rewriteLeadingNumber("1,5 cuillère à soupe", 1.8), "1,8 cuillère à soupe");
  assertEquals(rewriteLeadingNumber("une pincée", 2), null);
  assertEquals(rewriteLeadingNumber("", 2), null);
  assertEquals(rewriteLeadingNumber(null, 2), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LA MESURE — la même que la production, jamais une seconde
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LA MESURE INJECTÉE REND EXACTEMENT `measurePreparation`", () => {
  // Si ces deux nombres divergeaient, l'ajusteur fermerait un couloir que le
  // moteur ne voit pas. C'est le mode d'échec que ce test existe pour interdire.
  const preparations: AdjustablePlanPreparation[] = [{
    id: "prep_quinoa",
    method: "Cuire à couvert",
    ingredients: [
      ing("quinoa", 300, "g", 300, "300 g"),
      ing("eau", 600, "ml", 600, "600 ml"),
      ing("huile d'olive", 20, "g", 20, "20 g"),
    ],
  }];
  const built = unitsOfPlan({ index: INDEX, dishes: [], preparations, baselineOf: () => null });
  const measure = measureOfPlan({ index: INDEX, preparations, dishes: [] });
  const mine = measure(built.units[0].ingredients);
  const theirs = measurePreparation(INDEX, {
    id: "prep_quinoa",
    method: "Cuire à couvert",
    ingredients: preparations[0].ingredients,
  });
  assertEquals(mine.kcal, theirs.kcal);
  assertEquals(mine.readyG, theirs.readyG);
});

Deno.test("⛔ LE FRAIS D'UN PLAT PASSE PAR `measureFresh`, pas par la casserole", () => {
  const dishes: AdjustablePlanDish[] = [{
    method: "Assembler",
    ingredients: [ing("tomato", 100, "g", 100, "100 g"), ing("huile d'olive", 10, "g", 10, "10 g")],
    uses: [],
  }];
  const built = unitsOfPlan({ index: INDEX, dishes, preparations: [], baselineOf: () => null });
  const measure = measureOfPlan({ index: INDEX, preparations: [], dishes });
  const mine = measure(built.units[0].ingredients);
  const theirs = measureFresh(INDEX, { method: "Assembler", ingredients: dishes[0].ingredients });
  assertEquals(mine.kcal, theirs.kcal);
  assertEquals(mine.readyG, theirs.readyG);
});

Deno.test("une unité inconnue rend `null`, jamais zéro", () => {
  const measure = measureOfPlan({ index: INDEX, preparations: [], dishes: [] });
  const m = measure([{
    ingredientId: "prep:absent#0:x",
    term: "x",
    grams: 10,
    baselineGrams: 10,
    group: null,
    isCondiment: false,
    fixed: false,
  }]);
  assertEquals(m.kcal, null);
  assertEquals(m.readyG, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LES CONSOMMATEURS — la part est `1 / tirages`, celle que le moteur JUGE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ UNE CASSEROLE TIRÉE PAR TROIS PLATS DONNE UN TIERS À CHACUN", () => {
  // ⚠️ ARBITRAGE ÉCRIT EN TÊTE DU MODULE: le brief du lot E disait
  // `uses.servings / servingsMade`. C'est `1 / tirages` qui est juste, parce
  // que c'est la division que `measurePlate` fait — donc la densité que le
  // moteur juge ensuite. Ce test épingle l'arbitrage.
  const preparations: AdjustablePlanPreparation[] = [{ id: "prep_q", method: "", ingredients: [] }];
  const dishes: AdjustablePlanDish[] = [
    { method: "", ingredients: [], uses: [{ preparationId: "prep_q" }] },
    { method: "", ingredients: [], uses: [{ preparationId: "prep_q" }] },
    { method: "", ingredients: [], uses: [{ preparationId: "prep_q" }] },
  ];
  const { consumers } = consumersOfPlan({
    dishes,
    preparations,
    corridors: [{ dishIndex: 0, eaterKey: "own", minPer100G: 123, maxPer100G: 200, preferredPer100G: 136 }],
  });
  assertEquals(consumers.length, 1);
  assertEquals(consumers[0].parts, [
    { unitId: dishUnitId(0), share: 1 },
    { unitId: prepUnitId("prep_q"), share: 1 / 3 },
  ]);
});

Deno.test("une casserole citée mais absente du plan est COMPTÉE, pas sautée en silence", () => {
  const dishes: AdjustablePlanDish[] = [
    { method: "", ingredients: [], uses: [{ preparationId: "prep_disparu" }] },
  ];
  const { consumers, missingPots } = consumersOfPlan({
    dishes,
    preparations: [],
    corridors: [{ dishIndex: 0, eaterKey: "own", minPer100G: 123, maxPer100G: 200, preferredPer100G: 136 }],
  });
  assertEquals(missingPots, 1);
  assertEquals(consumers[0].parts.length, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ L'APPLICATION — la structure ET la prose, ensemble
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ L'APPLICATION ÉCRIT L'`amount` ET RENUMÉROTE LA PROSE", () => {
  const line = ing("huile d'olive", 10, "g", 10, "10 g");
  const lines = new Map([["u#0:huile d'olive", line]]);
  const counts = applyAdjustment({
    lines,
    result: {
      outcome: "closed",
      units: [{
        unitId: "u",
        kind: "preparation",
        componentId: null,
        adjustable: true,
        fixedReason: null,
        before: { kcal: 90, readyG: 10 },
        after: { kcal: 108, readyG: 12 },
        touched: true,
        ingredients: [{
          ingredientId: "u#0:huile d'olive",
          term: "huile d'olive",
          baselineGrams: 10,
          beforeGrams: 10,
          grams: 12,
          ratioToBaseline: 1.2,
          floorGrams: 7.5,
          ceilingGrams: 12.5,
          fixed: false,
          fixedReason: null,
        }],
      }],
      moves: [],
      consumers: [],
      components: [],
      remaining: [],
      fixedUnits: [],
      // deno-lint-ignore no-explicit-any
      counts: {} as any,
    },
  });
  assertEquals(counts.rewritten, 1);
  assertEquals(counts.prose_rewritten, 1);
  assertEquals(counts.prose_stale, 0);
  assertEquals(line.amount, 12);
  assertEquals(line.quantity, "12 g");
  assertEquals(line.gramsRaw, 12);
  // ⚠️ L'UNITÉ ET L'ÉTAT NE BOUGENT PAS: la recette reste écrite comme le
  // modèle l'a écrite, au nombre près.
  assertEquals(line.unit, "g");
  assertEquals(line.state, "raw");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ DE BOUT EN BOUT — le couloir se ferme, et la mesure de PRODUCTION le voit
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ BOUT EN BOUT — un couloir trop dilué se ferme, ZÉRO APPEL MODÈLE", () => {
  // ══════════════════════════════════════════════════════════════════════
  // LE DÉCOR: la casserole poulet/quinoa de PERTE, diluée par ses légumes.
  // ══════════════════════════════════════════════════════════════════════
  //
  // Ce test ne rejoue pas les chiffres exacts de l'enquête (le référentiel de
  // cette fixture est réduit à neuf lignes); il tient ce que le branchement
  // doit garantir, et c'est ce qui manquait: la densité MESURÉE PAR LA
  // PRODUCTION (`measurePlate`) passe sous le plancher avant, et le tient après
  // — sans qu'aucun appel modèle n'ait eu lieu.
  //
  // ⟳ LOT D (2026-09-11) — LA STRUCTURE DE CUISSON EST DÉCLARÉE, et sans elle
  // ce couloir NE SE FERME PLUS. C'est le coût que le plan demande de mesurer,
  // et il est tenu par le cas jumeau juste en dessous.
  const preparations: AdjustablePlanPreparation[] = [{
    id: "prep_poulet_quinoa",
    method: "Faire revenir, puis mijoter à couvert",
    components: [
      { id: "base", role: "main", partOf: null },
      { id: "legumes", role: "separable_side", partOf: null },
    ],
    ingredients: [
      ing("blanc de poulet", 400, "g", 400, "400 g", "base"),
      ing("quinoa", 150, "g", 150, "150 g", "base"),
      ing("courgettes", 600, "g", 600, "600 g", "legumes"),
      ing("huile d'olive", 10, "g", 10, "10 g", "base"),
      ing("sel", null, null, null, "une pincée", "base"),
    ],
  }];
  const dishes: AdjustablePlanDish[] = [{
    method: "Servir avec le yaourt",
    components: [{ id: "yaourt", role: "main", partOf: null }],
    ingredients: [ing("yaourt nature", 100, "g", 100, "100 g", "yaourt")],
    uses: [{ preparationId: "prep_poulet_quinoa" }],
  }];

  const plate = () =>
    measurePlate({
      index: INDEX,
      dish: dishes[0],
      uses: dishes[0].uses ?? [],
      preparations,
      drawsByPrep: new Map([["prep_poulet_quinoa", 1]]),
    });
  const densityOf = (m: ReturnType<typeof plate>) =>
    m.kcal === null || m.readyG === null || m.readyG <= 0 ? null : (m.kcal / m.readyG) * 100;

  const avant = densityOf(plate());
  assert(avant !== null, "le décor doit être mesurable");
  // ⚠️ 115 ET PAS 123, ET LA RAISON EST MESURÉE SUR CETTE FIXTURE-CI. Aux
  // bornes du lot D (poulet ×1,5, quinoa ×2, courgettes ×0,7, huile ×1,25,
  // yaourt ×0,5), le maximum atteignable de cette casserole est **121,2
  // kcal/100 g**: 123 est hors d'atteinte, et l'ajusteur le DIT
  // (`not_found_within_limits`). Écrire 123 ici ferait rougir un module qui a
  // raison. Le vrai cas PERTE se ferme à 123,1 parce que sa recette n'est pas
  // celle-ci — neuf lignes de référentiel ne sont pas 943.
  const MIN = 115;
  assert(avant < MIN, `le décor doit être SOUS le plancher, il est à ${avant}`);

  // ── LE BRANCHEMENT, EXACTEMENT COMME LE HANDLER LE FAIT ───────────────
  const built = unitsOfPlan({ index: INDEX, dishes, preparations, baselineOf: () => null });
  const { consumers } = consumersOfPlan({
    dishes,
    preparations,
    corridors: [{
      dishIndex: 0,
      eaterKey: "own",
      minPer100G: MIN,
      maxPer100G: 250,
      preferredPer100G: Math.round(MIN * 1.1),
    }],
  });
  const result = adjustProportions({
    units: built.units,
    consumers,
    measure: measureOfPlan({ index: INDEX, preparations, dishes }),
  });
  assertEquals(result.outcome, "closed");
  // ⛔ AUCUNE PORTION CONFORME DÉGRADÉE — le compteur que le lot D exige à zéro.
  assertEquals(result.counts.consumers_degraded, 0);

  const applied = applyAdjustment({ result, lines: built.lines });
  assert(applied.rewritten > 0, "rien n'a été réécrit: l'ajustement n'a pas été appliqué");
  // ⛔ AUCUNE PROSE PÉRIMÉE: une quantité ancienne restée dans le texte lu par
  // l'humain est le défaut que `adjustable: false` existe pour empêcher.
  assertEquals(applied.prose_stale, 0);

  // ── ET LA MESURE DE PRODUCTION LE VOIT ────────────────────────────────
  const apres = densityOf(plate());
  assert(apres !== null, "le plan ajusté doit rester mesurable");
  // ⚠️ À LA TOLÉRANCE DU MODULE PRÈS, ET ELLE EST NOMMÉE. `isWithinCorridor`
  // tient un couloir à `DENSITY_TOLERANCE_PER_100G` (0,05 kcal/100 g) près;
  // exiger ici une inégalité STRICTE demanderait au branchement plus que ce que
  // l'ajusteur promet. Avant le lot D la ligne passait exactement — parce que
  // chaque ingrédient bougeait seul. Depuis, le corps rigide s'arrête à
  // l'intersection des bornes de ses lignes, et il atterrit à 114,993.
  assert(
    apres >= MIN - DENSITY_TOLERANCE_PER_100G,
    `la mesure de production ne voit pas la fermeture: ${avant} → ${apres} pour ${MIN}`,
  );

  // ⛔ LA GARDE DE L'HUILE A TENU. Doubler l'huile ferme n'importe quel couloir;
  // c'est très exactement ce que le premier rattrapage réel faisait
  // (« le modèle réduit les légumes aqueux et augmente l'huile »).
  const huile = preparations[0].ingredients[3];
  assert(
    (huile.gramsRaw ?? 0) <= 10 * 1.25 + 1e-9,
    `l'huile a dépassé son plafond de 125 %: ${huile.gramsRaw} g`,
  );
  // ⛔ ET LE PLANCHER DES LÉGUMES AUSSI: densifier ne vide pas l'assiette.
  const courgettes = preparations[0].ingredients[2];
  assert(
    (courgettes.gramsRaw ?? 0) >= 600 * 0.70 - 1e-9,
    `les légumes sont passés sous 70 %: ${courgettes.gramsRaw} g`,
  );
  // ⛔ AUCUN INGRÉDIENT AJOUTÉ NI RETIRÉ — la liste est la même, dans le même
  // ordre, avec les mêmes termes.
  assertEquals(
    preparations[0].ingredients.map((i) => i.term),
    ["blanc de poulet", "quinoa", "courgettes", "huile d'olive", "sel"],
  );
  // ⛔ ET LA PINCÉE DE SEL N'A PAS BOUGÉ: condiment, donc fixe.
  assertEquals(preparations[0].ingredients[4].quantity, "une pincée");
});
