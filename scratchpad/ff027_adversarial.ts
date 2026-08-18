/**
 * FF-027 — LA PASSE ADVERSARIALE, en run réel.
 *
 * Chaque hypothèse est écrite AVANT d'être jouée (voir RAPPORT-FF-027.md §4).
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
} from "../docs/nutrition-pivot/qa-web/harness.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";

const db = admin();
const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${name} — ${detail}`);
}
function banner(t: string): void {
  console.log("\n" + "═".repeat(78) + `\n▌ ${t}\n` + "═".repeat(78));
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
let seatCoach: Coach | null = null;
let seats = 0;
const created: string[] = [];
async function newStudent(
  name: string,
  opts: { timezone?: string; withPlan?: boolean; goal?: Record<string, unknown> } = {},
): Promise<Student> {
  if (!seatCoach || seats >= 3) {
    seatCoach = await coachWithDoctrine();
    seats = 0;
  }
  seats++;
  const s = await makeStudent({
    coach: seatCoach,
    fullName: name,
    country: "FR",
    timezone: opts.timezone ?? "Europe/Paris",
    locale: "en-US",
  });
  created.push(s.userId);
  if (opts.withPlan !== false) await publishPlanFor(seatCoach, s.userId);
  const { error } = await db.from("student_goals").upsert({
    user_id: s.userId,
    goal: "fat_loss",
    situation: "I cook at home most nights.",
    content_locale: "en",
    ...(opts.goal ?? {}),
  } as never, { onConflict: "user_id" });
  if (error) throw new Error(`student_goals: ${error.message}`);
  return s;
}
function localDateIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function nextMondayParis(): string {
  const d = new Date(`${localDateIn("Europe/Paris")}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 7);
  return d.toISOString().slice(0, 10);
}
async function rows(userId: string) {
  const { data } = await db
    .from("student_hunger_reports")
    .select("local_date, source, matched")
    .eq("user_id", userId);
  return (data ?? []) as Array<Record<string, unknown>>;
}

// ===========================================================================
banner("A1 · LA SYMÉTRIE INTERDITE — « pas faim » ne produit RIEN");
// ===========================================================================
// Hypothèse: un message qui NIE la faim pourrait, par un chemin quelconque,
// produire une réduction ou au moins un fait. Il ne doit produire ni l'un ni
// l'autre — et le plan composé derrière doit être STRICTEMENT celui d'avant.
for (const msg of [
  "je n'ai pas eu faim du tout cette semaine, je suis calé après chaque repas",
  "I haven't been hungry at all this week, the meals keep me full",
]) {
  const s = await newStudent(`ff027adv_nohunger_${msg.slice(0, 4)}`);
  const r = await turn(s, msg);
  const got = await rows(s.userId);
  const gen = await callAs(s, "generate-week-plan-v1", {
    local_date: nextMondayParis(),
  });
  const { data: plan } = await db
    .from("student_week_plans")
    .select("generated_from, items")
    .eq("user_id", s.userId)
    .order("week_start", { ascending: false })
    .limit(1);
  const gf = ((plan ?? [])[0] as Record<string, unknown> | undefined)
    ?.generated_from as Record<string, unknown> ?? {};
  check(
    `A1 · « ${msg.slice(0, 34)}… » n'écrit aucun fait`,
    got.length === 0,
    `${got.length} ligne(s) · réponse: ${(r.reply ?? "").slice(0, 90)}`,
  );
  check(
    `A1 · …et la composition ne porte AUCUN marqueur de réduction`,
    gf.satiety_priority === false && gf.hunger_days === 0,
    `HTTP ${gen.status} · satiety_priority=${gf.satiety_priority} hunger_days=${gf.hunger_days} · aucune clé « reduce/less » n'existe dans generated_from: ${
      Object.keys(gf).filter((k) => /less|reduc|small|lower/i.test(k)).length
    }`,
  );
}

// ===========================================================================
banner("A2 · LE FUSEAU — le fait est daté dans la journée de l'ÉLÈVE");
// ===========================================================================
// Hypothèse: le fait pourrait être daté avec l'horloge du serveur, et se ranger
// la veille (ou le lendemain) pour un élève à l'autre bout du monde — soit une
// fenêtre de récurrence fausse.
const nz = await newStudent("ff027adv_nz", { timezone: "Pacific/Honolulu" });
await turn(nz, "j'ai eu trop faim ces derniers jours");
const nzRows = await rows(nz.userId);
const nzExpected = localDateIn("Pacific/Honolulu");
const serverDate = new Date().toISOString().slice(0, 10);
check(
  "A2 · la ligne porte la journée LOCALE de l'élève",
  nzRows.length === 1 && String(nzRows[0].local_date) === nzExpected,
  `ligne=${nzRows[0]?.local_date} · attendu(Honolulu)=${nzExpected} · serveur(UTC)=${serverDate}`,
);

// ===========================================================================
banner("A3 · SANS PLAN PUBLIÉ — le plancher ne casse rien");
// ===========================================================================
// Hypothèse: sans plan publié le dispatcher n'émet aucun effet; le plancher,
// lui, écrit DIRECTEMENT. Il ne doit ni planter le tour ni rester muet.
const noplan = await newStudent("ff027adv_noplan", { withPlan: false });
const noplanTurn = await turn(noplan, "j'ai eu trop faim ces derniers jours");
const noplanRows = await rows(noplan.userId);
check(
  "A3 · sans plan publié: le tour répond ET le fait s'écrit",
  noplanTurn.status === 200 && noplanRows.length === 1,
  `HTTP ${noplanTurn.status} · ${noplanRows.length} ligne(s) · réponse: ${
    (noplanTurn.reply ?? "").slice(0, 80)
  }`,
);

// ===========================================================================
banner("A4 · RLS — un élève ne lit pas la faim d'un autre");
// ===========================================================================
// Hypothèse: la table est neuve; `authenticated` reçoit TOUT par défaut chez
// Supabase, et une policy manquante donnerait tout. On lit avec le JWT d'un
// AUTRE élève.
const victim = await newStudent("ff027adv_victim");
await turn(victim, "j'ai eu trop faim ces derniers jours");
const nosy = await newStudent("ff027adv_nosy");
const anon = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${nosy.accessToken}` } },
  },
);
const leak = await anon
  .from("student_hunger_reports")
  .select("id, user_id, student_note");
check(
  "A4 · le JWT d'un autre élève ne rend AUCUNE ligne",
  (leak.data ?? []).length === 0,
  `${(leak.data ?? []).length} ligne(s) rendues · erreur=${leak.error?.message ?? "aucune"}`,
);
const own = await anon
  .from("student_hunger_reports")
  .select("id")
  .eq("user_id", nosy.userId);
check(
  "A4b · …et il lit bien SES propres lignes (la policy n'est pas un mur)",
  !own.error,
  `erreur=${own.error?.message ?? "aucune"} · ${(own.data ?? []).length} ligne(s)`,
);

// ===========================================================================
banner("A5 · generate-meal-v1 — le chemin SUFFIXE, sur de vrais plats");
// ===========================================================================
// Hypothèse: le bloc greffé en suffixe (et pas en paramètre nommé) pourrait ne
// jamais atteindre le modèle. Deux jumeaux, un vrai repas chacun.
async function cook(s: Student): Promise<{ dishes: string; gf: Record<string, unknown> }> {
  const res = await callAs(s, "generate-meal-v1", {
    mode: "to_shop",
    window: { kind: "days", count: 2 },
    intent: "prepare_next",
    servings: 1,
    context: "Nothing special today.",
  });
  if (res.status !== 200) console.log("   ", JSON.stringify(res.json).slice(0, 300));
  const { data } = await db
    .from("student_generated_meals")
    .select("dishes, generated_from")
    .eq("user_id", s.userId)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = ((data ?? [])[0] ?? {}) as Record<string, unknown>;
  console.log(`   HTTP ${res.status} · plats: ${
    ((res.json?.dishes ?? []) as Array<Record<string, unknown>>).map((d) => d.title).join(" | ")
  }`);
  return {
    dishes: JSON.stringify(row.dishes ?? res.json?.dishes ?? []),
    gf: (row.generated_from ?? {}) as Record<string, unknown>,
  };
}
const mealHungry = await newStudent("ff027adv_mealhungry");
const mealCalm = await newStudent("ff027adv_mealcalm");
const paris = localDateIn("Europe/Paris");
for (const k of [-1, -2, -4]) {
  const d = new Date(`${paris}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + k);
  await db.from("student_daily_checkins").insert({
    user_id: mealHungry.userId,
    local_date: d.toISOString().slice(0, 10),
    overall: "hard",
    axis: "hunger",
    source: "app",
  } as never);
}
console.log("  [avec signal]");
const cookedHungry = await cook(mealHungry);
console.log("  [sans signal]");
const cookedCalm = await cook(mealCalm);
check(
  "A5 · la composition de repas consomme le signal",
  cookedHungry.gf.satiety_priority === true && cookedCalm.gf.satiety_priority === false,
  `avec=${cookedHungry.gf.satiety_priority}/${cookedHungry.gf.hunger_days}j · sans=${cookedCalm.gf.satiety_priority}/${cookedCalm.gf.hunger_days}j`,
);
const ENERGY = /\b\d[\d.,]*\s*(kcal|kj|cal(?:orie)?s?)\b/i;
check(
  "A5b · aucun chiffre d'énergie dans les plats produits",
  !ENERGY.test(cookedHungry.dishes) && !ENERGY.test(cookedCalm.dishes),
  "kcal/kJ absents des deux compositions",
);
const HUNGER_WORDS = /\b(hunger|hungry|starv|appetite|satiety|appétit|faim|rassasi)\b/i;
check(
  "A5c · aucun plat ne PARLE de la faim (R5, inconditionnel)",
  !HUNGER_WORDS.test(cookedHungry.dishes),
  HUNGER_WORDS.test(cookedHungry.dishes)
    ? `fuite: ${(cookedHungry.dishes.match(/[^"]*(hunger|hungry|satiety)[^"]*/i) ?? [""])[0].slice(0, 160)}`
    : "aucune mention",
);

// ===========================================================================
banner("A6 · LA PURGE — les vieux faits partent, ceux de la fenêtre restent");
// ===========================================================================
// Hypothèse: sans élagage, une table de faits éphémères devient un historique,
// puis un trait. On sème un fait à J-90 et on déclenche une écriture.
const purged = await newStudent("ff027adv_purge");
const old = new Date(`${paris}T12:00:00Z`);
old.setUTCDate(old.getUTCDate() - 90);
await db.from("student_hunger_reports").insert({
  user_id: purged.userId,
  local_date: old.toISOString().slice(0, 10),
  source: "chat",
  matched: "seed",
  student_note: "seed",
  content_locale: "fr-FR",
} as never);
const beforePurge = await rows(purged.userId);
await turn(purged, "j'ai eu trop faim ces derniers jours");
const afterPurge = await rows(purged.userId);
check(
  "A6 · le fait de J-90 est purgé, celui du jour reste",
  beforePurge.length === 1 && afterPurge.length === 1 &&
    String(afterPurge[0].local_date) === paris,
  `avant=${beforePurge.length} après=${afterPurge.length} (${afterPurge.map((r) => r.local_date).join(",")})`,
);

// ===========================================================================
banner("RÉSUMÉ");
// ===========================================================================
const reds = results.filter((r) => !r.ok);
console.log(`  TOTAL ${results.length - reds.length}/${results.length}`);
for (const r of reds) console.log(`    ❌ ${r.name} — ${r.detail}`);
console.log("\nfixtures:", created.join(" "));
