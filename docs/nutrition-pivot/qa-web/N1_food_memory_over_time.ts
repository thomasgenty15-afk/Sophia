/**
 * N1 — CE QUE L'ÉLÈVE A DIT SUR SA BOUFFE, VU SUR TROIS SEMAINES.
 *
 * ── LA QUESTION ────────────────────────────────────────────────────────────
 * La carte « What you have told me about your eating » (haut de `/app/plan`)
 * promeut un souvenir en contrainte de composition. Ce qui n'a JAMAIS été
 * mesuré, c'est ce que devient cette promotion quand le temps passe et que
 * l'élève REVIENT sur ce qu'il a dit — trois jours après, la semaine suivante.
 *
 * Un magasin de préférences qui n'oublie rien est aussi faux qu'un magasin qui
 * n'apprend rien: à la 3e semaine il sert au générateur une pile de phrases
 * contradictoires, et le plan devient un tirage au sort.
 *
 * ── CE QUE CE SCRIPT JOUE, EN RÉEL ─────────────────────────────────────────
 * Un coach (doctrine publiée), un élève (plan publié — sans lui la moitié du
 * moteur KEEL est éteinte), et une conversation étalée sur 3 semaines
 * simulées. À chaque étape:
 *   1. de vrais tours par `chat-inbound-v1` → `sophia-brain`;
 *   2. les messages sont RÉTRODATÉS à la date simulée;
 *   3. le VRAI memorizer tourne (`trigger-memorizer-daily`, scopé sur l'élève);
 *   4. on rejoue le geste de l'élève sur la carte (proposer → garder);
 *   5. on lit ce que le générateur de semaine VOIT, et ce qu'il PRODUIT.
 *
 * Aucun mock. Le seul raccourci est la création des comptes (`signUp`).
 *
 * USAGE
 *   set -a; . supabase/functions/night_llm.env; set +a; \
 *     deno run -A docs/nutrition-pivot/qa-web/N1_food_memory_over_time.ts
 */
import {
  admin,
  callAs,
  callCron,
  type Coach,
  makeCoach,
  makeStudent,
  publishPlanFor,
  rows,
  type Student,
  turn,
} from "./harness.ts";
import {
  applyFoodPreferenceDecision,
  constraintsForPrompt,
  FOOD_PREFERENCES_KEY,
  FOOD_PREFERENCES_ORIGIN_KEY,
  ignorableTokens,
  type MemoryItemForPromotion,
  proposeFoodPreferences,
  reconcileFoodPreferences,
} from "../../../supabase/functions/_shared/keel/food_preference_promotion.ts";

/**
 * LE FILET KONG. La pile locale rend des 502 « invalid response from upstream »
 * sur les appels longs (le memorizer réel tourne 60 s+). Sans reprise, un run
 * les compte comme des tours perdus et le rapport conclut faussement que rien
 * ne s'écrit — le défaut `kong-502-fake-dropped-turns`, déjà payé une fois.
 * La reprise est de TRANSPORT uniquement: un 4xx applicatif n'est jamais rejoué.
 */
async function withRetry<T>(
  label: string,
  attempt: () => Promise<T>,
  isTransportFailure: (value: T) => boolean,
): Promise<T> {
  let last!: T;
  for (let i = 1; i <= 4; i += 1) {
    last = await attempt();
    if (!isTransportFailure(last)) return last;
    console.warn(`  ↻ ${label}: reprise ${i}/4 (502 upstream)`);
    await new Promise((r) => setTimeout(r, 3000 * i));
  }
  return last;
}

function is502(v: { status: number; json: any }): boolean {
  return v.status === 502 ||
    String(v.json?.message ?? "").includes("invalid response was received");
}

const out: string[] = [];
const say = (s = "") => {
  console.log(s);
  out.push(s);
};
const rule = (t: string) => {
  say("");
  say("═".repeat(78));
  say(`▌ ${t}`);
  say("═".repeat(78));
};

// ---------------------------------------------------------------------------
// Le décor
// ---------------------------------------------------------------------------

