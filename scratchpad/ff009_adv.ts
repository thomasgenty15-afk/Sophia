/**
 * FF-009 — REVUE ADVERSARIALE, sur la RÉPONSE et sur la BASE.
 *
 * A1  le glissement d'étiquette: un repas cuisiné bascule-t-il en `off_plan` ?
 *     et le chat écrit-il JAMAIS `as_planned` (R5) ?
 * A2  le jugement qui fuit: « écart », « craquage », « cheat », « rattraper »…
 * A3  le taux: un « 71 % » ou un « 5 sur 7 » apparaît-il dans une réponse ?
 *
 * Chaque message est joué sur un élève NEUF, 2 fois, FR et EN.
 */
import {
  admin,
  type Coach,
  cleanup,
  makeCoach,
  makeStudent,
  publishPlanFor,
  rows,
  type Student,
  turn,
} from "../docs/nutrition-pivot/qa-web/harness.ts";

const REPEATS = Number(Deno.args[0] ?? "2");

const OFF_PLAN_MESSAGES: Array<[string, string]> = [
  ["fr-FR", "j'ai commandé une pizza ce soir"],
  ["fr-FR", "on a mangé au resto hier soir avec des amis"],
  ["fr-FR", "j'étais à un mariage samedi, j'ai mangé de tout"],
  ["fr-FR", "j'ai mangé chez ma mère hier soir"],
  ["en-US", "I ordered takeout last night"],
  ["en-US", "we ate out at a restaurant yesterday with friends"],
  ["en-US", "I was at a wedding on Saturday, I ate everything"],
  ["en-US", "I had a takeaway last night"],
];

const COOKED_MESSAGES: Array<[string, string]> = [
  ["fr-FR", "j'ai mangé du poulet et des brocolis à midi"],
  ["fr-FR", "ce midi, saumon, riz complet et haricots verts"],
  ["en-US", "I had grilled chicken and green beans for lunch"],
  ["en-US", "Grilled salmon with quinoa and green beans for dinner"],
];

