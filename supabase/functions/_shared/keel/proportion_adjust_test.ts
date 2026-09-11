import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import {
  ADDED_FAT_CEILING_RATIO,
  ADDED_FAT_FLOOR_RATIO,
  type AdjustableIngredient,
  type AdjustableUnit,
  adjustProportions,
  type ConsumerConstraint,
  DEFAULT_CEILING_RATIO,
  DEFAULT_FLOOR_RATIO,
  DENSITY_TOLERANCE_PER_100G,
  GRAMS_QUANTUM,
  MAX_MOVES_PER_COMPONENT,
  type MeasureFn,
  MIN_MOVE_COOKED_G,
  MOVE_COOKED_G,
  NO_SOLUTION_WITHIN_LIMITS,
  PROBE_RAW_G,
  PROTEIN_CEILING_RATIO,
  ratioBoundsFor,
  VEG_FLOOR_RATIO,
} from "./proportion_adjust.ts";
import type { FoodGroupRef } from "./tokens.ts";
import { EVERY_LINE_ITS_OWN_FREE_BODY } from "./culinary_structure.ts";

// ═══════════════════════════════════════════════════════════════════════════
// UN RÉFÉRENTIEL DE POCHE — les densités sont rondes exprès: chaque assertion
// se recalcule à la main. `kcalPerRawG` et `readyPerRawG` sont ce que la mesure
// injectée rend; la densité SERVIE d'une ligne est leur rapport.
// ═══════════════════════════════════════════════════════════════════════════

const POCKET: Record<
  string,
  { kcalPerRawG: number; readyPerRawG: number; group: FoodGroupRef | null }
> = {
  // 0,2 kcal par gramme cuit — le lest de l'assiette
  "légume": { kcalPerRawG: 0.2, readyPerRawG: 1, group: "non_starchy_veg" },
  // 1,4 kcal par gramme cuit, et il gonfle ×2,5
  "riz": { kcalPerRawG: 3.5, readyPerRawG: 2.5, group: "whole_grain" },
  // 2,0 kcal par gramme cuit, et il perd 30 % à la cuisson
  "poulet": { kcalPerRawG: 1.4, readyPerRawG: 0.7, group: "poultry" },
  // 9,0 kcal par gramme cuit — la ligne que la garde des graisses surveille
  "huile": { kcalPerRawG: 9, readyPerRawG: 1, group: "olive_oil" },
  // 0,5 kcal par gramme cuit, groupe générique: plancher 50 %, plafond 200 %
  "pomme": { kcalPerRawG: 0.5, readyPerRawG: 1, group: "other_fruit" },
  "sel": { kcalPerRawG: 0, readyPerRawG: 1, group: "sauce_dressing" },
  "eau": { kcalPerRawG: 0, readyPerRawG: 1, group: "water" },
};

const pocketMeasure: MeasureFn = (ings) => {
  let kcal = 0;
  let readyG = 0;
  let any = false;
  for (const i of ings) {
    const p = POCKET[i.term];
    if (p === undefined) return { kcal: null, readyG: null };
    const g = i.grams;
    if (g === null || !(g > 0)) continue;
    kcal += g * p.kcalPerRawG;
    readyG += g * p.readyPerRawG;
    any = true;
  }
  return any ? { kcal, readyG } : { kcal: null, readyG: null };
};

function ing(
  term: string,
  grams: number | null,
  over: Partial<AdjustableIngredient> = {},
): AdjustableIngredient {
  return {
    ingredientId: term,
    term,
    grams,
    baselineGrams: grams,
    group: POCKET[term]?.group ?? null,
    isCondiment: term === "sel",
    fixed: false,
    ...over,
  };
}

/**
 * ⚠️ TOUS LES CAS DE CE FICHIER EMPLOIENT `EVERY_LINE_ITS_OWN_FREE_BODY`, ET
 * C'EST NOMMÉ.
 *
 * Ce fichier teste le MOTEUR DE RECHERCHE et les bornes par groupe: les
 * planchers, les plafonds, les deux familles de déplacement, les arrêts, les
 * deux cas réels de l'enquête. Aucun de ces cas ne parle de structure
 * culinaire, et leur donner un corps par ligne est exactement l'état d'avant le
 * lot D — c'est-à-dire l'état dont ils ont mesuré le comportement.
 *
 * ⛔ LA POLITIQUE DU LOT D EST TESTÉE AILLEURS, dans
 * `culinary_components_test.ts`: sans contrat, un bloc est CONSERVATEUR et rien
 * ne bouge. Le désarmement employé ici porte son nom pour qu'on ne le confonde
 * jamais avec un défaut — un désarmement anonyme est la cicatrice n°1 de ce
 * dépôt.
 */
function unit(
  unitId: string,
  ings: readonly AdjustableIngredient[],
  over: Partial<AdjustableUnit> = {},
): AdjustableUnit {
  return {
    unitId,
    kind: "dish",
    ingredients: ings,
    adjustable: true,
    fixedReason: null,
    bodies: EVERY_LINE_ITS_OWN_FREE_BODY(unitId, ings.map((i) => i.ingredientId)),
    ...over,
  };
}

function consumer(
  consumerId: string,
  parts: readonly { unitId: string; share: number }[],
  min: number | null,
  max: number | null,
  preferred: number | null = null,
): ConsumerConstraint {
  return { consumerId, parts, minPer100G: min, maxPer100G: max, preferredPer100G: preferred };
}

/** Le ratio final d'une ligne, dans l'unité nommée. */
function ratio(
  out: ReturnType<typeof adjustProportions>,
  unitId: string,
  ingredientId: string,
): number {
  const u = out.units.find((x) => x.unitId === unitId);
  assert(u, `unité ${unitId} absente`);
  const i = u.ingredients.find((x) => x.ingredientId === ingredientId);
  assert(i, `ligne ${ingredientId} absente`);
  assert(i.ratioToBaseline !== null, `ligne ${ingredientId} sans ratio`);
  return i.ratioToBaseline;
}

