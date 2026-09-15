/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 2 § 2.4 — LES BORNES CONCERNENT LE **REPAS**, PAS UN CONTENANT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── ⛔ LE DÉFAUT, MESURÉ (tir `perte-iso10`, plan `d1b0036e`) ─────────────
 * `splitPlateWithComplement` avait partagé l'assiette de la bouche végane :
 * **216 g** du plat commun + **9 g** de complément = **225 g**, exactement son
 * plancher. Deux plats à la même case, donc DEUX contenants à son nom.
 * `fitPortionsToBounds` les a jugés séparément, a relevé la part commune à 225
 * (`raised: 2, grams_raised: 14` sur les deux jours), et l'assiette écrite pèse
 * **234 g** — 563,6 kcal pour une cible de 542,85, soit **+3,8 %**.
 *
 * `finalPortionCheck` faisait la même erreur en sens inverse : il rendait DEUX
 * verdicts `under_min` sur un repas exactement conforme, et l'énergie
 * réellement servie — la somme des deux contenants — n'était mesurée nulle part.
 *
 * ── LES MUTATIONS QUE CES ÉPREUVES DOIVENT FAIRE ROUGIR ──────────────────
 *   M1 — `fitPortionsToBounds` rejuge chaque contenant séparément : la part
 *        commune remonte, et le repas dépasse. ROUGE (épreuves ① et ⑤).
 *   M2 — la limite d'un composant est supprimée en bloc (`MIN_ITEM_GRAMS`, la
 *        marge de casserole, le frais qu'on ne remonte pas). ROUGE (③, ④).
 *   M3 — `finalPortionCheck` juge par contenant : deux fausses alarmes sur un
 *        repas conforme. ROUGE (⑥).
 *   M4 — la somme d'énergie d'un repas ignore un composant muet et rend un
 *        total partiel qui a l'air d'un résultat. ROUGE (⑦).
 *   M5 — un bac entre dans un repas et se fait juger comme une assiette.
 *        ROUGE (⑧).
 */
import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  type BoundedBox,
  emptyPortionBoundaryCounts,
  fitPortionsToBounds,
  type PortionBounds,
} from "./portion_boundary.ts";
import {
  buildCompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import { finalPortionCheck, type PlateBounds } from "./portion_sizing.ts";

// ───────────────────────────────────────────────────────────────────────────
// LE RÉFÉRENTIEL MINIMAL — deux aliments lisibles, un qui ne l'est pas.
// ───────────────────────────────────────────────────────────────────────────
function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "vegetables",
    label: over.slug,
    source: "ciqual",
    energyKcal: 20,
    proteinG: 1,
    carbsG: 3,
    fatG: 0.2,
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
    atwaterDiscount: 1.0,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  } as CompositionRef;
}
const INDEX = buildCompositionIndex([
  ref({ slug: "tofu", foodGroupRef: "legumes", energyKcal: 145, proteinG: 16, carbsG: 2, fatG: 8, fiberG: 1 }),
  ref({ slug: "courgette", energyKcal: 17, proteinG: 1.2 }),
  ref({ slug: "water", foodGroupRef: "water", energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }),
], []);
const g = (term: string, amount: number, unit: "g" | "ml" = "g") => ({
  term,
  amount,
  unit,
  state: unit === "ml" ? null : ("raw" as const),
});

/** Les bornes d'assiette du cas du rapport: plancher 225, plafond 660. */
const BORNES: PortionBounds = { min: 225, max: 660 };

/** Le repas partagé du rapport: 216 g de plat commun + 9 g de complément. */
function repasDuRapport(): BoundedBox[] {
  return [
    {
      boxId: "box_mon_dinner_2_lea",
      day: "mon",
      slot: "dinner",
      memberIds: ["lea"],
      items: [
        { preparationId: "prep_tofu_table", grams: 158, group: null },
        { preparationId: null, grams: 32, group: null },
        { preparationId: null, grams: 8, group: null },
        { preparationId: null, grams: 7, group: null },
        { preparationId: null, grams: 11, group: null },
      ],
    },
    {
      boxId: "box_mon_dinner_10_lea",
      day: "mon",
      slot: "dinner",
      memberIds: ["lea"],
      items: [{ preparationId: null, grams: 9, group: null }],
    },
  ];
}

