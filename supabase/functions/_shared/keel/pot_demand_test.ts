// LOT 3 — CE QUE LA CASSEROLE A REFUSÉ. Ce que ces tests protègent:
//
//   * LES DEUX PLAFONDS CONFONDUS — « le facteur a été raboté » et « la
//     casserole ne suivait pas » se réparent à deux endroits opposés (une borne
//     de plausibilité, une liste de courses). Un compteur qui les fondrait
//     enverrait au mauvais;
//   * LA SOMME QUI S'ANNULE — un manque et un dépassement dans le même total
//     rendent une table qui paraît parfaite alors que la moitié a faim;
//   * `raw` AU LIEU DE `factor` dans le levier amont — utiliser le facteur déjà
//     raboté rendrait toujours 1, et le module ne dirait plus rien.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  type AnchorFactor,
  type AnchorMouth,
  mealMassCapGrams,
  mouthTargetKcal,
  slotPlanTargets,
} from "./mouth_anchor.ts";
import type { MouthDayEnergy } from "./mouth_energy.ts";
import {
  neededPotFactor,
  POT_REASONS,
  potFactorFor,
  UNMET_CAUSES,
  unmetDemand,
} from "./pot_demand.ts";

const KEY = "m_iku thu";

function anchor(over: Partial<AnchorFactor> = {}): AnchorFactor {
  return {
    factor: 1.2,
    raw: 1.2,
    reason: "anchored",
    targetKcal: 2400,
    deliveredKcal: 2000,
    capGrams: null,
    structureState: "not_asked",
    extrasFloored: false,
    ...over,
  };
}

function day(over: Partial<MouthDayEnergy> = {}): MouthDayEnergy {
  return {
    memberId: "m_iku",
    day: "thu",
    kcal: 2000,
    basis: "plan_quantities",
    complete: true,
    dishesCounted: 3,
    dishesTotal: 3,
    unattributedDishes: 0,
    subject: "the_day",
    gaps: [],
    ...over,
  } as MouthDayEnergy;
}

// ---------------------------------------------------------------------------
// ① LA DEMANDE NON SATISFAITE
// ---------------------------------------------------------------------------

Deno.test("quand la casserole suit et que rien n'est raboté, rien n'est refusé", () => {
  const got = unmetDemand(new Map([[KEY, anchor()]]), [day()], new Map());
  assertEquals(got[0].cause, "none");
  assertEquals(got[0].servedKcal, 2400);
  assertEquals(got[0].unmetKcal, 0);
});

Deno.test("le rabot de FACTEUR et le plafond de CASSEROLE sont distingués", () => {
  // Les deux se réparent à deux endroits opposés: une borne de plausibilité
  // d'un côté, une liste de courses de l'autre.
  const clamped = unmetDemand(
    new Map([[KEY, anchor({ factor: 1.6, raw: 2.4 })]]),
    [day()],
    new Map(),
  );
  assertEquals(clamped[0].cause, "factor_clamped");

  const pot = unmetDemand(new Map([[KEY, anchor()]]), [day()], new Map([[KEY, 0.8]]));
  assertEquals(pot[0].cause, "pot_ceiling");

  const both = unmetDemand(
    new Map([[KEY, anchor({ factor: 1.6, raw: 2.4 })]]),
    [day()],
    new Map([[KEY, 0.8]]),
  );
  // ⛔ LE CAS QUI DIT QUE L'AVAL SEUL NE SUFFIRA JAMAIS.
  assertEquals(both[0].cause, "both");
});

Deno.test("le manque est CHIFFRÉ, et il tient compte du rabot de casserole", () => {
  // 2000 livrés x 1,2 de facteur x 0,5 de rabot = 1200 servis pour 2400 voulus.
  const got = unmetDemand(new Map([[KEY, anchor()]]), [day()], new Map([[KEY, 0.5]]));
  assertEquals(got[0].wantedKcal, 2400);
  assertEquals(got[0].servedKcal, 1200);
  assertEquals(got[0].unmetKcal, 1200);
});

Deno.test("un DÉPASSEMENT n'est pas un manque négatif — il ne s'annule avec rien", () => {
  // Une table où une bouche manque de 500 et l'autre déborde de 500 paraîtrait
  // parfaite si le manque était signé. `unmetKcal` reste >= 0, et le
  // dépassement se lit sur `servedKcal` face à `wantedKcal`.
  const got = unmetDemand(
    new Map([[KEY, anchor({ factor: 2, raw: 2, targetKcal: 2000 })]]),
    [day()],
    new Map(),
  );
  assertEquals(got[0].unmetKcal, 0);
  assert(got[0].servedKcal! > got[0].wantedKcal!);
});

