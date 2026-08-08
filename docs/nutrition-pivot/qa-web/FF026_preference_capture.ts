/**
 * FF-026 — LA PRÉFÉRENCE CAPTÉE, ÉPROUVÉE DE BOUT EN BOUT.
 *
 * ── CE QUE CE SCRIPT PROUVE, ET QUE N1/W2 NE PROUVAIENT PAS ────────────────
 * `W2_memory_to_plan_real_run.ts` part d'un souvenir DÉJÀ écrit et s'arrête au
 * texte du prompt. `N1_food_memory_over_time.ts` joue trois semaines, mais avec
 * des phrases LONGUES (16 à 22 mots) — c'est-à-dire jamais celles de la fiche.
 *
 * Ce script part de la phrase, dans sa forme réelle et COURTE (« t'as mis du
 * riz, mais j'aime pas ça » — 10 mots), et va jusqu'au plat produit. C'est
 * cette longueur-là qui décidait de tout: mesuré le 2026-08-08, 10 des 15
 * formulations canoniques de la fiche étaient arrêtées par le filtre
 * anti-bruit du memorizer (`smart_pre_filter`, < 15 mots) et n'atteignaient
 * JAMAIS le LLM d'extraction. Les deux seules qui passaient le faisaient par
 * accident de vocabulaire (« hier » → signal de date, « en fait » → signal de
 * correction).
 *
 * ── CE QU'IL N'EST PAS ─────────────────────────────────────────────────────
 * Le geste « Keep » est joué par les fonctions PURES du pont, comme dans N1,
 * pas par un navigateur. C'est le même code que `FoodPreferencesCard` appelle
 * (`applyFoodPreferenceDecision` + écriture de `student_goals`), plus la
 * remontée `candidate` → `active` que fait `confirmMemoryItem`. Ce qui n'est
 * donc PAS couvert ici est le rendu de la carte, pas sa logique.
 *
 * USAGE
 *   set -a; . supabase/functions/night_llm.env; set +a
 *   deno run -A docs/nutrition-pivot/qa-web/FF026_preference_capture.ts <phase>
 *
 *   phases: A (capture FR/EN/R7/tiers) · B (allergie R1) · C (boucle + rétractation)
 *           D (fenêtre du jour même) · E (accumulation) · F (contradiction)
 */
import {
  admin,
  callAs,
  callCron,
  type Coach,
  makeCoach,
  makeStudent,
  publishPlanFor,
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
  PROMOTABLE_DOMAIN_KEYS,
  foodPreferencesForPrompt,
  proposeFoodPreferences,
  reconcileFoodPreferences,
} from "../../../supabase/functions/_shared/keel/food_preference_promotion.ts";

const PHASE = (Deno.args[0] ?? "A").toUpperCase();
const REPEATS = Number(Deno.args[1] ?? 3);

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

type Verdict = { level: string; scenario: string; pass: boolean; proof: string };
const verdicts: Verdict[] = [];
const record = (level: string, scenario: string, pass: boolean, proof: string) => {
  verdicts.push({ level, scenario, pass, proof });
  say(`  ${pass ? "✅" : "🔴"} [${level}] ${scenario}`);
  say(`      preuve: ${proof}`);
};

/** Le filet Kong: 502 sans corps sous charge. Transport uniquement. */
async function withRetry<T>(
  label: string,
  attempt: () => Promise<T>,
  isTransportFailure: (v: T) => boolean,
): Promise<T> {
  let last!: T;
  for (let i = 1; i <= 4; i += 1) {
    last = await attempt();
    if (!isTransportFailure(last)) return last;
    console.warn(`  ↻ ${label}: reprise ${i}/4`);
    await new Promise((r) => setTimeout(r, 3000 * i));
  }
  return last;
}
const is502 = (v: { status: number; json: any }) =>
  v.status === 502 ||
  String(v.json?.message ?? "").includes("invalid response was received");

// ---------------------------------------------------------------------------
// Le décor
// ---------------------------------------------------------------------------

const CREATED: string[] = [];

async function coachWithDoctrine(name: string): Promise<Coach> {
  const coach = await makeCoach({ displayName: name, country: "GB" });
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
  CREATED.push(coach.userId);
  return coach;
}

/** Un élève KEEL complet: profil, lien coach, plan publié, objectifs. */
async function studentWithPlan(
  coach: Coach,
  opts: { fullName: string; locale: string },
): Promise<Student> {
  const student = await makeStudent({
    coach,
    timezone: "Europe/London",
    country: "GB",
    fullName: opts.fullName,
    locale: opts.locale,
    withAdoptedPlan: false,
  });
  await publishPlanFor(coach, student.userId, { timezone: "Europe/London" });
  const { error } = await admin().from("student_goals").insert({
    user_id: student.userId,
    goal: "fat_loss",
    situation: "Office job, trains twice a week, cooks at home most evenings.",
    practical_constraints: {
      eating_rhythm: ["breakfast", "lunch", "dinner"],
      cooks: true,
    },
    content_locale: "en-GB",
  } as never);
  if (error) throw new Error(`student_goals: ${error.message}`);
  CREATED.push(student.userId);
  // Les fenêtres de repas repartent de demain pour CHAQUE élève: le curseur
  // est global, et sans remise à zéro le dernier élève d'un passage composerait
  // trois semaines dans le futur.
  mealWindowCursor = 0;
  return student;
}

