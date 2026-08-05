/**
 * D4 — LE MAPPING DU COACH ATTEINT L'ASSIETTE.
 *
 * `coach_food_rules` avait son écran, ses gardes de schéma et trente tests de
 * compilation — et AUCUN lecteur au runtime. Un coach cochait ses pastilles, et
 * `generate-meal-v1` composait sans rien en savoir. Ce script prouve que ce
 * n'est plus vrai, contre le vrai modèle et la vraie base.
 *
 * TROIS QUESTIONS, DANS CET ORDRE
 *   1. le mapping arrive-t-il dans le PROMPT ? (déterministe, via le vrai
 *      chargeur de production)
 *   2. le modèle s'en sert-il ? (un plat réel, généré)
 *   3. la portée par objectif mord-elle ICI AUSSI ? (deux élèves, deux
 *      mappings, même coach)
 *
 * ⚠️ La question 1 est la preuve. La 2 montre que ça sert; un modèle qui
 * choisirait de ne pas citer un groupe ne prouverait rien contre le câblage.
 *
 * USAGE
 *   set -a; . supabase/functions/night_llm.env; set +a
 *   deno run -A docs/nutrition-pivot/qa-web/D4_protocol_reaches_meals.ts
 */
import {
  loadPublishedProtocol,
  protocolBlockFor,
} from "../../../supabase/functions/_shared/keel/protocol_loader.ts";
import {
  admin,
  callAs,
  type Coach,
  makeCoach,
  makeStudent,
  publishPlanFor,
  type Student,
} from "./harness.ts";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${name} — ${detail}`);
}
function banner(title: string): void {
  console.log("\n" + "═".repeat(78));
  console.log(`▌ ${title}`);
  console.log("═".repeat(78));
}

const coach: Coach = await makeCoach({ displayName: "Marlow", country: "GB" });

// --- LA MÉTHODE DU COACH, écrite comme son écran l'écrit -------------------
const db = admin();
const { data: protoRow, error: protoErr } = await db.from("coach_protocols").insert({
  coach_id: coach.coachId,
  version: 1,
  status: "published",
  content_locale: "en",
  published_at: new Date().toISOString(),
  published_by: coach.userId,
} as never).select("id").single();
if (protoErr) throw new Error(`coach_protocols: ${protoErr.message}`);
const protocolId = (protoRow as { id: string }).id;

const FOOD_RULES = [
  { food_group_ref: "leafy_greens", stance: "encouraged", goal_scope: [], rationale: "volume on the plate" },
  { food_group_ref: "eggs", stance: "encouraged", goal_scope: [], rationale: null },
  { food_group_ref: "fried_food", stance: "excluded", goal_scope: [], rationale: null },
  { food_group_ref: "sweetened_beverage", stance: "excluded", goal_scope: [], rationale: null },
  // CIBLÉE: elle ne doit atteindre qu'un élève en perte de gras.
  { food_group_ref: "refined_grain", stance: "discouraged", goal_scope: ["fat_loss"], rationale: null },
];
const { error: frErr } = await db.from("coach_food_rules").insert(
  FOOD_RULES.map((r) => ({ ...r, protocol_id: protocolId, coach_id: coach.coachId })) as never,
);
if (frErr) throw new Error(`coach_food_rules: ${frErr.message}`);

const { error: trErr } = await db.from("coach_timing_rules").insert([{
  protocol_id: protocolId,
  coach_id: coach.coachId,
  template: "group_every_meal",
  food_group_ref: "lean_protein",
  goal_scope: [],
  rationale: "the anchor",
}] as never);
if (trErr) throw new Error(`coach_timing_rules: ${trErr.message}`);

// Le mot du coach sur un groupe: il doit porter le titre à la place du slug.
const { error: ctErr } = await db.from("coach_terms").insert([{
  coach_id: coach.coachId,
  term: "green volume",
  food_group_ref: "leafy_greens",
  content_locale: "en",
}] as never);
if (ctErr) throw new Error(`coach_terms: ${ctErr.message}`);

// La doctrine reste nécessaire: le générateur refuse sans coach, et le bloc
// doctrine porte la voix. Elle ne dit RIEN sur les aliments — c'est le point.
const { error: docErr } = await db.from("coach_doctrines").insert({
  coach_id: coach.coachId,
  version: 1,
  beliefs: [{ claim: "Every meal is built on a protein anchor." }],
  forbidden: [],
  vocabulary: [],
  arbitrations: [],
  foods: { discouraged: [] },
  qa: [],
  voice: { address: "tu", length: "short", emojis: "none", language: "en" },
  content_locale: "en",
  published_at: new Date().toISOString(),
  published_by: coach.userId,
} as never);
if (docErr) throw new Error(`coach_doctrines: ${docErr.message}`);

async function setGoal(student: Student, goal: string): Promise<void> {
  const { error } = await db.from("student_goals").upsert({
    user_id: student.userId,
    goal,
    situation: "I cook at home most nights.",
    content_locale: "en",
  } as never, { onConflict: "user_id" });
  if (error) throw new Error(`student_goals: ${error.message}`);
}

const amara = await makeStudent({ coach, fullName: "Amara", country: "GB" });
const nina = await makeStudent({ coach, fullName: "Nina", country: "GB" });
await publishPlanFor(coach, amara.userId);
await publishPlanFor(coach, nina.userId);
await setGoal(amara, "fat_loss");
await setGoal(nina, "health");

console.log(`coach     = ${coach.coachId} (Marlow)`);
console.log(`protocole = ${protocolId}`);
console.log(`amara     = fat_loss · nina = health`);

// ===========================================================================
banner("1. LE MAPPING ARRIVE-T-IL DANS LE PROMPT ?");
// ===========================================================================
const amaraLoaded = await loadPublishedProtocol(db, amara.userId);
const ninaLoaded = await loadPublishedProtocol(db, nina.userId);
const amaraBlock = protocolBlockFor(amaraLoaded, "Marlow");
const ninaBlock = protocolBlockFor(ninaLoaded, "Marlow");

console.log("\n--- BLOC SERVI À AMARA (fat_loss) ---");
console.log(amaraBlock);

check(
  "le mapping est chargé et compilé pour l'élève",
  amaraLoaded.reason === "loaded" && amaraBlock.length > 0,
  `${amaraLoaded.reason}, ${amaraLoaded.compiled.length} règles`,
);
check(
  "le MOT DU COACH porte le titre, pas le slug",
  amaraBlock.includes("green volume") && !amaraBlock.includes("leafy_greens"),
  "green volume",
);
check(
  "le « pourquoi » du coach voyage avec la règle",
  amaraBlock.includes("(volume on the plate)"),
  "le rationale permet d'expliquer au lieu d'asséner",
);
check(
  "les trois postures sont rendues séparément",
  amaraBlock.includes("REACH FOR THESE FIRST") &&
    amaraBlock.includes("HE DOES NOT USE THESE") &&
    amaraBlock.includes("RULES ON FREQUENCY AND TIMING"),
  "encouragé / exclu / temporel",
);

// ===========================================================================
banner("2. LA PORTÉE PAR OBJECTIF MORD-ELLE ICI AUSSI ?");
// ===========================================================================
check(
  "la règle ciblée fat_loss atteint amara",
  amaraBlock.includes("refined_grain"),
  `amara=${amaraBlock.includes("refined_grain")}`,
);
check(
  "et ne franchit PAS la frontière vers nina (health)",
  !ninaBlock.includes("refined_grain"),
  `nina=${ninaBlock.includes("refined_grain")}`,
);
check(
  "le noyau du mapping atteint les deux",
  ["green volume", "fried_food", "lean_protein"].every((t) =>
    amaraBlock.includes(t) && ninaBlock.includes(t)
  ),
  "encouragés, exclus et règle temporelle communs",
);

// ===========================================================================
banner("3. LE MODÈLE S'EN SERT-IL ? — un vrai plat, généré");
// ===========================================================================
async function cook(student: Student, label: string): Promise<string> {
  const t0 = Date.now();
  const res = await callAs(student, "generate-meal-v1", {
    mode: "to_shop",
    scope: "day",
    servings: 1,
    context: "Nothing special today.",
  });
  const json = JSON.stringify(res.json ?? {});
  console.log(`\n[${label}] HTTP ${res.status} en ${Date.now() - t0} ms`);
  const dishes = (res.json?.dishes ?? []) as Array<Record<string, unknown>>;
  for (const d of dishes) {
    console.log(`  · ${d.title}`);
    const items = (d.ingredients ?? []) as Array<Record<string, unknown>>;
    console.log(`    ${items.map((i) => String(i.term ?? i)).join(", ")}`);
  }
  if (dishes.length === 0) console.log(`  (aucun plat) ${json.slice(0, 300)}`);
  return json;
}

const amaraMeal = await cook(amara, "amara/fat_loss");
const ninaMeal = await cook(nina, "nina/health");

console.log("");

// ⚠️ LA GARDE DE VACUITÉ, ET ELLE EST OBLIGATOIRE.
//
// « Aucun plat ne contient un aliment exclu » est VRAI quand il n'y a aucun
// plat. Sans ce garde-fou, une fonction qui ne boote pas rend un vert — et un
// test qui passe précisément parce que rien ne s'est produit est un test qui
// ment dans le sens le plus coûteux: celui qui dit « c'est bon » quand rien
// n'a été vérifié.
const cooked = (json: string) => (JSON.parse(json)?.dishes ?? []).length > 0;
const bothCooked = cooked(amaraMeal) && cooked(ninaMeal);
check(
  "les deux générations ont RENDU des plats",
  bothCooked,
  bothCooked ? "des plats à examiner" : "aucun plat — les assertions suivantes ne prouveraient rien",
);

if (bothCooked) {
  const EXCLUDED = /fried|deep-?fry|soda|sugary drink|cola|lemonade/i;
  check(
    "aucun plat ne contient un groupe EXCLU par le coach",
    !EXCLUDED.test(amaraMeal) && !EXCLUDED.test(ninaMeal),
    "fried_food / sweetened_beverage absents des deux",
  );
  const ENCOURAGED = /green|spinach|kale|lettuce|salad|egg/i;
  check(
    "les groupes ENCOURAGÉS se retrouvent dans les plats",
    ENCOURAGED.test(amaraMeal) && ENCOURAGED.test(ninaMeal),
    `amara=${ENCOURAGED.test(amaraMeal)} nina=${ENCOURAGED.test(ninaMeal)}`,
  );
}

banner("RÉSULTAT");
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.name}`);
console.log(`\n${results.length - failed.length}/${results.length} verts`);
if (failed.length > 0) Deno.exit(1);
