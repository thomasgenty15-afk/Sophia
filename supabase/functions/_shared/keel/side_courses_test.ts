/**
 * LE MOTEUR DES À-CÔTÉS — rotation, impossible, lecture du modèle, registre,
 * grammes, adaptateurs.
 * ⟳ 2026-09-23 — flux A du chantier « assiettes normales ».
 *
 * ⛔ TOUS LES NOMBRES ATTENDUS SONT EN DUR, jamais recalculés depuis une
 * constante du socle: changer `SIDE_COURSE_BASE_KCAL`, une borne de grammes ou
 * la rotation doit faire rougir ce fichier.
 *
 * ⚠️ LE RÉFÉRENTIEL DE CE FICHIER EST CELUI DE LA BASE, RECOPIÉ EN DUR (lecture
 * SQL du 2026-09-23, `scratchpad/a-cotes/fallback_slugs.md`): kcal, protéines,
 * poids à l'unité et groupe des aliments de secours. Trois écarts voulus,
 * nommés là où ils servent: le yaourt à 125 g l'unité (ce que la piste
 * « données » ajoutera), quelques lignes de plus pour les cas qui mordent
 * (cheesecake, pomme de terre, poireau, eau), et ⟳ 2026-09-23 (vague 2) les
 * neuf slugs que la migration 20260923110000 crée ou corrige (sept fromages,
 * `goat_cheese`, `pear`), avec ses valeurs CIQUAL 2025: ils n'existent en base
 * qu'après elle.
 */
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import { exclusionTermsFor } from "./food_exclusion_belt.ts";
import type { RetainedItem } from "./retained_item.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";
import type { DishIngredient, MealPreparation } from "./meal_generation.ts";
import { preparationReadyGrams } from "./meal_generation.ts";
import { shoppingNeedsOf } from "./shopping_rebuild.ts";
import type { FoodGroupRef } from "./tokens.ts";
import type {
  SideCourseAsk,
  SideCourseGoal,
  SideCourseKind,
  SideCourseServed,
  SideCourseSlot,
  SideTermJudge,
} from "./side_courses_types.ts";
import {
  attachSideCourses,
  buildSideCourseLedger,
  extractSideCourses,
  impossibleKindsFor,
  planSideCourses,
  type RawSideCourse,
  scaleSidePots,
  SIDE_COURSE_EXTRACT_STATUSES,
  SIDE_COURSE_GOAL_ORDER,
  SIDE_COURSE_KIND_WORDS,
  SIDE_COURSE_PREP_MIN_VEG_SHARE,
  sideCourseGoalFor,
  sideCourseKey,
  SIDE_COURSE_REGROW_ORDER,
  sideCourseTableCounters,
  sideDrawsByPreparation,
  sideGramsFor,
  sideNutritionByMouthDay,
  sideShoppingLines,
  snapDeltaKcal,
} from "./side_courses.ts";

// ═══════════════════════════════════════════════════════════════════════════
// LES FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

function ref(
  slug: string,
  group: FoodGroupRef,
  energyKcal: number,
  proteinG: number | null,
  unitGrams: number | null,
  yieldClass: CompositionRef["yieldClass"] = "neutral",
): CompositionRef {
  return {
    slug,
    foodGroupRef: group,
    label: slug,
    source: "ciqual",
    energyKcal,
    proteinG,
    carbsG: null,
    fatG: null,
    fiberG: null,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass,
    yieldFactor: null,
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams,
    condimentGrams: null,
  };
}

/** Les aliments de secours, tels que la base les porte le 2026-09-23 (puis la migration). */
const BASE_REFS: CompositionRef[] = [
  ref("apple", "other_fruit", 47.6, 0.3, 150),
  ref("orange", "citrus", 45.5, 0.8, 150),
  ref("clementine", "citrus", 47.3, 0.8, 80),
  ref("kiwi", "other_fruit", 60.5, 0.9, 80),
  ref("banana", "other_fruit", 90.5, 1.1, 120),
  ref("apple_compote_reduced_sugar", "other_fruit", 65.1, 0.5, null),
  ref("plain_yogurt", "dairy_yogurt", 59, 3.5, null),
  ref("fromage_blanc", "dairy_yogurt", 76.9, 8.0, null),
  ref("skyr", "dairy_yogurt", 63, 11.0, null),
  ref("carrot", "non_starchy_veg", 40.2, 0.6, 70, "veg_shrinks"),
  ref("tomato", "non_starchy_veg", 19.3, 0.9, 100),
  ref("cucumber", "non_starchy_veg", 14.7, 0.6, 300),
  ref("cheddar", "dairy_cheese", 399, 24.0, null),
  ref("parmesan", "dairy_cheese", 406, 31.1, null),
  ref("feta", "dairy_cheese", 285, 15.1, null),
  // ⟳ 2026-09-23 — migration 20260923110000 (CIQUAL 2025): absents de la base avant elle.
  ref("comte", "dairy_cheese", 413, 27.8, null),
  ref("emmental", "dairy_cheese", 373, 27.9, null),
  ref("camembert", "dairy_cheese", 280, 19.5, null),
  ref("brie", "dairy_cheese", 345, 17.6, null),
  ref("fresh_goat_cheese", "dairy_cheese", 194, 12, null),
  ref("cantal", "dairy_cheese", 378, 25.3, null),
  ref("gouda", "dairy_cheese", 369, 24.7, null),
  // Corrigés par la même migration: la viande de chevreau devient la bûche
  // (12812); la poire, `a_verifier` avant elle, est confirmée (13037).
  ref("goat_cheese", "dairy_cheese", 285, 18.8, null),
  ref("pear", "other_fruit", 56.6, 0.36, 150),
  ref("bread_wholemeal_integral_bread", "whole_grain", 244, 8.38, null),
  ref("rye_bread", "whole_grain", 260, 8.3, 40),
  ref("country_style_bread_french", "refined_grain", 253, 7.52, null),
  ref("bread_french_bread_baguette", "refined_grain", 287, 8.27, 250),
  // Pour les cas qui mordent.
  ref("cheesecake", "dairy_yogurt", 330, 5, null),
  ref("potato", "starchy_veg", 80, 2, null),
  ref("leek", "non_starchy_veg", 30, 1.5, null),
  ref("water", "water", 0, 0, null),
];
const ALIASES = [
  { alias: "pomme", slug: "apple" },
  { alias: "yaourt nature", slug: "plain_yogurt" },
  { alias: "fromage blanc", slug: "fromage_blanc" },
  { alias: "carotte", slug: "carrot" },
  { alias: "carottes", slug: "carrot" },
  { alias: "pomme de terre", slug: "potato" },
  { alias: "poireau", slug: "leek" },
  { alias: "eau", slug: "water" },
];
const INDEX: CompositionIndex = buildCompositionIndex(BASE_REFS, ALIASES);
/** ⚠️ LE YAOURT À 125 g L'UNITÉ: ce que la piste « données » ajoutera. */
const INDEX_YOGURT_UNIT: CompositionIndex = buildCompositionIndex(
  BASE_REFS.map((r) => r.slug === "plain_yogurt" ? { ...r, unitGrams: 125 } : r),
  ALIASES,
);

const THOMAS = "m-thomas";
const CHRIS = "m-chris";
const FAB = "m-fab";
const MEMBERS = [THOMAS, CHRIS, FAB];

function ask(
  memberId: string,
  dayToken: string,
  dayIndex: number,
  slot: SideCourseSlot,
  goal: SideCourseGoal,
  courses: [SideCourseKind, number][],
): SideCourseAsk {
  return {
    memberId,
    dayToken,
    slot,
    dayIndex,
    goal,
    courses: courses.map(([kind, kcal]) => ({ kind, kcal, proteinEstG: 0 })),
  };
}

function raw(
  member_id: string,
  day: string,
  slot: string,
  kind: string,
  term: string,
  over: Partial<RawSideCourse> = {},
): RawSideCourse {
  return { day, slot, member_id, kind, term, ref: null, preparation_id: null, ...over };
}

const OK_JUDGE: SideTermJudge = () => ({ ok: true });
/**
 * Un juge qui refuse TOUT fromage — par le groupe lu à l'index, pas par une
 * liste de slugs: la liste de secours change, « pas de fromage » ne change pas.
 */
const NO_CHEESE_JUDGE: SideTermJudge = ({ ref }) =>
  INDEX.bySlug.get(ref ?? "")?.foodGroupRef === "dairy_cheese"
    ? { ok: false, reason: "excluded" }
    : { ok: true };

function ledgerOf(over: Partial<Parameters<typeof buildSideCourseLedger>[0]>) {
  return buildSideCourseLedger({
    raw: [],
    asks: [],
    memberIds: MEMBERS,
    index: INDEX,
    preparations: [],
    dishes: [],
    sessionDayIndexByPrep: new Map(),
    judgeBySlot: { lunch: OK_JUDGE, dinner: OK_JUDGE },
    allergens: [],
    language: "fr",
    kcalWithheldMemberIds: new Set(),
    // ⟳ 2026-09-24 — aucun plat raboté: le registre d'avant, à l'octet.
    extraDeficitByKey: new Map(),
    breadAllowed: () => true,
    mealKcalByKey: new Map(),
    ...over,
  });
}

function lactose(): StudentSafetyConstraint {
  return {
    id: "c-lactose",
    userId: "u-1",
    kind: "intolerance",
    allergenRef: "lactose",
    substanceRef: null,
    medicationClass: null,
    conditionRef: null,
    dietRef: null,
    severity: "medical",
    declaredBy: "student",
    notes: null,
    contentLocale: "fr-FR",
  };
}

function excludeItem(text: string, subject: string, occasion: string | null): RetainedItem {
  return {
    kind: "food.exclude",
    scope: "durable",
    subject,
    text,
    value: null,
    source: "draft_note",
    at: "2026-09-23",
    item: "",
    confidence: null,
    quote: text,
    occasion,
  } as unknown as RetainedItem;
}

function ing(term: string, grams: number): DishIngredient {
  return {
    term,
    ref: null,
    refRefused: false,
    quantity: `${grams} g`,
    in_pantry: false,
    amount: grams,
    unit: "g",
    state: "raw",
    gramsRaw: grams,
    quantitySource: "structured",
    group: null,
    part: null,
  };
}

