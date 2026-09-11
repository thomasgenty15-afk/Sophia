// Sonde ④ — la recette partagée sur TROIS jours, et le gros appétit sous le plancher.
import {
  densityCorridorFor,
  plateBoundsFor,
  requiredDensityFor,
} from "../../supabase/functions/_shared/keel/portion_sizing.ts";
import { densityFragment } from "../../supabase/functions/_shared/keel/household_portions.ts";
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

const trois = requiredDensityFor({
  mouth: bouche(),
  coachCounting: "no_position",
  slotsByDay: new Map([["mon", QUATRE], ["tue", QUATRE], ["wed", QUATRE]]),
  lightSlots: [],
  slotFixedKcalByDay: new Map([
    ["tue", new Map([["lunch", 300]])],
    ["wed", new Map([["lunch", 800]])],
  ]),
  ageYears: 28,
  floors: { normal: 100, light: 60 },
});
console.log("TROIS JOURS lunch:", trois.named.find((d) => d.slot === "lunch"));
console.log("counters:", trois.counters);
console.log("fragment:", densityFragment(trois.named));

// gros appétit: Dmin sous le plancher générique
const gros = plateBoundsFor({
  ageYears: 35,
  slot: "breakfast",
  slotTargetKcal: 500,
  light: false,
  appetite: "large",
});
console.log("gros appétit bornes:", gros);
console.log("gros appétit couloir:", densityCorridorFor({ targetKcal: 500, bounds: gros }));

// le voyage nominal: GRAND, quatre moments, un seul jour
const nominal = requiredDensityFor({
  mouth: bouche(),
  coachCounting: "no_position",
  slotsByDay: new Map([["mon", QUATRE]]),
  lightSlots: [],
  slotFixedKcalByDay: new Map(),
  ageYears: 28,
  floors: { normal: 100, light: 60 },
});
console.log("nominal:", nominal.named);
console.log("fragment nominal:", densityFragment(nominal.named));

// le fragment du goûter à 250 kcal (CE-1), monté en SlotDensity comme requiredDensityFor
const b250 = plateBoundsFor({
  ageYears: 35,
  slot: "lunch",
  slotTargetKcal: 250,
  light: false,
  appetite: null,
});
const c250 = densityCorridorFor({ targetKcal: 250, bounds: b250 })!;
console.log("fragment 250:", densityFragment([{
  slot: "snack_pm",
  kcalPer100G: c250.minPer100G,
  minPer100G: c250.minPer100G,
  maxPer100G: c250.maxPer100G,
  preferredPer100G: c250.preferredPer100G,
  neededMinPer100G: c250.neededMinPer100G,
  incompatible: c250.incompatible,
  redundantMin: !(c250.minPer100G > 100),
  occurrences: 1,
  light: false,
}]));