function densityAfter(out: ReturnType<typeof adjustProportions>, consumerId: string): number {
  const c = out.consumers.find((x) => x.consumerId === consumerId);
  assert(c?.after, `consommateur ${consumerId} non mesuré`);
  return c.after.per100G;
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LA TABLE DES BORNES — le rattachement groupe par groupe est un ARBITRAGE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("épinglage — les bornes et les réglages de la recherche valent CES nombres-là", () => {
  // ⛔ Ces bornes sont des CONVENTIONS PRODUIT, pas des réglages. Les changer
  // doit faire rougir un test qui ne se recalcule pas avec elles
  // (`constant_pinning_gate_test.ts`, règle de dépôt).
  assertEquals(VEG_FLOOR_RATIO, 0.70);
  assertEquals(DEFAULT_FLOOR_RATIO, 0.50);
  assertEquals(PROTEIN_CEILING_RATIO, 1.50);
  assertEquals(DEFAULT_CEILING_RATIO, 2.00);
  assertEquals(ADDED_FAT_FLOOR_RATIO, 0.75);
  assertEquals(ADDED_FAT_CEILING_RATIO, 1.25);
  assertEquals(MOVE_COOKED_G, 5);
  assertEquals(MIN_MOVE_COOKED_G, 0.1);
  assertEquals(MAX_MOVES_PER_COMPONENT, 200);
  assertEquals(PROBE_RAW_G, 10);
  assertEquals(GRAMS_QUANTUM, 0.1);
  assertEquals(DENSITY_TOLERANCE_PER_100G, 0.05);
});

Deno.test("la table des bornes: quatre bandes, et un groupe inconnu tombe sur la générique", () => {
  assertEquals(ratioBoundsFor("non_starchy_veg"), { floor: 0.70, ceiling: 2.00 });
  assertEquals(ratioBoundsFor("leafy_greens"), { floor: 0.70, ceiling: 2.00 });
  assertEquals(ratioBoundsFor("cruciferous_veg"), { floor: 0.70, ceiling: 2.00 });
  // ⛔ `starchy_veg` n'est PAS un légume au sens du plancher: c'est un féculent,
  // c'est la CIBLE d'une densification.
  assertEquals(ratioBoundsFor("starchy_veg"), { floor: 0.50, ceiling: 2.00 });
  assertEquals(ratioBoundsFor("poultry"), { floor: 0.50, ceiling: 1.50 });
  assertEquals(ratioBoundsFor("legumes"), { floor: 0.50, ceiling: 1.50 });
  assertEquals(ratioBoundsFor("dairy_yogurt"), { floor: 0.50, ceiling: 1.50 });
  // ⛔ Fromage et oléagineux gardent le plafond GÉNÉRIQUE — arbitrage FF-037,
  // repris tel quel: « 30 g d'amandes sont une matière grasse avec de la
  // protéine dedans, pas une ancre ». C'est une ouverture connue.
  assertEquals(ratioBoundsFor("dairy_cheese"), { floor: 0.50, ceiling: 2.00 });
  assertEquals(ratioBoundsFor("nuts_seeds"), { floor: 0.50, ceiling: 2.00 });
  assertEquals(ratioBoundsFor("olive_oil"), { floor: 0.75, ceiling: 1.25 });
  assertEquals(ratioBoundsFor("other_added_fat"), { floor: 0.75, ceiling: 1.25 });
  assertEquals(ratioBoundsFor(null), { floor: 0.50, ceiling: 2.00 });
});

// ═══════════════════════════════════════════════════════════════════════════
// ② AUCUN INGRÉDIENT AJOUTÉ, RETIRÉ OU REMPLACÉ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ la liste rendue a les MÊMES lignes, dans le MÊME ordre: rien n'est ajouté ni retiré", () => {
  const u = unit("u", [ing("légume", 300), ing("riz", 200), ing("poulet", 100), ing("huile", 40)]);
  const out = adjustProportions({
    units: [u],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 160, 250)],
    measure: pocketMeasure,
  });
  const got = out.units[0].ingredients;
  assertEquals(got.length, u.ingredients.length);
  assertEquals(got.map((i) => i.ingredientId), ["légume", "riz", "poulet", "huile"]);
  assertEquals(got.map((i) => i.term), ["légume", "riz", "poulet", "huile"]);
  // et quelque chose a bougé, sinon ce test ne prouve rien
  assert(out.moves.length > 0, "aucun déplacement: le test ne mord pas");
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ CHAQUE BORNE MORD — ET CHACUNE A UN CAS QUI PASSE À CÔTÉ
//
// « Une garde qui ne mord jamais ressemble trait pour trait à une garde qui
// marche. » Chaque bloc ci-dessous a donc DEUX cas: un où la borne est atteinte
// exactement, un où la recherche s'arrête avant elle.
// ═══════════════════════════════════════════════════════════════════════════

/** 300 légume + 200 riz + 100 poulet + 40 huile ⇒ 1 260 kcal / 910 g = 138,5. */
const BASE = () => [ing("légume", 300), ing("riz", 200), ing("poulet", 100), ing("huile", 40)];

Deno.test("le PLANCHER DES LÉGUMES à 70 % mord quand on densifie fort — et pas quand on densifie peu", () => {
  const mord = adjustProportions({
    units: [unit("u", BASE())],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 250, null)],
    measure: pocketMeasure,
  });
  assertEquals(ratio(mord, "u", "légume"), VEG_FLOOR_RATIO);

  const passe = adjustProportions({
    units: [unit("u", BASE())],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 142, 250)],
    measure: pocketMeasure,
  });
  assertEquals(passe.outcome, "closed");
  assert(
    ratio(passe, "u", "légume") > VEG_FLOOR_RATIO,
    `le plancher a mordu alors qu'il ne devait pas: ${ratio(passe, "u", "légume")}`,
  );
});

Deno.test("le PLAFOND PROTÉIQUE à 150 % mord — et un cas qui passe à côté le laisse sous 150 %", () => {
  const mord = adjustProportions({
    units: [unit("u", BASE())],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 250, null)],
    measure: pocketMeasure,
  });
  assertEquals(ratio(mord, "u", "poulet"), PROTEIN_CEILING_RATIO);

  const passe = adjustProportions({
    units: [unit("u", BASE())],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 142, 250)],
    measure: pocketMeasure,
  });
  assertEquals(passe.outcome, "closed");
  assert(
    ratio(passe, "u", "poulet") < PROTEIN_CEILING_RATIO,
    `le plafond a mordu alors qu'il ne devait pas: ${ratio(passe, "u", "poulet")}`,
  );
});

