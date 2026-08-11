// BANC D'ESSAI · LE REJEU HORS LIGNE.
//
//   deno run --allow-net --allow-read --allow-write --allow-env \
//     scratchpad/banc-modeles/rescore.ts
//
// Relit `brut/`, refait TOUTE la notation avec les règles d'aujourd'hui, et
// réécrit `resultats.jsonl`. **Aucun modèle n'est rappelé.**
//
// ── POURQUOI CE FICHIER EXISTE ─────────────────────────────────────────────
// La première version de la notation comptait comme une violation le modèle qui
// CITE l'interdit pour l'écarter (« pas de grignotage »), et punissait le modèle
// qui substitue correctement (« almond milk » à un intolérant au lactose). Les
// deux corrections auraient coûté une campagne complète chacune. Elles ont coûté
// une relecture de fichiers.
//
// La latence et les tokens ne sont PAS recalculables ici: ils viennent de
// l'appel. Ils sont donc repris de `resultats.jsonl` quand la ligne existe
// encore, et laissés nuls sinon — jamais inventés.

import { loadEnvFile } from "./env.ts";
import { FIXTURES, WINDOW } from "./fixtures.ts";
import { issueKind, scoreNegativeAdherence } from "./scoring.ts";
import type { BenchRow } from "./run.ts";
import { loadIndexFor } from "./index_io.ts";

import { parseGeneratedMeal } from "../../supabase/functions/_shared/keel/meal_generation.ts";
import { isFriedMethod } from "../../supabase/functions/_shared/keel/food_composition.ts";
import { envelopeFor } from "../../supabase/functions/_shared/keel/meal_envelope.ts";
import { verdictFor } from "../../supabase/functions/_shared/keel/meal_verdict.ts";
import { assessCoverage } from "../../supabase/functions/_shared/keel/meal_coverage.ts";
import { correctionPlanFor } from "../../supabase/functions/_shared/keel/meal_correction.ts";
import { uncoverableSentinelsFor } from "../../supabase/functions/_shared/keel/dietary_regime.ts";
import { fixedIntakeInputsFor } from "../../supabase/functions/_shared/keel/fixed_intakes.ts";

const RAW_DIR = "scratchpad/banc-modeles/brut";
const OUT = "scratchpad/banc-modeles/resultats.jsonl";

const env = loadEnvFile("supabase/.env");
const index = await loadIndexFor(env);

// Ce que l'appel seul sait: latence, tokens, coût. Repris tel quel.
const prior = new Map<string, BenchRow>();
try {
  for (const line of Deno.readTextFileSync(OUT).split("\n")) {
    if (!line.trim()) continue;
    try {
      const r: BenchRow = JSON.parse(line);
      prior.set(`${r.model}__${r.fixture}__r${r.run}`, r);
    } catch { /* ligne tronquée */ }
  }
} catch { /* pas encore de résultats */ }

const out: BenchRow[] = [];
let skipped = 0;

