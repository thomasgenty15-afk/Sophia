/**
 * L2 · D14 — le CAS QUI PASSE à un cheveu du refus, en HTTP réel.
 * Trois bouches parties toute la fenêtre, une seule présente à UN créneau.
 * C'est le seul chemin qui met `presence.householdAway` (les créneaux
 * désertés) dans le prompt ET dans le parseur.
 *
 * deno run -A --env-file=supabase/.env scratchpad/l2p_edge_20260812.ts
 */
import {
  admin,
  callFn,
  fail,
  info,
  loadState,
  pass,
  restAs,
  rpcAs,
  saveState,
} from "./l2p_lib_20260812.ts";

const s = await loadState();
const db = admin();

// remise à plat
await restAs(s.owner, `student_goals?user_id=eq.${s.owner.userId}`, {
  method: "PATCH",
  body: {
    practical_constraints: {
      eating_rhythm: ["breakfast", "lunch", "dinner"],
      cooking_time_minutes: 40,
    },
  },
});
await restAs(s.nina, `student_goals?user_id=eq.${s.nina.userId}`, {
  method: "PATCH",
  body: { practical_constraints: {} },
});
for (const [name, id] of Object.entries(s.members)) {
  const away = name === "Tom"
    ? [{ day: "wed", slots: ["lunch", "dinner"] }, { day: "thu" }]
    : [{ day: "wed" }, { day: "thu" }];
  await rpcAs(s.owner, "keel_household_set_member_away", { p_member: id, p_away: away });
}
const { data: roster } = await db.rpc("keel_household_roster_for", { p_user: s.owner.userId });
console.log("\n── roster ──");
for (const r of roster as any[]) console.log(`   ${r.first_name.padEnd(6)} ${JSON.stringify(r.away_days)}`);

const res = await callFn(s.owner, "generate-household-meal-v1", {
  mode: "to_shop",
  intent: "replace_current",
  replaces: s.planB,
  window: { kind: "days", count: 2 },
});
console.log(`\n  HTTP ${res.status} en ${res.ms} ms`);
if (res.status !== 200) {
  fail("le cas qui passe", JSON.stringify(res.json).slice(0, 400));
  Deno.exit(1);
}
pass("la garde NE MORD PAS quand une seule bouche reste", `HTTP 200, ${res.ms} ms`);
const { data: row } = await db.from("student_generated_meals")
  .select("id, servings, dishes, generated_from")
  .eq("id", res.json.meal.id).maybeSingle();
const r = row as any;
(s as any).planC = r.id;
await saveState(s);
console.log(`  servings = ${r.servings}`);
console.log(`  presence.deserted = ${JSON.stringify(r.generated_from.household.presence.deserted)}`);
console.log(`  presence.membres absents = ${r.generated_from.household.presence.members.length}`);
console.log(`  plats = ${JSON.stringify((r.dishes ?? []).map((d: any) => `${d.day}/${d.slot}`))}`);
console.log(`  issues = ${JSON.stringify(r.generated_from.issues)}`);
if (r.servings === 1) pass("servings = 1 (le moment le plus peuplé n'a qu'une bouche)");
else fail("servings", String(r.servings));
const deserted = r.generated_from.household.presence.deserted;
const ok = deserted.length === 2 &&
  deserted.find((d: any) => d.day === "wed")?.slots?.join(",") === "lunch,dinner" &&
  (deserted.find((d: any) => d.day === "thu")?.slots ?? []).length === 0;
if (ok) pass("les créneaux DÉSERTÉS sont archivés", JSON.stringify(deserted));
else fail("deserted", JSON.stringify(deserted));
const slots = (r.dishes ?? []).map((d: any) => `${d.day}/${d.slot}`);
if (slots.length > 0 && slots.every((x: string) => x === "wed/breakfast")) {
  pass("le plan ne porte QUE le seul moment habité", JSON.stringify(slots));
} else {
  fail("les moments désertés ont produit des plats", JSON.stringify(slots));
}
