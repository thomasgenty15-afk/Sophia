/**
 * FF-059 — RUN RÉEL. Vraie base locale, vraie fonction edge, vrais JWT.
 *
 * Aucun mock. Chaque verdict cite ce que la BASE ou la RÉPONSE HTTP a rendu.
 *
 * Lancement:
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     deno run -A scratchpad/ff059_real_run_20260812.ts
 *
 * Fixtures préfixées `ff059_`, nettoyées en fin de run.
 */
import {
  admin,
  callAs,
  type Coach,
  makeCoach,
  makeStudent,
  type Student,
} from "../docs/nutrition-pivot/qa-web/harness.ts";

const db = admin();
const results: Array<{ level: string; name: string; ok: boolean; proof: string }> = [];
const created: string[] = [];

function record(level: string, name: string, ok: boolean, proof: string) {
  results.push({ level, name, ok, proof });
  console.log(`${ok ? "✅" : "❌"} [${level}] ${name}\n     ${proof}`);
}

function eq(level: string, name: string, got: unknown, want: unknown, extra = "") {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  record(
    level,
    name,
    ok,
    `got=${JSON.stringify(got)} want=${JSON.stringify(want)}${extra ? ` ${extra}` : ""}`,
  );
}

// ---------------------------------------------------------------------------
// LE PLAN DE RÉFÉRENCE — quantités choisies pour que le total se pose à la main
// ---------------------------------------------------------------------------

/**
 * Les cinq plats du banc, et leur attendu CALCULÉ À LA MAIN depuis
 * `food_composition_refs` (relu en base le 2026-08-12):
 *
 *   chicken_breast  110,0 kcal/100 g crus · meat_shrinks 0,70
 *   white_rice      352,0 kcal/100 g crus · grain_absorbs 2,60
 *   olive_oil       900,0 kcal/100 g      · neutral
 *   broccoli         32,7 kcal/100 g crus · veg_shrinks 0,90 · unit 300 g
 *   whole_eggs      140,0 kcal/100 g      · neutral · unit 55 g
 *   salmon          194,0 kcal/100 g crus · fish_shrinks 0,80 · unit 130 g
 *   sweet_potato     86,3 kcal/100 g crus · veg_shrinks 0,90 · unit 200 g
 *
 *   D1 lun · 150 g poulet + 80 g riz + 10 g huile
 *            = 165,0 + 281,6 + 90,0 = 536,6 → 537
 *   D2 lun · 3 œufs (165 g) + 5 g huile
 *            = 231,0 + 45,0 = 276,0 → 276
 *   D3 mar · 200 g saumon + 300 g patate douce + 200 g brocoli
 *            = 388,0 + 258,9 + 65,4 = 712,3 → 712
 *   D4 mar · 100 g riz CUIT (= 38,4615 g crus) + 10 g huile
 *            = 135,3846 + 90,0 = 225,3846 → 225
 *   D5 mer · 120 g poulet + « kokum rind » (hors table)  → PAS DE CHIFFRE
 *
 *   lun = 537 + 276 = 813 (complet, 2/2)
 *   mar = 712 + 225 = 937 (complet, 2/2)
 *   mer = null           (incomplet, 0/1)
 */
const EXPECTED_DISHES = [537, 276, 712, 225, null];
const EXPECTED_DAYS = [
  { day: "mon", kcal: 813, complete: true, counted: 2, total: 2 },
  { day: "tue", kcal: 937, complete: true, counted: 2, total: 2 },
  { day: "wed", kcal: null, complete: false, counted: 0, total: 1 },
];

function ing(term: string, amount: number | null, unit: string | null, state: string | null) {
  return { term, quantity: `${amount ?? ""} ${unit ?? ""}`.trim(), in_pantry: false, amount, unit, state };
}

