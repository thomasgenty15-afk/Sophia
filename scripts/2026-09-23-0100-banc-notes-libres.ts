/**
 * BANC — NOTES LIBRES, HORS CORPUS, SUR LE VRAI CLASSIFIEUR.
 *
 * ⚠️ Le corpus (`draft_note_corpus.ts`) a servi à ÉCRIRE les règles du
 * prompt : 56/56 dessus mesure aussi l'ajustement. Ce banc-ci rejoue des notes
 * que personne n'a lues en écrivant une règle — c'est la seule mesure
 * honnête de ce que le lecteur fait sur une phrase neuve. Aucune attente
 * codée : on IMPRIME ce qui est rangé, et un humain juge.
 *
 *   OPENAI_API_KEY=… deno run --no-check --allow-env --allow-net --allow-read \
 *     scripts/2026-09-23-0100-banc-notes-libres.ts [--note "…"] [--file notes.json]
 *
 * Même rôle que le corpus (thomas propriétaire, christele, lea, zoe — deux
 * filles mineures, PAS de fils), mêmes aliments du plan, même lecteur que la
 * production. Aucune écriture en base.
 */
import {
  DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT,
  buildDraftNoteClassifyPrompt,
  readDraftNoteClassification,
} from "../supabase/functions/_shared/keel/draft_note_classify.ts";
import {
  CORPUS_MEMBERS,
  CORPUS_MEMBER_IDS,
  CORPUS_PLAN_FOODS,
  CORPUS_TARGET_WEEK,
  CORPUS_TODAY,
} from "../supabase/functions/_shared/keel/draft_note_corpus.ts";
import { generateWithGemini } from "../supabase/functions/_shared/gemini.ts";
import { keelGenerationModel } from "../supabase/functions/_shared/keel/generation_model.ts";

if (!Deno.env.get("OPENAI_API_KEY") && !Deno.env.get("GEMINI_API_KEY")) {
  console.error("⛔ aucune clé de modèle dans l'environnement — rien à mesurer.");
  Deno.exit(2);
}

/** Les notes par défaut : 5 simples, 7 composées. Aucune n'est dans le corpus. */
const DEFAULT_NOTES: { id: string; note: string }[] = [
  // ── simples ──
  { id: "s1-exclusion-nue", note: "pas de coriandre" },
  { id: "s2-gout-nomme", note: "Léa adore les crêpes" },
  { id: "s3-moins", note: "moins de viande rouge" },
  { id: "s4-table", note: "on mange pas de porc à la maison" },
  { id: "s5-merci", note: "merci c'était top, juste le poulet du mardi était un peu sec" },
  // ── composées ──
  { id: "c1-malade-plus-proteines", note: "Zoé a été malade cette semaine, évite les trucs trop gras pour elle pour l'instant, et sinon Thomas voudrait plus de protéines le midi" },
  { id: "c2-enfants-sauf", note: "les enfants ne mangent pas de poisson sauf le saumon" },
  { id: "c3-trop-et-consistant", note: "trop de pâtes ces derniers temps, et le petit déj de Christèle devrait être plus consistant" },
  { id: "c4-vendredi-pizza", note: "vendredi soir c'est pizza, on n'y touche pas" },
  { id: "c5-mari-allergique", note: "mon mari est allergique aux arachides" },
  { id: "c6-lait-mais-yaourt", note: "Pour Léa, pas de lait le matin, mais le yaourt ça passe" },
  { id: "c7-dimanche-soir-leger", note: "le dimanche soir on mange léger, une soupe et c'est tout" },
];

const args = Deno.args;
const oneNote = args.includes("--note") ? args[args.indexOf("--note") + 1] : null;
const file = args.includes("--file") ? args[args.indexOf("--file") + 1] : null;
const notes: { id: string; note: string }[] = oneNote
  ? [{ id: "note", note: oneNote }]
  : file
  ? JSON.parse(await Deno.readTextFile(file))
  : DEFAULT_NOTES;

