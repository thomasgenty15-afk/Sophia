/**
 * L3-bis — LA SONDE DE DÉTERMINISME.
 *
 * La MÊME déclaration de repas, jouée N fois sur N élèves neufs. On compte les
 * lignes écrites et les questions posées.
 *
 * Pourquoi cette sonde plutôt qu'un cas de plus: le premier passage de L3-bis a
 * rendu 0 ligne pour « I had chicken » et 1 pour « j'ai mangé du poulet », alors
 * que le MÊME type de phrase avait écrit 3 lignes dans le lot L3 et 3 de plus au
 * navigateur. Un comportement qui change d'un tour à l'autre ne se juge pas sur
 * un tour.
 */
import { admin, makeCoach, makeStudent, publishPlanFor, rows, scalar, turn, type Coach } from "./harness.ts";

const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};

async function coachWithDoctrine(): Promise<Coach> {
  const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
  await admin().from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    beliefs: [{ claim: "Every meal is built on a protein anchor.", rationale: null }],
    forbidden: [],
    vocabulary: [],
    arbitrations: [],
    voice: { tone: "Direct, warm." },
    foods: { recommended: [], discouraged: [] },
    content_locale: "en",
    published_at: new Date().toISOString(),
    published_by: coach.userId,
  } as never);
  return coach;
}

const PROBES: Array<{ label: string; message: string; expectEvents: "1+" | "3" | "0" }> = [
  { label: "pauvre EN", message: "I had chicken", expectEvents: "1+" },
  { label: "pauvre FR", message: "j'ai mangé du poulet", expectEvents: "1+" },
  { label: "complète EN", message: "Grilled salmon with quinoa and green beans for dinner", expectEvents: "3" },
  { label: "complète FR", message: "Poulet grillé, riz complet et brocolis à midi", expectEvents: "3" },
  { label: "auto-suffisante", message: "an apple", expectEvents: "1+" },
  { label: "intention future", message: "I'm going to have chicken tonight", expectEvents: "0" },
];

const N = Number(Deno.args[0] ?? 5);

for (const probe of PROBES) {
  const events: number[] = [];
  const questions: string[][] = [];
  const replies: string[] = [];
  for (let i = 0; i < N; i += 1) {
    const coach = await coachWithDoctrine();
    const student = await makeStudent({ coach, timezone: "Europe/London", country: "GB" });
    // SANS plan PUBLIÉ, le dispatcher a consigne de n'émettre aucun effet KEEL.
    await publishPlanFor(coach, student.userId, { timezone: "Europe/London" });
    const r = await turn(student, probe.message);
    events.push(await scalar(`select count(*) from protocol_events where user_id='${student.userId}'`));
    questions.push(await rows(`select question from meal_precision_questions where user_id='${student.userId}'`));
    replies.push(String(r.reply ?? "").replace(/\n+/g, " ").slice(0, 110));
  }
  const uniqueEvents = [...new Set(events)];
  say(`\n▌ ${probe.label} — « ${probe.message} »   (${N} tours, attendu ${probe.expectEvents})`);
  say(`  protocol_events par tour : ${JSON.stringify(events)}  ${uniqueEvents.length === 1 ? "✅ stable" : "🔴 INSTABLE"}`);
  say(`  questions de précision   : ${JSON.stringify(questions)}`);
  for (const [i, reply] of replies.entries()) say(`  [${i + 1}] ${reply}`);
}

await Deno.writeTextFile(
  new URL("./L3bis-determinisme.txt", import.meta.url),
  lines.join("\n") + "\n",
);
console.log("\n→ écrit");
