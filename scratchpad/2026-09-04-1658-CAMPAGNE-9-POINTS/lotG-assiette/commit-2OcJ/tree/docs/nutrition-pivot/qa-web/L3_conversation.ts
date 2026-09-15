/**
 * L3 — LA CONVERSATION, EN LARGEUR.
 *
 * Douze conversations DISTINCTES, chacune sur un élève NEUF (une conversation
 * qui hérite du contexte d'une autre ne prouve pas ce qu'elle croit prouver),
 * en anglais ET en français, contre le vrai modèle et la vraie base.
 *
 * Pour chaque tour on relit: le texte rendu, les effets durables écrits, et la
 * sortie brute du modèle — pour voir si une ceinture a détruit une réponse
 * honnête (défaut AGENT-16 P0-4).
 */
import { admin, makeCoach, makeStudent, sql, transcript, turn, type Coach } from "./harness.ts";

const DOCTRINE = {
  beliefs: [
    { claim: "Every meal is built on a protein anchor.", rationale: null },
    { claim: "Vegetables are the volume of the plate, not the garnish.", rationale: null },
  ],
  forbidden: [
    {
      token: "count_calories",
      surface_forms: ["count calories", "counting calories", "compter les calories"],
      reason: "numbers turn food into a score",
      instead: "We build the plate: a protein anchor, vegetables for volume, a starch on the side.",
    },
    {
      token: "intermittent_fasting",
      surface_forms: ["intermittent fasting", "jeûne intermittent", "skip breakfast"],
      reason: "it fights the structure we build",
      instead: "We anchor the day with breakfast — protein first, and the rest follows.",
    },
  ],
  vocabulary: [
    { term: "anchor meal", meaning: "the protein base of a plate" },
    { term: "the plate rule", meaning: "half vegetables, a quarter protein, a quarter starch" },
  ],
  arbitrations: [
    {
      situation: "A student says they cracked and ate everything",
      coach_answer: "One meal is not a week. Next plate, back to the plate rule — nothing to make up for.",
    },
  ],
  voice: { tone: "Direct, warm, never preachy." },
  foods: {
    recommended: [{ term: "eggs", reason: null }, { term: "lentils", reason: null }],
    discouraged: [{ term: "sugary drinks", surface_forms: ["sugary drinks", "sodas"], reason: null }],
  },
};

async function coachWithDoctrine(): Promise<Coach> {
  const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
  const { error } = await admin().from("coach_doctrines").insert({
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

type Scenario = { id: string; lang: "EN" | "FR"; messages: string[] };

const SCENARIOS: Scenario[] = [
  { id: "01-greeting-EN", lang: "EN", messages: ["hey"] },
  { id: "01-greeting-FR", lang: "FR", messages: ["salut !"] },
  { id: "02-meal-text-EN", lang: "EN", messages: ["I had eggs and rice for lunch"] },
  { id: "02-meal-text-FR", lang: "FR", messages: ["j'ai mangé du poulet grillé avec du riz complet et des brocolis à midi"] },
  { id: "03-protocol-question-EN", lang: "EN", messages: ["what am I supposed to eat tonight?"] },
  { id: "04-off-protocol-EN", lang: "EN", messages: ["should I take a magnesium supplement in the evening?"] },
  { id: "05-contradicts-doctrine-EN", lang: "EN", messages: ["I want to start counting my calories, is that a good idea?"] },
  { id: "05-contradicts-doctrine-FR", lang: "FR", messages: ["je voudrais commencer à compter mes calories, c'est une bonne idée ?"] },
  { id: "06-allergy-EN", lang: "EN", messages: ["I'm allergic to peanuts, badly", "what could I have for a snack this afternoon?"] },
  { id: "06-allergy-FR", lang: "FR", messages: ["je suis très allergique aux arachides", "je mange quoi en collation cet après-midi ?"] },
  { id: "07-deviation-FR", lang: "FR", messages: ["j'ai craqué sur une pizza hier soir"] },
  { id: "08-recap-EN", lang: "EN", messages: ["what did I actually eat this week?"] },
  { id: "09-ambiguous-FR", lang: "FR", messages: ["bof"] },
  { id: "09-ambiguous-EN", lang: "EN", messages: ["meh"] },
  {
    id: "10-long-multi-EN",
    lang: "EN",
    messages: [
      "OK so a lot happened. Monday I did fine, eggs in the morning like we said, big salad at lunch with chicken. " +
      "Tuesday I had a work dinner and I honestly have no idea what was in the sauce, it was some kind of curry. " +
      "Wednesday I skipped lunch because of back-to-back meetings and then I was starving at 4pm and ate half a packet of biscuits. " +
      "Also my sleep has been terrible all week and I keep waking up at 3am. And I wanted to ask, is it normal that I'm hungry an hour after breakfast? " +
      "One more thing, my sister is getting married in three weeks and I'd like to not feel awful in the photos.",
    ],
  },
];

const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};

const only = Deno.args[0] ?? null;

for (const scenario of SCENARIOS) {
  if (only && !scenario.id.includes(only)) continue;
  const coach = await coachWithDoctrine();
  const student = await makeStudent({
    coach,
    timezone: "Europe/London",
    country: "GB",
    fullName: "Sam",
  });
  say(`\n${"═".repeat(78)}`);
  say(`▌ ${scenario.id}   élève=${student.userId}`);
  say("═".repeat(78));

  for (const message of scenario.messages) {
    const t0 = Date.now();
    const r = await turn(student, message);
    say(`\nÉLÈVE  (${Date.now() - t0} ms, HTTP ${r.status}) : ${message.slice(0, 160)}${message.length > 160 ? "…" : ""}`);
    say(`SOPHIA : ${r.reply ?? "‼️ AUCUNE RÉPONSE ÉCRITE"}`);
  }

  const effects = await sql(
    `select
       (select count(*) from protocol_events where user_id='${student.userId}') as protocol_events,
       (select count(*) from student_safety_constraints where user_id='${student.userId}') as safety,
       (select count(*) from planned_deviations where user_id='${student.userId}') as deviations,
       (select count(*) from meal_precision_questions where user_id='${student.userId}') as precision_q`,
  ).catch((e) => `<${e.message}>`);
  say(`\nEFFETS : ${effects.split("\n").slice(0, 2).join(" | ")}`);

  const owners = await sql(
    `select string_agg(distinct source, ', ') from llm_raw_response_events
       where user_id='${student.userId}' and outcome='text'`,
  ).catch(() => "?");
  say(`LANES  : ${owners.split("\n")[1] ?? "?"}`);
}

await Deno.writeTextFile(
  new URL(`./L3-conversation${only ? `-${only}` : ""}.txt`, import.meta.url),
  lines.join("\n") + "\n",
);
console.log(`\n→ écrit`);
