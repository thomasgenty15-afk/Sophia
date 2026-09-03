import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  buildTrackingReport,
  datesBetween,
  planEndsOn,
  readDishKey,
  slotDayShare,
  slotEstimate,
  sumEnergy,
  type TrackingFact,
  type TrackingInput,
  type TrackingPlan,
  type TrackingPlanDish,
  weakestBasis,
} from "./tracking_window.ts";
import type { EnergyGateResult } from "./energy_gate.ts";
import type { EnergyTarget } from "./energy_target.ts";
import { EATING_OCCASIONS } from "./meal_generation.ts";

// ══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ══════════════════════════════════════════════════════════════════════════

const OPEN: EnergyGateResult = { show: true, reason: "open" };
const FLOOR: EnergyGateResult = { show: false, reason: "restriction_floor" };
const MINOR: EnergyGateResult = { show: false, reason: "minor" };

const TARGET: EnergyTarget = {
  range: { low: 1900, high: 2300 },
  basis: "weight_range_with_direction",
  gap: null,
  weightKg: 72,
  weightWeekStart: "2026-08-31",
  direction: "down",
  directionGap: null,
};

function dish(over: Partial<TrackingPlanDish> = {}): TrackingPlanDish {
  return {
    dishIndex: 0,
    date: "2026-09-02",
    slot: "dinner",
    title: "Poulet et riz",
    kcal: 600,
    fromPreparation: false,
    ...over,
  };
}

function plan(over: Partial<TrackingPlan> = {}): TrackingPlan {
  return {
    mealId: "plan-1",
    startsOn: "2026-09-01",
    durationDays: 3,
    retired: false,
    planKind: "personal",
    dishes: [dish()],
    cookingSessions: 0,
    shifts: 0,
    skippedSessions: 0,
    pendingWaves: 0,
    ...over,
  };
}

function fact(over: Partial<TrackingFact> = {}): TrackingFact {
  return {
    key: null,
    localDate: "2026-09-02",
    slot: null,
    planRelation: null,
    disqualifiedReason: null,
    mediaPath: null,
    energy: null,
    ...over,
  };
}

function input(over: Partial<TrackingInput> = {}): TrackingInput {
  return {
    window: { from: "2026-09-01", to: "2026-09-03" },
    today: "2026-09-03",
    gate: OPEN,
    direction: "down",
    target: TARGET,
    declaredSlots: ["breakfast", "lunch", "dinner"],
    plans: [plan()],
    facts: [],
    weights: [],
    leftoverBoxes: { known: false },
    ...over,
  };
}

/**
 * TOUT NOMBRE D'ÉNERGIE DU RAPPORT, AVEC LE CHEMIN QUI Y MÈNE.
 *
 * Sert la propriété « aucun chiffre sans base »: on descend l'objet, et tout
 * ce qui ressemble à un kcal doit être accompagné d'une base dans le MÊME
 * objet. Un `number` nu ailleurs que dans `weight` fait tomber le test.
 */
