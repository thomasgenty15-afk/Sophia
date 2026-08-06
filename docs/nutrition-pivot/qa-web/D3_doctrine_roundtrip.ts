/**
 * D3 — LE VA-ET-VIENT DE L'ÉCRAN, contre la vraie fonction et la vraie base.
 *
 * Pas de modèle ici: rien de ce qui est testé n'en dépend, et un test qui
 * appelle un LLM pour vérifier une écriture teste le LLM.
 *
 * CE QU'IL PROUVE, ET POURQUOI CHACUN COMPTE
 *   1. `save` accepte la doctrine que l'éditeur envoie, portées comprises.
 *   2. `current` la REND avec ses portées. C'est le point le plus dangereux du
 *      lot: cet écran relit pour modifier, et le premier « enregistrer »
 *      réécrit ce qu'il a relu. Une portée perdue à la relecture serait effacée
 *      de toutes les entrées du coach, sans message, au premier retour.
 *   3. `publish` recompile TOUTES les variantes et les stocke.
 *   4. Republier REMPLACE le jeu: aucune variante périmée ne survit.
 *   5. `save` REFUSE un objectif hors vocabulaire, avec un code lisible.
 *   6. Dépublier emporte les variantes de la version retirée.
 *
 * USAGE
 *   set -a; . supabase/functions/night_llm.env; set +a
 *   deno run -A docs/nutrition-pivot/qa-web/D3_doctrine_roundtrip.ts
 */
import { admin, callAs, type Coach, makeCoach, sql } from "./harness.ts";
import { GOAL_TOKENS } from "../../../supabase/functions/_shared/keel/tokens.ts";

/**
 * Le nombre de variantes compilées: un objectif chacun, PLUS `default`.
 *
 * Il était écrit `6` en dur, et il l'est resté quand `muscle_gain` est arrivé
 * (migration 20260805120000, après ce script): les trois assertions de
 * fragmentation sont devenues rouges sans qu'aucune régression n'ait eu lieu —
 * c'est-à-dire qu'elles ont cessé de pouvoir en signaler une.
 */
const VARIANT_COUNT = GOAL_TOKENS.length + 1;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✅" : "❌"} ${name} — ${detail}`);
}
function banner(title: string): void {
  console.log("\n" + "═".repeat(78));
  console.log(`▌ ${title}`);
  console.log("═".repeat(78));
}

const coach: Coach = await makeCoach({ displayName: "Marlow", country: "GB" });
const call = (payload: Record<string, unknown>) => callAs(coach, "coach-doctrine-v1", payload);

/** Exactement ce que l'éditeur envoie: une partie globale, une par dynamique. */
const EDITED = {
  beliefs: [
    { claim: "Every meal is built on a protein anchor.", rationale: null },
    {
      claim: "The scale is the slowest of four signals.",
      rationale: "waist, energy, strength and sleep move first",
      goal_scope: ["fat_loss"],
    },
    { claim: "Eat more than you think on training days.", goal_scope: ["recomposition"] },
  ],
  forbidden: [{
    token: "count_calories",
    surface_forms: ["count calories", "counting calories"],
    reason: "numbers turn food into a score",
    instead: "We build the plate.",
  }],
  vocabulary: [{ term: "anchor", meaning: "the protein base of a plate" }],
  arbitrations: [
    { situation: "the student cracked", coach_answer: "One meal is not a week." },
    {
      situation: "the scale has not moved in ten days",
      coach_answer: "Ten days is a Tuesday. Give me your waist.",
      goal_scope: ["fat_loss"],
    },
  ],
  foods: {
    recommended: [{ term: "eggs", reason: null }],
    discouraged: [{ term: "seed oil", surface_forms: ["huile de graines"], reason: null }],
  },
  qa: [{ question: "Coffee?", answer: "Black, after food." }],
  voice: { address: "tu", length: "short", emojis: "none", language: "en" },
};

// ===========================================================================
banner("1-2. ENREGISTRER, PUIS ROUVRIR — les portées survivent-elles ?");
// ===========================================================================
const saved = await call({ action: "save", doctrine: EDITED, content_locale: "en" });
check("save accepte la doctrine de l'éditeur", saved.status === 200, JSON.stringify(saved.json).slice(0, 120));