async function coachWithDoctrine(): Promise<Coach> {
  const coach = await makeCoach({ displayName: "Mira Holloway", country: "GB" });
  const { error } = await admin().from("coach_doctrines").insert({
    coach_id: coach.coachId,
    version: 1,
    beliefs: [
      {
        key: "three_real_meals",
        claim: "Three real meals anchor the day. We build the plate before we take anything off it.",
        rationale: "regularity predicts results, not perfection",
      },
      {
        key: "protein_and_something_that_grew",
        claim: "Every plate starts with protein and something that grew.",
        rationale: "fullness is built, not resisted",
      },
    ],
    forbidden: [],
    vocabulary: [],
    arbitrations: [],
    voice: { tone: "Direct, warm.", language: "en-GB" },
    foods: { recommended: [], discouraged: [] },
    qa: [],
    content_locale: "en-GB",
    published_at: new Date().toISOString(),
    published_by: coach.userId,
  } as never);
  if (error) throw new Error(`coach_doctrines: ${error.message}`);
  return coach;
}

// ---------------------------------------------------------------------------
// L'horloge simulée: on rétrodate ce que le tour vient d'écrire
// ---------------------------------------------------------------------------

/**
 * Rétrodate TOUT ce que l'élève a produit depuis `sinceRealIso` à `simIso`.
 *
 * Sans ça la simulation est fausse dans le sens du succès: trois semaines de
 * conversation écrites à la même seconde donnent au memorizer un seul lot, et
 * la question posée — « que devient une préférence quand le temps passe » — ne
 * peut pas se poser.
 */
async function backdate(userId: string, sinceRealIso: string, simIso: string) {
  await rows(
    `update public.chat_messages set created_at = '${simIso}'
     where user_id = '${userId}' and created_at >= '${sinceRealIso}'`,
  );
}

async function backdateMemory(userId: string, sinceRealIso: string, simIso: string) {
  await rows(
    `update public.memory_items set created_at = '${simIso}', updated_at = '${simIso}'
     where user_id = '${userId}' and created_at >= '${sinceRealIso}'`,
  );
}

// ---------------------------------------------------------------------------
// Les lectures
// ---------------------------------------------------------------------------

async function memoryRows(userId: string): Promise<MemoryItemForPromotion[]> {
  const { data, error } = await admin()
    .from("memory_items")
    .select(
      "id, kind, status, content_text, normalized_summary, domain_keys, confidence, sensitivity_level, created_at, superseded_by_item_id",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`memory_items: ${error.message}`);
  return (data ?? []) as never;
}

async function dumpMemory(userId: string) {
  const items = await memoryRows(userId) as Array<
    MemoryItemForPromotion & {
      created_at: string;
      superseded_by_item_id: string | null;
    }
  >;
  if (items.length === 0) {
    say("  (aucun souvenir)");
    return;
  }
  for (const i of items) {
    const food = (i.domain_keys ?? []).includes("sante.alimentation") ? "🍽 " : "   ";
    const sup = i.superseded_by_item_id ? ` →${i.superseded_by_item_id.slice(0, 8)}` : "";
    say(
      `  ${food}${i.id.slice(0, 8)} ${String(i.kind).padEnd(10)} ${
        String(i.status).padEnd(11)
      } c=${Number(i.confidence ?? 0).toFixed(2)} ${i.created_at.slice(0, 10)}${sup}  ${
        String(i.normalized_summary ?? i.content_text ?? "").slice(0, 78)
      }`,
    );
  }
}

async function goalConstraints(userId: string): Promise<Record<string, unknown>> {
  const { data, error } = await admin()
    .from("student_goals")
    .select("practical_constraints")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`student_goals: ${error.message}`);
  return ((data as { practical_constraints: Record<string, unknown> } | null)
    ?.practical_constraints ?? {}) as Record<string, unknown>;
}

async function writeConstraints(userId: string, next: Record<string, unknown>) {
  const { error } = await admin()
    .from("student_goals")
    .update({ practical_constraints: next } as never)
    .eq("user_id", userId);
  if (error) throw new Error(`student_goals update: ${error.message}`);
}

/**
 * LE GESTE DE L'ÉLÈVE SUR LA CARTE. Il ouvre `/app/plan`, voit les
 * propositions, et garde tout ce qui est juste — c'est le comportement
 * nominal, celui que la carte encourage (« Keep what is right »).
 */
