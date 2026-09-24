/**
 * ═══════════════════════════════════════════════════════════════════════════
 * L'ÉNERGIE RÉELLEMENT SERVIE — ⟳ 2026-09-23, chantier « assiettes normales »,
 * flux F (lot 0 de `docs/keel/AUDIT-DOSAGES-2026-09-23.md`).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LES DÉFAUTS QUE CES ÉPREUVES GARDENT, CHIFFRÉS ────────────────────────
 *
 * ① `day_kcal` affichait 100 % (3 276 kcal) pendant que les boîtes finales de
 *   Thomas lui servaient 2 919 kcal: le rabotage retirait 357 kcal ce jour-là,
 *   et aucun compteur ne le disait. Le décor ci-dessous reproduit CES nombres.
 *
 * ② Un à-côté vit HORS des boîtes: une journée qui l'oublie se lit
 *   sous-nourrie sur un plan juste. La mutation « oublier les à-côtés dans la
 *   somme » doit faire rougir ①.
 *
 * ③ « 1 yaourt nature » s'affiche à l'unité, et `plain_yogurt` n'a pas de
 *   `unit_grams`: peser l'unité le mettrait à ZÉRO. Ses 125 g comptent.
 *
 * ④ Un plan d'avant les à-côtés doit se relire EXACTEMENT comme avant.
 *
 * ⛔ Tous les nombres attendus sont écrits EN DUR, calculés à la main dans les
 * commentaires. Aucun n'est recalculé depuis la constante testée.
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import { readEnergyBoxDishes, readEnergySideCourses, readPreparations } from "./plan_energy_read.ts";
import {
  FINAL_SERVED_GAPS,
  finalServedByMouthDay,
  measureSideCourses,
  PLATE_LOAD_HEAVY_DISH_G,
  plateLoadOf,
  SIDE_MEASURE_GAPS,
  sideCompositionLine,
  sidesFromLedger,
  sidesOnEmittedBoxes,
  memberDayEnergy,
  viewerDayEnergy,
} from "./served_final.ts";
import { SIDE_COURSE_REFUSALS, type SideCourseLedger, type SideCourseRefusal } from "./side_courses_types.ts";

// ---------------------------------------------------------------------------
// LE DÉCOR — des aliments à nombres ronds, pour que chaque attendu se refasse à la main
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
  } as CompositionRef;
}

const INDEX: CompositionIndex = buildCompositionIndex([
  // 150 kcal et 12 g de protéine pour 100 g: une casserole de 3 000 g vaut
  // 4 500 kcal, soit 1,5 kcal et 0,12 g de protéine par gramme prêt.
  ref({ slug: "stew", foodGroupRef: "poultry", energyKcal: 150, proteinG: 12 }),
  ref({ slug: "apple", foodGroupRef: "other_fruit", energyKcal: 52, proteinG: 0.4, unitGrams: 150 }),
  // ⚠️ SANS `unit_grams`, comme en base le 2026-09-23.
  ref({ slug: "plain_yogurt", foodGroupRef: "dairy_yogurt", energyKcal: 64, proteinG: 4 }),
  ref({ slug: "cheddar", foodGroupRef: "dairy_cheese", energyKcal: 400, proteinG: 25 }),
  ref({ slug: "tomato", foodGroupRef: "non_starchy_veg", energyKcal: 18, proteinG: 0.9 }),
  ref({ slug: "courgette", foodGroupRef: "non_starchy_veg", energyKcal: 20, proteinG: 1.5 }),
  ref({ slug: "chicken", foodGroupRef: "poultry", energyKcal: 120, proteinG: 22 }),
  ref({ slug: "olive_oil", foodGroupRef: "olive_oil", energyKcal: 900, proteinG: 0 }),
  ref({
    slug: "white_rice",
    foodGroupRef: "refined_grain",
    energyKcal: 350,
    proteinG: 7,
    yieldClass: "grain_absorbs",
  }),
], [
  { alias: "pomme", slug: "apple" },
  { alias: "yaourt nature", slug: "plain_yogurt" },
  { alias: "tomate", slug: "tomato" },
]);

const STEW_POT = {
  id: "p_stew",
  servings_made: 10,
  method: "Mijoter.",
  ingredients: [{ term: "ragoût", ref: "stew", amount: 3000, unit: "g", state: "raw" }],
};

/**
 * LA JOURNÉE DE THOMAS, LUNDI — les nombres de `e0325544`.
 *
 *   petit-déjeuner: bac à DEUX noms, 500 g × 1,5 = 750 kcal ⇒ 375 chacun
 *   déjeuner: 800 g × 1,5 = 1 200 kcal + cheddar 34 g (136) + pomme 150 g (78)
 *   dîner: 700 g × 1,5 = 1 050 kcal + yaourt nature 125 g (80)
 *
 *   plats = 375 + 1 200 + 1 050 = 2 625 · à-côtés = 136 + 78 + 80 = 294
 *   servi = 2 919 · avant les bornes: plats 2 982 + 294 = 3 276 · raboté 357
 */