const total = (boxes: readonly BoundedBox[]) =>
  boxes.reduce((a, b) => a + b.items.reduce((x, i) => x + i.grams, 0), 0);

// ═══════════════════════════════════════════════════════════════════════════
// ① LE CAS DU RAPPORT — 216 + 9 = 225, SON PLANCHER
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("§2.4 ① — 216 g + 9 g font 225 g: le plancher est ATTEINT, rien ne bouge", () => {
  const boxes = repasDuRapport();
  assertEquals(total(boxes), 225, "la fixture ne reproduit pas le cas du rapport");
  const counts = fitPortionsToBounds({
    boxes,
    boundsFor: () => BORNES,
    potReadyGrams: new Map([["prep_tofu_table", 2000]]),
    potMarginPercent: 1,
  });
  // ⛔ AVANT CE LOT: `raised: 1, grams_raised: 9` sur la part commune (elle
  // passait de 216 à 225) ET `still_under_min: 1` sur le complément, pour une
  // assiette écrite de 234 g — 4 % au-dessus de la cible. Le rapport l'a mesuré
  // à `raised: 2, grams_raised: 14` sur ses deux jours.
  assertEquals(total(boxes), 225, "le repas a été relevé au-dessus de sa cible");
  assertEquals(boxes[0].items.map((i) => i.grams), [158, 32, 8, 7, 11], "la part commune a bougé");
  assertEquals(boxes[1].items[0].grams, 9, "le complément a bougé");
  assertEquals(counts.raised, 0);
  assertEquals(counts.grams_raised, 0);
  assertEquals(counts.still_under_min, 0);
  assertEquals(counts.already_in_bounds, 1, "le repas est conforme, une fois");
  // ⛔ LA POPULATION DU LOT, NOMMÉE. Sans elle, « la règle ne mord pas » et
  // « la règle n'est pas branchée » se relisent pareil.
  assertEquals(counts.boxes, 2);
  assertEquals(counts.meals, 1);
  assertEquals(counts.multi_box_meals, 1);
  assertEquals(counts.judged, 1);
});

Deno.test("§2.4 ① bis — LE CAS QUI MORD: deux MOMENTS différents restent deux repas", () => {
  // ⛔ LA CONTRE-ÉPREUVE DU REGROUPEMENT. Si l'on additionnait n'importe quels
  // contenants d'une même bouche, ce cas-ci passerait aussi — et ce serait faux:
  // un déjeuner et un dîner sont deux assiettes, chacune avec son plancher.
  const boxes = repasDuRapport();
  boxes[1] = { ...boxes[1], slot: "lunch" };
  const counts = fitPortionsToBounds({
    boxes,
    boundsFor: () => BORNES,
    potReadyGrams: new Map([["prep_tofu_table", 2000]]),
    potMarginPercent: 1,
  });
  assertEquals(counts.meals, 2);
  assertEquals(counts.multi_box_meals, 0);
  // Les 216 g du dîner remontent à 225 (la casserole a la marge), et les 9 g du
  // déjeuner — du frais seul — ne peuvent pas être remontés.
  assertEquals(counts.raised, 1);
  assertEquals(counts.grams_raised, 9);
  assertEquals(counts.still_under_min, 1);
  assertEquals(counts.pot_headroom_blocked, 0, "aucune casserole n'était en cause");
});