const MOUTH_OF = new Map(
  (Object.entries(CORPUS_MEMBER_IDS) as [string, string][]).map(([m, id]) => [id, m] as const),
);
const who = (subject: unknown): string => {
  const s = String(subject ?? "");
  if (s === "household" || s === "") return "foyer";
  const uuid = s.startsWith("member:") ? s.slice(7) : s;
  return MOUTH_OF.get(uuid) ?? `?${uuid.slice(0, 8)}`;
};
const mouth = (memberId: unknown): string =>
  memberId === null || memberId === undefined ? "foyer" : (MOUTH_OF.get(String(memberId)) ?? "?");

const model = keelGenerationModel();
const run = async (entry: { id: string; note: string }) => {
  const userPrompt = buildDraftNoteClassifyPrompt({
    note: entry.note, contentLocale: "fr-FR", members: CORPUS_MEMBERS, planFoods: CORPUS_PLAN_FOODS,
  });
  let raw: unknown;
  try {
    raw = await generateWithGemini(
      DRAFT_NOTE_CLASSIFY_SYSTEM_PROMPT, userPrompt, 0, true, [], "auto",
      { source: "banc-notes-libres", model, forceInitialModel: true, httpTimeoutMs: 25_000, maxRetries: 1 },
    );
  } catch (error) {
    return { entry, lines: [`⛔ appel modèle en échec: ${String(error)}`] };
  }
  const out = readDraftNoteClassification({
    raw, today: CORPUS_TODAY, targetWeek: CORPUS_TARGET_WEEK, members: CORPUS_MEMBERS,
    note: entry.note, writtenAt: null, planFoods: CORPUS_PLAN_FOODS,
  });
  const lines: string[] = [];
  if (!out.ok) return { entry, lines: [`⛔ lecteur: REFUS GLOBAL ${out.refusal}`, `   brut: ${JSON.stringify(raw)}`] };
  const c = out.classification;
  const food = (i: { kind: string; text: string; subject: string; occasion?: unknown; force?: unknown }) =>
    `${i.kind} «${i.text}» ${who(i.subject)}${i.occasion ? ` @${i.occasion}` : ""}${i.force ? ` ${i.force}` : ""}`;
  for (const i of c.preferences.items) lines.push(`   preferences  ${food(i as never)}`);
  for (const e of c.nextPlan.entries) lines.push(`   next_plan    ${food(e.item as never)}`);
  for (const l of c.notes.lines) lines.push(`   notes        «${l.text}» ${who(l.subject)}${l.when ? ` (${l.when.weekday ?? "-"}/${l.when.slot ?? "-"})` : ""}`);
  for (const m of c.portions.moves) lines.push(`   portions     ${m.direction} ${mouth(m.memberId)}`);
  for (const m of c.settings.moves) lines.push(`   settings     ${m.about} ${m.direction}`);
  for (const m of c.slots.moves) lines.push(`   slots        ${m.slot} light=${m.light} ${mouth(m.memberId)}`);
  for (const r of c.cells.requests) lines.push(`   cells        ${r.day}/${r.slot} «${r.text}»`);
  const s = c.skipped;
  const sk = [["degree", s.degree], ["setting", s.setting], ["meal_story", s.mealStory], ["other", s.other]]
    .filter(([, n]) => (n as number) > 0).map(([w, n]) => `${w}×${n}`);
  if (sk.length) lines.push(`   skipped      ${sk.join(" ")}`);
  for (const e of c.clarify.entries) lines.push(`   clarify      ${e.about}/${e.gate} «${e.text}» [${e.options.join(" | ")}]`);
  for (const q of c.clarify.portions) lines.push(`   clarify      who/portions «${q.text}» ${q.direction} [${q.options.map(mouth).join(" | ")}]`);
  if (c.refused.total > 0) lines.push(`   ⚠️ refusés   ${c.refused.total} (${JSON.stringify(c.refused)})`);
  if (lines.length === 0) lines.push("   (neuf listes vides, sans motif)");
  return { entry, lines };
};

const results = await Promise.all(notes.map(run));
for (const r of results) {
  console.log(`\n── ${r.entry.id} — « ${r.entry.note} »`);
  for (const l of r.lines) console.log(l);
}
console.log(`\nmodèle: ${model} · ${results.length} notes`);