async function cleanupAll() {
  const db = admin();
  for (const userId of CREATED) {
    for (
      const t of [
        "memory_item_sources", "memory_item_topics", "memory_item_entities",
        "memory_item_actions", "memory_message_processing", "memory_extraction_runs",
        "memory_items", "user_topic_memories", "student_goals", "student_week_plans",
        "student_safety_constraints", "chat_messages", "inbound_dedup",
        "outbound_messages", "protocol_events", "planned_deviations",
        "plan_commitments", "user_chat_states", "student_generated_meals",
      ]
    ) {
      await db.from(t).delete().eq("user_id", userId).then(() => {}, () => {});
    }
    await db.from("plan_versions").delete().eq("student_id", userId).then(
      () => {},
      () => {},
    );
    await db.from("coach_clients").delete().eq("student_user_id", userId).then(
      () => {},
      () => {},
    );
    await db.auth.admin.deleteUser(userId).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Les lectures
// ---------------------------------------------------------------------------

const MEM_COLUMNS =
  "id, kind, status, content_text, normalized_summary, domain_keys, confidence, " +
  "sensitivity_level, superseded_by_item_id, created_at";

async function memoryRows(userId: string): Promise<MemoryItemForPromotion[]> {
  const { data, error } = await admin()
    .from("memory_items")
    .select(MEM_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`memory_items: ${error.message}`);
  return (data ?? []) as never;
}

function textOf(i: MemoryItemForPromotion): string {
  return String(i.normalized_summary ?? "").trim() ||
    String(i.content_text ?? "").trim();
}

async function dumpMemory(userId: string) {
  const items = await memoryRows(userId);
  if (items.length === 0) {
    say("    (aucun souvenir)");
    return items;
  }
  for (const i of items) {
    say(
      `    ${String(i.id).slice(0, 8)} ${String(i.kind).padEnd(10)} ${
        String(i.status).padEnd(10)
      } c=${Number(i.confidence ?? 0).toFixed(2)} sens=${
        String(i.sensitivity_level ?? "normal").padEnd(9)
      } [${(i.domain_keys ?? []).join(",")}] ${textOf(i)}`,
    );
  }
  return items;
}

async function goalConstraints(userId: string): Promise<Record<string, unknown>> {
  const { data } = await admin()
    .from("student_goals")
    .select("practical_constraints")
    .eq("user_id", userId)
    .maybeSingle();
  return ((data as any)?.practical_constraints ?? {}) as Record<string, unknown>;
}

async function writeConstraints(userId: string, next: Record<string, unknown>) {
  const { error } = await admin()
    .from("student_goals")
    .update({ practical_constraints: next } as never)
    .eq("user_id", userId);
  if (error) throw new Error(`student_goals update: ${error.message}`);
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
    say(`    ⚠️ memorizer ${res.status}: ${JSON.stringify(res.json).slice(0, 200)}`);
  }
  return res;
}

/**
 * LE GESTE « KEEP », tel que `FoodPreferencesCard` le fait: réconcilier,
 * proposer, garder, et remonter le souvenir `candidate` en `active`
 * (`confirmMemoryItem`). Rend les textes gardés.
 */
async function openCardAndKeepAll(
  userId: string,
  firstName: string,
): Promise<{ kept: string[]; dropped: string[]; proposals: number }> {
  const items = await memoryRows(userId);
  let pc = await goalConstraints(userId);
  const reconciled = reconcileFoodPreferences({
    constraints: pc,
    items,
    ignoreTokens: ignorableTokens(firstName),
  });
  pc = reconciled.constraints;
  const proposals = proposeFoodPreferences({
    items,
    kept: (pc[FOOD_PREFERENCES_KEY] as string[] | undefined) ?? [],
    dismissed: (pc.food_preferences_dismissed as string[] | undefined) ?? [],
    origin: (pc[FOOD_PREFERENCES_ORIGIN_KEY] as Record<string, unknown> | undefined) ?? {},
  });
  for (const p of proposals) {
    pc = applyFoodPreferenceDecision(pc, {
      kind: "keep",
      text: p.text,
      memoryItemId: p.memoryItemId,
      replaces: p.replaces ?? null,
      seenAt: p.seenAt ?? null,
    });
    await admin()
      .from("memory_items")
      .update({ status: "active" } as never)
      .eq("id", p.memoryItemId)
      .eq("status", "candidate");
  }
  await writeConstraints(userId, pc);
  return {
    kept: ((pc[FOOD_PREFERENCES_KEY] as string[] | undefined) ?? []),
    dropped: reconciled.dropped.map((d) => `${d.text} [${d.status}]`),
    proposals: proposals.length,
  };
}

/**
 * UN VRAI REPAS COMPOSÉ.
 *
 * ── POURQUOI `prepare_next` ET UNE FENÊTRE EXACTE ─────────────────────────
 * `intent` vaut `replace_current` par défaut, et la RPC d'écriture exige alors
 * `replaces` — sans quoi elle lève `replaces_required` et rend 409. Le modèle a
 * bel et bien composé; c'est l'écriture qui refuse. Un run qui ne regarde que
 * le statut conclurait « le générateur ne marche pas », ce qui est faux.
 *
 * Chaque composition prend en plus une fenêtre EXACTE et DISJOINTE de la
 * précédente: deux fenêtres qui se chevauchent lèvent `plan_overlaps_existing`.
 * C'est aussi ce que la fiche demande — la préférence se voit à la PROCHAINE
 * composition, pas dans celle qui est déjà écrite.
 */
let mealWindowCursor = 0;
async function generateMeal(
  student: Student,
  opts: { days?: number } = {},
): Promise<{ status: number; json: any; text: string; startsOn: string }> {
  const days = opts.days ?? 2;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 1 + mealWindowCursor);
  mealWindowCursor += days;
  const startsOn = start.toISOString().slice(0, 10);
  const res = await withRetry(
    "generate-meal-v1",
    () =>
      callAs(student, "generate-meal-v1", {
        mode: "to_shop",
        intent: "prepare_next",
        window: { kind: "exact", starts_on: startsOn, duration_days: days },
        servings: 1,
      }),
    is502,
  );
  return {
    status: res.status,
    json: res.json,
    text: JSON.stringify(res.json ?? {}).toLowerCase(),
    startsOn,
  };
}

