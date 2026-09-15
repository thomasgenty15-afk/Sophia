/**
 * Une generation REELLE du plan du foyer. Usage:
 *   deno run -A l3h_gen_20260812.ts <label> <intent> [replaces]
 * La fenetre est fixe: exact 2026-08-17, 3 jours.
 */
import { admin, signIn, callFn, info } from "./l3h_lib_20260812.ts";

const label = Deno.args[0] ?? "run";
const intent = Deno.args[1] ?? "prepare_next";
const replaces = Deno.args[2] ?? null;

const state = JSON.parse(await Deno.readTextFile(new URL("./l3h_state_20260812.json", import.meta.url)));
const owner = await signIn(state.owner.email);

const body: Record<string, unknown> = {
  window: { kind: "exact", starts_on: "2026-08-17", duration_days: 3 },
  intent,
};
if (replaces) body.replaces = replaces;

info("POST generate-household-meal-v1", JSON.stringify(body));
const res = await callFn(owner, "generate-household-meal-v1", body);
console.log(`HTTP ${res.status} in ${res.ms}ms`);
console.log(JSON.stringify(res.json, null, 2).slice(0, 4000));

await Deno.writeTextFile(
  new URL(`./l3h_${label}_result_20260812.json`, import.meta.url),
  JSON.stringify({ status: res.status, ms: res.ms, json: res.json }, null, 2),
);

// La verite est en base.
if (res.status === 200) {
  const a = admin();
  const q = await a.from("student_generated_meals")
    .select("id, user_id, household_id, plan_kind, starts_on, duration_days, servings, member_portions, generated_from, retired_at, created_at")
    .eq("household_id", state.householdId)
    .eq("plan_kind", "household")
    .order("created_at", { ascending: false })
    .limit(1);
  if (q.error) throw q.error;
  const row = (q.data as any[])[0];
  console.log("=== LIGNE EN BASE ===");
  console.log("id", row.id, "starts_on", row.starts_on, "duration", row.duration_days, "servings", row.servings);
  console.log("member_portions:", JSON.stringify(row.member_portions));
  console.log("generated_from.household.hand:", JSON.stringify(row.generated_from?.household?.hand));
  console.log("generated_from.household.presence:", JSON.stringify(row.generated_from?.household?.presence));
  console.log("generated_from.issues:", JSON.stringify(row.generated_from?.issues));
  await Deno.writeTextFile(
    new URL(`./l3h_${label}_row_20260812.json`, import.meta.url),
    JSON.stringify(row, null, 2),
  );
}