Deno.test("une bouche non ancrée est NOMMÉE, jamais comptée comme satisfaite", () => {
  const got = unmetDemand(
    new Map([[KEY, anchor({ raw: null, reason: "day_incomplete", targetKcal: 2400 })]]),
    [day()],
    new Map(),
  );
  assertEquals(got[0].cause, "not_anchored");
  assertEquals(got[0].unmetKcal, null);
  // On dit quand même ce qu'on savait: la cible existait.
  assertEquals(got[0].wantedKcal, 2400);
});

Deno.test("tout motif rendu appartient au vocabulaire fermé", () => {
  const rows = [
    ...unmetDemand(new Map([[KEY, anchor()]]), [day()], new Map()),
    ...unmetDemand(new Map(), [day()], new Map()),
    ...unmetDemand(new Map([[KEY, anchor({ factor: 1.6, raw: 2.4 })]]), [day()], new Map([[KEY, 0.8]])),
  ];
  for (const r of rows) assert(UNMET_CAUSES.includes(r.cause), r.cause);
});

// ---------------------------------------------------------------------------
// ② LE LEVIER AMONT — calculé, jamais appliqué
// ---------------------------------------------------------------------------

Deno.test("une casserole qui suffit rend un facteur de 1", () => {
  const got = neededPotFactor(
    [{ shares: [{ key: KEY, grams: 400 }], uses: [{ preparationId: "p", servings: 1 }] }],
    new Map([[KEY, anchor({ factor: 1, raw: 1 })]]),
  );
  assertEquals(got.get("p"), 1);
});

Deno.test("le levier lit `raw`, PAS `factor` — sinon il rendrait toujours 1", () => {
  // ⛔ LE DÉFAUT QUE CE TEST GARDE. La question posée est « de combien la
  // casserole devrait grossir pour que le rabot ne soit plus nécessaire ».
  // Lire le facteur DÉJÀ raboté répondrait « elle suffit », toujours.
  const got = neededPotFactor(
    [{ shares: [{ key: KEY, grams: 400 }], uses: [{ preparationId: "p", servings: 1 }] }],
    new Map([[KEY, anchor({ factor: 1.6, raw: 2.4 })]]),
  );
  assertEquals(got.get("p"), 2.4);
});

Deno.test("un repas qui tire de DEUX casseroles répartit sa demande au prorata", () => {
  const got = neededPotFactor(
    [{
      shares: [{ key: KEY, grams: 300 }],
      uses: [
        { preparationId: "a", servings: 3 },
        { preparationId: "b", servings: 1 },
      ],
    }],
    new Map([[KEY, anchor({ factor: 1.5, raw: 1.5 })]]),
  );
  // Le facteur est le même des deux côtés — c'est le RAPPORT qui compte, et il
  // ne dépend pas du partage. Ce que le prorata garantit, c'est qu'aucune des
  // deux ne reçoive la demande entière.
  assertEquals(got.get("a"), 1.5);
  assertEquals(got.get("b"), 1.5);
});

Deno.test("deux bouches aux facteurs opposés sur la même casserole se compensent", () => {
  // 200 g a 1,5 et 200 g a 0,5 => 400 g voulus pour 400 g tirés: la casserole
  // suffit, même si les DEUX parts changent. C'est le cas que le chantier a
  // mesuré (612/344 pour 900 g) et il ne doit pas commander de courses.
  const got = neededPotFactor(
    [{
      shares: [{ key: "a thu", grams: 200 }, { key: "b thu", grams: 200 }],
      uses: [{ preparationId: "p", servings: 1 }],
    }],
    new Map([
      ["a thu", anchor({ factor: 1.5, raw: 1.5 })],
      ["b thu", anchor({ factor: 0.5, raw: 0.5 })],
    ]),
  );
  assertEquals(got.get("p"), 1);
});

Deno.test("une bouche sans ancrage ne fait pas grossir la casserole", () => {
  const got = neededPotFactor(
    [{ shares: [{ key: "inconnu", grams: 400 }], uses: [{ preparationId: "p", servings: 1 }] }],
    new Map(),
  );
  assertEquals(got.get("p"), 1);
});

Deno.test("le module est PUR: même entrée, même sortie, entrée intacte", () => {
  const meals = [{
    shares: [{ key: KEY, grams: 400 }],
    uses: [{ preparationId: "p", servings: 1 }],
  }];
  const anchors = new Map([[KEY, anchor({ factor: 1.6, raw: 2.4 })]]);
  const before = JSON.stringify(meals);
  const a = neededPotFactor(meals, anchors);
  const b = neededPotFactor(meals, anchors);
  assertEquals(JSON.stringify([...a]), JSON.stringify([...b]));
  assertEquals(JSON.stringify(meals), before);
});

