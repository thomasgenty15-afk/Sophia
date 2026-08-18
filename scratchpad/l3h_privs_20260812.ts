/** Les privileges de la fonction qui a ete DROPPEE puis recreee. */
import { signIn, rpcAs, pass, fail, info, FAILURES, ANON, URL_BASE } from "./l3h_lib_20260812.ts";
const state = JSON.parse(await Deno.readTextFile(new URL("./l3h_state_20260812.json", import.meta.url)));
const nina = await signIn(state.nina.email);
const owner = await signIn(state.owner.email);

// 1. `_for` sous un VRAI JWT authenticated -> refus.
let r = await rpcAs(nina, "keel_household_roster_for", { p_user: owner.userId });
if (r.status === 403 || (r.body as any)?.code === "42501") {
  pass("_for refusee a `authenticated`", `${r.status} ${JSON.stringify(r.body)}`);
} else fail("_for accessible a un membre", `${r.status} ${JSON.stringify(r.body).slice(0,200)}`);

// 2. `_for` en anon -> refus.
const res = await fetch(`${URL_BASE}/rest/v1/rpc/keel_household_roster_for`, {
  method: "POST",
  headers: { "content-type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
  body: JSON.stringify({ p_user: owner.userId }),
});
const t = await res.text();
if (res.status !== 200) pass("_for refusee a `anon`", `${res.status} ${t.slice(0,120)}`);
else fail("_for accessible en anon", t.slice(0, 200));

// 3. Le roster du NAVIGATEUR: 7 colonnes, pas d'own_plans.
r = await rpcAs(nina, "keel_household_roster", {});
const rows = r.body as any[];
if (r.status !== 200 || !Array.isArray(rows) || rows.length === 0) {
  fail("roster navigateur illisible", `${r.status} ${JSON.stringify(r.body).slice(0,200)}`);
} else {
  const keys = Object.keys(rows[0]).sort().join(",");
  info("colonnes rendues au navigateur", keys);
  if (keys === "age_state,away_days,first_name,goal,member_id,role,user_id") {
    pass("le roster navigateur ne bouge pas d'un champ (pas d'own_plans)");
  } else fail("la forme du roster navigateur a change", keys);
}
console.log(FAILURES.length === 0 ? "PRIVILEGES: TOUT PASSE" : `PRIVILEGES ECHECS: ${FAILURES.join(" | ")}`);
