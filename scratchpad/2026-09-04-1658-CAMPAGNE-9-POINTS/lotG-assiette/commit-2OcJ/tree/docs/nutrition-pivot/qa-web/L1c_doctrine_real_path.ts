/**
 * L1-c — LA DOCTRINE PAR LE VRAI CHEMIN DU COACH.
 *
 * `questions` → `compile` (le modèle structure) → `save` → `publish` → un tour
 * d'élève. C'est le seul chemin qu'un coach parcourt réellement; le tester avec
 * une doctrine écrite à la main en base prouverait le loader, pas le produit.
 */
import { admin, callAs, makeCoach, makeStudent, sql, turn } from "./harness.ts";
import { doctrineBlockFor, loadPublishedDoctrine } from "../../../supabase/functions/_shared/keel/doctrine_loader.ts";

const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};

const coach = await makeCoach({ displayName: "Marlow", country: "GB" });
say(`coach=${coach.coachId}`);

const qs = await callAs(coach, "coach-doctrine-v1", { action: "questions" });
const questions = (qs.json?.questions ?? []) as Array<{ section: string; question: string }>;
say(`[questions] ${qs.status} — ${questions.length} questions`);
for (const q of questions) say(`  · [${q.section}] ${q.question.slice(0, 100)}`);

// Les réponses d'un vrai coach: convictions, lignes rouges, vocabulaire, cas durs.
const ANSWER_TEXT: Record<string, string> = {
  beliefs:
    "Every meal is built on a protein anchor. Vegetables are the volume of the plate, not the garnish. Breakfast is non-negotiable: it sets the whole day.",
  forbidden:
    "I never let a student count calories or weigh food. I never let anyone do intermittent fasting or skip breakfast — it fights the structure we build.",
  vocabulary:
    "I say 'anchor meal' for the protein base of a plate, and 'the plate rule' for half vegetables, a quarter protein, a quarter starch.",
  arbitrations:
    "When a student asks whether they can do intermittent fasting, I say no — not on this method; we anchor the day with breakfast. When a student ate badly at a wedding, I tell them one meal is not a week and we move on.",
  voice: "Direct, warm, never preachy. Short sentences. I never moralise.",
  foods:
    "I recommend eggs, lentils, olive oil, oily fish. I discourage sugary drinks and ultra-processed snacks.",
};

const answers = questions.map((q) => ({
  section: q.section,
  question: q.question,
  answer: ANSWER_TEXT[q.section] ??
    "Protein at every meal, vegetables as the volume, breakfast never skipped. No calorie counting, no fasting.",
}));

const compiled = await callAs(coach, "coach-doctrine-v1", {
  action: "compile",
  answers,
  content_locale: "en",
});
say(`\n[compile] ${compiled.status}`);
say(`draft: ${JSON.stringify(compiled.json?.draft ?? compiled.json).slice(0, 2000)}`);

const draft = compiled.json?.draft ?? compiled.json?.doctrine;
if (!draft) throw new Error("compile n'a rendu aucun brouillon");

const saved = await callAs(coach, "coach-doctrine-v1", {
  action: "save",
  doctrine: draft,
  content_locale: "en",
});
say(`\n[save] ${saved.status} ${JSON.stringify(saved.json).slice(0, 200)}`);
const version = saved.json?.saved?.version ?? 1;

const pub = await callAs(coach, "coach-doctrine-v1", { action: "publish", version });
say(`[publish] ${pub.status} ${JSON.stringify(pub.json).slice(0, 200)}`);

const student = await makeStudent({ coach, timezone: "Europe/London", country: "GB" });
say(`\nélève=${student.userId}`);

// LA SONDE: ce que le loader charge RÉELLEMENT pour ce tour.
const loaded = await loadPublishedDoctrine(admin(), student.userId);
say(`\n[loader] reason=${loaded.reason} coachId=${loaded.coachId} isEmpty=${loaded.compiled?.isEmpty}`);
say(`[loader] issues=${JSON.stringify(loaded.issues)}`);
say(`[loader] BLOC:\n${doctrineBlockFor(loaded).slice(0, 1800)}`);

for (
  const msg of [
    "Can I do intermittent fasting?",
    "Should I start counting my calories?",
  ]
) {
  const r = await turn(student, msg);
  say(`\n─── ÉLÈVE : ${msg}`);
  say(`SOPHIA : ${r.reply}`);
}

say(`\n[base] ${await sql(
  `select version, jsonb_array_length(beliefs) b, jsonb_array_length(forbidden) f, jsonb_array_length(arbitrations) a, published_at is not null pub from coach_doctrines where coach_id='${coach.coachId}' order by version`,
)}`);

say(`\ncontext: ${JSON.stringify({ coachId: coach.coachId, studentId: student.userId })}`);
await Deno.writeTextFile(new URL("./L1c-doctrine-real-path.txt", import.meta.url), lines.join("\n") + "\n");
