/**
 * FF-023 — BASELINE : prouver le trou `history: []` en run réel.
 *
 * Deux tours sur un élève provisionné (plan publié). Au tour 2, une question
 * purement anaphorique. On relit :
 *   - le texte VISIBLE écrit en base (jamais la réponse HTTP) ;
 *   - `turn_summary_logs.context_elements` / `context_tokens` du tour, qui dit
 *     quels blocs de contexte le tour a VRAIMENT portés.
 *
 * Usage :
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     deno run -A scratchpad/ff023_baseline.ts [repeats]
 */
import {
  admin,
  cleanup,
  makeCoach,
  makeStudent,
  publishPlanFor,
  rows,
  turn,
} from "../docs/nutrition-pivot/qa-web/harness.ts";

const REPEATS = Number(Deno.args[1] ?? Deno.args[0] ?? "1");

const DOCTRINE = {
  beliefs: [
    { claim: "Every meal is built on a protein anchor.", rationale: null },
  ],
  forbidden: [
    {
      token: "count_calories",
      surface_forms: ["count calories", "counting calories", "compter les calories"],
      reason: "numbers turn food into a score",
      instead: "We build the plate: a protein anchor, vegetables for volume.",
    },
  ],
  vocabulary: [{ term: "anchor meal", meaning: "the protein base of a plate" }],
  arbitrations: [],
  voice: { tone: "Direct, warm, never preachy." },
  foods: { recommended: [], discouraged: [] },
};

async function summaryFor(userId: string): Promise<string[]> {
  return await rows(
    `select created_at, context_elements, context_tokens, target_final
       from turn_summary_logs where user_id='${userId}'
       order by created_at asc`,
  );
}

const out: string[] = [];
const say = (s: string) => {
  console.log(s);
  out.push(s);
};

for (let i = 0; i < REPEATS; i++) {
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
  const student = await makeStudent({
    coach,
    timezone: "Europe/London",
    country: "GB",
    locale: "en-US",
    fullName: "Sam",
  });
  await publishPlanFor(coach, student.userId);

  say(`\n===== run ${i + 1} — élève ${student.userId} =====`);
  const t1 = await turn(
    student,
    "My brother is moving to Lisbon next month and I'm the one helping him pack.",
  );
  say(`T1 ÉLÈVE : My brother is moving to Lisbon next month…`);
  say(`T1 SOPHIA: ${t1.reply ?? "‼️ AUCUNE RÉPONSE"}`);
  const t2 = await turn(student, "and so, what do you think about it?");
  say(`T2 ÉLÈVE : and so, what do you think about it?`);
  say(`T2 SOPHIA: ${t2.reply ?? "‼️ AUCUNE RÉPONSE"}`);

  for (const r of await summaryFor(student.userId)) say(`SUMMARY  : ${r}`);
  await cleanup(student.userId);
  await cleanup(coach.userId).catch(() => {});
}

await Deno.writeTextFile(
  new URL("./ff023-baseline.txt", import.meta.url),
  out.join("\n") + "\n",
);
console.log("\n→ écrit scratchpad/ff023-baseline.txt");
