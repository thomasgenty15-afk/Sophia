// BANC D'ESSAI DES MODÈLES DE COMPOSITION — le harnais rejouable.
//
//   deno run --allow-net --allow-read --allow-write --allow-env \
//     scratchpad/banc-modeles/run.ts [--models=a,b] [--runs=3] [--fixtures=f01,f07] [--concurrency=6]
//
// Écrit `scratchpad/banc-modeles/resultats.jsonl` (une ligne par génération) et
// affiche le tableau agrégé. Relancer AJOUTE des lignes: l'agrégation lit le
// fichier entier, donc une campagne peut se faire en plusieurs fois.
//
// ── CE QUI EST MESURÉ, ET D'OÙ ÇA VIENT ────────────────────────────────────
// Tout vient des modules RÉELS du produit — `buildMealPrompt`,
// `parseGeneratedMeal`, `verdictFor`, `assessCoverage`, `correctionPlanFor`.
// Le banc n'a pas de notation à lui: il lit la note que le produit se donne
// déjà à chaque génération. C'est ce qui fait qu'améliorer le banc et
// améliorer le produit sont le même geste.

import { loadEnvFile } from "./env.ts";
import { callModel, isGeminiModel } from "./providers.ts";
import { FIXTURES, TODAY_DATE, TODAY_TOKEN, WINDOW } from "./fixtures.ts";
import type { BenchFixture } from "./fixtures.ts";

import {
  buildMealPrompt,
  parseGeneratedMeal,
} from "../../supabase/functions/_shared/keel/meal_generation.ts";
import type { CompositionIndex } from "../../supabase/functions/_shared/keel/food_composition.ts";
import { isFriedMethod } from "../../supabase/functions/_shared/keel/food_composition.ts";
import { loadIndexFor } from "./index_io.ts";
import { envelopeFor } from "../../supabase/functions/_shared/keel/meal_envelope.ts";
import { verdictFor } from "../../supabase/functions/_shared/keel/meal_verdict.ts";
import { assessCoverage } from "../../supabase/functions/_shared/keel/meal_coverage.ts";
import { correctionPlanFor } from "../../supabase/functions/_shared/keel/meal_correction.ts";
import { uncoverableSentinelsFor } from "../../supabase/functions/_shared/keel/dietary_regime.ts";
import { fixedIntakeInputsFor } from "../../supabase/functions/_shared/keel/fixed_intakes.ts";
import {
  type Hit,
  issueKind,
  scoreNegativeAdherence,
} from "./scoring.ts";

// ---------------------------------------------------------------------------
// LES CANDIDATS
// ---------------------------------------------------------------------------

/**
 * Les identifiants VÉRIFIÉS présents chez le fournisseur le 2026-08-11
 * (`list-models.ts`). Chacun est validé sur UNE génération avant campagne —
 * `generation_model.ts` documente qu'un identifiant invalide n'a pas de repli.
 */
const DEFAULT_MODELS = [
  "gpt-5.6-sol", // le DÉFAUT actuel du produit — la ligne de base
  "gpt-5.6-terra",
  "gpt-5.4-mini", // la cible de retour arrière documentée, et la moins chère
  "gemini-3.6-flash",
  "gemini-3.1-pro-preview",
];

/**
 * Tarifs /M tokens, entrée / sortie. Ce sont des ORDRES DE GRANDEUR saisis à
 * la main: aucune API ne les rend, et un tarif inventé qui a l'air précis est
 * pire qu'un tarif avoué approximatif. La colonne coût du rapport le dit.
 *
 * ⚠️ CORRIGÉ LE 2026-08-19, ET LA CORRECTION DIT COMBIEN CETTE TABLE PEUT MENTIR.
 * `gpt-5.6-luna` portait ici la ligne de `gpt-5.6-sol` (1,25 / 10) — recopiée,
 * jamais vérifiée. Le vrai tarif est **0,20 / 1,20**, soit HUIT FOIS MOINS. Sur
 * cette seule ligne fausse, une analyse de coût a conclu qu'une bascule
 * multipliait la facture par 6 alors qu'elle la divise par 8.
 *
 * ⛔ LES AUTRES LIGNES N'ONT PAS ÉTÉ REVÉRIFIÉES et sont suspectes au même
 * titre: elles partagent toutes le même tarif par famille, ce qui est
 * exactement le motif qui a produit l'erreur. Toute conclusion de coût tirée
 * d'ici doit nommer cette réserve — ou vérifier le tarif chez le fournisseur
 * avant de conclure. Un tarif recopié ressemble exactement à un tarif mesuré.
 */
