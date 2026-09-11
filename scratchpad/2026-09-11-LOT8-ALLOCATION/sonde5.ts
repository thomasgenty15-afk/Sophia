import { requiredDensityFor, dayTargetFor } from "../../supabase/functions/_shared/keel/portion_sizing.ts";
import { densityFragment } from "../../supabase/functions/_shared/keel/household_portions.ts";
import type { AnchorMouth } from "../../supabase/functions/_shared/keel/mouth_anchor.ts";
const GRAND = { heightCm: 187, weightKg: 72, gender: "male" as const, ageYears: 28,
  activityLevel: "trains_some" as const, activityAxes: { day: null, sport: null, asked: false }, appetite: "large" as const };
const QUATRE = ["breakfast", "lunch", "snack_pm", "dinner"];
const m = { memberId: "m", ageState: "adult", restriction: "clear", body: GRAND,
  direction: "up", paceKgPerWeek: 0.35, declaredSlots: QUATRE, conditionRefs: [] } as unknown as AnchorMouth;
console.log("cible:", dayTargetFor(m, "no_position"));
const r = requiredDensityFor({
  mouth: m, coachCounting: "no_position",
  slotsByDay: new Map([["mon", QUATRE]]), lightSlots: [],
  slotFixedKcalByDay: new Map([["mon", new Map([["lunch", 1000]])]]),
  ageYears: 28, floors: { normal: 100, light: 60 },
});
console.log(r.named.find((d) => d.slot === "lunch"), r.counters);
console.log("fragment:", densityFragment(r.named.filter((d) => d.slot === "lunch")));