// ═══════════════════════════════════════════════════════════════════════════
// A2 — LE BAC SE DIMENSIONNE SUR SES MANGEURS (2026-09-04)
// ═══════════════════════════════════════════════════════════════════════════
//
// Ce que ces tests protègent:
//
//   * LA SOMME, PAS UNE PART — le facteur d'un bac n'est celui d'aucune de ses
//     bouches. La mutation la plus rentable est de prendre la cible de la
//     première: elle rendrait la moitié sur une table de deux;
//   * L'ENTRETIEN, PAS L'ÉCART — une bouche à objectif compte pour sa
//     maintenance. Sinon son déficit est payé par les autres, ce qui est « une
//     ceinture posée sur l'un retire à l'autre » par l'autre bout;
//   * LE FAIL-CLOSED QUI COMPTE — une bouche illisible fait s'abstenir le bac
//     ENTIER. Servir la somme de trois besoins quand on n'en connaît que deux,
//     c'est sous-remplir en ayant l'air d'avoir calculé;
//   * v4 INTACT — aucun de ces tests ne fait apparaître un gramme au nom de
//     quelqu'un sur un couvercle partagé.

const POT_BODY = {
  appetite: null,
  heightCm: 175,
  weightKg: 70,
  gender: "female" as const,
  ageYears: 40,
  activityLevel: "sedentary" as const,
  activityAxes: { day: null, sport: null, asked: false },
};

function eater(over: Partial<AnchorMouth> = {}, daySlots = ["breakfast", "lunch", "dinner"]) {
  return {
    mouth: {
      memberId: "m",
      ageState: "adult" as const,
      restriction: "clear" as const,
      body: POT_BODY,
      direction: null,
      paceKgPerWeek: null,
      declaredSlots: ["breakfast", "lunch", "dinner"],
      slotExtraKcal: {} as Record<string, number>,
      conditionRefs: [],
      ...over,
    },
    daySlots,
  };
}

Deno.test("A2 — LE BAC VISE LA SOMME DE SES MANGEURS, PAS LA PART DE L'UN", () => {
  const one = potFactorFor({
    slot: "lunch",
    grams: 400,
    deliveredKcal: 400,
    eaters: [eater({ memberId: "a" })],
    coachCounting: "no_position",
  });
  const two = potFactorFor({
    slot: "lunch",
    grams: 400,
    deliveredKcal: 400,
    eaters: [eater({ memberId: "a" }), eater({ memberId: "b" })],
    coachCounting: "no_position",
  });
  assert(one.raw !== null && two.raw !== null);
  // ⛔ LA MUTATION: lire la cible du premier mangeur au lieu de sommer. Elle
  // rendrait `two.raw === one.raw`, c'est-à-dire un bac pour deux rempli pour un.
  assert(
    Math.abs(two.raw! - 2 * one.raw!) < 1e-9,
    `deux corps identiques ne demandent pas le double: ${one.raw} puis ${two.raw}`,
  );
});

Deno.test("⛔ A2 — UNE BOUCHE À OBJECTIF COMPTE POUR SON ENTRETIEN DANS UN BAC", () => {
  // v4: « un objectif de poids ouvre une portion millimétrée ». L'écart
  // s'exécute dans une boîte à UN nom, jamais dans la casserole de tout le
  // monde — sinon le déficit de l'une est servi aux autres.
  const neutral = potFactorFor({
    slot: "lunch",
    grams: 400,
    deliveredKcal: 400,
    eaters: [eater({ memberId: "a", direction: null })],
    coachCounting: "no_position",
  });
  const losing = potFactorFor({
    slot: "lunch",
    grams: 400,
    deliveredKcal: 400,
    eaters: [eater({ memberId: "a", direction: "down", paceKgPerWeek: 0.5 })],
    coachCounting: "no_position",
  });
  assertEquals(losing.raw, neutral.raw);
});

Deno.test("⛔ A2 — UNE BOUCHE ILLISIBLE FAIT S'ABSTENIR LE BAC ENTIER", () => {
  // Fail-closed, et le motif le dit. La direction de l'erreur compte: remplir
  // pour deux une casserole qui en nourrit trois affame le troisième.
  const got = potFactorFor({
    slot: "lunch",
    grams: 400,
    deliveredKcal: 400,
    eaters: [eater({ memberId: "a" }), eater({ memberId: "b", body: null })],
    coachCounting: "no_position",
  });
  assertEquals(got.reason, "pot_mouth_unknown");
  assertEquals(got.factor, 1);
  assertEquals(got.raw, null);
});

