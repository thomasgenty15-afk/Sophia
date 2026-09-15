/**
 * LANCEUR DE SCÉNARIO — joue une liste de messages contre un élève NEUF, et
 * dump tout ce que la base porte après chaque tour.
 *
 * Un scénario = un fichier JSON de messages. Le dump est la preuve; la sortie
 * console n'est qu'un confort de lecture.
 *
 * USAGE
 *   deno run --allow-all scenario.ts --name L3-a --doctrine \
 *     "message 1" "message 2" ...
 */
import { admin, makeCoach, makeStudent, sql, transcript, turn } from "./harness.ts";

const args = [...Deno.args];
function flag(name: string): string | null {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return null;
  const v = args[i + 1] ?? "";
  args.splice(i, 2);
  return v;
}
function bool(name: string): boolean {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
}

const name = flag("name") ?? `scenario-${Date.now()}`;
const withDoctrine = bool("doctrine");
const locale = flag("locale") ?? "en-GB";
const tz = flag("tz") ?? "Europe/London";
const country = flag("country") ?? "GB";
const messages = args.filter((a) => !a.startsWith("--"));
if (messages.length === 0) throw new Error("aucun message");

export const DOCTRINE = {
  beliefs: [
    "Protein at every meal is the backbone of the method.",
    "Vegetables are the volume of the plate, never the garnish.",
  ],
  forbidden: [
    "Never recommend counting calories or weighing food.",
    "Never suggest intermittent fasting or skipping breakfast.",
  ],
  vocabulary: ["anchor meal", "the plate rule"],
  arbitrations: [
    {
      question: "Can I do intermittent fasting?",
      answer:
        "Not on this method. We anchor the day with breakfast; fasting fights the structure we are building.",
    },
  ],
  voice: { tone: "Direct, warm, never preachy." },
  foods: { recognised: [], recommended: ["eggs", "lentils", "olive oil"], discouraged: ["sugary drinks"] },
};

const coach = await makeCoach({ displayName: "Dr QA Marlow", country: "GB" });
if (withDoctrine) {
  const { error } = await admin().from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    beliefs: DOCTRINE.beliefs,
    forbidden: DOCTRINE.forbidden,
    vocabulary: DOCTRINE.vocabulary,
    arbitrations: DOCTRINE.arbitrations,
    voice: DOCTRINE.voice,
    foods: { recommended: DOCTRINE.foods.recommended, discouraged: DOCTRINE.foods.discouraged },
    content_locale: "en",
    published_at: new Date().toISOString(),
    published_by: coach.userId,
  } as never);
  if (error) throw error;
}

const student = await makeStudent({ coach, timezone: tz, country });
await admin().from("profiles").update({ locale } as never).eq("id", student.userId);

const lines: string[] = [];
function say(s: string) {
  console.log(s);
  lines.push(s);
}
say(`# ${name}`);
say(`coach=${coach.coachId} doctrine=${withDoctrine} student=${student.userId} tz=${tz} country=${country} locale=${locale}`);

for (const [i, m] of messages.entries()) {
  const t0 = Date.now();
  const r = await turn(student, m);
  const ms = Date.now() - t0;
  say(`\n─── tour ${i + 1} (${ms} ms, HTTP ${r.status}) ───`);
  say(`ÉLÈVE  : ${m}`);
  say(`SOPHIA : ${r.reply ?? "<AUCUNE RÉPONSE ÉCRITE>"}`);
  const btns = (r.replyMetadata?.buttons ?? null);
  if (btns) say(`BOUTONS: ${JSON.stringify(btns)}`);
}

say(`\n─── EFFETS DURABLES ───`);
for (
  const [label, query] of [
    ["protocol_events", `select local_date, kind, coalesce(food_group_ref,'') as fg, coalesce(portion_band,'') as band, left(recognized::text, 300) as recognized from protocol_events where user_id='${student.userId}' order by created_at`],
    ["student_safety_constraints", `select kind, label, severity, status from student_safety_constraints where user_id='${student.userId}'`],
    ["planned_deviations", `select * from planned_deviations where user_id='${student.userId}'`],
    ["student_daily_checkins", `select local_date, overall, axis, source from student_daily_checkins where user_id='${student.userId}'`],
    ["user_chat_states", `select scope, left(state::text, 400) from user_chat_states where user_id='${student.userId}'`],
  ] as const
) {
  say(`\n[${label}]\n${await sql(query).catch((e) => `<${e.message}>`)}`);
}

say(`\n─── SORTIES BRUTES DU MODÈLE ───`);
say(await sql(
  `select source, outcome, left(replace(coalesce(output_text,''), E'\\n',' '), 200) as output
     from llm_raw_response_events where user_id='${student.userId}'
     order by created_at limit 40`,
).catch((e) => `<${e.message}>`));

say(`\n─── TRANSCRIPT ───`);
for (const row of await transcript(student.userId)) {
  say(`${row.created_at} ${row.role}: ${row.content.replace(/\n/g, " ")}`);
}

say(`\ncontext: ${JSON.stringify({ coachId: coach.coachId, coachUser: coach.userId, studentId: student.userId })}`);

await Deno.writeTextFile(
  new URL(`./${name}.txt`, import.meta.url),
  lines.join("\n") + "\n",
);
console.log(`\n→ écrit dans qa-web/${name}.txt`);
