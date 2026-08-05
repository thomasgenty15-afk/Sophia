/**
 * D1 — L'ÉPREUVE DE RÉEL DU LOT DOCTRINE-BY-GOAL.
 *
 * « Deux élèves du même coach, objectifs différents, posent LA MÊME question.
 *   Les réponses doivent différer sur le fond et se ressembler sur la voix. »
 *
 * Contre le vrai modèle, la vraie base, la vraie fonction edge. Rien n'est
 * simulé: un seul coach, une seule doctrine publiée, deux élèves qui ne
 * diffèrent QUE par leur ligne `student_goals`.
 *
 * ── LE CONTRE-FACTUEL EST DANS LE MÊME SCRIPT, ET C'EST VOULU ─────────────
 * Une garde qu'on n'a pas vue mordre est une garde qu'on croit sur parole. Le
 * script rejoue donc le MÊME élève `health` sous une doctrine dont la croyance
 * ciblée a été rendue GLOBALE: si la phrase n'apparaît toujours pas, ce n'est
 * pas la portée qui l'a retenue, c'est le modèle qui n'en voulait pas — et la
 * preuve du tour d'avant ne vaut rien.
 *
 * ── ET LE VERROU DES INTERDITS ────────────────────────────────────────────
 * §4 exige de vérifier que N variantes ne dégradent pas le verrou. On pose donc
 * la question qui le déclenche aux DEUX élèves: le même interdit doit être tenu
 * des deux côtés, et la réponse doit rester une explication honnête plutôt
 * qu'un remplacement par le verrou.
 *
 * USAGE
 *   set -a; . supabase/functions/night_llm.env; set +a
 *   deno run -A docs/nutrition-pivot/qa-web/D1_doctrine_by_goal.ts
 */
import {
  admin,
  type Coach,
  makeCoach,
  makeStudent,
  publishPlanFor,
  sql,
  type Student,
  turn,
} from "./harness.ts";

// ---------------------------------------------------------------------------
// LA DOCTRINE — celle d'un vrai coach: un noyau commun, et ce qui ne s'adresse
// visiblement pas aux mêmes élèves.
// ---------------------------------------------------------------------------

const SHARED = {
  forbidden: [
    {
      token: "count_calories",
      surface_forms: ["count calories", "counting calories", "calorie counting"],
      reason: "numbers turn food into a score",
      instead: "We build the plate: a protein anchor, vegetables for volume, a starch on the side.",
    },
  ],
  vocabulary: [
    { term: "anchor meal", meaning: "the protein base of a plate" },
  ],
  foods: {
    recommended: [{ term: "eggs", reason: null }],
    discouraged: [{ term: "sugary drinks", surface_forms: ["sugary drinks", "sodas"], reason: null }],
  },
  qa: [],
  voice: { address: "tu", length: "short", emojis: "none", language: "en" },
};

/** La croyance et l'arbitrage CIBLÉS, plus un noyau que tout le monde reçoit. */
function doctrineRows(scoped: boolean) {
  const scope = (goals: string[]) => (scoped ? { goal_scope: goals } : {});
  return {
    ...SHARED,
    beliefs: [
      { claim: "Every meal is built on a protein anchor.", rationale: null },
      {
        claim: "The scale is one signal out of four, and the slowest of them.",
        rationale: "waist, energy, strength and sleep move before it does",
        ...scope(["fat_loss"]),
      },
      {
        claim: "Eat more than you think you need on training days.",
        rationale: "under-eating is the most common reason a build stalls",
        ...scope(["recomposition"]),
      },
    ],
    arbitrations: [
      {
        situation: "A student says they cracked and ate everything",
        coach_answer: "One meal is not a week. Next plate, back to the anchor.",
      },
      {
        situation: "A student says the scale has not moved in ten days",
        coach_answer:
          "Ten days is not a plateau, it is a Tuesday. Give me your waist and how you slept.",
        ...scope(["fat_loss"]),
      },
    ],
  };
}

async function publishDoctrine(coach: Coach, scoped: boolean): Promise<void> {
  const db = admin();
  await db.from("coach_doctrines").delete().eq("coach_id", coach.coachId);
  const { error } = await db.from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    ...doctrineRows(scoped),
    content_locale: "en",
    published_at: new Date().toISOString(),
    published_by: coach.userId,
  } as never);
  if (error) throw new Error(`coach_doctrines: ${error.message}`);
}

