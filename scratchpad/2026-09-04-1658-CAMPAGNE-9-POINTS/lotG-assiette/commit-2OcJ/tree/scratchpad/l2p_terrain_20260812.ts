/**
 * L2 · D14 — LE TERRAIN. Comptes par HTTP, foyer par les VRAIES RPC.
 *
 * deno run -A --env-file=supabase/.env scratchpad/l2p_terrain_20260812.ts
 */
import {
  type Account,
  admin,
  callFn,
  fail,
  info,
  pass,
  rpcAs,
  restAs,
  saveState,
  signUp,
  type State,
} from "./l2p_lib_20260812.ts";

const db = admin();

// ── 1. LE COACH, ET SA DOCTRINE PUBLIÉE ───────────────────────────────────
console.log("\n▶ 1. Le coach");
const coachAcc = await signUp("coach");
const coachRes = await callFn(coachAcc, "coach-signup-v1", {
  display_name: "Marlow",
  country: "GB",
});
if (coachRes.status !== 200 || !coachRes.json?.coach?.id) {
  throw new Error(`coach-signup-v1 ${coachRes.status}: ${JSON.stringify(coachRes.json)}`);
}
const coachId = coachRes.json.coach.id as string;
pass("coach-signup-v1", `coach_id=${coachId}`);

const { error: docErr } = await db.from("coach_doctrines").insert({
  coach_id: coachId,
  version: 1,
  beliefs: [
    {
      key: "protein_anchor",
      claim: "Every plate is built on a protein anchor.",
      reason: "It is what makes a meal hold until the next one.",
      instead: "Start from the protein, then add vegetables for volume.",
    },
  ],
  forbidden: [],
  vocabulary: [{ term: "anchor", meaning: "the protein base of a plate" }],
  arbitrations: [],
  voice: { tone: "Direct, warm, never preachy." },
  foods: { recommended: [], discouraged: [] },
  qa: [],
  content_locale: "en",
  published_at: new Date().toISOString(),
  published_by: coachAcc.userId,
} as never);
if (docErr) throw new Error(`coach_doctrines: ${docErr.message}`);
pass("doctrine publiée", "version 1, en");

// ── 2. LE MAÎTRE ──────────────────────────────────────────────────────────
console.log("\n▶ 2. Le maître du foyer");
const owner = await signUp("owner");
{
  const { error } = await db.from("profiles").update({
    keel_role: "student",
    full_name: "Paul Vidal",
    timezone: "Europe/Paris",
    country: "FR",
    locale: "en-GB",
    proactive_muted_at: null,
    deletion_requested_at: null,
  } as never).eq("id", owner.userId);
  if (error) throw new Error(`profil maître: ${error.message}`);
}
{
  const { error } = await db.from("coach_clients").insert({
    coach_id: coachId,
    student_user_id: owner.userId,
    invited_email: owner.email,
    status: "active",
    consent_granted_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
  } as never);
  if (error) throw new Error(`coach_clients: ${error.message}`);
}
// L'« about you » du maître, écrit SOUS SON PROPRE JWT (RLS owner_all).
{
  const r = await restAs(owner, "student_goals", {
    method: "POST",
    prefer: "return=representation",
    body: {
      user_id: owner.userId,
      goal: "health",
      situation: "Works from home, cooks for the whole family every evening.",
      content_locale: "en-GB",
      practical_constraints: {
        eating_rhythm: ["breakfast", "lunch", "dinner"],
        cooking_time_minutes: 40,
      },
    },
  });
  if (r.status >= 300) throw new Error(`student_goals maître: ${r.status} ${JSON.stringify(r.body)}`);
}
pass("maître", `${owner.email} (${owner.userId})`);

// ── 3. LE FOYER, PAR LES VRAIES RPC ───────────────────────────────────────
console.log("\n▶ 3. Le foyer");
const create = await rpcAs(owner, "keel_household_create", { p_name: "Vidal" });
const createBody = create.body as any;
if (!createBody?.ok) throw new Error(`keel_household_create: ${JSON.stringify(createBody)}`);
const householdId = createBody.household_id as string;
const ownerMemberId = createBody.member_id as string;
pass("keel_household_create", `household=${householdId}`);

const members: Record<string, string> = { Paul: ownerMemberId };
for (const m of [
  { name: "Lea", birth: "2018-04-02", goal: null },
  { name: "Tom", birth: "2014-09-15", goal: null },
  { name: "Nina", birth: "1992-02-20", goal: "health" },
]) {
  const r = await rpcAs(owner, "keel_household_add_member", {
    p_first_name: m.name,
    p_birth_date: m.birth,
    p_goal: m.goal,
  });
  const b = r.body as any;
  if (!b?.ok) throw new Error(`add_member ${m.name}: ${JSON.stringify(b)}`);
  members[m.name] = b.member_id as string;
  pass("keel_household_add_member", `${m.name} → ${b.member_id}`);
}

// ── 4. NINA RÉCLAME SON PROFIL (invitation + jonction réelles) ────────────
console.log("\n▶ 4. La bouche AVEC un compte");
const nina = await signUp("nina");
{
  const { error } = await db.from("profiles").update({
    keel_role: "student",
    full_name: "Nina Vidal",
    timezone: "Europe/Paris",
    country: "FR",
    locale: "en-GB",
  } as never).eq("id", nina.userId);
  if (error) throw new Error(`profil nina: ${error.message}`);
}
const inv = await rpcAs(owner, "keel_household_invite", {
  p_email: nina.email,
  p_member: members.Nina,
});
const invBody = inv.body as any;
if (!invBody?.ok) throw new Error(`keel_household_invite: ${JSON.stringify(invBody)}`);
pass("keel_household_invite", `pour ${invBody.first_name} <${invBody.email}>`);

const join = await rpcAs(nina, "keel_household_join", {
  p_token: invBody.token,
  p_country: "FR",
});
const joinBody = join.body as any;
if (!joinBody?.ok) throw new Error(`keel_household_join: ${JSON.stringify(joinBody)}`);
pass("keel_household_join", JSON.stringify(joinBody));

// L'« about you » de Nina, sous SON JWT — c'est la source `self` du point 3.
{
  const r = await restAs(nina, "student_goals", {
    method: "POST",
    prefer: "return=representation",
    body: {
      user_id: nina.userId,
      goal: "health",
      situation: "Nurse, three night shifts a week.",
      content_locale: "en-GB",
      practical_constraints: {},
    },
  });
  if (r.status >= 300) throw new Error(`student_goals nina: ${r.status} ${JSON.stringify(r.body)}`);
}
pass("student_goals de Nina", "posé sous son propre JWT");

// ── 5. LA COUVERTURE ──────────────────────────────────────────────────────
console.log("\n▶ 5. La couverture (L1)");
const cov = await rpcAs(null, "keel_household_is_covered", { p_household: householdId });
info("keel_household_is_covered", String(cov.body));
if (cov.body !== true) fail("couverture", "le foyer n'est pas couvert");
else pass("couverture", "free_until dans le futur");

const state: State = {
  coachId,
  owner,
  nina,
  householdId,
  members,
  ninaMemberId: members.Nina,
  ownerMemberId,
};
await saveState(state);
console.log("\n▶ état écrit dans scratchpad/l2p_state_20260812.json");
console.log(JSON.stringify(
  { householdId, owner: owner.userId, nina: nina.userId, members },
  null,
  2,
));
