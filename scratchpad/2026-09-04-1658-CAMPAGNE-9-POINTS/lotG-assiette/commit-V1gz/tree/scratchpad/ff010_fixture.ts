/**
 * FF-010 — LE DÉCOR, ET IL EST ÉCRIT DANS LA FORME DE LA PRODUCTION.
 *
 * ⚠️ LE PIÈGE QUE CE FICHIER ÉVITE. La fixture du run précédent
 * (`scratchpad/chat_qa_household.ts`) écrivait `preparations[].cookOn` et
 * `member_portions[].userId/displayName/portionNote` — du camelCase. Or la
 * PRODUCTION écrit `cook_on` / `user_id` / `display_name` / `portion_note`
 * (`mealPreparationsPayload`, `memberPortionsPayload` dans
 * `_shared/keel/meal_generation.ts` et `_shared/keel/household_portions.ts`).
 * Un décor qui ment sur la forme de la donnée cache exactement le défaut qu'on
 * cherche. Ici tout passe par `write_student_meal_plan` — la MÊME RPC que
 * `generate-household-meal-v1` — avec les MÊMES clés.
 *
 * Quatre décors:
 *   FAM  family de 3 (Ana propriétaire, Marc, Léo mineur) — plan 7 jours
 *   SHR  shared de 2 (Rob propriétaire, Sam)               — plan 3 jours
 *   solo aucun foyer
 *   BIG  family de 6, riche (doctrine + protocole + plan + 7 jours de
 *        préparations + liste de courses) — le pire cas de budget du chantier
 *
 * usage: deno run -A scratchpad/ff010_fixture.ts
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

const db = admin();

// ---------------------------------------------------------------------------
// L'HORLOGE — la date LOCALE de l'élève, jamais celle du serveur.
//
// Le runtime résout `local_date` dans le fuseau de l'élève. Une fixture qui
// prend `getUTCDay()` à 23 h UTC écrit le plat de la VEILLE: le plan existe, et
// aucun plat ne couvre « aujourd'hui ». Mesuré au run précédent.
// ---------------------------------------------------------------------------
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

const PARIS = "Europe/Paris";
const LONDON = "Europe/London";
const parisToday = localDateIn(PARIS);
const londonToday = localDateIn(LONDON);

// ---------------------------------------------------------------------------
// LA FORME DE PRODUCTION, à la clé près
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
    servings_made: 4,
    ingredients: [],
    method: "",
    active_minutes: 20,
    total_minutes: 40,
    // ⚠️ `cook_on`, PAS `cookOn`. C'est ce que la production écrit.
    cook_on: cookOn,
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
      generated_from: { prompt_version: "ff010-fixture" },
    },
  });
  if (error) throw new Error(`write_student_meal_plan: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { meal_id: string };
  return String(row.meal_id);
}

async function makeHousehold(
  kind: "family" | "shared",
  name: string,
  ownerId: string,
  memberIds: string[],
): Promise<string> {
  const { data, error } = await db.from("households").insert({
    kind,
    name,
    created_by: ownerId,
  } as never).select("id").maybeSingle();
  if (error) throw new Error(`households(${name}): ${error.message}`);
  const householdId = String((data as { id: string }).id);
  const rows = [
    { household_id: householdId, user_id: ownerId, role: "owner" },
    ...memberIds.map((id) => ({
      household_id: householdId,
      user_id: id,
      role: "member",
    })),
  ];
  const { error: mErr } = await db.from("household_members").insert(rows as never);
  if (mErr) throw new Error(`household_members(${name}): ${mErr.message}`);
  return householdId;
}

async function publishDoctrine(coach: Coach) {
  const { error } = await db.from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    beliefs: [{ claim: "Every meal is built on a protein anchor." }],
    forbidden: [{
      token: "calorie counting",
      surfaceForms: ["counting calories", "compter les calories"],
      reason: "it turns eating into accounting",
      instead: "build the plate around the protein anchor",
    }],
    vocabulary: [],
    arbitrations: [],
    foods: { discouraged: [] },
    qa: [],
    voice: { address: "tu", length: "short", emojis: "none", language: "en" },
    content_locale: "en",
    published_at: new Date().toISOString(),
    published_by: coach.userId,
  } as never);
  if (error) throw new Error(`coach_doctrines: ${error.message}`);
}

async function setGoal(userId: string, goal: string) {
  const { error } = await db.from("student_goals").upsert({
    user_id: userId,
    goal,
    situation: "I cook at home most nights.",
    content_locale: "en",
  } as never, { onConflict: "user_id" });
  if (error) throw new Error(`student_goals: ${error.message}`);
}

function pack(s: Student) {
  return {
    userId: s.userId,
    email: s.email,
    accessToken: s.accessToken,
    refreshToken: s.refreshToken,
  };
}

// ===========================================================================
// FAM — famille de 3, dont un mineur. Fuseau Paris.
// ===========================================================================
const nadia = await makeCoach({ displayName: "Nadia", country: "FR" });
await publishDoctrine(nadia);

const ana = await makeStudent({
  coach: nadia,
  fullName: "Ana Ferrand",
  country: "FR",
  locale: "en-US",
  timezone: PARIS,
});
const marc = await makeStudent({
  coach: nadia,
  fullName: "Marc Ferrand",
  country: "FR",
  locale: "en-US",
  timezone: PARIS,
});
const leo = await makeStudent({
  coach: nadia,
  fullName: "Leo Ferrand",
  country: "FR",
  locale: "en-US",
  timezone: PARIS,
});
// LE MINEUR — `keel_household_is_minor` DÉRIVE, il ne lit pas un booléen.
{
  const { error } = await db.from("profiles")
    .update({ birth_date: shift(parisToday, -365 * 11) } as never)
    .eq("id", leo.userId);
  if (error) throw new Error(`profiles(leo.birth_date): ${error.message}`);
}
for (const s of [ana, marc]) await setGoal(s.userId, "fat_loss");
for (const s of [ana, marc, leo]) await publishPlanFor(nadia, s.userId, { timezone: PARIS });

const famId = await makeHousehold("family", "ff010 Ferrand", ana.userId, [
  marc.userId,
  leo.userId,
]);

// Le plan du foyer: fenêtre de 7 jours qui COUVRE aujourd'hui (démarrée avant-hier).
const famStart = shift(parisToday, -2);
const famDishes = [
  dish("Roast chicken, brown rice and green beans", "dinner", tokenOf(parisToday)),
  dish("Tomato and white bean salad", "lunch", tokenOf(parisToday)),
  dish("Lentil soup", "dinner", tokenOf(shift(parisToday, 1))),
  dish("Baked cod with potatoes", "dinner", tokenOf(shift(parisToday, 2))),
];
// SEPT JOURS DE PRÉPARATIONS, dans l'ordre du plan (donc PAS aujourd'hui en
// tête): c'est exactement ce qui teste « jour courant d'abord ».
const famPreps = [
  prep("p_soup", "Cook the lentils", tokenOf(shift(parisToday, 1))),
  prep("p_cod", "Marinate the cod", tokenOf(shift(parisToday, 2))),
  prep("p_chicken", "Roast the chicken thighs", tokenOf(parisToday)),
  prep("p_beans", "Soak the white beans", tokenOf(shift(parisToday, -1))),
  prep("p_stock", "Make the vegetable stock", tokenOf(shift(parisToday, 3))),
];
const famPortions = [
  portion(ana.userId, "Ana", "full protein share, smaller starch share"),
  portion(marc.userId, "Marc", "larger protein and starch share"),
  portion(leo.userId, "Leo", "child-size share of the same dish"),
];
const famPlanId = await writeMealPlan({
  composerId: ana.userId,
  householdId: famId,
  startsOn: famStart,
  durationDays: 7,
  servings: 3,
  dishes: famDishes,
  preparations: famPreps,
  memberPortions: famPortions,
  shoppingList: [
    { term: "chicken thighs", quantity: "1.2 kg", aisle: "butcher" },
    { term: "brown rice", quantity: "500 g", aisle: "dry goods" },
    { term: "green beans", quantity: "800 g", aisle: "produce" },
  ],
});

// LA RESTRICTION QUI VISE LE MINEUR, posée par le compte maître.
{
  const { error } = await db.from("household_food_restrictions").insert({
    household_id: famId,
    member_user_id: leo.userId,
    label: "Nutella",
    created_by: ana.userId,
  } as never);
  if (error) throw new Error(`household_food_restrictions: ${error.message}`);
}

// ===========================================================================
// SHR — colocation de 2 + une personne SANS foyer. Fuseau Londres.
// ===========================================================================
const owen = await makeCoach({ displayName: "Owen", country: "GB" });
await publishDoctrine(owen);

const rob = await makeStudent({
  coach: owen,
  fullName: "Rob Kane",
  country: "GB",
  locale: "en-US",
  timezone: LONDON,
});
const sam = await makeStudent({
  coach: owen,
  fullName: "Sam Odell",
  country: "GB",
  locale: "en-US",
  timezone: LONDON,
});
const solo = await makeStudent({
  coach: owen,
  fullName: "Solo Vance",
  country: "GB",
  locale: "en-US",
  timezone: LONDON,
});
for (const s of [rob, sam, solo]) await setGoal(s.userId, "muscle_gain");
for (const s of [rob, sam, solo]) await publishPlanFor(owen, s.userId, { timezone: LONDON });

const shrId = await makeHousehold("shared", "ff010 Flat 3B", rob.userId, [sam.userId]);
const shrPlanId = await writeMealPlan({
  composerId: rob.userId,
  householdId: shrId,
  startsOn: shift(londonToday, -1),
  durationDays: 3,
  servings: 2,
  dishes: [
    dish("Sheet-pan sausages and peppers", "dinner", tokenOf(londonToday)),
    dish("Chickpea curry", "dinner", tokenOf(shift(londonToday, 1))),
  ],
  preparations: [prep("p_curry", "Cook the chickpeas", tokenOf(londonToday))],
  memberPortions: [
    portion(rob.userId, "Rob", "larger protein and starch share"),
    // LA DONNÉE QU'UN COLOCATAIRE NE DOIT JAMAIS VOIR.
    portion(sam.userId, "Sam", "half the starch, double the greens"),
  ],
});

// ===========================================================================
// BIG — foyer de 6 avec 7 jours de préparations. L'ÉLÈVE RICHE.
// ===========================================================================
const rae = await makeCoach({ displayName: "Rae", country: "GB" });
await publishDoctrine(rae);

const { data: protoRow, error: protoErr } = await db.from("coach_protocols")
  .insert({
    coach_id: rae.coachId,
    version: 1,
    status: "published",
    content_locale: "en",
    published_at: new Date().toISOString(),
    published_by: rae.userId,
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
      coach_id: rae.coachId,
    })) as never,
  );
  if (error) throw new Error(`coach_food_rules: ${error.message}`);
  const { error: tErr } = await db.from("coach_timing_rules").insert([{
    protocol_id: protocolId,
    coach_id: rae.coachId,
    template: "group_at_slot",
    food_group_ref: "eggs",
    slot_key: "breakfast",
    goal_scope: [],
    rationale: "protein first thing",
  }] as never);
  if (tErr) throw new Error(`coach_timing_rules: ${tErr.message}`);
}

const rich = await makeStudent({
  coach: rae,
  fullName: "Rich Alvarez",
  country: "GB",
  locale: "en-US",
  timezone: LONDON,
});
await setGoal(rich.userId, "recomposition");
await publishPlanFor(rae, rich.userId, { timezone: LONDON });

// CINQ CO-MEMBRES sans compte KEEL: le roster lit `profiles`, pas `coach_clients`.
const fillers: Array<{ userId: string; name: string; minor: boolean }> = [];
for (const [i, name] of ["Bea", "Cleo", "Dan", "Eli", "Fay"].entries()) {
  const account = await signUpAccount("ff010-filler");
  const patch: Record<string, unknown> = {
    full_name: `${name} Alvarez`,
    timezone: LONDON,
    locale: "en-US",
  };
  // Deux enfants à table.
  const minor = i >= 3;
  if (minor) patch.birth_date = shift(londonToday, -365 * (8 + i));
  const { error } = await db.from("profiles").update(patch as never).eq("id", account.userId);
  if (error) throw new Error(`profiles(${name}): ${error.message}`);
  fillers.push({ userId: account.userId, name, minor });
}

const bigId = await makeHousehold(
  "family",
  "ff010 Alvarez",
  rich.userId,
  fillers.map((f) => f.userId),
);

// SEPT JOURS: 14 plats, 12 préparations, 24 lignes de courses. Le pire cas.
const bigStart = shift(londonToday, -3);
const bigDishes: unknown[] = [];
const bigPreps: unknown[] = [];
for (let d = 0; d < 7; d++) {
  const date = shift(bigStart, d);
  const tok = tokenOf(date);
  bigDishes.push(dish(`Day ${d + 1} lunch: seared salmon, quinoa and greens`, "lunch", tok));
  bigDishes.push(
    dish(`Day ${d + 1} dinner: slow-braised beef with root vegetables`, "dinner", tok),
  );
  bigPreps.push(prep(`p_${d}_a`, `Batch ${d + 1}: braise the beef shoulder`, tok));
  if (d % 2 === 0) {
    bigPreps.push(prep(`p_${d}_b`, `Batch ${d + 1}: roast the root vegetables`, tok));
  }
}
const bigPortions = [
  portion(rich.userId, "Rich", "full protein share, moderate starch, generous vegetables"),
  ...fillers.map((f, i) =>
    portion(
      f.userId,
      f.name,
      f.minor ? "child-size share of the same dish" : `serving note ${i + 1}`,
    )
  ),
];
const bigPlanId = await writeMealPlan({
  composerId: rich.userId,
  householdId: bigId,
  startsOn: bigStart,
  durationDays: 7,
  servings: 6,
  dishes: bigDishes,
  preparations: bigPreps,
  memberPortions: bigPortions,
  shoppingList: Array.from({ length: 24 }, (_, i) => ({
    term: `shopping item ${i + 1}`,
    quantity: `${i + 1} units`,
    aisle: "produce",
  })),
});

const out = {
  today: { paris: parisToday, london: londonToday },
  coaches: {
    nadia: { coachId: nadia.coachId, userId: nadia.userId },
    owen: { coachId: owen.coachId, userId: owen.userId },
    rae: { coachId: rae.coachId, userId: rae.userId, protocolId },
  },
  households: {
    fam: { id: famId, kind: "family", planId: famPlanId, timezone: PARIS },
    shr: { id: shrId, kind: "shared", planId: shrPlanId, timezone: LONDON },
    big: {
      id: bigId,
      kind: "family",
      planId: bigPlanId,
      timezone: LONDON,
      fillers,
    },
  },
  students: {
    ana: pack(ana),
    marc: pack(marc),
    leo: pack(leo),
    rob: pack(rob),
    sam: pack(sam),
    solo: pack(solo),
    rich: pack(rich),
  },
  weekStart: mondayOf(new Date()),
};
await Deno.writeTextFile(
  new URL("./ff010_fixture.json", import.meta.url),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