const current = await call({ action: "current" });
const back = current.json?.doctrine ?? {};
const scopeOf = (list: unknown[], i: number) =>
  ((list[i] ?? {}) as { goal_scope?: string[] }).goal_scope ?? [];

console.log("\ncroyances relues:");
for (const b of (back.beliefs ?? []) as Array<Record<string, unknown>>) {
  console.log(`  · ${b.claim}  scope=${JSON.stringify(b.goal_scope ?? [])}`);
}
console.log("arbitrages relus:");
for (const a of (back.arbitrations ?? []) as Array<Record<string, unknown>>) {
  console.log(`  · ${a.situation}  scope=${JSON.stringify(a.goal_scope ?? [])}`);
}

check(
  "la portée d'une croyance survit à l'aller-retour",
  JSON.stringify(scopeOf(back.beliefs ?? [], 1)) === '["fat_loss"]',
  JSON.stringify(scopeOf(back.beliefs ?? [], 1)),
);
check(
  "la portée d'un arbitrage survit à l'aller-retour",
  JSON.stringify(scopeOf(back.arbitrations ?? [], 1)) === '["fat_loss"]',
  JSON.stringify(scopeOf(back.arbitrations ?? [], 1)),
);
check(
  "une entrée globale reste globale (et pas « portée vide illisible »)",
  scopeOf(back.beliefs ?? [], 0).length === 0,
  JSON.stringify(scopeOf(back.beliefs ?? [], 0)),
);
check(
  "les sections communes traversent intactes",
  (back.forbidden ?? []).length === 1 && (back.qa ?? []).length === 1 &&
    (back.foods?.discouraged ?? []).length === 1,
  `forbidden=${(back.forbidden ?? []).length} qa=${(back.qa ?? []).length} discouraged=${
    (back.foods?.discouraged ?? []).length
  }`,
);

// ===========================================================================
banner("3. PUBLIER — toutes les variantes, compilées et stockées");
// ===========================================================================
const published = await call({ action: "publish", version: 1 });
console.log(JSON.stringify(published.json, null, 2).slice(0, 400));
check(
  "publish rend la mesure de fragmentation",
  published.json?.variants === VARIANT_COUNT && typeof published.json?.distinct_cache_entries === "number",
  `variants=${published.json?.variants} entrées=${published.json?.distinct_cache_entries}`,
);

const stored = await sql(`
  select c.goal, left(c.compiled_prompt_hash, 8) as hash, length(c.compiled_prompt) as len
  from public.coach_doctrine_compilations c
  join public.coach_doctrines d on d.id = c.doctrine_id
  where d.coach_id = '${coach.coachId}'
  order by c.goal;
`);
console.log(`\nVARIANTES STOCKÉES:\n${stored}`);
const storedCount = Number(
  (await sql(`
  select count(*) from public.coach_doctrine_compilations c
  join public.coach_doctrines d on d.id = c.doctrine_id
  where d.coach_id = '${coach.coachId}';
`)).split("\n")[1]?.trim() ?? "0",
);
check(
  `${VARIANT_COUNT} variantes en base`,
  storedCount === VARIANT_COUNT,
  `${storedCount} lignes`,
);

const distinct = await sql(`
  select count(*) as variantes, count(distinct c.compiled_prompt_hash) as entrees_de_cache
  from public.coach_doctrine_compilations c
  join public.coach_doctrines d on d.id = c.doctrine_id
  where d.coach_id = '${coach.coachId}';
`);
console.log(`\nFRAGMENTATION MESURÉE:\n${distinct}`);

// ===========================================================================
banner("4. REPUBLIER — aucune variante périmée ne survit");
// ===========================================================================
const hashesBefore = await sql(`
  select string_agg(distinct left(c.compiled_prompt_hash, 8), ',' order by left(c.compiled_prompt_hash, 8))
  from public.coach_doctrine_compilations c
  join public.coach_doctrines d on d.id = c.doctrine_id
  where d.coach_id = '${coach.coachId}';
`);

