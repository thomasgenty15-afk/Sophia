// Sonde de vérification — les nombres sont DÉRIVÉS À LA MAIN dans les notes,
// ce fichier ne sert qu'à confirmer la dérivation avant d'écrire le test.
import {
  dayTargetFor,
  densityCorridorFor,
  plateBoundsFor,
  requiredDensityFor,
} from "../../supabase/functions/_shared/keel/portion_sizing.ts";
import { slotPlanTargets } from "../../supabase/functions/_shared/keel/mouth_anchor.ts";
import type { AnchorMouth } from "../../supabase/functions/_shared/keel/mouth_anchor.ts";

const GRAND = {
  heightCm: 187,
  weightKg: 72,
  gender: "male" as const,
  ageYears: 28,
  activityLevel: "trains_some" as const,
  activityAxes: { day: null, sport: null, asked: false },
  appetite: null,
};
const QUATRE = ["breakfast", "lunch", "snack_pm", "dinner"];
function bouche(over: Partial<AnchorMouth> = {}): AnchorMouth {
  return {
    memberId: "m-solo",
    ageState: "adult",
    restriction: "clear",
    body: GRAND,
    direction: "up",
    paceKgPerWeek: 0.35,
    declaredSlots: QUATRE,
    conditionRefs: [],
    ...over,
  } as AnchorMouth;
}

console.log("dayTarget GRAND:", dayTargetFor(bouche(), "no_position").kcal);

// ① 588 kcal LÉGER, plafond 700 g -> minimum 84
const b588 = plateBoundsFor({
  ageYears: 35,
  slot: "dinner",
  slotTargetKcal: 588,
  light: true,
  appetite: null,
});
console.log("588 léger bounds:", b588);
console.log("588 léger couloir:", densityCorridorFor({ targetKcal: 588, bounds: b588 }));
const b588n = plateBoundsFor({
  ageYears: 35,
  slot: "dinner",
  slotTargetKcal: 588,
  light: false,
  appetite: null,
});
console.log("588 normal bounds:", b588n);
console.log("588 normal couloir:", densityCorridorFor({ targetKcal: 588, bounds: b588n }));

// ② 250 kcal -> [100, 135]
const b250 = plateBoundsFor({
  ageYears: 35,
  slot: "lunch",
  slotTargetKcal: 250,
  light: false,
  appetite: null,
});
console.log("250 bounds:", b250, densityCorridorFor({ targetKcal: 250, bounds: b250 }));

// ③ Dmin = plancher générique (E=500 repas adulte)
const b500 = plateBoundsFor({
  ageYears: 35,
  slot: "lunch",
  slotTargetKcal: 500,
  light: false,
  appetite: null,
});
console.log("500 bounds:", b500, densityCorridorFor({ targetKcal: 500, bounds: b500 }));

// ④ couloir trop haut — 900 kcal sur une collation
const b900s = plateBoundsFor({
  ageYears: 35,
  slot: "snack_pm",
  slotTargetKcal: 900,
  light: false,
  appetite: null,
});
console.log("900 snack bounds:", b900s, densityCorridorFor({ targetKcal: 900, bounds: b900s }));

// ⑤ appétit + mineur
for (const a of [null, "small", "average", "large"] as const) {
  console.log(
    "appetite",
    a,
    "adulte",
    plateBoundsFor({ ageYears: 35, slot: "lunch", slotTargetKcal: 500, light: false, appetite: a }),
  );
  console.log(
    "appetite",
    a,
    "enfant 9",
    plateBoundsFor({ ageYears: 9, slot: "lunch", slotTargetKcal: 300, light: false, appetite: a }),
  );
}

// ⑥ le couloir vide — deux jours, apport fixe le mardi
const vide = requiredDensityFor({
  mouth: bouche(),
  coachCounting: "no_position",
  slotsByDay: new Map([["mon", QUATRE], ["tue", QUATRE]]),
  lightSlots: [],
  slotFixedKcalByDay: new Map([["tue", new Map([["lunch", 1000]])]]),
  ageYears: 28,
  floors: { normal: 100, light: 60 },
});
console.log("VIDE lunch:", vide.named.find((d) => d.slot === "lunch"), vide.counters);

// ⑦ le couloir qui se croise (pass)
const croise = requiredDensityFor({
  mouth: bouche(),
  coachCounting: "no_position",
  slotsByDay: new Map([["mon", QUATRE], ["tue", QUATRE]]),
  lightSlots: [],
  slotFixedKcalByDay: new Map([["tue", new Map([["lunch", 300]])]]),
  ageYears: 28,
  floors: { normal: 100, light: 60 },
});
console.log("CROISE lunch:", croise.named.find((d) => d.slot === "lunch"), croise.counters);

// ⑧ parts du jour B
console.log(
  "part lunch mon:",
  slotPlanTargets({
    targetKcal: 3578,
    coveredSlots: ["lunch"],
    wholeSlots: QUATRE,
    lightSlots: [],
    slotFixedKcal: null,
  }).bySlot.get("lunch"),
);

// ⑨ sans arrondi représentable
console.log(
  "degenere:",
  densityCorridorFor({
    targetKcal: 362,
    bounds: {
      min: 300,
      max: 301,
      preferred: 300,
      appetiteFactor: 1,
      densityFloorPerG: 1,
      band: "adult",
      slotClass: "meal",
      source: "age_known",
      boundSource: "target",
      physicalMax: 700,
    },
  }),
);

// ⑩ le plancher de Dmax sur tout le domaine atteignable
let pireDmax = Infinity;
let pire = "";
for (const age of [3, 9, 14, 35, null]) {
  for (const slot of ["breakfast", "lunch", "dinner", "snack_pm"]) {
    for (const light of [false, true]) {
      for (const ap of [null, "small", "average", "large"] as const) {
        for (let E = 5; E <= 3000; E += 5) {
          const b = plateBoundsFor({ ageYears: age, slot, slotTargetKcal: E, light, appetite: ap });
          const c = densityCorridorFor({ targetKcal: E, bounds: b });
          if (c === null) continue;
          if (c.maxPer100G < pireDmax) {
            pireDmax = c.maxPer100G;
            pire = `${age}/${slot}/light=${light}/${ap}/E=${E} -> [${c.minPer100G},${c.maxPer100G}]`;
          }
        }
      }
    }
  }
}
console.log("Dmax minimal atteignable:", pireDmax, pire);

// ⑪ existe-t-il un couloir dégénéré (min==max sans plafond) atteignable ?
let degen = 0;
for (const age of [3, 9, 14, 35, null]) {
  for (const slot of ["breakfast", "lunch", "dinner", "snack_pm"]) {
    for (const light of [false, true]) {
      for (const ap of [null, "small", "average", "large"] as const) {
        for (let E = 1; E <= 3000; E += 1) {
          const b = plateBoundsFor({ ageYears: age, slot, slotTargetKcal: E, light, appetite: ap });
          const c = densityCorridorFor({ targetKcal: E, bounds: b });
          if (c === null) continue;
          if (c.incompatible === null && c.maxPer100G <= c.minPer100G) {
            if (degen < 5) {
              console.log("DEGENERE atteignable:", age, slot, light, ap, E, c, b);
            }
            degen++;
          }
        }
      }
    }
  }
}
console.log("nb couloirs dégénérés atteignables:", degen);