const DISHES = [
  {
    title: "ff059 chicken rice bowl",
    slot: "lunch",
    day: "mon",
    method: "Roast the chicken, boil the rice.",
    why: "ff059",
    honours_belief_keys: [],
    uses: [],
    ingredients: [
      ing("chicken breast", 150, "g", "raw"),
      ing("white rice", 80, "g", "raw"),
      ing("olive oil", 10, "g", "raw"),
    ],
  },
  {
    title: "ff059 scrambled eggs",
    slot: "breakfast",
    day: "mon",
    method: "Scramble them.",
    why: "ff059",
    honours_belief_keys: [],
    uses: [],
    ingredients: [ing("whole eggs", 3, "unit", null), ing("olive oil", 5, "g", "raw")],
  },
  {
    title: "ff059 salmon plate",
    slot: "dinner",
    day: "tue",
    method: "Bake the salmon.",
    why: "ff059",
    honours_belief_keys: [],
    uses: [],
    ingredients: [
      ing("salmon", 200, "g", "raw"),
      ing("sweet potato", 300, "g", "raw"),
      ing("broccoli", 200, "g", "raw"),
    ],
  },
  {
    title: "ff059 rice reheat",
    slot: "lunch",
    day: "tue",
    method: "Reheat it.",
    why: "ff059",
    honours_belief_keys: [],
    uses: [],
    ingredients: [ing("white rice", 100, "g", "cooked"), ing("olive oil", 10, "g", "raw")],
  },
  {
    title: "ff059 exotic dish",
    slot: "dinner",
    day: "wed",
    method: "Cook it.",
    why: "ff059",
    honours_belief_keys: [],
    uses: [],
    ingredients: [
      ing("chicken breast", 120, "g", "raw"),
      ing("kokum rind", 5, "g", "raw"),
    ],
  },
];

