/** POINT 6 — L1 tient toujours: le gel refuse AVANT tout, et AVANT L3. */
import { admin, signIn, callFn, rpcAs, pass, fail, info, FAILURES } from "./l3h_lib_20260812.ts";

const state = JSON.parse(await Deno.readTextFile(new URL("./l3h_state_20260812.json", import.meta.url)));
const a = admin();
const owner = await signIn(state.owner.email);
const GOOD = { window: { kind: "exact", starts_on: "2026-08-17", duration_days: 3 }, intent: "prepare_next" };
const NOWINDOW = { intent: "prepare_next" };

async function covered() {
  const r = await rpcAs(null, "keel_household_is_covered", { p_household: state.householdId });
  return r.body;
}
async function setFreeUntil(v: string | null) {
  const r = await a.from("households").update({ free_until: v }).eq("id", state.householdId).select("id, free_until");
  if (r.error) throw r.error;
  return (r.data as any[])[0];
}
async function subs() {
  const r = await a.from("subscriptions").select("user_id, status, current_period_end").eq("user_id", owner.userId);
  return r.data;
}

console.log("== POINT 6 — LE GEL (L1) ==");
info("subscriptions du maitre", JSON.stringify(await subs()));
info("free_until avant", JSON.stringify(await setFreeUntil("2026-09-11")));
info("is_covered", JSON.stringify(await covered()));

// --- le cas qui PASSE d'abord: non gele, corps sans fenetre -> 400 window_required
let r = await callFn(owner, "generate-household-meal-v1", NOWINDOW);
if (r.status === 400 && r.json?.error === "window_required") {
  pass("NON GELE + corps sans fenetre -> 400 window_required", `${r.ms}ms`);
} else {
  fail("NON GELE: attendu 400 window_required", `${r.status} ${JSON.stringify(r.json).slice(0,200)} ${r.ms}ms`);
}

// --- on gele
info("free_until apres gel", JSON.stringify(await setFreeUntil("2026-08-01")));
info("is_covered", JSON.stringify(await covered()));

r = await callFn(owner, "generate-household-meal-v1", GOOD);
if (r.status === 402 && r.json?.error === "household_frozen") {
  pass("GELE + corps VALIDE -> 402 household_frozen", `${r.ms}ms`);
} else {
  fail("GELE: attendu 402 household_frozen", `${r.status} ${JSON.stringify(r.json).slice(0,200)} ${r.ms}ms`);
}
const frozenMs = r.ms;

// le meme corps SANS fenetre: si le gel est bien EN AMONT de tout L3, la
// reponse reste 402 et non 400 window_required.
r = await callFn(owner, "generate-household-meal-v1", NOWINDOW);
if (r.status === 402 && r.json?.error === "household_frozen") {
  pass("GELE + corps SANS fenetre -> 402 (le gel precede la fenetre, donc la prise de main)", `${r.ms}ms`);
} else {
  fail("GELE + sans fenetre: attendu 402", `${r.status} ${JSON.stringify(r.json).slice(0,200)}`);
}

// --- on degele et on reprouve le cas qui passe
info("free_until restaure", JSON.stringify(await setFreeUntil("2026-09-11")));
info("is_covered", JSON.stringify(await covered()));
r = await callFn(owner, "generate-household-meal-v1", NOWINDOW);
if (r.status === 400 && r.json?.error === "window_required") {
  pass("DEGELE -> 400 window_required de nouveau (le 402 venait bien du gel)", `${r.ms}ms`);
} else {
  fail("DEGELE: attendu 400 window_required", `${r.status} ${JSON.stringify(r.json).slice(0,200)}`);
}

console.log(`latence du refus gele: ${frozenMs}ms (une generation reelle mesuree ce soir: 19980ms / 36041ms)`);
console.log(FAILURES.length === 0 ? "POINT 6: TOUT PASSE" : `POINT 6 ECHECS: ${FAILURES.join(" | ")}`);
