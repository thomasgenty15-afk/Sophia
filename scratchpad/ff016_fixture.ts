/**
 * FF-016 — LE DÉCOR, et rien d'autre.
 *
 * Un coach « Marlow » avec une doctrine publiée ET un protocole alimentaire
 * publié; un coach « Ines » avec une doctrine publiée et AUCUN protocole (le
 * cas §7 « pas de protocole publié »). Trois élèves chez Marlow (plafond du
 * harnais), un chez Ines.
 *
 * Écrit les identités dans `scratchpad/ff016_fixture.json` pour que les scripts
 * de tour ne re-provisionnent pas à chaque passe.
 */
import {
  admin,
  type Coach,
  makeCoach,
  makeStudent,
  mondayOf,
  type Student,
} from "../docs/nutrition-pivot/qa-web/harness.ts";

const db = admin();

// ---------------------------------------------------------------------------
// LES COACHS
// ---------------------------------------------------------------------------
const marlow = await makeCoach({ displayName: "Marlow", country: "GB" });
const ines = await makeCoach({ displayName: "Ines", country: "GB" });

async function publishDoctrine(coach: Coach, over: Record<string, unknown> = {}) {
  const { error } = await db.from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    beliefs: [{ claim: "Every meal is built on a protein anchor." }],
    // L'INTERDIT DE DOCTRINE, distinct du mapping: c'est lui que le verrou
    // déterministe (`findDoctrineViolations`) scanne dans le texte sortant.
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
    ...over,
  } as never);
  if (error) throw new Error(`coach_doctrines: ${error.message}`);
}

await publishDoctrine(marlow);
await publishDoctrine(ines);

// ---------------------------------------------------------------------------
// LE PROTOCOLE DE MARLOW — et lui seul
// ---------------------------------------------------------------------------
const { data: protoRow, error: protoErr } = await db.from("coach_protocols")
  .insert({
    coach_id: marlow.coachId,
    version: 1,
    status: "published",
    content_locale: "en",
    published_at: new Date().toISOString(),
    published_by: marlow.userId,
  } as never).select("id").maybeSingle();
if (protoErr) throw new Error(`coach_protocols: ${protoErr.message}`);
const protocolId = (protoRow as { id: string }).id;

const FOOD_RULES = [
  // LE CŒUR DU TEST: le petit-déjeuner de la fiche §8 (« un protocole qui met
  // en avant les œufs »).
  {
    food_group_ref: "eggs",
    stance: "encouraged",
    goal_scope: [],
    rationale: "cheapest complete protein there is",
  },
  {
    food_group_ref: "leafy_greens",
    stance: "encouraged",
    goal_scope: [],
    rationale: "volume on the plate",
  },
  { food_group_ref: "lean_protein", stance: "encouraged", goal_scope: [], rationale: null },
  // DÉCONSEILLÉ ≠ INTERDIT ≠ ALLERGÈNE: les trois couches se croisent ici.
  {
    food_group_ref: "refined_grain",
    stance: "discouraged",
    goal_scope: [],
    rationale: "spikes then crashes",
  },
  { food_group_ref: "fried_food", stance: "excluded", goal_scope: [], rationale: null },
];
const { error: frErr } = await db.from("coach_food_rules").insert(
  FOOD_RULES.map((r) => ({ ...r, protocol_id: protocolId, coach_id: marlow.coachId })) as never,
);
if (frErr) throw new Error(`coach_food_rules: ${frErr.message}`);

const { error: trErr } = await db.from("coach_timing_rules").insert([{
  protocol_id: protocolId,
  coach_id: marlow.coachId,
  template: "group_at_slot",
  food_group_ref: "eggs",
  slot_key: "breakfast",
  goal_scope: [],
  rationale: "protein first thing",
}] as never);
if (trErr) throw new Error(`coach_timing_rules: ${trErr.message}`);

