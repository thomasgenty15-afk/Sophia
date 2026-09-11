/**
 * ── LA CIBLE DE CHAQUE BOUCHE, ET SON CONTREFACTUEL, EN UN SEUL PASSAGE ────
 *
 * ⛔ AUCUN APPEL MODÈLE, AUCUNE VARIANCE. Deux générations comparées ne
 * prouveraient rien: le modèle varie d'un tirage à l'autre et l'écart mesuré
 * mélangerait sa variance avec l'effet cherché. Ici on appelle la MÊME fonction
 * de production deux fois, avec le seul champ `appetite` neutralisé sur la
 * seconde: l'écart entre les deux nombres n'a qu'une cause possible.
 *
 * ⛔ `mouthTargetKcal`, `slotPlanTargets` et `plateBoundsFor` sont IMPORTÉS de
 * la production, jamais recopiés — même règle que `31-energie-foyer.ts`.
 *
 *   deno run --allow-read 71-cible-par-bouche.ts roster-F3.json
 */
import { mouthTargetKcal, slotPlanTargets, type AnchorMouth } from
  "../../supabase/functions/_shared/keel/mouth_anchor.ts";
import { plateBoundsFor } from "../../supabase/functions/_shared/keel/portion_sizing.ts";
import { scaleDirectionOf } from "../../supabase/functions/_shared/keel/weight_pace.ts";
import type { AppetiteLevel, ActivityLevel, DayActivityLevel, SportFrequency } from
  "../../supabase/functions/_shared/keel/tokens.ts";

type Row = {
  member_id: string; first_name: string; goal: string | null;
  height_cm: number; weight_kg: number; gender: string;
  activity_level: string | null; day_activity: string | null;
  sport_frequency: string | null; appetite: string | null; age_years: number | null;
};

const SLOTS = ["breakfast", "lunch", "dinner"];
const rows: Row[] = JSON.parse(Deno.readTextFileSync(Deno.args[0]));

function mouthOf(r: Row, appetite: AppetiteLevel | null): AnchorMouth {
  return {
    memberId: r.member_id,
    ageState: r.age_years !== null && r.age_years < 18 ? "minor" : "adult",
    restriction: r.goal === null && r.age_years !== null && r.age_years < 18
      ? "no_account"
      : "no_account",
    body: {
      heightCm: r.height_cm,
      weightKg: r.weight_kg,
      gender: r.gender as "male" | "female" | "other",
      ageYears: r.age_years,
      activityLevel: (r.activity_level ?? null) as ActivityLevel | null,
      activityAxes: {
        day: (r.day_activity ?? null) as DayActivityLevel | null,
        sport: (r.sport_frequency ?? null) as SportFrequency | null,
        asked: true,
      },
      appetite,
    },
    direction: r.goal === null ? null : scaleDirectionOf(r.goal as "fat_loss"),
    paceKgPerWeek: null,
    declaredSlots: SLOTS,
    slotExtraKcal: null,
    conditionRefs: [],
    portionIndex: null,
  };
}

console.log(
  "bouche".padEnd(9) + "appétit".padEnd(9) + "cible".padStart(7) +
  "  contrefactuel(neutre)".padStart(22) + "  écart" + "   déjeuner kcal / max g",
);
for (const r of rows) {
  const declared = (r.appetite ?? null) as AppetiteLevel | null;
  const a = mouthTargetKcal(mouthOf(r, declared), "no_position");
  const b = mouthTargetKcal(mouthOf(r, null), "no_position");
  if (a.kcal === null || b.kcal === null) {
    console.log(`${r.first_name.padEnd(9)}${String(declared).padEnd(9)}  ${a.reason} / ${b.reason}`);
    continue;
  }
  const part = slotPlanTargets({
    targetKcal: a.kcal,
    coveredSlots: ["lunch"],
    wholeSlots: SLOTS,
    slotExtraKcal: {},
    lightSlots: [],
    slotFixedKcal: null,
  }).bySlot.get("lunch")!;
  const bounds = plateBoundsFor({
    ageYears: r.age_years,
    slot: "lunch",
    slotTargetKcal: part,
  });
  const pct = ((a.kcal / b.kcal - 1) * 100).toFixed(1);
  console.log(
    r.first_name.padEnd(9) + String(declared).padEnd(9) +
    String(a.kcal).padStart(7) + String(b.kcal).padStart(22) +
    `  ${pct.padStart(5)}%` +
    `   ${Math.round(part)} / ${bounds.max} g (${bounds.boundSource})`,
  );
}