for (const entry of [...Deno.readDirSync(RAW_DIR)].sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isFile || !entry.name.endsWith(".json")) continue;
  const m = entry.name.replace(/\.json$/, "").match(/^(.+)__(f\d\d_[a-z_0-9]+)__r(\d+)$/);
  if (!m) {
    skipped++;
    continue;
  }
  const [, modelSlug, fixtureId, runStr] = m;
  const f = FIXTURES.find((x) => x.id === fixtureId);
  if (!f) {
    skipped++;
    continue;
  }
  const text = Deno.readTextFileSync(`${RAW_DIR}/${entry.name}`);
  // Le slug de fichier remplace les caractères hors [a-z0-9.-]; aucun de nos
  // identifiants n'en porte, donc le slug EST le modèle.
  const model = modelSlug;
  const run = Number(runStr);
  const before = prior.get(`${model}__${fixtureId}__r${run}`);

  const base: BenchRow = {
    model,
    fixture: fixtureId,
    run,
    locale: f.locale,
    ok: true,
    error: null,
    httpStatus: before?.httpStatus ?? 200,
    latencyMs: before?.latencyMs ?? 0,
    promptTokens: before?.promptTokens ?? null,
    outputTokens: before?.outputTokens ?? null,
    costUsd: before?.costUsd ?? null,
    jsonParsed: false,
    dishes: 0,
    preparations: 0,
    shoppingItems: 0,
    issues: 0,
    issueKinds: [],
    rejectedNumeric: [],
    proteinAnchorMissing: 0,
    outputLockReason: null,
    negativeViolations: [],
    negativeEchoes: [],
    resolutionCoverage: null,
    verdictEnergy: null,
    verdictProtein: null,
    verdictDensity: null,
    sentinelsMissing: 0,
    coverageFlag: null,
    wouldRetry: false,
    retryTokens: [],
  };

  let payload: unknown;
  let meal;
  try {
    payload = JSON.parse(
      text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
    );
    meal = parseGeneratedMeal(payload, {
      doctrine: null,
      safetyConstraints: f.safetyConstraints,
      mode: "to_shop",
      scope: "several_days",
      pantry: f.pantry,
      beliefKeys: f.beliefKeys,
      eatingRhythm: f.eatingRhythm,
      daysToFill: WINDOW,
      awayDays: f.awayDays,
      cookingTimeMin: f.cookingTimeMin,
      composition: index,
      fixedIntakes: f.fixedIntakes,
      dayProperties: f.dayProperties,
    });
  } catch (e) {
    out.push({ ...base, error: `parse: ${String(e).slice(0, 160)}` });
    continue;
  }

  const negative = scoreNegativeAdherence(payload, f);
  const verdictDishes = meal.dishes.map((d) => ({
    slot: d.slot,
    method: d.method,
    ingredients: d.ingredients.map((i) => ({
      term: i.term,
      amount: i.amount ?? null,
      unit: i.unit ?? null,
      state: i.state ?? null,
    })),
  }));
  const envelope = envelopeFor(
    f.goal as Parameters<typeof envelopeFor>[0],
    f.body,
    f.body?.ageBand ?? null,
    f.body?.restrictionFlag ?? true,
    null,
  );
  const verdict = verdictFor({
    dishes: verdictDishes,
    envelope,
    index,
    daysCovered: WINDOW.length,
    friedMethod: isFriedMethod,
    uncoverableSentinels: f.regime ? uncoverableSentinelsFor(f.regime) : [],
    fixedIntakeInputs: fixedIntakeInputsFor(f.fixedIntakes, WINDOW),
  });
  const coverage = assessCoverage({
    dishes: verdictDishes,
    index,
    daysCovered: WINDOW.length,
    verdictComputable: verdict.energy !== "not_computable",
  });
  const plan = correctionPlanFor({
    verdict,
    envelope,
    declarations: { foodPreferences: [] },
    coverageFloorHit: coverage.floorHit,
  });

  out.push({
    ...base,
    jsonParsed: true,
    dishes: meal.dishes.length,
    preparations: meal.preparations.length,
    shoppingItems: meal.shopping_list.length,
    issues: meal.issues.length,
    issueKinds: [...new Set(meal.issues.map(issueKind))].sort(),
    rejectedNumeric: meal.rejected_numeric,
    proteinAnchorMissing: meal.protein_anchor_missing.length,
    outputLockReason: String(meal.lock?.reason ?? "").startsWith("blocked_")
      ? String(meal.lock.reason)
      : null,
    negativeViolations: negative.violations,
    negativeEchoes: negative.echoes,
    resolutionCoverage: verdict.resolution.total > 0
      ? verdict.resolution.resolved / verdict.resolution.total
      : null,
    verdictEnergy: verdict.energy,
    verdictProtein: verdict.protein,
    verdictDensity: verdict.density,
    sentinelsMissing: verdict.sentinels.missing.length,
    coverageFlag: coverage.flag,
    wouldRetry: plan.tokens.length > 0 || meal.protein_anchor_missing.length > 0,
    retryTokens: plan.tokens,
  });
}

// Les ÉCHECS D'APPEL n'ont pas de fichier brut: ils n'ont produit aucun texte.
// Ils sont repris de l'ancien fichier, sinon la campagne perdrait ses échecs —
// et un banc qui oublie ses échecs flatte tous ses modèles.
for (const [key, r] of prior) {
  if (r.ok) continue;
  if (out.some((o) => `${o.model}__${o.fixture}__r${o.run}` === key)) continue;
  out.push(r);
}

Deno.writeTextFileSync(OUT, out.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(
  `re-noté ${out.length} générations depuis ${RAW_DIR}` +
    (skipped ? ` (${skipped} fichiers ignorés)` : ""),
);
