/**
 * Fabrique / valide un plan PERSONNEL par les vraies RPC.
 *   deno run -A l3h_plan_20260812.ts write <who> <starts_on> <duration> <plan_kind>
 *   deno run -A l3h_plan_20260812.ts validate <who> <plan_id>
 *   deno run -A l3h_plan_20260812.ts retire <plan_id>
 *   deno run -A l3h_plan_20260812.ts roster
 */
import { admin, signIn, rpcAs, info } from "./l3h_lib_20260812.ts";

const state = JSON.parse(await Deno.readTextFile(new URL("./l3h_state_20260812.json", import.meta.url)));
const cmd = Deno.args[0];
const a = admin();

async function who(name: string) {
  const email = name === "owner" ? state.owner.email : state.nina.email;
  return await signIn(email);
}

if (cmd === "write") {
  const acc = await who(Deno.args[1]);
  const startsOn = Deno.args[2];
  const duration = Number(Deno.args[3]);
  const kind = Deno.args[4] ?? "personal";
  const res = await rpcAs(null, "write_student_meal_plan", {
    p_user_id: acc.userId,
    p_intent: "prepare_next",
    p_starts_on: startsOn,
    p_duration_days: duration,
    p_payload: {
      household_id: state.householdId,
      plan_kind: kind,
      mode: "to_shop",
      content_locale: "en",
      servings: 1,
      dishes: [{ title: "QA L3 placeholder", slot: "dinner", day: "mon", ingredients: [], method: "n/a" }],
      generated_from: { qa: "l3-hand-taken" },
    },
  });
  console.log("write_student_meal_plan", res.status, JSON.stringify(res.body));
} else if (cmd === "validate") {
  const acc = await who(Deno.args[1]);
  const planId = Deno.args[2];
  // ⚠️ sous le VRAI JWT: auth.uid() est NULL en service_role.
  const res = await rpcAs(acc, "keel_validate_meal_plan", { p_plan: planId });
  console.log("keel_validate_meal_plan (JWT)", res.status, JSON.stringify(res.body));
  const svc = await rpcAs(null, "keel_validate_meal_plan", { p_plan: planId });
  console.log("keel_validate_meal_plan (service_role, temoin)", svc.status, JSON.stringify(svc.body));
} else if (cmd === "retire") {
  const planId = Deno.args[1];
  const r = await a.from("student_generated_meals").update({ retired_at: new Date().toISOString() }).eq("id", planId).select("id, retired_at");
  console.log("retire", JSON.stringify(r.data ?? r.error));
} else if (cmd === "unvalidate") {
  const planId = Deno.args[1];
  const r = await a.from("student_generated_meals").update({ validated_at: null }).eq("id", planId).select("id, validated_at");
  console.log("unvalidate", JSON.stringify(r.data ?? r.error));
} else if (cmd === "kind") {
  const r = await a.from("student_generated_meals").update({ plan_kind: Deno.args[2] }).eq("id", Deno.args[1]).select("id, plan_kind");
  console.log("kind", JSON.stringify(r.data ?? r.error));
} else if (cmd === "roster") {
  const res = await rpcAs(null, "keel_household_roster_for", { p_user: state.owner.userId });
  for (const r of res.body as any[]) {
    console.log(`${r.first_name.padEnd(6)} role=${r.role.padEnd(6)} own_plans=${JSON.stringify(r.own_plans)}`);
  }
} else {
  console.log("cmd inconnue");
}
