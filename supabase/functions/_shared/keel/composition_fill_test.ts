/**
 * LOT 18 — LES CAS QUI DÉCIDENT.
 *
 * Les cinq que le prompt du lot demande, plus les trois que la règle 3 impose:
 *   tout résolu · un inconnu · l'appel échoue · l'appel rend une valeur hors
 *   bande · la promotion à la 3e occurrence
 *   + AUCUN ALIAS · l'alternative n'est pas remplie · l'inconnu sans groupe.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildCompositionIndex,
  type CompositionRef,
  resolveIngredient,
  resolveIngredients,
} from "./food_composition.ts";
import { dishEnergy } from "./plan_energy.ts";
import {
  bucketOf,
  compositionFillUserMessage,
  energySourceShares,
  FILL_REQUEST_CAP,
  fillCompositions,
  fillRequestsFor,
  type GroupBand,
  groupBandsFrom,
  parseCompositionFillAnswers,
  percentileCont,
  PROMOTION_MIN_SIGHTINGS,
  promotionVerdict,
  unknownTermCount,
  withFilledRefs,
} from "./composition_fill.ts";
import type { FoodGroupRef } from "./tokens.ts";

// ---------------------------------------------------------------------------
// LE DÉCOR — un référentiel minuscule, mais avec de VRAIES bandes
// ---------------------------------------------------------------------------

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

const REFS: CompositionRef[] = [
  // `citrus`: cinq lignes serrées entre 28 et 48 — une vraie bande étroite.
  ref({ slug: "lemon", foodGroupRef: "citrus", energyKcal: 28, proteinG: 1, carbsG: 3, fatG: 0.3 }),
  ref({ slug: "lime", foodGroupRef: "citrus", energyKcal: 32, proteinG: 1, carbsG: 5, fatG: 0.2 }),
  ref({ slug: "orange", foodGroupRef: "citrus", energyKcal: 40, proteinG: 1, carbsG: 9, fatG: 0.2 }),
  ref({ slug: "clementine", foodGroupRef: "citrus", energyKcal: 44, proteinG: 1, carbsG: 10, fatG: 0.2 }),
  ref({ slug: "grapefruit", foodGroupRef: "citrus", energyKcal: 48, proteinG: 1, carbsG: 11, fatG: 0.3 }),
  // `poultry`: dominante `meat_shrinks`, bande large.
  ref({ slug: "chicken_breast", foodGroupRef: "poultry", energyKcal: 110, yieldClass: "meat_shrinks" }),
  ref({ slug: "chicken_thigh", foodGroupRef: "poultry", energyKcal: 160, yieldClass: "meat_shrinks" }),
  ref({ slug: "turkey_breast", foodGroupRef: "poultry", energyKcal: 130, yieldClass: "meat_shrinks" }),
  ref({ slug: "duck_breast", foodGroupRef: "poultry", energyKcal: 200, yieldClass: "neutral" }),
  // `olive_oil`: UNE seule ligne — pas de bande, exprès.
  ref({ slug: "olive_oil", foodGroupRef: "olive_oil", energyKcal: 900, energyDense: true }),
];

const ALIASES = [
  { alias: "citron", slug: "lemon" },
  { alias: "huile d'olive", slug: "olive_oil" },
];

const INDEX = buildCompositionIndex(REFS, ALIASES);
const BANDS = groupBandsFrom(INDEX);

const g = (slug: string): FoodGroupRef => slug as FoodGroupRef;

// ---------------------------------------------------------------------------
// LA BANDE
// ---------------------------------------------------------------------------

Deno.test("percentileCont reproduit percentile_cont: interpolation sur n-1", () => {
  // 5 valeurs -> p05 tombe à la position 0,2 entre 28 et 32.
  assertEquals(percentileCont([28, 32, 40, 44, 48], 0.05), 28.8);
  assertEquals(percentileCont([28, 32, 40, 44, 48], 0.95), 47.2);
  assertEquals(percentileCont([10], 0.5), 10);
});

Deno.test("un groupe de moins de 3 lignes n'a PAS de bande", () => {
  assert(BANDS.has(g("citrus")));
  assert(BANDS.has(g("poultry")));
  // Une seule ligne: une bande dont les deux bornes se touchent affirmerait une
  // certitude que le groupe n'a pas.
  assertEquals(BANDS.get(g("olive_oil")), undefined);
});

Deno.test("la classe de rendement d'une bande est la DOMINANTE du groupe", () => {
  assertEquals(BANDS.get(g("poultry"))!.yieldClass, "meat_shrinks");
  assertEquals(BANDS.get(g("citrus"))!.yieldClass, "neutral");
});

Deno.test("⛔ les lignes `sas` sont exclues de la bande qui décide des promotions", () => {
  // Sans l'exclusion, chaque promotion élargirait la bande, qui autoriserait la
  // promotion suivante — une boucle qui s'ouvre toute seule.
  const widened = buildCompositionIndex(
    [...REFS, ref({ slug: "zzz", foodGroupRef: "citrus", energyKcal: 700, source: "sas" })],
    ALIASES,
  );
  assertEquals(
    groupBandsFrom(widened).get(g("citrus"))!.energyHigh,
    BANDS.get(g("citrus"))!.energyHigh,
  );
});

// ---------------------------------------------------------------------------
// ① TOUT RÉSOLU — le lot ne doit RIEN faire
// ---------------------------------------------------------------------------

Deno.test("① tout résolu: aucune worklist, aucun appel, l'index ne bouge pas", () => {
  const inputs = [
    { term: "lemon", amount: 50, unit: "g" as const, state: "raw" as const },
    { term: "citron", amount: 20, unit: "g" as const, state: "raw" as const },
  ];
  const { requests, overCap } = fillRequestsFor(INDEX, inputs);
  assertEquals(requests.length, 0);
  assertEquals(overCap.length, 0);
  assertEquals(unknownTermCount(INDEX, inputs), 0);

  const { index, kept } = withFilledRefs(INDEX, []);
  assertEquals(kept.length, 0);
  // MÊME OBJET: pas de copie inutile de 923 lignes sur le cas nominal.
  assert(index === INDEX);
});

// ---------------------------------------------------------------------------
// ② UN INCONNU — le plat devient calculable
// ---------------------------------------------------------------------------

const YUZU = { term: "yuzu", amount: 30, unit: "g" as const, state: "raw" as const };
const LEMON = { term: "lemon", amount: 50, unit: "g" as const, state: "raw" as const };

Deno.test("② un inconnu: le plat s'abstenait, il se calcule", () => {
  const before = dishEnergy(INDEX, { method: "", ingredients: [LEMON, YUZU] });
  assertEquals(before.complete, false);
  assertEquals(before.gaps, ["unknown_ingredient"]);
  assertEquals(before.unreadableTerms, ["yuzu"]);

  const { requests } = fillRequestsFor(INDEX, [LEMON, YUZU]);
  assertEquals(requests.map((r) => r.term), ["yuzu"]);

  const answers = parseCompositionFillAnswers(
    JSON.stringify({
      items: [{
        term: "yuzu",
        food_group_ref: "citrus",
        kcal_100g: 40,
        protein_g: 1,
        carbs_g: 9,
        fat_g: 0.2,
        fiber_g: 2,
        yield_class: "neutral",
      }],
    }),
    requests,
  );
  const result = fillCompositions({ index: INDEX, requests, answers, bands: BANDS });
  assertEquals(result.filled.length, 1);
  assertEquals(result.filled[0].source, "model");
  assertEquals(result.filled[0].residualKcal, 0);

  const { index } = withFilledRefs(INDEX, result.filled);
  const after = dishEnergy(index, { method: "", ingredients: [LEMON, YUZU] });
  assertEquals(after.complete, true);
  // 50 g de lemon (28/100) + 30 g de yuzu (40/100) = 14 + 12 = 26
  assertEquals(after.kcal, 26);
});

Deno.test("⛔ RÈGLE 3 — un aliment NEUF, et AUCUN alias n'est écrit", () => {
  const { requests } = fillRequestsFor(INDEX, [YUZU]);
  const answers = parseCompositionFillAnswers(
    JSON.stringify({
      items: [{ term: "yuzu", food_group_ref: "citrus", kcal_100g: 40, yield_class: "neutral" }],
    }),
    requests,
  );
  const { filled } = fillCompositions({ index: INDEX, requests, answers, bands: BANDS });
  const { index } = withFilledRefs(INDEX, filled);

  // La table d'alias est le MÊME objet, à l'identité près.
  assert(index.byAlias === INDEX.byAlias);
  assertEquals(index.byAlias.size, INDEX.byAlias.size);
  // Le slug est le terme, et il est NEUF.
  assertEquals(resolveIngredient(index, "yuzu")!.slug, "yuzu");
  assertEquals(resolveIngredient(index, "yuzu")!.source, "model");
  // Et aucun aliment existant n'a changé de valeur.
  assertEquals(resolveIngredient(index, "citron")!.slug, "lemon");
  assertEquals(resolveIngredient(index, "lemon")!.energyKcal, 28);
});

Deno.test("⛔ un terme qui résout DÉJÀ ne peut pas être rempli (aucun masquage)", () => {
  // On force la main: une ligne remplie qui viserait un aliment réel.
  const forged = {
    term: "lemon",
    canonicalTerm: "lemon",
    forms: [],
    ref: ref({ slug: "lemon", energyKcal: 9999, source: "model" }),
    source: "model" as const,
    residualKcal: 0,
    rejectedModelKcal: null,
    // ⟳ 2026-09-10 — REQUIS depuis que `FilledComposition` porte le motif de
    // mise en revue. `null` = rien à relire, et c'est le cas de ce décor: il
    // force la main sur un aliment DÉJÀ résolu, donc le refus vient de la
    // ceinture (`already_resolved`), pas d'une revue.
    reviewReason: null,
  };
  const { index, kept, refused } = withFilledRefs(INDEX, [forged]);
  assertEquals(kept.length, 0);
  assertEquals(refused, [{ term: "lemon", reason: "already_resolved" }]);
  assertEquals(resolveIngredient(index, "lemon")!.energyKcal, 28);
});

Deno.test("⛔ une ALTERNATIVE n'est pas remplie: l'entrée serait morte", () => {
  // `resolveIngredient` refuse « X or Y » AVANT de chercher. Une entrée écrite
  // pour ce terme ne serait jamais atteinte — et une entrée morte ressemble à
  // une couverture.
  const inputs = [{ term: "butter or olive oil", amount: 10, unit: "g" as const, state: "raw" as const }];
  const { requests } = fillRequestsFor(INDEX, inputs);
  assertEquals(requests.map((r) => r.term), ["butter or olive oil"]);
  const answers = parseCompositionFillAnswers(
    JSON.stringify({
      items: [{
        term: "butter or olive oil",
        food_group_ref: "citrus",
        kcal_100g: 40,
        yield_class: "neutral",
      }],
    }),
    requests,
  );
  const { filled } = fillCompositions({ index: INDEX, requests, answers, bands: BANDS });
  assertEquals(filled.length, 1);
  const { index, kept, refused } = withFilledRefs(INDEX, filled);
  assertEquals(kept.length, 0);
  assertEquals(refused, [{ term: "butter or olive oil", reason: "unreachable" }]);
  assertEquals(index.bySlug.size, INDEX.bySlug.size);
});

// ---------------------------------------------------------------------------
// ③ L'APPEL QUI ÉCHOUE — le repli par bornes, et il porte son résidu
// ---------------------------------------------------------------------------

Deno.test("③ l'appel échoue: la borne du groupe DÉCLARÉ prend la main", () => {
  const inputs = [{ ...YUZU, group: g("citrus") }];
  const { requests } = fillRequestsFor(INDEX, inputs);
  // `[]` = personne n'a répondu. C'est ce que `askCompositionFill` rend sur
  // timeout, sur erreur du fournisseur et sur sortie illisible.
  const result = fillCompositions({ index: INDEX, requests, answers: [], bands: BANDS });
  assertEquals(result.filled.length, 1);
  const f = result.filled[0];
  assertEquals(f.source, "group_bounds");
  // Le MILIEU de [28,8 ; 47,2] = 38, et le RÉSIDU est la demi-largeur.
  assertEquals(f.ref.energyKcal, 38);
  assertEquals(f.residualKcal, 9.2);
  // ⛔ AUCUNE MACRO INVENTÉE: le milieu d'une bande d'énergie ne rend pas
  // quatre macros qui se recoupent.
  assertEquals(f.ref.proteinG, null);
  assertEquals(f.ref.carbsG, null);

  const { index } = withFilledRefs(INDEX, result.filled);
  const after = dishEnergy(index, { method: "", ingredients: [LEMON, YUZU] });
  assertEquals(after.complete, true);
  // 14 + 30 × 0,38 = 14 + 11,4 = 25,4 -> 25
  assertEquals(after.kcal, 25);
});

Deno.test("③bis l'appel échoue ET aucun groupe n'est déclaré: on s'abstient", () => {
  // ⚠️ C'est la LIMITE HONNÊTE du lot, pas un oubli: sans groupe il n'y a
  // aucune bande à opposer, et « la moyenne du référentiel » serait la valeur
  // inventée que ce module existe pour ne pas écrire.
  const { requests } = fillRequestsFor(INDEX, [YUZU]);
  const result = fillCompositions({ index: INDEX, requests, answers: [], bands: BANDS });
  assertEquals(result.filled.length, 0);
  assertEquals(result.refused, [{ term: "yuzu", reason: "no_group" }]);
  assertEquals(result.counts.no_group, 1);
});

Deno.test("③ter le groupe existe mais n'a pas de bande: on s'abstient", () => {
  const { requests } = fillRequestsFor(INDEX, [{ term: "ghee", group: g("olive_oil") }]);
  const result = fillCompositions({ index: INDEX, requests, answers: [], bands: BANDS });
  assertEquals(result.filled.length, 0);
  assertEquals(result.refused, [{ term: "ghee", reason: "no_band" }]);
});

Deno.test("une sortie illisible ne lève pas — elle rend `[]`", () => {
  const { requests } = fillRequestsFor(INDEX, [YUZU]);
  assertEquals(parseCompositionFillAnswers("MEGA_TEST_STUB: bonjour", requests), []);
  assertEquals(parseCompositionFillAnswers("", requests), []);
  assertEquals(parseCompositionFillAnswers('{"items":"nope"}', requests), []);
  assertEquals(parseCompositionFillAnswers('{"items":[{"term":"yuzu"}]}', requests), []);
});

Deno.test("⛔ un terme QU'ON N'A PAS DEMANDÉ est jeté", () => {
  const { requests } = fillRequestsFor(INDEX, [YUZU]);
  const answers = parseCompositionFillAnswers(
    JSON.stringify({
      items: [
        { term: "yuzu", food_group_ref: "citrus", kcal_100g: 40, yield_class: "neutral" },
        { term: "kumquat", food_group_ref: "citrus", kcal_100g: 71, yield_class: "neutral" },
      ],
    }),
    requests,
  );
  assertEquals(answers.map((a) => a.term), ["yuzu"]);
});

// ---------------------------------------------------------------------------
// ④ L'APPEL QUI REND UNE VALEUR HORS BANDE
// ---------------------------------------------------------------------------

Deno.test("④ hors bande: la valeur du modèle est REFUSÉE, la borne prend la main", () => {
  const { requests } = fillRequestsFor(INDEX, [YUZU]);
  const answers = parseCompositionFillAnswers(
    JSON.stringify({
      items: [{
        term: "yuzu",
        food_group_ref: "citrus",
        kcal_100g: 400, // un agrume à 400 kcal/100 g
        yield_class: "neutral",
      }],
    }),
    requests,
  );
  const result = fillCompositions({ index: INDEX, requests, answers, bands: BANDS });
  const f = result.filled[0];
  assertEquals(f.source, "group_bounds");
  assertEquals(f.ref.energyKcal, 38);
  // ⚠️ LA VALEUR BRUTE N'EST PAS PERDUE: elle part au sas et attend une revue
  // humaine. Sans elle, personne ne saurait ce que le modèle a répondu.
  assertEquals(f.rejectedModelKcal, 400);
});

Deno.test("④bis hors bande SANS bande de repli: abstention, pas invention", () => {
  const { requests } = fillRequestsFor(INDEX, [{ term: "ghee" }]);
  const answers = parseCompositionFillAnswers(
    JSON.stringify({
      items: [{ term: "ghee", food_group_ref: "olive_oil", kcal_100g: 5000, yield_class: "neutral" }],
    }),
    requests,
  );
  const result = fillCompositions({ index: INDEX, requests, answers, bands: BANDS });
  assertEquals(result.filled.length, 0);
  assertEquals(result.refused, [{ term: "ghee", reason: "implausible" }]);
});

Deno.test("un groupe SANS bande accepte quand même une valeur plausible", () => {
  // `olive_oil` n'a qu'une ligne: pas de bande. Le plafond absolu reste la
  // garde, et il laisse passer 890.
  const { requests } = fillRequestsFor(INDEX, [{ term: "ghee" }]);
  const answers = parseCompositionFillAnswers(
    JSON.stringify({
      items: [{ term: "ghee", food_group_ref: "olive_oil", kcal_100g: 890, yield_class: "neutral" }],
    }),
    requests,
  );
  const { filled } = fillCompositions({ index: INDEX, requests, answers, bands: BANDS });
  assertEquals(filled[0].source, "model");
  assertEquals(filled[0].ref.energyKcal, 890);
  // Sur-détection assumée de la densité: 890 >= 250.
  assertEquals(filled[0].ref.energyDense, true);
});

// ---------------------------------------------------------------------------
// ⑤ LA PROMOTION À LA 3e OCCURRENCE
// ---------------------------------------------------------------------------

const CITRUS_BAND = () => BANDS.get(g("citrus")) as GroupBand;

function verdictAt(sightings: number, over: Partial<Parameters<typeof promotionVerdict>[0]> = {}) {
  return promotionVerdict({
    sightings,
    fillSource: "model",
    group: g("citrus"),
    energyKcal: 40,
    proteinG: 1,
    carbsG: 9,
    fatG: 0.2,
    band: CITRUS_BAND(),
    slugTaken: false,
    aliasExists: false,
    ...over,
  });
}

Deno.test("⑤ la promotion se fait à la 3e occurrence, pas à la 2e", () => {
  assertEquals(PROMOTION_MIN_SIGHTINGS, 3);
  assertEquals(verdictAt(1).outcome, "wait");
  assertEquals(verdictAt(2).outcome, "wait");
  assertEquals(verdictAt(3).outcome, "promote");
});

Deno.test("⑤bis une ligne `group_bounds` n'est JAMAIS promue, même vue 30 fois", () => {
  const v = verdictAt(30, { fillSource: "group_bounds" });
  assertEquals(v.outcome, "skip");
  assertEquals(v.reason, "group_bounds_never_promoted");
});

Deno.test("⑤ter hors bande à la 3e: revue humaine, jamais promotion", () => {
  assertEquals(verdictAt(3, { energyKcal: 400 }).reason, "energy_out_of_band");
  assertEquals(verdictAt(3, { energyKcal: 400 }).outcome, "review");
  assertEquals(verdictAt(3, { carbsG: 90 }).reason, "carbs_out_of_band");
  assertEquals(verdictAt(3, { band: null }).reason, "no_band");
  assertEquals(verdictAt(3, { group: null }).reason, "no_band");
});

Deno.test("⑤quater les deux refus qui protègent un aliment RÉEL", () => {
  assertEquals(verdictAt(3, { slugTaken: true }).reason, "slug_taken");
  assertEquals(verdictAt(3, { aliasExists: true }).reason, "alias_exists");
});

// ---------------------------------------------------------------------------
// LES QUATRE COMPTEURS
// ---------------------------------------------------------------------------

Deno.test("les quatre parts d'énergie, et `group_bounds` compte à part", () => {
  const withSas = buildCompositionIndex(
    [...REFS, ref({ slug: "kefir", foodGroupRef: "dairy_yogurt", energyKcal: 60, source: "sas" })],
    ALIASES,
  );
  const { requests } = fillRequestsFor(withSas, [
    { term: "yuzu", amount: 100, unit: "g", state: "raw", group: g("citrus") },
    { term: "shiso", amount: 100, unit: "g", state: "raw", group: g("citrus") },
  ]);
  // `yuzu` répond, `shiso` non -> une ligne `model`, une `group_bounds`.
  const answers = parseCompositionFillAnswers(
    JSON.stringify({
      items: [{ term: "yuzu", food_group_ref: "citrus", kcal_100g: 40, yield_class: "neutral" }],
    }),
    requests,
  );
  const { filled } = fillCompositions({ index: withSas, requests, answers, bands: groupBandsFrom(withSas) });
  const { index } = withFilledRefs(withSas, filled);

  const inputs = [
    { term: "lemon", amount: 100, unit: "g" as const, state: "raw" as const }, // 28  table
    { term: "kefir", amount: 100, unit: "g" as const, state: "raw" as const }, // 60  promoted
    { term: "yuzu", amount: 100, unit: "g" as const, state: "raw" as const }, // 40  model
    { term: "shiso", amount: 100, unit: "g" as const, state: "raw" as const }, // 38  group_bounds
  ];
  const shares = energySourceShares(resolveIngredients(index, inputs).resolved);
  assertEquals(shares.kcal, 166);
  assertEquals(shares.table, 0.169);
  assertEquals(shares.promoted, 0.361);
  assertEquals(shares.model, 0.241);
  assertEquals(shares.group_bounds, 0.229);
  assertEquals(
    Math.round((shares.table + shares.promoted + shares.model + shares.group_bounds) * 1000) / 1000,
    1,
  );
});

Deno.test("le compteur ④ se mesure sur l'index de BASE, jamais sur l'augmenté", () => {
  const inputs = [LEMON, YUZU, { term: "shiso", amount: 10, unit: "g" as const, state: "raw" as const }];
  assertEquals(unknownTermCount(INDEX, inputs), 2);
  // Après remplissage l'index augmenté rendrait 0 — c'est-à-dire un lot qui se
  // déclare réussi par construction. Le compteur DOIT lire l'index de base.
  const { requests } = fillRequestsFor(INDEX, inputs.map((i) => ({ ...i, group: g("citrus") })));
  const { filled } = fillCompositions({ index: INDEX, requests, answers: [], bands: BANDS });
  const { index } = withFilledRefs(INDEX, filled);
  assertEquals(unknownTermCount(index, inputs), 0);
  assertEquals(unknownTermCount(INDEX, inputs), 2);
});

Deno.test("bucketOf range les cinq provenances dans les quatre seaux", () => {
  assertEquals(bucketOf("ciqual"), "table");
  assertEquals(bucketOf("manual"), "table");
  assertEquals(bucketOf("sas"), "promoted");
  assertEquals(bucketOf("model"), "model");
  assertEquals(bucketOf("group_bounds"), "group_bounds");
});

// ---------------------------------------------------------------------------
// LA WORKLIST
// ---------------------------------------------------------------------------

Deno.test("un seul appel: les termes sont dédoublonnés et comptés", () => {
  const { requests } = fillRequestsFor(INDEX, [
    { term: "Yuzu" },
    { term: "yuzu," },
    { term: "shiso" },
    { term: "lemon" },
  ]);
  assertEquals(requests.length, 2);
  assertEquals(requests[0].term, "yuzu");
  assertEquals(requests[0].occurrences, 2);
});

Deno.test("le premier groupe déclaré gagne, et un `null` ne l'écrase pas", () => {
  const { requests } = fillRequestsFor(INDEX, [
    { term: "yuzu", group: g("citrus") },
    { term: "yuzu", group: null },
  ]);
  assertEquals(requests[0].declaredGroup, "citrus");
  const other = fillRequestsFor(INDEX, [
    { term: "yuzu", group: null },
    { term: "yuzu", group: g("citrus") },
  ]);
  assertEquals(other.requests[0].declaredGroup, "citrus");
});

Deno.test("⚠️ ce que le plafond coupe est COMPTÉ, jamais tronqué en silence", () => {
  const many = Array.from({ length: FILL_REQUEST_CAP + 3 }, (_, i) => ({ term: `inconnu ${i}` }));
  const { requests, overCap } = fillRequestsFor(INDEX, many);
  assertEquals(requests.length, FILL_REQUEST_CAP);
  assertEquals(overCap.length, 3);
  const result = fillCompositions({ index: INDEX, requests, answers: [], bands: BANDS, overCap });
  assertEquals(result.counts.over_cap, 3);
});

Deno.test("la consigne nomme les clés, le vocabulaire fermé et l'échappatoire", () => {
  const { requests } = fillRequestsFor(INDEX, [{ term: "yuzu", group: g("citrus") }]);
  const msg = compositionFillUserMessage(requests);
  assert(msg.includes("yuzu"));
  assert(msg.includes("declared group: citrus"));
  assert(msg.includes("citrus, "), "le vocabulaire fermé doit voyager avec la demande");
});