Deno.test("le PLAFOND GÉNÉRIQUE à 200 % mord sur le riz — et un cas qui passe à côté le laisse dessous", () => {
  // ⚠️ Deux lignes seulement, et le riz est le SEUL densifieur (1,4 contre 0,2).
  // Avec de l'huile et du poulet dans l'assiette, le riz cesse d'être une cible
  // et devient un diluant dès que le mélange passe au-dessus de 140 kcal/100 g:
  // le plafond ne mordrait alors jamais, et ce test se raconterait une histoire.
  const rizSeul = () => [ing("légume", 300), ing("riz", 100)];
  const mord = adjustProportions({
    units: [unit("u", rizSeul())],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 250, null)],
    measure: pocketMeasure,
  });
  assertEquals(ratio(mord, "u", "riz"), DEFAULT_CEILING_RATIO);

  const passe = adjustProportions({
    units: [unit("u", rizSeul())],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 90, 250)],
    measure: pocketMeasure,
  });
  assertEquals(passe.outcome, "closed");
  assert(
    ratio(passe, "u", "riz") < DEFAULT_CEILING_RATIO,
    `le plafond a mordu alors qu'il ne devait pas: ${ratio(passe, "u", "riz")}`,
  );
});

Deno.test("le PLANCHER GÉNÉRIQUE à 50 % mord sur un groupe sans bande propre — et un cas passe à côté", () => {
  // La pomme est `other_fruit`: plancher 50 %, pas 70 % — la différence avec le
  // légume est exactement ce que ce test vérifie.
  const avec = () => [ing("pomme", 300), ing("riz", 200), ing("poulet", 100)];
  const mord = adjustProportions({
    units: [unit("u", avec())],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 250, null)],
    measure: pocketMeasure,
  });
  assertEquals(ratio(mord, "u", "pomme"), DEFAULT_FLOOR_RATIO);

  const passe = adjustProportions({
    units: [unit("u", avec())],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 120, 250)],
    measure: pocketMeasure,
  });
  assertEquals(passe.outcome, "closed");
  assert(
    ratio(passe, "u", "pomme") > DEFAULT_FLOOR_RATIO,
    `le plancher a mordu alors qu'il ne devait pas: ${ratio(passe, "u", "pomme")}`,
  );
});

Deno.test("⛔ AUCUNE INFLATION DE GRAISSE: le plafond de l'huile à 125 % mord, et l'écart reste ouvert", () => {
  // 500 légume + 20 huile + 100 poulet ⇒ 420 kcal / 590 g = 71,2 kcal/100 g.
  // Sans plafond, 45 g d'huile de plus fermeraient l'écart tout seuls. C'est
  // exactement ce que le premier rattrapage réel mesuré faisait: « le modèle
  // réduit les légumes aqueux et augmente l'huile ».
  const out = adjustProportions({
    units: [unit("u", [ing("légume", 500), ing("huile", 20), ing("poulet", 100)])],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 120, 250)],
    measure: pocketMeasure,
  });
  assertEquals(ratio(out, "u", "huile"), ADDED_FAT_CEILING_RATIO);
  assertEquals(out.outcome, "not_found_within_limits");
  // et l'huile ne fait pas l'essentiel du travail: le poulet a bougé aussi
  assert(ratio(out, "u", "poulet") > 1, "le poulet n'a pas servi de cible dense");
});

Deno.test("le PLANCHER DE L'HUILE à 75 % mord quand on ALLÈGE — et un cas qui passe à côté", () => {
  // 100 huile + 200 poulet + 50 légume ⇒ 1 190 kcal / 290 g = 410 kcal/100 g.
  const trop = () => [ing("huile", 100), ing("poulet", 200), ing("légume", 50)];
  const mord = adjustProportions({
    units: [unit("u", trop())],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], null, 150)],
    measure: pocketMeasure,
  });
  assertEquals(ratio(mord, "u", "huile"), ADDED_FAT_FLOOR_RATIO);

  const passe = adjustProportions({
    units: [unit("u", trop())],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], null, 380)],
    measure: pocketMeasure,
  });
  assertEquals(passe.outcome, "closed");
  assert(
    ratio(passe, "u", "huile") > ADDED_FAT_FLOOR_RATIO,
    `le plancher a mordu alors qu'il ne devait pas: ${ratio(passe, "u", "huile")}`,
  );
});

Deno.test("le PLANCHER PROTÉIQUE à 50 % mord dans l'autre direction — et un cas qui passe à côté", () => {
  // Ici le poulet EST la ligne la plus dense (2,0 contre 0,5 et 0,2): alléger
  // veut donc le retirer, et c'est son plancher qui arrête la main.
  // 200 poulet + 300 légume + 100 pomme ⇒ 390 kcal / 540 g = 72,2 kcal/100 g.
  const prot = () => [ing("poulet", 200), ing("légume", 300), ing("pomme", 100)];
  const mord = adjustProportions({
    units: [unit("u", prot())],
    // Le plus léger atteignable dans ces bornes est 39,58: 38 reste dehors.
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], null, 38)],
    measure: pocketMeasure,
  });
  assertEquals(mord.outcome, "not_found_within_limits");
  assertEquals(ratio(mord, "u", "poulet"), DEFAULT_FLOOR_RATIO);
  // et le légume, lui, est monté — jusqu'à son plafond générique
  assertEquals(ratio(mord, "u", "légume"), DEFAULT_CEILING_RATIO);

  const passe = adjustProportions({
    units: [unit("u", prot())],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], null, 60)],
    measure: pocketMeasure,
  });
  assertEquals(passe.outcome, "closed");
  assert(
    ratio(passe, "u", "poulet") > DEFAULT_FLOOR_RATIO,
    `le plancher a mordu alors qu'il ne devait pas: ${ratio(passe, "u", "poulet")}`,
  );
});