const PRICING: Record<string, { in: number; out: number }> = {
  "gpt-5.6-sol": { in: 1.25, out: 10 },
  "gpt-5.6-terra": { in: 1.25, out: 10 },
  // Vérifié auprès du propriétaire le 2026-08-19 — voir l'avertissement ci-dessus.
  "gpt-5.6-luna": { in: 0.20, out: 1.20 },
  "gpt-5.5": { in: 1.25, out: 10 },
  "gpt-5.4": { in: 1.25, out: 10 },
  "gpt-5.4-mini": { in: 0.25, out: 2 },
  "gemini-3.6-flash": { in: 0.3, out: 2.5 },
  "gemini-3.5-flash": { in: 0.3, out: 2.5 },
  "gemini-3.1-pro-preview": { in: 1.25, out: 10 },
};

// ---------------------------------------------------------------------------
// UNE GÉNÉRATION, NOTÉE
// ---------------------------------------------------------------------------

export interface BenchRow {
  model: string;
  fixture: string;
  run: number;
  locale: string;
  ok: boolean;
  error: string | null;
  httpStatus: number;
  latencyMs: number;
  promptTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  /** Le JSON du modèle a-t-il traversé `parseGeneratedMeal` sans jeter ? */
  jsonParsed: boolean;
  dishes: number;
  preparations: number;
  shoppingItems: number;
  issues: number;
  issueKinds: string[];
  rejectedNumeric: string[];
  proteinAnchorMissing: number;
  /** Le verrou de sortie a-t-il vidé la génération ? (allergène nommé) */
  outputLockReason: string | null;
  /**
   * LA COLONNE LA PLUS DISCRIMINANTE: les mots interdits sortis dans un champ
   * QUI DEVIENT DE LA NOURRITURE. Avec l'extrait, pour qu'on n'ait pas à
   * croire ce tableau sur parole.
   */
  negativeViolations: Hit[];
  /** Le mot cité dans la PROSE — presque toujours le modèle qui obéit. */
  negativeEchoes: Hit[];
  resolutionCoverage: number | null;
  verdictEnergy: string | null;
  verdictProtein: string | null;
  verdictDensity: string | null;
  sentinelsMissing: number;
  coverageFlag: string | null;
  /** La boucle de correction aurait-elle relancé ? */
  wouldRetry: boolean;
  retryTokens: string[];
}

const RAW_DIR = "scratchpad/banc-modeles/brut";

function saveRaw(model: string, fixture: string, run: number, text: string): void {
  try {
    Deno.mkdirSync(RAW_DIR, { recursive: true });
    Deno.writeTextFileSync(
      `${RAW_DIR}/${model.replace(/[^a-z0-9.-]/gi, "_")}__${fixture}__r${run}.json`,
      text,
    );
  } catch { /* le banc ne doit pas tomber parce qu'un disque est plein */ }
}