function energyLeaves(
  node: unknown,
  path = "",
  out: Array<{ path: string; value: Record<string, unknown> }> = [],
): Array<{ path: string; value: Record<string, unknown> }> {
  if (Array.isArray(node)) {
    node.forEach((n, i) => energyLeaves(n, `${path}[${i}]`, out));
    return out;
  }
  if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if ("kcal" in rec) out.push({ path, value: rec });
    for (const [k, v] of Object.entries(rec)) {
      energyLeaves(v, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

// ══════════════════════════════════════════════════════════════════════════
// ① LA PORTE — elle est lue avant tout, et son absence n'ouvre rien
// ══════════════════════════════════════════════════════════════════════════

Deno.test("A7 — un rapport sans porte ne se construit pas", () => {
  assertThrows(
    () =>
      buildTrackingReport(
        { ...input(), gate: undefined } as unknown as TrackingInput,
      ),
    Error,
    "gate",
  );
  // LE CAS QUI PASSE: avec la porte, le même appel rend un rapport.
  assertEquals(buildTrackingReport(input()).floor, false);
});

Deno.test("A7 — sous plancher TCA, le rapport ne porte AUCUN chiffre ni courbe (C5)", () => {
  const report = buildTrackingReport(input({
    gate: FLOOR,
    facts: [fact({ energy: { kcal: 700, basis: "photo_estimate" } })],
    weights: [{ localDate: "2026-09-02", value: 71.4 }],
  }));
  assertEquals(report.floor, true);
  assertEquals(report.permanent, null);
  assertEquals(report.objective, null);
  assertEquals(report.weight, null);
  assertEquals(energyLeaves(report).length, 0);
  // Et la raison reste lisible pour l'écran, sans être un diagnostic.
  assertEquals(report.energy.reason, "restriction_floor");
});

Deno.test("A7 — une porte fermée AUTREMENT garde le bloc permanent et la courbe", () => {
  const report = buildTrackingReport(input({
    gate: MINOR,
    weights: [{ localDate: "2026-09-02", value: 71.4 }],
  }));
  assertEquals(report.floor, false);
  assertEquals(report.energy.open, false);
  assertEquals(report.objective, null);
  assert(report.permanent !== null);
  assertEquals(report.permanent?.mealsDecided, 1);
  assertEquals(report.weight?.length, 1);
  // ⛔ ET AUCUN KCAL: la porte fermée ferme le chiffre, pas la page.
  assertEquals(energyLeaves(report).length, 0);
});

Deno.test("A7 — sans direction, il n'y a pas de bloc chiffré, mais la courbe reste (D7.11)", () => {
  const report = buildTrackingReport(input({
    direction: null,
    weights: [{ localDate: "2026-09-01", value: 72.1 }],
  }));
  assertEquals(report.objective, null);
  assertEquals(report.weight?.length, 1);
  assert(report.permanent !== null);
});

// ══════════════════════════════════════════════════════════════════════════
// ② LA BASE LA PLUS FAIBLE — le renversement R3, et sa condition
// ══════════════════════════════════════════════════════════════════════════

Deno.test("A7 — `weakestBasis` rend la plus faible, pas la majoritaire", () => {
  assertEquals(
    weakestBasis(["plan_quantities", "plan_quantities", "photo_estimate"]),
    "photo_estimate",
  );
  assertEquals(weakestBasis(["photo_estimate", "assumed"]), "assumed");
  assertEquals(weakestBasis(["plan_quantities"]), "plan_quantities");
  assertEquals(weakestBasis([]), null);
  assertEquals(
    weakestBasis(["slot_estimate", "declared_quantities"]),
    "slot_estimate",
  );
});

Deno.test("A7 — une somme porte la base la plus faible, et jamais un nombre nu", () => {
  const total = sumEnergy([
    { kcal: 600, basis: "plan_quantities" },
    { kcal: 450, basis: "photo_estimate" },
  ]);
  assertEquals(total, { kcal: 1050, basis: "photo_estimate", parts: 2 });
  assertEquals(sumEnergy([]), null);
});

Deno.test("A7 — un jour mêlant un plat coché et une photo s'annonce comme une photo", () => {
  const report = buildTrackingReport(input({
    today: "2026-09-02",
    facts: [
      fact({ key: "meal_tick:plan-1:0", slot: "dinner" }),
      fact({
        slot: "lunch",
        energy: { kcal: 450, basis: "photo_estimate" },
        mediaPath: "u/1.jpg",
      }),
    ],
    declaredSlots: ["lunch", "dinner"],
  }));
  const day = report.objective?.days.find((d) => d.date === "2026-09-02");
  assertEquals(day?.planned[0].state, "ticked");
  assertEquals(day?.planned[0].energy?.basis, "plan_quantities");
  assertEquals(day?.total?.basis, "photo_estimate");
  assertEquals(day?.total?.kcal, 1050);
});

// ══════════════════════════════════════════════════════════════════════════
// ③ « PAS DE NOUVELLES » SE LIT, ET SE DIT (D8.2)
// ══════════════════════════════════════════════════════════════════════════

Deno.test("A7 — un plat du plan que personne n'a touché compte, base `assumed`", () => {
  const report = buildTrackingReport(input({ today: "2026-09-02" }));
  const day = report.objective?.days.find((d) => d.date === "2026-09-02");
  assertEquals(day?.planned[0].state, "silent");
  assertEquals(day?.planned[0].energy?.basis, "assumed");
  assertEquals(day?.total?.basis, "assumed");
});

Deno.test("A7 — un plat décoché ou frappé d'accident ne compte plus", () => {
  const unticked = buildTrackingReport(input({
    today: "2026-09-02",
    declaredSlots: [],
    facts: [
      fact({ key: "meal_tick:plan-1:0", disqualifiedReason: "ate_other" }),
    ],
  }));
  const d1 = unticked.objective?.days.find((d) => d.date === "2026-09-02");
  assertEquals(d1?.planned[0].state, "unticked");
  assertEquals(d1?.planned[0].energy, null);
  assertEquals(d1?.total, null);

  const accident = buildTrackingReport(input({
    today: "2026-09-02",
    declaredSlots: [],
    facts: [fact({ key: "accident_off_plan:plan-1:0" })],
  }));
  const d2 = accident.objective?.days.find((d) => d.date === "2026-09-02");
  assertEquals(d2?.planned[0].state, "off_plan");
  assertEquals(d2?.total, null);
});

Deno.test("A7 — une coche REPOSÉE après une décoche gagne: la ligne vivante prime", () => {
  const report = buildTrackingReport(input({
    today: "2026-09-02",
    declaredSlots: [],
    facts: [
      fact({ key: "meal_tick:plan-1:0", disqualifiedReason: "no_time" }),
      fact({ key: "meal_tick:plan-1:0" }),
    ],
  }));
  const day = report.objective?.days.find((d) => d.date === "2026-09-02");
  assertEquals(day?.planned[0].state, "ticked");
});

// ══════════════════════════════════════════════════════════════════════════
// ④ LES CRÉNEAUX LOUPÉS, ET L'ESTIMATION QUI NE DÉBORDE PAS DE LA JOURNÉE
// ══════════════════════════════════════════════════════════════════════════

Deno.test("A7 — la part d'un créneau est NORMALISÉE sur les créneaux déclarés", () => {
  // ⛔ LE DÉFAUT QUE CE TEST FERME: `SLOT_DAY_WEIGHT` somme à 1,30 sur les six
  // occasions. Multiplier la cible par le poids brut rendrait 130 % de la
  // journée — un dépassement invisible de 30 %.
  const six = [...EATING_OCCASIONS];
  const sum = six.reduce((acc, s) => acc + slotDayShare(s, six), 0);
  assert(Math.abs(sum - 1) < 1e-9, `les six parts somment à ${sum}, pas à 1`);

  const three = ["breakfast", "lunch", "dinner"] as const;
  const sum3 = three.reduce((acc, s) => acc + slotDayShare(s, [...three]), 0);
  assert(Math.abs(sum3 - 1) < 1e-9, `les trois parts somment à ${sum3}`);
  // Le déjeuner pèse plus que le petit-déjeuner, et l'ordre est le point.
  assert(slotDayShare("lunch", [...three]) > slotDayShare("breakfast", [...three]));
});

Deno.test("A7 — une estimation de créneau est arrondie aux 50 et porte `slot_estimate`", () => {
  const three = ["breakfast", "lunch", "dinner"] as const;
  const e = slotEstimate(TARGET, "lunch", [...three]);
  // milieu 2100 × 0,40/1,00 = 840 → 850
  assertEquals(e, { kcal: 850, basis: "slot_estimate" });
  assertEquals(e!.kcal % 50, 0);
  // ⚠️ ET UN JEU DONT LES POIDS NE SOMMENT PAS À 1 — sans lui, ce test resterait
  // vert si la normalisation disparaissait: petit-déj + déjeuner + dîner pèsent
  // exactement 1,00, par hasard. Ici (déjeuner + dîner) pèsent 0,75, et la part
  // du déjeuner monte à 0,40/0,75 ⇒ 2 100 × 0,533 = 1 120 → 1 100.
  assertEquals(slotEstimate(TARGET, "lunch", ["lunch", "dinner"]), {
    kcal: 1100,
    basis: "slot_estimate",
  });
  // Sans cible, aucune estimation — jamais un zéro qui affirmerait un jeûne.
  assertEquals(slotEstimate(null, "lunch", [...three]), null);
  assertEquals(
    slotEstimate({ ...TARGET, range: null }, "lunch", [...three]),
    null,
  );
});

Deno.test("A7 — un créneau PESÉ est couvert; un créneau seulement DÉCLARÉ garde son repère", () => {
  const report = buildTrackingReport(input({
    today: "2026-09-02",
    declaredSlots: ["breakfast", "lunch", "dinner"],
    facts: [
      // Un fait SANS chiffre: « j'ai mangé du poulet » dit qu'un repas a eu
      // lieu, jamais combien.
      fact({ slot: "lunch", localDate: "2026-09-02" }),
    ],
  }));
  const day = report.objective?.days.find((d) => d.date === "2026-09-02");
  // `dinner` porte le plat du plan ⇒ couvert. `lunch` porte un fait muet ⇒ il
  // garde son repère, mais on ne lui redemande pas de décrire. `breakfast` n'a
  // rien ⇒ loupé, et on le lui propose.
  assertEquals(day?.missed.map((m) => m.slot), ["breakfast", "lunch"]);
  assertEquals(day?.missed.map((m) => m.declared), [false, true]);
  assertEquals(day?.missed[0].estimate?.basis, "slot_estimate");
  assertEquals(day?.missed[1].estimate?.basis, "slot_estimate");
});

Deno.test("A7 — un fait AVEC chiffre couvre son créneau: on a mieux qu'un repère", () => {
  const report = buildTrackingReport(input({
    today: "2026-09-02",
    declaredSlots: ["breakfast", "lunch", "dinner"],
    facts: [
      fact({
        slot: "lunch",
        localDate: "2026-09-02",
        energy: { kcal: 620, basis: "photo_estimate" },
      }),
    ],
  }));
  const day = report.objective?.days.find((d) => d.date === "2026-09-02");
  assertEquals(day?.missed.map((m) => m.slot), ["breakfast"]);
});

Deno.test("A7 — DÉCRIRE ne fait pas disparaître le chiffre du jour", () => {
  // ⛔ L'INCITATION PERVERSE QUE CE TEST FERME. Si un créneau décrit perdait
  // son repère de répartition, décrire son repas ferait BAISSER le total —
  // et le produit apprendrait à ses utilisateurs à ne rien déclarer.
  const before = buildTrackingReport(input({
    today: "2026-09-02",
    declaredSlots: ["breakfast", "lunch", "dinner"],
  }));
  const after = buildTrackingReport(input({
    today: "2026-09-02",
    declaredSlots: ["breakfast", "lunch", "dinner"],
    facts: [fact({ slot: "lunch", localDate: "2026-09-02" })],
  }));
  const d1 = before.objective?.days.find((d) => d.date === "2026-09-02");
  const d2 = after.objective?.days.find((d) => d.date === "2026-09-02");
  assertEquals(d1?.total?.kcal, d2?.total?.kcal);
  // Ce qui change est le BOUTON, pas le chiffre.
  assertEquals(d1?.missed.every((m) => m.declared === false), true);
  assertEquals(d2?.missed.some((m) => m.declared), true);
});

Deno.test("A7 — un jour du FUTUR n'a aucun créneau loupé", () => {
  const report = buildTrackingReport(input({
    today: "2026-09-01",
    declaredSlots: ["breakfast", "lunch", "dinner"],
  }));
  assertEquals(
    report.objective?.days.find((d) => d.date === "2026-09-03")?.missed.length,
    0,
  );
  // LE CAS QUI PASSE: le jour même, lui, en a.
  assert(
    (report.objective?.days.find((d) => d.date === "2026-09-01")?.missed
      .length ?? 0) > 0,
  );
});

Deno.test("A7 — un fait SANS créneau suspend l'estimation, il ne la double pas", () => {
  const report = buildTrackingReport(input({
    today: "2026-09-02",
    declaredSlots: ["breakfast", "lunch", "dinner"],
    facts: [
      fact({
        slot: null,
        localDate: "2026-09-02",
        energy: { kcal: 500, basis: "photo_estimate" },
      }),
    ],
  }));
  const day = report.objective?.days.find((d) => d.date === "2026-09-02");
  assertEquals(day?.missed.map((m) => m.slot), ["breakfast", "lunch"]);
  // Listés — la personne peut les décrire — mais SANS chiffre.
  assertEquals(day?.missed.every((m) => m.estimate === null), true);
  // Le total ne porte donc que le plat silencieux et la photo.
  assertEquals(day?.total?.parts, 2);
});

// ══════════════════════════════════════════════════════════════════════════
// ⑤ LE BLOC PERMANENT
// ══════════════════════════════════════════════════════════════════════════

Deno.test("A7 — un plan effectué a sa fenêtre écoulée ET au moins une coche vivante (D7.2)", () => {
  const past = plan({
    mealId: "plan-old",
    startsOn: "2026-08-20",
    durationDays: 3,
    dishes: [dish({ date: "2026-08-20" })],
  });
  const withTick = buildTrackingReport(input({
    plans: [past],
    facts: [fact({ key: "meal_tick:plan-old:0", localDate: "2026-08-20" })],
  }));
  assertEquals(withTick.permanent?.plansDone, 1);

  // Sans coche: écoulé mais jamais ouvert — il ne compte pas.
  assertEquals(
    buildTrackingReport(input({ plans: [past] })).permanent?.plansDone,
    0,
  );
  // Retiré: il ne compte pas non plus.
  assertEquals(
    buildTrackingReport(input({
      plans: [{ ...past, retired: true }],
      facts: [fact({ key: "meal_tick:plan-old:0", localDate: "2026-08-20" })],
    })).permanent?.plansDone,
    0,
  );
  // Une coche DÉCOCHÉE n'est pas une coche vivante.
  assertEquals(
    buildTrackingReport(input({
      plans: [past],
      facts: [
        fact({
          key: "meal_tick:plan-old:0",
          localDate: "2026-08-20",
          disqualifiedReason: "ate_other",
        }),
      ],
    })).permanent?.plansDone,
    0,
  );
  // Et une fenêtre encore ouverte n'est pas « effectuée ».
  assertEquals(
    buildTrackingReport(input({
      plans: [plan()],
      facts: [fact({ key: "meal_tick:plan-1:0" })],
    })).permanent?.plansDone,
    0,
  );
});

Deno.test("A7 — les quatre sources d'un « plan modifié » comptent chacune seule", () => {
  const base = input({ plans: [plan()] });
  assertEquals(buildTrackingReport(base).permanent?.plansChanged, 0);
  assertEquals(
    buildTrackingReport({ ...base, plans: [plan({ shifts: 1 })] }).permanent
      ?.plansChanged,
    1,
  );
  assertEquals(
    buildTrackingReport({ ...base, plans: [plan({ skippedSessions: 1 })] })
      .permanent?.plansChanged,
    1,
  );
  assertEquals(
    buildTrackingReport({ ...base, plans: [plan({ pendingWaves: 1 })] })
      .permanent?.plansChanged,
    1,
  );
  assertEquals(
    buildTrackingReport({
      ...base,
      facts: [fact({ key: "accident_off_plan:plan-1:0" })],
    }).permanent?.plansChanged,
    1,
  );
  // Un plan modifié DEUX fois reste UN plan.
  assertEquals(
    buildTrackingReport({
      ...base,
      plans: [plan({ shifts: 2, pendingWaves: 1 })],
      facts: [fact({ key: "accident_off_plan:plan-1:0" })],
    }).permanent?.plansChanged,
    1,
  );
});

Deno.test("A7 — deux comptes MESURÉS, et rien qui ressemble à des minutes (D7.4)", () => {
  const report = buildTrackingReport(input({
    plans: [
      plan({
        dishes: [
          dish({ dishIndex: 0, fromPreparation: true }),
          dish({ dishIndex: 1, fromPreparation: true }),
          dish({ dishIndex: 2, fromPreparation: false }),
        ],
        cookingSessions: 1,
      }),
    ],
  }));
  assertEquals(report.permanent?.mealsDecided, 3);
  assertEquals(report.permanent?.cookSessions, 1);
  assertEquals(report.permanent?.cookedForMeals, 2);
  // ⛔ AUCUN CHAMP DE TEMPS: la forme du rapport est la garde.
  assertEquals(
    Object.keys(report.permanent ?? {}).some((k) => /minute|time|saved/i.test(k)),
    false,
  );
});

Deno.test("A7 — « boîtes restées » reste INCONNU tant que A8.2 n'a pas livré sa table", () => {
  assertEquals(
    buildTrackingReport(input()).leftoverBoxes,
    { known: false },
  );
  assertEquals(
    buildTrackingReport(input({ leftoverBoxes: { known: true, count: 0 } }))
      .leftoverBoxes,
    { known: true, count: 0 },
  );
});

// ══════════════════════════════════════════════════════════════════════════
// ⑥ LES TOTAUX JOUR / SEMAINE / PLAN
// ══════════════════════════════════════════════════════════════════════════

Deno.test("A7 — jour, semaine et plan somment des jours, chacun avec sa base", () => {
  const report = buildTrackingReport(input({
    window: { from: "2026-09-01", to: "2026-09-03" },
    today: "2026-09-03",
    declaredSlots: [],
    plans: [
      plan({
        dishes: [
          dish({ dishIndex: 0, date: "2026-09-01", kcal: 500 }),
          dish({ dishIndex: 1, date: "2026-09-03", kcal: 700 }),
        ],
      }),
    ],
    facts: [
      fact({ key: "meal_tick:plan-1:0", localDate: "2026-09-01" }),
      fact({ key: "meal_tick:plan-1:1", localDate: "2026-09-03" }),
    ],
  }));
  assertEquals(report.objective?.day, {
    kcal: 700,
    basis: "plan_quantities",
    parts: 1,
  });
  assertEquals(report.objective?.week?.kcal, 1200);
  assertEquals(report.objective?.plan?.kcal, 1200);
  assertEquals(report.objective?.plan?.basis, "plan_quantities");
});

Deno.test("A7 — le total du plan ne prend que le plan VIVANT du jour", () => {
  const report = buildTrackingReport(input({
    window: { from: "2026-08-25", to: "2026-09-03" },
    today: "2026-09-03",
    declaredSlots: [],
    plans: [
      plan({
        mealId: "old",
        startsOn: "2026-08-25",
        durationDays: 2,
        dishes: [dish({ dishIndex: 0, date: "2026-08-25", kcal: 900 })],
      }),
      plan({
        mealId: "live",
        startsOn: "2026-09-02",
        durationDays: 3,
        dishes: [dish({ dishIndex: 0, date: "2026-09-03", kcal: 700 })],
      }),
    ],
    facts: [],
  }));
  // Les deux jours comptent dans la fenêtre; seul le plan courant fait le total
  // « plan ».
  assertEquals(report.objective?.plan?.kcal, 700);
  assertEquals(report.objective?.week?.kcal, 700);
});

// ══════════════════════════════════════════════════════════════════════════
// ⑦ LES OUTILS
// ══════════════════════════════════════════════════════════════════════════

Deno.test("A7 — `readDishKey` lit le préfixe du contrat, et refuse le reste", () => {
  assertEquals(readDishKey("meal_tick:abc:3", "meal_tick:"), {
    mealId: "abc",
    dishIndex: 3,
  });
  // Un identifiant qui contient un « : » — la coupe est sur le DERNIER.
  assertEquals(readDishKey("meal_tick:a:b:7", "meal_tick:"), {
    mealId: "a:b",
    dishIndex: 7,
  });
  assertEquals(readDishKey("accident_off_plan:abc:0", "meal_tick:"), null);
  assertEquals(readDishKey("meal_tick:abc:-1", "meal_tick:"), null);
  assertEquals(readDishKey("meal_tick:abc:x", "meal_tick:"), null);
  assertEquals(readDishKey("meal_tick::0", "meal_tick:"), null);
  assertEquals(readDishKey(null, "meal_tick:"), null);
});

Deno.test("A7 — les dates de la fenêtre, incluses, et une borne inversée ne boucle pas", () => {
  assertEquals(datesBetween("2026-09-01", "2026-09-03"), [
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
  ]);
  assertEquals(datesBetween("2026-09-03", "2026-09-01"), []);
  assertEquals(planEndsOn(plan({ startsOn: "2026-09-01", durationDays: 3 })), "2026-09-03");
  assertThrows(() => datesBetween("hier", "2026-09-03"), Error, "date ISO");
});

Deno.test("A7 — PROPRIÉTÉ: aucun chiffre d'énergie du rapport ne sort sans sa base", () => {
  const report = buildTrackingReport(input({
    today: "2026-09-02",
    declaredSlots: ["breakfast", "lunch", "dinner"],
    weights: [{ localDate: "2026-09-02", value: 71.2 }],
    facts: [
      fact({
        slot: "lunch",
        localDate: "2026-09-02",
        energy: { kcal: 450, basis: "declared_quantities" },
      }),
    ],
  }));
  const leaves = energyLeaves(report);
  assert(leaves.length > 0, "le cas ne produit aucun kcal — il ne prouve rien");
  for (const leaf of leaves) {
    assertEquals(
      typeof leaf.value.basis,
      "string",
      `${leaf.path} porte un kcal sans base`,
    );
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ⑧ L'ABSTENTION — un plat qu'on n'a pas su peser n'est pas un plat à zéro
// ══════════════════════════════════════════════════════════════════════════

Deno.test("A7 — un plat qui compte et qu'on n'a pas su peser abstient LA JOURNÉE", () => {
  const report = buildTrackingReport(input({
    today: "2026-09-02",
    declaredSlots: [],
    plans: [
      plan({
        dishes: [
          dish({ dishIndex: 0, date: "2026-09-02", kcal: 600 }),
          // Le référentiel n'a pas su peser celui-ci (ou c'est un plan de
          // foyer dont la part du lecteur est irreconstituable).
          dish({ dishIndex: 1, date: "2026-09-02", kcal: null }),
        ],
      }),
    ],
    facts: [
      fact({
        localDate: "2026-09-02",
        slot: "lunch",
        energy: { kcal: 450, basis: "photo_estimate" },
      }),
    ],
  }));
  const day = report.objective?.days.find((d) => d.date === "2026-09-02");
  assertEquals(day?.abstained, true);
  // ⛔ ET SURTOUT: pas 1 050. Une somme amputée aurait l'air d'un résultat, et
  // elle serait fausse dans une seule direction — vers le bas.
  assertEquals(day?.total, null);
  assertEquals(report.objective?.abstained, true);
  assertEquals(report.objective?.week, null);
});

Deno.test("A7 — un plat DÉCOCHÉ sans chiffre n'abstient rien: il ne devait pas compter", () => {
  const report = buildTrackingReport(input({
    today: "2026-09-02",
    declaredSlots: [],
    plans: [
      plan({
        dishes: [
          dish({ dishIndex: 0, date: "2026-09-02", kcal: 600 }),
          dish({ dishIndex: 1, date: "2026-09-02", kcal: null }),
        ],
      }),
    ],
    facts: [
      fact({
        key: "meal_tick:plan-1:1",
        localDate: "2026-09-02",
        disqualifiedReason: "ate_other",
      }),
    ],
  }));
  const day = report.objective?.days.find((d) => d.date === "2026-09-02");
  assertEquals(day?.abstained, false);
  assertEquals(day?.total, { kcal: 600, basis: "assumed", parts: 1 });
});

Deno.test("A7 — l'abstention d'UN jour emporte la semaine et le plan, pas les autres jours", () => {
  const report = buildTrackingReport(input({
    window: { from: "2026-09-01", to: "2026-09-03" },
    today: "2026-09-03",
    declaredSlots: [],
    plans: [
      plan({
        dishes: [
          dish({ dishIndex: 0, date: "2026-09-01", kcal: 500 }),
          dish({ dishIndex: 1, date: "2026-09-03", kcal: null }),
        ],
      }),
    ],
  }));
  const d1 = report.objective?.days.find((d) => d.date === "2026-09-01");
  assertEquals(d1?.total?.kcal, 500);
  assertEquals(report.objective?.day, null);
  assertEquals(report.objective?.week, null);
  assertEquals(report.objective?.plan, null);
  assertEquals(report.objective?.abstained, true);
});