Deno.test("⛔ TOUTE ligne reste dans ses bornes, quelle que soit la violence du couloir", () => {
  for (const [min, max] of [[250, null], [null, 10], [200, 250], [null, 40]] as const) {
    const out = adjustProportions({
      units: [unit("u", BASE())],
      consumers: [consumer("c", [{ unitId: "u", share: 1 }], min, max)],
      measure: pocketMeasure,
    });
    for (const i of out.units[0].ingredients) {
      if (i.fixed || i.ratioToBaseline === null) continue;
      const b = ratioBoundsFor(POCKET[i.term].group);
      assert(
        i.ratioToBaseline >= b.floor - 1e-9 && i.ratioToBaseline <= b.ceiling + 1e-9,
        `${i.term} à ${i.ratioToBaseline} hors de [${b.floor}, ${b.ceiling}] (couloir ${min}/${max})`,
      );
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LES RATIOS NE SE CUMULENT PAS D'UNE PASSE À L'AUTRE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ DEUX PASSES DE ×1,5 NE FONT PAS ×2,25 — le ratio s'ancre sur la recette INITIALE", () => {
  const un = adjustProportions({
    units: [unit("u", BASE())],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 250, null)],
    measure: pocketMeasure,
  });
  assertEquals(ratio(un, "u", "poulet"), PROTEIN_CEILING_RATIO);
  assertEquals(un.outcome, "not_found_within_limits");

  // L'appelant renvoie l'état ajusté, en laissant `baselineGrams` INTACT.
  const passe2 = unit(
    "u",
    un.units[0].ingredients.map((i) => ({
      ingredientId: i.ingredientId,
      term: i.term,
      grams: i.grams,
      baselineGrams: i.baselineGrams,
      group: POCKET[i.term].group,
      isCondiment: i.term === "sel",
      fixed: false,
    })),
  );
  const deux = adjustProportions({
    units: [passe2],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 250, null)],
    measure: pocketMeasure,
  });
  // ⛔ 1,5 — jamais 2,25.
  assertEquals(ratio(deux, "u", "poulet"), PROTEIN_CEILING_RATIO);
  assertEquals(ratio(deux, "u", "huile"), ADDED_FAT_CEILING_RATIO);
  assertEquals(ratio(deux, "u", "légume"), VEG_FLOOR_RATIO);
  // le riz, lui, est descendu à SON plancher: une fois l'huile et le poulet au
  // plafond, le mélange dépasse 140 kcal/100 g et le riz devient un diluant.
  assertEquals(ratio(deux, "u", "riz"), DEFAULT_FLOOR_RATIO);
  // la deuxième passe n'a plus rien à déplacer: tout est sur ses bornes
  assertEquals(deux.moves.length, 0);
  assertEquals(deux.counts.stopped.floor + deux.counts.stopped.ceiling, 1);
});

Deno.test("un appelant qui rebase les grammes AU LIEU du baseline se voit COMPTÉ, pas ignoré", () => {
  // L'état courant est déjà hors de ses bornes: `already_outside_bounds` le dit.
  const out = adjustProportions({
    units: [unit("u", [
      ing("légume", 100, { baselineGrams: 300 }),
      ing("riz", 500, { baselineGrams: 200 }),
      ing("poulet", 100),
    ])],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 100, 250)],
    measure: pocketMeasure,
  });
  assertEquals(out.counts.already_outside_bounds, 2);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ DÉTERMINISME
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("même entrée, même sortie — à la trace près", () => {
  const run = () =>
    adjustProportions({
      units: [unit("u", BASE()), unit("v", [ing("pomme", 200), ing("riz", 50)])],
      consumers: [
        consumer("c1", [{ unitId: "u", share: 0.5 }, { unitId: "v", share: 1 }], 160, 250, 180),
        consumer("c2", [{ unitId: "u", share: 0.5 }], 150, 250, 170),
      ],
      measure: pocketMeasure,
    });
  assertEquals(JSON.stringify(run()), JSON.stringify(run()));
});

Deno.test("une ÉGALITÉ PARFAITE se départage par IDENTIFIANT, pas par ordre de liste", () => {
  // Deux légumes identiques en tout sauf leur identifiant. Le déplacement part
  // de `a_legume` parce que « a » < « b » — et l'ordre dans la liste est inversé
  // exprès pour que seul l'identifiant puisse décider.
  const jumeaux = [
    ing("légume", 200, { ingredientId: "b_legume" }),
    ing("légume", 200, { ingredientId: "a_legume" }),
    ing("poulet", 100),
  ];
  const out = adjustProportions({
    units: [unit("u", jumeaux)],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 120, 250)],
    measure: pocketMeasure,
  });
  assert(out.moves.length > 0);
  assertEquals(out.moves[0].fromIngredientId, "a_legume");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ CONDIMENTS, EAU, LIGNES NON PESÉES, VERROUS DE L'APPELANT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ CONDIMENTS ET EAU NE BOUGENT PAS — et chaque immobilité est comptée par son motif", () => {
  const out = adjustProportions({
    units: [unit("u", [
      ing("légume", 300),
      ing("poulet", 100),
      ing("eau", 400),
      ing("sel", 5),
      ing("huile", 20, { grams: null, baselineGrams: null }),
      ing("riz", 100, { fixed: true }),
    ])],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 200, null)],
    measure: pocketMeasure,
  });
  const byId = new Map(out.units[0].ingredients.map((i) => [i.ingredientId, i]));
  assertEquals(byId.get("eau")!.grams, 400);
  assertEquals(byId.get("eau")!.fixedReason, "water");
  assertEquals(byId.get("sel")!.grams, 5);
  assertEquals(byId.get("sel")!.fixedReason, "condiment");
  assertEquals(byId.get("huile")!.fixedReason, "unweighed");
  assertEquals(byId.get("riz")!.fixedReason, "caller_fixed");
  assertEquals(out.counts.fixed_by_reason.water, 1);
  assertEquals(out.counts.fixed_by_reason.condiment, 1);
  assertEquals(out.counts.fixed_by_reason.unweighed, 1);
  assertEquals(out.counts.fixed_by_reason.caller_fixed, 1);
  assertEquals(out.counts.ingredients_adjustable, 2);
  // et le module a quand même travaillé avec les deux lignes qui restaient
  assert(out.moves.length > 0);
});