async function setGoal(student: Student, goal: string): Promise<void> {
  const { error } = await admin().from("student_goals").upsert({
    user_id: student.userId,
    goal,
    situation: "I train three times a week and cook at home most nights.",
    content_locale: "en",
  } as never, { onConflict: "user_id" });
  if (error) throw new Error(`student_goals: ${error.message}`);
}

// ---------------------------------------------------------------------------
// LES MARQUEURS — des phrases, pas des mots isolés. Un mot commun ("scale")
// apparaîtrait dans les deux réponses sans rien prouver.
// ---------------------------------------------------------------------------

const FAT_LOSS_MARKERS = [
  /one signal out of four/i,
  /slowest/i,
  /ten days is not a plateau/i,
  /it is a tuesday/i,
  /waist/i,
];
const RECOMP_MARKERS = [
  /more than you think/i,
  /under-?eating/i,
  /training days?/i,
];
const SHARED_MARKERS = [
  /anchor/i,
  /protein/i,
];

function hits(text: string, patterns: RegExp[]): string[] {
  return patterns.filter((p) => p.test(text)).map((p) => p.source);
}

function banner(title: string): void {
  console.log("\n" + "═".repeat(78));
  console.log(`▌ ${title}`);
  console.log("═".repeat(78));
}

function show(who: string, question: string, reply: string | null, ms: number): void {
  console.log(`\nÉLÈVE  [${who}] (${ms} ms) : ${question}`);
  console.log(`SOPHIA : ${reply ?? "(aucune réponse)"}`);
}

async function ask(
  student: Student,
  label: string,
  question: string,
): Promise<string> {
  const t0 = Date.now();
  const res = await turn(student, question);
  show(label, question, res.reply, Date.now() - t0);
  if (res.status !== 200) console.log(`  ⚠️ HTTP ${res.status}`);
  return res.reply ?? "";
}

// ---------------------------------------------------------------------------

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${name} — ${detail}`);
}

const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
await publishDoctrine(coach, true);

const amara = await makeStudent({ coach, fullName: "Amara", country: "GB" });
const nina = await makeStudent({ coach, fullName: "Nina", country: "GB" });
await publishPlanFor(coach, amara.userId);
await publishPlanFor(coach, nina.userId);
await setGoal(amara, "fat_loss");
await setGoal(nina, "recomposition");

console.log(`coach   = ${coach.coachId} (Marlow)`);
console.log(`amara   = ${amara.userId}  goal=fat_loss`);
console.log(`nina    = ${nina.userId}  goal=recomposition`);

// ===========================================================================
// 1. LA MÊME QUESTION, DEUX ÉLÈVES
// ===========================================================================

const QUESTION = "I've been at this for two weeks and the scale hasn't moved. What should I do?";

banner("1. LA MÊME QUESTION — amara (fat_loss) vs nina (recomposition)");
const amaraReply = await ask(amara, "amara/fat_loss", QUESTION);
const ninaReply = await ask(nina, "nina/recomposition", QUESTION);

console.log("");
const amaraFat = hits(amaraReply, FAT_LOSS_MARKERS);
const ninaFat = hits(ninaReply, FAT_LOSS_MARKERS);
const ninaRecomp = hits(ninaReply, RECOMP_MARKERS);
const amaraRecomp = hits(amaraReply, RECOMP_MARKERS);

check(
  "la doctrine fat_loss atteint amara",
  amaraFat.length > 0,
  `marqueurs fat_loss chez amara: ${JSON.stringify(amaraFat)}`,
);
check(
  "AUCUNE croyance fat_loss ne franchit la frontière vers nina",
  ninaFat.length === 0,
  `marqueurs fat_loss chez nina: ${JSON.stringify(ninaFat)}`,
);
check(
  "AUCUNE croyance recomposition ne franchit la frontière vers amara",
  amaraRecomp.length === 0,
  `marqueurs recomposition chez amara: ${JSON.stringify(amaraRecomp)}`,
);
console.log(`  ℹ️ marqueurs recomposition chez nina: ${JSON.stringify(ninaRecomp)}`);

const amaraShared = hits(amaraReply, SHARED_MARKERS);
const ninaShared = hits(ninaReply, SHARED_MARKERS);
console.log(
  `  ℹ️ noyau commun — amara ${JSON.stringify(amaraShared)} · nina ${JSON.stringify(ninaShared)}`,
);

// ===========================================================================
// 2. LE VERROU DES INTERDITS, DES DEUX CÔTÉS (§4)
// ===========================================================================

banner("2. L'INTERDIT — le même des deux côtés, et il doit rester EXPLICABLE");
const FORBIDDEN_Q = "Should I start counting calories to speed this up?";
const amaraForb = await ask(amara, "amara/fat_loss", FORBIDDEN_Q);
const ninaForb = await ask(nina, "nina/recomposition", FORBIDDEN_Q);

console.log("");
const endorses = (t: string) =>
  /\b(you should|start|try) (count|track)ing calories/i.test(t) ||
  /\byes,? count/i.test(t);
check(
  "l'interdit tient chez amara",
  !endorses(amaraForb),
  amaraForb.slice(0, 120),
);
check(
  "l'interdit tient chez nina — la portée ne l'a pas désarmé",
  !endorses(ninaForb),
  ninaForb.slice(0, 120),
);
// Le remplacement du coach, mot pour mot, doit rester atteignable des deux
// côtés: c'est ce que le verrou pose quand il mord, et ce que le prompt permet
// de dire quand il ne mord pas.
const buildsPlate = (t: string) => /build the plate|protein anchor|anchor/i.test(t);
check(
  "la réponse du coach (« on construit l'assiette ») sort des deux côtés",
  buildsPlate(amaraForb) && buildsPlate(ninaForb),
  `amara=${buildsPlate(amaraForb)} nina=${buildsPlate(ninaForb)}`,
);

// ── LA MESURE DU §4, ET C'EST LE CHIFFRE QUI COMPTE ─────────────────────
//
// Le défaut connu: le verrou de doctrine DÉTRUIT des réponses honnêtes —
// une explication d'un interdit, puis un récap parfaitement fondé, remplacés
// par une ligne hors sujet. N variantes multiplient mécaniquement les
// occasions de le déclencher. On joue donc les tours les plus exposés — ceux
// qui demandent d'EXPLIQUER l'interdit, là où le modèle doit nommer la chose
// interdite sans la recommander — sur LES DEUX variantes, et on compte.
banner("2 bis. LE VERROU NE DOIT PAS DÉTRUIRE DE RÉPONSE HONNÊTE (§4)");
const EXPOSED: Array<[string, string]> = [
  ["explique l'interdit", "What is calorie counting exactly, and why doesn't Marlow use it?"],
  ["récap après interdit", "Fine. So what did we agree I'm doing at lunch?"],
];
for (const [label, question] of EXPOSED) {
  await ask(amara, `amara/fat_loss · ${label}`, question);
  await ask(nina, `nina/recomposition · ${label}`, question);
}

const locks = await sql(`
  select count(*) filter (
           where metadata->'keel'->>'output_lock' is not null
              or metadata->>'output_lock' is not null
         ) as locked,
         count(*) as total
  from public.chat_messages
  where user_id in ('${amara.userId}','${nina.userId}') and role = 'assistant';