function prep(id: string, ingredients: DishIngredient[]): MealPreparation {
  return {
    id,
    title: "Velouté",
    servingsMade: 4,
    ingredients,
    method: "Cuire, mixer.",
    activeMinutes: null,
    totalMinutes: null,
    cookOn: null,
    components: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ÉPINGLAGE — les nouvelles constantes de ce module
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("épinglage — SIDE_COURSE_PREP_MIN_VEG_SHARE vaut 0,5", () => {
  assertEquals(SIDE_COURSE_PREP_MIN_VEG_SHARE, 0.5);
});

Deno.test("épinglage — SIDE_COURSE_GOAL_ORDER, le mineur sans fromage", () => {
  assertEquals(SIDE_COURSE_GOAL_ORDER, {
    fat_loss: ["starter", "dessert", "cheese", "bread"],
    maintenance: ["cheese", "dessert", "starter", "bread"],
    muscle_gain: ["cheese", "dessert", "bread", "starter"],
    minor: ["dessert", "starter", "bread"],
  });
});

Deno.test("⟳ 2026-09-23 (v40) — épinglage — SIDE_COURSE_REGROW_ORDER: prise pain puis fromage, maintien l'inverse, perte et mineur rien", () => {
  assertEquals(SIDE_COURSE_REGROW_ORDER, {
    fat_loss: [],
    maintenance: ["cheese", "bread"],
    muscle_gain: ["bread", "cheese"],
    minor: [],
  });
});

Deno.test("épinglage — SIDE_COURSE_KIND_WORDS et SIDE_COURSE_EXTRACT_STATUSES", () => {
  assertEquals(SIDE_COURSE_KIND_WORDS, {
    starter: ["entrée", "starter"],
    cheese: ["fromage", "cheese"],
    dessert: ["dessert"],
    bread: ["pain", "bread"],
  });
  assertEquals(SIDE_COURSE_EXTRACT_STATUSES, ["ok", "absent", "unreadable", "not_an_array"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⓪ L'OBJECTIF ET LA CLÉ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("sideCourseGoalFor — le mineur d'abord, puis le sens de la balance", () => {
  assertEquals(sideCourseGoalFor({ goal: "fat_loss", isMinor: true }), "minor");
  assertEquals(sideCourseGoalFor({ goal: "fat_loss", isMinor: false }), "fat_loss");
  assertEquals(sideCourseGoalFor({ goal: "muscle_gain", isMinor: false }), "muscle_gain");
  assertEquals(sideCourseGoalFor({ goal: "maintenance", isMinor: false }), "maintenance");
  assertEquals(sideCourseGoalFor({ goal: null, isMinor: false }), "maintenance");
  assertEquals(sideCourseKey("m", "mon", "lunch"), "m|mon|lunch");
});

// ═══════════════════════════════════════════════════════════════════════════
// ① LA ROTATION
// ═══════════════════════════════════════════════════════════════════════════

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((dayToken, dayIndex) => ({
  dayToken,
  dayIndex,
  slots: ["breakfast", "lunch", "snack", "dinner"],
}));

function plan(goal: SideCourseGoal, over: Partial<Parameters<typeof planSideCourses>[0]> = {}) {
  return planSideCourses({
    goal,
    prefsBySlot: {},
    lightSlots: new Set(),
    impossibleKinds: new Map(),
    days: WEEK,
    ...over,
  });
}
const kindsAt = (p: ReturnType<typeof planSideCourses>, day: string, slot: SideCourseSlot) =>
  p.get(day)?.get(slot)?.courses.map((c) => `${c.kind}:${c.baseKcal}`);

Deno.test("perte — midi entrée + dessert; soir un jour sur deux; le fromage remplace l'à-côté du soir à d%3=2", () => {
  const p = plan("fat_loss");
  for (const day of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
    assertEquals(kindsAt(p, day, "lunch"), ["starter:60", "dessert:80"], day);
  }
  // ⟳ 2026-09-23 (arbitrage n° 6) — le fromage tombe à d=2 (un jour PAIR, qui
  // aurait porté l'entrée) et à d=5, quelle que soit la parité.
  assertEquals(
    ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) =>
      kindsAt(p, d, "dinner")?.join(",")
    ),
    [
      "starter:60",
      "dessert:80",
      "cheese:70",
      "dessert:80",
      "starter:60",
      "cheese:70",
      "starter:60",
    ],
  );
  const lunch = p.get("mon")!.get("lunch")!;
  // ⛔ Pas de pain en croissance pour une perte.
  assertEquals(lunch.growKinds, ["starter", "dessert"]);
  assertEquals(lunch.capShare, 0.35);
  assertEquals(lunch.refused, false);
  assertEquals(lunch.light, false);
  // Les moments autres que déjeuner et dîner ne reçoivent rien.
  assertEquals([...p.get("mon")!.keys()], ["lunch", "dinner"]);
});

Deno.test("perte — fenêtre de 5 jours: 1 fromage le soir; de 7 jours: 2 (le cas qui mordait: 0)", () => {
  const cheeseDinners = (n: number) => {
    const p = plan("fat_loss", { days: WEEK.slice(0, n) });
    return WEEK.slice(0, n).filter((d) =>
      p.get(d.dayToken)?.get("dinner")?.courses.some((c) => c.kind === "cheese")
    ).map((d) => d.dayIndex);
  };
  assertEquals(cheeseDinners(5), [2]);
  assertEquals(cheeseDinners(7), [2, 5]);
  // Jamais de fromage au midi en perte.
  const p = plan("fat_loss");
  for (const d of WEEK) {
    assert(!p.get(d.dayToken)!.get("lunch")!.courses.some((c) => c.kind === "cheese"), d.dayToken);
  }
});

Deno.test("maintien — fromage/dessert en alternance, entrée à d%3=0 au midi, soir inversé", () => {
  const p = plan("maintenance");
  assertEquals(kindsAt(p, "mon", "lunch"), ["cheese:110", "starter:60"]);
  assertEquals(kindsAt(p, "tue", "lunch"), ["dessert:90"]);
  assertEquals(kindsAt(p, "wed", "lunch"), ["cheese:110"]);
  assertEquals(kindsAt(p, "thu", "lunch"), ["dessert:90", "starter:60"]);
  assertEquals(kindsAt(p, "mon", "dinner"), ["dessert:90"]);
  assertEquals(kindsAt(p, "tue", "dinner"), ["cheese:110"]);
  assertEquals(p.get("mon")!.get("lunch")!.growKinds, ["cheese", "starter", "bread"]);
});

Deno.test("prise — fromage + dessert midi et soir, croissance pain → dessert → fromage", () => {
  const p = plan("muscle_gain");
  assertEquals(kindsAt(p, "wed", "lunch"), ["cheese:130", "dessert:110"]);
  assertEquals(kindsAt(p, "wed", "dinner"), ["cheese:130", "dessert:110"]);
  assertEquals(p.get("wed")!.get("dinner")!.growKinds, ["bread", "dessert", "cheese"]);
});

Deno.test("mineur — jour 2 sans fromage; un réglage true l'ouvre; part 0,25", () => {
  const p = plan("minor");
  assertEquals(kindsAt(p, "wed", "lunch"), ["dessert:90"]);
  assertEquals(kindsAt(p, "wed", "dinner"), ["dessert:90"]);
  assertEquals(p.get("wed")!.get("lunch")!.capShare, 0.25);
  assertEquals(p.get("wed")!.get("lunch")!.growKinds, ["dessert", "bread"]);
  const withCheese = plan("minor", { prefsBySlot: { lunch: { cheese: true } } });
  assertEquals(kindsAt(withCheese, "wed", "lunch"), ["dessert:90", "cheese:80"]);
  assertEquals(kindsAt(withCheese, "wed", "dinner"), ["dessert:90"]);
});

Deno.test("réglages — les quatre à false ⇒ refused, aucun à-côté, aucune croissance", () => {
  const none = { starter: false, cheese: false, dessert: false, bread: false };
  const p = plan("muscle_gain", { prefsBySlot: { lunch: none } });
  assertEquals(p.get("mon")!.get("lunch"), {
    courses: [],
    growKinds: [],
    refused: true,
    capShare: 0.35,
    light: false,
  });
  // Le dîner n'est pas touché par le réglage du déjeuner.
  assertEquals(kindsAt(p, "mon", "dinner"), ["cheese:130", "dessert:110"]);
});

Deno.test("réglages — false retire, une liste vidée est re-remplie par l'ordre de l'objectif", () => {
  const p = plan("maintenance", { prefsBySlot: { lunch: { cheese: false } } });
  assertEquals(kindsAt(p, "mon", "lunch"), ["starter:60"]);
  // d=2: la rotation ne portait que du fromage ⇒ re-remplie par le dessert.
  assertEquals(kindsAt(p, "wed", "lunch"), ["dessert:90"]);
  assertEquals(p.get("wed")!.get("lunch")!.growKinds, ["dessert", "bread"]);
  const noBread = plan("maintenance", { prefsBySlot: { lunch: { bread: false } } });
  assertEquals(noBread.get("wed")!.get("lunch")!.growKinds, ["cheese"]);
});

Deno.test("impossible — un type impossible gagne sur un réglage true; tout impossible ⇒ refused", () => {
  const p = plan("maintenance", {
    prefsBySlot: { dinner: { cheese: true } },
    impossibleKinds: new Map([["dinner", new Set<SideCourseKind>(["cheese"])]]),
  });
  assertEquals(kindsAt(p, "tue", "dinner"), ["dessert:90"]);
  assertEquals(kindsAt(p, "mon", "dinner"), ["dessert:90"]);
  const all = plan("fat_loss", {
    impossibleKinds: new Map([[
      "lunch",
      new Set<SideCourseKind>(["starter", "cheese", "dessert", "bread"]),
    ]]),
  });
  assertEquals(all.get("mon")!.get("lunch")!.refused, true);
  assertEquals(all.get("mon")!.get("lunch")!.courses, []);
});

Deno.test("moment léger — un seul à-côté: le premier, ou le premier type forcé", () => {
  const p = plan("fat_loss", { lightSlots: new Set(["lunch"]) });
  assertEquals(kindsAt(p, "mon", "lunch"), ["starter:60"]);
  assertEquals(p.get("mon")!.get("lunch")!.light, true);
  assertEquals(p.get("mon")!.get("lunch")!.growKinds, ["starter"]);
  const forced = plan("fat_loss", {
    lightSlots: new Set(["lunch"]),
    prefsBySlot: { lunch: { dessert: true } },
  });
  assertEquals(kindsAt(forced, "mon", "lunch"), ["dessert:80"]);
});

Deno.test("un jour sans déjeuner ni dîner a une entrée VIDE, pas d'entrée absente", () => {
  const p = planSideCourses({
    goal: "fat_loss",
    prefsBySlot: {},
    lightSlots: new Set(),
    impossibleKinds: new Map(),
    days: [{ dayToken: "mon", dayIndex: 0, slots: ["breakfast", "snack"] }],
  });
  assertEquals(p.get("mon")!.size, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② L'IMPOSSIBLE
// ═══════════════════════════════════════════════════════════════════════════

function impossible(over: Partial<Parameters<typeof impossibleKindsFor>[0]>) {
  return [
    ...impossibleKindsFor({
      goal: "maintenance",
      slot: "dinner",
      exclusionTerms: [],
      regime: null,
      allergens: [],
      index: INDEX,
      ...over,
    }),
  ].sort();
}

Deno.test("impossible — rien ne mord ⇒ ensemble vide (le cas qui passe)", () => {
  assertEquals(impossible({}), []);
});

Deno.test("impossible — « fromage » au dîner retire le fromage du dîner, pas du déjeuner", () => {
  const exclusionTerms = exclusionTermsFor({
    items: [excludeItem("fromage", FAB, "dinner")],
    subject: FAB,
  });
  assertEquals(impossible({ exclusionTerms, slot: "dinner" }), ["cheese"]);
  assertEquals(impossible({ exclusionTerms, slot: "lunch" }), []);
});

Deno.test("impossible — végétalien: fromage impossible, dessert possible (les fruits)", () => {
  assertEquals(impossible({ regime: "vegan" }), ["cheese"]);
});

Deno.test("impossible — intolérance au lactose: fromage impossible; le mineur aussi, par le groupe", () => {
  assertEquals(impossible({ allergens: [lactose()] }), ["cheese"]);
  assertEquals(impossible({ goal: "minor", allergens: [lactose()] }), ["cheese"]);
  assertEquals(impossible({ goal: "minor" }), []);
});

Deno.test("impossible — mineur: « fromage » au dîner rend son fromage impossible au dîner (mordait à vide)", () => {
  // ⟳ 2026-09-23 — avant sa liste de secours, le fromage d'un mineur n'était
  // couvert que par la règle des GROUPES: une exclusion « fromage » ne le
  // rendait pas impossible, et un réglage `true` le demandait au modèle au
  // dîner refusé.
  const exclusionTerms = exclusionTermsFor({
    items: [excludeItem("fromage", "m-lea", "dinner")],
    subject: "m-lea",
  });
  assertEquals(impossible({ goal: "minor", exclusionTerms, slot: "dinner" }), ["cheese"]);
  assertEquals(impossible({ goal: "minor", exclusionTerms, slot: "lunch" }), []);
});

Deno.test("impossible — référentiel absent ⇒ tout est impossible", () => {
  assertEquals(impossible({ index: null }), ["bread", "cheese", "dessert", "starter"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA LECTURE DU MODÈLE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("extractSideCourses — lit la clé, jette et compte ce qui n'est pas un objet", () => {
  const text = "```json\n" + JSON.stringify({
    dishes: [],
    side_courses: [
      { day: "mon", slot: "lunch", member_id: FAB, kind: "dessert", term: "pomme", ref: "apple" },
      42,
      {
        day: "tue",
        slot: "dinner",
        member_id: CHRIS,
        kind: "starter",
        term: "velouté",
        preparation_id: "p1",
        ref: null,
      },
    ],
  }) + "\n```";
  const out = extractSideCourses(text);
  assertEquals(out.status, "ok");
  assertEquals(out.malformed, 1);
  assertEquals(out.entries, [
    {
      day: "mon",
      slot: "lunch",
      member_id: FAB,
      kind: "dessert",
      term: "pomme",
      ref: "apple",
      preparation_id: null,
    },
    {
      day: "tue",
      slot: "dinner",
      member_id: CHRIS,
      kind: "starter",
      term: "velouté",
      ref: null,
      preparation_id: "p1",
    },
  ]);
});

Deno.test("extractSideCourses — absent, illisible, pas un tableau: [] et le motif", () => {
  assertEquals(extractSideCourses('{"dishes": []}'), {
    entries: [],
    status: "absent",
    malformed: 0,
  });
  assertEquals(extractSideCourses("pas de json"), {
    entries: [],
    status: "unreadable",
    malformed: 0,
  });
  assertEquals(extractSideCourses('{"side_courses": [}'), {
    entries: [],
    status: "unreadable",
    malformed: 0,
  });
  assertEquals(extractSideCourses('{"side_courses": {"a": 1}}'), {
    entries: [],
    status: "not_an_array",
    malformed: 0,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LES GRAMMES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("grammes — pomme 80 kcal prévue ⇒ 1 unité de 150 g, 71,4 kcal", () => {
  const g = sideGramsFor({
    kcal: 80,
    kind: "dessert",
    kcalPer100g: 47.6,
    proteinPer100g: 0.3,
    unitGrams: 150,
    group: "other_fruit",
  });
  assertEquals(g.unitCount, 1);
  assertEquals(g.grams, 150);
  assertAlmostEquals(g.kcal, 71.4, 1e-9);
  assertAlmostEquals(g.proteinG!, 0.45, 1e-9);
  assertEquals(g.snapped, true);
  assertEquals(g.clamped, false);
});

Deno.test("grammes — yaourt 110 kcal prévu, 125 g l'unité ⇒ 1 × 125 g, 73,75 kcal", () => {
  const g = sideGramsFor({
    kcal: 110,
    kind: "dessert",
    kcalPer100g: 59,
    proteinPer100g: 3.5,
    unitGrams: 125,
    group: "dairy_yogurt",
  });
  assertEquals(g.unitCount, 1);
  assertEquals(g.grams, 125);
  assertAlmostEquals(g.kcal, 73.75, 1e-9);
});

Deno.test("grammes — sans poids à l'unité: aux 5 g, et la borne du type tient", () => {
  const cheddar = sideGramsFor({
    kcal: 110,
    kind: "cheese",
    kcalPer100g: 399,
    proteinPer100g: 24,
    unitGrams: null,
    group: "dairy_cheese",
  });
  assertEquals([cheddar.grams, cheddar.unitCount, cheddar.clamped], [30, null, false]);
  assertAlmostEquals(cheddar.kcal, 119.7, 1e-9);
  // Concombre: 300 g l'unité > 250 g (borne de l'entrée) ⇒ il se pèse, borné à 250 g.
  const cucumber = sideGramsFor({
    kcal: 60,
    kind: "starter",
    kcalPer100g: 14.7,
    proteinPer100g: 0.6,
    unitGrams: 300,
    group: "non_starchy_veg",
  });
  assertEquals([cucumber.grams, cucumber.unitCount, cucumber.clamped], [250, null, true]);
  assertAlmostEquals(cucumber.kcal, 36.75, 1e-9);
  // Baguette: 250 g l'unité > 100 g (borne du pain) ⇒ jamais « 1 baguette ».
  const baguette = sideGramsFor({
    kcal: 100,
    kind: "bread",
    kcalPer100g: 287,
    proteinPer100g: 8.27,
    unitGrams: 250,
    group: "refined_grain",
  });
  assertEquals([baguette.grams, baguette.unitCount], [35, null]);
});

Deno.test("⟳ 2026-09-23 — grammes: l'arrondi ne franchit jamais le plafond du type (pain 200, fromage 160)", () => {
  // Mesuré (campagne E2): le pain en tranches de 40 g arrondissait à 2 tranches
  // = 209,6 kcal > 200 ⇒ refusé. ⟳ 2026-09-23 (v40): le pain se PÈSE. Baguette
  // 287 kcal/100 g, 199 kcal prévues ⇒ 69,3 g arrondis à 70 g = 200,9 kcal > 200
  // ⇒ 65 g = 186,55 kcal, borné.
  const capped = sideGramsFor({
    kcal: 199,
    kind: "bread",
    kcalPer100g: 287,
    proteinPer100g: 8.27,
    unitGrams: 250,
    group: "refined_grain",
  });
  assertEquals([capped.grams, capped.unitCount, capped.clamped], [65, null, true]);
  assertAlmostEquals(capped.kcal, 186.55, 1e-9);
  // Le cas qui passe, sans plafond atteint: pain complet 262 kcal/100 g, 40 g la
  // tranche, 180 kcal ⇒ 68,7 g arrondis à 70 g = 183,4 kcal, PESÉ, rien de borné.
  const weighed = sideGramsFor({
    kcal: 180,
    kind: "bread",
    kcalPer100g: 262,
    proteinPer100g: 9,
    unitGrams: 40,
    group: "whole_grain",
  });
  assertEquals([weighed.grams, weighed.unitCount, weighed.clamped], [70, null, false]);
  assertAlmostEquals(weighed.kcal, 183.4, 1e-9);
  // Sans unité: comté 413 kcal/100 g, 160 kcal prévues ⇒ 38,7 g arrondis à 40 g
  // = 165,2 kcal > 160 ⇒ 35 g = 144,55 kcal.
  const comte = sideGramsFor({
    kcal: 160,
    kind: "cheese",
    kcalPer100g: 413,
    proteinPer100g: 27.8,
    unitGrams: null,
    group: "dairy_cheese",
  });
  assertEquals([comte.grams, comte.unitCount, comte.clamped], [35, null, true]);
  assertAlmostEquals(comte.kcal, 144.55, 1e-9);
});

Deno.test("grammes — les unités tiennent dans les bornes: tomate plafonnée à 2, carotte montée à 2", () => {
  const tomato = sideGramsFor({
    kcal: 60,
    kind: "starter",
    kcalPer100g: 19.3,
    proteinPer100g: 0.9,
    unitGrams: 100,
    group: "non_starchy_veg",
  });
  assertEquals([tomato.grams, tomato.unitCount, tomato.clamped], [200, 2, true]);
  assertAlmostEquals(tomato.kcal, 38.6, 1e-9);
  const carrot = sideGramsFor({
    kcal: 40,
    kind: "starter",
    kcalPer100g: 40.2,
    proteinPer100g: 0.6,
    unitGrams: 70,
    group: "non_starchy_veg",
  });
  // 1 carotte = 70 g < 80 g (borne basse de l'entrée) ⇒ 2 carottes.
  assertEquals([carrot.grams, carrot.unitCount, carrot.clamped], [140, 2, true]);
  assertEquals(
    sideGramsFor({
      kcal: 0,
      kind: "dessert",
      kcalPer100g: 47.6,
      proteinPer100g: 0.3,
      unitGrams: 150,
      group: "other_fruit",
    }).grams,
    0,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LE REGISTRE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("registre — une entrée valide du modèle est servie, et l'écart revient au plat", () => {
  const l = ledgerOf({
    asks: [ask(CHRIS, "mon", 0, "lunch", "maintenance", [["cheese", 110]])],
    raw: [raw(CHRIS, "mon", "lunch", "cheese", "cheddar")],
  });
  assertEquals(l.counters.valid, 1);
  assertEquals(l.counters.filled_by_engine, 0);
  const e = l.entries[0];
  assertEquals([e.term, e.ref, e.grams, e.unitCount, e.source], [
    "cheddar",
    "cheddar",
    30,
    null,
    "model",
  ]);
  assertAlmostEquals(snapDeltaKcal(l, CHRIS, "mon", "lunch"), -9.7, 1e-9);
  assertEquals(l.byKey.get("m-chris|mon|lunch")?.length, 1);
});

Deno.test("registre — chaque refus a son motif, et le secours complète ce qui manque", () => {
  const l = ledgerOf({
    asks: [
      ask(CHRIS, "mon", 0, "lunch", "maintenance", [["cheese", 110]]),
      ask(FAB, "mon", 0, "lunch", "fat_loss", [["starter", 60], ["dessert", 80]]),
      ask(THOMAS, "mon", 0, "lunch", "muscle_gain", [["dessert", 180]]),
    ],
    raw: [
      raw("m-ghost", "mon", "lunch", "cheese", "cheddar"),
      raw(CHRIS, "mon", "dinner", "cheese", "cheddar"),
      // ⟳ 2026-09-23 — « comté » se résout depuis la migration 20260923110000:
      // le terme qui ne se résout pas est désormais un fromage absent du référentiel.
      raw(CHRIS, "mon", "lunch", "cheese", "ossau-iraty"),
      raw(CHRIS, "mon", "lunch", "cheese", "cheddar"),
      raw(CHRIS, "mon", "lunch", "cheese", "parmesan"),
      raw(FAB, "mon", "lunch", "starter", "cheddar"),
      raw(THOMAS, "mon", "lunch", "dessert", "cheesecake"),
      raw(FAB, "mon", "lunch", "dessert", "pomme"),
    ],
  });
  assertEquals(l.counters, {
    asked: 4,
    declared: 8,
    valid: 2,
    refused: 6,
    refused_by: {
      unknown_member: 1,
      not_asked: 1,
      duplicate: 1,
      unresolved: 1,
      wrong_kind: 2,
      excluded: 0,
      regime: 0,
      dairy_budget: 0,
      bad_preparation: 0,
    },
    filled_by_engine: 2,
    dropped: 0,
  });
  const at = (m: string) =>
    l.entries.filter((e) => e.memberId === m).map((e) =>
      `${e.kind}:${e.ref}:${e.grams}:${e.unitCount}:${e.source}`
    );
  // Thomas: le cheesecake (80 g minimum = 264 kcal > 250) est refusé — la
  // borne dense de 15 g ne vaut pas pour un laitage (⟳ 2026-09-23).
  // ⟳ 2026-09-23 — UNE banane (120 g l'unité ≥ 100 g), plus deux: 108,6 kcal.
  assertEquals(at(THOMAS), ["dessert:banana:120:1:engine_fallback"]);
  // Fabrice: rang 2 ⇒ concombre, pesé (300 g l'unité > 250), borné à 250 g.
  assertEquals(at(FAB), ["starter:cucumber:250:null:engine_fallback", "dessert:apple:150:1:model"]);
  // 180 prévues, 108,6 servies: 71,4 kcal rendues au plat (avant: −37,2).
  assertAlmostEquals(snapDeltaKcal(l, THOMAS, "mon", "lunch"), 71.4, 1e-9);
  assertEquals(l.variety.fruit_capped, 1);
  assertAlmostEquals(l.variety.fruit_capped_kcal, 71.4, 1e-9);
  // Fabrice: 60 + 80 prévus, 36,75 + 71,4 servis.
  assertAlmostEquals(snapDeltaKcal(l, FAB, "mon", "lunch"), 31.85, 1e-9);
});

Deno.test("registre — le juge refuse (exclusion, régime) et le secours saute ce qu'il refuse", () => {
  const judge: SideTermJudge = ({ ref }) =>
    ref === "apple"
      ? { ok: false, reason: "excluded" }
      : ref === "plain_yogurt"
      ? { ok: false, reason: "regime" }
      : { ok: true };
  const l = ledgerOf({
    judgeBySlot: { lunch: judge, dinner: judge },
    asks: [ask(CHRIS, "mon", 0, "lunch", "maintenance", [["dessert", 110]])],
    raw: [
      raw(CHRIS, "mon", "lunch", "dessert", "pomme"),
      raw(CHRIS, "mon", "lunch", "dessert", "yaourt nature"),
    ],
  });
  assertEquals(l.counters.refused_by.excluded, 1);
  assertEquals(l.counters.refused_by.regime, 1);
  // Rang (0 + 1) mod 8 = le yaourt, refusé ⇒ la poire (réintégrée le 2026-09-23),
  // 1 × 150 g, et son mot d'écran français.
  assertEquals(l.entries.map((e) => `${e.ref}:${e.grams}:${e.term}`), ["pear:150:poire"]);
});

Deno.test("registre — un second dessert laitier le même jour ⇒ dairy_budget, le secours prend un fruit", () => {
  const l = ledgerOf({
    asks: [
      ask(FAB, "tue", 1, "lunch", "fat_loss", [["dessert", 80]]),
      ask(FAB, "tue", 1, "dinner", "fat_loss", [["dessert", 80]]),
    ],
    raw: [
      raw(FAB, "tue", "lunch", "dessert", "yaourt nature"),
      raw(FAB, "tue", "dinner", "dessert", "fromage blanc"),
    ],
  });
  assertEquals(l.counters.refused_by.dairy_budget, 1);
  assertEquals(l.counters.valid, 1);
  assertEquals(l.counters.filled_by_engine, 1);
  // Rang (1 + 2) mod 8 = fromage blanc, laitier ⇒ sauté ⇒ orange, 1 × 150 g.
  assertEquals(l.entries.map((e) => `${e.slot}:${e.ref}:${e.grams}:${e.unitCount}`), [
    "lunch:plain_yogurt:135:null",
    "dinner:orange:150:1",
  ]);
});

Deno.test("registre — fromage dont tous les secours sont refusés ⇒ dropped=1, l'énergie revient au plat", () => {
  const l = ledgerOf({
    judgeBySlot: { lunch: NO_CHEESE_JUDGE, dinner: NO_CHEESE_JUDGE },
    asks: [ask(FAB, "sat", 5, "dinner", "fat_loss", [["cheese", 70]])],
  });
  assertEquals(l.counters.dropped, 1);
  assertEquals(l.counters.filled_by_engine, 0);
  assertEquals(l.entries, []);
  assertEquals(snapDeltaKcal(l, FAB, "sat", "dinner"), 70);
  // Le cas qui passe: sans juge qui refuse, un fromage est servi.
  const ok = ledgerOf({ asks: [ask(FAB, "sat", 5, "dinner", "fat_loss", [["cheese", 70]])] });
  assertEquals(ok.counters.dropped, 0);
  // Rang (5 + 2) mod 4 = la feta: 70 kcal à 285 kcal/100 g ⇒ 24,6 g ⇒ 25 g.
  assertEquals(ok.entries.map((e) => `${e.ref}:${e.grams}:${e.term}`), ["feta:25:feta"]);
});

Deno.test("registre — le juge du dîner ne juge pas le midi: « pas de fromage le soir »", () => {
  const l = ledgerOf({
    judgeBySlot: { lunch: OK_JUDGE, dinner: NO_CHEESE_JUDGE },
    asks: [
      ask(CHRIS, "tue", 1, "lunch", "maintenance", [["cheese", 110]]),
      ask(CHRIS, "tue", 1, "dinner", "maintenance", [["cheese", 110]]),
    ],
    raw: [
      raw(CHRIS, "tue", "lunch", "cheese", "cheddar"),
      raw(CHRIS, "tue", "dinner", "cheese", "cheddar"),
    ],
  });
  assertEquals(l.entries.map((e) => `${e.slot}:${e.ref}`), ["lunch:cheddar"]);
  assertEquals(l.counters.refused_by.excluded, 1);
  assertEquals(l.counters.dropped, 1);
  assertEquals(snapDeltaKcal(l, CHRIS, "tue", "dinner"), 110);
});

Deno.test("registre — le fromage FORCÉ d'un mineur, que le modèle ne nomme pas, est servi par le secours", () => {
  // ⟳ 2026-09-23 — la liste du mineur était vide: ce fromage était `dropped`.
  const LEA = "m-lea";
  const l = ledgerOf({
    memberIds: [...MEMBERS, LEA],
    asks: [ask(LEA, "wed", 2, "lunch", "minor", [["cheese", 80]])],
  });
  assertEquals(l.counters.filled_by_engine, 1);
  assertEquals(l.counters.dropped, 0);
  // Rang (2 + 3) mod 3 = le comté: 80 kcal à 413 kcal/100 g ⇒ 19,4 g ⇒ 20 g.
  assertEquals(l.entries.map((e) => `${e.ref}:${e.grams}:${e.term}:${e.source}`), [
    "comte:20:comté:engine_fallback",
  ]);
  assertAlmostEquals(snapDeltaKcal(l, LEA, "wed", "lunch"), -2.6, 1e-9);
});

Deno.test("registre — une entrée non demandée est refusée not_asked, un type inconnu aussi", () => {
  const l = ledgerOf({
    asks: [ask(FAB, "mon", 0, "lunch", "fat_loss", [["dessert", 80]])],
    raw: [
      raw(FAB, "mon", "lunch", "cheese", "cheddar"),
      raw(FAB, "mon", "lunch", "soup", "velouté"),
      raw(FAB, "mon", "breakfast", "dessert", "pomme"),
    ],
  });
  assertEquals(l.counters.refused_by.not_asked, 3);
  assertEquals(l.counters.valid, 0);
  assertEquals(l.counters.filled_by_engine, 1);
});

Deno.test("registre — cinq jours de dessert en perte, sans le modèle ⇒ cinq aliments différents", () => {
  const days = ["mon", "tue", "wed", "thu", "fri"];
  const l = ledgerOf({
    memberIds: ["m-solo"],
    asks: days.map((d, i) => ask("m-solo", d, i, "lunch", "fat_loss", [["dessert", 80]])),
  });
  const refs = l.entries.map((e) => e.ref);
  assertEquals(refs, ["apple", "plain_yogurt", "pear", "fromage_blanc", "orange"]);
  assertEquals(new Set(refs).size, 5);
  assertEquals(l.counters.filled_by_engine, 5);
  // La pomme de 80 kcal: 1 unité, 150 g, et l'écart de 8,6 kcal revient au plat.
  assertEquals([l.entries[0].unitCount, l.entries[0].grams, l.entries[0].term], [1, 150, "pomme"]);
  assertAlmostEquals(snapDeltaKcal(l, "m-solo", "mon", "lunch"), 8.6, 1e-9);
});

Deno.test("registre — sans laitage (lactose), jamais le même fruit deux jours de suite", () => {
  const days = ["mon", "tue", "wed", "thu", "fri"];
  const l = ledgerOf({
    memberIds: ["m-solo"],
    allergens: [lactose()],
    asks: days.map((d, i) => ask("m-solo", d, i, "lunch", "fat_loss", [["dessert", 80]])),
  });
  assertEquals(l.entries.map((e) => e.ref), ["apple", "pear", "orange", "kiwi", "orange"]);
});

Deno.test("registre — yaourt de 125 g l'unité, 110 kcal prévus ⇒ 1 × 125 g et 36,25 kcal rendus au plat", () => {
  const l = ledgerOf({
    index: INDEX_YOGURT_UNIT,
    asks: [ask(CHRIS, "mon", 0, "lunch", "maintenance", [["dessert", 110]])],
    raw: [raw(CHRIS, "mon", "lunch", "dessert", "yaourt nature")],
  });
  assertEquals([l.entries[0].unitCount, l.entries[0].grams, l.entries[0].source], [
    1,
    125,
    "model",
  ]);
  assertAlmostEquals(snapDeltaKcal(l, CHRIS, "mon", "lunch"), 36.25, 1e-9);
});

// ── L'ENTRÉE PRÉPARÉE ─────────────────────────────────────────────────────

const SOUP = prep("soupe_carotte", [
  ing("carotte", 400),
  ing("pomme de terre", 100),
  ing("eau", 500),
]);

function soupLedger(
  over: Partial<Parameters<typeof buildSideCourseLedger>[0]> & { eatIndex?: number } = {},
) {
  const eatIndex = over.eatIndex ?? 1;
  return ledgerOf({
    preparations: [SOUP],
    sessionDayIndexByPrep: new Map([["soupe_carotte", 0]]),
    asks: [ask(FAB, "tue", eatIndex, "lunch", "fat_loss", [["starter", 60]])],
    raw: [
      raw(FAB, "tue", "lunch", "starter", "velouté de carottes", {
        preparation_id: "soupe_carotte",
      }),
    ],
    ...over,
  });
}

Deno.test("entrée préparée — une soupe de session, à majorité de légumes, est servie en grammes prêts", () => {
  const l = soupLedger();
  assertEquals(l.counters.valid, 1);
  const e = l.entries[0];
  // Prêt: 400 × 0,9 + 100 + 500 = 960 g pour 240,8 kcal ⇒ 25,08 kcal/100 g ⇒ 240 g.
  assertEquals([e.preparationId, e.ref, e.grams, e.unitCount, e.term], [
    "soupe_carotte",
    null,
    240,
    null,
    "velouté de carottes",
  ]);
  assertAlmostEquals(e.kcal, 60.2, 1e-9);
  assertAlmostEquals(e.proteinG!, 1.1, 1e-9);
  assertEquals(sideDrawsByPreparation(l).get("soupe_carotte"), 240);
});

Deno.test("entrée préparée — chaque défaut est refusé bad_preparation, et le secours remplace", () => {
  const cases: Record<string, ReturnType<typeof soupLedger>> = {
    tiree_par_un_plat: soupLedger({
      dishes: [{ uses: [{ preparationId: "soupe_carotte" }], boxes: [] }],
    }),
    hors_session: soupLedger({ sessionDayIndexByPrep: new Map() }),
    cuite_4_jours_avant: soupLedger({ eatIndex: 4 }),
    cuite_apres: soupLedger({ sessionDayIndexByPrep: new Map([["soupe_carotte", 3]]) }),
    feculent: soupLedger({
      preparations: [
        prep("soupe_carotte", [ing("carotte", 200), ing("pomme de terre", 300), ing("eau", 500)]),
      ],
    }),
    inconnue: soupLedger({
      raw: [raw(FAB, "tue", "lunch", "starter", "velouté", { preparation_id: "nope" })],
    }),
    pas_une_entree: soupLedger({
      asks: [ask(FAB, "tue", 1, "lunch", "fat_loss", [["dessert", 80]])],
      raw: [raw(FAB, "tue", "lunch", "dessert", "compote", { preparation_id: "soupe_carotte" })],
    }),
  };
  for (const [name, l] of Object.entries(cases)) {
    assertEquals(l.counters.refused_by.bad_preparation, 1, name);
    assertEquals(l.counters.filled_by_engine, 1, name);
    assertEquals(l.entries[0].preparationId, null, name);
  }
  // Le cas limite qui PASSE: cuite 3 jours avant (MAX_FRIDGE_DAYS).
  assertEquals(soupLedger({ eatIndex: 3 }).counters.valid, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LES ADAPTATEURS
// ═══════════════════════════════════════════════════════════════════════════

function served(
  memberId: string,
  dayToken: string,
  slot: SideCourseSlot,
  over: Partial<SideCourseServed> = {},
): SideCourseServed {
  return {
    memberId,
    dayToken,
    slot,
    kind: "dessert",
    term: "pomme",
    ref: "apple",
    preparationId: null,
    grams: 150,
    unitCount: 1,
    plannedKcal: 80,
    kcal: 71.4,
    proteinG: 0.45,
    source: "engine_fallback",
    ...over,
  };
}

function ledgerFrom(entries: SideCourseServed[]) {
  const byKey = new Map<string, SideCourseServed[]>();
  for (const e of entries) {
    const k = sideCourseKey(e.memberId, e.dayToken, e.slot);
    byKey.set(k, [...(byKey.get(k) ?? []), e]);
  }
  return {
    entries,
    byKey,
    counters: {
      asked: 0,
      declared: 0,
      valid: 0,
      refused: 0,
      filled_by_engine: 0,
      dropped: 0,
      refused_by: {
        unknown_member: 0,
        not_asked: 0,
        duplicate: 0,
        unresolved: 0,
        wrong_kind: 0,
        excluded: 0,
        regime: 0,
        dairy_budget: 0,
        bad_preparation: 0,
      },
    },
  };
}

Deno.test("attachSideCourses — sa propre boîte avant le bac commun; sans hôte, compté et non écrit", () => {
  const dishes = [
    {
      title: "Curry",
      day: "mon",
      slot: "lunch",
      member_id: null,
      boxes: [{ id: "b1", member_ids: [CHRIS, FAB] }, { id: "b2", member_ids: [THOMAS] }],
    },
    {
      title: "Salade",
      day: "mon",
      slot: "lunch",
      member_id: null,
      boxes: [{ id: "b3", member_ids: [FAB] }],
    },
    {
      title: "Soupe",
      day: "mon",
      slot: "dinner",
      member_id: null,
      boxes: [{ id: "b4", member_ids: [THOMAS] }],
      side_courses: [{ stale: true }],
    },
  ];
  const l = ledgerFrom([
    served(CHRIS, "mon", "lunch"),
    served(FAB, "mon", "lunch", {
      kind: "cheese",
      term: "cheddar",
      ref: "cheddar",
      grams: 30,
      unitCount: null,
    }),
    served(THOMAS, "mon", "lunch"),
    served(CHRIS, "mon", "dinner"),
  ]);
  const { dishes: out, counters } = attachSideCourses(dishes, l);
  assertEquals(counters, {
    entries: 4,
    attached: 3,
    own_box: 2,
    shared_box: 1,
    member_dish: 0,
    table_dish: 0,
    no_host: 1,
  });
  assertEquals((out[0].side_courses as unknown[]).length, 2);
  assertEquals(out[1].side_courses, [{
    member_id: FAB,
    kind: "cheese",
    term: "cheddar",
    ref: "cheddar",
    grams: 30,
    unit_count: null,
    preparation_id: null,
    source: "engine_fallback",
  }]);
  // L'ancien à-côté du dîner est RETIRÉ, pas gardé à côté.
  assertEquals("side_courses" in out[2], false);
  // L'entrée n'est pas touchée.
  assertEquals((dishes[2] as Record<string, unknown>).side_courses, [{ stale: true }]);
  // ⛔ IDEMPOTENT.
  assertEquals(attachSideCourses(out, l).dishes, out);
});

Deno.test("scaleSidePots — la soupe rétrécit exactement à ce que les à-côtés en tirent", () => {
  const l = ledgerFrom([
    served(FAB, "tue", "lunch", {
      kind: "starter",
      ref: null,
      preparationId: "soupe_carotte",
      grams: 240,
      unitCount: null,
    }),
  ]);
  const other = prep("autre", [ing("carotte", 100)]);
  const { preparations, counters } = scaleSidePots({
    preparations: [SOUP, other],
    ledger: l,
    index: INDEX,
  });
  assertEquals(counters, { pots: 1, scaled: 1, unmeasured: 0, shortfall_g: 0 });
  assertEquals(preparations[0].ingredients.map((i) => [i.term, i.amount, i.gramsRaw]), [
    ["carotte", 100, 100],
    ["pomme de terre", 25, 25],
    ["eau", 125, 125],
  ]);
  assertEquals(preparationReadyGrams(preparations[0].ingredients, INDEX), 240);
  // Une casserole qu'aucun à-côté ne tire sort à l'identique.
  assertEquals(preparations[1], other);
});

Deno.test("scaleSidePots — et grandit quand les parts dépassent la casserole", () => {
  const l = ledgerFrom([
    served(FAB, "tue", "lunch", {
      kind: "starter",
      ref: null,
      preparationId: "soupe_carotte",
      grams: 1500,
      unitCount: null,
    }),
  ]);
  const { preparations, counters } = scaleSidePots({
    preparations: [SOUP],
    ledger: l,
    index: INDEX,
  });
  assertEquals(counters.shortfall_g, 0);
  assert(preparationReadyGrams(preparations[0].ingredients, INDEX)! >= 1500);
});

Deno.test("sideShoppingLines — en unités quand ça se compte, sans la soupe; lu par shoppingNeedsOf", () => {
  const l = ledgerFrom([
    served(FAB, "mon", "lunch"),
    served(FAB, "tue", "lunch"),
    served(CHRIS, "mon", "lunch", {
      kind: "cheese",
      term: "cheddar",
      ref: "cheddar",
      grams: 30,
      unitCount: null,
    }),
    served(FAB, "mon", "dinner", {
      kind: "starter",
      ref: null,
      preparationId: "soupe_carotte",
      grams: 240,
      unitCount: null,
    }),
  ]);
  const lines = sideShoppingLines(l);
  assertEquals(lines, [
    {
      day: "mon",
      ingredients: [
        { term: "pomme", ref: "apple", amount: 1, unit: "unit", quantity: "1", state: "raw" },
        { term: "cheddar", ref: "cheddar", amount: 30, unit: "g", quantity: "30 g", state: "raw" },
      ],
    },
    {
      day: "tue",
      ingredients: [{
        term: "pomme",
        ref: "apple",
        amount: 1,
        unit: "unit",
        quantity: "1",
        state: "raw",
      }],
    },
  ]);
  const needs = shoppingNeedsOf({ index: INDEX, dishes: lines, preparations: [] }).needs;
  assertEquals([needs.get("apple")?.amount, needs.get("apple")?.unit], [2, "unit"]);
  assertEquals([needs.get("cheddar")?.amount, needs.get("cheddar")?.unit], [30, "g"]);
});

Deno.test("sideNutritionByMouthDay — par personne et par jour; une protéine inconnue compte zéro, et comptée", () => {
  const l = ledgerFrom([
    served(FAB, "mon", "lunch"),
    served(FAB, "mon", "dinner", { kcal: 100, proteinG: null }),
    served(CHRIS, "mon", "lunch", { kcal: 50, proteinG: 2 }),
  ]);
  const n = sideNutritionByMouthDay(l);
  assertAlmostEquals(n.get("m-fab|mon")!.kcal, 171.4, 1e-9);
  assertAlmostEquals(n.get("m-fab|mon")!.proteinG, 0.45, 1e-9);
  assertEquals(n.get("m-fab|mon")!.proteinUnknown, 1);
  assertEquals(n.get("m-chris|mon"), { kcal: 50, proteinG: 2, proteinUnknown: 0 });
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ ⟳ 2026-09-23 — UN GROS FRUIT PAR DESSERT, LE DESSERT DENSE, LA TABLE
// ═══════════════════════════════════════════════════════════════════════════
//
// Mesuré sur la campagne du 2026-09-23: Thomas (prise) avait « emmental 35 g +
// 2 pommes » à 10 repas sur 10. Les « 2 pommes » venaient du moteur: 180 kcal
// de dessert ÷ 71,4 kcal la pomme de 150 g, arrondi à 2.

/** Deux desserts denses, pour ces cas seulement (valeurs du plan du 2026-09-23). */
const INDEX_DENSE: CompositionIndex = buildCompositionIndex(
  [
    ...BASE_REFS,
    ref("almond", "nuts_seeds", 599.9, 21.2, null),
    ref("date", "other_fruit", 282.9, 2.0, 8),
  ],
  [...ALIASES, { alias: "amandes", slug: "almond" }, { alias: "dattes", slug: "date" }],
);

Deno.test("⟳ 2026-09-23 — grammes: pomme 180 kcal ⇒ UNE pomme (71,4 kcal), jamais deux", () => {
  const g = sideGramsFor({
    kcal: 180,
    kind: "dessert",
    kcalPer100g: 47.6,
    proteinPer100g: 0.3,
    unitGrams: 150,
    group: "other_fruit",
  });
  assertEquals([g.grams, g.unitCount, g.unitCapped, g.clamped], [150, 1, true, true]);
  assertAlmostEquals(g.kcal, 71.4, 1e-9);
  // Le cas qui passe: 80 kcal ⇒ 1 pomme, la limite n'a rien retiré.
  const petit = sideGramsFor({
    kcal: 80,
    kind: "dessert",
    kcalPer100g: 47.6,
    proteinPer100g: 0.3,
    unitGrams: 150,
    group: "other_fruit",
  });
  assertEquals([petit.unitCount, petit.unitCapped], [1, false]);
  // Poire (56,6 kcal/100 g, 150 g) à 180 kcal ⇒ une poire, 84,9 kcal.
  const poire = sideGramsFor({
    kcal: 180,
    kind: "dessert",
    kcalPer100g: 56.6,
    proteinPer100g: 0.36,
    unitGrams: 150,
    group: "other_fruit",
  });
  assertEquals([poire.grams, poire.unitCount, poire.unitCapped], [150, 1, true]);
  assertAlmostEquals(poire.kcal, 84.9, 1e-9);
  // Banane (90,5 kcal/100 g, 120 g) à 180 kcal ⇒ une banane, 108,6 kcal.
  const banane = sideGramsFor({
    kcal: 180,
    kind: "dessert",
    kcalPer100g: 90.5,
    proteinPer100g: 1.1,
    unitGrams: 120,
    group: "other_fruit",
  });
  assertEquals([banane.grams, banane.unitCount, banane.unitCapped], [120, 1, true]);
  assertAlmostEquals(banane.kcal, 108.6, 1e-9);
});

Deno.test("⟳ 2026-09-23 — grammes: la clémentine (80 g) garde deux unités; l'entrée n'est pas touchée", () => {
  // 110 kcal ÷ 37,84 kcal la clémentine = 2,9 ⇒ 3, borné à 2 par la règle d'avant.
  const clem = sideGramsFor({
    kcal: 110,
    kind: "dessert",
    kcalPer100g: 47.3,
    proteinPer100g: 0.8,
    unitGrams: 80,
    group: "citrus",
  });
  assertEquals([clem.grams, clem.unitCount, clem.unitCapped, clem.clamped], [160, 2, false, true]);
  assertAlmostEquals(clem.kcal, 75.68, 1e-9);
  // ⚠️ LE DESSERT SEUL: deux tomates de 100 g en entrée restent deux.
  const tomates = sideGramsFor({
    kcal: 60,
    kind: "starter",
    kcalPer100g: 19.3,
    proteinPer100g: 0.9,
    unitGrams: 100,
    group: "non_starchy_veg",
  });
  assertEquals([tomates.grams, tomates.unitCount, tomates.unitCapped], [200, 2, false]);
});

Deno.test("⟳ 2026-09-23 — grammes: dattes (8 g l'unité) à 180 kcal ⇒ PESÉES, 65 g, jamais « 2 dattes »", () => {
  const dattes = sideGramsFor({
    kcal: 180,
    kind: "dessert",
    kcalPer100g: 282.9,
    proteinPer100g: 2,
    unitGrams: 8,
    group: "other_fruit",
  });
  assertEquals([dattes.grams, dattes.unitCount, dattes.unitCapped], [65, null, false]);
  assertAlmostEquals(dattes.kcal, 183.885, 1e-9);
  // En perte, 80 kcal ⇒ 30 g (le fruit sec est admis: `other_fruit`).
  const perte = sideGramsFor({
    kcal: 80,
    kind: "dessert",
    kcalPer100g: 282.9,
    proteinPer100g: 2,
    unitGrams: 8,
    group: "other_fruit",
  });
  assertEquals([perte.grams, perte.unitCount], [30, null]);
});

Deno.test("⟳ 2026-09-23 — grammes: amandes à 180 kcal ⇒ 30 g; le cheesecake garde sa borne de 80 g", () => {
  const amandes = sideGramsFor({
    kcal: 180,
    kind: "dessert",
    kcalPer100g: 599.9,
    proteinPer100g: 21.2,
    unitGrams: null,
    group: "nuts_seeds",
  });
  assertEquals([amandes.grams, amandes.unitCount, amandes.clamped], [30, null, false]);
  assertAlmostEquals(amandes.kcal, 179.97, 1e-9);
  // ⛔ LE CAS QUI MORD: un laitage dense n'est pas un dessert dense. 80 g de
  // cheesecake = 264 kcal > 250: le registre le refuse `wrong_kind`.
  const cheesecake = sideGramsFor({
    kcal: 180,
    kind: "dessert",
    kcalPer100g: 330,
    proteinPer100g: 5,
    unitGrams: null,
    group: "dairy_yogurt",
  });
  assertEquals([cheesecake.grams, cheesecake.clamped], [80, true]);
  assertAlmostEquals(cheesecake.kcal, 264, 1e-9);
});

Deno.test("⟳ 2026-09-23 — registre: amandes acceptées en prise (30 g), refusées en perte (groupe non admis)", () => {
  const l = ledgerOf({
    index: INDEX_DENSE,
    asks: [
      ask(THOMAS, "mon", 0, "lunch", "muscle_gain", [["dessert", 180]]),
      ask(FAB, "mon", 0, "lunch", "fat_loss", [["dessert", 80]]),
    ],
    raw: [
      raw(THOMAS, "mon", "lunch", "dessert", "amandes"),
      raw(FAB, "mon", "lunch", "dessert", "amandes"),
    ],
  });
  assertEquals(l.counters.valid, 1);
  assertEquals(l.counters.refused_by.wrong_kind, 1);
  assertEquals(l.counters.filled_by_engine, 1);
  assertEquals(
    l.entries.map((e) => `${e.memberId}:${e.ref}:${e.grams}:${e.unitCount}:${e.source}`),
    ["m-thomas:almond:30:null:model", "m-fab:pear:150:1:engine_fallback"],
  );
  assertAlmostEquals(snapDeltaKcal(l, THOMAS, "mon", "lunch"), 0.03, 1e-9);
});

Deno.test("⟳ 2026-09-23 — registre: pomme 180 kcal ⇒ 1 pomme, 108,6 kcal rendues au plat, et c'est compté", () => {
  const l = ledgerOf({
    asks: [ask(THOMAS, "mon", 0, "lunch", "muscle_gain", [["dessert", 180]])],
    raw: [raw(THOMAS, "mon", "lunch", "dessert", "pomme")],
  });
  assertEquals(
    l.entries.map((e) => `${e.ref}:${e.grams}:${e.unitCount}:${e.source}`),
    ["apple:150:1:model"],
  );
  assertAlmostEquals(l.entries[0].kcal, 71.4, 1e-9);
  assertAlmostEquals(snapDeltaKcal(l, THOMAS, "mon", "lunch"), 108.6, 1e-9);
  assertEquals([l.variety.fruit_capped, l.variety.fruit_capped_kcal_withheld], [1, 0]);
  assertAlmostEquals(l.variety.fruit_capped_kcal, 108.6, 1e-9);
  // ⛔ SOUS PLANCHER TCA: le dessert plafonné est compté, ses kcal jamais sommées.
  const tca = ledgerOf({
    asks: [ask(THOMAS, "mon", 0, "lunch", "muscle_gain", [["dessert", 180]])],
    raw: [raw(THOMAS, "mon", "lunch", "dessert", "pomme")],
    kcalWithheldMemberIds: new Set([THOMAS]),
  });
  assertEquals(
    [tca.variety.fruit_capped, tca.variety.fruit_capped_kcal, tca.variety.fruit_capped_kcal_withheld],
    [1, 0, 1],
  );
});

Deno.test("⟳ 2026-09-23 — registre: `variety` porte toutes ses clés, même à zéro", () => {
  assertEquals(ledgerOf({}).variety, {
    family_meals: 0,
    family_shared: 0,
    family_split_allowed: 0,
    streak_over_2: 0,
    distinct_by_kind: { starter: 0, cheese: 0, dessert: 0, bread: 0 },
    fruit_capped: 0,
    fruit_capped_kcal: 0,
    fruit_capped_kcal_withheld: 0,
    // ⟳ 2026-09-23 (v40) — le nom qui décide, et le manque regrossi.
    ref_replaced_by_term: 0,
    deficit_regrown_kcal: 0,
    deficit_to_dish_kcal: 0,
    regrown_entries: 0,
    deficit_kcal_withheld: 0,
    // ⟳ 2026-09-24 — le manque venu de la borne d'assiette.
    boundary_meals: 0,
    boundary_deficit_kcal: 0,
    boundary_regrown_kcal: 0,
    boundary_bread_added: 0,
    boundary_lost_kcal: 0,
    boundary_kcal_withheld: 0,
  });
});

// ── LA TABLE ET LA SEMAINE, SUR UN REGISTRE ÉCRIT À LA MAIN ─────────────────

const CLAIRE = "m-claire";

function tableOf(
  entries: SideCourseServed[],
  over: Partial<Parameters<typeof sideCourseTableCounters>[0]> = {},
) {
  return sideCourseTableCounters({
    entries,
    dayIndexByToken: new Map([["mon", 0], ["tue", 1], ["wed", 2], ["thu", 3], ["fri", 4]]),
    index: INDEX,
    preparations: [],
    judgeBySlot: { lunch: OK_JUDGE, dinner: OK_JUDGE },
    allergens: [],
    ...over,
  });
}

const cheese = (memberId: string, day: string, slot: SideCourseSlot, slug: string) =>
  served(memberId, day, slot, { kind: "cheese", term: slug, ref: slug, grams: 35, unitCount: null });
const yogurt = (memberId: string, day: string, slot: SideCourseSlot) =>
  served(memberId, day, slot, { term: "yaourt nature", ref: "plain_yogurt", grams: 125, unitCount: null });

function milkAllergy(): StudentSafetyConstraint {
  return { ...lactose(), id: "c-milk", kind: "allergy", allergenRef: "milk" };
}

Deno.test("⟳ 2026-09-23 — table: trois jours de pommes de suite pour une personne ⇒ streak_over_2 = 1", () => {
  const trois = tableOf([served(FAB, "mon", "lunch"), served(FAB, "tue", "lunch"), served(FAB, "wed", "lunch")]);
  assertEquals(trois.streak_over_2, 1);
  assertEquals(trois.distinct_by_kind, { starter: 0, cheese: 0, dessert: 1, bread: 0 });
  // Le cas qui passe: deux jours, puis une pause.
  assertEquals(
    tableOf([served(FAB, "mon", "lunch"), served(FAB, "tue", "lunch"), served(FAB, "thu", "lunch")])
      .streak_over_2,
    0,
  );
  // Quatre jours de suite: le troisième ET le quatrième comptent.
  assertEquals(
    tableOf(["mon", "tue", "wed", "thu"].map((d) => served(FAB, d, "lunch"))).streak_over_2,
    2,
  );
  // Midi et soir le même jour: UN jour, pas deux.
  assertEquals(
    tableOf([served(FAB, "mon", "lunch"), served(FAB, "mon", "dinner"), served(FAB, "tue", "lunch")])
      .streak_over_2,
    0,
  );
  // Le même aliment par son TERME (« pomme », sans slug): le résolveur le relie à `apple`.
  assertEquals(
    tableOf([
      served(FAB, "mon", "lunch"),
      served(FAB, "tue", "lunch", { ref: null }),
      served(FAB, "wed", "lunch"),
    ]).streak_over_2,
    1,
  );
  // Deux personnes, deux séries de deux jours: aucune ne dépasse.
  assertEquals(
    tableOf([
      served(FAB, "mon", "lunch"),
      served(FAB, "tue", "lunch"),
      served(CHRIS, "wed", "lunch"),
      served(CHRIS, "thu", "lunch"),
    ]).streak_over_2,
    0,
  );
});

Deno.test("⟳ 2026-09-23 — table: emmental pour Thomas, comté pour Christèle au même repas ⇒ repas NON partagé", () => {
  const split = tableOf([cheese(THOMAS, "mon", "lunch", "emmental"), cheese(CHRIS, "mon", "lunch", "comte")]);
  assertEquals(
    [split.family_meals, split.family_shared, split.family_split_allowed],
    [1, 0, 0],
  );
  assertEquals(split.distinct_by_kind.cheese, 2);
  // Le cas qui passe: le même emmental ⇒ partagé.
  const shared = tableOf([cheese(THOMAS, "mon", "lunch", "emmental"), cheese(CHRIS, "mon", "lunch", "emmental")]);
  assertEquals([shared.family_meals, shared.family_shared, shared.family_split_allowed], [1, 1, 0]);
  // Une seule personne à ce repas, ou deux repas différents: aucune table.
  const apart = tableOf([cheese(THOMAS, "mon", "lunch", "emmental"), cheese(CHRIS, "mon", "dinner", "comte")]);
  assertEquals([apart.family_meals, apart.family_shared], [0, 0]);
});

Deno.test("⟳ 2026-09-23 — table: allergique au lait, Claire reçoit un fruit quand la table a un yaourt ⇒ split permis", () => {
  // ⚠️ Registre écrit à la main pour isoler la règle: le vrai registre juge les
  // allergies sur l'union du foyer, et n'aurait servi ce yaourt à personne.
  const entries = [yogurt(THOMAS, "mon", "dinner"), yogurt(CHRIS, "mon", "dinner"), served(CLAIRE, "mon", "dinner")];
  const avec = tableOf(entries, { allergens: [milkAllergy()] });
  assertEquals([avec.family_meals, avec.family_shared, avec.family_split_allowed], [1, 0, 1]);
  // ⛔ LE CAS QUI MORD: sans l'allergie, rien n'empêchait Claire de manger le yaourt.
  const sans = tableOf(entries);
  assertEquals([sans.family_meals, sans.family_shared, sans.family_split_allowed], [1, 0, 0]);
});

Deno.test("⟳ 2026-09-23 — table: une exclusion de la personne (juge du moment) permet l'écart, elle seule", () => {
  // Fabrice ne mange pas d'emmental: il a le comté, la table l'emmental.
  const judge: SideTermJudge = ({ memberId, ref }) =>
    memberId === FAB && ref === "emmental" ? { ok: false, reason: "excluded" } : { ok: true };
  const entries = [
    cheese(THOMAS, "tue", "lunch", "emmental"),
    cheese(CHRIS, "tue", "lunch", "emmental"),
    cheese(FAB, "tue", "lunch", "comte"),
  ];
  const permis = tableOf(entries, { judgeBySlot: { lunch: judge, dinner: OK_JUDGE } });
  assertEquals([permis.family_meals, permis.family_shared, permis.family_split_allowed], [1, 0, 1]);
  // Le juge du DÎNER ne juge pas le déjeuner: au midi, l'écart n'est plus permis.
  const autreMoment = tableOf(entries, { judgeBySlot: { lunch: OK_JUDGE, dinner: judge } });
  assertEquals(autreMoment.family_split_allowed, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-23 (v40) — LE NOM DÉCIDE, LE MANQUE VA AU PAIN ET AU FROMAGE
// ═══════════════════════════════════════════════════════════════════════════
//
// Cinq vraies générations v39: « banane » écrit avec `ref: "fruit"` pesé 300 g;
// le manque d'un dessert plafonné rendu à un plat déjà à sa borne (Thomas à
// 96–97 % de sa cible). Tous les nombres attendus sont écrits EN DUR.

/**
 * Le référentiel de ces cas: la base, plus trois lignes lues en base le
 * 2026-09-23 (lecture SQL de `food_composition_refs`): `fruit` (« Fruit
 * (average) », sans poids à l'unité), `wholemeal_bread` (262 kcal, 40 g
 * l'unité), et les amandes du plan. Les alias sont ceux de la base
 * (`food_composition_aliases`: « banane », « pain complet »), plus « pain de
 * campagne » pour un pain qui se pèse.
 */
const INDEX_V40: CompositionIndex = buildCompositionIndex(
  [
    ...BASE_REFS,
    ref("fruit", "other_fruit", 59.5, 0.7, null),
    ref("wholemeal_bread", "whole_grain", 262, 8.5, 40),
    ref("almond", "nuts_seeds", 599.9, 21.2, null),
  ],
  [
    ...ALIASES,
    { alias: "banane", slug: "banana" },
    { alias: "pain complet", slug: "wholemeal_bread" },
    { alias: "pain de campagne", slug: "country_style_bread_french" },
    { alias: "amandes", slug: "almond" },
  ],
);

const line = (e: SideCourseServed) => `${e.kind}:${e.ref}:${e.grams}:${e.unitCount}`;
/** Le prévu du moment moins la somme servie, relu sur le registre. */
const plannedMinusServed = (l: ReturnType<typeof ledgerOf>, key: string) =>
  (l.plannedKcalByKey.get(key) ?? 0) -
  (l.byKey.get(key) ?? []).reduce((s, e) => s + e.kcal, 0);
const regrowOf = (l: ReturnType<typeof ledgerOf>) => [
  l.variety.regrown_entries,
  l.variety.deficit_kcal_withheld,
];

// ── ① LE MANQUE ─────────────────────────────────────────────────────────────

Deno.test("⟳ v40 — manque: Thomas (prise), pomme plafonnée + pain complet ⇒ le pain passe de 40 à 75 g, 16,9 kcal au plat", () => {
  // Dessert prévu 180, UNE pomme = 71,4 kcal. Pain complet prévu 104,8 kcal
  // (`wholemeal_bread`, 262 kcal/100 g), PESÉ (⟳ v40): 40 g = 104,8.
  // Manque: 284,8 − 176,2 = 108,6. Le pain grossit jusqu'à 200 kcal au plus:
  // 76,3 g arrondis à 75 g = 196,5 kcal (+91,7). Reste au plat: 16,9.
  const l = ledgerOf({
    index: INDEX_V40,
    asks: [ask(THOMAS, "mon", 0, "lunch", "muscle_gain", [["dessert", 180], ["bread", 104.8]])],
    raw: [
      raw(THOMAS, "mon", "lunch", "dessert", "pomme", { ref: "apple" }),
      raw(THOMAS, "mon", "lunch", "bread", "pain complet", { ref: "wholemeal_bread" }),
    ],
  });
  assertEquals(l.entries.map(line), ["dessert:apple:150:1", "bread:wholemeal_bread:75:null"]);
  assertAlmostEquals(l.entries[1].kcal, 196.5, 1e-9);
  assertAlmostEquals(snapDeltaKcal(l, THOMAS, "mon", "lunch"), 16.9, 1e-9);
  assertEquals(regrowOf(l), [1, 0]);
  assertAlmostEquals(l.variety.deficit_regrown_kcal, 91.7, 1e-9);
  assertAlmostEquals(l.variety.deficit_to_dish_kcal, 16.9, 1e-9);
});

Deno.test("⟳ v40 — manque: Thomas (prise) avec son fromage ⇒ pain 40 → 75 g, puis emmental 35 → 40 g, −2,3 kcal au plat", () => {
  // Emmental prévu 130 kcal: 35 g = 130,55. Manque: 414,8 − 306,75 = 108,05.
  // Pain d'abord (prise): 40 → 75 g = 196,5 kcal, +91,7; reste 16,35. Puis le
  // fromage: visé 130,55 + 16,35 = 146,9 ⇒ 39,4 g arrondis à 40 g = 149,2 kcal,
  // +18,65. L'arrondi dépasse de 2,3: le plat le rend (−2,3).
  const run = (withheld: ReadonlySet<string>) =>
    ledgerOf({
      index: INDEX_V40,
      kcalWithheldMemberIds: withheld,
      asks: [
        ask(THOMAS, "mon", 0, "lunch", "muscle_gain", [
          ["dessert", 180],
          ["bread", 104.8],
          ["cheese", 130],
        ]),
      ],
      raw: [
        raw(THOMAS, "mon", "lunch", "dessert", "pomme", { ref: "apple" }),
        raw(THOMAS, "mon", "lunch", "bread", "pain complet", { ref: "wholemeal_bread" }),
        raw(THOMAS, "mon", "lunch", "cheese", "emmental", { ref: "emmental" }),
      ],
    });
  const l = run(new Set());
  assertEquals(l.entries.map(line), [
    "dessert:apple:150:1",
    "bread:wholemeal_bread:75:null",
    "cheese:emmental:40:null",
  ]);
  assertAlmostEquals(l.entries[2].kcal, 149.2, 1e-9);
  assertAlmostEquals(l.entries[2].proteinG ?? -1, 11.16, 1e-9);
  // ⛔ RIEN N'EST COMPTÉ DEUX FOIS: le plat reçoit le prévu moins le servi
  // APRÈS croissance, et c'est le manque moins ce que le fromage a repris.
  assertAlmostEquals(snapDeltaKcal(l, THOMAS, "mon", "lunch"), -2.3, 1e-9);
  assertAlmostEquals(plannedMinusServed(l, "m-thomas|mon|lunch"), -2.3, 1e-9);
  assertAlmostEquals(108.05 - l.variety.deficit_regrown_kcal, -2.3, 1e-9);
  assertEquals(regrowOf(l), [2, 0]);
  assertAlmostEquals(l.variety.deficit_regrown_kcal, 110.35, 1e-9);
  // Le compteur ne rend au plat que du POSITIF: un dépassement d'arrondi n'est pas un manque.
  assertAlmostEquals(l.variety.deficit_to_dish_kcal, 0, 1e-9);
  // ⛔ SOUS PLANCHER TCA: le fromage grossit pareil, ses kcal ne sont pas sommées.
  const tca = run(new Set([THOMAS]));
  assertEquals(tca.entries.map(line), l.entries.map(line));
  assertEquals(regrowOf(tca), [2, 1]);
  assertEquals([tca.variety.deficit_regrown_kcal, tca.variety.deficit_to_dish_kcal], [0, 0]);
});

/** Dessert 180 + pain de campagne 160 (253 kcal/100 g, pesé): le pain peut grossir. */
function countryBreadMeal(memberId: string, goal: SideCourseGoal) {
  return ledgerOf({
    index: INDEX_V40,
    asks: [ask(memberId, "mon", 0, "lunch", goal, [["dessert", 180], ["bread", 160]])],
    raw: [
      raw(memberId, "mon", "lunch", "dessert", "pomme", { ref: "apple" }),
      raw(memberId, "mon", "lunch", "bread", "pain de campagne", {
        ref: "country_style_bread_french",
      }),
    ],
  });
}

Deno.test("⟳ v40 — manque: Thomas (prise), pain pesé ⇒ 65 g → 75 g (189,75 kcal), 78,85 kcal au plat", () => {
  // Pain 160 kcal: 65 g = 164,45. Manque: 340 − 235,85 = 104,15. Visé
  // min(200, 268,6) = 200 ⇒ 79,05 g, borné à 75 g (80 g = 202,4 > 200).
  // +25,3 kcal; reste au plat 78,85.
  const l = countryBreadMeal(THOMAS, "muscle_gain");
  assertEquals(l.entries.map(line), ["dessert:apple:150:1", "bread:country_style_bread_french:75:null"]);
  assertAlmostEquals(l.entries[1].kcal, 189.75, 1e-9);
  assertAlmostEquals(snapDeltaKcal(l, THOMAS, "mon", "lunch"), 78.85, 1e-9);
  assertAlmostEquals(plannedMinusServed(l, "m-thomas|mon|lunch"), 78.85, 1e-9);
  assertEquals(regrowOf(l), [1, 0]);
  assertAlmostEquals(l.variety.deficit_regrown_kcal, 25.3, 1e-9);
  assertAlmostEquals(l.variety.deficit_to_dish_kcal, 78.85, 1e-9);
});

Deno.test("⟳ v40 — manque: Fabrice (perte), le même repas ⇒ rien ne grossit, 104,15 kcal au plat; le mineur pareil", () => {
  for (const goal of ["fat_loss", "minor"] as const) {
    const l = countryBreadMeal(FAB, goal);
    assertEquals(
      l.entries.map(line),
      ["dessert:apple:150:1", "bread:country_style_bread_french:65:null"],
      goal,
    );
    assertAlmostEquals(l.entries[1].kcal, 164.45, 1e-9);
    assertAlmostEquals(snapDeltaKcal(l, FAB, "mon", "lunch"), 104.15, 1e-9);
    assertEquals(regrowOf(l), [0, 0]);
    assertAlmostEquals(l.variety.deficit_regrown_kcal, 0, 1e-9);
    assertAlmostEquals(l.variety.deficit_to_dish_kcal, 104.15, 1e-9);
  }
});

Deno.test("⟳ v40 — manque: l'ordre de l'objectif — maintien le fromage d'abord, prise le pain d'abord", () => {
  // Dessert 110 (1 pomme, 71,4), emmental 110 (30 g, 111,9), pain de campagne
  // 100 (40 g, 101,2). Manque: 320 − 284,5 = 35,5.
  const meal = (memberId: string, goal: SideCourseGoal) =>
    ledgerOf({
      index: INDEX_V40,
      asks: [
        ask(memberId, "mon", 0, "lunch", goal, [["dessert", 110], ["cheese", 110], ["bread", 100]]),
      ],
      raw: [
        raw(memberId, "mon", "lunch", "dessert", "pomme", { ref: "apple" }),
        raw(memberId, "mon", "lunch", "cheese", "emmental", { ref: "emmental" }),
        raw(memberId, "mon", "lunch", "bread", "pain de campagne", {
          ref: "country_style_bread_french",
        }),
      ],
    });
  // Maintien: le fromage visé 147,4 ⇒ 40 g, 149,2 (+37,3); le manque est
  // couvert, le pain ne bouge pas. L'arrondi dépasse de 1,8: le plat le rend.
  const chris = meal(CHRIS, "maintenance");
  assertEquals(chris.entries.map(line), [
    "dessert:apple:150:1",
    "cheese:emmental:40:null",
    "bread:country_style_bread_french:40:null",
  ]);
  assertAlmostEquals(snapDeltaKcal(chris, CHRIS, "mon", "lunch"), -1.8, 1e-9);
  assertEquals(regrowOf(chris), [1, 0]);
  assertAlmostEquals(chris.variety.deficit_regrown_kcal, 37.3, 1e-9);
  assertAlmostEquals(chris.variety.deficit_to_dish_kcal, 0, 1e-9);
  // Prise: le pain visé 136,7 ⇒ 55 g, 139,15 (+37,95); le fromage reste à 30 g.
  const thomas = meal(THOMAS, "muscle_gain");
  assertEquals(thomas.entries.map(line), [
    "dessert:apple:150:1",
    "cheese:emmental:30:null",
    "bread:country_style_bread_french:55:null",
  ]);
  assertAlmostEquals(snapDeltaKcal(thomas, THOMAS, "mon", "lunch"), -2.45, 1e-9);
  assertAlmostEquals(thomas.variety.deficit_regrown_kcal, 37.95, 1e-9);
});

Deno.test("⟳ v40 — manque: un pain refusé n'est JAMAIS recréé, un fromage non demandé jamais ajouté", () => {
  // Le juge refuse tout pain: celui du modèle ET chaque secours ⇒ `dropped`.
  const noBread: SideTermJudge = ({ ref }) => {
    const g = INDEX_V40.bySlug.get(ref ?? "")?.foodGroupRef;
    return g === "refined_grain" || g === "whole_grain"
      ? { ok: false, reason: "excluded" }
      : { ok: true };
  };
  const l = ledgerOf({
    index: INDEX_V40,
    judgeBySlot: { lunch: noBread, dinner: noBread },
    asks: [ask(THOMAS, "mon", 0, "lunch", "muscle_gain", [["dessert", 180], ["bread", 160]])],
    raw: [
      raw(THOMAS, "mon", "lunch", "dessert", "pomme", { ref: "apple" }),
      raw(THOMAS, "mon", "lunch", "bread", "pain de campagne", {
        ref: "country_style_bread_french",
      }),
    ],
  });
  assertEquals([l.counters.refused_by.excluded, l.counters.dropped], [1, 1]);
  assertEquals(l.entries.map(line), ["dessert:apple:150:1"]);
  // 340 prévues, 71,4 servies: le pain perdu ET le dessert plafonné vont au plat.
  assertAlmostEquals(snapDeltaKcal(l, THOMAS, "mon", "lunch"), 268.6, 1e-9);
  assertEquals(regrowOf(l), [0, 0]);
  assertAlmostEquals(l.variety.deficit_to_dish_kcal, 268.6, 1e-9);
});

// ── ② LE NOM DÉCIDE ─────────────────────────────────────────────────────────

Deno.test("⟳ v40 — nom: « banane » + ref « fruit » ⇒ banana, 1 × 120 g; avant: 300 g de « fruit »", () => {
  const l = ledgerOf({
    index: INDEX_V40,
    asks: [ask(THOMAS, "mon", 0, "lunch", "muscle_gain", [["dessert", 180]])],
    raw: [raw(THOMAS, "mon", "lunch", "dessert", "banane", { ref: "fruit" })],
  });
  assertEquals(l.entries.map((e) => `${line(e)}:${e.term}:${e.source}`), [
    "dessert:banana:120:1:banane:model",
  ]);
  assertAlmostEquals(l.entries[0].kcal, 108.6, 1e-9);
  assertEquals([l.counters.valid, l.variety.ref_replaced_by_term, l.variety.fruit_capped], [1, 1, 1]);
  assertAlmostEquals(snapDeltaKcal(l, THOMAS, "mon", "lunch"), 71.4, 1e-9);
  // ⛔ CE QUE L'IDENTIFIANT SERVAIT: « fruit » sans poids à l'unité, 180 kcal à
  // 59,5 kcal/100 g ⇒ 305 g, bornés à 300 g — sous le mot « banane ».
  const avant = sideGramsFor({
    kcal: 180,
    kind: "dessert",
    kcalPer100g: 59.5,
    proteinPer100g: 0.7,
    unitGrams: null,
    group: "other_fruit",
  });
  assertEquals([avant.grams, avant.unitCount], [300, null]);
});

Deno.test("⟳ v40 — nom: « pomme » + ref « apple » inchangé; un terme qui ne se résout pas laisse la main au ref", () => {
  const same = ledgerOf({
    index: INDEX_V40,
    asks: [ask(CHRIS, "mon", 0, "lunch", "maintenance", [["dessert", 110]])],
    raw: [raw(CHRIS, "mon", "lunch", "dessert", "pomme", { ref: "apple" })],
  });
  assertEquals(same.entries.map(line), ["dessert:apple:150:1"]);
  assertEquals(same.variety.ref_replaced_by_term, 0);
  // « gâteau du chef » ne se résout pas: l'identifiant `apple` est servi.
  const unknown = ledgerOf({
    index: INDEX_V40,
    asks: [ask(CHRIS, "mon", 0, "lunch", "maintenance", [["dessert", 110]])],
    raw: [raw(CHRIS, "mon", "lunch", "dessert", "gâteau du chef", { ref: "apple" })],
  });
  assertEquals(unknown.entries.map((e) => `${line(e)}:${e.term}`), [
    "dessert:apple:150:1:gâteau du chef",
  ]);
  assertEquals(unknown.variety.ref_replaced_by_term, 0);
});

Deno.test("⟳ v40 — nom: le terme ne gagne que dans un groupe admis — « amandes » en perte garde la pomme, en prise sert les amandes", () => {
  const run = (memberId: string, goal: SideCourseGoal, kcal: number) =>
    ledgerOf({
      index: INDEX_V40,
      asks: [ask(memberId, "mon", 0, "lunch", goal, [["dessert", kcal]])],
      raw: [raw(memberId, "mon", "lunch", "dessert", "amandes", { ref: "apple" })],
    });
  const perte = run(FAB, "fat_loss", 80);
  assertEquals(perte.entries.map(line), ["dessert:apple:150:1"]);
  assertEquals(perte.variety.ref_replaced_by_term, 0);
  const prise = run(THOMAS, "muscle_gain", 180);
  assertEquals(prise.entries.map(line), ["dessert:almond:30:null"]);
  assertEquals(prise.variety.ref_replaced_by_term, 1);
});

Deno.test("⟳ v40 — nom: le slug du terme passe les portes — une banane exclue est refusée, le secours la remplace", () => {
  const noBanana: SideTermJudge = ({ ref }) =>
    ref === "banana" ? { ok: false, reason: "excluded" } : { ok: true };
  const l = ledgerOf({
    index: INDEX_V40,
    judgeBySlot: { lunch: noBanana, dinner: noBanana },
    asks: [ask(THOMAS, "mon", 0, "lunch", "muscle_gain", [["dessert", 180]])],
    raw: [raw(THOMAS, "mon", "lunch", "dessert", "banane", { ref: "fruit" })],
  });
  assertEquals([l.counters.refused_by.excluded, l.variety.ref_replaced_by_term], [1, 1]);
  // Rang 0 de la prise = la banane, exclue ⇒ le fromage blanc: 180 kcal ⇒ 235 g.
  assertEquals(l.entries.map((e) => `${line(e)}:${e.source}`), [
    "dessert:fromage_blanc:235:null:engine_fallback",
  ]);
});

// ── ④ LE PAIN HORS DE LA RÈGLE DES DEUX JOURS ───────────────────────────────

Deno.test("⟳ v40 — table: trois jours du même pain ⇒ streak_over_2 = 0; trois jours de pommes ⇒ 1", () => {
  const pain = (day: string) =>
    served(FAB, day, "lunch", {
      kind: "bread",
      term: "pain de seigle",
      ref: "rye_bread",
      grams: 40,
      unitCount: 1,
    });
  const trois = tableOf([pain("mon"), pain("tue"), pain("wed")]);
  assertEquals(trois.streak_over_2, 0);
  // Il reste compté parmi les aliments distincts.
  assertEquals(trois.distinct_by_kind.bread, 1);
  // Le cas qui mord, sur le même registre: le dessert, lui, compte.
  assertEquals(
    tableOf([pain("mon"), pain("tue"), pain("wed"), ...["mon", "tue", "wed"].map((d) => served(FAB, d, "lunch"))])
      .streak_over_2,
    1,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-24 — LE MANQUE VENU DE LA BORNE D'ASSIETTE (`extraDeficitByKey`)
// ═══════════════════════════════════════════════════════════════════════════
//
// Le plat raboté à son plafond (`fitPortionsToBounds`) ou coupé au
// dimensionnement (`clampToBounds`, personne seule) perdait son énergie. Le
// registre la rend: le pain puis le fromage DÉJÀ servis grossissent
// (`SIDE_COURSE_REGROW_ORDER`, sous la part maximale du repas), un pain est
// AJOUTÉ s'il n'y en a pas (maintien et prise, jamais contre un refus), et le
// reste est compté perdu. Tous les nombres attendus sont écrits EN DUR.
//
// Référentiel de ces cas (`BASE_REFS`): comté 413 kcal/100 g, baguette 287,
// pain complet (`bread_wholemeal_integral_bread`) 244, pomme 47,6 (150 g).

/** Un repas avec son manque de borne et l'énergie du repas entier. */
function boundaryMeal(
  memberId: string,
  extra: number,
  meal: number,
  over: Partial<Parameters<typeof buildSideCourseLedger>[0]>,
) {
  const key = sideCourseKey(memberId, "mon", "lunch");
  return ledgerOf({
    extraDeficitByKey: new Map([[key, extra]]),
    mealKcalByKey: new Map([[key, meal]]),
    ...over,
  });
}
const boundaryOf = (l: ReturnType<typeof ledgerOf>) => [
  l.variety.boundary_meals,
  l.variety.boundary_bread_added,
  l.variety.boundary_kcal_withheld,
];

Deno.test("⟳ 2026-09-24 — borne: maintien avec son fromage ⇒ le comté passe de 25 à 35 g (+41,3 kcal), rien de perdu", () => {
  // Comté prévu 103,25 = 25 g exactement. Manque de borne 40; part maximale
  // 0,35 × 768 = 268,8. Visé 143,25 ⇒ 34,7 g arrondis à 35 g = 144,55 kcal.
  const l = boundaryMeal(CHRIS, 40, 768, {
    asks: [ask(CHRIS, "mon", 0, "lunch", "maintenance", [["cheese", 103.25]])],
    raw: [raw(CHRIS, "mon", "lunch", "cheese", "comté", { ref: "comte" })],
  });
  assertEquals(l.entries.map(line), ["cheese:comte:35:null"]);
  assertAlmostEquals(l.entries[0].kcal, 144.55, 1e-9);
  assertEquals(boundaryOf(l), [1, 0, 0]);
  assertAlmostEquals(l.variety.boundary_deficit_kcal, 40, 1e-9);
  assertAlmostEquals(l.variety.boundary_regrown_kcal, 41.3, 1e-9);
  assertAlmostEquals(l.variety.boundary_lost_kcal, 0, 1e-9);
  // Le plat rend ce que le fromage a repris: prévu − servi = −41,3.
  assertAlmostEquals(snapDeltaKcal(l, CHRIS, "mon", "lunch"), -41.3, 1e-9);
  // LE CAS QUI PASSE À CÔTÉ: sans manque de borne, le comté reste à 25 g.
  const sans = ledgerOf({
    asks: [ask(CHRIS, "mon", 0, "lunch", "maintenance", [["cheese", 103.25]])],
    raw: [raw(CHRIS, "mon", "lunch", "cheese", "comté", { ref: "comte" })],
  });
  assertEquals(sans.entries.map(line), ["cheese:comte:25:null"]);
  assertEquals(boundaryOf(sans), [0, 0, 0]);
});

Deno.test("⟳ 2026-09-24 — borne: prise avec son pain ⇒ la baguette passe de 40 à 60 g (+57,4), 2,6 kcal perdus à l'arrondi", () => {
  // Baguette prévue 114,8 = 40 g. Manque 60 ⇒ visé 174,8 ⇒ 60,9 g arrondis à
  // 60 g = 172,2 kcal. Pas de fromage servi: 60 − 57,4 = 2,6 perdus.
  const l = boundaryMeal(THOMAS, 60, 1128.667, {
    asks: [ask(THOMAS, "mon", 0, "lunch", "muscle_gain", [["dessert", 71.4], ["bread", 114.8]])],
    raw: [
      raw(THOMAS, "mon", "lunch", "dessert", "pomme", { ref: "apple" }),
      raw(THOMAS, "mon", "lunch", "bread", "baguette", { ref: "bread_french_bread_baguette" }),
    ],
  });
  assertEquals(l.entries.map(line), ["dessert:apple:150:1", "bread:bread_french_bread_baguette:60:null"]);
  assertAlmostEquals(l.entries[1].kcal, 172.2, 1e-9);
  assertEquals(boundaryOf(l), [1, 0, 0]);
  assertAlmostEquals(l.variety.boundary_regrown_kcal, 57.4, 1e-9);
  assertAlmostEquals(l.variety.boundary_lost_kcal, 2.6, 1e-9);
});

Deno.test("⟳ 2026-09-24 — borne: maintien avec un fruit seul, pain permis ⇒ un PAIN AJOUTÉ (liste de secours), 45 g", () => {
  // Rien à faire grossir (ni pain ni fromage servi). Pain visé
  // min(106 ; 268,8 − 71,4 ; 200) = 106 ⇒ pain complet 43,4 g ⇒ 45 g = 109,8.
  const l = boundaryMeal(CHRIS, 106, 768, {
    asks: [ask(CHRIS, "mon", 0, "lunch", "maintenance", [["dessert", 71.4]])],
    raw: [raw(CHRIS, "mon", "lunch", "dessert", "pomme", { ref: "apple" })],
  });
  assertEquals(l.entries.map(line), [
    "dessert:apple:150:1",
    "bread:bread_wholemeal_integral_bread:45:null",
  ]);
  const pain = l.entries[1];
  assertEquals([pain.term, pain.source, pain.plannedKcal], ["pain complet", "engine_fallback", 0]);
  assertAlmostEquals(pain.kcal, 109.8, 1e-9);
  assertEquals(boundaryOf(l), [1, 1, 0]);
  assertAlmostEquals(l.variety.boundary_regrown_kcal, 109.8, 1e-9);
  assertAlmostEquals(l.variety.boundary_lost_kcal, 0, 1e-9);
  // ⛔ UN PAIN AJOUTÉ N'ÉTAIT PAS DEMANDÉ: les compteurs du modèle n'ont pas bougé.
  assertEquals(
    [l.counters.asked, l.counters.valid, l.counters.filled_by_engine, l.counters.dropped],
    [1, 1, 0, 0],
  );
  // Le plat rend le pain: prévu 71,4 − servi 181,2.
  assertAlmostEquals(snapDeltaKcal(l, CHRIS, "mon", "lunch"), -109.8, 1e-9);
  // Et il part aux courses avec le reste.
  assertEquals(sideShoppingLines(l)[0].ingredients.map((i) => `${i.ref}:${i.amount}${i.unit}`), [
    "apple:1unit",
    "bread_wholemeal_integral_bread:45g",
  ]);
});

Deno.test("⟳ 2026-09-24 — borne: le pain ajouté est celui de la TABLE (la baguette de Thomas), pas le secours", () => {
  // Christèle n'a qu'un fruit; Thomas a une baguette au même repas. Pain visé
  // 106 ⇒ baguette 36,9 g ⇒ 35 g = 100,45 kcal; 5,55 perdus.
  const l = ledgerOf({
    asks: [
      ask(THOMAS, "mon", 0, "lunch", "muscle_gain", [["dessert", 71.4], ["bread", 114.8]]),
      ask(CHRIS, "mon", 0, "lunch", "maintenance", [["dessert", 71.4]]),
    ],
    raw: [
      raw(THOMAS, "mon", "lunch", "dessert", "pomme", { ref: "apple" }),
      raw(THOMAS, "mon", "lunch", "bread", "baguette", { ref: "bread_french_bread_baguette" }),
      raw(CHRIS, "mon", "lunch", "dessert", "pomme", { ref: "apple" }),
    ],
    extraDeficitByKey: new Map([[sideCourseKey(CHRIS, "mon", "lunch"), 106]]),
    mealKcalByKey: new Map([[sideCourseKey(CHRIS, "mon", "lunch"), 768]]),
  });
  const pain = l.entries.find((e) => e.memberId === CHRIS && e.kind === "bread");
  assert(pain !== undefined);
  assertEquals([line(pain), pain.term], ["bread:bread_french_bread_baguette:35:null", "baguette"]);
  assertAlmostEquals(pain.kcal, 100.45, 1e-9);
  assertAlmostEquals(l.variety.boundary_lost_kcal, 5.55, 1e-9);
  // Le pain de Thomas n'a pas bougé: il n'avait aucun manque.
  assertEquals(line(l.entries.find((e) => e.memberId === THOMAS && e.kind === "bread")!), "bread:bread_french_bread_baguette:40:null");
});

Deno.test("⟳ 2026-09-24 — borne: pain REFUSÉ (réglage, impossible, moment léger) ⇒ rien n'est ajouté, 106 perdus", () => {
  const l = boundaryMeal(CHRIS, 106, 768, {
    asks: [ask(CHRIS, "mon", 0, "lunch", "maintenance", [["dessert", 71.4]])],
    raw: [raw(CHRIS, "mon", "lunch", "dessert", "pomme", { ref: "apple" })],
    breadAllowed: (memberId, slot) => !(memberId === CHRIS && slot === "lunch"),
  });
  assertEquals(l.entries.map(line), ["dessert:apple:150:1"]);
  assertEquals(boundaryOf(l), [1, 0, 0]);
  assertAlmostEquals(l.variety.boundary_regrown_kcal, 0, 1e-9);
  assertAlmostEquals(l.variety.boundary_lost_kcal, 106, 1e-9);
});

Deno.test("⟳ 2026-09-24 — borne: perte de poids et mineur ⇒ rien ne grossit, rien n'est ajouté, tout est perdu", () => {
  for (const goal of ["fat_loss", "minor"] as const) {
    const l = boundaryMeal(FAB, 80, 700, {
      asks: [ask(FAB, "mon", 0, "lunch", goal, [["dessert", 71.4]])],
      raw: [raw(FAB, "mon", "lunch", "dessert", "pomme", { ref: "apple" })],
    });
    assertEquals(l.entries.map(line), ["dessert:apple:150:1"], goal);
    assertEquals(boundaryOf(l), [1, 0, 0], goal);
    assertAlmostEquals(l.variety.boundary_lost_kcal, 80, 1e-9);
  }
});

Deno.test("⟳ 2026-09-24 — borne: la part maximale du repas arrête la croissance (repas de 400 kcal), pas celui de 768", () => {
  // Comté 25 g (103,25), manque 100.
  //   repas 400: part max max(103,25 ; 140) = 140 ⇒ le comté vise 140 ⇒ 35 g
  //     (144,55, l'arrondi dépasse de 4,55); plus de place ⇒ pas de pain;
  //     perdu 100 − 41,3 = 58,7.
  //   repas 768: part max 268,8 ⇒ comté 35 g (plafond du fromage 160 atteint à
  //     l'arrondi), reste 58,7 ≥ 50 ⇒ pain complet 24,1 g ⇒ 25 g = 61 kcal.
  const repas = (meal: number) =>
    boundaryMeal(CHRIS, 100, meal, {
      asks: [ask(CHRIS, "mon", 0, "lunch", "maintenance", [["cheese", 103.25]])],
      raw: [raw(CHRIS, "mon", "lunch", "cheese", "comté", { ref: "comte" })],
    });
  const petit = repas(400);
  assertEquals(petit.entries.map(line), ["cheese:comte:35:null"]);
  assertAlmostEquals(petit.variety.boundary_lost_kcal, 58.7, 1e-9);
  assertEquals(boundaryOf(petit), [1, 0, 0]);
  const grand = repas(768);
  assertEquals(grand.entries.map(line), [
    "cheese:comte:35:null",
    "bread:bread_wholemeal_integral_bread:25:null",
  ]);
  assertAlmostEquals(grand.variety.boundary_regrown_kcal, 102.3, 1e-9);
  assertAlmostEquals(grand.variety.boundary_lost_kcal, 0, 1e-9);
  assertEquals(boundaryOf(grand), [1, 1, 0]);
});

Deno.test("⟳ 2026-09-24 — borne: sous plancher TCA, le pain est ajouté pareil, ses kcal ne sont PAS sommées", () => {
  const l = boundaryMeal(CHRIS, 106, 768, {
    asks: [ask(CHRIS, "mon", 0, "lunch", "maintenance", [["dessert", 71.4]])],
    raw: [raw(CHRIS, "mon", "lunch", "dessert", "pomme", { ref: "apple" })],
    kcalWithheldMemberIds: new Set([CHRIS]),
  });
  assertEquals(l.entries.map(line), [
    "dessert:apple:150:1",
    "bread:bread_wholemeal_integral_bread:45:null",
  ]);
  assertEquals(boundaryOf(l), [1, 1, 1]);
  assertEquals(
    [l.variety.boundary_deficit_kcal, l.variety.boundary_regrown_kcal, l.variety.boundary_lost_kcal],
    [0, 0, 0],
  );
});

Deno.test("⟳ 2026-09-24 — borne: un manque sans demande d'à-côté (petit-déjeuner) est perdu, et compté", () => {
  const l = ledgerOf({
    asks: [ask(CHRIS, "mon", 0, "lunch", "maintenance", [["dessert", 71.4]])],
    raw: [raw(CHRIS, "mon", "lunch", "dessert", "pomme", { ref: "apple" })],
    extraDeficitByKey: new Map([[sideCourseKey(CHRIS, "mon", "breakfast"), 50]]),
    mealKcalByKey: new Map([[sideCourseKey(CHRIS, "mon", "lunch"), 768]]),
  });
  assertEquals(l.entries.map(line), ["dessert:apple:150:1"]);
  assertEquals(boundaryOf(l), [1, 0, 0]);
  assertAlmostEquals(l.variety.boundary_deficit_kcal, 50, 1e-9);
  assertAlmostEquals(l.variety.boundary_lost_kcal, 50, 1e-9);
});

Deno.test("⟳ 2026-09-24 — borne: sous 50 kcal, pas de pain ajouté (un bout de croûte), le manque est perdu", () => {
  // `SIDE_COURSE_MIN_ADDED_KCAL`, la règle de `sideBudgetFor`: 40 < 50.
  const l = boundaryMeal(CHRIS, 40, 768, {
    asks: [ask(CHRIS, "mon", 0, "lunch", "maintenance", [["dessert", 71.4]])],
    raw: [raw(CHRIS, "mon", "lunch", "dessert", "pomme", { ref: "apple" })],
  });
  assertEquals(l.entries.map(line), ["dessert:apple:150:1"]);
  assertEquals(boundaryOf(l), [1, 0, 0]);
  assertAlmostEquals(l.variety.boundary_lost_kcal, 40, 1e-9);
});