function thomasMonday(withSides: boolean): Record<string, unknown>[] {
  const sides = (list: Record<string, unknown>[]) => withSides ? { side_courses: list } : {};
  return [
    {
      day: "mon",
      slot: "breakfast",
      method: "",
      ingredients: [],
      uses: [{ preparation_id: "p_stew", servings: 2 }],
      boxes: [{
        id: "b_mon_bk_tub",
        member_ids: ["thomas", "christele"],
        items: [{ grams: 500, preparation_id: "p_stew" }],
      }],
    },
    {
      day: "mon",
      slot: "lunch",
      method: "",
      ingredients: [],
      uses: [{ preparation_id: "p_stew", servings: 1 }],
      boxes: [{
        id: "b_mon_lunch_thomas",
        member_ids: ["thomas"],
        items: [{ grams: 800, preparation_id: "p_stew" }],
      }],
      ...sides([
        {
          member_id: "thomas",
          kind: "cheese",
          term: "cheddar",
          ref: "cheddar",
          grams: 34,
          unit_count: null,
          preparation_id: null,
          source: "model",
        },
        {
          member_id: "thomas",
          kind: "dessert",
          term: "pomme",
          ref: "apple",
          grams: 150,
          unit_count: 1,
          preparation_id: null,
          source: "engine_fallback",
        },
      ]),
    },
    {
      day: "mon",
      slot: "dinner",
      method: "",
      ingredients: [],
      uses: [{ preparation_id: "p_stew", servings: 1 }],
      boxes: [{
        id: "b_mon_dinner_thomas",
        member_ids: ["thomas"],
        items: [{ grams: 700, preparation_id: "p_stew" }],
      }],
      ...sides([{
        member_id: "thomas",
        kind: "dessert",
        term: "yaourt nature",
        ref: "plain_yogurt",
        grams: 125,
        unit_count: 1,
        preparation_id: null,
        source: "model",
      }]),
    },
  ];
}

const BEFORE_THOMAS = [{ memberId: "thomas", day: "mon", dishKcal: 2982, targetKcal: 3276 }];

