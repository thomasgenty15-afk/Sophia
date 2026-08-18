/**
 * FF-009 — RUN RÉEL. Le repas hors plan.
 *
 * Vrai modèle, vraie base locale, vrais élèves provisionnés. Chaque verdict
 * cite la LIGNE EN BASE, jamais la réponse HTTP.
 *
 * ⚠️ UN ÉLÈVE NEUF PAR (cas × répétition). Mesuré au premier run: rejouer le
 * MÊME message sur le MÊME élève fait classer le 2e envoi comme une RÉPONSE à
 * la question de précision du 1er (`meal_precision_amended … kind=answer`), et
 * le tour n'écrit alors AUCUNE ligne. Un harnais qui réutilise l'élève mesure
 * cette interférence, pas le plancher.
 *
 * Usage:
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     deno run -A scratchpad/ff009_run.ts <groupe> [repeats]
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

const GROUP = (Deno.args[0] ?? "easy").trim();
const REPEATS = Number(Deno.args[1] ?? "3");

type Case = {
  id: string;
  level: "easy" | "medium" | "hard";
  text: string;
  locale: string;
  /** Attendu: nb de lignes protocol_events écrites par CE message. */
  expectRows: number | "any";
  /** Attendu: plan_relation des lignes. */
  expectRelation: "off_plan" | "null" | "none";
  /** R3 — aucun food_group_ref ne doit apparaître. */
  expectNoFood?: boolean;
  /** Au moins un food_group_ref attendu. */
  expectFood?: boolean;
  note?: string;
};

const CASES: Case[] = [
  // ── EASY — le cas nominal de la fiche ──────────────────────────────────
  {
    id: "E1",
    level: "easy",
    text: "j'ai commandé une pizza ce soir",
    locale: "fr-FR",
    expectRows: "any",
    expectRelation: "off_plan",
  },
  {
    id: "E2",
    level: "easy",
    text: "j'ai commandé",
    locale: "fr-FR",
    expectRows: 1,
    expectRelation: "off_plan",
    expectNoFood: true,
    note: "R2 — marqueur SEUL, aucun aliment",
  },
  // ── MEDIUM — variantes, langues, limites ───────────────────────────────
  {
    id: "M1",
    level: "medium",
    text: "on a mangé au resto hier",
    locale: "fr-FR",
    expectRows: 1,
    expectRelation: "off_plan",
    expectNoFood: true,
  },
  {
    id: "M2",
    level: "medium",
    text: "I ordered takeout last night",
    locale: "en-US",
    expectRows: 1,
    expectRelation: "off_plan",
    expectNoFood: true,
  },
  {
    id: "M3",
    level: "medium",
    text: "j'ai commandé une pizza margherita",
    locale: "fr-FR",
    expectRows: "any",
    expectRelation: "off_plan",
    note: "fiche: « AVEC les composants du lexique » — or ni pizza ni margherita n'y sont",
  },
  {
    id: "M3b",
    level: "medium",
    text: "j'ai commandé du poulet et du riz",
    locale: "fr-FR",
    expectRows: "any",
    expectRelation: "off_plan",
    expectFood: true,
    note: "marqueur + composants RÉELLEMENT dans le lexique",
  },
  {
    id: "M4",
    level: "medium",
    text: "j'ai mangé chez ma mère hier soir",
    locale: "fr-FR",
    expectRows: 1,
    expectRelation: "off_plan",
    expectNoFood: true,
    note: "le désarme « tiers » ne doit PAS mordre: la mère est une adresse",
  },
  {
    id: "M5",
    level: "medium",
    text: "we ate out at a restaurant yesterday",
    locale: "en-US",
    expectRows: 1,
    expectRelation: "off_plan",
    expectNoFood: true,
  },
  {
    id: "M6",
    level: "medium",
    text: "on s'est fait livrer",
    locale: "fr-FR",
    expectRows: 1,
    expectRelation: "off_plan",
    expectNoFood: true,
  },
  {
    id: "M7",
    level: "medium",
    text: "I had a takeaway last night",
    locale: "en-US",
    expectRows: "any",
    expectRelation: "off_plan",
  },
  // ── HARD — les modes de défaillance de §7 ──────────────────────────────
  {
    id: "H1",
    level: "hard",
    text: "je vais commander ce soir",
    locale: "fr-FR",
    expectRows: 0,
    expectRelation: "none",
  },
  {
    id: "H2",
    level: "hard",
    text: "on a commandé pour les enfants",
    locale: "fr-FR",
    expectRows: 0,
    expectRelation: "none",
  },
  {
    id: "H3",
    level: "hard",
    text: "I'm going to order takeout tonight",
    locale: "en-US",
    expectRows: 0,
    expectRelation: "none",
  },
  {
    id: "H4",
    level: "hard",
    text: "we ordered for the kids",
    locale: "en-US",
    expectRows: 0,
    expectRelation: "none",
  },
  {
    id: "H5",
    level: "hard",
    text: "j'ai mangé du poulet et du riz complet à midi",
    locale: "fr-FR",
    expectRows: "any",
    expectRelation: "null",
    expectFood: true,
    note: "contre-mesure §10: un repas cuisiné ne bascule PAS en off_plan",
  },
  {
    id: "H6",
    level: "hard",
    text: "hier soir j'ai mangé chez moi, du saumon et des brocolis",
    locale: "fr-FR",
    expectRows: "any",
    expectRelation: "null",
    expectFood: true,
    note: "« chez moi » est le CONTRAIRE d'un hors-plan",
  },
  {
    id: "H7",
    level: "hard",
    text: "I had grilled salmon with quinoa at home last night",
    locale: "en-US",
    expectRows: "any",
    expectRelation: "null",
    expectFood: true,
    note: "contre-mesure EN",
  },
];