`);
console.log(`\nVERROUS DE SORTIE (§4, ne pas aggraver):\n${locks}`);

// ===========================================================================
// 3. LE CONTRE-FACTUEL — la même question, la même élève, portée retirée
// ===========================================================================

banner("3. CONTRE-FACTUEL — nina, la MÊME question, la croyance rendue GLOBALE");
console.log(
  "Si la phrase ciblée apparaît maintenant chez nina, c'est bien la PORTÉE\n" +
    "qui la retenait au tour 1. Si elle n'apparaît toujours pas, la preuve du\n" +
    "tour 1 ne vaut rien — c'est le modèle qui n'en voulait pas.\n",
);
await publishDoctrine(coach, false);
const nina2 = await makeStudent({ coach, fullName: "Nina2", country: "GB" });
await publishPlanFor(coach, nina2.userId);
await setGoal(nina2, "recomposition");
const nina2Reply = await ask(nina2, "nina2/recomposition (doctrine SANS portée)", QUESTION);

console.log("");
const nina2Fat = hits(nina2Reply, FAT_LOSS_MARKERS);
check(
  "sans portée, la même croyance ATTEINT une élève recomposition",
  nina2Fat.length > 0,
  `marqueurs fat_loss chez nina2: ${JSON.stringify(nina2Fat)}`,
);

// ===========================================================================
// 4. CE QUE LA BASE A VU
// ===========================================================================

banner("4. LA TRACE — quelle variante a servi, et ce qu'elle a coûté");
console.log(
  await sql(`
  select p.full_name, g.goal
  from public.student_goals g
  join public.profiles p on p.id = g.user_id
  where g.user_id in ('${amara.userId}','${nina.userId}','${nina2.userId}')
  order by p.full_name;
`),
);

banner("RÉSULTAT");
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.name}`);
console.log(`\n${results.length - failed.length}/${results.length} verts`);
if (failed.length > 0) Deno.exit(1);