const nowIso = () => new Date().toISOString();
const sinceIso = () => new Date(Date.now() - 3600_000).toISOString();

/** Un mot présent dans un texte, insensible aux accents. */
function has(text: string, ...words: string[]): boolean {
  const n = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return words.some((w) =>
    n.includes(w.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase())
  );
}

/**
 * CE QUE LE PLAN FAIT VRAIMENT MANGER — titres de plats, ingrédients, courses.
 *
 * ── LE FAUX ROUGE QUE ÇA CORRIGE, ET IL A ÉTÉ MESURÉ ──────────────────────
 * Première version de cette sonde: chercher l'aliment dans le JSON ENTIER de
 * la réponse. Elle a rendu un ROUGE sur ce passage:
 *
 *   « …keeps the meal satisfying WITHOUT LEANING ON RICE. »
 *
 * C'est-à-dire sur une phrase de `rationale` où le modèle EXPLIQUE qu'il a
 * évité le riz. Le générateur avait parfaitement obéi, et la sonde envoyait le
 * corriger. Un harnais qui ment dans le sens de l'échec coûte aussi cher qu'un
 * qui ment dans le sens du succès: les deux font travailler sur un défaut qui
 * n'existe pas.
 *
 * On ne regarde donc QUE les champs qui décident du contenu de l'assiette —
 * jamais la prose. Et `\b…s?\b` plutôt qu'un `includes`, sinon `rice` mord
 * dans `price` et `liquorice`.
 */
function plateTerms(json: any): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const s = String(v ?? "").trim();
    if (s) out.push(s);
  };
  for (const dish of (json?.dishes ?? []) as any[]) {
    push(dish?.title);
    for (const ing of (dish?.ingredients ?? []) as any[]) push(ing?.term);
  }
  for (const prep of (json?.preparations ?? []) as any[]) {
    push(prep?.title);
    for (const ing of (prep?.ingredients ?? []) as any[]) push(ing?.term);
  }
  for (const item of (json?.shopping_list ?? []) as any[]) push(item?.term);
  return out;
}

function foodOnPlate(
  json: any,
  ...words: string[]
): { found: boolean; where: string } {
  const terms = plateTerms(json);
  for (const w of words) {
    const needle = w.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const re = new RegExp(`\\b${needle}s?\\b`);
    for (const term of terms) {
      const n = term.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
      if (re.test(n)) return { found: true, where: term };
    }
  }
  return { found: false, where: `${terms.length} terme(s) d'assiette, aucun` };
}

// ---------------------------------------------------------------------------
// PHASE A — la capture, dans les deux langues, plat vs ingrédients, tiers
// ---------------------------------------------------------------------------

