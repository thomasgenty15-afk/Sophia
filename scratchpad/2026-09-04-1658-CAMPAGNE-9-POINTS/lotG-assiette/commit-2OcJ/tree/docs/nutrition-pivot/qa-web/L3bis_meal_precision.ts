/**
 * L3-bis — LE REPAS DÉCLARÉ EN TEXTE, ET LA QUESTION DE PRÉCISION.
 *
 * Deux lignes rouges du prompt de mission, et elles sont testées ici en réel:
 *   1. AUCUNE question posée à l'élève ne demande une quantité ;
 *   2. un repas mangé une fois ne produit JAMAIS deux faits.
 *
 * Chaque cas tourne sur un élève neuf. Le compte de `protocol_events` est pris
 * AVANT et APRÈS la réponse de l'élève — c'est LE test du lot.
 */
import { admin, makeCoach, makeStudent, sql, turn, type Coach } from "./harness.ts";

const lines: string[] = [];
const say = (s: string) => {
  console.log(s);
  lines.push(s);
};

/** Lexique de quantité, FR + EN. Une seule occurrence dans une question = P0. */
const QUANTITY_LEXICON = [
  "how much", "how many", "how large", "how big", "portion", "portions",
  "gram", "grams", "gramme", "grammes", "ounce", "oz", "calorie", "calories",
  "serving", "servings", "quantity", "amount", "combien", "quantite",
  "grosse", "grosses", "gros", "copieux", "copieuse", "beaucoup",
  "generous", "plenty", "a lot", "bien mange", "bien mangé", "assiette pleine",
  "half a", "a whole", "une pleine",
];

function quantityHitsIn(text: string): string[] {
  const flat = String(text ?? "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  return QUANTITY_LEXICON.filter((term) =>
    new RegExp(`(^|[^a-z])${term.replace(/ /g, "\\s+")}([^a-z]|$)`).test(flat)
  );
}

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

async function countEvents(userId: string): Promise<number> {
  const out = await sql(
    `select count(*) as c from protocol_events where user_id='${userId}'`,
  );
  return Number((out.split("\n")[1] ?? "0").trim());
}

async function questionsAsked(userId: string): Promise<string[]> {
  const out = await sql(
    `select question as q from meal_precision_questions where user_id='${userId}' order by asked_at`,
  ).catch(() => "");
  return out.split("\n").slice(1).map((l) => l.trim()).filter(Boolean);
}

const allQuestionsSeen: string[] = [];

type Case = {
  id: string;
  first: string;
  /** Attendu: une question de précision part-elle ? */
  expectQuestion: boolean;
  /** La réponse de l'élève, si on veut éprouver la moitié « pas de doublon ». */
  answer?: string;
  /** Combien de lignes de plus la réponse a-t-elle le droit de créer. */
  maxNewEvents?: number;
  note?: string;
};

const CASES: Case[] = [
  // ── PAUVRES: une question doit partir (six déclarations différentes) ──────
  { id: "pauvre-1-EN", first: "I had chicken", expectQuestion: true, answer: "with rice and some broccoli", maxNewEvents: 2 },
  { id: "pauvre-2-EN", first: "I had a salad", expectQuestion: true, answer: "chicken and avocado in it", maxNewEvents: 2 },
  { id: "pauvre-3-EN", first: "a sandwich", expectQuestion: true },
  { id: "pauvre-4-FR", first: "j'ai mangé du poulet", expectQuestion: true, answer: "avec du riz", maxNewEvents: 1 },
  { id: "pauvre-5-FR", first: "j'ai pris une salade", expectQuestion: true },
  { id: "pauvre-6-FR", first: "un sandwich ce midi", expectQuestion: true },
  // ── COMPLÈTES: le contre-factuel, il compte autant ────────────────────────
  { id: "complete-1-FR", first: "Poulet grillé, riz complet et brocolis à midi", expectQuestion: false },
  { id: "complete-2-EN", first: "Grilled salmon with quinoa and green beans for dinner", expectQuestion: false },
  // ── AUTO-SUFFISANTES ──────────────────────────────────────────────────────
  { id: "suffit-1-EN", first: "an apple", expectQuestion: false },
  { id: "suffit-2-EN", first: "a glass of water", expectQuestion: false },
  { id: "suffit-3-FR", first: "une pomme", expectQuestion: false },
  // ── CORRECTION: amende, sans seconde ligne ────────────────────────────────
  { id: "correction-EN", first: "I had chicken with rice for lunch", expectQuestion: false, answer: "actually no, it was turkey", maxNewEvents: 0 },
  // ── ADVERSARIAL: intention future — aucune écriture, aucune question ──────
  { id: "futur-EN", first: "I'm going to have chicken tonight", expectQuestion: false, note: "aucune écriture attendue" },
  { id: "futur-FR", first: "je vais manger du poulet ce soir", expectQuestion: false, note: "aucune écriture attendue" },
];

