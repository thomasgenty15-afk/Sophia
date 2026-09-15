// Mesure ① — le conseil du midi, avec EXACTEMENT le montage de `meal-energy-v1`.
//
// Ce script rejoue `adviceForPlan` hors HTTP: il prouve que la chaîne produit
// un nombre pour un cas nominal, et qu'elle se tait sur chacun des refus.
import {
  eatingOutAdvice,
  eatingOutAdviceSentence,
} from "../supabase/functions/_shared/keel/household_portions.ts";
import {
  type MemberAway,
  presenceStateFor,
} from "../supabase/functions/_shared/keel/household_presence.ts";
import { parseAwayDays, parseEatingRhythm } from "../supabase/functions/_shared/keel/meal_generation.ts";
import { effectiveRhythm } from "../supabase/functions/_shared/keel/daily_recommendation.ts";
import {
  executedPaceFor,
  maintenancePaceFor,
} from "../supabase/functions/_shared/keel/weight_pace.ts";
import { assessBirthDate } from "../supabase/functions/_shared/keel/student_age.ts";
import { ageStateFromVerdict } from "../supabase/functions/_shared/keel/household.ts";

const TODAY = "2026-08-18";
// La trace telle que `generated_from.household.presence.members[]` la porte.
const TRACE = {
  member_id: "m1",
  away: [{ day: "tue", slots: ["lunch"] }],
  eating_out: [{ day: "tue", slots: ["lunch"] }],
};
const away: MemberAway = {
  effective: parseAwayDays(TRACE.away),
  self: [],
  household: [],
  eatingOut: parseAwayDays(TRACE.eating_out),
};
const slots = effectiveRhythm(parseEatingRhythm([
  { slot: "breakfast", size: "small" },
  { slot: "lunch", size: "medium" },
  { slot: "dinner", size: "large" },
]));
const body = {
  heightCm: 178,
  weightKg: 78,
  gender: "male" as const,
  ageYears: 36,
  activityLevel: "on_feet" as const,
};
const adultVerdict = assessBirthDate("1990-05-04", TODAY);
const minorVerdict = assessBirthDate("2016-05-04", TODAY);
const OPEN = { show: true, reason: "open" };

function run(label: string, over: Record<string, unknown>) {
  const out: string[] = [];
  for (const occasion of slots) {
    const a = eatingOutAdvice({
      presenceState: presenceStateFor(away, "tue", occasion.slot),
      reader: OPEN,
      mouthIsReader: true,
      mouthAgeState: ageStateFromVerdict(adultVerdict),
      slots,
      occasion,
      executed: maintenancePaceFor({ body, isMinor: false }),
      direction: null,
      ...over,
    } as never);
    if (a.reason === "advised" && a.kcal !== null) {
      out.push(`${eatingOutAdviceSentence("fr", occasion.slot, a.kcal)} / ${
        eatingOutAdviceSentence("en", occasion.slot, a.kcal)
      }`);
    } else if (occasion.slot === "lunch") {
      out.push(`(midi refusé: ${a.reason})`);
    }
  }
  console.log(`\n${label}`);
  for (const l of out) console.log("   " + l);
}

run("① maintenance, adulte, midi dehors — LE CAS NOMINAL", {});
run("① perte 0,45 kg/sem — la cible descend la consigne", {
  executed: executedPaceFor("down", { body, isMinor: false }, 0.45),
  direction: "down",
});
run("① prise 0,30 kg/sem — la cible la monte", {
  executed: executedPaceFor("up", { body, isMinor: false }, 0.3),
  direction: "up",
});
run("⛔ mineur (C9.a)", { mouthAgeState: ageStateFromVerdict(minorVerdict) });
run("⛔ age inconnu (C9.a)", { mouthAgeState: "unknown" });
run("⛔ plancher TCA (chaine du lecteur)", {
  reader: { show: false, reason: "restriction_floor" },
});
run("⛔ cible eteinte", { reader: { show: false, reason: "target_off" } });
run("⛔ une autre bouche", { mouthIsReader: false });
run("⛔ pas de corps", { executed: maintenancePaceFor({ body: { ...body, weightKg: null }, isMinor: false }) });
run("⛔ etat de presence inconnu (C9.b)", { presenceState: "on_holiday" });
