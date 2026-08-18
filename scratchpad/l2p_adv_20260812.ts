/**
 * L2 · D14 — sondes adverses: étanchéité entre foyers, entrées mal formées.
 * deno run -A --env-file=supabase/.env scratchpad/l2p_adv_20260812.ts
 */
import {
  admin,
  FAILURES,
  fail,
  info,
  loadState,
  pass,
  rpcAs,
  signUp,
} from "./l2p_lib_20260812.ts";
import { parseMemberAway } from "../supabase/functions/_shared/keel/household_presence.ts";

const s = await loadState();
const db = admin();

console.log("\n══ UN INCONNU, SANS FOYER ══");
const stranger = await signUp("stranger");
{
  const r = await rpcAs(stranger, "keel_household_set_member_away", {
    p_member: s.members.Lea,
    p_away: [{ day: "mon" }],
  });
  const b = r.body as any;
  if (b?.ok === false && b?.reason === "no_household") pass("sans foyer → no_household", JSON.stringify(b));
  else fail("no_household", JSON.stringify(b));
}

console.log("\n══ LE MAÎTRE D'UN AUTRE FOYER ══");
{
  await db.from("profiles").update({ full_name: "Otto Neben", keel_role: "student" } as never)
    .eq("id", stranger.userId);
  const c = await rpcAs(stranger, "keel_household_create", { p_name: "Neben" });
  const cb = c.body as any;
  if (!cb?.ok) throw new Error(JSON.stringify(cb));
  info("foyer voisin", cb.household_id);
  const r = await rpcAs(stranger, "keel_household_set_member_away", {
    p_member: s.members.Lea, // une VRAIE bouche, mais du foyer d'à côté
    p_away: [{ day: "mon" }],
  });
  const b = r.body as any;
  const { data: lea } = await db.from("household_members").select("away_days")
    .eq("member_id", s.members.Lea).maybeSingle();
  if (b?.ok === false && b?.reason === "not_a_member" && JSON.stringify((lea as any).away_days) !== JSON.stringify([{ day: "mon" }])) {
    pass("bouche d'un AUTRE foyer → not_a_member, ligne intacte", `${JSON.stringify(b)} · Lea=${JSON.stringify((lea as any).away_days)}`);
  } else {
    fail("étanchéité entre foyers", `${JSON.stringify(b)} · Lea=${JSON.stringify((lea as any).away_days)}`);
  }
  // nettoyage du foyer voisin
  await db.from("households").delete().eq("id", cb.household_id);
}

console.log("\n══ DES ENTRÉES QUI NE SONT PAS DES OBJETS ══");
{
  const r = await rpcAs(s.owner, "keel_household_set_member_away", {
    p_member: s.members.Tom,
    p_away: [1, "mon", null, { day: "sat" }],
  });
  info("écriture", JSON.stringify(r.body));
  const { data } = await db.rpc("keel_household_roster_for", { p_user: s.owner.userId });
  const tom = (data as any[]).find((x) => x.member_id === s.members.Tom);
  console.log(`  · roster = ${JSON.stringify(tom.away_days)}`);
  const parsed = parseMemberAway(tom.away_days);
  console.log(`  · effective = ${JSON.stringify(parsed.effective)}`);
  if (parsed.effective.length === 1 && parsed.effective[0].day === "sat") {
    pass("les entrées non-objets tombent, `sat` reste", JSON.stringify(parsed.effective));
  } else {
    fail("entrées mal formées", JSON.stringify(parsed));
  }
  if (parsed.household.length === 1) pass("les non-objets ne sont pas tagués `household`", JSON.stringify(parsed.household));
  else fail("tag des non-objets", JSON.stringify(parsed.household));
  await rpcAs(s.owner, "keel_household_set_member_away", { p_member: s.members.Tom, p_away: [] });
}

// L'inconnu est jeté à la fin (il n'a servi qu'à ces deux refus).
await db.from("household_members").delete().eq("user_id", stranger.userId);
await db.auth.admin.deleteUser(stranger.userId).catch(() => {});
console.log(`\n══ ${FAILURES.length} échec(s) ══ ${FAILURES.join(" | ")}`);