/** Les mots que la réponse ne doit JAMAIS porter (§3 hors-périmètre + R6). */
const JUDGMENT_FR =
  /\b(ecart|écart|craquage|craqué|craque|rattrapage|rattraper|triche|tricher|entorse|compenser|bruler|brûler)\b/i;
const JUDGMENT_EN =
  /\b(cheat|slip[- ]?up|off the wagon|make up for it|burn it off|earn(ed)? (it|your)|indulgence|guilt|guilty|fell off)\b/i;
const RATE = /\d{1,3}\s?%|\b\d+\s*(of|sur|\/)\s*\d+\s*(meals|repas)\b/i;

function pad(s: string, n: number) {
  return (s + " ".repeat(n)).slice(0, n);
}

type Verdict = {
  id: string;
  level: string;
  run: number;
  text: string;
  ok: boolean;
  detail: string;
  reply: string;
  judgment: string[];
};

const results: Verdict[] = [];

async function eventsFor(userId: string): Promise<string[]> {
  return await rows(
    `select coalesce(plan_relation,'NULL')||' | '||coalesce(food_group_ref,'-')||
            ' | '||coalesce(slot_key,'-')||' | '||source||' | evw='||coalesce(evidence_weight::text,'-')||
            ' | dq='||coalesce(disqualified_reason,'-')
       from public.protocol_events
      where user_id='${userId}'
      order by created_at`,
  );
}

// ── Le pool de coachs: plafond de 3 sièges d'essai par coach ─────────────
const coaches: Coach[] = [];
let seatsLeft = 0;
const madeStudents: string[] = [];

async function freshStudent(locale: string): Promise<Student> {
  if (seatsLeft === 0) {
    const c = await makeCoach({ displayName: `FF009 Coach ${coaches.length + 1}` });
    coaches.push(c);
    seatsLeft = 3;
  }
  const coach = coaches[coaches.length - 1];
  seatsLeft--;
  const fr = locale.startsWith("fr");
  const st = await makeStudent({
    coach,
    locale,
    timezone: fr ? "Europe/Paris" : "Europe/London",
    country: fr ? "FR" : "GB",
    fullName: `ff009_${fr ? "fr" : "en"}`,
  });
  await publishPlanFor(coach, st.userId, {
    timezone: fr ? "Europe/Paris" : "Europe/London",
    contentLocale: fr ? "fr-FR" : "en-GB",
  });
  madeStudents.push(st.userId);
  return st;
}

