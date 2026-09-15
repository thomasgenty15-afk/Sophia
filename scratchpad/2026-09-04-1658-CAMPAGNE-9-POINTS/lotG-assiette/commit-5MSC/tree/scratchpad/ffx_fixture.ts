/**
 * PASSE TRANSVERSE — LE DÉCOR DE L'ÉLÈVE QUI PORTE TOUT EN MÊME TEMPS.
 *
 * ── CE QU'IL FABRIQUE, ET POURQUOI CHAQUE PIÈCE EST LÀ ─────────────────────
 * Un seul élève, `rich`, qui doit déclencher SIMULTANÉMENT les cinq matières
 * ajoutées cette nuit au même prompt:
 *
 *   FF-023  historique récent   → 20 tours réels joués APRÈS ce script
 *   FF-016  bloc protocole      → `coach_protocols` publié + 5 règles + 1 timing
 *   FF-010  bloc foyer          → foyer de SIX, 7 jours, 14 plats, 12 preps, 24 courses
 *   FF-011  soutien groundé     → un fait du JOUR (repas hors plan, tour réel)
 *   FF-027  signal de faim      → 2 jours de faim dans la fenêtre de 7
 *
 * plus la doctrine du coach (l'interdit `count calories`, qui est la SONDE de
 * survie du bloc doctrine) et un bilan hebdo GELÉ par son écrivain de
 * production (`computeAndStoreWeekReview`).
 *
 * ── LA FORME DE LA PRODUCTION, À LA CLÉ PRÈS (T-15) ────────────────────────
 * Les clés du plan de foyer sont recopiées de `ff010_fixture.ts`, qui a payé la
 * leçon: la production écrit `cook_on` / `user_id` / `display_name` /
 * `portion_note`, jamais du camelCase. Tout passe par `write_student_meal_plan`
 * — la MÊME RPC que `generate-household-meal-v1`.
 *
 * Aucune ligne n'est fabriquée à la main quand un écrivain de production
 * existe: le bilan hebdo par `computeAndStoreWeekReview`, la faim par
 * `writeHungerReport`, le plan par la RPC, le lien coach par le harnais.
 *
 * usage:
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     deno run -A scratchpad/ffx_fixture.ts
 */
import {
  admin,
  type Coach,
  makeCoach,
  makeStudent,
  mondayOf,
  publishPlanFor,
  signUpAccount,
  type Student,
} from "../docs/nutrition-pivot/qa-web/harness.ts";
import { writeHungerReport } from "../supabase/functions/_shared/keel/hunger_signal_io.ts";
import { computeAndStoreWeekReview } from "../supabase/functions/_shared/keel/week_review_io.ts";