async function phaseA() {
  rule("PHASE A — LA CAPTURE (easy FR · medium EN · R7 le plat · tiers)");
  for (let run = 1; run <= REPEATS; run += 1) {
    say("");
    say(`── passage ${run}/${REPEATS} ──`);
    const coach = await coachWithDoctrine(`FF026 A${run}`);
    const student = await studentWithPlan(coach, {
      fullName: "ff026Alix",
      locale: "en-US",
    });
    const since = sinceIso();

    // Les phrases COURTES de la fiche, mot pour mot.
    const SAYS = [
      "t'as mis du riz, mais j'aime pas ça",
      "I don't like mushrooms",
      "j'ai pas aimé le curry",
      "mon fils déteste les épinards",
    ];
    // R6 — LA CAPTURE EST SILENCIEUSE. Un contrôle qui ne consigne QUE ses
    // échecs rend « rien à signaler » indistinguable de « jamais exécuté »:
    // on accumule donc les réponses et on rend un verdict, réussi ou non.
    const asked: string[] = [];
    for (const s of SAYS) {
      const r = await withRetry("turn", () => turn(student, s), (v) => v.reply === null);
      say(`  → « ${s} »`);
      say(`    ${(r.reply ?? "(AUCUNE RÉPONSE)").replace(/\n+/g, " ").slice(0, 150)}`);
      const reply = r.reply ?? "";
      if (
        has(reply, "veux-tu que j'enregistre", "do you want me to save",
          "should i remember that", "shall i note that", "voulez-vous que je note",
          "want me to remember", "should i save", "do you want me to remember",
          "dois-je noter", "je note ça ?")
      ) {
        asked.push(`« ${s} » → ${reply.slice(0, 140)}`);
      }
    }
    record(
      "adversarial",
      "H10/R6 la capture est silencieuse — aucune demande de confirmation",
      asked.length === 0,
      asked.length === 0
        ? `${SAYS.length} tours, aucune formule de confirmation ("veux-tu que j'enregistre", "should I remember that", …)`
        : `FORMULAIRE DÉGUISÉ: ${asked.join(" || ")}`,
    );

    await runMemorizer(student.userId, since);
    say("");
    say("  ── memory_items ──");
    const items = await dumpMemory(student.userId);
    const food = items.filter((i) =>
      (i.domain_keys ?? []).some((k) => PROMOTABLE_DOMAIN_KEYS.includes(String(k)))
    );

    const rice = food.find((i) => has(textOf(i), "rice", "riz"));
    record(
      "easy",
      `FR courte « t'as mis du riz, mais j'aime pas ça » → item alimentaire`,
      Boolean(rice),
      rice
        ? `memory_items ${String(rice.id).slice(0, 8)} status=${rice.status} c=${rice.confidence} [${(rice.domain_keys ?? []).join(",")}] « ${textOf(rice)} »`
        : `aucun item mentionnant riz/rice parmi ${items.length} souvenir(s)`,
    );

    const mush = food.find((i) => has(textOf(i), "mushroom", "champignon"));
    record(
      "medium",
      `EN courte « I don't like mushrooms » → item alimentaire`,
      Boolean(mush),
      mush
        ? `memory_items ${String(mush.id).slice(0, 8)} status=${mush.status} c=${mush.confidence} « ${textOf(mush)} »`
        : `aucun item mentionnant mushroom/champignon parmi ${items.length} souvenir(s)`,
    );

    // R7 — LE TEST ANTI-GÉNÉRALISATION. « j'ai pas aimé le curry » vise LE
    // PLAT. Un item qui parle de poulet ou de lait de coco est la pathologie
    // de décomposition que T-3 (FF-009/FF-017) nomme déjà côté intake.
    const curry = food.find((i) => has(textOf(i), "curry"));
    const decomposed = food.filter((i) =>
      has(textOf(i), "chicken", "poulet", "coconut", "coco", "cumin", "curcuma", "turmeric")
    );
    record(
      "medium",
      "R7 « j'ai pas aimé le curry » → le PLAT, pas ses ingrédients",
      Boolean(curry) && decomposed.length === 0,
      curry
        ? `item « ${textOf(curry)} » ; items décomposés en ingrédients: ${
          decomposed.length === 0 ? "aucun" : decomposed.map(textOf).join(" | ")
        }`
        : `aucun item « curry » (décomposés: ${decomposed.length})`,
    );

    // §11 — NON TRANCHÉ par la fiche. On consigne, on ne juge pas.
    const third = items.find((i) => has(textOf(i), "spinach", "epinard", "son", "fils"));
    say(
      `  ⚪ [xhard] préférence pour un tiers (« mon fils déteste les épinards ») — NON TRANCHÉ par la fiche §11`,
    );
    say(
      `      observé: ${
        third
          ? `memory_items ${String(third.id).slice(0, 8)} [${(third.domain_keys ?? []).join(",")}] « ${textOf(third)} »`
          : "aucun item"
      }`,
    );
    // La question qui compte n'est pas « l'item existe-t-il » mais « le pont
    // le proposerait-il au plan de l'ÉLÈVE ». On le demande à la fonction
    // elle-même: `sensitivity_level` et les clés de domaine décident, pas nous.
    const allProposals = proposeFoodPreferences({ items });
    const thirdProposed = allProposals.filter((p) => has(p.text, "spinach", "epinard", "son"));
    say(
      `      proposé au plan de l'ÉLÈVE par le pont: ${
        thirdProposed.length > 0
          ? `OUI — « ${thirdProposed.map((p) => p.text).join(" | ")} » deviendrait une contrainte de composition`
          : `non (sensitivity=${third ? third.sensitivity_level : "n/a"}, clés=[${third ? (third.domain_keys ?? []).join(",") : ""}])`
      }`,
    );
    say(`      propositions totales du pont ce passage: ${allProposals.length} — ${JSON.stringify(allProposals.map((p) => p.text))}`);
  }
}