async function runCase(c: Case, run: number) {
  const student = await freshStudent(c.locale);
  let t;
  try {
    t = await turn(student, c.text);
  } catch (e) {
    results.push({
      id: c.id, level: c.level, run, text: c.text, ok: false,
      detail: `EXCEPTION ${e}`, reply: "", judgment: [],
    });
    return;
  }
  await new Promise((r) => setTimeout(r, 1500));
  const ev = await eventsFor(student.userId);

  const relations = ev.map((l) => l.split("|")[0].trim());
  const foods = ev.map((l) => l.split("|")[1].trim()).filter((f) => f !== "-");

  const problems: string[] = [];
  if (c.expectRows === 0 && ev.length !== 0) problems.push(`attendu 0 ligne, obtenu ${ev.length}`);
  if (typeof c.expectRows === "number" && c.expectRows > 0 && ev.length !== c.expectRows) {
    problems.push(`attendu ${c.expectRows} ligne(s), obtenu ${ev.length}`);
  }
  if (c.expectRows === "any" && ev.length === 0) problems.push(`attendu >=1 ligne, obtenu 0`);
  if (c.expectRelation === "off_plan" && (ev.length === 0 || !relations.every((r) => r === "off_plan"))) {
    problems.push(`plan_relation attendu off_plan partout, obtenu [${relations}]`);
  }
  if (c.expectRelation === "null" && !relations.every((r) => r === "NULL")) {
    problems.push(`plan_relation attendu NULL partout, obtenu [${relations}]`);
  }
  if (c.expectNoFood && foods.length > 0) problems.push(`R3: food_group_ref inventé [${foods}]`);
  if (c.expectFood && foods.length === 0) problems.push(`attendu >=1 food_group_ref, obtenu aucun`);

  const reply = (t.reply ?? "").replace(/\n/g, " ");
  const judgment: string[] = [];
  const mFr = reply.match(JUDGMENT_FR);
  const mEn = reply.match(JUDGMENT_EN);
  const mRate = reply.match(RATE);
  if (mFr) judgment.push(`FR:${mFr[0]}`);
  if (mEn) judgment.push(`EN:${mEn[0]}`);
  if (mRate) judgment.push(`TAUX:${mRate[0]}`);

  results.push({
    id: c.id, level: c.level, run, text: c.text,
    ok: problems.length === 0,
    detail: problems.length === 0
      ? (ev.join(" ;; ") || "(0 ligne — attendu)")
      : problems.join(" / ") + ` || BASE: ${ev.join(" ;; ") || "(vide)"}`,
    reply: reply.slice(0, 260),
    judgment,
  });
}

async function main() {
  const wanted = CASES.filter((c) => GROUP === "all" || c.level === GROUP);
  if (wanted.length === 0) throw new Error(`groupe inconnu: ${GROUP}`);

  for (let run = 1; run <= REPEATS; run++) {
    for (const c of wanted) {
      await runCase(c, run);
      const last = results[results.length - 1];
      console.log(
        `${last.ok ? "🟢" : "🔴"} ${pad(last.id, 5)} r${run} ${pad(c.text, 46)} :: ${last.detail}`,
      );
      if (last.judgment.length) console.log(`      ⚠️ JUGEMENT/TAUX: ${last.judgment.join(", ")}`);
      if (!last.ok || last.judgment.length) console.log(`      reply: ${last.reply}`);
    }
  }

  console.log("\n═══ SYNTHÈSE ═══");
  const byCase = new Map<string, Verdict[]>();
  for (const r of results) {
    const arr = byCase.get(r.id) ?? [];
    arr.push(r);
    byCase.set(r.id, arr);
  }
  for (const [id, arr] of byCase) {
    const ok = arr.filter((a) => a.ok).length;
    const judged = arr.filter((a) => a.judgment.length).length;
    console.log(
      `${ok === arr.length ? "🟢" : "🔴"} ${pad(id, 5)} ${pad(arr[0].level, 7)} ${ok}/${arr.length}` +
        `${judged ? ` ⚠️${judged} jugement` : ""}  « ${arr[0].text} »`,
    );
    for (const a of arr.filter((x) => !x.ok)) console.log(`      r${a.run}: ${a.detail}`);
  }

  await Deno.writeTextFile(
    `scratchpad/ff009_${GROUP}_results.json`,
    JSON.stringify(results, null, 2),
  );

  if (Deno.env.get("FF009_KEEP") !== "1") {
    for (const id of madeStudents) await cleanup(id);
    for (const c of coaches) await cleanup(c.userId);
    // les coachs laissent une ligne `coaches` derrière eux
    const db = admin();
    for (const c of coaches) await db.from("coaches").delete().eq("id", c.coachId);
  } else {
    console.log(`\nKEEP students: ${madeStudents.join(",")}`);
  }
}

await main();
