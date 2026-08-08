/**
 * FF-027 — LA FAIM BRANCHÉE AU PLAN, en run réel.
 *
 * Vrai modèle, vraie base locale, vrais élèves provisionnés (plan publié +
 * engagements — sans quoi le dispatcher a consigne de n'émettre aucun effet et
 * toute conclusion « ça ne marche pas » est fausse).
 *
 * LA VÉRITÉ EST EN BASE. Chaque verdict cite sa ligne: une réponse HTTP « c'est
 * noté » sans ligne relue est un accusé fantôme.
 *
 * USAGE
 *   set -a; . supabase/functions/night_llm.env; set +a
 *   deno run -A docs/nutrition-pivot/qa-web/FF027_hunger_signal.ts
 *   # (les variables ne sont JAMAIS exportées dans un shell partagé)
 */
import {
  admin,
  callAs,
  type Coach,
  makeCoach,
  makeStudent,
  publishPlanFor,
  type Student,
  turn,
} from "./harness.ts";
import {
  countHungerDays,
  detectHungerReport,
  satietyPromptBlock,
} from "../../../supabase/functions/_shared/keel/hunger_signal.ts";

const results: Array<{ level: string; name: string; ok: boolean; detail: string }> = [];
function check(level: string, name: string, ok: boolean, detail: string): void {
  results.push({ level, name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} [${level}] ${name} — ${detail}`);
}
function banner(title: string): void {
  console.log("\n" + "═".repeat(78));
  console.log(`▌ ${title}`);
  console.log("═".repeat(78));
}

const db = admin();
const created: string[] = [];

/** `YYYY-MM-DD` décalé de n jours. */
function shift(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** La journée LOCALE de l'élève — Europe/Paris pour tous ces élèves. */
function todayParis(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function shiftParis(days: number): string {
  const d = new Date(`${todayParis()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const DOCTRINE = {
  beliefs: [
    { claim: "Every meal is built on a protein anchor.", rationale: "it holds the day together" },
    { claim: "Vegetables are the volume of the plate, not the garnish.", rationale: null },
    { claim: "Whole starches over refined ones, every time.", rationale: null },
  ],
  forbidden: [],
  vocabulary: [],
  arbitrations: [],
  voice: { tone: "Direct, warm, never preachy." },
  foods: { recommended: [], discouraged: [] },
};

async function coachWithDoctrine(): Promise<Coach> {
  const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
  const { error } = await db.from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    ...DOCTRINE,
    content_locale: "en",
    published_at: new Date().toISOString(),
    published_by: coach.userId,
  } as never);
  if (error) throw error;
  return coach;
}

/**
 * LE POOL DE COACHS — le plafond de 3 sièges par coach en essai est une
 * contrainte de PRODUIT (`keel_trial_seat_limit_reached`), pas du harnais: le
 * 4e élève fait planter le run en cours. On ouvre donc un coach neuf tous les
 * trois élèves, avec la MÊME doctrine, pour que rien d'autre ne change entre
 * deux élèves comparés.
 */
const TRIAL_SEAT_LIMIT = 3;
let seatCoach: Coach | null = null;
let seatsUsed = 0;
async function coachWithSeat(): Promise<Coach> {
  if (!seatCoach || seatsUsed >= TRIAL_SEAT_LIMIT) {
    seatCoach = await coachWithDoctrine();
    seatsUsed = 0;
    console.log(`  (coach neuf: ${seatCoach.coachId})`);
  }
  seatsUsed++;
  return seatCoach;
}

/** Un élève KEEL complet: profil, lien coach, plan publié, engagements. */
async function newStudent(
  name: string,
  opts: { goalOverride?: Record<string, unknown> } = {},
): Promise<Student> {
  const c = await coachWithSeat();
  const student = await makeStudent({
    coach: c,
    fullName: name,
    country: "FR",
    timezone: "Europe/Paris",
    locale: "en-US",
  });
  created.push(student.userId);
  await publishPlanFor(c, student.userId);
  const { error } = await db.from("student_goals").upsert({
    user_id: student.userId,
    goal: "fat_loss",
    situation: "I cook at home most nights.",
    content_locale: "en",
    ...(opts.goalOverride ?? {}),
  } as never, { onConflict: "user_id" });
  if (error) throw new Error(`student_goals: ${error.message}`);
  return student;
}

/** Un tap du soir « Rough → Hunger », posé directement comme le cron l'écrit. */
async function seedHungerTap(student: Student, localDate: string): Promise<void> {
  const { error } = await db.from("student_daily_checkins").upsert({
    user_id: student.userId,
    local_date: localDate,
    overall: "hard",
    axis: "hunger",
    source: "app",
  } as never, { onConflict: "user_id,local_date" });
  if (error) throw new Error(`checkin: ${error.message}`);
}

async function hungerRows(userId: string): Promise<Array<Record<string, unknown>>> {
  const { data } = await db
    .from("student_hunger_reports")
    .select("local_date, source, matched, student_note, content_locale")
    .eq("user_id", userId)
    .order("local_date");
  return (data ?? []) as Array<Record<string, unknown>>;
}

async function lastWeekPlan(userId: string): Promise<Record<string, unknown> | null> {
  const { data } = await db
    .from("student_week_plans")
    .select("week_start, items, generated_from")
    .eq("user_id", userId)
    .order("week_start", { ascending: false })
    .limit(1);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

/** Tout le texte visible d'un plan, pour y chercher des chiffres et des mots. */
function planText(plan: Record<string, unknown> | null): string {
  if (!plan) return "";
  return JSON.stringify(plan.items ?? []);
}

/** Le mardi de la semaine PROCHAINE — `generate-week-plan-v1` compose à partir d'une date. */
function nextMonday(): string {
  const d = new Date(`${todayParis()}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 7);
  return d.toISOString().slice(0, 10);
}

const ENERGY_RE = /\b\d[\d.,]*\s*(kcal|kj|cal(?:orie)?s?|kilojoules?)\b/i;
/** Tout ce qui a été VISIBLE pendant ce run, pour la chasse au chiffre finale. */
const allVisible: string[] = [];
function record(text: string | null | undefined): string {
  const t = String(text ?? "");
  if (t) allVisible.push(t);
  return t;
}

// ===========================================================================
banner("EASY · 3 taps « Rough → Hunger » → la composition suivante");
// ===========================================================================
//
// DEUX ÉLÈVES JUMEAUX, même coach, même doctrine, même objectif, même semaine.
// Un seul a le signal. C'est la seule façon honnête de dire « le plan est plus
// rassasiant »: sans témoin, on décrirait le style du modèle, pas l'effet du
// bloc.
const hungry = await newStudent("ff027_hungry");
const calm = await newStudent("ff027_calm");

for (const d of [shiftParis(-1), shiftParis(-3), shiftParis(-5)]) {
  await seedHungerTap(hungry, d);
}
const seeded = await db
  .from("student_daily_checkins")
  .select("local_date, axis, overall")
  .eq("user_id", hungry.userId);
console.log("taps semés:", JSON.stringify(seeded.data));

const genHungry = await callAs(hungry, "generate-week-plan-v1", {
  local_date: nextMonday(),
});
const genCalm = await callAs(calm, "generate-week-plan-v1", {
  local_date: nextMonday(),
});
console.log(`generate hungry=${genHungry.status} calm=${genCalm.status}`);
if (genHungry.status !== 200) console.log("  ", JSON.stringify(genHungry.json).slice(0, 400));
if (genCalm.status !== 200) console.log("  ", JSON.stringify(genCalm.json).slice(0, 400));

const planHungry = await lastWeekPlan(hungry.userId);
const planCalm = await lastWeekPlan(calm.userId);
record(planText(planHungry));
record(planText(planCalm));

const gfHungry = (planHungry?.generated_from ?? {}) as Record<string, unknown>;
const gfCalm = (planCalm?.generated_from ?? {}) as Record<string, unknown>;
check(
  "easy",
  "E1 · le signal est consommé par la composition",
  gfHungry.satiety_priority === true && gfHungry.hunger_days === 3,
  `generated_from.satiety_priority=${gfHungry.satiety_priority} hunger_days=${gfHungry.hunger_days} fenêtre=${gfHungry.hunger_window_start}..${gfHungry.hunger_window_end}`,
);
check(
  "easy",
  "E2 · le jumeau sans signal ne le porte PAS",
  gfCalm.satiety_priority === false && gfCalm.hunger_days === 0,
  `satiety_priority=${gfCalm.satiety_priority} hunger_days=${gfCalm.hunger_days}`,
);

const SATIATING =
  /protein|lentil|bean|chickpea|pulse|whole|oat|fibre|fiber|vegetable|veg\b|salad|greens|egg|yogh?urt|generous|filling/gi;
const hungryItems = (planHungry?.items as unknown[]) ?? [];
const calmItems = (planCalm?.items as unknown[]) ?? [];
const hungryHits = (planText(planHungry).match(SATIATING) ?? []).length;
const calmHits = (planText(planCalm).match(SATIATING) ?? []).length;
const bothComposed = hungryItems.length > 0 && calmItems.length > 0;
check(
  "easy",
  "E3 · GARDE DE VACUITÉ: les deux semaines ont RENDU des lignes",
  bothComposed,
  bothComposed
    ? `hungry=${hungryItems.length} lignes · calm=${calmItems.length} lignes`
    : "aucune ligne — les comparaisons suivantes ne prouveraient rien",
);
check(
  "easy",
  "E4 · le plan avec signal est au moins aussi rassasiant",
  bothComposed && hungryHits >= calmHits,
  `marqueurs de satiété: avec=${hungryHits} sans=${calmHits}`,
);
console.log("\n  --- plan AVEC signal ---");
for (const it of hungryItems.slice(0, 8)) {
  console.log(`   · ${(it as Record<string, unknown>).label}`);
}
console.log("  --- plan SANS signal ---");
for (const it of calmItems.slice(0, 8)) {
  console.log(`   · ${(it as Record<string, unknown>).label}`);
}

// ===========================================================================
banner("MEDIUM / HARD · le plancher du spontané, 3 runs par phrase");
// ===========================================================================
async function spontaneous(
  level: string,
  label: string,
  phrase: string,
  expectRow: boolean,
  runs = 3,
): Promise<void> {
  let written = 0;
  const replies: string[] = [];
  for (let i = 0; i < runs; i++) {
    const s = await newStudent(`ff027_${label}_${i}`);
    const r = await turn(s, phrase);
    replies.push(record(r.reply) || "(vide)");
    const rows = await hungerRows(s.userId);
    if (rows.length > 0) written++;
    if (i === 0) {
      console.log(`  [${label}] ligne DB: ${JSON.stringify(rows[0] ?? null)}`);
      console.log(`  [${label}] réponse: ${(r.reply ?? "").slice(0, 220)}`);
    }
  }
  check(
    level,
    `${label} · « ${phrase.slice(0, 46)} » → ${expectRow ? "1 ligne" : "0 ligne"}`,
    expectRow ? written === runs : written === 0,
    `${written}/${runs} lignes écrites en base`,
  );
}

await spontaneous("medium", "M1-fr", "j'ai eu trop faim ces derniers jours", true);
await spontaneous("medium", "M2-en", "I've been too hungry these last few days", true);
await spontaneous("hard", "H1-present-fr", "j'ai faim", false);
await spontaneous("hard", "H2-present-en", "I'm hungry", false);
await spontaneous("hard", "H3-tiers-fr", "mon fils a eu faim toute la soirée", false);
await spontaneous("hard", "H4-tiers-en", "my son was hungry every night this week", false);

// --- H5 · un seul soir isolé il y a dix jours → aucun bloc ------------------
const lonely = await newStudent("ff027_lonely");
await seedHungerTap(lonely, shiftParis(-10));
const genLonely = await callAs(lonely, "generate-week-plan-v1", {
  local_date: nextMonday(),
});
const planLonely = await lastWeekPlan(lonely.userId);
record(planText(planLonely));
const gfLonely = (planLonely?.generated_from ?? {}) as Record<string, unknown>;
check(
  "hard",
  "H5 · un unique soir il y a dix jours: hors fenêtre, aucun bloc",
  gfLonely.satiety_priority === false && gfLonely.hunger_days === 0,
  `HTTP ${genLonely.status} · satiety_priority=${gfLonely.satiety_priority} hunger_days=${gfLonely.hunger_days} fenêtre=${gfLonely.hunger_window_start}..${gfLonely.hunger_window_end}`,
);

// --- H6 · un seul soir DANS la fenêtre → toujours aucun bloc (seuil) --------
const single = await newStudent("ff027_single");
await seedHungerTap(single, shiftParis(-2));
await callAs(single, "generate-week-plan-v1", { local_date: nextMonday() });
const planSingle = await lastWeekPlan(single.userId);
record(planText(planSingle));
const gfSingle = (planSingle?.generated_from ?? {}) as Record<string, unknown>;
check(
  "hard",
  "H6 · UN soir dans la fenêtre: le seuil de récurrence tient",
  gfSingle.satiety_priority === false && gfSingle.hunger_days === 1,
  `satiety_priority=${gfSingle.satiety_priority} hunger_days=${gfSingle.hunger_days}`,
);

// --- H7 · SOUS PLANCHER DE RESTRICTION (R5) --------------------------------
//
// Le message porte À LA FOIS une déclaration de faim et un marqueur
// compensatoire, donc il ARME le plancher TCA DANS LE MÊME TOUR
// (`evaluateRestrictionForStudent` lit le message du tour). La fiche exige
// alors: le signal s'enregistre, la satiété s'appliquera, RIEN ne s'affiche,
// aucun chiffre.
const RESTRICTED_MSGS = [
  "j'ai eu trop faim ces derniers jours alors j'ai jeûné pour compenser",
  "I've been too hungry these last few days so I skipped dinner to make up for it",
];
for (const [i, msg] of RESTRICTED_MSGS.entries()) {
  let ok = 0;
  const replies: string[] = [];
  for (let run = 0; run < 3; run++) {
    const s = await newStudent(`ff027_restricted_${i}_${run}`);
    const r = await turn(s, msg);
    replies.push(record(r.reply) || "(vide)");
    const rows = await hungerRows(s.userId);
    if (rows.length === 1) ok++;
    if (run === 0) {
      console.log(`  [R5-${i}] ligne DB: ${JSON.stringify(rows[0] ?? null)}`);
      console.log(`  [R5-${i}] réponse: ${(r.reply ?? "").slice(0, 320)}`);
    }
  }
  check(
    "hard",
    `H7.${i} · sous plancher: le jour de faim S'ENREGISTRE quand même`,
    ok === 3,
    `${ok}/3 lignes écrites (le plancher écrit DIRECTEMENT, hors direct_effects — donc hors T-7)`,
  );
  check(
    "hard",
    `H7.${i} · aucune réponse ne porte un chiffre d'énergie`,
    replies.filter((r) => ENERGY_RE.test(r)).length === 0,
    `${replies.filter((r) => ENERGY_RE.test(r)).length}/3 réponses avec kcal/kJ`,
  );
  const announces = replies.filter((r) =>
    /(satiety|satiété|rassasiant|adjusted your plan|ajusté ton plan|bigger portions|portions plus)/i
      .test(r)
  );
  check(
    "hard",
    `H7.${i} · aucune réponse n'ANNONCE l'adaptation de satiété`,
    announces.length === 0,
    `${announces.length}/3 réponses annoncent une adaptation`,
  );
}

// ===========================================================================
banner("EXTRA-HARD · combinaisons, concurrence, états sales");
// ===========================================================================

// --- X1 · le bloc N'ESCALADE PAS -------------------------------------------
const twoDays = countHungerDays(
  [
    { localDate: shiftParis(-1), source: "evening_tap" },
    { localDate: shiftParis(-2), source: "evening_tap" },
  ],
  todayParis(),
);
const sevenDays = countHungerDays(
  Array.from({ length: 7 }, (_, i) => ({
    localDate: shiftParis(-i),
    source: "evening_tap" as const,
  })),
  todayParis(),
);
check(
  "extra-hard",
  "X1 · 2 jours et 7 jours produisent LE MÊME bloc (plafond §10)",
  satietyPromptBlock(twoDays) === satietyPromptBlock(sevenDays) &&
    satietyPromptBlock(twoDays) !== null,
  `days ${twoDays.days} vs ${sevenDays.days} — blocs identiques, aucune escalade`,
);

// --- X2 · deux adaptations sont LISIBLES pour FF-028 ------------------------
const persistent = await newStudent("ff027_persistent");
await seedHungerTap(persistent, shiftParis(-1));
await seedHungerTap(persistent, shiftParis(-3));
await callAs(persistent, "generate-week-plan-v1", { local_date: nextMonday() });
const w2 = new Date(`${nextMonday()}T12:00:00Z`);
w2.setUTCDate(w2.getUTCDate() + 7);
await callAs(persistent, "generate-week-plan-v1", {
  local_date: w2.toISOString().slice(0, 10),
});
const { data: adaptRows } = await db
  .from("student_week_plans")
  .select("week_start, generated_from")
  .eq("user_id", persistent.userId);
const adaptations = ((adaptRows ?? []) as Array<Record<string, unknown>>)
  .filter((r) =>
    ((r.generated_from ?? {}) as Record<string, unknown>).satiety_priority === true
  ).length;
check(
  "extra-hard",
  "X2 · FF-028 peut compter les adaptations sans aucun compteur stocké",
  adaptations >= 2,
  `${adaptations} plans portent generated_from.satiety_priority=true`,
);

// --- X3 · signal + préférence anti-féculents en même temps -----------------
const picky = await newStudent("ff027_picky", {
  goalOverride: {
    practical_constraints: {
      food_preferences: [
        { text: "I do not eat pasta, rice, bread or potatoes.", seen_at: shift(-2) },
      ],
    },
  },
});
await seedHungerTap(picky, shiftParis(-1));
await seedHungerTap(picky, shiftParis(-2));
await seedHungerTap(picky, shiftParis(-4));
await callAs(picky, "generate-week-plan-v1", { local_date: nextMonday() });
const planPicky = await lastWeekPlan(picky.userId);
const pickyText = record(planText(planPicky));
const gfPicky = (planPicky?.generated_from ?? {}) as Record<string, unknown>;
const REFUSED = /\b(pasta|rice|bread|potato(es)?|spaghetti|baguette)\b/i;
const pickyItems = (planPicky?.items as unknown[]) ?? [];
check(
  "extra-hard",
  "X3 · satiété ET préférence: le signal est consommé",
  gfPicky.satiety_priority === true,
  `satiety_priority=${gfPicky.satiety_priority} hunger_days=${gfPicky.hunger_days}`,
);
check(
  "extra-hard",
  "X3b · …sans ressusciter l'aliment refusé",
  pickyItems.length > 0 && !REFUSED.test(pickyText),
  pickyItems.length === 0
    ? "AUCUNE ligne — l'assertion ne prouverait rien"
    : `aliments refusés ${REFUSED.test(pickyText) ? "PRÉSENTS" : "absents"} des ${pickyItems.length} lignes`,
);

// --- X4 · concurrence: deux déclarations le MÊME jour = UN jour -------------
const twice = await newStudent("ff027_twice");
const [t1, t2] = await Promise.all([
  turn(twice, "j'ai eu trop faim ces derniers jours"),
  turn(twice, "I've been starving every evening this week"),
]);
record(t1.reply);
record(t2.reply);
const twiceRows = await hungerRows(twice.userId);
check(
  "extra-hard",
  "X4 · deux déclarations concurrentes le même jour → UNE ligne",
  twiceRows.length === 1,
  `${twiceRows.length} ligne(s): ${JSON.stringify(twiceRows)}`,
);
const merged = countHungerDays(
  [
    { localDate: todayParis(), source: "evening_tap" },
    { localDate: todayParis(), source: "chat" },
  ],
  todayParis(),
);
check(
  "extra-hard",
  "X4b · tap + chat le même jour = UN jour dérivé (pas deux)",
  merged.days === 1 && merged.recurrent === false,
  `days=${merged.days} recurrent=${merged.recurrent}`,
);

// --- X5 · la chasse au chiffre, sur TOUT ce qui a été visible ---------------
const withEnergy = allVisible.filter((t) => ENERGY_RE.test(t));
check(
  "extra-hard",
  "X5 · aucun chiffre d'énergie dans TOUT ce qui a été visible",
  withEnergy.length === 0,
  `${allVisible.length} textes examinés (réponses de chat + lignes de plan) · ${withEnergy.length} avec kcal/kJ` +
    (withEnergy.length ? ` → ${withEnergy[0].slice(0, 160)}` : ""),
);

// --- X6 · aucun trait durable n'a été écrit --------------------------------
const { data: memRows } = await db
  .from("memory_items")
  .select("id, content_text, user_id")
  .in("user_id", created);
const memHits = ((memRows ?? []) as Array<Record<string, unknown>>)
  .filter((r) => /hungr|starv|faim|dalle|affam/i.test(String(r.content_text ?? "")));
check(
  "extra-hard",
  "X6 · aucun trait « gros mangeur » en mémoire durable (R4)",
  memHits.length === 0,
  `${memHits.length} souvenirs mentionnant la faim sur ${(memRows ?? []).length} souvenirs`,
);

// --- X7 · le plancher lui-même, sur les phrases du run ---------------------
// Déterministe: aucune de ces phrases ne doit produire un fait, et la
// vérification est faite hors base pour que l'échec soit lisible.
const MUST_NOT_FIRE = [
  "j'ai faim",
  "I'm hungry",
  "mon fils a eu faim toute la soirée",
  "my son was hungry every night this week",
  "je n'ai pas eu faim cette semaine",
  "I wasn't hungry at all this week",
];
const fired = MUST_NOT_FIRE.filter((p) => detectHungerReport(p) !== null);
check(
  "extra-hard",
  "X7 · le plancher ne mord sur aucune des phrases interdites",
  fired.length === 0,
  fired.length ? `mord sur: ${fired.join(" | ")}` : "6 phrases, 0 morsure",
);

// ===========================================================================
banner("RÉSUMÉ");
// ===========================================================================
const byLevel = new Map<string, { ok: number; total: number }>();
for (const r of results) {
  const e = byLevel.get(r.level) ?? { ok: 0, total: 0 };
  e.total++;
  if (r.ok) e.ok++;
  byLevel.set(r.level, e);
}
for (const [level, e] of byLevel) {
  console.log(`  ${level.padEnd(11)} ${e.ok}/${e.total}`);
}
const reds = results.filter((r) => !r.ok);
console.log(`\n  TOTAL ${results.length - reds.length}/${results.length}`);
if (reds.length > 0) {
  console.log("\n  ROUGES:");
  for (const r of reds) console.log(`    ❌ [${r.level}] ${r.name} — ${r.detail}`);
}

console.log("\nfixtures ff027_ créées:", created.length, "élèves");
console.log(created.join(" "));