async function openCardAndKeepAll(
  userId: string,
): Promise<{ kept: string[]; dropped: string[]; suspect: string[] }> {
  const items = await memoryRows(userId);
  let pc = await goalConstraints(userId);

  // 1. LA RÉCONCILIATION D'ABORD, comme l'écran: proposer un remplaçant à côté
  //    de la ligne qu'il dément montrerait la contradiction à l'élève.
  const reconciled = reconcileFoodPreferences({
    constraints: pc,
    items,
    // Le prénom: le memorizer préfixe chaque résumé, donc sans lui toutes les
    // paires paraissent liées et le contrôle de plausibilité est mort.
    ignoreTokens: ignorableTokens("Theo"),
  });
  pc = reconciled.constraints;

  // 2. Puis les propositions, avec la table d'origines pour annoncer un
  //    remplacement plutôt qu'un ajout.
  const proposals = proposeFoodPreferences({
    items,
    kept: (pc[FOOD_PREFERENCES_KEY] as string[] | undefined) ?? [],
    dismissed: (pc.food_preferences_dismissed as string[] | undefined) ?? [],
    origin: (pc[FOOD_PREFERENCES_ORIGIN_KEY] as Record<string, string> | undefined) ?? {},
  });
  for (const p of proposals) {
    pc = applyFoodPreferenceDecision(pc, {
      kind: "keep",
      text: p.text,
      memoryItemId: p.memoryItemId,
      replaces: p.replaces ?? null,
      seenAt: p.seenAt ?? null,
    });
  }
  await writeConstraints(userId, pc);
  return {
    kept: proposals.map((p) => (p.replaces ? `${p.text}   (remplace « ${p.replaces} »)` : p.text)),
    dropped: reconciled.dropped.map((d) => `${d.text}   [${d.status}]`),
    suspect: reconciled.keptDespiteSupersession.map((k) => k.text),
  };
}

async function runMemorizer(userId: string, sinceIso: string) {
  const res = await withRetry(
    "memorizer",
    () =>
      callCron("trigger-memorizer-daily", {
        user_id: userId,
        since_iso: sinceIso,
        user_limit: 1,
      }),
    is502,
  );
  if (res.status !== 200) {
    say(`  ⚠️ memorizer ${res.status}: ${JSON.stringify(res.json).slice(0, 300)}`);
  }
  return res;
}

/** Ce que le générateur VOIT: la ligne `practical constraints:` du prompt. */
function promptLine(pc: Record<string, unknown>): string {
  return `practical constraints: ${JSON.stringify(constraintsForPrompt(pc))}`;
}

async function generateWeek(student: Student, localDate: string) {
  return await withRetry(
    "generate-week-plan-v1",
    () => callAs(student, "generate-week-plan-v1", { local_date: localDate }),
    is502,
  );
}

// ---------------------------------------------------------------------------
// Le scénario
// ---------------------------------------------------------------------------

rule("N1 — DÉCOR");

const coach = await coachWithDoctrine();
const student = await makeStudent({
  coach,
  timezone: "Europe/London",
  country: "GB",
  fullName: "Theo",
  withAdoptedPlan: false,
});
await publishPlanFor(coach, student.userId, { timezone: "Europe/London" });
await admin().from("student_goals").insert({
  user_id: student.userId,
  goal: "fat_loss",
  situation: "Office job, trains twice a week, cooks at home most evenings.",
  practical_constraints: {
    eating_rhythm: ["breakfast", "lunch", "dinner"],
    cooks: true,
  },
  content_locale: "en-GB",
} as never);
say(`coach   : ${coach.coachId}`);
say(`élève   : ${student.userId}  (Theo, en-GB, Europe/London, fat_loss)`);
say(`plan    : publié (plan_versions + 2 plan_commitments)`);

type Step = {
  label: string;
  simDate: string;
  says: string[];
  /** La semaine à générer après ce jour, ou `null`. */
  generate: string | null;
};

