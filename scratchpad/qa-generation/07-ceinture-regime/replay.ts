/**
 * LE REJEU DÉTERMINISTE — les OCTETS RÉELS qui ont servi du bœuf à l'enfant,
 * repassés dans le parseur, AVANT et APRÈS la ceinture.
 *
 * ⚠️ CE N'EST PAS UN RUN. Aucun appel modèle: on relit la sortie ARCHIVÉE par
 * l'agent 3A (`dump/output.json`, `result.output_text`) et on la donne deux
 * fois au parseur — une fois avec `boxMemberDiets: []` (le comportement d'AVANT
 * ce lot, à l'octet), une fois avec le roster réel. Le modèle ne varie pas,
 * donc l'écart mesuré est CELUI DU LOT, et rien d'autre.
 *
 *   deno run --allow-read replay.ts
 */
import { parseGeneratedMeal } from "../../../supabase/functions/_shared/keel/meal_generation.ts";
import type { DietaryRegime } from "../../../supabase/functions/_shared/keel/dietary_regime.ts";
import type { MealScope } from "../../../supabase/functions/_shared/keel/meal_generation.ts";
import type { StudentSafetyConstraint } from "../../../supabase/functions/_shared/keel/safety_constraints.ts";
import type { CompositionIndex } from "../../../supabase/functions/_shared/keel/food_composition.ts";

const AURELE = "c278b5dc-680f-43f1-b54f-f9da630fcb2f";
const SOLVEIG = "c9656ee5-6b39-4fd0-95f2-3f4bf70899d7";
const MARCELINE = "f5c81e2b-7f57-4fac-a30f-067fa587262d";
const THEODULE = "1fea4f51-a4e9-4066-8d09-49881ee58f38";
const NAMES: Record<string, string> = {
  [AURELE]: "Aurele",
  [SOLVEIG]: "Solveig",
  [MARCELINE]: "Marceline",
  [THEODULE]: "Theodule",
};
const ROSTER = [AURELE, SOLVEIG, MARCELINE, THEODULE];
const DIETS: { memberId: string; regime: DietaryRegime | null }[] = [
  { memberId: AURELE, regime: null },
  { memberId: SOLVEIG, regime: null },
  { memberId: MARCELINE, regime: null },
  { memberId: THEODULE, regime: "vegan" },
];

const BASE = {
  doctrine: null,
  safetyConstraints: [] as readonly StudentSafetyConstraint[] | null,
  mode: "to_shop" as const,
  scope: "several_days" as MealScope,
  pantry: [],
  beliefKeys: [],
  eatingRhythm: [
    { slot: "lunch" as const, size: null },
    { slot: "dinner" as const, size: null },
  ],
  daysToFill: ["wed"],
  awayDays: [],
  cookingTimeMin: null,
  composition: null as CompositionIndex | null,
  fixedIntakes: [],
  dayProperties: [],
  merge: null,
  boxMemberIds: ROSTER,
};

const RUNS = [
  ["one_session/run-1", "3a020001-…0002"],
  ["one_session/run-D1", "3a020001-…F0001"],
  ["separate_sessions/run-1", "3a030001-…0001"],
  ["separate_sessions/run-2", "3a030001-…20001"],
];

for (const [dir, rid] of RUNS) {
  const path =
    `/Users/ahmedamara/Dev/Sophia 2/scratchpad/qa-generation/03-foyer-modes/${dir}/dump/output.json`;
  let raw: string;
  try {
    const dump = JSON.parse(await Deno.readTextFile(path));
    raw = dump.result.output_text;
  } catch (e) {
    console.log(`\n### ${dir} — vidage illisible: ${e}`);
    continue;
  }

  const before = parseGeneratedMeal(raw, { ...BASE, boxMemberDiets: [] });
  const after = parseGeneratedMeal(raw, { ...BASE, boxMemberDiets: DIETS });

  console.log(`\n### ${dir}   (request_id ${rid})`);
  for (const who of ROSTER) {
    const b = before.preparations
      .filter((p) => p.boxes.some((x) => x.memberIds.includes(who)))
      .map((p) => p.title);
    const a = after.preparations
      .filter((p) => p.boxes.some((x) => x.memberIds.includes(who)))
      .map((p) => p.title);
    const flag = b.length === a.length ? "  " : "⛔";
    console.log(`${flag} ${NAMES[who].padEnd(10)} avant ${b.length} : ${b.join(" · ")}`);
    if (b.length !== a.length) {
      console.log(`   ${" ".repeat(10)} après ${a.length} : ${a.join(" · ")}`);
    }
  }
  console.log("   regime_belt avant :", JSON.stringify(before.regime_belt));
  console.log("   regime_belt après :", JSON.stringify(after.regime_belt));
  console.log("   refus             :", JSON.stringify(after.regime_refusals));
}
