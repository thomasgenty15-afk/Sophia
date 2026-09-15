/**
 * D2 — LA PASSE ADVERSARIALE DU LOT DOCTRINE-BY-GOAL, en conditions réelles.
 *
 * D1 a prouvé le cas nominal. Celui-ci joue les cas où il casse:
 *
 *   A. FR — la portée est-elle une garde testée dans UNE SEULE LANGUE ?
 *   B. Un élève SANS `student_goals`.
 *   C. Un objectif qu'AUCUNE portée ne vise.
 *   D. Un CHANGEMENT d'objectif entre deux tours (§3.4).
 *   E. Une doctrine REPUBLIÉE entre deux tours.
 *
 * ── DEUX NIVEAUX DE PREUVE, ET LEUR ORDRE COMPTE ──────────────────────────
 * Chaque cas est d'abord vérifié sur le BLOC SERVI — lu par le vrai
 * `loadPublishedDoctrine`, contre la vraie base, pour l'élève réel. C'est
 * déterministe: ça répond à « qu'est-ce que cet élève reçoit », qui est la
 * question du lot.
 *
 * La conversation vient ensuite, et elle répond à une autre question: « le
 * modèle s'en sert-il ». Un tour où le modèle choisit de ne pas citer une
 * croyance ne prouve RIEN sur la portée — c'est le piège dans lequel la
 * première version de ce script est tombée, en assertant sur de la prose ce qui
 * se lit dans un bloc.
 *
 * ── ET LA LANGUE ──────────────────────────────────────────────────────────
 * Le modèle a répondu en ANGLAIS à une question française (la locale de l'élève
 * l'emporte sur `voice.language`). Les marqueurs de prose sont donc bilingues:
 * une garde vérifiée dans une seule langue est une garde à moitié vérifiée, et
 * ce dépôt a déjà payé ça.
 *
 * USAGE
 *   set -a; . supabase/functions/night_llm.env; set +a
 *   deno run -A docs/nutrition-pivot/qa-web/D2_doctrine_by_goal_adversarial.ts
 */
import {
  doctrineBlockFor,
  loadPublishedDoctrine,
} from "../../../supabase/functions/_shared/keel/doctrine_loader.ts";
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
async function ask(student: Student, label: string, question: string): Promise<string> {
  const t0 = Date.now();
  const res = await turn(student, question);
  console.log(`\nÉLÈVE  [${label}] (${Date.now() - t0} ms) : ${question}`);
  console.log(`SOPHIA : ${res.reply ?? "(aucune réponse)"}`);
  if (res.status !== 200) console.log(`  ⚠️ HTTP ${res.status}`);
  return res.reply ?? "";
}

/** LE BLOC RÉELLEMENT SERVI à cet élève, par le vrai chargeur de production. */
async function servedBlock(student: Student): Promise<{ block: string; goal: string; source: string }> {
  const loaded = await loadPublishedDoctrine(admin(), student.userId);
  return {
    block: doctrineBlockFor(loaded),
    goal: loaded.goal ?? "default",
    source: loaded.goalSource,
  };
}

// ---------------------------------------------------------------------------
// LA DOCTRINE — écrite en français, avec deux entrées ciblées.
// ---------------------------------------------------------------------------

const FR_DOCTRINE = {
  beliefs: [
    { claim: "Chaque repas se construit autour d'une ancre protéinée.", rationale: null },
    {
      claim: "La balance est le plus lent des quatre signaux.",
      rationale: "le tour de taille, l'énergie, la force et le sommeil bougent avant elle",
      goal_scope: ["fat_loss"],
    },
    {
      claim: "Les jours d'entraînement, mange plus que ce que tu crois.",
      rationale: null,
      goal_scope: ["recomposition"],
    },
  ],
  forbidden: [{
    token: "count_calories",
    surface_forms: ["compter les calories", "comptage des calories", "count calories", "counting calories"],
    reason: "les chiffres transforment le repas en note",
    instead: "On construit l'assiette : une ancre protéinée, des légumes pour le volume, un féculent à côté.",
  }],
  vocabulary: [{ term: "ancre", meaning: "la base protéinée d'une assiette" }],
  arbitrations: [{
    situation: "L'élève dit qu'il a craqué",
    coach_answer: "Un repas n'est pas une semaine. Prochaine assiette, on revient à l'ancre.",
  }],
  foods: { recommended: [{ term: "oeufs", reason: null }], discouraged: [] },
  qa: [],
  voice: { address: "tu", length: "short", emojis: "none", language: "fr-FR" },
};

const FAT_LOSS_CLAIM = "La balance est le plus lent des quatre signaux.";
const RECOMP_CLAIM = "Les jours d'entraînement, mange plus que ce que tu crois.";
const GLOBAL_CLAIM = "Chaque repas se construit autour d'une ancre protéinée.";