const only = Deno.args[0] ?? null;

for (const c of CASES) {
  if (only && !c.id.includes(only)) continue;
  const coach = await coachWithDoctrine();
  const student = await makeStudent({ coach, timezone: "Europe/London", country: "GB" });

  say(`\n${"═".repeat(76)}`);
  say(`▌ ${c.id}   élève=${student.userId}`);
  say("═".repeat(76));

  const r1 = await turn(student, c.first);
  const after1 = await countEvents(student.userId);
  const q1 = await questionsAsked(student.userId);
  allQuestionsSeen.push(...q1);

  say(`ÉLÈVE  : ${c.first}`);
  say(`SOPHIA : ${r1.reply}`);
  say(`events après le 1er tour : ${after1}`);
  say(`questions de précision   : ${JSON.stringify(q1)}`);

  const gotQuestion = q1.length > 0;
  say(
    gotQuestion === c.expectQuestion
      ? `✅ question attendue=${c.expectQuestion}, obtenue=${gotQuestion}`
      : `🔴 question attendue=${c.expectQuestion}, obtenue=${gotQuestion}`,
  );
  if (c.note && after1 > 0) say(`🔴 ${c.note} — or ${after1} ligne(s) écrite(s)`);

  if (c.answer) {
    const r2 = await turn(student, c.answer);
    const after2 = await countEvents(student.userId);
    const delta = after2 - after1;
    say(`\nÉLÈVE  : ${c.answer}`);
    say(`SOPHIA : ${r2.reply}`);
    say(`events après la réponse  : ${after2}  (delta ${delta}, plafond ${c.maxNewEvents})`);
    say(
      delta <= (c.maxNewEvents ?? 0)
        ? `✅ pas de repas en double`
        : `🔴 DOUBLON: ${delta} nouvelle(s) ligne(s) pour ${c.maxNewEvents} autorisée(s)`,
    );
    const amendments = await sql(
      `select left(recognized->'amendments'::text::text, 200) from protocol_events where user_id='${student.userId}' and recognized ? 'amendments'`,
    ).catch(() => "");
    say(`amendments : ${amendments.split("\n").slice(1).join(" ").trim() || "<aucun>"}`);
    say(`lignes     : ${await sql(
      `select coalesce(food_group_ref,'?') fg, coalesce(recognized->>'label', '') lbl from protocol_events where user_id='${student.userId}' order by created_at`,
    )}`);
  }
}

// ── 🔴 LA LIGNE ROUGE ────────────────────────────────────────────────────────
say(`\n${"█".repeat(76)}`);
say("LIGNE ROUGE — aucune question ne doit demander une quantité");
say("█".repeat(76));
say(`questions rendues à un élève, toutes confondues (${allQuestionsSeen.length}) :`);
for (const q of [...new Set(allQuestionsSeen)]) {
  const hits = quantityHitsIn(q);
  say(`  ${hits.length === 0 ? "✅" : "🔴"} « ${q} »${hits.length ? ` → ${JSON.stringify(hits)}` : ""}`);
}

await Deno.writeTextFile(
  new URL(`./L3bis-meal-precision${only ? `-${only}` : ""}.txt`, import.meta.url),
  lines.join("\n") + "\n",
);
console.log("\n→ écrit");