// ---------------------------------------------------------------------------
// PHASE B — R1: une allergie n'est pas une préférence
// ---------------------------------------------------------------------------

async function phaseB() {
  rule("PHASE B — R1 · ALLERGIE ≠ PRÉFÉRENCE (les deux langues)");
  for (let run = 1; run <= REPEATS; run += 1) {
    say("");
    say(`── passage ${run}/${REPEATS} ──`);
    const coach = await coachWithDoctrine(`FF026 B${run}`);
    for (
      const [lang, phrase, allergen] of [
        ["FR", "je suis allergique aux noix", "noix"],
        ["EN", "I'm allergic to peanuts", "peanut"],
      ] as const
    ) {
      const student = await studentWithPlan(coach, {
        fullName: `ff026Bo${lang}`,
        locale: lang === "FR" ? "fr-FR" : "en-US",
      });
      const since = sinceIso();
      const r = await withRetry("turn", () => turn(student, phrase), (v) => v.reply === null);
      say(`  → [${lang}] « ${phrase} »`);
      say(`    ${(r.reply ?? "(AUCUNE)").replace(/\n+/g, " ").slice(0, 150)}`);

      // Les colonnes RÉELLES de la table. `label` n'existe pas — un select qui
      // le nomme rend une erreur PostgREST, donc zéro ligne, donc un ROUGE sur
      // une ceinture qui a parfaitement fonctionné. L'erreur est relevée et
      // affichée plutôt qu'avalée: c'est la différence entre « la garde n'a pas
      // tiré » et « ma sonde ne sait pas lire ».
      const { data: sc, error: scErr } = await admin()
        .from("student_safety_constraints")
        .select(
          "id, kind, allergen_ref, substance_ref, severity, status, source_message_id, created_at",
        )
        .eq("user_id", student.userId);
      if (scErr) say(`    ⚠️ lecture student_safety_constraints: ${scErr.message}`);
      const constraints = (sc ?? []) as any[];
      record(
        "hard",
        `[${lang}] « ${phrase} » → contrainte de SÉCURITÉ déclarée`,
        constraints.length > 0,
        constraints.length > 0
          ? `student_safety_constraints: ${
            constraints.map((c) =>
              `${String(c.id).slice(0, 8)} kind=${c.kind} allergen_ref=${c.allergen_ref} substance_ref=${c.substance_ref} sev=${c.severity} status=${c.status}`
            ).join(" ; ")
          }`
          : "student_safety_constraints: 0 ligne",
      );

      await runMemorizer(student.userId, since);
      const items = await memoryRows(student.userId);
      say("  ── memory_items ──");
      await dumpMemory(student.userId);
      const proposals = proposeFoodPreferences({ items });
      const allergenProposal = proposals.filter((p) => has(p.text, allergen, "allerg"));
      record(
        "hard",
        `[${lang}] « ${phrase} » → AUCUNE préférence promouvable`,
        allergenProposal.length === 0,
        allergenProposal.length === 0
          ? `proposeFoodPreferences: ${proposals.length} proposition(s), aucune sur l'allergène (items: ${
            items.map((i) => `${i.sensitivity_level}/${i.status}`).join(",") || "aucun"
          })`
          : `FUITE: ${allergenProposal.map((p) => p.text).join(" | ")}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// PHASE C — la boucle complète jusqu'au PLAT, puis la rétractation
// ---------------------------------------------------------------------------

async function phaseC() {
  rule("PHASE C — R5 LA BOUCLE JUSQU'AU PLAT · R3 LA RÉTRACTATION");
  for (let run = 1; run <= REPEATS; run += 1) {
    say("");
    say(`── passage ${run}/${REPEATS} ──`);
    const coach = await coachWithDoctrine(`FF026 C${run}`);
    const student = await studentWithPlan(coach, {
      fullName: "ff026Cam",
      locale: "en-US",
    });

    // 1. LE PLAT DE RÉFÉRENCE, avant toute préférence: sans lui, « pas de riz »
    //    ne prouve rien — le générateur pouvait ne jamais en mettre.
    const before = await generateMeal(student);
    const riceBeforeHit = foodOnPlate(before.json, "rice", "riz");
    const riceBefore = riceBeforeHit.found;
    say(`  ── plat AVANT toute préférence (${before.status}) — riz présent: ${riceBefore ? "OUI" : "non"}`);
    if (riceBefore) say(`     … « ${riceBeforeHit.where} »`);

    // 2. La phrase courte de la fiche.
    const since = sinceIso();
    const r = await withRetry(
      "turn",
      () => turn(student, "t'as mis du riz, mais j'aime pas ça"),
      (v) => v.reply === null,
    );
    say(`  → « t'as mis du riz, mais j'aime pas ça »`);
    say(`    ${(r.reply ?? "(AUCUNE)").replace(/\n+/g, " ").slice(0, 150)}`);

    // 3. FENÊTRE DU JOUR MÊME (§7): une génération AVANT le memorizer.
    const sameDay = await generateMeal(student);
    const pcSameDay = await goalConstraints(student.userId);
    record(
      "hard",
      "§7 génération le jour même, AVANT le memorizer → la préférence n'y est pas",
      ((pcSameDay[FOOD_PREFERENCES_KEY] as unknown[] | undefined) ?? []).length === 0,
      `food_preferences en base: ${JSON.stringify(pcSameDay[FOOD_PREFERENCES_KEY] ?? [])} ; riz dans le plat: ${
        foodOnPlate(sameDay.json, "rice", "riz").found ? "OUI" : "non"
      } — limite DOCUMENTÉE, pas un défaut`,
    );

    // 4. Le memorizer, puis le geste « Keep ».
    await runMemorizer(student.userId, since);
    say("  ── memory_items après memorizer ──");
    await dumpMemory(student.userId);
    const card = await openCardAndKeepAll(student.userId, "ff026Cam");
    say(`  ── carte: ${card.proposals} proposition(s) → gardées: ${JSON.stringify(card.kept)}`);

    const pcKept = await goalConstraints(student.userId);
    const keptList = (pcKept[FOOD_PREFERENCES_KEY] as string[] | undefined) ?? [];
    const keptRice = keptList.some((k) => has(k, "rice", "riz"));
    record(
      "easy",
      "la préférence gardée atteint `practical_constraints.food_preferences`",
      keptRice,
      `student_goals.practical_constraints.food_preferences = ${JSON.stringify(keptList)}`,
    );
    say(`  ── ce que le générateur VOIT: ${JSON.stringify(constraintsForPrompt(pcKept)).slice(0, 500)}`);

    // 5. LE PLAT D'APRÈS — c'est LUI le verdict de R5.
    const after = await generateMeal(student);
    const riceAfterHit = foodOnPlate(after.json, "rice", "riz");
    const riceAfter = riceAfterHit.found;
    record(
      "easy",
      "R5 la boucle se juge AU PLAT: le repas suivant ne contient pas de riz",
      !riceAfter,
      `generate-meal-v1 ${after.status} — riz AVANT (témoin): ${
        riceBefore ? `OUI « ${riceBeforeHit.where} »` : "non"
      } / riz APRÈS: ${
        riceAfter ? `OUI « ${riceAfterHit.where} »` : `non (${riceAfterHit.where})`
      } ; préférence servie: ${JSON.stringify(foodPreferencesForPrompt(pcKept))}`,
    );

    // 5bis. H3 — LE TEXTE GARDÉ EST CELUI DU MEMORIZER, à la 3e personne et
    // souvent préfixé du PRÉNOM (« Alix dislikes rice. »). Il part tel quel
    // dans le prompt. S'il ressort dans le plan rendu à l'élève, c'est la
    // famille de la cicatrice `defense_card`: un artefact interne en texte
    // visible, et une voix qui parle de l'élève à la 3e personne.
    const leaked = keptList.filter((k) => after.text.includes(k.toLowerCase()));
    record(
      "adversarial",
      "H3 le résumé interne du memorizer ne ressort pas en texte visible du plan",
      leaked.length === 0 && !has(after.text, "ff026cam"),
      `préférences gardées retrouvées mot pour mot dans le plan: ${
        leaked.length === 0 ? "aucune" : JSON.stringify(leaked)
      } ; prénom « ff026Cam » présent: ${has(after.text, "ff026cam") ? "OUI" : "non"}`,
    );

    // 6. LA RÉTRACTATION (R3).
    const since2 = sinceIso();
    const r2 = await withRetry(
      "turn",
      () => turn(student, "en fait j'aime bien le riz"),
      (v) => v.reply === null,
    );
    say(`  → « en fait j'aime bien le riz »`);
    say(`    ${(r2.reply ?? "(AUCUNE)").replace(/\n+/g, " ").slice(0, 150)}`);
    await runMemorizer(student.userId, since2);
    say("  ── memory_items après rétractation ──");
    const itemsAfter = await dumpMemory(student.userId);

    // La réconciliation SERVEUR, celle qui tourne dans le générateur.
    const afterRetract = await generateMeal(student);
    const pcFinal = await goalConstraints(student.userId);
    const finalList = (pcFinal[FOOD_PREFERENCES_KEY] as string[] | undefined) ?? [];
    const stillDislike = finalList.some((k) =>
      has(k, "rice", "riz") && has(k, "dislike", "not like", "n'aime", "aime pas", "hate", "avoid")
    );
    const superseded = itemsAfter.filter((i) =>
      ["superseded", "invalidated"].includes(String(i.status))
    );
    record(
      "hard",
      "R3 la rétractation est honorée — l'ancienne préférence n'est plus active",
      !stillDislike,
      `food_preferences après réconciliation serveur = ${JSON.stringify(finalList)} ; items retirés par la mémoire: ${
        superseded.length === 0
          ? "AUCUN (statuts: " + itemsAfter.map((i) => i.status).join(",") + ")"
          : superseded.map((i) => `${String(i.id).slice(0, 8)}=${i.status}`).join(",")
      } ; riz dans le plat d'après: ${foodOnPlate(afterRetract.json, "rice", "riz").found ? "OUI" : "non"}`,
    );
    record(
      "hard",
      "R3 la rétractation n'EMPILE pas deux lignes contradictoires",
      !(finalList.filter((k) => has(k, "rice", "riz")).length > 1),
      `lignes mentionnant le riz: ${JSON.stringify(finalList.filter((k) => has(k, "rice", "riz")))}`,
    );
  }
}

// ---------------------------------------------------------------------------
// PHASE F — préférences contradictoires: le générateur arbitre et le DIT
// ---------------------------------------------------------------------------

async function phaseF() {
  rule("PHASE F — §7 CONTRADICTION (« j'aime pas le riz » puis « j'adore le risotto »)");
  for (let run = 1; run <= REPEATS; run += 1) {
    say("");
    say(`── passage ${run}/${REPEATS} ──`);
    const coach = await coachWithDoctrine(`FF026 F${run}`);
    const student = await studentWithPlan(coach, {
      fullName: "ff026Flo",
      locale: "en-US",
    });
    const since = sinceIso();
    for (const s of ["j'aime pas le riz", "j'adore le risotto"]) {
      const r = await withRetry("turn", () => turn(student, s), (v) => v.reply === null);
      say(`  → « ${s} »`);
      say(`    ${(r.reply ?? "(AUCUNE)").replace(/\n+/g, " ").slice(0, 130)}`);
    }
    await runMemorizer(student.userId, since);
    say("  ── memory_items ──");
    await dumpMemory(student.userId);
    const card = await openCardAndKeepAll(student.userId, "ff026Flo");
    const pc = await goalConstraints(student.userId);
    const list = (pc[FOOD_PREFERENCES_KEY] as string[] | undefined) ?? [];
    const hasRice = list.some((k) => has(k, "rice", "riz"));
    const hasRisotto = list.some((k) => has(k, "risotto"));
    record(
      "xhard",
      "§7 les deux préférences contradictoires EXISTENT (pas de résolution silencieuse)",
      hasRice && hasRisotto,
      `food_preferences = ${JSON.stringify(list)} (propositions: ${card.proposals})`,
    );
    const meal = await generateMeal(student);
    record(
      "xhard",
      "§7 le générateur produit un plat malgré la contradiction",
      meal.status === 200,
      `generate-meal-v1 ${meal.status} ; riz: ${foodOnPlate(meal.json, "rice", "riz").found ? "OUI" : "non"} ; risotto: ${
        foodOnPlate(meal.json, "risotto").found ? "OUI" : "non"
      } ; extrait: ${meal.text.slice(0, 260)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// PHASE E — l'accumulation: huit préférences, le plan reste composable
// ---------------------------------------------------------------------------

async function phaseE() {
  rule("PHASE E — §10 CONTRE-MESURE: huit préférences, le plan reste composable");
  const coach = await coachWithDoctrine("FF026 E1");
  const student = await studentWithPlan(coach, {
    fullName: "ff026Eli",
    locale: "en-US",
  });
  // Huit préférences POSÉES DIRECTEMENT (le chemin de capture est éprouvé en
  // phase A; ce qu'on mesure ici est la composabilité en aval).
  const EIGHT = [
    "ff026Eli dislikes rice.",
    "ff026Eli dislikes mushrooms.",
    "ff026Eli dislikes spinach.",
    "ff026Eli dislikes porridge.",
    "ff026Eli dislikes fish.",
    "ff026Eli dislikes eggs.",
    "ff026Eli dislikes lentils.",
    "ff026Eli dislikes yoghurt.",
  ];
  let pc = await goalConstraints(student.userId);
  const today = new Date().toISOString().slice(0, 10);
  for (const text of EIGHT) {
    pc = applyFoodPreferenceDecision(pc, { kind: "keep", text, seenAt: today });
  }
  await writeConstraints(student.userId, pc);
  const list = (pc[FOOD_PREFERENCES_KEY] as string[] | undefined) ?? [];
  say(`  food_preferences posées: ${list.length}`);
  const meal = await generateMeal(student, { days: 3 });
  const violations = ["rice", "mushroom", "spinach", "porridge", "fish", "egg", "lentil", "yoghurt"]
    .filter((w) => foodOnPlate(meal.json, w).found);
  record(
    "xhard",
    "§10 huit préférences → le générateur compose encore un plat",
    meal.status === 200 && meal.text.length > 200,
    `generate-meal-v1 ${meal.status} ; taille réponse: ${meal.text.length} ; aliments écartés qui réapparaissent: ${
      violations.length === 0 ? "aucun" : violations.join(",")
    } ; extrait: ${meal.text.slice(0, 300)}`,
  );
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// PHASE G — la contre-mesure de mon propre correctif: la SUR-CAPTURE
// ---------------------------------------------------------------------------

/**
 * L'élargissement du filtre anti-bruit admet `i like` / `adore`, qui sont des
 * tournures BAVARDES. La fiche §10 nomme la sur-capture comme LA contre-mesure
 * de cette fonctionnalité: « des préférences fantômes qui appauvrissent les
 * plans ». Ce que ce passage mesure n'est donc pas « la phrase atteint-elle le
 * LLM » (elle le doit, c'est le principe: cinq filtres en aval) mais **« un
 * bavardage devient-il une préférence PROPOSABLE au plan »**. C'est la seule
 * question qui coûte quelque chose.
 */
async function phaseG() {
  rule("PHASE G — §10 SUR-CAPTURE: le bavardage devient-il une préférence ?");
  for (let run = 1; run <= REPEATS; run += 1) {
    say("");
    say(`── passage ${run}/${REPEATS} ──`);
    const coach = await coachWithDoctrine(`FF026 G${run}`);
    const student = await studentWithPlan(coach, {
      fullName: "ff026Gus",
      locale: "en-US",
    });
    const since = sinceIso();
    // Du bavardage pur, qui franchit DÉSORMAIS la porte élargie.
    const CHATTER = [
      "I like that idea, thanks",
      "j'adore, merci !",
      "haha j'aime bien ta façon de dire ça",
      "sounds good, I love it",
    ];
    for (const s of CHATTER) {
      const r = await withRetry("turn", () => turn(student, s), (v) => v.reply === null);
      say(`  → « ${s} »`);
      say(`    ${(r.reply ?? "(AUCUNE)").replace(/\n+/g, " ").slice(0, 110)}`);
    }
    await runMemorizer(student.userId, since);
    say("  ── memory_items ──");
    const items = await dumpMemory(student.userId);
    const proposals = proposeFoodPreferences({ items });
    record(
      "adversarial",
      "H4 sur-capture — un bavardage court ne devient PAS une préférence proposable",
      proposals.length === 0,
      `${items.length} souvenir(s) créé(s) ; proposeFoodPreferences rend ${proposals.length} proposition(s)${
        proposals.length > 0 ? `: ${JSON.stringify(proposals.map((p) => p.text))}` : ""
      }`,
    );
  }
}

const PHASES: Record<string, () => Promise<void>> = {
  A: phaseA,
  B: phaseB,
  C: phaseC,
  E: phaseE,
  F: phaseF,
  G: phaseG,
};

const fn = PHASES[PHASE];
if (!fn) throw new Error(`phase inconnue: ${PHASE} (A|B|C|E|F)`);

try {
  await fn();
} finally {
  rule("SYNTHÈSE");
  const pass = verdicts.filter((v) => v.pass).length;
  say(`${pass}/${verdicts.length} verdicts au vert`);
  for (const v of verdicts) {
    say(`  ${v.pass ? "✅" : "🔴"} [${v.level}] ${v.scenario}`);
  }
  say("");
  say(`nettoyage: ${CREATED.length} compte(s)`);
  await cleanupAll();
  await Deno.writeTextFile(
    new URL(`./FF026-phase-${PHASE}.txt`, import.meta.url),
    out.join("\n") + "\n",
  );
  console.log(`\n→ écrit docs/nutrition-pivot/qa-web/FF026-phase-${PHASE}.txt`);
}
