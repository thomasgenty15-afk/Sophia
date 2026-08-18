/**
 * L2 · D14 — le BLOC de présence: ce qu'il vaut sur le roster RÉEL, et la
 * mesure qui prouve qu'il est entré dans la consigne réellement envoyée.
 *
 * deno run -A --env-file=supabase/.env scratchpad/l2p_block_20260812.ts
 */
import { admin, fail, info, loadState, pass } from "./l2p_lib_20260812.ts";
import {
  parseMemberAway,
  resolveWindowPresence,
} from "../supabase/functions/_shared/keel/household_presence.ts";
import {
  DEFAULT_EATING_RHYTHM,
  parseEatingRhythm,
} from "../supabase/functions/_shared/keel/meal_generation.ts";

const s = await loadState();
const db = admin();

const { data: rosterRows } = await db.rpc("keel_household_roster_for", {
  p_user: s.owner.userId,
});
const { data: goal } = await db
  .from("student_goals")
  .select("practical_constraints")
  .eq("user_id", s.owner.userId)
  .maybeSingle();

const rhythmRaw = parseEatingRhythm((goal as any)?.practical_constraints?.eating_rhythm);
const rhythm = rhythmRaw.length > 0 ? rhythmRaw : DEFAULT_EATING_RHYTHM;
const members = (rosterRows ?? []).map((r: any) => ({
  memberId: r.member_id,
  displayName: r.first_name,
  away: parseMemberAway(r.away_days),
}));

console.log("\n── le roster relu en base ──");
for (const m of members) console.log(`   ${m.displayName.padEnd(6)} ${JSON.stringify(m.away.effective)}`);
console.log(`   rythme = ${JSON.stringify(rhythm.map((r) => r.slot))}`);

const presence = resolveWindowPresence({ members, rhythm, windowDays: ["wed", "thu"] });
console.log("\n── resolveWindowPresence sur ces données ──");
console.log(`   servings = ${presence.servings}   fullyAway = ${presence.fullyAway}`);
console.log(`   householdAway = ${JSON.stringify(presence.householdAway)}`);
console.log("\n── LE BLOC ──");
console.log(presence.block.split("\n").map((l) => `   | ${l}`).join("\n"));
console.log(`\n   longueur du bloc = ${presence.block.length} caractères`);

// La mesure: le générateur greffe `\n\n` + le bloc dans le message UTILISATEUR
// (household_meal_generation.ts:204, via `parts.join("\n\n")`). Run A n'avait
// aucune absence → bloc vide → la partie disparaît du join.
const { data: rows } = await db
  .from("llm_raw_response_events")
  .select("created_at, request_id, metadata")
  .eq("source", "generate-household-meal-v1")
  .eq("user_id", s.owner.userId)
  .eq("status", "attempt_start")
  .order("created_at", { ascending: true });
const sizes = (rows ?? []).map((r: any) => Number(r.metadata?.prompt_chars ?? 0));
console.log(`\n── prompt_chars mesurés en base (llm_raw_response_events) ──`);
console.log(`   ${JSON.stringify(sizes)}`);
if (sizes.length >= 2) {
  const delta = sizes[sizes.length - 1] - sizes[0];
  info("écart run A → run B", `${delta} caractères`);
  if (delta === presence.block.length + 2) {
    pass(
      "l'écart de consigne vaut EXACTEMENT le bloc + son séparateur",
      `${delta} = ${presence.block.length} + 2`,
    );
  } else {
    fail(
      "l'écart ne correspond pas au bloc",
      `delta=${delta}, bloc=${presence.block.length}`,
    );
  }
}

// ── LE CAS LIMITE DE LA GARDE: une seule bouche présente, un seul créneau ──
console.log("\n── cas limite: une bouche présente à un seul créneau ──");
const edge = resolveWindowPresence({
  members: members.map((m, i) =>
    i === 0
      ? {
        ...m,
        away: parseMemberAway([
          { day: "wed", slots: ["lunch", "dinner"] },
          { day: "thu" },
        ]),
      }
      : { ...m, away: parseMemberAway([{ day: "wed" }, { day: "thu" }]) }
  ),
  rhythm,
  windowDays: ["wed", "thu"],
});
console.log(`   fullyAway = ${edge.fullyAway}  servings = ${edge.servings}`);
console.log(`   householdAway = ${JSON.stringify(edge.householdAway)}`);