Deno.test("une unité déclarée NON AJUSTABLE reste intacte et RESSORT pour le modèle", () => {
  const out = adjustProportions({
    units: [
      unit("fige", BASE(), { adjustable: false, fixedReason: "la méthode écrit les grammes" }),
    ],
    consumers: [consumer("c", [{ unitId: "fige", share: 1 }], 250, null)],
    measure: pocketMeasure,
  });
  assertEquals(out.moves.length, 0);
  assertEquals(out.units[0].ingredients.map((i) => i.grams), [300, 200, 100, 40]);
  assertEquals(out.fixedUnits, [{ unitId: "fige", reason: "la méthode écrit les grammes" }]);
  assertEquals(out.counts.stopped.all_fixed, 1);
  assertEquals(out.counts.fixed_by_reason.unit_fixed, 4);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LE CAS DUR: UNE CASSEROLE PARTAGÉE PAR DEUX ASSIETTES AUX COULOIRS DIFFÉRENTS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ UNE PORTION DÉJÀ CONFORME N'EST JAMAIS DÉGRADÉE, même pour fermer sa voisine", () => {
  // Une casserole, deux assiettes. `a` est conforme (103,2 dans [100, 112]),
  // `b` ne l'est pas (82,1 pour un minimum de 120). Densifier la casserole
  // monte les DEUX: le module doit refuser tout déplacement qui sortirait `a`,
  // même si c'est le seul qui rapprocherait `b` de son plancher.
  const pot = unit("pot", [ing("légume", 400), ing("riz", 200), ing("poulet", 100)], {
    kind: "preparation",
  });
  const da = unit("da", [ing("poulet", 60)]);
  const db = unit("db", [ing("légume", 100)]);
  const out = adjustProportions({
    units: [pot, da, db],
    consumers: [
      consumer("a", [{ unitId: "pot", share: 0.5 }, { unitId: "da", share: 1 }], 100, 112),
      consumer("b", [{ unitId: "pot", share: 0.5 }, { unitId: "db", share: 1 }], 120, 250),
    ],
    measure: pocketMeasure,
  });
  assertEquals(out.counts.consumers_degraded, 0);
  assert(densityAfter(out, "a") <= 112 + 1e-6, `a est sortie: ${densityAfter(out, "a")}`);
  assertEquals(out.components[0].stop, "would_degrade");
  // les trois unités sont bien UNE SEULE composante: la casserole les lie
  assertEquals(out.components.length, 1);
  assertEquals(out.components[0].unitIds, ["da", "db", "pot"]);
  // b s'est améliorée sans casser a
  const b = out.consumers.find((c) => c.consumerId === "b")!;
  assert(b.after!.per100G > b.before!.per100G, "b n'a pas bougé");
  assert(out.counts.rejected_would_degrade > 0, "aucun candidat n'a été refusé: la garde dort");
});

Deno.test("trois assiettes sur une casserole: la composante est UNE, et chaque couloir est jugé", () => {
  const pot = unit("pot", [ing("légume", 600), ing("riz", 300), ing("poulet", 300)], {
    kind: "preparation",
  });
  const out = adjustProportions({
    units: [pot, unit("d1", [ing("pomme", 50)]), unit("d2", [ing("pomme", 50)])],
    consumers: [
      consumer("p1", [{ unitId: "pot", share: 1 / 3 }, { unitId: "d1", share: 1 }], 110, 250),
      consumer("p2", [{ unitId: "pot", share: 1 / 3 }, { unitId: "d2", share: 1 }], 120, 250),
      consumer("p3", [{ unitId: "pot", share: 1 / 3 }], 120, 250),
    ],
    measure: pocketMeasure,
  });
  assertEquals(out.components.length, 1);
  assertEquals(out.counts.consumers_total, 3);
  assertEquals(out.counts.consumers_degraded, 0);
  assertEquals(out.outcome, "closed");
  for (const c of out.consumers) {
    assert(c.after!.per100G >= c.minPer100G! - 0.05, `${c.consumerId} sous son plancher`);
  }
});

Deno.test("deux casseroles sans assiette commune font DEUX composantes, chacune avec son budget", () => {
  const out = adjustProportions({
    units: [
      unit("potA", [ing("légume", 300), ing("poulet", 100)], { kind: "preparation" }),
      unit("potB", [ing("légume", 300), ing("poulet", 100)], { kind: "preparation" }),
    ],
    consumers: [
      consumer("a", [{ unitId: "potA", share: 1 }], 120, 250),
      consumer("b", [{ unitId: "potB", share: 1 }], 120, 250),
    ],
    measure: pocketMeasure,
  });
  assertEquals(out.components.length, 2);
  assertEquals(out.components.map((c) => c.componentId), ["potA", "potB"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ LES ARRÊTS: 200 DÉPLACEMENTS, ET LE MOT EXACT QUAND ON NE TROUVE PAS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LE PLAFOND DE 200 DÉPLACEMENTS EST ATTEINT ET NOMMÉ", () => {
  // Des marges énormes et un couloir hors d'atteinte: la recherche améliore à
  // chaque pas, sans jamais fermer. C'est le budget qui l'arrête, et il le dit.
  const out = adjustProportions({
    units: [unit("u", [ing("légume", 3000), ing("riz", 2000)])],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 250, null)],
    measure: pocketMeasure,
  });
  assertEquals(out.components[0].moves, MAX_MOVES_PER_COMPONENT);
  assertEquals(out.components[0].stop, "move_budget");
  assertEquals(out.counts.stopped.move_budget, 1);
  assertEquals(out.counts.moves_total, MAX_MOVES_PER_COMPONENT);
});

Deno.test("« aucune solution trouvée dans ces limites » est rendu — et ne dit PAS « impossible »", () => {
  const out = adjustProportions({
    units: [unit("u", BASE())],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 250, null)],
    measure: pocketMeasure,
  });
  assertEquals(out.outcome, "not_found_within_limits");
  assertEquals(out.remaining.length, 1);
  assertEquals(out.remaining[0].note, NO_SOLUTION_WITHIN_LIMITS);
  assertEquals(out.remaining[0].side, "below");
  assert(out.remaining[0].gapPer100G! > 0);
  assertEquals(out.remaining[0].unitIds, ["u"]);
  // ⛔ Le mot compte. Ni le jeton, ni la phrase ne prétendent une impossibilité.
  const dit = `${out.outcome} ${out.remaining[0].note} ${out.components[0].outcome}`;
  assertEquals(dit.toLowerCase().includes("impossible"), false);
  assertEquals(NO_SOLUTION_WITHIN_LIMITS, "aucune solution trouvée dans ces limites");
  // et la recherche a bel et bien travaillé avant de le dire
  assert(out.moves.length > 0, "rien n'a été essayé: « pas trouvé » ne voudrait rien dire");
});

Deno.test("un couloir déjà tenu ne fait RIEN — et le dit", () => {
  const out = adjustProportions({
    units: [unit("u", BASE())],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 100, 200)],
    measure: pocketMeasure,
  });
  assertEquals(out.outcome, "nothing_to_do");
  assertEquals(out.moves.length, 0);
  assertEquals(out.remaining.length, 0);
  assertEquals(out.counts.consumers_off_before, 0);
  assertEquals(out.units[0].touched, false);
});

