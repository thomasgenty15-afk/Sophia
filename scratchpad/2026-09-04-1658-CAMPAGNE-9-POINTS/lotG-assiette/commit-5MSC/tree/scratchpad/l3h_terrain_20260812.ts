import { admin, signIn, rpcAs, info, pass, fail, FAILURES, STATE_FILE } from "./l3h_lib_20260812.ts";

const HOUSEHOLD = "4123e479-f62a-4a3c-912e-5c7cb5c1f15a";
const OWNER_EMAIL = "l2p-owner-1786493429016cdbc78@test.dev";
const NINA_EMAIL = "l2p-nina-17864934291934ee097@test.dev";

const a = admin();

console.log("== TERRAIN L3 ==");

const owner = await signIn(OWNER_EMAIL);
const nina = await signIn(NINA_EMAIL);
info("owner", `${owner.userId} ${owner.email}`);
info("nina", `${nina.userId} ${nina.email}`);

// 1. Snapshot des away_days avant reset (ce sont ceux de L2).
const before = await a.from("household_members")
  .select("member_id, first_name, role, user_id, away_days")
  .eq("household_id", HOUSEHOLD);
if (before.error) throw before.error;
console.log("away_days AVANT reset:", JSON.stringify(before.data));
await Deno.writeTextFile(
  new URL("./l3h_away_backup_20260812.json", import.meta.url),
  JSON.stringify(before.data, null, 2),
);

// 2. Reset a [] — L2 avait laisse des absences qui fausseraient les mesures.
const reset = await a.from("household_members")
  .update({ away_days: [] })
  .eq("household_id", HOUSEHOLD)
  .select("member_id, first_name, away_days");
if (reset.error) throw reset.error;
console.log("away_days APRES reset:", JSON.stringify(reset.data));

// 3. Verifier qu'aucun student_goals ne porte d'absence 'self'.
const goals = await a.from("student_goals")
  .select("user_id, goal, practical_constraints")
  .in("user_id", [owner.userId, nina.userId]);
if (goals.error) throw goals.error;
console.log("student_goals:", JSON.stringify(goals.data));

// 4. Le roster serveur, avec own_plans.
const roster = await rpcAs(null, "keel_household_roster_for", { p_user: owner.userId });
console.log("roster_for(owner) status", roster.status);
console.log(JSON.stringify(roster.body, null, 2));

const rows = roster.body as any[];
if (!Array.isArray(rows) || rows.length !== 4) {
  fail("roster 4 bouches", JSON.stringify(roster.body).slice(0, 200));
} else {
  pass("roster 4 bouches");
  for (const r of rows) {
    if (JSON.stringify(r.own_plans) !== "[]") {
      fail(`own_plans vide pour ${r.first_name}`, JSON.stringify(r.own_plans));
    }
    if (JSON.stringify(r.away_days) !== "[]") {
      fail(`away_days vide pour ${r.first_name}`, JSON.stringify(r.away_days));
    }
  }
  if (FAILURES.length === 0) pass("terrain neutre: own_plans=[] et away_days=[] pour les 4");
}

await Deno.writeTextFile(STATE_FILE, JSON.stringify({
  householdId: HOUSEHOLD,
  owner, nina,
  members: Object.fromEntries((before.data as any[]).map((m) => [m.first_name, m.member_id])),
}, null, 2));

console.log(FAILURES.length === 0 ? "TERRAIN OK" : `TERRAIN ECHECS: ${FAILURES.join(", ")}`);