function served(withSides: boolean, withheld: readonly string[] = []) {
  const raw = thomasMonday(withSides);
  return finalServedByMouthDay({
    index: INDEX,
    dishes: readEnergyBoxDishes(raw),
    preparations: readPreparations([STEW_POT]),
    sides: { from: "payload", sides: readEnergySideCourses(raw) },
    before: BEFORE_THOMAS,
    withheldMemberIds: new Set(withheld),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ① SERVI AVANT LES BORNES 3 276, APRÈS 2 919, RABOTÉ 357
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("① le cas de Thomas: 3 276 avant les bornes, 2 919 servis, 357 rabotés", () => {
  const { rows, counters } = served(true);
  const thomas = rows.find((r) => r.memberId === "thomas");
  assert(thomas !== undefined);
  assertEquals(thomas.dishKcal, 2625);
  assertEquals(thomas.sidesKcal, 294);
  assertEquals(thomas.servedKcal, 2919, "⛔ les à-côtés sont DANS la journée");
  assertEquals(thomas.servedBeforeBoundsKcal, 3276);
  assertEquals(thomas.shavedKcal, 357);
  assertEquals(thomas.targetKcal, 3276);
  // 2 919 / 3 276 = 0,89103 ⇒ 89,1 %: le « 100 % » affiché devient ce qui est servi.
  assertEquals(thomas.pct, 89.1);
  // Protéine: 96 + 84 + 60 / 2 = 210 dans les plats; 8,5 + 0,6 + 5 = 14,1 à côté.
  assertEquals(thomas.proteinG, 224.1);
  assertEquals([thomas.boxes, thomas.tubShares, thomas.sides], [2, 1, 3]);
  assertEquals(thomas.gaps, []);
  assertEquals(counters.shaved_mouth_days, 1);
  assertEquals(counters.shaved_kcal, 357);
  assertEquals(counters.sides, 3);
  assertEquals(counters.sides_unreadable, 0);
});

Deno.test("① LE CAS QUI PASSE — un bac donne SA PART à chacun, sans ligne d'avant pas d'écart", () => {
  const { rows, counters } = served(true);
  const christele = rows.find((r) => r.memberId === "christele");
  assert(christele !== undefined);
  // 750 kcal dans le bac, deux mangeurs: 375 chacun, et le bac est NOMMÉ.
  assertEquals(christele.servedKcal, 375);
  assertEquals(christele.sidesKcal, 0);
  assertEquals(christele.tubShares, 1);
  assertEquals(christele.boxes, 0);
  // Aucune mesure d'avant pour elle: l'écart est inconnu, pas nul.
  assertEquals(christele.servedBeforeBoundsKcal, null);
  assertEquals(christele.shavedKcal, null);
  assertEquals(counters.mouth_days, 2);
  assertEquals(counters.tub_shares, 2);
  assertEquals(counters.boxes, 2);
});

Deno.test("⟳ 2026-09-23 — un bac se partage selon l'énergie PRÉVUE de chacun, pas à parts égales", () => {
  // Famille E de la campagne: à parts égales, l'adulte sortait à 92-97 % et
  // l'enfant à 103-108 % de leur cible pour un bac dimensionné juste.
  const raw = thomasMonday(true);
  const weighted = finalServedByMouthDay({
    index: INDEX,
    dishes: readEnergyBoxDishes(raw),
    preparations: readPreparations([STEW_POT]),
    sides: { from: "payload", sides: readEnergySideCourses(raw) },
    before: [
      ...BEFORE_THOMAS,
      { memberId: "christele", day: "mon", dishKcal: 1500, targetKcal: 1500 },
    ],
    withheldMemberIds: new Set(),
  });
  const christele = weighted.rows.find((r) => r.memberId === "christele");
  const thomas = weighted.rows.find((r) => r.memberId === "thomas");
  assert(christele !== undefined && thomas !== undefined);
  // 750 kcal × 1 500 / (2 982 + 1 500) = 251,0 ; Thomas: 750 × 2 982 / 4 482 = 499,0.
  assertEquals(christele.servedKcal, 251);
  assertEquals(thomas.dishKcal, 2749);
  assertEquals(weighted.counters.tub_shares, 2);
  assertEquals(weighted.counters.tub_shares_weighted, 2);
  // LE CAS QUI MORD: un seul mangeur sans prévu ⇒ part égale pour les deux (375).
  const { rows, counters } = served(true);
  assertEquals(rows.find((r) => r.memberId === "christele")?.servedKcal, 375);
  assertEquals(counters.tub_shares_weighted, 0);
});

Deno.test("⛔ ② sous le plancher TCA, AUCUNE ligne — et le bac garde sa division", () => {
  const { rows, counters } = served(true, ["christele"]);
  assertEquals(rows.map((r) => r.memberId), ["thomas"]);
  assertEquals(counters.withheld_mouth_days, 1);
  // La part de Thomas ne change pas: le bac a toujours deux mangeurs.
  assertEquals(rows[0].servedKcal, 2919);
  // LE CAS QUI MORD: Thomas tu, aucune de ses kcal ne sort, pas même l'écart.
  const tu = served(true, ["thomas"]);
  assertEquals(tu.rows.map((r) => r.memberId), ["christele"]);
  assertEquals(tu.counters.shaved_kcal, 0);
  assertEquals(tu.counters.withheld_mouth_days, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ UN PLAN D'AVANT LES À-CÔTÉS SE RELIT COMME AVANT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("④ plan sans `side_courses`: les boîtes seules, nombres identiques", () => {
  const raw = thomasMonday(false);
  assertEquals(readEnergySideCourses(raw), [], "pas de clé, aucun à-côté inventé");
  const { rows, counters } = served(false);
  const thomas = rows.find((r) => r.memberId === "thomas");
  assert(thomas !== undefined);
  assertEquals(thomas.servedKcal, 2625);
  assertEquals(thomas.dishKcal, 2625);
  assertEquals(thomas.sidesKcal, 0);
  assertEquals(thomas.proteinG, 210);
  // Les bornes n'ont pas touché aux à-côtés; sans eux, l'écart est le même.
  assertEquals(thomas.servedBeforeBoundsKcal, 2982);
  assertEquals(thomas.shavedKcal, 357);
  assertEquals(counters.sides, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE YAOURT DE 125 g COMPTE SES KCAL
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("③ un yaourt nature à côté, 125 g: 80 kcal et 5 g de protéine, pas 0", () => {
  const [yaourt] = readEnergySideCourses([thomasMonday(true)[2]]);
  const [m] = measureSideCourses({ index: INDEX, preparations: [], sides: [yaourt] });
  // 64 kcal/100 g × 1,25 = 80; 4 g/100 g × 1,25 = 5.
  assertEquals(m, { kcal: 80, proteinG: 5, gap: null });
  // LE CAS QUI MORD: la même ligne sans grammes (l'unité seule) n'est PAS un
  // zéro — elle est illisible, et le dit.
  const [sansGrammes] = measureSideCourses({
    index: INDEX,
    preparations: [],
    sides: [{ ...yaourt, grams: null }],
  });
  assertEquals(sansGrammes, { kcal: null, proteinG: null, gap: "no_grams" });
});

Deno.test("③ l'identifiant gagne sur le mot, et un mot vide retombe sur le slug", () => {
  const [pomme] = readEnergySideCourses([thomasMonday(true)[1]]).slice(1);
  // « pomme » a un alias; sans lui, seul le slug pèserait — et il pèse.
  const [parSlug] = measureSideCourses({
    index: INDEX,
    preparations: [],
    sides: [{ ...pomme, term: "" }],
  });
  assertEquals(parSlug.kcal, 78);
  assertEquals(sideCompositionLine({ ...pomme, term: "" }).term, "apple");
  // LE CAS QUI MORD: un slug inventé éteint l'à-côté au lieu de retomber sur le mot.
  const [invente] = measureSideCourses({
    index: INDEX,
    preparations: [],
    sides: [{ ...pomme, ref: "apple_invented" }],
  });
  assertEquals(invente, { kcal: null, proteinG: null, gap: "food_unreadable" });
});

Deno.test("③ une soupe se pèse par SA casserole; une casserole absente est nommée", () => {
  const soupe = {
    ...readEnergySideCourses([thomasMonday(true)[2]])[0],
    kind: "starter" as const,
    term: "soupe",
    ref: null,
    preparationId: "p_stew",
    grams: 200,
  };
  const [m] = measureSideCourses({ index: INDEX, preparations: readPreparations([STEW_POT]), sides: [soupe] });
  // 200 g × 1,5 kcal/g = 300; 200 × 0,12 = 24 g.
  assertEquals(m, { kcal: 300, proteinG: 24, gap: null });
  const [absente] = measureSideCourses({ index: INDEX, preparations: [], sides: [soupe] });
  assertEquals(absente.gap, "preparation_missing");
});

Deno.test("③ un à-côté illisible rend la journée illisible, jamais amputée", () => {
  const raw = thomasMonday(true);
  const sides = readEnergySideCourses(raw).map((s) => s.ref === "plain_yogurt" ? { ...s, grams: null } : s);
  const { rows, counters } = finalServedByMouthDay({
    index: INDEX,
    dishes: readEnergyBoxDishes(raw),
    preparations: readPreparations([STEW_POT]),
    sides: { from: "payload", sides },
    before: BEFORE_THOMAS,
    withheldMemberIds: new Set(),
  });
  const thomas = rows.find((r) => r.memberId === "thomas");
  assert(thomas !== undefined);
  assertEquals(thomas.servedKcal, null, "⛔ pas 2 839: une part manque, on ne la compte pas à zéro");
  assertEquals(thomas.shavedKcal, null);
  assertEquals(thomas.dishKcal, 2625, "les plats, eux, se lisent");
  assertEquals(thomas.gaps, ["side_unreadable"]);
  assertEquals(counters.sides_unreadable, 1);
  assertEquals(counters.unreadable_mouth_days, 1);
});

Deno.test("sans référentiel: chaque journée sort `no_index`, aucun nombre", () => {
  const raw = thomasMonday(true);
  const { rows } = finalServedByMouthDay({
    index: null,
    dishes: readEnergyBoxDishes(raw),
    preparations: readPreparations([STEW_POT]),
    sides: { from: "payload", sides: readEnergySideCourses(raw) },
    before: BEFORE_THOMAS,
    withheldMemberIds: new Set(),
  });
  const thomas = rows.find((r) => r.memberId === "thomas");
  assert(thomas !== undefined);
  assertEquals([thomas.servedKcal, thomas.dishKcal, thomas.sidesKcal, thomas.proteinG], [null, null, null, null]);
  assertEquals(thomas.gaps, ["no_index"]);
  assertEquals(thomas.sides, 3, "la structure se compte même sans mesure");
});

// ═══════════════════════════════════════════════════════════════════════════
// LE REGISTRE EN MÉMOIRE ET LE PAYLOAD RELU RENDENT LE MÊME NOMBRE
// ═══════════════════════════════════════════════════════════════════════════

function zeroRefusals(): Record<SideCourseRefusal, number> {
  const out = {} as Record<SideCourseRefusal, number>;
  for (const r of SIDE_COURSE_REFUSALS) out[r] = 0;
  return out;
}

Deno.test("le registre de génération et le plan écrit donnent la même journée", () => {
  const payloadSides = readEnergySideCourses(thomasMonday(true));
  const entries = payloadSides.map((s) => ({
    memberId: s.memberId,
    dayToken: s.day ?? "",
    slot: s.slot as "lunch" | "dinner",
    kind: s.kind ?? "dessert",
    term: s.term,
    ref: s.ref,
    preparationId: s.preparationId,
    grams: s.grams ?? 0,
    unitCount: s.unitCount,
    // ⛔ UNE KCAL FAUSSE DANS LE REGISTRE: elle ne doit PAS être reprise.
    plannedKcal: 999,
    kcal: 999,
    proteinG: null,
    source: s.source ?? "model",
  }));
  const ledger: SideCourseLedger = {
    entries,
    byKey: new Map(),
    counters: {
      asked: 3,
      declared: 3,
      valid: 2,
      refused: 0,
      refused_by: zeroRefusals(),
      filled_by_engine: 1,
      dropped: 0,
    },
  };
  assertEquals(sidesFromLedger(ledger)[0].dishIndex, null);
  const raw = thomasMonday(true);
  const fromLedger = finalServedByMouthDay({
    index: INDEX,
    dishes: readEnergyBoxDishes(raw),
    preparations: readPreparations([STEW_POT]),
    sides: { from: "ledger", ledger },
    before: BEFORE_THOMAS,
    withheldMemberIds: new Set(),
  });
  const thomas = fromLedger.rows.find((r) => r.memberId === "thomas");
  assertEquals(thomas?.sidesKcal, 294, "relu par grammes × référentiel, jamais par la kcal du registre");
  assertEquals(thomas?.servedKcal, 2919);
});

// ═══════════════════════════════════════════════════════════════════════════
// LA CHARGE DE L'ASSIETTE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * FABRICE, LUNDI.
 *
 *   p_rice: riz 200 g cru (grain_absorbs ×2,6) ⇒ 520 g prêts, 700 kcal.
 *   p_main: poulet 400 + courgette 600 + huile 20 ⇒ 1 020 g, 480 + 120 + 180 = 780 kcal.
 *
 *   déjeuner: 260 g de riz (½) + 510 g de p_main (½) = 770 g
 *     céréale sèche 100 g · légumes 300 g · plat 350 + 390 = 740 kcal, féculent 350
 *     à-côtés: tomate 150 g (27 kcal, 150 g de légumes) + pomme 150 g (78)
 *   dîner: 130 g de riz (¼) + 255 g de p_main (¼) = 385 g
 *     céréale sèche 50 g · légumes 150 g · plat 175 + 195 = 370 kcal, féculent 175
 *     à-côté: yaourt 125 g (80)
 *   petit-déjeuner: une pomme fraîche de 150 g.
 *   mardi midi: un bac avec Thomas — non mesuré.
 *   Christèle: sous plancher.
 */
function fabricePlan(): { dishes: Record<string, unknown>[]; preparations: Record<string, unknown>[] } {
  const side = (over: Record<string, unknown>) => ({
    member_id: "fabrice",
    unit_count: null,
    preparation_id: null,
    source: "model",
    ...over,
  });
  return {
    preparations: [
      {
        id: "p_rice",
        servings_made: 4,
        method: "Cuire.",
        ingredients: [{ term: "riz", ref: "white_rice", amount: 200, unit: "g", state: "raw" }],
      },
      {
        id: "p_main",
        servings_made: 4,
        method: "Sauter.",
        ingredients: [
          { term: "poulet", ref: "chicken", amount: 400, unit: "g", state: "raw" },
          { term: "courgette", ref: "courgette", amount: 600, unit: "g", state: "raw" },
          { term: "huile d'olive", ref: "olive_oil", amount: 20, unit: "g", state: "raw" },
        ],
      },
    ],
    dishes: [
      {
        day: "mon",
        slot: "breakfast",
        method: "",
        ingredients: [{ term: "pomme", ref: "apple", amount: 150, unit: "g", state: "raw" }],
        uses: [],
        boxes: [{ id: "b_bk", member_ids: ["fabrice"], items: [{ grams: 150, preparation_id: null }] }],
      },
      {
        day: "mon",
        slot: "lunch",
        method: "",
        ingredients: [],
        uses: [],
        boxes: [
          {
            id: "b_lunch_f",
            member_ids: ["fabrice"],
            items: [{ grams: 260, preparation_id: "p_rice" }, { grams: 510, preparation_id: "p_main" }],
          },
          {
            id: "b_lunch_c",
            member_ids: ["christele"],
            items: [{ grams: 400, preparation_id: "p_main" }],
          },
        ],
        side_courses: [
          side({ kind: "starter", term: "tomate", ref: "tomato", grams: 150 }),
          side({ kind: "dessert", term: "pomme", ref: "apple", grams: 150, unit_count: 1 }),
          side({ member_id: "christele", kind: "dessert", term: "pomme", ref: "apple", grams: 150 }),
        ],
      },
      {
        day: "mon",
        slot: "dinner",
        method: "",
        ingredients: [],
        uses: [],
        boxes: [{
          id: "b_dinner_f",
          member_ids: ["fabrice"],
          items: [{ grams: 130, preparation_id: "p_rice" }, { grams: 255, preparation_id: "p_main" }],
        }],
        side_courses: [side({ kind: "dessert", term: "yaourt nature", ref: "plain_yogurt", grams: 125 })],
      },
      {
        day: "tue",
        slot: "lunch",
        method: "",
        ingredients: [],
        uses: [],
        boxes: [{ id: "b_tub", member_ids: ["fabrice", "thomas"], items: [{ grams: 600, preparation_id: "p_main" }] }],
      },
    ],
  };
}

function plateLoad(withheld: readonly string[] = ["christele"]) {
  const plan = fabricePlan();
  return plateLoadOf({
    index: INDEX,
    dishes: readEnergyBoxDishes(plan.dishes),
    preparations: readPreparations(plan.preparations),
    sides: { from: "payload", sides: readEnergySideCourses(plan.dishes) },
    withheldMemberIds: new Set(withheld),
  });
}

Deno.test("épinglage — PLATE_LOAD_HEAVY_DISH_G vaut 550", () => {
  assertEquals(PLATE_LOAD_HEAVY_DISH_G, 550);
});

Deno.test("les vocabulaires fermés des manques, écrits en dur", () => {
  assertEquals([...SIDE_MEASURE_GAPS], ["no_grams", "food_unreadable", "preparation_missing", "preparation_unreadable"]);
  assertEquals([...FINAL_SERVED_GAPS], ["no_index", "box_unreadable", "side_unreadable"]);
});

Deno.test("la charge de l'assiette de Fabrice: plat, céréale, légumes, féculent, à-côtés, fruits", () => {
  const trace = plateLoad();
  assertEquals(trace.heavy_dish_g, 550);
  assertEquals(trace.veg_floor_g, 150);
  assertEquals(trace.withheld_members, 1);
  const f = trace.members.find((m) => m.member_id === "fabrice");
  assert(f !== undefined);
  assertEquals([f.meals, f.tub_meals, f.unreadable], [2, 1, 0]);
  // Plats [770, 385]: médiane 577,5 ⇒ 578; un seul au-dessus de 550.
  assertEquals([f.dish_g_median, f.dish_g_max, f.dishes_over_heavy], [578, 770, 1]);
  // Céréale sèche [100, 50] — les grammes CRUS, pas les 260 g cuits.
  assertEquals([f.dry_grain_g_median, f.dry_grain_g_max], [75, 100]);
  // Légumes [300, 150]: 150 n'est PAS sous le plancher de 150.
  assertEquals([f.veg_raw_g_median, f.veg_under_floor], [225, 0]);
  // Plat + entrée: [300 + 150, 150] ⇒ médiane 300.
  assertEquals(f.meal_veg_raw_g_median, 300);
  // Féculent: (350 + 175) / (740 + 370) = 0,473 ⇒ 0,47.
  assertEquals(f.starch_kcal_share, 0.47);
  // À-côtés: [27 + 78, 80] = [105, 80] ⇒ médiane 92,5 ⇒ 93.
  assertEquals(f.side_kcal_median, 93);
  // Part: 105 / 845 = 0,124 et 80 / 450 = 0,178 ⇒ médiane 0,151 ⇒ 0,15; max 0,18.
  assertEquals([f.side_share_median, f.side_share_max], [0.15, 0.18]);
  // Fruits: lundi la pomme du matin (150) + la pomme à côté (150) = 300;
  // mardi un bac sans fruit — la journée existe, à 0. Médiane 150, minimum 0.
  assertEquals([f.fruit_g_per_day_median, f.fruit_g_per_day_min], [150, 0]);
  // Repas complet: [770 + 300, 385 + 125] = [1 070, 510] ⇒ médiane 790.
  assertEquals([f.meal_g_median, f.meal_g_max], [790, 1070]);
  assertEquals(trace.members.map((m) => m.member_id).includes("christele"), false, "⛔ sous plancher: aucune ligne");
});

Deno.test("LE CAS QUI MORD — une casserole introuvable rend la composition du repas illisible, pas nulle", () => {
  const plan = fabricePlan();
  const dishes = plan.dishes.map((d) =>
    d.slot === "dinner"
      ? {
        ...d,
        boxes: [{ id: "b_dinner_f", member_ids: ["fabrice"], items: [{ grams: 385, preparation_id: "p_missing" }] }],
      }
      : d
  );
  const trace = plateLoadOf({
    index: INDEX,
    dishes: readEnergyBoxDishes(dishes),
    preparations: readPreparations(plan.preparations),
    sides: { from: "payload", sides: readEnergySideCourses(dishes) },
    withheldMemberIds: new Set(["christele"]),
  });
  const f = trace.members.find((m) => m.member_id === "fabrice");
  assert(f !== undefined);
  assertEquals(f.unreadable, 1);
  // La MASSE se lit toujours; la composition ne garde que le déjeuner.
  assertEquals([f.dish_g_median, f.dry_grain_g_median, f.veg_raw_g_median], [578, 100, 300]);
});

// ═══════════════════════════════════════════════════════════════════════════
// `meal-energy-v1` — LES À-CÔTÉS SOUS LA PORTE DES BOÎTES
// ═══════════════════════════════════════════════════════════════════════════

const EMITTED = [
  { box_id: "b_mon_lunch_thomas", day: "mon", member_id: "thomas", kcal: 1200, basis: "plan_quantities" },
  { box_id: "b_mon_dinner_thomas", day: "mon", member_id: "thomas", kcal: 1050, basis: "plan_quantities" },
];

Deno.test("meal-energy — chaque boîte émise porte SES à-côtés, et son kcal reste le plat", () => {
  const raw = thomasMonday(true);
  const sides = readEnergySideCourses(raw);
  const { boxes, counts } = sidesOnEmittedBoxes({
    boxes: EMITTED,
    dishes: readEnergyBoxDishes(raw),
    sides,
    measures: measureSideCourses({ index: INDEX, preparations: [], sides }),
  });
  assertEquals(boxes[0].kcal, 1200);
  assertEquals(boxes[0].sides.map((s) => [s.kind, s.term, s.kcal]), [["cheese", "cheddar", 136], ["dessert", "pomme", 78]]);
  assertEquals(boxes[1].sides.map((s) => s.kcal), [80]);
  assertEquals(counts, { sides: 3, attached: 3, unreadable: 0, no_host: 0 });
  const days = viewerDayEnergy({ boxes, viewerMemberId: "thomas" });
  // 1 200 + 1 050 + 136 + 78 + 80 = 2 544.
  assertEquals(days.get("mon"), { kcal: 2544, boxes: 2, sides: 3, complete: true });
});

Deno.test("⛔ meal-energy — une boîte NON émise (personne fermée) ne laisse sortir aucun à-côté", () => {
  const raw = thomasMonday(true);
  const sides = readEnergySideCourses(raw);
  const { boxes, counts } = sidesOnEmittedBoxes({
    boxes: [EMITTED[1]],
    dishes: readEnergyBoxDishes(raw),
    sides,
    measures: measureSideCourses({ index: INDEX, preparations: [], sides }),
  });
  assertEquals(boxes[0].sides.map((s) => s.kcal), [80]);
  assertEquals(counts, { sides: 3, attached: 1, unreadable: 0, no_host: 2 });
  // Le lecteur n'est pas Thomas: rien de Thomas dans SA journée.
  assertEquals(viewerDayEnergy({ boxes, viewerMemberId: "christele" }).size, 0);
  assertThrows(() =>
    sidesOnEmittedBoxes({ boxes: EMITTED, dishes: readEnergyBoxDishes(raw), sides, measures: [] })
  );
});

Deno.test("④ meal-energy — un plan sans à-côtés rend EXACTEMENT les nombres d'avant", () => {
  const raw = thomasMonday(false);
  const { boxes, counts } = sidesOnEmittedBoxes({
    boxes: EMITTED,
    dishes: readEnergyBoxDishes(raw),
    sides: readEnergySideCourses(raw),
    measures: [],
  });
  assertEquals(boxes.map((b) => [b.box_id, b.kcal, b.sides]), [
    ["b_mon_lunch_thomas", 1200, []],
    ["b_mon_dinner_thomas", 1050, []],
  ]);
  assertEquals(counts, { sides: 0, attached: 0, unreadable: 0, no_host: 0 });
  // L'ancienne somme: 1 200 + 1 050 = 2 250, deux boîtes, complète.
  assertEquals(viewerDayEnergy({ boxes, viewerMemberId: "thomas" }).get("mon"), {
    kcal: 2250,
    boxes: 2,
    sides: 0,
    complete: true,
  });
});

Deno.test("meal-energy — un à-côté illisible sort sans chiffre et rend la journée incomplète", () => {
  const raw = thomasMonday(true);
  const sides = readEnergySideCourses(raw).map((s) => s.ref === "cheddar" ? { ...s, grams: null } : s);
  const { boxes, counts } = sidesOnEmittedBoxes({
    boxes: EMITTED,
    dishes: readEnergyBoxDishes(raw),
    sides,
    measures: measureSideCourses({ index: INDEX, preparations: [], sides }),
  });
  assertEquals(boxes[0].sides[0].kcal, null, "⛔ jamais 0");
  assertEquals(counts.unreadable, 1);
  assertEquals(viewerDayEnergy({ boxes, viewerMemberId: "thomas" }).get("mon"), {
    kcal: 2408,
    boxes: 2,
    sides: 3,
    complete: false,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-24 — LE TOTAL DU JOUR DE CHAQUE PERSONNE (le tableau de la semaine)
// ═══════════════════════════════════════════════════════════════════════════

const emitted = (box_id: string, day: string | null, member_id: string, kcal: number, sides: { kcal: number | null }[] = []) => ({
  box_id,
  day,
  member_id,
  kcal,
  sides: sides.map((s) => ({ kind: null, term: "x", kcal: s.kcal, basis: "plan_quantities" })),
});

Deno.test("memberDayEnergy: une ligne par personne et par jour, somme de SES boîtes émises", () => {
  const rows = memberDayEnergy({
    boxes: [
      emitted("b1", "mon", "paul", 600),
      emitted("b2", "mon", "paul", 800, [{ kcal: 150 }]),
      emitted("b3", "tue", "paul", 700),
      emitted("b4", "mon", "lea", 500),
    ],
    dishes: [
      { day: "mon", boxes: [{ id: "b1", memberIds: ["paul"] }, { id: "b4", memberIds: ["lea"] }] },
      { day: "mon", boxes: [{ id: "b2", memberIds: ["paul"] }] },
      { day: "tue", boxes: [{ id: "b3", memberIds: ["paul"] }] },
    ],
  });
  const byKey = new Map(rows.map((r) => [`${r.member_id} ${r.day}`, r]));
  assertEquals(byKey.get("paul mon"), {
    member_id: "paul", day: "mon", kcal: 1550, meals_counted: 2, meals_total: 2, complete: true,
  });
  assertEquals(byKey.get("paul tue")?.kcal, 700);
  assertEquals(byKey.get("lea mon")?.kcal, 500);
  assertEquals(rows.length, 3);
});

Deno.test("memberDayEnergy: un repas en bac commun rend le jour incomplet, jamais compté à zéro", () => {
  const rows = memberDayEnergy({
    boxes: [emitted("b1", "mon", "paul", 600)],
    dishes: [
      { day: "mon", boxes: [{ id: "b1", memberIds: ["paul"] }] },
      // Le dîner: un bac pour Paul ET Léa — aucune boîte émise pour Paul.
      { day: "mon", boxes: [{ id: "b9", memberIds: ["paul", "lea"] }] },
    ],
  });
  assertEquals(rows, [{
    member_id: "paul", day: "mon", kcal: 600, meals_counted: 1, meals_total: 2, complete: false,
  }]);
});

Deno.test("memberDayEnergy: un à-côté illisible rend le jour incomplet", () => {
  const [row] = memberDayEnergy({
    boxes: [emitted("b1", "mon", "paul", 600, [{ kcal: null }])],
    dishes: [{ day: "mon", boxes: [{ id: "b1", memberIds: ["paul"] }] }],
  });
  assertEquals(row.kcal, 600);
  assertEquals(row.complete, false);
});

Deno.test("memberDayEnergy: sans boîte émise, aucune ligne — pas un zéro", () => {
  assertEquals(
    memberDayEnergy({
      boxes: [],
      dishes: [{ day: "mon", boxes: [{ id: "b1", memberIds: ["tom"] }] }],
    }),
    [],
  );
  // Une boîte sans jour n'alimente aucune journée.
  assertEquals(memberDayEnergy({ boxes: [emitted("b1", null, "paul", 600)], dishes: [] }), []);
});

Deno.test("memberDayEnergy: pour le lecteur, la même somme que `viewerDayEnergy`", () => {
  const boxes = [
    emitted("b1", "mon", "paul", 600, [{ kcal: 120 }]),
    emitted("b2", "mon", "paul", 800),
    emitted("b4", "mon", "lea", 500),
  ];
  const viewer = viewerDayEnergy({ boxes, viewerMemberId: "paul" }).get("mon");
  const member = memberDayEnergy({
    boxes,
    dishes: [
      { day: "mon", boxes: [{ id: "b1", memberIds: ["paul"] }, { id: "b4", memberIds: ["lea"] }] },
      { day: "mon", boxes: [{ id: "b2", memberIds: ["paul"] }] },
    ],
  }).find((r) => r.member_id === "paul");
  assert(viewer !== undefined && member !== undefined);
  assertEquals(member.kcal, viewer.kcal);
});