Deno.test("⛔ A2 — UN PLAT ILLISIBLE NE SE DIVISE PAS", () => {
  const got = potFactorFor({
    slot: "lunch",
    grams: 400,
    deliveredKcal: null,
    eaters: [eater()],
    coachCounting: "no_position",
  });
  assertEquals(got.reason, "pot_incomplete");
  assertEquals(got.factor, 1);
});

Deno.test("⛔ A2 — LE PLAFOND DE MASSE EST LA SOMME DES BESOINS, ET IL SE COMPTE", () => {
  // ⟳ 2026-09-04: la somme des CORPS (2 × 8 × 70 = 1 120 g) est devenue la
  // somme de ce que porte le BESOIN de chaque bouche à ce moment, à la densité
  // d'un plat ordinaire — `mealMassCapGrams`, et pourquoi le kilo a été
  // abandonné, dans `mouth_anchor.ts`. Deux bouches identiques: deux fois le
  // même plafond. Un bac de 1 000 g ne peut pas plus que ce rapport, quelle
  // que soit la demande.
  //
  // ⛔ LA MUTATION: lire le plafond sur UNE bouche. Elle rendrait la moitié et
  // raboterait une casserole légitime de moitié.
  const one = eater({ memberId: "a" });
  const target = mouthTargetKcal({ ...one.mouth, direction: null }, "no_position").kcal;
  assert(target !== null && target > 0, "la fixture n'a plus de cible");
  const lunch = slotPlanTargets({
    targetKcal: target,
    coveredSlots: ["lunch"],
    wholeSlots: [...one.mouth.declaredSlots, ...one.daySlots],
    slotExtraKcal: one.mouth.slotExtraKcal,
  }).bySlot.get("lunch");
  assert(lunch !== undefined && lunch > 0, "le déjeuner n'a pas de part");
  const capEach = mealMassCapGrams(lunch);
  assert(capEach !== null);
  const expected = (2 * capEach) / 1000;
  const got = potFactorFor({
    slot: "lunch",
    grams: 1000,
    // Volontairement dérisoire: la demande explose, seule la masse borne.
    deliveredKcal: 50,
    eaters: [eater({ memberId: "a" }), eater({ memberId: "b" })],
    coachCounting: "no_position",
  });
  assertEquals(got.reason, "pot_clamped");
  assert(
    Math.abs(got.factor - expected) < 1e-9,
    `le plafond de masse n'est pas la somme des besoins: ${got.factor} pour ${expected}`,
  );
  // Et ce n'est plus le kilo: deux corps de 70 kg à 8 g/kg feraient 1,12.
  assert(Math.abs(got.factor - 1.12) > 1e-3, "le plafond du bac est retombé au kilo");
  assert(got.raw! > got.factor, "le brut n'a pas été gardé à côté du raboté");
});

Deno.test("⛔ A2 — UN MOMENT SANS POIDS RECONNU S'ABSTIENT", () => {
  // On ne sait pas ce que « brunch » vaut dans une journée: prétendre le savoir
  // pour une casserole servirait un nombre inventé.
  const got = potFactorFor({
    slot: "brunch",
    grams: 400,
    deliveredKcal: 400,
    eaters: [eater({}, ["brunch"])],
    coachCounting: "no_position",
  });
  assertEquals(got.reason, "pot_mouth_unknown");
  assertEquals(got.factor, 1);
});

Deno.test("⛔ A2 — LE VOCABULAIRE DES MOTIFS EST FERMÉ", () => {
  // Un motif hors liste serait inerte au lecteur: l'histogramme l'écarterait
  // sans le dire, et le bac serait compté nulle part.
  assertEquals(new Set(POT_REASONS).size, POT_REASONS.length);
  for (const reason of POT_REASONS) assert(reason.startsWith("pot_"));
});

// ⟳ 2026-09-05 — LA BASE EST LA MASSE DU POT QUAND ELLE EST CONNUE.
Deno.test("un pot déjà plus petit que ses tirages grossit de l'écart ENTIER, pas du seul surplus d'ancrage", () => {
  const meals = [{ shares: [{ key: KEY, grams: 1500 }], uses: [{ preparationId: "p", servings: 1 }] }];
  const anchors = new Map([[KEY, anchor({ factor: 1, raw: 1 })]]);
  assertEquals(neededPotFactor(meals, anchors).get("p"), 1);
  assertEquals(neededPotFactor(meals, anchors, new Map([["p", 1000]])).get("p"), 1.5);
  assertEquals(neededPotFactor(meals, new Map([[KEY, anchor({ factor: 1.2, raw: 1.2 })]]), new Map([["p", 1000]])).get("p"), 1.8);
  assertEquals(neededPotFactor(meals, anchors, new Map([["p", null]])).get("p"), 1);
  assertEquals(neededPotFactor(meals, anchors, new Map([["p", 0]])).get("p"), 1);
});
