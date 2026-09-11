// Sonde ③ — la famille ALLOCATION.
import {
  slotPlanTargets,
  SLOT_DAY_WEIGHT,
} from "../../supabase/functions/_shared/keel/mouth_anchor.ts";
import {
  densityCorridorFor,
  plateBoundsFor,
  requiredDensityFor,
} from "../../supabase/functions/_shared/keel/portion_sizing.ts";
import type { AnchorMouth } from "../../supabase/functions/_shared/keel/mouth_anchor.ts";

const SIX = ["breakfast", "snack_am", "lunch", "snack_pm", "dinner", "before_bed"];

// ① 1 à 6 créneaux — la somme, et la part de chacun
for (let n = 1; n <= 6; n++) {
  const grid = SIX.slice(0, n);
  const r = slotPlanTargets({
    targetKcal: 2400,
    coveredSlots: grid,
    wholeSlots: grid,
    lightSlots: [],
    slotFixedKcal: null,
  });
  const somme = grid.reduce(
    (a, s) => a + SLOT_DAY_WEIGHT[s as keyof typeof SLOT_DAY_WEIGHT],
    0,
  );
  console.log(
    n,
    "Σw =",
    somme,
    "total =",
    Math.round(r.total * 1e6) / 1e6,
    "parts =",
    [...r.bySlot.entries()].map(([s, k]) => `${s}:${Math.round(k * 100) / 100}`).join(" "),
  );
}

// ② repas dehors: couvert ⊊ déclaré
const dehors = slotPlanTargets({
  targetKcal: 2400,
  coveredSlots: ["breakfast", "dinner"],
  wholeSlots: ["breakfast", "lunch", "dinner"],
  lightSlots: [],
  slotFixedKcal: null,
});
console.log("dehors:", [...dehors.bySlot.entries()], "total", dehors.total);
const dehorsFaux = slotPlanTargets({
  targetKcal: 2400,
  coveredSlots: ["breakfast", "dinner"],
  wholeSlots: ["breakfast", "dinner"],
  lightSlots: [],
  slotFixedKcal: null,
});
console.log("si on oubliait le déjeuner au dénominateur:", [...dehorsFaux.bySlot.entries()]);

// ③ E = 0 — l'aval
const b0 = plateBoundsFor({
  ageYears: 35,
  slot: "snack_pm",
  slotTargetKcal: 0,
  light: false,
  appetite: "large",
});
console.log("E=0 bornes:", b0);
console.log("E=0 couloir:", densityCorridorFor({ targetKcal: 0, bounds: b0 }));

// ④ apport fixe excédentaire vu de requiredDensityFor
const CORPS = {
  heightCm: 170,
  weightKg: 70,
  gender: "male" as const,
  ageYears: 35,
  activityLevel: "trains_some" as const,
  activityAxes: { day: null, sport: null, asked: false },
  appetite: null,
};
function bouche(over: Partial<AnchorMouth> = {}): AnchorMouth {
  return {
    memberId: "m-solo",
    ageState: "adult",
    restriction: "clear",
    body: CORPS,
    direction: null,
    paceKgPerWeek: null,
    declaredSlots: ["breakfast", "lunch", "snack_pm", "dinner"],
    conditionRefs: [],
    ...over,
  } as AnchorMouth;
}
const couvert = requiredDensityFor({
  mouth: bouche(),
  coachCounting: "no_position",
  slotsByDay: new Map([["mon", ["breakfast", "lunch", "snack_pm", "dinner"]]]),
  lightSlots: [],
  slotFixedKcalByDay: new Map([["mon", new Map([["snack_pm", 900]])]]),
  ageYears: 35,
  floors: { normal: 100, light: 60 },
});
console.log(
  "fixe excédentaire:",
  couvert.named.map((d) => d.slot),
  couvert.counters,
);

// ⑤ apport fixe intermittent: lundi seulement
const inter = requiredDensityFor({
  mouth: bouche(),
  coachCounting: "no_position",
  slotsByDay: new Map([
    ["mon", ["breakfast", "lunch", "snack_pm", "dinner"]],
    ["tue", ["breakfast", "lunch", "snack_pm", "dinner"]],
  ]),
  lightSlots: [],
  slotFixedKcalByDay: new Map([["mon", new Map([["snack_pm", 900]])]]),
  ageYears: 35,
  floors: { normal: 100, light: 60 },
});
console.log(
  "intermittent:",
  inter.named.map((d) => [d.slot, d.minPer100G, d.maxPer100G, d.occurrences]),
  inter.counters,
);

// ⑥ la cible du jour de CORPS
import { dayTargetFor } from "../../supabase/functions/_shared/keel/portion_sizing.ts";
console.log("dayTarget CORPS:", dayTargetFor(bouche(), "no_position"));

// ⑦ le goûter de CORPS (le cas 250 kcal du chantier, par la vraie grille)
const gouterE = slotPlanTargets({
  targetKcal: dayTargetFor(bouche(), "no_position").kcal!,
  coveredSlots: ["snack_pm"],
  wholeSlots: ["breakfast", "lunch", "snack_pm", "dinner"],
  lightSlots: [],
  slotFixedKcal: null,
}).bySlot.get("snack_pm");
console.log("part goûter CORPS:", gouterE);
