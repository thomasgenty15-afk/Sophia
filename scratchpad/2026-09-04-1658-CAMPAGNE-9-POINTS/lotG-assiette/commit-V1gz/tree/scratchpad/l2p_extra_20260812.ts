/**
 * L2 · D14 — sondes complémentaires: portes du roster, sémantique de fusion,
 * échec ouvert.
 *
 * deno run -A --env-file=supabase/.env scratchpad/l2p_extra_20260812.ts
 */
import {
  admin,
  FAILURES,
  fail,
  info,
  loadState,
  pass,
  restAs,
  rpcAs,
} from "./l2p_lib_20260812.ts";
import {
  parseMemberAway,
  resolveWindowPresence,
} from "../supabase/functions/_shared/keel/household_presence.ts";
import { DEFAULT_EATING_RHYTHM } from "../supabase/functions/_shared/keel/meal_generation.ts";

const s = await loadState();
const db = admin();

console.log("\n══ LES PORTES DU ROSTER ══");
{
  const r = await rpcAs(s.nina, "keel_household_roster_for", { p_user: s.owner.userId });
  if (r.status >= 400) pass("`keel_household_roster_for` refusée à `authenticated`", `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  else fail("roster_for ouverte à authenticated", JSON.stringify(r.body).slice(0, 200));
}
{
  const r = await rpcAs(s.nina, "keel_household_roster", {});
  const rows = r.body as any[];
  const hasAway = Array.isArray(rows) && rows.every((x) => Array.isArray(x.away_days));
  if (r.status === 200 && rows.length === 4 && hasAway) {
    pass("`keel_household_roster()` sous le JWT d'un NON-maître rend les absences", JSON.stringify(rows.map((x) => [x.first_name, x.away_days])));
  } else {
    fail("roster()", `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  }
}

console.log("\n══ LA FUSION: journée entière contre créneau ══");
// Nina déclare « jeudi midi » chez elle; le maître marque « jeudi » entier.
await restAs(s.nina, `student_goals?user_id=eq.${s.nina.userId}`, {
  method: "PATCH",
  body: { practical_constraints: { away_days: [{ day: "thu", slots: ["lunch"] }] } },
});
await rpcAs(s.owner, "keel_household_set_member_away", {
  p_member: s.ninaMemberId,
  p_away: [{ day: "thu" }],
});
{
  const { data } = await db.rpc("keel_household_roster_for", { p_user: s.owner.userId });
  const nina = (data as any[]).find((r) => r.member_id === s.ninaMemberId);
  const parsed = parseMemberAway(nina.away_days);
  console.log(`  · roster = ${JSON.stringify(nina.away_days)}`);
  console.log(`  · effective = ${JSON.stringify(parsed.effective)}`);
  const eff = parsed.effective;
  if (eff.length === 1 && eff[0].day === "thu" && eff[0].slots.length === 0) {
    pass("la journée entière GAGNE sur le créneau (union, pas intersection)", JSON.stringify(eff));
  } else {
    fail("fusion journée/créneau", JSON.stringify(eff));
  }
}

console.log("\n══ L'ÉCHEC OUVERT (arbitrage E) ══");
{
  const { data } = await db.rpc("keel_household_roster_for", { p_user: s.owner.userId });
  const members = (data as any[]).map((r) => ({
    memberId: r.member_id,
    displayName: r.first_name,
    away: parseMemberAway(r.away_days),
  }));
  const noRhythm = resolveWindowPresence({ members, rhythm: [], windowDays: ["wed", "thu"] });
  const noWindow = resolveWindowPresence({ members, rhythm: DEFAULT_EATING_RHYTHM, windowDays: [] });
  const noMembers = resolveWindowPresence({ members: [], rhythm: DEFAULT_EATING_RHYTHM, windowDays: ["wed"] });
  for (const [label, p] of [["rythme vide", noRhythm], ["fenêtre vide", noWindow], ["foyer vide", noMembers]] as const) {
    const ok = p.fullyAway === false && p.householdAway.length === 0 && p.block === "";
    if (ok) pass(`${label} → tout le monde à table`, `servings=${p.servings} fullyAway=${p.fullyAway}`);
    else fail(`${label}`, JSON.stringify(p));
  }
}

console.log("\n══ LA CONSTANTE DE PLAFOND (42 = 7 × 6) ══");
{
  const ok = Array.from({ length: 42 }, () => ({ day: "mon" }));
  const r = await rpcAs(s.owner, "keel_household_set_member_away", {
    p_member: s.members.Tom,
    p_away: ok,
  });
  info("42 entrées", JSON.stringify(r.body));
  await rpcAs(s.owner, "keel_household_set_member_away", { p_member: s.members.Tom, p_away: [] });
}

console.log(`\n══ ${FAILURES.length} échec(s) ══ ${FAILURES.join(" | ")}`);