/** Marqueurs de PROSE, bilingues: le modèle traduit la doctrine qu'il applique. */
const FAT_LOSS_PROSE = [
  /plus lent|slowest/i,
  /quatre signaux|four signals/i,
  /tour de taille|waist/i,
];
const RECOMP_PROSE = [/plus que ce que tu crois|more than you think/i, /jours? d'entra|training days?/i];
const hits = (t: string, ps: RegExp[]) => ps.filter((p) => p.test(t)).map((p) => p.source);

async function publish(coach: Coach, doctrine: Record<string, unknown>): Promise<void> {
  const db = admin();
  await db.from("coach_doctrines").delete().eq("coach_id", coach.coachId);
  const { error } = await db.from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    ...doctrine,
    content_locale: "fr-FR",
    published_at: new Date().toISOString(),
    published_by: coach.userId,
  } as never);
  if (error) throw new Error(`coach_doctrines: ${error.message}`);
}

async function setGoal(student: Student, goal: string | null): Promise<void> {
  const db = admin();
  if (goal === null) {
    await db.from("student_goals").delete().eq("user_id", student.userId);
    return;
  }
  const { error } = await db.from("student_goals").upsert({
    user_id: student.userId,
    goal,
    situation: "Je m'entraîne trois fois par semaine.",
    content_locale: "fr-FR",
  } as never, { onConflict: "user_id" });
  if (error) throw new Error(`student_goals: ${error.message}`);
}

/**
 * UN COACH PAR PAIRE D'ÉLÈVES.
 *
 * Un coach en essai est plafonné à 3 sièges vivants (`keel_trial_seat_limit_reached`),
 * et c'est une garde du produit qu'on ne contourne pas pour un test. Chaque
 * coach publie la MÊME doctrine, donc les comparaisons restent valides — elles
 * portent sur la portée, pas sur l'identité du coach.
 */
const coachA = await makeCoach({ displayName: "Marlow", country: "FR" });
const coachB = await makeCoach({ displayName: "Marlow", country: "FR" });
await publish(coachA, FR_DOCTRINE);
await publish(coachB, FR_DOCTRINE);

// ===========================================================================
banner("A. FR — la portée mord-elle dans l'autre langue ?");
// ===========================================================================
const chloe = await makeStudent({ coach: coachA, fullName: "Chloé", country: "FR" });
const paul = await makeStudent({ coach: coachA, fullName: "Paul", country: "FR" });
await publishPlanFor(coachA, chloe.userId, { contentLocale: "fr-FR", timezone: "Europe/Paris" });
await publishPlanFor(coachA, paul.userId, { contentLocale: "fr-FR", timezone: "Europe/Paris" });
await setGoal(chloe, "fat_loss");
await setGoal(paul, "recomposition");

const chloeBlock = await servedBlock(chloe);
const paulBlock = await servedBlock(paul);
console.log(`\nBLOC SERVI — chloé: variante=${chloeBlock.goal} (${chloeBlock.source})`);
console.log(`BLOC SERVI — paul  : variante=${paulBlock.goal} (${paulBlock.source})`);

check(
  "FR/bloc: la croyance fat_loss est dans le bloc de chloé et PAS dans celui de paul",
  chloeBlock.block.includes(FAT_LOSS_CLAIM) && !paulBlock.block.includes(FAT_LOSS_CLAIM),
  `chloé=${chloeBlock.block.includes(FAT_LOSS_CLAIM)} paul=${paulBlock.block.includes(FAT_LOSS_CLAIM)}`,
);
check(
  "FR/bloc: la croyance recomposition est chez paul et PAS chez chloé",
  paulBlock.block.includes(RECOMP_CLAIM) && !chloeBlock.block.includes(RECOMP_CLAIM),
  `paul=${paulBlock.block.includes(RECOMP_CLAIM)} chloé=${chloeBlock.block.includes(RECOMP_CLAIM)}`,
);
check(
  "FR/bloc: le noyau et l'interdit sont dans LES DEUX",
  [chloeBlock, paulBlock].every((b) =>
    b.block.includes(GLOBAL_CLAIM) && b.block.includes("count_calories")
  ),
  "voix, vocabulaire et interdits communs",
);

const FR_Q = "Ça fait deux semaines et la balance ne bouge pas. Je fais quoi ?";
const chloeReply = await ask(chloe, "chloé/fat_loss/FR", FR_Q);
const paulReply = await ask(paul, "paul/recomposition/FR", FR_Q);
console.log("");
check(
  "FR/prose: rien de la croyance fat_loss ne ressort chez paul",
  hits(paulReply, FAT_LOSS_PROSE).length === 0,
  JSON.stringify(hits(paulReply, FAT_LOSS_PROSE)),
);
console.log(`  ℹ️ prose fat_loss chez chloé: ${JSON.stringify(hits(chloeReply, FAT_LOSS_PROSE))}`);
console.log(`  ℹ️ prose recomposition chez paul: ${JSON.stringify(hits(paulReply, RECOMP_PROSE))}`);
check(
  "FR: l'interdit reste global — aucun des deux ne se voit conseiller de compter",
  !/(tu (peux|devrais) compter|you should (start )?count)/i.test(chloeReply + paulReply),
  "aucune recommandation de comptage des deux côtés",
);