const STEPS: Step[] = [
  {
    label: "S1 · lundi — la déclaration",
    simDate: "2026-07-06",
    says: [
      "I really can't stand broccoli. Never been able to eat it, the smell alone puts me off.",
      "I also skip breakfast most days, I just have a black coffee. I'm never hungry in the morning.",
      "And I've got a big project at work for the next two weeks, so no chance of cooking in the evening.",
    ],
    generate: "2026-07-06",
  },
  {
    label: "S1 · jeudi (J+3) — le revirement",
    simDate: "2026-07-09",
    says: [
      "Funny thing, I had broccoli roasted at a friend's place last night and it was actually fine. I'd eat it that way.",
    ],
    generate: null,
  },
  {
    label: "S2 · lundi (J+7) — le contexte tombe, une préférence s'ajoute",
    simDate: "2026-07-13",
    says: [
      "The work project is done, I've got my evenings back and I'm cooking again.",
      "One thing though, porridge in the morning is a no for me, it makes me gag.",
    ],
    generate: "2026-07-13",
  },
  {
    label: "S3 · lundi (J+14) — la rétractation du revirement",
    simDate: "2026-07-20",
    says: [
      "Forget what I said about broccoli. I tried it again at home and I hated it. The roasted thing was a one-off.",
    ],
    generate: "2026-07-20",
  },
];

for (const step of STEPS) {
  rule(step.label);
  const realBefore = new Date(Date.now() - 2000).toISOString();

  for (const text of step.says) {
    // Un tour SANS réponse relue en base est un tour perdu au transport, pas un
    // silence du produit. On le rejoue plutôt que de le compter.
    const r = await withRetry(
      "turn",
      () => turn(student, text),
      (v) => v.reply === null,
    );
    say(`  → « ${text} »`);
    if (r.reply === null) say("    🔴 AUCUNE RÉPONSE après 4 reprises — tour perdu");
    else say(`    ${r.reply.replace(/\n+/g, " ").slice(0, 160)}`);
  }

  const simIso = `${step.simDate}T09:00:00.000Z`;
  await backdate(student.userId, realBefore, simIso);
  const memBefore = new Date(Date.now() - 1000).toISOString();
  await runMemorizer(student.userId, `${step.simDate}T00:00:00.000Z`);
  await backdateMemory(student.userId, memBefore, simIso);

  say("");
  say("  ── memory_items après le memorizer ──");
  await dumpMemory(student.userId);

  say("");
  const card = await openCardAndKeepAll(student.userId);
  if (card.suspect.length > 0) {
    say(`  ── supersession NON PLAUSIBLE: ${card.suspect.length} ligne(s) gardée(s) ──`);
    for (const su of card.suspect) say(`    ⚠ ${su}`);
  }
  if (card.dropped.length > 0) {
    say(`  ── réconciliation: ${card.dropped.length} ligne(s) retirée(s) ──`);
    for (const d of card.dropped) say(`    − ${d}`);
  }
  say(`  ── la carte: ${card.kept.length} proposition(s) gardée(s) ──`);
  for (const k of card.kept) say(`    + ${k}`);

  const pc = await goalConstraints(student.userId);
  const list = (pc[FOOD_PREFERENCES_KEY] as string[] | undefined) ?? [];
  say("");
  say(`  ── food_preferences en base (${list.length}) ──`);
  for (const l of list) say(`    · ${l}`);

  say("");
  say("  ── ce que le générateur VOIT ──");
  say(`    ${promptLine(pc).slice(0, 900)}`);

  if (step.generate) {
    const gen = await generateWeek(student, step.generate);
    say("");
    say(`  ── generate-week-plan-v1 (${step.generate}) → ${gen.status} ──`);
    const items = (gen.json?.items ?? gen.json?.plan?.items ?? []) as Array<
      Record<string, unknown>
    >;
    if (!Array.isArray(items) || items.length === 0) {
      say(`    ${JSON.stringify(gen.json).slice(0, 500)}`);
    } else {
      for (const it of items) {
        say(
          `    · [${it.kind ?? "?"}] ${String(it.title ?? it.text ?? "")}  ${
            String(it.rationale ?? "").slice(0, 120)
          }`,
        );
      }
    }
  }
}

rule("ÉTAT FINAL");
const finalPc = await goalConstraints(student.userId);
say(JSON.stringify(finalPc, null, 2));
say("");
say("student_user_id (pour inspection): " + student.userId);

await Deno.writeTextFile(
  new URL("./N1-food-memory-over-time.txt", import.meta.url),
  out.join("\n") + "\n",
);
console.log("\n→ écrit docs/nutrition-pivot/qa-web/N1-food-memory-over-time.txt");
