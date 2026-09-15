/**
 * L2 · D14 — points 1 (RPC sous vrai JWT), 2 (privilège de colonne),
 * 3 (l'UNION) et 7 (la tolérance). Aucun appel modèle.
 *
 * deno run -A --env-file=supabase/.env scratchpad/l2p_points_1237_20260812.ts
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
import { parseMemberAway } from "../supabase/functions/_shared/keel/household_presence.ts";

const s = await loadState();
const db = admin();

async function roster(): Promise<Array<Record<string, any>>> {
  const { data, error } = await db.rpc("keel_household_roster_for", {
    p_user: s.owner.userId,
  });
  if (error) throw new Error(`roster: ${error.message}`);
  return (data ?? []) as Array<Record<string, any>>;
}
async function rawAway(memberId: string): Promise<unknown> {
  const { data } = await db.from("household_members").select("away_days").eq(
    "member_id",
    memberId,
  ).maybeSingle();
  return (data as any)?.away_days;
}

// ═════════════════════════════════════════════════════════════════════════
console.log("\n══ POINT 2 — LE PRIVILÈGE DE COLONNE (avant toute écriture) ══");
{
  const { data } = await db.rpc("exec_sql_probe" as never, {} as never).then(
    () => ({ data: null }),
    () => ({ data: null }),
  );
  void data;
}
// La vérité de privilège se lit en SQL: on passe par une vue PostgREST? Non —
// `psql` est fait pour ça, et c'est le script shell qui l'imprime. Ici on
// PROUVE le comportement: une écriture DIRECTE sous un vrai JWT.
{
  const r = await restAs(s.owner, `household_members?member_id=eq.${s.members.Lea}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: { away_days: [{ day: "mon" }] },
  });
  const after = await rawAway(s.members.Lea);
  if (r.status < 300 && JSON.stringify(after) !== "[]") {
    fail(
      "écriture directe de away_days par `authenticated`",
      `HTTP ${r.status} — la colonne a bougé: ${JSON.stringify(after)}`,
    );
  } else {
    pass(
      "écriture directe REFUSÉE (PATCH PostgREST, JWT du maître)",
      `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 160)} · colonne=${JSON.stringify(after)}`,
    );
  }
}
{
  // La LECTURE, elle, doit marcher: l'écran doit montrer ce qui est marqué.
  const r = await restAs(
    s.owner,
    `household_members?household_id=eq.${s.householdId}&select=first_name,away_days`,
  );
  const ok = r.status === 200 && Array.isArray(r.body) && (r.body as any[]).length === 4;
  if (ok) pass("lecture de away_days par `authenticated`", JSON.stringify(r.body));
  else fail("lecture de away_days", `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
}

// ═════════════════════════════════════════════════════════════════════════
console.log("\n══ POINT 1 — LA RPC SOUS UN VRAI JWT ══");

// 1a. Le maître marque une bouche SANS COMPTE.
{
  const r = await rpcAs(s.owner, "keel_household_set_member_away", {
    p_member: s.members.Lea,
    p_away: [{ day: "sat", slots: ["lunch"] }],
  });
  const b = r.body as any;
  const stored = await rawAway(s.members.Lea);
  if (b?.ok === true && JSON.stringify(stored) === JSON.stringify([{ day: "sat", slots: ["lunch"] }])) {
    pass("maître marque Lea (sans compte)", `${JSON.stringify(b)} · base=${JSON.stringify(stored)}`);
  } else {
    fail("maître marque Lea", `${JSON.stringify(b)} · base=${JSON.stringify(stored)}`);
  }
}

// 1b. Un NON-MAÎTRE vise la ligne de quelqu'un d'autre.
{
  const before = await rawAway(s.members.Tom);
  const r = await rpcAs(s.nina, "keel_household_set_member_away", {
    p_member: s.members.Tom,
    p_away: [{ day: "sun" }],
  });
  const b = r.body as any;
  const after = await rawAway(s.members.Tom);
  if (b?.ok === false && b?.reason === "not_your_line" && JSON.stringify(before) === JSON.stringify(after)) {
    pass("non-maître refusé, motif NOMMÉ", `${JSON.stringify(b)} · Tom inchangé=${JSON.stringify(after)}`);
  } else {
    fail("non-maître refusé", `${JSON.stringify(b)} · avant=${JSON.stringify(before)} après=${JSON.stringify(after)}`);
  }
}

// 1c. Un non-maître SUR SA PROPRE LIGNE: permis (arbitrage B).
{
  const r = await rpcAs(s.nina, "keel_household_set_member_away", {
    p_member: s.ninaMemberId,
    p_away: [{ day: "wed", slots: ["breakfast"] }],
  });
  const b = r.body as any;
  const stored = await rawAway(s.ninaMemberId);
  if (b?.ok === true) pass("non-maître sur SA ligne: permis", `${JSON.stringify(b)} · base=${JSON.stringify(stored)}`);
  else fail("non-maître sur sa ligne", JSON.stringify(b));
  // on remet à zéro pour le point 3
  await rpcAs(s.nina, "keel_household_set_member_away", { p_member: s.ninaMemberId, p_away: [] });
}

// 1d. SERVICE_ROLE: auth.uid() est NULL — la RPC ne teste plus rien.
{
  const r = await rpcAs(null, "keel_household_set_member_away", {
    p_member: s.members.Lea,
    p_away: [{ day: "mon" }],
  });
  const b = r.body as any;
  if (b?.ok === false && b?.reason === "not_authenticated") {
    pass("service_role → not_authenticated", `${JSON.stringify(b)} (auth.uid() NULL: tester ainsi ne testerait rien)`);
  } else {
    fail("service_role", JSON.stringify(b));
  }
}

// 1e. La FORME est refusée: `bad_away`.
{
  const r = await rpcAs(s.owner, "keel_household_set_member_away", {
    p_member: s.members.Tom,
    p_away: { day: "mon" },
  });
  const b = r.body as any;
  if (b?.ok === false && b?.reason === "bad_away") pass("objet au lieu d'un tableau → bad_away", JSON.stringify(b));
  else fail("bad_away", JSON.stringify(b));
}
{
  const big = Array.from({ length: 43 }, () => ({ day: "mon" }));
  const r = await rpcAs(s.owner, "keel_household_set_member_away", {
    p_member: s.members.Tom,
    p_away: big,
  });
  const b = r.body as any;
  if (b?.ok === false && b?.reason === "bad_away") pass("43 entrées → bad_away", JSON.stringify(b));
  else fail("plafond 42", JSON.stringify(b));
}

// 1f. Une bouche d'un AUTRE foyer.
{
  const r = await rpcAs(s.owner, "keel_household_set_member_away", {
    p_member: "00000000-0000-0000-0000-000000000000",
    p_away: [],
  });
  const b = r.body as any;
  if (b?.ok === false && b?.reason === "not_a_member") pass("membre étranger → not_a_member", JSON.stringify(b));
  else fail("not_a_member", JSON.stringify(b));
}

// ═════════════════════════════════════════════════════════════════════════
console.log("\n══ POINT 3 — L'UNION EST RÉELLE (arbitrage B) ══");
// Nina déclare LUNDI SOIR chez elle; le maître marque VENDREDI sur sa ligne.
{
  const r = await restAs(s.nina, `student_goals?user_id=eq.${s.nina.userId}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: {
      practical_constraints: { away_days: [{ day: "mon", slots: ["dinner"] }] },
    },
  });
  if (r.status >= 300) fail("Nina déclare son absence", `HTTP ${r.status} ${JSON.stringify(r.body)}`);
  else info("Nina déclare (student_goals, son JWT)", JSON.stringify((r.body as any[])[0]?.practical_constraints));
}
{
  const r = await rpcAs(s.owner, "keel_household_set_member_away", {
    p_member: s.ninaMemberId,
    p_away: [{ day: "fri" }],
  });
  info("le maître marque (household_members)", JSON.stringify(r.body));
}
{
  const rows = await roster();
  const nina = rows.find((r) => r.member_id === s.ninaMemberId)!;
  console.log(`  · roster.away_days = ${JSON.stringify(nina.away_days)}`);
  const arr = nina.away_days as any[];
  const bySource = Object.fromEntries(arr.map((e) => [e.source, e.day]));
  const ok = arr.length === 2 && bySource.self === "mon" && bySource.household === "fri";
  if (ok) pass("l'UNION rend les DEUX, chacune taguée", JSON.stringify(bySource));
  else fail("l'UNION", JSON.stringify(arr));

  const parsed = parseMemberAway(nina.away_days);
  console.log(`  · parseMemberAway → ${JSON.stringify(parsed)}`);
  if (parsed.effective.length === 2 && parsed.self.length === 1 && parsed.household.length === 1) {
    pass("parseMemberAway sépare les trois vues", "");
  } else {
    fail("parseMemberAway", JSON.stringify(parsed));
  }
}
// La source ne se FALSIFIE pas: un client qui range `source:"self"` se le fait
// écraser. (L'écriture passe par la RPC, la seule porte.)
{
  await rpcAs(s.owner, "keel_household_set_member_away", {
    p_member: s.members.Tom,
    p_away: [{ day: "tue", source: "self" }],
  });
  const rows = await roster();
  const tom = rows.find((r) => r.member_id === s.members.Tom)!;
  const src = (tom.away_days as any[])[0]?.source;
  if (src === "household") pass("source falsifiée écrasée", JSON.stringify(tom.away_days));
  else fail("source falsifiée", JSON.stringify(tom.away_days));
  await rpcAs(s.owner, "keel_household_set_member_away", { p_member: s.members.Tom, p_away: [] });
}

// ═════════════════════════════════════════════════════════════════════════
console.log("\n══ POINT 7 — LA TOLÉRANCE (arbitrage A) ══");
{
  const payload = [
    { day: "lunedi", slots: ["lunch"] },
    { day: "sat", slots: ["dinner"] },
    { day: "sun" },
  ];
  const r = await rpcAs(s.owner, "keel_household_set_member_away", {
    p_member: s.members.Lea,
    p_away: payload,
  });
  const b = r.body as any;
  if (b?.ok !== true) fail("écriture avec jeton inconnu", JSON.stringify(b));
  else pass("l'écriture ACCEPTE (le contenu n'est pas refusé)", JSON.stringify(b));

  const stored = await rawAway(s.members.Lea);
  console.log(`  · base = ${JSON.stringify(stored)}`);

  const rows = await roster();
  const lea = rows.find((r) => r.member_id === s.members.Lea)!;
  const parsed = parseMemberAway(lea.away_days);
  console.log(`  · roster = ${JSON.stringify(lea.away_days)}`);
  console.log(`  · parseMemberAway.effective = ${JSON.stringify(parsed.effective)}`);
  const days = parsed.effective.map((d) => d.day).sort();
  const dropped = !days.includes("lunedi") && !days.includes("mon");
  const kept = days.includes("sat") && days.includes("sun") && parsed.effective.length === 2;
  if (dropped && kept) {
    pass("`lunedi` ÉCARTÉ, jamais deviné; les voisines gardées", JSON.stringify(parsed.effective));
  } else {
    fail("tolérance", `days=${JSON.stringify(days)}`);
  }
  await rpcAs(s.owner, "keel_household_set_member_away", { p_member: s.members.Lea, p_away: [] });
  await rpcAs(s.owner, "keel_household_set_member_away", { p_member: s.ninaMemberId, p_away: [] });
  await restAs(s.nina, `student_goals?user_id=eq.${s.nina.userId}`, {
    method: "PATCH",
    body: { practical_constraints: {} },
  });
}

console.log(`\n══ ${FAILURES.length} échec(s) ══ ${FAILURES.join(" | ")}`);
