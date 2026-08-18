// L8-B — le RUN RÉEL de la lane foyer, sur la fixture de cible posée par le
// vérificateur. Usage: deno run -A scratchpad/l8b_run_20260818.ts <label> <intent> <starts_on> <days>
import { admin, signIn, callFn, info } from "./l3h_lib_20260812.ts";

const HH = "4123e479-f62a-4a3c-912e-5c7cb5c1f15a";
const OWNER = "l2p-owner-1786493429016cdbc78@test.dev";
const label = Deno.args[0] ?? "run";
const intent = Deno.args[1] ?? "prepare_next";
const startsOn = Deno.args[2] ?? "2026-08-31";
const days = Number(Deno.args[3] ?? 3);

const owner = await signIn(OWNER);
const body: Record<string, unknown> = { window: { kind: "exact", starts_on: startsOn, duration_days: days }, intent };
if (Deno.args[4]) body.replaces = Deno.args[4];
info("POST generate-household-meal-v1", JSON.stringify(body));
const res = await callFn(owner, "generate-household-meal-v1", body);
console.log(`HTTP ${res.status} in ${res.ms}ms`);

const trace = res.json?.trace ?? res.json?.household ?? null;
console.log("box_sizing =", JSON.stringify(res.json?.household?.box_sizing ?? trace?.box_sizing ?? null));
await Deno.writeTextFile(
  new URL(`./l8b_${label}_result_20260818.json`, import.meta.url),
  JSON.stringify({ status: res.status, ms: res.ms, json: res.json }, null, 2),
);
if (res.status !== 200) {
  console.log(JSON.stringify(res.json).slice(0, 1500));
  Deno.exit(1);
}
const a = admin();
const q = await a.from("student_generated_meals")
  .select("id, plan_kind, starts_on, duration_days, generated_from, retired_at, created_at")
  .eq("household_id", HH).eq("plan_kind", "household")
  .order("created_at", { ascending: false }).limit(1);
if (q.error) throw q.error;
const row = q.data?.[0] as any;
console.log("PLAN", row?.id, "version =", row?.generated_from?.prompt_version);
console.log("box_sizing (base) =", JSON.stringify(row?.generated_from?.household?.box_sizing ?? row?.generated_from?.box_sizing ?? null));
console.log("boxes (base) =", JSON.stringify(row?.generated_from?.household?.boxes ?? null));