async function runOne(args: {
  fixture: BenchFixture;
  model: string;
  run: number;
  index: CompositionIndex;
  env: Record<string, string>;
}): Promise<BenchRow> {
  const { fixture: f, model, index } = args;

  const { systemPrompt, userMessage } = buildMealPrompt({
    safetyConstraints: f.safetyConstraints,
    body: f.body,
    focusAxis: f.focusAxis,
    doctrineBlock: f.doctrineBlock,
    protocolBlock: "",
    beliefKeys: f.beliefKeys,
    goal: f.goal,
    situation: f.situation,
    context: null,
    mode: "to_shop",
    scope: "several_days",
    slot: null,
    servings: f.servings,
    pantry: f.pantry,
    todayToken: TODAY_TOKEN,
    today: TODAY_DATE,
    country: f.locale === "fr-FR" ? "FR" : "GB",
    cookDays: f.cookDays,
    cookingTimeMin: f.cookingTimeMin,
    recipeDifficulty: null,
    variety: null,
    budgetBand: null,
    foodPreferences: [],
    coachNoteBlock: null,
    daysToFill: WINDOW,
    eatingRhythm: f.eatingRhythm,
    awayDays: f.awayDays,
    fixedIntakes: f.fixedIntakes,
    dayProperties: f.dayProperties,
  });

  const call = await callModel({
    model,
    openaiBase: args.env.OPENAI_BASE_URL || "https://api.openai.com",
    openaiKey: args.env.OPENAI_API_KEY ?? "",
    geminiKey: args.env.GEMINI_API_KEY ?? "",
    systemPrompt,
    userMessage,
  });

  const price = PRICING[model];
  const costUsd = price && call.promptTokens !== null && call.outputTokens !== null
    ? (call.promptTokens / 1e6) * price.in + (call.outputTokens / 1e6) * price.out
    : null;

  const base: BenchRow = {
    model,
    fixture: f.id,
    run: args.run,
    locale: f.locale,
    ok: call.ok,
    error: call.error,
    httpStatus: call.httpStatus,
    latencyMs: call.latencyMs,
    promptTokens: call.promptTokens,
    outputTokens: call.outputTokens,
    costUsd,
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
  if (!call.ok) return base;

  let meal;
  let rawPayload: unknown = null;
  try {
    rawPayload = JSON.parse(
      call.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
    );
    meal = parseGeneratedMeal(rawPayload, {
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
    // La sortie BRUTE est gardée même quand elle ne parse pas: c'est là qu'on
    // voit POURQUOI, et une campagne re-lancée pour lire un message d'erreur
    // est une campagne payée deux fois.
    saveRaw(model, f.id, args.run, call.text);
    return { ...base, error: `parse: ${String(e).slice(0, 160)}` };
  }
  // Gardée systématiquement: la notation peut alors être REFAITE hors ligne,
  // sans rappeler un seul modèle. C'est ce qui a permis de corriger la mesure
  // d'adhérence négative sans relancer la campagne une troisième fois.
  saveRaw(model, f.id, args.run, call.text);

  const negative = scoreNegativeAdherence(rawPayload, f);

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

  // Le motif d'une issue, pas son texte: `dishes[3]: ...` et `dishes[5]: ...`
  // sont la même faute deux fois, et une liste de textes n'est pas agrégeable.
  const kinds = new Set<string>(meal.issues.map(issueKind));

  return {
    ...base,
    jsonParsed: true,
    dishes: meal.dishes.length,
    preparations: meal.preparations.length,
    shoppingItems: meal.shopping_list.length,
    issues: meal.issues.length,
    issueKinds: [...kinds].sort(),
    rejectedNumeric: meal.rejected_numeric,
    proteinAnchorMissing: meal.protein_anchor_missing.length,
    // `clean` et les `disarmed_*` sont les cas NOMINAUX; seuls les `blocked_*`
    // veulent dire que le verrou a vidé la génération.
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
  };
}

// ---------------------------------------------------------------------------
// LA BOUCLE
// ---------------------------------------------------------------------------

function arg(name: string, fallback: string): string {
  const hit = Deno.args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const OUT = "scratchpad/banc-modeles/resultats.jsonl";

async function main() {
  const env = loadEnvFile("supabase/.env");
  const models = arg("models", DEFAULT_MODELS.join(",")).split(",").filter(Boolean);
  const runs = Number(arg("runs", "3"));
  const only = arg("fixtures", "").split(",").filter(Boolean);
  const concurrency = Number(arg("concurrency", "6"));
  const fixtures = only.length > 0
    ? FIXTURES.filter((f) => only.some((o) => f.id.startsWith(o)))
    : FIXTURES;

  console.log(
    `banc: ${models.length} modèles × ${fixtures.length} fixtures × ${runs} runs ` +
      `= ${models.length * fixtures.length * runs} générations, concurrence ${concurrency}`,
  );

  const index = await loadIndexFor(env);
  console.log(`référentiel: ${index.bySlug.size} aliments, ${index.byAlias.size} alias`);

  const jobs: { fixture: BenchFixture; model: string; run: number }[] = [];
  for (const model of models) {
    for (const fixture of fixtures) {
      for (let run = 1; run <= runs; run++) jobs.push({ fixture, model, run });
    }
  }

  const file = await Deno.open(OUT, { create: true, append: true, write: true });
  const enc = new TextEncoder();
  let done = 0;
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= jobs.length) return;
      const job = jobs[i];
      const row = await runOne({ ...job, index, env });
      await file.write(enc.encode(JSON.stringify(row) + "\n"));
      done++;
      const mark = !row.ok
        ? "✗"
        : row.negativeViolations.length > 0
        ? "!"
        : "·";
      console.log(
        `${mark} [${done}/${jobs.length}] ${row.model} ${row.fixture} r${row.run} ` +
          `${Math.round(row.latencyMs / 1000)}s plats=${row.dishes} issues=${row.issues} ` +
          `viol=${row.negativeViolations.length}${row.error ? " " + row.error.slice(0, 60) : ""}`,
      );
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => worker()),
  );
  file.close();
  console.log(`\nécrit dans ${OUT}`);
}

if (import.meta.main) await main();