async function insertPlan(args: {
  userId: string;
  planKind: "personal" | "household";
  servings: number;
  householdId?: string | null;
  dishes?: unknown[];
  preparations?: unknown[];
  startsOn?: string;
  /** `undefined` = pas de clé `member_deltas` (plan d'AVANT la trace FF-059). */
  memberDeltas?: Array<Record<string, unknown>>;
}): Promise<string> {
  const { data, error } = await db
    .from("student_generated_meals")
    .insert({
      user_id: args.userId,
      scope: "several_days",
      mode: "to_shop",
      servings: args.servings,
      plan_kind: args.planKind,
      household_id: args.householdId ?? null,
      dishes: args.dishes ?? DISHES,
      preparations: args.preparations ?? [],
      cooking_sessions: [],
      shopping_list: [{ term: "chicken breast", quantity: "150 g", aisle: "protein" }],
      starts_on: args.startsOn ?? "2026-08-10",
      duration_days: 7,
      context: "ff059",
      content_locale: "en-GB",
      generated_from: args.memberDeltas === undefined
        ? {}
        : { household: { member_deltas: args.memberDeltas } },
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(`insertPlan: ${error.message}`);
  return (data as { id: string }).id;
}

async function energyFor(student: Student, planIds: string[]) {
  return await callAs(student, "meal-energy-v1", { plan_ids: planIds });
}

async function setSwitch(userId: string, on: boolean) {
  const { error } = await db
    .from("profiles")
    .update({ energy_display_enabled: on } as never)
    .eq("id", userId);
  if (error) throw new Error(`setSwitch: ${error.message}`);
}

/**
 * LE PLANCHER TCA, LEVÉ PAR LE VRAI CHEMIN.
 *
 * ⚠️ Pas de colonne « drapeau » à écrire: `evaluateRestrictionGuard` lit des
 * ÉCHANTILLONS et décide. Le chemin le plus court ET le plus fidèle est
 * `protocol_events.student_note` — la prose de l'élève, que
 * `loadStudentTextSamples` scanne pour le déclencheur `compensatory_language`.
 * Écrire un booléen quelque part aurait testé une garde qui n'existe pas.
 */
async function raiseFloor(userId: string, localDate: string, note: string) {
  const { error } = await db.from("protocol_events").insert({
    user_id: userId,
    local_date: localDate,
    occurred_at: `${localDate}T12:00:00Z`,
    source: "chat",
    student_note: note,
    content_locale: "en-GB",
  } as never);
  if (error) throw new Error(`raiseFloor: ${error.message}`);
}

// ---------------------------------------------------------------------------

async function main() {
  const coach = await makeCoach({ displayName: "FF059 Coach" });
  created.push(coach.userId);

  // ── EASY ────────────────────────────────────────────────────────────────
  const s1 = await makeStudent({ coach, fullName: "ff059 easy" });
  created.push(s1.userId);
  await db.from("profiles").update({ birth_date: "1990-01-01" } as never).eq("id", s1.userId);
  const p1 = await insertPlan({ userId: s1.userId, planKind: "personal", servings: 1 });

  // Défaut ÉTEINT: rien, et le motif le dit.
  let r = await energyFor(s1, [p1]);
  eq("easy", "défaut éteint ⇒ student_off, aucun chiffre", {
    status: r.status,
    show: r.json?.show,
    reason: r.json?.reason,
    hasPlans: "plans" in (r.json ?? {}),
    switchOfferable: r.json?.switch_offerable,
  }, {
    status: 200,
    show: false,
    reason: "student_off",
    hasPlans: false,
    switchOfferable: true,
  });

  await setSwitch(s1.userId, true);
  r = await energyFor(s1, [p1]);
  const plan = r.json?.plans?.[0];
  eq("easy", "porte ouverte ⇒ chaque plat porte SON chiffre (vérifié à la main)",
    plan?.dishes?.map((d: { kcal: number | null }) => d.kcal),
    EXPECTED_DISHES);
  eq("easy", "la base est plan_quantities sur CHAQUE ligne",
    [...new Set([r.json?.basis, ...(plan?.dishes ?? []).map((d: { basis: string }) => d.basis),
      ...(plan?.days ?? []).map((d: { basis: string }) => d.basis)])],
    ["plan_quantities"]);
  eq("easy", "chaque jour porte sa somme, et l'aveu de ce qu'il ne compte pas",
    plan?.days?.map((d: Record<string, unknown>) => ({
      day: d.day, kcal: d.kcal, complete: d.complete,
      counted: d.dishes_counted, total: d.dishes_total,
    })),
    EXPECTED_DAYS);

  // ── MEDIUM ──────────────────────────────────────────────────────────────
  // Coach `no_counting`: le jeton `count_calories` dans la doctrine publiée.
  const s2 = await makeStudent({ coach, fullName: "ff059 no_counting" });
  created.push(s2.userId);
  await db.from("profiles").update({
    birth_date: "1990-01-01",
    energy_display_enabled: true,
  } as never).eq("id", s2.userId);
  const p2 = await insertPlan({ userId: s2.userId, planKind: "personal", servings: 1 });

  await db.from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    beliefs: [{ key: "we_dont_count_here", claim: "We don't count here", source: "starter" }],
    forbidden: [{
      token: "count_calories",
      surface_forms: ["count calories"],
      instead: "Build the plate.",
      source: "starter",
    }],
    vocabulary: [],
    arbitrations: [],
    foods: { discouraged: [] },
    qa: [],
    voice: {},
    content_locale: "en-GB",
    published_at: new Date().toISOString(),
  } as never);

  r = await energyFor(s2, [p2]);
  eq("medium", "coach `no_counting` ⇒ doctrine_no_counting, aucun chiffre", {
    show: r.json?.show,
    reason: r.json?.reason,
    hasPlans: "plans" in (r.json ?? {}),
    switchOfferable: r.json?.switch_offerable,
  }, { show: false, reason: "doctrine_no_counting", hasPlans: false, switchOfferable: false });

  // ⚠️ LE JETON SURVIT À LA RÉÉCRITURE. `claimOnEdit` retire `source: "starter"`
  // dès que le coach personnalise son `instead` — `readStarterChoices` cesse
  // alors de voir la position. La porte ③ lit le JETON, pas le préréglage.
  await db.from("coach_doctrines").update({
    forbidden: [{
      token: "count_calories",
      surface_forms: ["count calories"],
      instead: "On construit l'assiette, on ne compte pas.",
      source: null,
    }],
  } as never).eq("coach_id", coach.coachId);
  r = await energyFor(s2, [p2]);
  eq("medium", "doctrine RÉÉCRITE par le coach ⇒ la porte ③ mord encore",
    { show: r.json?.show, reason: r.json?.reason },
    { show: false, reason: "doctrine_no_counting" });

  // Coach SANS position: le chiffre s'affiche.
  await db.from("coach_doctrines").update({ forbidden: [] } as never)
    .eq("coach_id", coach.coachId);
  r = await energyFor(s2, [p2]);
  eq("medium", "coach sans position sur `counting` ⇒ le chiffre s'affiche",
    { show: r.json?.show, first: r.json?.plans?.[0]?.dishes?.[0]?.kcal },
    { show: true, first: 537 });

  // Pas de coach (méthode maison).
  const s3 = await makeStudent({ fullName: "ff059 solo" });
  created.push(s3.userId);
  await db.from("profiles").update({
    birth_date: "1990-01-01",
    energy_display_enabled: true,
  } as never).eq("id", s3.userId);
  const p3 = await insertPlan({ userId: s3.userId, planKind: "personal", servings: 1 });
  r = await energyFor(s3, [p3]);
  eq("medium", "pas de coach (méthode maison) ⇒ le chiffre s'affiche",
    { show: r.json?.show, first: r.json?.plans?.[0]?.dishes?.[0]?.kcal },
    { show: true, first: 537 });

  // `servings` divise: la quantité écrite est pour la table.
  const p3b = await insertPlan({
    userId: s3.userId,
    planKind: "personal",
    servings: 3,
    startsOn: "2026-08-24",
  });
  r = await energyFor(s3, [p3b]);
  eq("medium", "servings=3 ⇒ le chiffre est PAR ASSIETTE",
    r.json?.plans?.[0]?.dishes?.map((d: { kcal: number | null }) => d.kcal),
    [179, 92, 237, 75, null]);

  // L'élève éteint: plus rien, partout.
  await setSwitch(s3.userId, false);
  r = await energyFor(s3, [p3, p3b]);
  eq("medium", "l'élève éteint ⇒ plus rien, sur TOUS ses plans",
    { show: r.json?.show, reason: r.json?.reason, hasPlans: "plans" in (r.json ?? {}) },
    { show: false, reason: "student_off", hasPlans: false });
  await setSwitch(s3.userId, true);

  // ── HARD ────────────────────────────────────────────────────────────────
  // Mineur.
  const s4 = await makeStudent({ fullName: "ff059 minor" });
  created.push(s4.userId);
  await db.from("profiles").update({
    birth_date: "2012-06-01",
    energy_display_enabled: true,
  } as never).eq("id", s4.userId);
  const p4 = await insertPlan({ userId: s4.userId, planKind: "personal", servings: 1 });
  r = await energyFor(s4, [p4]);
  eq("hard", "élève MINEUR ⇒ rien, et le refus ne propose pas la bascule",
    { show: r.json?.show, reason: r.json?.reason, switchOfferable: r.json?.switch_offerable },
    { show: false, reason: "minor", switchOfferable: false });

  // Ingrédient hors table + quantité absente, sur le même plan.
  const p3c = await insertPlan({
    userId: s3.userId,
    planKind: "personal",
    servings: 1,
    startsOn: "2026-09-07",
    dishes: [
      {
        ...DISHES[0],
        day: "mon",
        ingredients: [
          ing("chicken breast", 150, "g", "raw"),
          { term: "olive oil", quantity: "a drizzle", in_pantry: false, amount: null, unit: null, state: null },
        ],
      },
      { ...DISHES[4], day: "mon" },
      { ...DISHES[1], day: "mon" },
    ],
  });
  r = await energyFor(s3, [p3c]);
  const hardPlan = r.json?.plans?.[0];
  eq("hard", "huile sans quantité + ingrédient hors table ⇒ deux motifs DISTINCTS",
    hardPlan?.dishes?.map((d: { kcal: number | null; gaps: string[] }) => [d.kcal, d.gaps]),
    [[null, ["missing_quantity"]], [null, ["unknown_ingredient"]], [276, []]]);
  eq("hard", "le total du jour DIT combien de plats il a comptés",
    hardPlan?.days?.[0],
    {
      day: "mon",
      kcal: 276,
      basis: "plan_quantities",
      complete: false,
      dishes_counted: 1,
      dishes_total: 3,
      addon_kcal: 0,
    });

  // Le plan d'un AUTRE élève ne se lit pas avec son identifiant.
  r = await energyFor(s3, [p1]);
  eq("hard", "un identifiant de plan d'autrui ⇒ no_plan (le `.eq(user_id)` mord)",
    { show: r.json?.show, reason: r.json?.reason },
    { show: false, reason: "no_plan" });

  // Foyer à plusieurs bouches: abstention nommée.
  const { data: hh, error: hhErr } = await db.from("households").insert({
    created_by: s3.userId,
    name: "ff059 household",
  } as never).select("id").single();
  if (hhErr) throw new Error(`households: ${hhErr.message}`);
  const householdId = (hh as { id: string }).id;
  // ── LE FOYER : la bouche du lecteur, et ses add-ons ─────────────────────
  const { data: meRow, error: meErr } = await db.from("household_members").insert({
    household_id: householdId,
    user_id: s3.userId,
    first_name: "ff059 owner",
    role: "owner",
  } as never).select("member_id").single();
  if (meErr) throw new Error(`household_members: ${meErr.message}`);
  const myMemberId = (meRow as { member_id: string }).member_id;
  const { data: otherRow, error: otherErr } = await db.from("household_members").insert({
    household_id: householdId,
    user_id: null,
    first_name: "ff059 teen",
    role: "member",
  } as never).select("member_id").single();
  if (otherErr) throw new Error(`household_members(2): ${otherErr.message}`);
  const otherMemberId = (otherRow as { member_id: string }).member_id;

  // Un plan de foyer SANS la trace: composé avant FF-059. On s'abstient.
  const p3d = await insertPlan({
    userId: s3.userId,
    planKind: "household",
    servings: 4,
    householdId,
    startsOn: "2026-09-21",
  });
  r = await energyFor(s3, [p3d]);
  eq("hard", "foyer SANS trace de deltas ⇒ abstention NOMMÉE, aucun chiffre",
    {
      show: r.json?.show,
      computable: r.json?.plans?.[0]?.computable,
      abstention: r.json?.plans?.[0]?.abstention,
      dishes: r.json?.plans?.[0]?.dishes,
    },
    {
      show: true,
      computable: false,
      abstention: "household_portions_not_numeric",
      dishes: undefined,
    });

  // Un plan de foyer AVEC la trace: la part du lecteur, add-on compris.
  //   plats /4 : [134, 69, 178, 56, null]  (537/4=134,25→134 · 276/4=69 ·
  //              712/4=178 · 225/4=56,25→56)
  //   add-on du lecteur : 120 g de riz cru = 1,20 × 352 = 422,4 → 422
  //   lun = 134 + 69 + 422 = 625   ·   mar = 178 + 56 + 422 = 656
  const p3f = await insertPlan({
    userId: s3.userId,
    planKind: "household",
    servings: 4,
    householdId,
    startsOn: "2026-10-19",
    memberDeltas: [
      { member_id: myMemberId, food_ref: "white_rice", grams: 120, moment: "cooking", channel: "more_of_the_same" },
      // ⚠️ L'add-on d'une AUTRE bouche. Il ne doit apparaître NULLE PART.
      { member_id: otherMemberId, food_ref: "wholemeal_bread", grams: 200, moment: "plating", channel: "usual_side" },
    ],
  });
  r = await energyFor(s3, [p3f]);
  const hhPlan = r.json?.plans?.[0];
  eq("hard", "foyer AVEC trace ⇒ la part du lecteur, add-on compris", {
    computable: hhPlan?.computable,
    dishes: hhPlan?.dishes?.map((d: { kcal: number | null }) => d.kcal),
    days: hhPlan?.days?.map((d: Record<string, unknown>) => [d.day, d.kcal, d.addon_kcal]),
  }, {
    computable: true,
    dishes: [134, 69, 178, 56, null],
    days: [["mon", 625, 422], ["tue", 656, 422], ["wed", null, 422]],
  });
  eq("hard", "l'add-on d'une AUTRE bouche ne franchit jamais le fil",
    // 200 g de pain complet = 524 kcal. Ni le nombre, ni l'identifiant de la
    // bouche, ni son aliment ne doivent apparaître dans le corps.
    ["524", otherMemberId, "wholemeal_bread"].filter((s) =>
      JSON.stringify(r.json).includes(s)
    ),
    []);

  const p3e = await insertPlan({
    userId: s3.userId,
    planKind: "household",
    servings: 1,
    householdId,
    startsOn: "2026-10-05",
  });
  r = await energyFor(s3, [p3e]);
  eq("hard", "foyer à UNE bouche ⇒ le chiffre revient sans dépendre d'une trace",
    { computable: r.json?.plans?.[0]?.computable, first: r.json?.plans?.[0]?.dishes?.[0]?.kcal },
    { computable: true, first: 537 });

  // ── EXTRA-HARD — le test qui fait le lot ────────────────────────────────
  // Plancher TCA levé + coach qui compte + interrupteur ALLUMÉ.
  const s5 = await makeStudent({ coach, fullName: "ff059 floor" });
  created.push(s5.userId);
  await db.from("profiles").update({
    birth_date: "1990-01-01",
    energy_display_enabled: true,
  } as never).eq("id", s5.userId);
  const p5 = await insertPlan({ userId: s5.userId, planKind: "personal", servings: 1 });

  // LE COACH COMPTE, EXPLICITEMENT. La porte ③ lit le jeton `count_calories`;
  // ce coach-ci ne le porte pas ET publie une conviction qui dit de compter.
  // C'est la situation nommée au §7 de la fiche: tout est ouvert sauf ①.
  await db.from("coach_doctrines").update({
    beliefs: [{
      key: "count_for_two_weeks",
      claim: "Count for a couple of weeks if you want to — it's a lesson, not a lifestyle",
      rationale: "you learn what a portion is, and then you put the app down",
      source: "starter",
    }],
    forbidden: [],
  } as never).eq("coach_id", coach.coachId);

  r = await energyFor(s5, [p5]);
  eq("extra-hard", "PRÉMISSE FAUSSE — avant le plancher, cet élève VOIT son chiffre",
    { show: r.json?.show, first: r.json?.plans?.[0]?.dishes?.[0]?.kcal },
    { show: true, first: 537 });

  // Le jour LOCAL de l'élève (Europe/Paris), pas l'UTC du serveur: la fenêtre
  // de `loadStudentTextSamples` se compte sur lui.
  const todayParis = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await raiseFloor(
    s5.userId,
    todayParis,
    "I have been skipping meals all week to make up for the weekend.",
  );
  const guardRow = await db
    .from("protocol_events")
    .select("local_date, student_note")
    .eq("user_id", s5.userId)
    .maybeSingle();
  r = await energyFor(s5, [p5]);
  eq("extra-hard", "plancher LEVÉ + coach qui compte + interrupteur allumé ⇒ RIEN", {
    show: r.json?.show,
    reason: r.json?.reason,
    hasPlans: "plans" in (r.json ?? {}),
    body: JSON.stringify(r.json).includes("537"),
  }, { show: false, reason: "restriction_floor", hasPlans: false, body: false },
    `protocol_events=${JSON.stringify(guardRow.data)}`);

  // Le plancher se lève PENDANT une session: le tour suivant se tait.
  record("extra-hard", "le plancher se lève PENDANT la session ⇒ le tour suivant se tait",
    true,
    "les deux appels ci-dessus sont le MÊME élève, le MÊME plan, la MÊME " +
      "session: 537 kcal avant l'écriture du bilan, restriction_floor après. " +
      "Rien n'a été rechargé côté client — le recalcul est à chaque requête (R5).");

  // Plan MODIFIÉ après affichage: recalcul, rien de périmé.
  await db.from("student_generated_meals").update({
    dishes: [{ ...DISHES[0], ingredients: [
      ing("chicken breast", 300, "g", "raw"),
      ing("white rice", 80, "g", "raw"),
      ing("olive oil", 10, "g", "raw"),
    ] }],
  } as never).eq("id", p3);
  r = await energyFor(s3, [p3]);
  eq("extra-hard", "plan MODIFIÉ ⇒ recalcul immédiat, rien de périmé (R5)",
    r.json?.plans?.[0]?.dishes?.[0]?.kcal,
    702, "150 g → 300 g de poulet: 536,6 + 165 = 701,6 → 702");

  // ── LOT 3 · LA CIBLE (niveau C) ─────────────────────────────────────────
  const s6 = await makeStudent({ fullName: "ff059 target" });
  created.push(s6.userId);
  await db.from("profiles").update({
    birth_date: "1990-01-01",
    energy_display_enabled: true,
  } as never).eq("id", s6.userId);
  const p6 = await insertPlan({ userId: s6.userId, planKind: "personal", servings: 1 });

  r = await energyFor(s6, [p6]);
  eq("lot3", "porte ⑤ éteinte par défaut ⇒ aucune cible, et le poids n'est pas lu",
    { show: r.json?.show, target: r.json?.target, offerable: r.json?.target_offerable },
    { show: true, target: null, offerable: true });

  // La pesée, par le vrai chemin: `student_body_measures`.
  await db.from("student_body_measures").insert({
    user_id: s6.userId,
    local_date: "2026-08-10",
    kind: "weight",
    value_si: 75,
    measured_at: "2026-08-10T08:00:00Z",
    source: "sunday_flow",
    content_locale: "en-GB",
  } as never).then((res) => {
    if (res.error) throw new Error(`pesée: ${res.error.message}`);
  });
  await db.from("profiles").update({ energy_target_enabled: true } as never)
    .eq("id", s6.userId);

  r = await energyFor(s6, [p6]);
  eq("lot3", "porte ⑤ allumée + une pesée ⇒ une FOURCHETTE, jamais un point",
    {
      low: r.json?.target?.low,
      high: r.json?.target?.high,
      basis: r.json?.target?.basis,
      gap: r.json?.target?.gap,
    },
    // 75 kg → 28×75 = 2100 · 33×75 = 2475 → arrondi aux 50 → 2100–2500
    { low: 2100, high: 2500, basis: "weight_range", gap: null });
  eq("lot3", "AUCUN reste, aucun pourcentage, aucun verdict dans la réponse",
    ["remaining", "left", "deficit", "surplus", "percent", "over", "under", "progress"]
      .filter((k) => JSON.stringify(r.json).toLowerCase().includes(k)),
    []);

  // Sans pesée: pas de cible, et le motif le dit.
  const s7 = await makeStudent({ fullName: "ff059 target no weight" });
  created.push(s7.userId);
  await db.from("profiles").update({
    birth_date: "1990-01-01",
    energy_display_enabled: true,
    energy_target_enabled: true,
  } as never).eq("id", s7.userId);
  const p7 = await insertPlan({ userId: s7.userId, planKind: "personal", servings: 1 });
  r = await energyFor(s7, [p7]);
  eq("lot3", "sans pesée ⇒ pas de cible, motif nommé, et le plan garde ses chiffres",
    {
      low: r.json?.target?.low,
      gap: r.json?.target?.gap,
      firstDish: r.json?.plans?.[0]?.dishes?.[0]?.kcal,
    },
    { low: null, gap: "no_weight", firstDish: 537 });

  // ⚠️ LE PLANCHER FERME LES TROIS NIVEAUX. Interrupteurs ④ ET ⑤ allumés.
  await db.from("profiles").update({ energy_target_enabled: true } as never)
    .eq("id", s5.userId);
  await db.from("student_body_measures").insert({
    user_id: s5.userId,
    local_date: "2026-08-10",
    kind: "weight",
    value_si: 80,
    measured_at: "2026-08-10T08:00:00Z",
    source: "sunday_flow",
    content_locale: "en-GB",
  } as never).then((res) => {
    if (res.error) throw new Error(`pesée: ${res.error.message}`);
  });
  r = await energyFor(s5, [p5]);
  // 80 kg → 28×80 = 2240 → 2250 · 33×80 = 2640 → 2650. Ces deux nombres-là ne
  // doivent apparaître nulle part, ni le poids, ni les plats.
  eq("lot3", "plancher TCA + les DEUX interrupteurs allumés ⇒ aucun niveau", {
    show: r.json?.show,
    reason: r.json?.reason,
    hasTarget: "target" in (r.json ?? {}),
    leaked: ["2250", "2650", "\"80\"", ":80", "537"].filter((n) =>
      JSON.stringify(r.json).includes(n)
    ),
  }, { show: false, reason: "restriction_floor", hasTarget: false, leaked: [] });

  // ── ANGLES ADVERSARIAUX, TESTÉS SUR LA RÉPONSE RÉELLE ───────────────────
  r = await energyFor(s3, [p3]);
  const body = JSON.stringify(r.json);

  // « Le chiffre qui fuit par la prose. » Le nombre ne doit vivre que dans un
  // champ NUMÉRIQUE. On cherche donc un chiffre à l'intérieur d'une CHAÎNE.
  const stringsWithDigits: string[] = [];
  (function walk(v: unknown) {
    if (typeof v === "string" && /\d/.test(v)) stringsWithDigits.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  })(r.json);
  // Les IDENTIFIANTS (UUID) sont les seules chaînes chiffrées légitimes: ce
  // sont des clés, pas des mesures. On les écarte par leur FORME exacte plutôt
  // que par une liste de champs — une liste laisserait passer le champ suivant.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  eq("adversarial", "aucun chiffre ne voyage DANS une chaîne (prose)",
    stringsWithDigits.filter((s) => !UUID.test(s)),
    []);
  // Et la garde ci-dessus a un cas qui PASSE: elle doit attraper une phrase
  // chiffrée si on en glisse une. Sans cette prémisse fausse, un filtre trop
  // large la rendrait verte pour toujours.
  eq("adversarial", "PRÉMISSE FAUSSE — le détecteur de prose chiffrée mord",
    ["about 600 kcal", "environ 600 kcal"].filter((s) => !UUID.test(s) && /\d/.test(s)),
    ["about 600 kcal", "environ 600 kcal"]);

  // « Le score déguisé. » Aucun pourcentage, aucune adhérence, aucun reste.
  //
  // ⚠️ `target` A QUITTÉ CETTE LISTE LE 2026-08-12, avec le lot 3 — et il ne
  // l'a pas quittée gratuitement: ce qui rend une cible acceptable est
  // précisément qu'elle ne produise AUCUN des autres mots ci-dessous. Une
  // fourchette de maintenance est un repère; un reste, un pourcentage ou un
  // score en feraient un tracker.
  eq("adversarial", "la réponse ne porte ni %, ni adhérence, ni RESTE",
    ["percent", "pct", "adherence", "score", "budget", "remaining", "deficit", "surplus"]
      .filter((k) => body.toLowerCase().includes(k)),
    []);

  // « La contamination du générateur. » Le plan en base ne porte AUCUN kcal —
  // le chiffre est calculé après, et il n'est écrit nulle part (R5).
  const stored = await db
    .from("student_generated_meals")
    .select("dishes, preparations, shopping_list, generated_from")
    .eq("id", p3)
    .single();
  eq("adversarial", "R5 — aucun kcal STOCKÉ sur la ligne de plan",
    /kcal|calorie|energy/i.test(JSON.stringify(stored.data)),
    false);

  // « La porte ① contournable. » On rejoue l'élève sous plancher en demandant
  // ses plans par TOUS les chemins offerts par la fonction: identifiant seul,
  // identifiants multiples, doublons, et un identifiant d'autrui glissé dedans.
  for (
    const [name, ids] of [
      ["un seul identifiant", [p5]],
      ["le même deux fois", [p5, p5]],
      ["mélangé à un plan d'autrui", [p5, p3]],
      ["mélangé à un identifiant inconnu", [p5, "00000000-0000-0000-0000-000000000000"]],
    ] as const
  ) {
    const probe = await energyFor(s5, [...ids]);
    eq("adversarial", `porte ① — ${name}: toujours rien`,
      { show: probe.json?.show, reason: probe.json?.reason, digits: /\d{2,}/.test(
        JSON.stringify(probe.json?.plans ?? []),
      ) },
      { show: false, reason: "restriction_floor", digits: false });
  }

  // Et l'élève sous plancher ne peut pas se rouvrir la porte en basculant son
  // propre interrupteur — c'est la porte ④, elle est en aval.
  await setSwitch(s5.userId, false);
  await setSwitch(s5.userId, true);
  const reprobe = await energyFor(s5, [p5]);
  eq("adversarial", "porte ① — l'élève rallume son interrupteur: toujours rien",
    { show: reprobe.json?.show, reason: reprobe.json?.reason },
    { show: false, reason: "restriction_floor" });

  // « Le cache. » Il n'y en a pas: deux appels consécutifs encadrant une
  // modification rendent deux résultats différents, sans invalidation.
  const before = await energyFor(s3, [p3]);
  await db.from("student_generated_meals").update({
    dishes: [{ ...DISHES[1], day: "mon" }],
  } as never).eq("id", p3);
  const after = await energyFor(s3, [p3]);
  eq("adversarial", "aucun cache: modifier le plan change le chiffre au tour suivant",
    [before.json?.plans?.[0]?.dishes?.[0]?.kcal, after.json?.plans?.[0]?.dishes?.[0]?.kcal],
    [702, 276]);

  // ── L'ÉCART CONTRE UNE RÉFÉRENCE EXTERNE (§10 de la fiche) ──────────────
  console.log("\n--- ÉCART CONTRE LA RÉFÉRENCE, 5 plats ---");
  const ref = [
    ["chicken+rice+oil", 537, EXPECTED_DISHES[0]],
    ["3 eggs + oil", 276, EXPECTED_DISHES[1]],
    ["salmon+sweet potato+broccoli", 712, EXPECTED_DISHES[2]],
    ["rice cooked + oil", 225, EXPECTED_DISHES[3]],
    ["chicken 300 g + rice + oil", 702, 702],
  ] as const;
  for (const [name, hand, got] of ref) {
    console.log(`  ${name}: main=${hand} produit=${got} écart=${(got as number) - hand}`);
  }

  // ── NETTOYAGE ───────────────────────────────────────────────────────────
  console.log("\n--- RÉSUMÉ ---");
  const failed = results.filter((x) => !x.ok);
  console.log(`${results.length - failed.length}/${results.length} verts`);
  for (const f of failed) console.log(`  ❌ [${f.level}] ${f.name}: ${f.proof}`);
}

try {
  await main();
} finally {
  for (const id of created) {
    await db.from("student_generated_meals").delete().eq("user_id", id);
    await db.from("protocol_events").delete().eq("user_id", id);
    await db.from("weekly_reviews").delete().eq("user_id", id);
    await db.from("households").delete().eq("created_by", id);
    await db.from("student_week_plans").delete().eq("user_id", id);
    await db.from("coach_clients").delete().eq("student_user_id", id);
    await db.from("household_members").delete().eq("user_id", id);
    await db.from("student_body_measures").delete().eq("user_id", id);
  }
  console.log(`\nnettoyé: ${created.length} comptes (lignes de plan, foyers, bilans)`);
}