/** §3 « aucun jugement » — ni « écart », ni « craquage », ni « rattrapage ». */
const JUDGMENT = [
  /\b(un |l')?[ée]cart\b/i,
  /\bcraquage|craqu[ée]\b/i,
  /\brattrap(er|age)\b/i,
  /\bcompenser\b/i,
  /\bbr[ûu]ler (les|ça|ca)\b/i,
  /\btrich(e|er)\b/i,
  /\bcheat\b/i,
  /\bslip[- ]?up\b/i,
  /\boff the wagon\b/i,
  /\bmake up for it\b/i,
  /\bburn it off\b/i,
  /\bearn(ed)? (it|your)\b/i,
  /\bguilt(y)?\b/i,
  /\bindulgen(ce|t)\b/i,
  /\bfell off\b/i,
  /\bnaughty|bad (meal|choice)\b/i,
];
/** §9 « la tentation du taux » — `adherence_score` est une surface supprimée. */
const RATE = [
  /\b\d{1,3}\s?%/,
  /\b\d+\s*(of|sur|\/)\s*\d+\s*(meals|repas|dinners|d[îi]ners)\b/i,
  /\b(adherence|compliance|conformit[ée])\b/i,
  /\bscore\b/i,
  /\bstreak|s[ée]rie de\b/i,
];

const coaches: Coach[] = [];
let seats = 0;
const students: string[] = [];

async function freshStudent(locale: string): Promise<Student> {
  if (seats === 0) {
    coaches.push(await makeCoach({ displayName: `FF009 ADV ${coaches.length + 1}` }));
    seats = 3;
  }
  const coach = coaches[coaches.length - 1];
  seats--;
  const fr = locale.startsWith("fr");
  const st = await makeStudent({
    coach, locale,
    timezone: fr ? "Europe/Paris" : "Europe/London",
    country: fr ? "FR" : "GB",
    fullName: "ff009_adv",
  });
  await publishPlanFor(coach, st.userId, {
    timezone: fr ? "Europe/Paris" : "Europe/London",
    contentLocale: fr ? "fr-FR" : "en-GB",
  });
  students.push(st.userId);
  return st;
}

type Row = {
  kind: "off_plan" | "cooked";
  locale: string;
  text: string;
  run: number;
  relations: string[];
  judgment: string[];
  rate: string[];
  reply: string;
};
const out: Row[] = [];

async function play(kind: Row["kind"], locale: string, text: string, run: number) {
  const st = await freshStudent(locale);
  const t = await turn(st, text);
  await new Promise((r) => setTimeout(r, 1400));
  const ev = await rows(
    `select coalesce(plan_relation,'NULL') from public.protocol_events
      where user_id='${st.userId}'`,
  );
  const reply = (t.reply ?? "").replace(/\n/g, " ");
  const judgment = JUDGMENT.filter((re) => re.test(reply)).map((re) =>
    (reply.match(re) ?? [""])[0]
  );
  const rate = RATE.filter((re) => re.test(reply)).map((re) =>
    (reply.match(re) ?? [""])[0]
  );
  out.push({ kind, locale, text, run, relations: ev, judgment, rate, reply });
  const bad = judgment.length > 0 || rate.length > 0;
  console.log(
    `${bad ? "🔴" : "🟢"} [${kind}] ${locale} r${run} « ${text.slice(0, 42)} » → ` +
      `[${ev.join(",") || "vide"}]` +
      `${judgment.length ? ` JUGEMENT:${judgment.join("|")}` : ""}` +
      `${rate.length ? ` TAUX:${rate.join("|")}` : ""}`,
  );
  if (bad) console.log(`      ${reply.slice(0, 300)}`);
}

for (let run = 1; run <= REPEATS; run++) {
  for (const [loc, text] of OFF_PLAN_MESSAGES) await play("off_plan", loc, text, run);
  for (const [loc, text] of COOKED_MESSAGES) await play("cooked", loc, text, run);
}

console.log("\n═══ A1 · LE GLISSEMENT D'ÉTIQUETTE ═══");
const cooked = out.filter((r) => r.kind === "cooked");
const drifted = cooked.filter((r) => r.relations.includes("off_plan"));
console.log(
  `${drifted.length === 0 ? "🟢" : "🔴"} repas CUISINÉS requalifiés hors-plan: ` +
    `${drifted.length}/${cooked.length}`,
);
const offPlan = out.filter((r) => r.kind === "off_plan");
const missed = offPlan.filter((r) => !r.relations.includes("off_plan"));
console.log(
  `${missed.length === 0 ? "🟢" : "🔴"} hors-plan NON étiquetés: ${missed.length}/${offPlan.length}` +
    `${missed.length ? ` → ${missed.map((m) => m.text).join(" | ")}` : ""}`,
);
const asPlanned = await rows(
  `select count(*)::text from public.protocol_events
    where source='chat' and plan_relation='as_planned'`,
);
console.log(
  `${asPlanned[0] === "0" ? "🟢" : "🔴"} R5 — lignes source='chat' avec ` +
    `plan_relation='as_planned' dans TOUTE la base: ${asPlanned[0]}`,
);

console.log("\n═══ A2/A3 · JUGEMENT & TAUX ═══");
const judged = out.filter((r) => r.judgment.length);
const rated = out.filter((r) => r.rate.length);
console.log(`${judged.length === 0 ? "🟢" : "🔴"} réponses portant un jugement: ${judged.length}/${out.length}`);
console.log(`${rated.length === 0 ? "🟢" : "🔴"} réponses portant un taux/score: ${rated.length}/${out.length}`);

await Deno.writeTextFile("scratchpad/ff009_adv_results.json", JSON.stringify(out, null, 2));

if (Deno.env.get("FF009_KEEP") !== "1") {
  for (const id of students) await cleanup(id);
  const db = admin();
  for (const c of coaches) {
    await cleanup(c.userId);
    await db.from("coaches").delete().eq("id", c.coachId);
  }
}