// Une v2 où la croyance ciblée devient GLOBALE: toutes les variantes bougent.
const v2 = {
  ...EDITED,
  beliefs: EDITED.beliefs.map((b) => ({ ...b, goal_scope: [] })),
  arbitrations: EDITED.arbitrations.map((a) => ({ ...a, goal_scope: [] })),
};
await call({ action: "save", doctrine: v2, content_locale: "en" });
await call({ action: "publish", version: 2 });

const afterRows = await sql(`
  select d.version, c.goal, left(c.compiled_prompt_hash, 8) as hash
  from public.coach_doctrine_compilations c
  join public.coach_doctrines d on d.id = c.doctrine_id
  where d.coach_id = '${coach.coachId}'
  order by d.version, c.goal;
`);
console.log(`\nAPRÈS REPUBLICATION:\n${afterRows}`);

const rowsForV1 = Number(
  (await sql(`
  select count(*) from public.coach_doctrine_compilations c
  join public.coach_doctrines d on d.id = c.doctrine_id
  where d.coach_id = '${coach.coachId}' and d.version = 1;
`)).split("\n")[1]?.trim() ?? "-1",
);
check(
  "les variantes de la version dépubliée ne survivent pas",
  rowsForV1 === 0,
  `${rowsForV1} ligne(s) restantes sur la v1`,
);

const v2Distinct = await sql(`
  select count(*) as variantes, count(distinct c.compiled_prompt_hash) as entrees_de_cache
  from public.coach_doctrine_compilations c
  join public.coach_doctrines d on d.id = c.doctrine_id
  where d.coach_id = '${coach.coachId}' and d.version = 2;
`);
console.log(`\nV2 (plus aucune portée) — fragmentation:\n${v2Distinct}`);
check(
  `sans aucune portée: ${VARIANT_COUNT} variantes, UNE entrée de cache`,
  v2Distinct.includes(`${VARIANT_COUNT}|1`),
  v2Distinct.replace(/\n/g, " "),
);
console.log(`\n(hashes v1: ${hashesBefore.split("\n")[1]?.trim()})`);

// ===========================================================================
banner("5. LE BORD D'ÉCRITURE REFUSE UN OBJECTIF INCONNU");
// ===========================================================================
const bad = await call({
  action: "save",
  doctrine: { ...EDITED, beliefs: [{ claim: "x", goal_scope: ["cutting"] }] },
  content_locale: "en",
});
check(
  "save refuse un objectif hors vocabulaire, avec un code lisible",
  bad.status === 400 && bad.json?.error === "unknown_goal_scope",
  `${bad.status} ${JSON.stringify(bad.json?.error)} ${JSON.stringify(bad.json?.detail ?? "")}`,
);

const badShape = await call({
  action: "save",
  doctrine: { ...EDITED, arbitrations: [{ situation: "s", coach_answer: "a", goal_scope: "fat_loss" }] },
  content_locale: "en",
});
check(
  "save refuse une portée qui n'est pas une liste",
  badShape.status === 400 && badShape.json?.error === "unknown_goal_scope",
  `${badShape.status} ${JSON.stringify(badShape.json?.error)}`,
);

// ===========================================================================
banner("6. LE MODE TEST DU COACH CHOISIT SA VARIANTE");
// ===========================================================================
const previewFat = await call({
  action: "compile",
  answers: [{ section: "beliefs", question: "q", answer: "I believe in protein at every meal." }],
  preview_goal: "fat_loss",
});
check(
  "compile accepte une variante d'aperçu",
  previewFat.status === 200 && previewFat.json?.preview_goal === "fat_loss",
  `${previewFat.status} preview_goal=${previewFat.json?.preview_goal}`,
);
const previewBad = await call({
  action: "compile",
  answers: [{ section: "beliefs", question: "q", answer: "x" }],
  preview_goal: "cutting",
});
check(
  "compile REFUSE une variante inconnue au lieu de retomber sur la default",
  previewBad.status === 400 && previewBad.json?.error === "unknown_goal",
  `${previewBad.status} ${JSON.stringify(previewBad.json?.error)}`,
);

banner("RÉSULTAT");
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.name}`);
console.log(`\n${results.length - failed.length}/${results.length} verts`);
if (failed.length > 0) Deno.exit(1);