// ---------------------------------------------------------------------------
// LES PLANS — écrits ici et pas par `publishPlanFor`, parce que la lane swap
// se joue sur `autonomy` et `content.swap_policy`, que le harnais ne pose pas.
// ---------------------------------------------------------------------------
async function publishPlan(
  coach: Coach,
  studentUserId: string,
  autonomy: "strict" | "swap_within_policy" | "flexible",
): Promise<string> {
  const { data, error } = await db.from("plan_versions").insert({
    coach_id: coach.coachId,
    student_id: studentUserId,
    version: 1,
    status: "published",
    title: "FF-016 protocol",
    content_locale: "en-GB",
    timezone: "Europe/London",
    published_at: new Date().toISOString(),
  } as never).select("id").maybeSingle();
  if (error) throw new Error(`plan_versions: ${error.message}`);
  const planVersionId = String((data as { id: string }).id);

  const base = {
    plan_version_id: planVersionId,
    user_id: studentUserId,
    coach_id: coach.coachId,
    polarity: "do",
    activity_class: "nutrition",
    anchor_kind: "slot",
    measure: "presence",
    target_op: "any",
    evidence_kind: "self_report",
    evaluation_grain: "day",
    content_locale: "en-GB",
    // `content` est NOT NULL en base: une ligne sans politique de substitution
    // porte un objet vide, jamais NULL.
    content: {},
  };
  const { error: cErr } = await db.from("plan_commitments").insert([
    {
      ...base,
      slot_key: "lunch",
      food_group_ref: "lean_protein",
      title: "Protein at lunch",
      autonomy: "flexible",
    },
    {
      // LA LIGNE DE LA SUBSTITUTION. `starchy_veg` = les pommes de terre;
      // `swap_policy` ouvre explicitement les deux groupes de céréales pour
      // que le test ne dépende pas du slug que le dispatcher choisit pour
      // « riz » (blanc → refined_grain, complet → whole_grain).
      ...base,
      slot_key: "dinner",
      food_group_ref: "starchy_veg",
      title: "Potatoes at dinner",
      autonomy,
      content: {
        swap_policy: {
          class_equivalent: true,
          allowed_groups: ["refined_grain", "whole_grain"],
        },
      },
    },
  ] as never);
  if (cErr) throw new Error(`plan_commitments: ${cErr.message}`);
  return planVersionId;
}

async function setGoal(student: Student, goal: string) {
  const { error } = await db.from("student_goals").upsert({
    user_id: student.userId,
    goal,
    situation: "I cook at home most nights.",
    content_locale: "en",
  } as never, { onConflict: "user_id" });
  if (error) throw new Error(`student_goals: ${error.message}`);
}

// A — la ligne PERMISSIVE. L'élève « riche » du chantier: doctrine, protocole,
// foyer, objectif, plan adopté.
const a = await makeStudent({
  coach: marlow,
  fullName: "ff016 Ada",
  country: "GB",
  locale: "en-US",
  timezone: "Europe/London",
});
// B — la MÊME question, `autonomy='strict'`.
const b = await makeStudent({
  coach: marlow,
  fullName: "ff016 Bo",
  country: "GB",
  locale: "en-US",
  timezone: "Europe/London",
});
// D — le CŒLIAQUE. La contrainte médicale doit passer avant la politique.
const d = await makeStudent({
  coach: marlow,
  fullName: "ff016 Dia",
  country: "GB",
  locale: "en-US",
  timezone: "Europe/London",
});
// C — chez INES: doctrine publiée, AUCUN protocole alimentaire.
const c = await makeStudent({
  coach: ines,
  fullName: "ff016 Cyd",
  country: "GB",
  locale: "en-US",
  timezone: "Europe/London",
});

await publishPlan(marlow, a.userId, "swap_within_policy");
await publishPlan(marlow, b.userId, "strict");
await publishPlan(marlow, d.userId, "swap_within_policy");
await publishPlan(ines, c.userId, "swap_within_policy");

for (const s of [a, b, d, c]) await setGoal(s, "fat_loss");

const { error: scErr } = await db.from("student_safety_constraints").insert([{
  user_id: d.userId,
  kind: "allergy",
  allergen_ref: "gluten",
  severity: "medical",
  declared_by: "student",
  content_locale: "en",
  status: "active",
}] as never);
if (scErr) throw new Error(`student_safety_constraints: ${scErr.message}`);

const out = {
  marlow: { coachId: marlow.coachId, userId: marlow.userId },
  ines: { coachId: ines.coachId, userId: ines.userId },
  protocolId,
  weekStart: mondayOf(new Date()),
  students: {
    a: { userId: a.userId, accessToken: a.accessToken, refreshToken: a.refreshToken, email: a.email },
    b: { userId: b.userId, accessToken: b.accessToken, refreshToken: b.refreshToken, email: b.email },
    c: { userId: c.userId, accessToken: c.accessToken, refreshToken: c.refreshToken, email: c.email },
    d: { userId: d.userId, accessToken: d.accessToken, refreshToken: d.refreshToken, email: d.email },
  },
};
await Deno.writeTextFile(
  new URL("./ff016_fixture.json", import.meta.url),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out, null, 2));
