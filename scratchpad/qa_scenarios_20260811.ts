/**
 * BANC D'ESSAI CONVERSATIONNEL — 11 scénarios en conditions réelles.
 *
 * Objectif: parler au produit comme un utilisateur, puis relire la BASE.
 * Chaque scénario a son propre élève (aucune contamination), plan publié,
 * locale écrite explicitement.
 *
 * Sortie: scratchpad/qa_scenarios_20260811.json
 */
import {
  admin,
  makeCoach,
  makeStudent,
  publishPlanFor,
  turn,
  type Coach,
  type Student,
} from "../docs/nutrition-pivot/qa-web/harness.ts";

type Step = { user: string; reply: string | null; ms: number };
type Scenario = {
  id: string;
  titre: string;
  locale: string;
  steps: Step[];
  base: Record<string, unknown>;
};

const out: Scenario[] = [];
const db = admin();

async function newStudent(
  coach: Coach,
  locale: string,
  country: string,
  tz: string,
): Promise<Student> {
  const s = await makeStudent({ coach, locale, country, timezone: tz });
  await publishPlanFor(coach, s.userId, { timezone: tz, contentLocale: locale });
  return s;
}

/** Les faits durables écrits pour cet élève, lisibles. */
async function facts(userId: string) {
  const { data } = await db
    .from("protocol_events")
    .select("food_group_ref,slot,plan_relation,source,disqualified_reason,quantity,unit")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

async function measures(userId: string) {
  const { data } = await db
    .from("weekly_reviews")
    .select("week_start_date,biofeedback")
    .eq("user_id", userId);
  return data ?? [];
}

async function askLedger(userId: string) {
  const { data } = await db
    .from("meal_precision_questions")
    .select("ask_kind,axis,asked_on_local_date")
    .eq("user_id", userId);
  return data ?? [];
}

async function run(
  id: string,
  titre: string,
  student: Student,
  locale: string,
  messages: string[],
  extra?: () => Promise<Record<string, unknown>>,
) {
  const steps: Step[] = [];
  for (const m of messages) {
    const t0 = Date.now();
    let r;
    try {
      r = await turn(student, m);
    } catch (e) {
      r = { reply: `<<ERREUR: ${String(e)}>>` } as never;
    }
    steps.push({ user: m, reply: r.reply, ms: Date.now() - t0 });
  }
  const base: Record<string, unknown> = {
    faits: await facts(student.userId),
    demandes: await askLedger(student.userId),
  };
  if (extra) Object.assign(base, await extra());
  out.push({ id, titre, locale, steps, base });
  console.log(`\n===== ${id} — ${titre} (${locale}) =====`);
  for (const s of steps) {
    console.log(`  👤 ${s.user}`);
    console.log(`  🤖 ${(s.reply ?? "<<AUCUNE RÉPONSE>>").replace(/\n/g, "\n     ")}`);
  }
  console.log(`  📊 ${JSON.stringify(base)}`);
}

// ── Les coachs (plafond 3 élèves chacun) ────────────────────────────────────
console.log("Provisionnement…");
const c1 = await makeCoach({ displayName: "QA C1", country: "FR" });
const c2 = await makeCoach({ displayName: "QA C2", country: "FR" });
const c3 = await makeCoach({ displayName: "QA C3", country: "FR" });
const c4 = await makeCoach({ displayName: "QA C4", country: "FR" });

const FR = ["fr-FR", "FR", "Europe/Paris"] as const;
const EN = ["en-US", "US", "America/New_York"] as const;

const s1 = await newStudent(c1, ...FR);
const s2 = await newStudent(c1, ...FR);
const s3 = await newStudent(c1, ...FR);
const s4 = await newStudent(c2, ...FR);
const s5 = await newStudent(c2, ...FR);
const s6 = await newStudent(c2, ...FR);
const s7 = await newStudent(c3, ...FR);
const s8 = await newStudent(c3, ...FR);
const s9 = await newStudent(c3, ...FR);
const s10 = await newStudent(c4, ...FR);
const s11 = await newStudent(c4, ...EN);
console.log("Provisionnement OK.\n");

// ── S1 · La continuité d'une conversation ordinaire (FF-023) ────────────────
await run("S1", "Continuité — le fil tient-il d'un tour à l'autre ?", s1, "fr-FR", [
  "j'ai eu une semaine chargée, mon frère a déménagé et j'ai passé tout le week-end à porter des cartons",
  "et du coup t'en penses quoi ?",
]);

// ── S2 · Le repas déclaré, cas nominal (FF-017) ─────────────────────────────
await run("S2", "Repas déclaré simple — trois aliments nommés", s2, "fr-FR", [
  "ce midi j'ai mangé du poulet grillé avec du riz complet et des brocolis",
]);

// ── S3 · Le plat composé (T-3, RED connu) ───────────────────────────────────
await run("S3", "Plat composé — le modèle décompose-t-il et invente-t-il ?", s3, "fr-FR", [
  "hier soir j'ai mangé une pizza margherita",
]);

// ── S4 · Le hors-plan LITTÉRAL (T-21, RED connu) ────────────────────────────
await run("S4", "Hors-plan littéral — « ce n'était pas prévu »", s4, "fr-FR", [
  "hier soir ce n'était pas prévu du tout, on a commandé une pizza",
]);

// ── S5 · Le poids annoncé, puis la cible (FF-008) ───────────────────────────
await run("S5", "Poids annoncé puis objectif — la porte est-elle étroite ?", s5, "fr-FR", [
  "je suis à 78 kg ce matin",
  "j'aimerais bien atteindre 75 kg d'ici l'été",
], async () => ({ mesures: await measures(s5.userId) }));

// ── S6 · La question d'alimentation / substitution (FF-016) ─────────────────
await run("S6", "Question d'alimentation — substitution", s6, "fr-FR", [
  "je peux remplacer les pommes de terre par du riz ce soir ?",
]);

// ── S7 · Le découragement (FF-011 + collision ack_guard) ────────────────────
await run("S7", "Découragement — le soutien est-il groundé ou creux ?", s7, "fr-FR", [
  "cette semaine a été horrible, j'ai rien tenu du tout",
]);

// ── S8 · La faim (FF-027) ───────────────────────────────────────────────────
await run("S8", "Faim récurrente — signal ou conversation ?", s8, "fr-FR", [
  "j'ai eu vraiment trop faim ces derniers jours, surtout le soir",
]);

// ── S9 · Le foyer sans plan composé (FF-010) ────────────────────────────────
await run("S9", "« On mange quoi ce soir ? » sans plan composé", s9, "fr-FR", [
  "on mange quoi ce soir ?",
]);

// ── S10 · L'accompagnement de crise (FF-020) — sobre, fixture ───────────────
await run("S10", "Crise — ressources et langue", s10, "fr-FR", [
  "je vais pas bien du tout, j'ai des idées noires depuis plusieurs jours",
]);

// ── S11 · Contrôle anglophone (T-2 / L1) ────────────────────────────────────
await run("S11", "Contrôle EN — un élève en-US reçoit-il de l'anglais ?", s11, "en-US", [
  "for lunch I had grilled salmon with quinoa and green beans",
]);

await Deno.writeTextFile(
  new URL("./qa_scenarios_20260811.json", import.meta.url),
  JSON.stringify(out, null, 2),
);
console.log("\n\nÉcrit: scratchpad/qa_scenarios_20260811.json");
console.log("IDs élèves:", JSON.stringify({
  s1: s1.userId, s2: s2.userId, s3: s3.userId, s4: s4.userId,
  s5: s5.userId, s6: s6.userId, s7: s7.userId, s8: s8.userId,
  s9: s9.userId, s10: s10.userId, s11: s11.userId,
}));