const db = admin();
const LONDON = "Europe/London";
const TOKENS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function localDateIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function shift(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function tokenOf(isoDate: string): string {
  return TOKENS[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
}

const today = localDateIn(LONDON);

// ---------------------------------------------------------------------------
// LA FORME DE PRODUCTION (recopiée de ff010_fixture.ts, T-15)
// ---------------------------------------------------------------------------
function dish(title: string, slot: string, day: string) {
  return {
    title,
    slot,
    day,
    ingredients: [],
    method: "",
    why: "",
    honours_belief_keys: [],
    uses: [],
  };
}
function prep(id: string, title: string, cookOn: string) {
  return {
    id,
    title,
    servings_made: 6,
    ingredients: [],
    method: "",
    active_minutes: 25,
    total_minutes: 55,
    cook_on: cookOn, // ⚠️ `cook_on`, PAS `cookOn`.
  };
}
function portion(userId: string, displayName: string, note: string | null) {
  return {
    user_id: userId,
    display_name: displayName,
    portion_note: note,
    preparation_shares: [],
  };
}

async function writeMealPlan(args: {
  composerId: string;
  householdId: string | null;
  startsOn: string;
  durationDays: number;
  servings: number;
  dishes: unknown[];
  preparations: unknown[];
  memberPortions: unknown[];
  shoppingList?: unknown[];
}): Promise<string> {
  const { data, error } = await db.rpc("write_student_meal_plan", {
    p_user_id: args.composerId,
    p_intent: "prepare_next",
    p_starts_on: args.startsOn,
    p_duration_days: args.durationDays,
    p_payload: {
      mode: "to_shop",
      meal_slot: null,
      servings: args.servings,
      context: null,
      preferences: null,
      pantry: [],
      dishes: args.dishes,
      preparations: args.preparations,
      cooking_sessions: [],
      shopping_list: args.shoppingList ?? [],
      content_locale: "en",
      household_id: args.householdId,
      member_portions: args.memberPortions,
      generated_from: { prompt_version: "ffx-transverse-fixture" },
    },
  });
  if (error) throw new Error(`write_student_meal_plan: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { meal_id: string };
  return String(row.meal_id);
}

async function makeHousehold(
  name: string,
  ownerId: string,
  memberIds: string[],
): Promise<string> {
  const { data, error } = await db.from("households").insert({
    kind: "family",
    name,
    created_by: ownerId,
  } as never).select("id").maybeSingle();
  if (error) throw new Error(`households(${name}): ${error.message}`);
  const householdId = String((data as { id: string }).id);
  const { error: mErr } = await db.from("household_members").insert([
    { household_id: householdId, user_id: ownerId, role: "owner" },
    ...memberIds.map((id) => ({
      household_id: householdId,
      user_id: id,
      role: "member",
    })),
  ] as never);
  if (mErr) throw new Error(`household_members: ${mErr.message}`);
  return householdId;
}

// ---------------------------------------------------------------------------
// LE COACH — doctrine PUBLIÉE avec son interdit, et protocole PUBLIÉ.
//
// L'interdit `count calories` n'est pas décoratif: c'est la SONDE de survie du
// bloc doctrine sous troncature. Si le bloc saute, « je devrais compter mes
// calories ? » reçoit un oui.
// ---------------------------------------------------------------------------
const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
{
  const { error } = await db.from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    beliefs: [
      { claim: "Every meal is built on a protein anchor.", rationale: null },
      { claim: "Vegetables are the volume of the plate, not the garnish.", rationale: null },
    ],
    forbidden: [{
      token: "count_calories",
      surface_forms: ["count calories", "counting calories", "compter les calories"],
      reason: "numbers turn food into a score",
      instead: "We build the plate: a protein anchor, vegetables for volume.",
    }],
    vocabulary: [{ term: "anchor meal", meaning: "the protein base of a plate" }],
    arbitrations: [],
    foods: { recommended: [], discouraged: [] },
    qa: [],
    voice: { address: "tu", length: "short", emojis: "none", language: "en" },
    content_locale: "en",
    published_at: new Date().toISOString(),
    published_by: coach.userId,
  } as never);
  if (error) throw new Error(`coach_doctrines: ${error.message}`);
}

const { data: protoRow, error: protoErr } = await db.from("coach_protocols")
  .insert({
    coach_id: coach.coachId,
    version: 1,
    status: "published",
    content_locale: "en",
    published_at: new Date().toISOString(),
    published_by: coach.userId,
  } as never).select("id").maybeSingle();
if (protoErr) throw new Error(`coach_protocols: ${protoErr.message}`);
const protocolId = String((protoRow as { id: string }).id);
{
  const rules = [
    { food_group_ref: "eggs", stance: "encouraged", rationale: "cheapest complete protein there is" },
    { food_group_ref: "leafy_greens", stance: "encouraged", rationale: "volume on the plate" },
    { food_group_ref: "lean_protein", stance: "encouraged", rationale: null },
    { food_group_ref: "refined_grain", stance: "discouraged", rationale: "spikes then crashes" },
    { food_group_ref: "fried_food", stance: "excluded", rationale: null },
  ];
  const { error } = await db.from("coach_food_rules").insert(
    rules.map((r) => ({
      ...r,
      goal_scope: [],
      protocol_id: protocolId,
      coach_id: coach.coachId,
    })) as never,
  );
  if (error) throw new Error(`coach_food_rules: ${error.message}`);
  const { error: tErr } = await db.from("coach_timing_rules").insert([{
    protocol_id: protocolId,
    coach_id: coach.coachId,
    template: "group_at_slot",
    food_group_ref: "eggs",
    slot_key: "breakfast",
    goal_scope: [],
    rationale: "protein first thing",
  }] as never);
  if (tErr) throw new Error(`coach_timing_rules: ${tErr.message}`);
}

// ---------------------------------------------------------------------------
// L'ÉLÈVE RICHE
// ---------------------------------------------------------------------------
const rich: Student = await makeStudent({
  coach,
  fullName: "Rich Alvarez",
  country: "GB",
  locale: "en-US", // ÉCRITE explicitement (profiles.locale défaut = fr-FR)
  timezone: LONDON,
});
{
  const { error } = await db.from("student_goals").upsert({
    user_id: rich.userId,
    goal: "recomposition",
    situation: "I cook for the whole family most nights.",
    content_locale: "en",
  } as never, { onConflict: "user_id" });
  if (error) throw new Error(`student_goals: ${error.message}`);
}
const planVersionId = await publishPlanFor(coach, rich.userId, { timezone: LONDON });

// CINQ CO-MEMBRES sans compte KEEL: le roster lit `profiles`, pas `coach_clients`
// (donc le plafond de 3 élèves par coach n'est pas touché).
const fillers: Array<{ userId: string; name: string; minor: boolean }> = [];
for (const [i, name] of ["Bea", "Cleo", "Dan", "Eli", "Fay"].entries()) {
  const account = await signUpAccount("ffx-filler");
  const patch: Record<string, unknown> = {
    full_name: `${name} Alvarez`,
    timezone: LONDON,
    locale: "en-US",
  };
  const minor = i >= 3;
  if (minor) patch.birth_date = shift(today, -365 * (8 + i));
  const { error } = await db.from("profiles").update(patch as never).eq(
    "id",
    account.userId,
  );
  if (error) throw new Error(`profiles(${name}): ${error.message}`);
  fillers.push({ userId: account.userId, name, minor });
}

const householdId = await makeHousehold(
  "ffx Alvarez",
  rich.userId,
  fillers.map((f) => f.userId),
);

// SEPT JOURS: 14 plats, 12 préparations, 24 lignes de courses. Le pire cas
// nommé par FF-010 §9.
const bigStart = shift(today, -3);
const dishes: unknown[] = [];
const preps: unknown[] = [];
for (let d = 0; d < 7; d++) {
  const date = shift(bigStart, d);
  const tok = tokenOf(date);
  dishes.push(dish(`Day ${d + 1} lunch: seared salmon, quinoa and greens`, "lunch", tok));
  dishes.push(
    dish(`Day ${d + 1} dinner: slow-braised beef with root vegetables`, "dinner", tok),
  );
  preps.push(prep(`p_${d}_a`, `Batch ${d + 1}: braise the beef shoulder`, tok));
  if (d % 2 === 0) {
    preps.push(prep(`p_${d}_b`, `Batch ${d + 1}: roast the root vegetables`, tok));
  }
}
const mealId = await writeMealPlan({
  composerId: rich.userId,
  householdId,
  startsOn: bigStart,
  durationDays: 7,
  servings: 6,
  dishes,
  preparations: preps,
  memberPortions: [
    portion(rich.userId, "Rich", "full protein share, moderate starch, generous vegetables"),
    ...fillers.map((f, i) =>
      portion(
        f.userId,
        f.name,
        f.minor ? "child-size share of the same dish" : `serving note ${i + 1}`,
      )
    ),
  ],
  shoppingList: Array.from({ length: 24 }, (_, i) => ({
    term: `shopping item ${i + 1}`,
    quantity: `${i + 1} units`,
    aisle: "produce",
  })),
});

// ---------------------------------------------------------------------------
// FF-027 — DEUX JOURS DE FAIM DANS LA FENÊTRE DE SEPT (seuil de récurrence = 2).
// Écrivain de PRODUCTION (`writeHungerReport`), avec sa date locale explicite:
// le 3e jour arrivera par un TOUR RÉEL, ce qui exerce `detectHungerReport`.
// ---------------------------------------------------------------------------
for (const daysAgo of [2, 4]) {
  await writeHungerReport(db, {
    userId: rich.userId,
    localDate: shift(today, -daysAgo),
    matched: "still hungry after dinner",
    studentNote: "I finished dinner and I was still hungry an hour later.",
    contentLocale: "en",
  });
}

// ---------------------------------------------------------------------------
// LE BILAN HEBDO DE LA SEMAINE DERNIÈRE — gelé par son écrivain de production.
// Des faits d'abord, sinon `week_facts` n'a rien à porter.
// ---------------------------------------------------------------------------
const lastMonday = shift(mondayOf(new Date()), -7);
const lastSunday = shift(lastMonday, 6);
{
  const events = [];
  for (let d = 0; d < 5; d++) {
    // ⚠️ PAS de `plan_version_id`: la colonne N'EXISTE PAS sur
    // `protocol_events` (23 colonnes relues en `psql`). Premier faux départ de
    // ma propre sonde — T-15, et il a été trouvé par la base, pas par un test.
    events.push({
      user_id: rich.userId,
      occurred_at: new Date(`${shift(lastMonday, d)}T12:30:00Z`).toISOString(),
      local_date: shift(lastMonday, d),
      source: "chat",
      slot_key: "lunch",
      food_group_ref: "lean_protein",
      student_note: "chicken and greens at lunch",
      content_locale: "en",
    });
  }
  const { error } = await db.from("protocol_events").insert(events as never);
  if (error) throw new Error(`protocol_events(semaine passée): ${error.message}`);
}
const review = await computeAndStoreWeekReview(db, {
  userId: rich.userId,
  weekStart: lastMonday,
  weekEnd: lastSunday,
  contentLocale: "en",
  now: new Date(),
});

const out = {
  today,
  timezone: LONDON,
  coach: { coachId: coach.coachId, userId: coach.userId, protocolId },
  student: {
    userId: rich.userId,
    email: rich.email,
    accessToken: rich.accessToken,
    refreshToken: rich.refreshToken,
  },
  household: { id: householdId, mealId, fillers },
  planVersionId,
  weekReview: { weekStart: lastMonday, weekEnd: lastSunday, outcome: review.outcome },
};
await Deno.writeTextFile(
  new URL("./ffx_fixture.json", import.meta.url),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