// ═══════════════════════════════════════════════════════════════════════════
// ② UN COMPLÉMENT DENSE — LE REPAS DÉPASSE, ON RABOTE LA SOMME
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("§2.4 ② — complément DENSE: le rabotage porte sur le repas, pas sur un plat", () => {
  // Un complément riche et petit (40 g) à côté d'une part commune de 650 g:
  // 690 g contre un plafond de 660. Ce sont 30 g à retirer DU REPAS.
  const boxes: BoundedBox[] = [
    {
      boxId: "commun",
      day: "tue",
      slot: "dinner",
      memberIds: ["lea"],
      items: [{ preparationId: "pot", grams: 500, group: null }, { preparationId: null, grams: 150, group: null }],
    },
    {
      boxId: "complement",
      day: "tue",
      slot: "dinner",
      memberIds: ["lea"],
      items: [{ preparationId: null, grams: 40, group: null }],
    },
  ];
  const counts = fitPortionsToBounds({
    boxes,
    boundsFor: () => BORNES,
    potReadyGrams: new Map([["pot", 600]]),
    potMarginPercent: 1,
  });
  assertEquals(total(boxes), 660, "le repas ne retombe pas sur son plafond");
  assertEquals(counts.shaved, 1);
  assertEquals(counts.grams_shaved, 30);
  assertEquals(counts.still_over_max, 0);
  // ⛔ LE PLUS GROS ITEM DU REPAS D'ABORD, ET C'EST LA MÊME RÈGLE QU'AVANT: un
  // gramme retiré du plus gros composant déplace le moins la recette.
  assertEquals(boxes[0].items.map((i) => i.grams), [470, 150]);
  // ⚠️ ET LE COMPLÉMENT N'EST PAS SACRIFIÉ. Il porte l'énergie que le rabotage
  // de la part commune a retirée: le vider serait défaire le partage.
  assertEquals(boxes[1].items[0].grams, 40);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ UN COMPLÉMENT LÉGER — LE REPAS MANQUE, ON REMONTE DANS LA CASSEROLE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("§2.4 ③ — complément LÉGER: le repas remonte, et jamais au-delà du lot", () => {
  const boxes: BoundedBox[] = [
    {
      boxId: "commun",
      day: "tue",
      slot: "dinner",
      memberIds: ["lea"],
      items: [{ preparationId: "pot", grams: 150, group: null }],
    },
    {
      boxId: "complement",
      day: "tue",
      slot: "dinner",
      memberIds: ["lea"],
      items: [{ preparationId: null, grams: 60, group: null }],
    },
  ];
  const counts = fitPortionsToBounds({
    boxes,
    // 150 + 60 = 210, plancher 225 ⇒ il manque 15 g.
    boundsFor: () => BORNES,
    potReadyGrams: new Map([["pot", 300]]),
    potMarginPercent: 1,
  });
  assertEquals(total(boxes), 225);
  assertEquals(counts.raised, 1);
  assertEquals(counts.grams_raised, 15);
  // ⛔ LA LIMITE DU COMPOSANT TIENT: le frais du complément ne se remonte pas
  // (servir 15 g d'un aliment que la recette ne porte pas est une invention),
  // donc les 15 g viennent de la casserole.
  assertEquals(boxes[0].items[0].grams, 165);
  assertEquals(boxes[1].items[0].grams, 60);
});

Deno.test("§2.4 ③ bis — la marge du LOT reste une limite du composant, et elle se nomme", () => {
  // La casserole produit 160 g prêts, marge 1 % ⇒ 161 g au plus. Le repas est à
  // 210 g pour un plancher de 225: il manque 15 g, la casserole n'en offre que
  // 11. ⛔ ON NE RÉPARE PAS À MOITIÉ: rien ne bouge, et le refus se NOMME.
  const boxes: BoundedBox[] = [
    {
      boxId: "commun",
      day: "tue",
      slot: "dinner",
      memberIds: ["lea"],
      items: [{ preparationId: "pot", grams: 150, group: null }],
    },
    {
      boxId: "complement",
      day: "tue",
      slot: "dinner",
      memberIds: ["lea"],
      items: [{ preparationId: null, grams: 60, group: null }],
    },
  ];
  const counts = fitPortionsToBounds({
    boxes,
    boundsFor: () => BORNES,
    potReadyGrams: new Map([["pot", 160]]),
    potMarginPercent: 1,
  });
  assertEquals(total(boxes), 210, "le lot a été dépassé");
  assertEquals(counts.raised, 0);
  assertEquals(counts.still_under_min, 1);
  assertEquals(counts.pot_headroom_blocked, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ UN INGRÉDIENT NON MESURABLE — LES GRAMMES RESTENT, L'ÉNERGIE SE TAIT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("§2.4 ④ — un ingrédient sans quantité ne fait pas de gramme, et n'en retire aucun", () => {
  // ⛔ `MIN_ITEM_GRAMS` ET LES ITEMS SANS MASSE SONT DEUX LIMITES DE COMPOSANT.
  // Un item à 0 g n'entre pas dans le classement, et aucun item ne descend sous
  // 1 g: un rabotage qui viderait une ligne serait une recomposition.
  const boxes: BoundedBox[] = [
    {
      boxId: "commun",
      day: "tue",
      slot: "dinner",
      memberIds: ["lea"],
      items: [{ preparationId: null, grams: 0, group: null }, { preparationId: null, grams: 1, group: null }],
    },
    {
      boxId: "complement",
      day: "tue",
      slot: "dinner",
      memberIds: ["lea"],
      items: [{ preparationId: null, grams: 1, group: null }],
    },
  ];
  const counts = fitPortionsToBounds({
    boxes,
    boundsFor: () => ({ min: 0, max: 1 }),
    potReadyGrams: new Map(),
    potMarginPercent: 1,
  });
  assertEquals(boxes.flatMap((b) => b.items.map((i) => i.grams)), [0, 1, 1]);
  assertEquals(counts.still_over_max, 1, "le repas de 2 g reste au-dessus de son plafond de 1 g");
  assertEquals(counts.shaved, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ UNE LIMITE FRANCHIE **APRÈS** ARRONDI — ET ELLE L'EST PAR LE REPAS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("§2.4 ⑤ — 631 g franchis PAR LE REPAS retombent à 630, un gramme au plus gros", () => {
  // ⛔ LE CAS DE LA CAMPAGNE (`sun/breakfast 631 g / 630`), mais réparti sur
  // DEUX contenants: chaque contenant respecte la borne, leur somme non. Jugé
  // contenant par contenant, ce dépassement est INVISIBLE.
  const boxes: BoundedBox[] = [
    {
      boxId: "commun",
      day: "sun",
      slot: "breakfast",
      memberIds: ["m1"],
      items: [{ preparationId: "prep_eggs", grams: 401, group: null }, { preparationId: null, grams: 150, group: null }],
    },
    {
      boxId: "complement",
      day: "sun",
      slot: "breakfast",
      memberIds: ["m1"],
      items: [{ preparationId: null, grams: 80, group: null }],
    },
  ];
  const counts = fitPortionsToBounds({
    boxes,
    boundsFor: () => ({ min: 350, max: 630 }),
    potReadyGrams: new Map([["prep_eggs", 800]]),
    potMarginPercent: 1,
  });
  assertEquals(total(boxes), 630);
  assertEquals(boxes[0].items.map((i) => i.grams), [400, 150], "le rabotage n'a pas pris le plus gros du REPAS");
  assertEquals(boxes[1].items[0].grams, 80);
  assertEquals(counts.shaved, 1);
  assertEquals(counts.grams_shaved, 1);
  assertEquals(counts.multi_box_meals, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ ⑦ ⑧ LA MESURE FINALE — UN VERDICT PAR REPAS, ET UNE SOMME HONNÊTE
// ═══════════════════════════════════════════════════════════════════════════

/** Les bornes de `finalPortionCheck`, remplies autour du couple utile. */
const plateau = (min: number, max: number): PlateBounds => ({
  min,
  max,
  preferred: Math.round((min + max) / 2),
  appetiteFactor: 1,
  densityFloorPerG: 1,
  band: "adult",
  slotClass: "meal",
  source: "age_known",
  boundSource: "target",
  physicalMax: max,
});

/** Le plan écrit du rapport: un plat commun en casserole, un complément frais. */
function planEcrit(complementGrams: number) {
  return {
    dishes: [
      {
        day: "mon",
        slot: "dinner",
        method: "",
        ingredients: [],
        uses: [{ preparationId: "prep_tofu_table", servings: 1 }],
        boxes: [{
          id: "box_commun",
          memberIds: ["lea"],
          items: [{ grams: 216, preparationId: "prep_tofu_table" }],
          legacyTotalGrams: null,
        }],
      },
      {
        day: "mon",
        slot: "dinner",
        method: "",
        ingredients: [g("courgette", complementGrams)],
        uses: [],
        boxes: [{
          id: "box_complement",
          memberIds: ["lea"],
          items: [{ grams: complementGrams, preparationId: null }],
          legacyTotalGrams: null,
        }],
      },
    ],
    preparations: [{
      id: "prep_tofu_table",
      servingsMade: 1,
      method: "poeler",
      ingredients: [g("tofu", 216)],
    }],
  };
}

Deno.test("§2.4 ⑥ — la mesure finale rend UN verdict par repas, et il est conforme", () => {
  const plan = planEcrit(9);
  const check = finalPortionCheck({
    index: INDEX,
    dishes: plan.dishes,
    preparations: plan.preparations,
    plateFor: () => plateau(225, 660),
  });
  // ⛔ AVANT CE LOT: `judged: 2`, `verdicts.under_min: 2`, et DEUX seaux
  // `out_of_bounds` (216 g et 9 g contre 225) sur un repas exactement conforme.
  assertEquals(check.boxes, 2, "le dénominateur des CONTENANTS reste");
  assertEquals(check.meals, 1);
  assertEquals(check.multiBoxMeals, 1);
  assertEquals(check.judged, 1);
  assertEquals(check.verdicts.in_bounds, 1);
  assertEquals(check.verdicts.under_min, 0);
  assertEquals(check.outOfBounds, []);
  assertEquals(check.rows.length, 1);
  // ⛔ LE TOTAL RÉELLEMENT SERVI: grammes, énergie ET protéine, sommés une fois.
  assertEquals(check.rows[0].grams, 225);
  assertEquals(check.rows[0].boxIds, ["box_commun", "box_complement"]);
  const kcalTofu = 216 * 1.45;
  const kcalCourgette = 9 * 0.17;
  assertEquals(check.rows[0].kcal, Math.round(kcalTofu + kcalCourgette));
  assertEquals(
    check.rows[0].proteinG,
    Math.round((216 * 0.16 + 9 * 0.012) * 10) / 10,
  );
  assertEquals(check.rows[0].overshootG, 0);
});

Deno.test("§2.4 ⑥ bis — LE CAS QUI MORD: un repas VRAIMENT trop petit reste non conforme", () => {
  // ⛔ UNE GARDE A BESOIN D'UN CAS QUI PASSE **ET** D'UN CAS QUI MORD. Le
  // regroupement ne doit pas rendre tout conforme: 216 + 1 = 217 < 225.
  const plan = planEcrit(1);
  const check = finalPortionCheck({
    index: INDEX,
    dishes: plan.dishes,
    preparations: plan.preparations,
    plateFor: () => plateau(225, 660),
  });
  assertEquals(check.judged, 1);
  assertEquals(check.verdicts.under_min, 1);
  assertEquals(check.rows[0].grams, 217);
  assertEquals(check.rows[0].overshootG, -8, "le manque est NÉGATIF, comme `unmetKcal`");
  assertEquals(check.outOfBounds.length, 1, "un seul seau, celui du repas");
  assertEquals(check.outOfBounds[0].grams, 217);
  assertEquals(check.outOfBounds[0].limit, 225);
  assertEquals(check.outOfBounds[0].bound, "min");
  // ⚠️ LE SEAU NE NOMME TOUJOURS PERSONNE.
  assertEquals(
    Object.keys(check.outOfBounds[0]).sort(),
    ["bound", "day", "grams", "limit", "slot"],
  );
});

Deno.test("§2.4 ⑦ — un composant MUET rend l'énergie du repas `null`, jamais une somme partielle", () => {
  // ⛔ « JE NE SAIS PAS » N'EST PAS « ÇA VA ». Le complément porte un aliment
  // que le référentiel ne résout pas: son énergie est inconnue, donc celle du
  // REPAS aussi. Une somme amputée aurait l'air d'un résultat.
  const plan = planEcrit(9);
  plan.dishes[1].ingredients = [g("ectoplasme", 9)];
  const check = finalPortionCheck({
    index: INDEX,
    dishes: plan.dishes,
    preparations: plan.preparations,
    plateFor: () => plateau(225, 660),
  });
  assertEquals(check.meals, 1);
  assertEquals(check.rows[0].kcal, null, "une somme partielle est sortie");
  assertEquals(check.rows[0].proteinG, null);
  // ⚠️ LES GRAMMES, EUX, RESTENT CONNUS: ce qui manque est une énergie, pas une
  // masse. Le verdict de MASSE tient donc, et le repas est conforme.
  assertEquals(check.rows[0].grams, 225);
  assertEquals(check.verdicts.in_bounds, 1);
});

Deno.test("§2.4 ⑧ — un repas PARTAGÉ: le bac garde sa ligne et n'est jamais jugé", () => {
  const plan = planEcrit(9);
  plan.dishes[1].boxes = [{
    id: "box_bac",
    memberIds: ["lea", "paul"],
    items: [{ grams: 9, preparationId: null }],
    legacyTotalGrams: null,
  }];
  const check = finalPortionCheck({
    index: INDEX,
    dishes: plan.dishes,
    preparations: plan.preparations,
    plateFor: () => plateau(225, 660),
  });
  assertEquals(check.boxes, 2);
  assertEquals(check.tubsNotJudged, 1);
  // ⛔ LE BAC N'EST PAS DANS LE REPAS DE LEA: ses grammes sont une quantité de
  // RÉCIPIENT. Le repas de Lea vaut donc 216 g, et il manque.
  assertEquals(check.meals, 1);
  assertEquals(check.multiBoxMeals, 0);
  assertEquals(check.judged, 1);
  assertEquals(check.verdicts.under_min, 1);
  assertEquals(check.rows.length, 2);
  const bac = check.rows.find((r) => r.memberIds.length > 1)!;
  assertEquals(bac.verdict, "unmeasurable", "un bac a été jugé comme une assiette");
  assertEquals(bac.boxIds, ["box_bac"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ LA CHAÎNE ENTIÈRE — FRONTIÈRE PUIS MESURE, SUR LES MÊMES GRAMMES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("§2.4 ⑨ — frontière PUIS mesure finale: les contraintes tiennent ENSEMBLE", () => {
  // ⛔ « APRÈS ARRONDI ET TOUTES LES CORRECTIONS, REMESURER LE TOTAL RÉELLEMENT
  // SERVI. » On enchaîne les deux passes dans l'ordre du handler, sur les mêmes
  // objets, et on juge ce que la seconde LIT — jamais ce que la première visait.
  const plan = planEcrit(9);
  const boxes: BoundedBox[] = plan.dishes.flatMap((d) =>
    d.boxes.map((b) => ({
      boxId: b.id,
      day: d.day,
      slot: d.slot,
      memberIds: b.memberIds,
      // ⛔ LA MÊME RÉFÉRENCE DE TABLEAU QUE LE PLAN, comme dans le handler: la
      // frontière écrit les grammes en place.
      // ⟳ 2026-09-14 · BÊTA 1C ⑦ — LE GROUPE EST `null` ICI, ET C'EST LE DÉCOR
      // LE PLUS DUR: plancher générique à 50 % de la masse d'origine pour
      // chaque item. Le décor du handler, lui, porte le vrai groupe.
      items: b.items.map((i) =>
        ({ ...(i as unknown as { preparationId: string | null; grams: number }), group: null })
      ),
    }))
  );
  const frontiere = fitPortionsToBounds({
    boxes,
    boundsFor: () => ({ min: 225, max: 660 }),
    potReadyGrams: new Map([["prep_tofu_table", 216]]),
    potMarginPercent: 1,
  });
  assertEquals(frontiere.already_in_bounds, 1);
  assertEquals(frontiere.raised, 0);

  const check = finalPortionCheck({
    index: INDEX,
    dishes: plan.dishes,
    preparations: plan.preparations,
    plateFor: () => plateau(225, 660),
  });
  assertEquals(check.rows[0].grams, 225, "la mesure ne lit pas ce que la frontière a écrit");
  assertEquals(check.verdicts.in_bounds, 1);
  // ⛔ ET LES GRAMMES ÉCRITS SONT DES ENTIERS — le barème du produit.
  for (const d of plan.dishes) {
    for (const b of d.boxes) {
      for (const it of b.items) {
        assert(Number.isInteger(it.grams), `gramme non entier: ${it.grams}`);
      }
    }
  }
});

Deno.test("§2.4 ⑨ bis — ce qui ne tient pas reste EXPLICITEMENT non conforme des deux côtés", () => {
  // ⛔ PAS DE VERT PAR ABSTENTION. Quand la frontière ne peut pas ramener le
  // repas dans ses bornes, elle le COMPTE, et la mesure finale le DIT.
  const plan = planEcrit(1);
  const boxes: BoundedBox[] = plan.dishes.flatMap((d) =>
    d.boxes.map((b) => ({
      boxId: b.id,
      day: d.day,
      slot: d.slot,
      memberIds: b.memberIds,
      // ⟳ 2026-09-14 · BÊTA 1C ⑦ — LE GROUPE EST `null` ICI, ET C'EST LE DÉCOR
      // LE PLUS DUR: plancher générique à 50 % de la masse d'origine pour
      // chaque item. Le décor du handler, lui, porte le vrai groupe.
      items: b.items.map((i) =>
        ({ ...(i as unknown as { preparationId: string | null; grams: number }), group: null })
      ),
    }))
  );
  const frontiere = fitPortionsToBounds({
    boxes,
    boundsFor: () => ({ min: 225, max: 660 }),
    // La casserole ne produit que ce qu'elle contient: aucune marge utile.
    potReadyGrams: new Map([["prep_tofu_table", 216]]),
    potMarginPercent: 1,
  });
  assertEquals(frontiere.raised, 0);
  assertEquals(frontiere.still_under_min, 1);
  assertEquals(frontiere.pot_headroom_blocked, 1);

  const check = finalPortionCheck({
    index: INDEX,
    dishes: plan.dishes,
    preparations: plan.preparations,
    plateFor: () => plateau(225, 660),
  });
  assertEquals(check.verdicts.under_min, 1);
  assertEquals(check.rows[0].grams, 217);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑩ LES COMPTEURS EXISTENT MÊME À ZÉRO
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("§2.4 ⑩ — les compteurs neufs sont écrits même à zéro", () => {
  // ⛔ « UN LOT DÉSARMÉ RESSEMBLE À UN LOT QUI MARCHE. » `meals` et
  // `multi_box_meals` doivent EXISTER dans le zéro, sinon un journal muet se lit
  // comme un journal sans rien à dire.
  const zero = emptyPortionBoundaryCounts();
  assertEquals(zero.meals, 0);
  assertEquals(zero.multi_box_meals, 0);
  assertEquals(zero.tubs_not_judged, 0);
  const vide = finalPortionCheck({
    index: INDEX,
    dishes: [],
    preparations: [],
    plateFor: () => plateau(225, 660),
  });
  assertEquals(vide.reason, "no_box");
  assertEquals(vide.meals, 0);
  assertEquals(vide.multiBoxMeals, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-14 · BÊTA 1C ⑦ — UN PLAT NE SE RAMÈNE PAS DANS SES BORNES EN
//                CESSANT D'ÊTRE CE PLAT
//
// ⛔ POINT ⑨ DE LA CLÔTURE DU 2026-09-14, SA SECONDE MOITIÉ: « une boîte finit
// à 1 g de couscous dans un plat qui s'appelle "poulet rôti, couscous complet
// et courgette" ». `planShave` prend au PLUS GROS item d'abord, jusqu'à
// `MIN_ITEM_GRAMS = 1` — et le plus gros item est le féculent.
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("BÊTA 1C ⑦ — le féculent garde la moitié de sa masse, même si le repas déborde", () => {
  const box = {
    boxId: "b_identite",
    day: "sun",
    slot: "lunch",
    memberIds: ["m1"],
    items: [
      { preparationId: null, grams: 300, group: "whole_grain" as const },
      { preparationId: null, grams: 100, group: null },
    ],
  };
  const counts = fitPortionsToBounds({
    boxes: [box],
    // 400 g servis pour un plafond de 150: il faudrait retirer 250 g.
    boundsFor: () => ({ min: 50, max: 150 }),
    potReadyGrams: new Map(),
    potMarginPercent: 1,
  });
  // ⛔ AVANT CE LOT, LE RABOTAGE RÉUSSISSAIT: 300 → 1 et 100 → 1, soit 398 g
  // disponibles. Le repas rentrait dans ses bornes et ce n'était plus le plat.
  // Les planchers d'identité n'en offrent que 150 + 50 = 200 < 250.
  assertEquals(box.items.map((i) => i.grams), [300, 100], "le plat a été défiguré");
  assertEquals(counts.shaved, 0);
  // ⚠️ ET ÇA NE PASSE PAS EN SILENCE: le repas reste explicitement hors bornes.
  assertEquals(counts.still_over_max, 1);
});

Deno.test("BÊTA 1C ⑦ — LE CAS QUI PASSE: un rabotage qui respecte les planchers a lieu", () => {
  // ⛔ SANS LUI, LA GARDE PRÉCÉDENTE SERAIT VRAIE D'UN MODULE QUI NE RABOTE
  // PLUS RIEN. Ici 400 g pour un plafond de 250: il faut retirer 150 g, et le
  // féculent peut en donner exactement 150.
  const box = {
    boxId: "b_ok",
    day: "sun",
    slot: "lunch",
    memberIds: ["m1"],
    items: [
      { preparationId: null, grams: 300, group: "whole_grain" as const },
      { preparationId: null, grams: 100, group: null },
    ],
  };
  const counts = fitPortionsToBounds({
    boxes: [box],
    boundsFor: () => ({ min: 50, max: 250 }),
    potReadyGrams: new Map(),
    potMarginPercent: 1,
  });
  assertEquals(box.items.map((i) => i.grams), [150, 100]);
  assertEquals(counts.shaved, 1);
  assertEquals(counts.grams_shaved, 150);
  assertEquals(counts.still_over_max, 0);
});

Deno.test("BÊTA 1C ⑦ — un LÉGUME garde 70 %, pas 50 %: le plancher n'est pas le même pour tous", () => {
  // ⛔ « NE PAS IMPOSER LE MÊME MINIMUM À L'HUILE, AU SEL ET AU FÉCULENT »,
  // dit le plan. La règle vient de `box_densify.ts`, importée — pas d'un
  // second barème écrit ici.
  const box = {
    boxId: "b_veg",
    day: "sun",
    slot: "lunch",
    memberIds: ["m1"],
    items: [{ preparationId: null, grams: 200, group: "non_starchy_veg" as const }],
  };
  const counts = fitPortionsToBounds({
    boxes: [box],
    boundsFor: () => ({ min: 50, max: 140 }),
    potReadyGrams: new Map(),
    potMarginPercent: 1,
  });
  // 200 × 0,7 = 140 : le légume peut donner 60 g, tout juste assez.
  assertEquals(box.items.map((i) => i.grams), [140]);
  assertEquals(counts.shaved, 1);
  // ⚠️ ET UN GRAMME DE PLUS NE PASSE PAS.
  const serre = {
    ...box,
    boxId: "b_veg2",
    items: [{ preparationId: null, grams: 200, group: "non_starchy_veg" as const }],
  };
  const trop = fitPortionsToBounds({
    boxes: [serre],
    boundsFor: () => ({ min: 50, max: 139 }),
    potReadyGrams: new Map(),
    potMarginPercent: 1,
  });
  assertEquals(serre.items.map((i) => i.grams), [200]);
  assertEquals(trop.still_over_max, 1);
});