Deno.test("une mesure qui s'abstient ne fait pas déplacer à l'aveugle: elle est comptée", () => {
  const muet: MeasureFn = () => ({ kcal: null, readyG: null });
  const out = adjustProportions({
    units: [unit("u", BASE())],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }], 250, null)],
    measure: muet,
  });
  assertEquals(out.moves.length, 0);
  assertEquals(out.counts.fixed_by_reason.unmeasurable, 4);
  assertEquals(out.counts.consumers_unmeasurable, 1);
  assertEquals(out.remaining[0].side, "unmeasurable");
  assertEquals(out.remaining[0].note, "mesure indisponible");
});

Deno.test("une assiette qui cite une unité inconnue est comptée, jamais avalée en silence", () => {
  const out = adjustProportions({
    units: [unit("u", BASE())],
    consumers: [consumer("c", [{ unitId: "u", share: 1 }, { unitId: "fantome", share: 1 }], 250, null)],
    measure: pocketMeasure,
  });
  assertEquals(out.counts.unknown_units, 1);
  assertEquals(out.counts.consumers_unmeasurable, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ LES DEUX CAS RÉELS DE L'ENQUÊTE DU 11 SEPTEMBRE
//
// Référentiel et quantités relevés dans `stages.json` de
// `scratchpad/2026-09-11-ENQUETE-DEUX-DIRECTIONS/`. La mesure ci-dessous
// reproduit `dishEnergy` + `weighedReadyGrams`: énergie par 100 g CRUS ×
// escompte d'Atwater, grammes prêts = crus × rendement, et l'eau retirée des
// grammes prêts SEULEMENT si une ligne est `grain_absorbs`.
// ═══════════════════════════════════════════════════════════════════════════

type RealRef = {
  kcal: number;
  atwater: number;
  yieldFactor: number;
  grainAbsorbs: boolean;
  group: FoodGroupRef;
  condimentGrams: number | null;
};

const REAL: Record<string, RealRef> = {
  "cuisses de poulet désossées": { kcal: 114.0, atwater: 1, yieldFactor: 0.69, grainAbsorbs: false, group: "poultry", condimentGrams: null },
  "quinoa": { kcal: 358.0, atwater: 1, yieldFactor: 2.6, grainAbsorbs: true, group: "whole_grain", condimentGrams: null },
  "courgette": { kcal: 16.5, atwater: 1, yieldFactor: 0.9, grainAbsorbs: false, group: "non_starchy_veg", condimentGrams: null },
  "poivron rouge": { kcal: 26.0, atwater: 1, yieldFactor: 0.9, grainAbsorbs: false, group: "non_starchy_veg", condimentGrams: null },
  "oignon": { kcal: 38.4, atwater: 1, yieldFactor: 0.9, grainAbsorbs: false, group: "non_starchy_veg", condimentGrams: null },
  "huile d'olive": { kcal: 900.0, atwater: 1, yieldFactor: 1, grainAbsorbs: false, group: "olive_oil", condimentGrams: null },
  "paprika": { kcal: 319.0, atwater: 1, yieldFactor: 1, grainAbsorbs: false, group: "sauce_dressing", condimentGrams: 0.5 },
  "sel": { kcal: 0.0, atwater: 1, yieldFactor: 1, grainAbsorbs: false, group: "sauce_dressing", condimentGrams: 0.5 },
  "poivre noir": { kcal: 330.0, atwater: 1, yieldFactor: 1, grainAbsorbs: false, group: "sauce_dressing", condimentGrams: 0.5 },
  "yaourt nature": { kcal: 59.0, atwater: 1, yieldFactor: 1, grainAbsorbs: false, group: "dairy_yogurt", condimentGrams: null },
  "citron": { kcal: 27.6, atwater: 1, yieldFactor: 1, grainAbsorbs: false, group: "citrus", condimentGrams: null },
  "feta": { kcal: 285.0, atwater: 1, yieldFactor: 1, grainAbsorbs: false, group: "dairy_cheese", condimentGrams: null },
  "roquette": { kcal: 27.9, atwater: 1, yieldFactor: 1, grainAbsorbs: false, group: "leafy_greens", condimentGrams: null },
  "tomate": { kcal: 19.3, atwater: 1, yieldFactor: 1, grainAbsorbs: false, group: "non_starchy_veg", condimentGrams: null },
  "pain complet": { kcal: 262.0, atwater: 1, yieldFactor: 1, grainAbsorbs: false, group: "whole_grain", condimentGrams: null },
  "lentilles vertes sèches": { kcal: 331.3, atwater: 1, yieldFactor: 2.4, grainAbsorbs: false, group: "legumes", condimentGrams: null },
  "tomates": { kcal: 19.3, atwater: 1, yieldFactor: 1, grainAbsorbs: false, group: "non_starchy_veg", condimentGrams: null },
  "eau": { kcal: 0.0, atwater: 1, yieldFactor: 1, grainAbsorbs: false, group: "water", condimentGrams: 1 },
};

/** `false` = la règle de l'eau d'aujourd'hui; `true` = l'eau absorbée (lot B). */
function realMeasure(waterAbsorbed: boolean): MeasureFn {
  return (ings) => {
    const rows = ings.map((i) => ({ ref: REAL[i.term], grams: i.grams }));
    if (rows.some((r) => r.ref === undefined)) return { kcal: null, readyG: null };
    const absorbs = rows.some((r) => r.ref.grainAbsorbs);
    let kcal = 0;
    let readyG = 0;
    let any = false;
    for (const r of rows) {
      const g = r.grams ?? r.ref.condimentGrams;
      if (g === null || !(g > 0)) continue;
      kcal += (g * r.ref.kcal * r.ref.atwater) / 100;
      if (r.ref.group === "water" && (absorbs || waterAbsorbed)) continue;
      readyG += g * r.ref.yieldFactor;
      any = true;
    }
    return any ? { kcal, readyG } : { kcal: null, readyG: null };
  };
}

/**
 * ⚠️ L'IDENTIFIANT EST PRÉFIXÉ PAR SON UNITÉ, et c'est l'exemple à copier.
 * « huile d'olive » vit dans la casserole ET dans deux plats du même plan: sans
 * préfixe, la `MeasureFn` de l'appelant — qui reçoit une liste NUE — ne saurait
 * pas laquelle des trois lignes elle doit reconstruire.
 */
function realIng(unitId: string, term: string, grams: number | null): AdjustableIngredient {
  const r = REAL[term];
  return {
    ingredientId: `${unitId}#${term}`,
    term,
    grams,
    baselineGrams: grams,
    group: r.group,
    isCondiment: r.condimentGrams !== null,
    fixed: false,
  };
}

/** PERTE, première génération: `prep_poulet_quinoa` tiré par TROIS assiettes. */
function pertePlan() {
  return {
    units: [
      unit("prep_poulet_quinoa", [
        realIng("prep_poulet_quinoa", "cuisses de poulet désossées", 750),
        realIng("prep_poulet_quinoa", "quinoa", 330),
        realIng("prep_poulet_quinoa", "courgette", 400),
        realIng("prep_poulet_quinoa", "poivron rouge", 300),
        realIng("prep_poulet_quinoa", "oignon", 120),
        realIng("prep_poulet_quinoa", "huile d'olive", 15),
        realIng("prep_poulet_quinoa", "paprika", 10),
        realIng("prep_poulet_quinoa", "sel", null),
        realIng("prep_poulet_quinoa", "poivre noir", null),
      ], { kind: "preparation" as const }),
      unit("fri_dinner", [realIng("fri_dinner", "yaourt nature", 50), realIng("fri_dinner", "citron", 30)]),
      unit("sat_lunch", [
        realIng("sat_lunch", "feta", 50),
        realIng("sat_lunch", "roquette", 40),
        realIng("sat_lunch", "huile d'olive", 5),
        realIng("sat_lunch", "citron", 30),
      ]),
      unit("sun_lunch", [
        realIng("sun_lunch", "tomate", 100),
        realIng("sun_lunch", "pain complet", 120),
        realIng("sun_lunch", "huile d'olive", 5),
      ]),
    ],
    // Couloirs réels: cible 858,9 kcal dans 250–700 g ⇒ 123 ; cible 981,6 ⇒ 141.
    // Le plafond de demande du dépôt est 250 kcal/100 g.
    consumers: [
      consumer(
        "fri_dinner",
        [{ unitId: "prep_poulet_quinoa", share: 1 / 3 }, { unitId: "fri_dinner", share: 1 }],
        123,
        250,
        135,
      ),
      consumer(
        "sat_lunch",
        [{ unitId: "prep_poulet_quinoa", share: 1 / 3 }, { unitId: "sat_lunch", share: 1 }],
        141,
        250,
        154,
      ),
      consumer(
        "sun_lunch",
        [{ unitId: "prep_poulet_quinoa", share: 1 / 3 }, { unitId: "sun_lunch", share: 1 }],
        141,
        250,
        154,
      ),
    ],
  };
}

/** GAIN, première génération: `prep_lentil_ratatouille` et ses 500 ml d'eau. */
function gainPlan() {
  return {
    units: [
      unit("prep_lentil_ratatouille", [
        realIng("prep_lentil_ratatouille", "lentilles vertes sèches", 140),
        realIng("prep_lentil_ratatouille", "tomates", 300),
        realIng("prep_lentil_ratatouille", "courgette", 250),
        realIng("prep_lentil_ratatouille", "oignon", 120),
        realIng("prep_lentil_ratatouille", "huile d'olive", 30),
        realIng("prep_lentil_ratatouille", "eau", 500),
        realIng("prep_lentil_ratatouille", "sel", null),
        realIng("prep_lentil_ratatouille", "poivre noir", null),
      ], { kind: "preparation" as const }),
      unit("fri_dinner", [
        realIng("fri_dinner", "pain complet", 90),
        realIng("fri_dinner", "feta", 40),
        realIng("fri_dinner", "huile d'olive", 5),
        realIng("fri_dinner", "citron", 30),
      ]),
    ],
    // Cible 1 019,2 kcal dans 250–700 g ⇒ minimum 146 kcal/100 g.
    consumers: [
      consumer(
        "fri_dinner",
        [{ unitId: "prep_lentil_ratatouille", share: 0.5 }, { unitId: "fri_dinner", share: 1 }],
        146,
        250,
        160,
      ),
    ],
  };
}

Deno.test("le banc reproduit les mesures de l'enquête: 105,4 / 119,9 / 125,5 et 92,2", () => {
  // Sans cela, tout le reste de ce bloc mesurerait autre chose que les vrais cas.
  const perte = adjustProportions({
    ...pertePlan(),
    consumers: pertePlan().consumers.map((c) => ({ ...c, minPer100G: null, maxPer100G: null })),
    measure: realMeasure(false),
  });
  const p = (id: string) =>
    Math.round(perte.consumers.find((c) => c.consumerId === id)!.before!.per100G * 10) / 10;
  assertEquals(p("fri_dinner"), 105.4);
  assertEquals(p("sat_lunch"), 119.9);
  assertEquals(p("sun_lunch"), 125.5);

  const gain = adjustProportions({
    ...gainPlan(),
    consumers: gainPlan().consumers.map((c) => ({ ...c, minPer100G: null, maxPer100G: null })),
    measure: realMeasure(false),
  });
  assertEquals(
    Math.round(gain.consumers[0].before!.per100G * 10) / 10,
    92.2,
  );
});

Deno.test("CAS RÉEL PERTE — la casserole tirée par trois assiettes se ferme SANS appel modèle", () => {
  const out = adjustProportions({ ...pertePlan(), measure: realMeasure(false) });
  assertEquals(out.counts.consumers_off_before, 3);
  assertEquals(out.counts.consumers_degraded, 0);
  assertEquals(out.outcome, "closed");
  assertEquals(out.counts.consumers_off_after, 0);
  for (const c of out.consumers) {
    assert(
      c.after!.per100G >= c.minPer100G! - 0.05,
      `${c.consumerId}: ${c.after!.per100G} sous ${c.minPer100G}`,
    );
  }
  // ⛔ Et l'huile n'a pas servi de rattrapage: elle reste dans sa bande.
  for (const u of out.units) {
    for (const i of u.ingredients) {
      if (i.term !== "huile d'olive" || i.ratioToBaseline === null) continue;
      assert(
        i.ratioToBaseline >= ADDED_FAT_FLOOR_RATIO - 1e-9 &&
          i.ratioToBaseline <= ADDED_FAT_CEILING_RATIO + 1e-9,
        `huile hors bande dans ${u.unitId}: ${i.ratioToBaseline}`,
      );
    }
  }
  // les condiments non pesés n'ont pas bougé
  const pot = out.units.find((u) => u.unitId === "prep_poulet_quinoa")!;
  assertEquals(pot.ingredients.find((i) => i.ingredientId === "prep_poulet_quinoa#sel")!.grams, null);
  assertEquals(pot.ingredients.find((i) => i.ingredientId === "prep_poulet_quinoa#paprika")!.grams, 10);
});

Deno.test("CAS RÉEL GAIN — 500 g d'eau FIXES tiennent l'écart ouvert: on le DIT, chiffré", () => {
  const out = adjustProportions({ ...gainPlan(), measure: realMeasure(false) });
  assertEquals(out.outcome, "not_found_within_limits");
  assertEquals(out.remaining.length, 1);
  assertEquals(out.remaining[0].note, NO_SOLUTION_WITHIN_LIMITS);
  assertEquals(out.remaining[0].side, "below");
  // On est monté, sans atteindre le plancher de 146.
  const after = out.consumers[0].after!.per100G;
  assert(after > 92.2, `aucune amélioration: ${after}`);
  assert(after < 146, `fermé alors qu'on l'attendait ouvert: ${after}`);
  // L'eau n'a pas bougé d'un gramme: c'est la convention produit, et c'est
  // AUSSI ce qui rend le cas insoluble ici — 500 g sur 1 500 à zéro kcal.
  const pot = out.units.find((u) => u.unitId === "prep_lentil_ratatouille")!;
  assertEquals(pot.ingredients.find((i) => i.ingredientId === "prep_lentil_ratatouille#eau")!.grams, 500);
  assertEquals(pot.ingredients.find((i) => i.ingredientId === "prep_lentil_ratatouille#eau")!.fixedReason, "water");
});

Deno.test("CAS RÉEL GAIN — la MÊME recette se ferme dès que l'eau est comptée comme absorbée", () => {
  // Même ajusteur, mêmes bornes, même casserole: seule la règle de l'eau change
  // (c'est le lot B qui la porte, `WaterTreatment`). L'écart de 92,2 contre 146
  // n'était donc pas une limite de l'ajustement, mais une limite de la MESURE.
  const out = adjustProportions({ ...gainPlan(), measure: realMeasure(true) });
  assertEquals(out.outcome, "closed");
  assertEquals(out.counts.consumers_off_after, 0);
  assert(out.consumers[0].after!.per100G >= 146 - 0.05);
  assertEquals(
    out.units.find((u) => u.unitId === "prep_lentil_ratatouille")!.ingredients.find((i) =>
      i.ingredientId === "prep_lentil_ratatouille#eau"
    )!.grams,
    500,
  );
});

Deno.test("CAS RÉEL PERTE — deux passes ne cumulent pas les ratios sur la vraie casserole", () => {
  const un = adjustProportions({ ...pertePlan(), measure: realMeasure(false) });
  const rebranche = un.units.map((u) => ({
    unitId: u.unitId,
    kind: u.kind,
    adjustable: u.adjustable,
    fixedReason: u.fixedReason,
    bodies: EVERY_LINE_ITS_OWN_FREE_BODY(u.unitId, u.ingredients.map((i) => i.ingredientId)),
    ingredients: u.ingredients.map((i) => ({
      ingredientId: i.ingredientId,
      term: i.term,
      grams: i.grams,
      baselineGrams: i.baselineGrams,
      group: REAL[i.term].group,
      isCondiment: REAL[i.term].condimentGrams !== null,
      fixed: false,
    })),
  }));
  // Un couloir hors d'atteinte pour forcer la deuxième passe à pousser partout.
  const deux = adjustProportions({
    units: rebranche,
    consumers: pertePlan().consumers.map((c) => ({ ...c, minPer100G: 250 })),
    measure: realMeasure(false),
  });
  for (const u of deux.units) {
    for (const i of u.ingredients) {
      if (i.fixed || i.ratioToBaseline === null) continue;
      const b = ratioBoundsFor(REAL[i.term].group);
      assert(
        i.ratioToBaseline <= b.ceiling + 1e-9 && i.ratioToBaseline >= b.floor - 1e-9,
        `${u.unitId}/${i.term} à ${i.ratioToBaseline}, bande [${b.floor}, ${b.ceiling}]`,
      );
    }
  }
  // le poulet est bien monté jusqu'à son plafond — 1,5, pas 2,25
  assertEquals(ratio(deux, "prep_poulet_quinoa", "prep_poulet_quinoa#cuisses de poulet désossées"), 1.5);
});

Deno.test("CAS RÉEL PERTE — les déplacements sont traçables un par un, et comptés", () => {
  const out = adjustProportions({ ...pertePlan(), measure: realMeasure(false) });
  assert(out.moves.length > 0);
  assertEquals(out.moves.map((m) => m.index), out.moves.map((_, i) => i + 1));
  assertEquals(out.counts.moves_total, out.moves.length);
  assertEquals(out.counts.moves_paired + out.counts.moves_one_sided, out.moves.length);
  for (const m of out.moves) {
    assert(m.violationAfter <= m.violationBefore, "un déplacement a aggravé le défaut");
    assert(m.cookedG > 0 && m.cookedG <= 5 + 1e-9, `pas de 5 g cuits dépassé: ${m.cookedG}`);
    assert(
      m.kind === "paired" ? m.fromIngredientId !== null && m.toIngredientId !== null : true,
      "un apparié sans ses deux bouts",
    );
  }
  assert(out.counts.measure_calls > 0);
  // ⛔ UN APPARIÉ CONSERVE LA MASSE. Ce qui reste après la grille du dixième de
  // gramme est une dérive NETTE, et elle doit rester sous le gramme sur une
  // casserole de 2 139 g. Une dérive qui gonfle dirait que l'arrondi est biaisé
  // dans un sens — et un biais d'un sens, répété 30 fois, n'est plus un arrondi.
  assert(
    Math.abs(out.counts.paired_ready_drift_g) < 1,
    `dérive d'arrondi trop grande: ${out.counts.paired_ready_drift_g}`,
  );
  assertNotEquals(out.units.find((u) => u.unitId === "prep_poulet_quinoa")!.touched, false);
});