// ===========================================================================
banner("B + C. SANS OBJECTIF, ET UN OBJECTIF QU'AUCUNE PORTÉE NE VISE");
// ===========================================================================
const sans = await makeStudent({ coach: coachA, fullName: "SansObjectif", country: "FR" });
await publishPlanFor(coachA, sans.userId, { contentLocale: "fr-FR", timezone: "Europe/Paris" });
await setGoal(sans, null);

const sante = await makeStudent({ coach: coachB, fullName: "Santé", country: "FR" });
await publishPlanFor(coachB, sante.userId, { contentLocale: "fr-FR", timezone: "Europe/Paris" });
await setGoal(sante, "health");

const sansBlock = await servedBlock(sans);
const santeBlock = await servedBlock(sante);
console.log(`\nBLOC SERVI — sans objectif: variante=${sansBlock.goal} (${sansBlock.source})`);
console.log(`BLOC SERVI — santé (health): variante=${santeBlock.goal} (${santeBlock.source})`);

check(
  "sans student_goals: variante `default`, jamais une variante prise au hasard",
  sansBlock.goal === "default" && sansBlock.source === "none",
  `${sansBlock.goal}/${sansBlock.source}`,
);
check(
  "sans student_goals: le noyau OUI, les croyances ciblées NON",
  sansBlock.block.includes(GLOBAL_CLAIM) &&
    !sansBlock.block.includes(FAT_LOSS_CLAIM) && !sansBlock.block.includes(RECOMP_CLAIM),
  "noyau présent, ciblées absentes",
);
check(
  "health (aucune portée ne le vise): le noyau, et rien d'autre",
  santeBlock.goal === "health" && santeBlock.block.includes(GLOBAL_CLAIM) &&
    !santeBlock.block.includes(FAT_LOSS_CLAIM) && !santeBlock.block.includes(RECOMP_CLAIM),
  `variante=${santeBlock.goal}`,
);
check(
  "et le bloc `health` EST le bloc `default` — il ne coûte pas une entrée de cache",
  santeBlock.block === sansBlock.block,
  `${santeBlock.block.length} vs ${sansBlock.block.length} caractères`,
);

await ask(sans, "sans-objectif/FR", FR_Q);
await ask(sante, "santé/health/FR", FR_Q);

// ===========================================================================
banner("D. CHANGEMENT D'OBJECTIF ENTRE DEUX TOURS (§3.4)");
// ===========================================================================
console.log("\npaul passe de recomposition à fat_loss…");
await setGoal(paul, "fat_loss");
const paulAfterBlock = await servedBlock(paul);
console.log(`BLOC SERVI — paul après bascule: variante=${paulAfterBlock.goal} (${paulAfterBlock.source})`);
check(
  "la variante suit le changement, dès le tour suivant",
  paulAfterBlock.goal === "fat_loss" &&
    paulAfterBlock.block.includes(FAT_LOSS_CLAIM) &&
    !paulAfterBlock.block.includes(RECOMP_CLAIM),
  `variante=${paulAfterBlock.goal}`,
);
await ask(paul, "paul/fat_loss (après bascule)/FR", FR_Q);
const history = await sql(`
  select count(*) as tours_user from public.chat_messages
  where user_id = '${paul.userId}' and role = 'user';
`);
console.log(`\nLA CONVERSATION N'EST PAS REMISE À ZÉRO:\n${history}`);
check(
  "seule la doctrine change: la mémoire de conversation survit à la bascule",
  Number(history.split("\n")[1]?.trim() ?? "0") >= 2,
  history.replace(/\n/g, " "),
);

// ===========================================================================
banner("E. DOCTRINE REPUBLIÉE ENTRE DEUX TOURS");
// ===========================================================================
console.log("\nle coach B republie: la croyance ciblée fat_loss devient GLOBALE…");
await publish(coachB, {
  ...FR_DOCTRINE,
  beliefs: FR_DOCTRINE.beliefs.map((b) => ({ ...b, goal_scope: [] })),
});
const santeAfter = await servedBlock(sante);
check(
  "la republication atteint le tour suivant, sur une variante qui ne la recevait pas",
  santeAfter.block.includes(FAT_LOSS_CLAIM),
  `health voit maintenant la croyance: ${santeAfter.block.includes(FAT_LOSS_CLAIM)}`,
);
await ask(sante, "santé/health (après republication)/FR", FR_Q);

// ===========================================================================
banner("LE VERROU (§4) SUR TOUTE LA PASSE");
// ===========================================================================
console.log(
  await sql(`
  select count(*) filter (
           where metadata->'keel'->>'output_lock' is not null
              or metadata->>'output_lock' is not null
         ) as detruites_par_le_verrou,
         count(*) as reponses
  from public.chat_messages
  where user_id in ('${chloe.userId}','${paul.userId}','${sans.userId}','${sante.userId}')
    and role = 'assistant';
`),
);

banner("RÉSULTAT");
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.name}`);
console.log(`\n${results.length - failed.length}/${results.length} verts`);
if (failed.length > 0) Deno.exit(1);
