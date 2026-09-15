/**
 * L2 · D14 — le générateur en HTTP réel.
 *
 *   deno run -A --env-file=supabase/.env scratchpad/l2p_gen_20260812.ts baseline
 *   deno run -A --env-file=supabase/.env scratchpad/l2p_gen_20260812.ts fullyaway
 *   deno run -A --env-file=supabase/.env scratchpad/l2p_gen_20260812.ts absent
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
const step = Deno.args[0] ?? "baseline";

const WINDOW = { kind: "days", count: 2 } as const; // aujourd'hui mer + jeu

async function clearAllAway() {
  for (const id of Object.values(s.members)) {
    await rpcAs(s.owner, "keel_household_set_member_away", { p_member: id, p_away: [] });
  }
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
}

async function showRoster(label: string) {
  const { data } = await db.rpc("keel_household_roster_for", { p_user: s.owner.userId });
  console.log(`\n  ── roster (${label}) ──`);
  for (const r of (data ?? []) as any[]) {
    console.log(`    ${r.first_name.padEnd(6)} away=${JSON.stringify(r.away_days)}`);
  }
}

async function readPlan(mealId: string) {
  const { data } = await db
    .from("student_generated_meals")
    .select("id, servings, starts_on, duration_days, retired_at, generated_from, dishes")
    .eq("id", mealId)
    .maybeSingle();
  return data as any;
}

// ═══════════════════════════════════════════════════════════════════════════
if (step === "baseline") {
  console.log("\n══ RUN A — LE FOYER SANS AUCUNE ABSENCE (point 8) ══");
  await clearAllAway();
  await showRoster("aucune absence");
  const res = await callFn(s.owner, "generate-household-meal-v1", {
    mode: "to_shop",
    intent: "prepare_next",
    window: WINDOW,
  });
  console.log(`\n  HTTP ${res.status} en ${res.ms} ms`);
  if (res.status !== 200) {
    fail("run A", JSON.stringify(res.json).slice(0, 500));
    Deno.exit(1);
  }
  const mealId = res.json.meal.id as string;
  s.planA = mealId;
  await saveState(s);
  const row = await readPlan(mealId);
  console.log(`  plan ${mealId} · starts_on=${row.starts_on} durée=${row.duration_days}`);
  console.log(`  servings EN BASE = ${row.servings}`);
  console.log(`  generated_from.household.presence = ${JSON.stringify(row.generated_from.household.presence)}`);
  console.log(`  prompt_version = ${row.generated_from.prompt_version}`);
  console.log(`  member_count = ${row.generated_from.household.member_count}`);
  if (row.servings === 4) pass("servings = members.length = 4 (comportement d'avant le lot)");
  else fail("servings", `attendu 4, obtenu ${row.servings}`);
  const p = row.generated_from.household.presence;
  if (Array.isArray(p.members) && p.members.length === 0 && p.deserted.length === 0 && p.servings === 4) {
    pass("trace de présence VIDE quand personne ne manque", JSON.stringify(p));
  } else {
    fail("trace de présence", JSON.stringify(p));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
if (step === "fullyaway") {
  console.log("\n══ GARDE — TOUTES LES BOUCHES ABSENTES SUR TOUTE LA FENÊTRE (point 5) ══");
  await clearAllAway();
  for (const [name, id] of Object.entries(s.members)) {
    const r = await rpcAs(s.owner, "keel_household_set_member_away", {
      p_member: id,
      p_away: [{ day: "wed" }, { day: "thu" }],
    });
    info(`marque ${name}`, JSON.stringify(r.body));
  }
  await showRoster("tout le monde parti");
  const res = await callFn(s.owner, "generate-household-meal-v1", {
    mode: "to_shop",
    intent: "prepare_next",
    window: WINDOW,
  });
  console.log(`\n  HTTP ${res.status} en ${res.ms} ms`);
  console.log(`  corps = ${JSON.stringify(res.json)}`);
  if (res.status === 409 && res.json?.error === "window_fully_away") {
    pass("refus NOMMÉ window_fully_away", `${res.ms} ms — aucun appel modèle`);
  } else {
    fail("window_fully_away", `${res.status} ${JSON.stringify(res.json).slice(0, 300)}`);
  }
  // Et le cas qui PASSE, à un cheveu: on rend UNE bouche présente.
  console.log("\n  ── le même appel, une seule bouche rendue présente ──");
  await rpcAs(s.owner, "keel_household_set_member_away", {
    p_member: s.members.Tom,
    p_away: [{ day: "wed", slots: ["lunch", "dinner"] }, { day: "thu" }],
  });
  info("Tom n'est plus absent qu'au petit-déjeuner de mercredi", "");
  const { data: probe } = await db.rpc("keel_household_roster_for", { p_user: s.owner.userId });
  console.log(`  roster = ${JSON.stringify((probe ?? []).map((r: any) => [r.first_name, r.away_days]))}`);
}

// ═══════════════════════════════════════════════════════════════════════════
if (step === "absent") {
  console.log("\n══ RUN B — UNE BOUCHE ABSENTE (points 4 et 6) ══");
  await clearAllAway();
  // 1. Le MAÎTRE se déclare absent LUI-MÊME, par son « about you » — c'est
  //    exactement la donnée qui, avant ce lot, supprimait le repas de tout le
  //    monde.
  {
    const r = await restAs(s.owner, `student_goals?user_id=eq.${s.owner.userId}`, {
      method: "PATCH",
      prefer: "return=representation",
      body: {
        practical_constraints: {
          eating_rhythm: ["breakfast", "lunch", "dinner"],
          cooking_time_minutes: 40,
          away_days: [{ day: "wed" }, { day: "thu" }],
        },
      },
    });
    info("Paul (maître) se déclare absent mer+jeu", JSON.stringify((r.body as any[])[0]?.practical_constraints?.away_days));
  }
  // 2. Le maître marque Lea, bouche SANS COMPTE, absente jeudi midi.
  {
    const r = await rpcAs(s.owner, "keel_household_set_member_away", {
      p_member: s.members.Lea,
      p_away: [{ day: "thu", slots: ["lunch"] }],
    });
    info("le maître marque Lea absente jeudi midi", JSON.stringify(r.body));
  }
  await showRoster("Paul mer+jeu, Lea jeudi midi");

  const res = await callFn(s.owner, "generate-household-meal-v1", {
    mode: "to_shop",
    intent: "replace_current",
    replaces: s.planA,
    window: WINDOW,
  });
  console.log(`\n  HTTP ${res.status} en ${res.ms} ms`);
  if (res.status !== 200) {
    fail("run B", JSON.stringify(res.json).slice(0, 600));
    Deno.exit(1);
  }
  const mealId = res.json.meal.id as string;
  s.planB = mealId;
  await saveState(s);
  const row = await readPlan(mealId);
  console.log(`  plan ${mealId} · starts_on=${row.starts_on} durée=${row.duration_days}`);
  console.log(`  servings EN BASE = ${row.servings}`);
  console.log(`  prompt_version = ${row.generated_from.prompt_version}`);
  console.log(`  presence = ${JSON.stringify(row.generated_from.household.presence, null, 2)}`);
  console.log(`  plats = ${(row.dishes ?? []).length}`);
  if (row.servings === 3) pass("servings a BAISSÉ: 4 → 3");
  else fail("servings", `attendu 3, obtenu ${row.servings}`);
  if ((row.dishes ?? []).length > 0) pass("le repas EXISTE toujours (arbitrage C)", `${row.dishes.length} plats`);
  else fail("arbitrage C", "aucun plat");
  const p = row.generated_from.household.presence;
  const paul = (p.members ?? []).find((m: any) => m.member_id === s.ownerMemberId);
  const lea = (p.members ?? []).find((m: any) => m.member_id === s.members.Lea);
  if (paul && paul.self.length === 2 && paul.household.length === 0) {
    pass("la trace nomme Paul, source `self`", JSON.stringify(paul));
  } else fail("trace Paul", JSON.stringify(paul));
  if (lea && lea.household.length === 1 && lea.self.length === 0) {
    pass("la trace nomme Lea, source `household`", JSON.stringify(lea));
  } else fail("trace Lea", JSON.stringify(lea));
  if ((p.deserted ?? []).length === 0) pass("aucun créneau déserté: aucun repas supprimé");
  else fail("deserted", JSON.stringify(p.deserted));
  if (String(row.generated_from.prompt_version).includes("+household.v2_presence")) {
    pass("prompt_version porte +household.v2_presence", row.generated_from.prompt_version);
  } else fail("prompt_version", row.generated_from.prompt_version);
}
