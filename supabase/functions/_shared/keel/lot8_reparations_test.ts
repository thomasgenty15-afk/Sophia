/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOT 8 · FAMILLE « RÉPARATIONS » — CE QUE `plan_repair_loop_test.ts` NE DIT PAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La décision de réparer est éprouvée ailleurs, et complètement:
 * `plan_repair_loop_test.ts` (25 cas) couvre « aucun défaut = zéro appel »,
 * « protéines seules », « défauts multiples regroupés », « deux échecs »,
 * « régression de sécurité », « repli fournisseur », « temps restant nul ».
 * `plan_budget_test.ts` couvre la réserve conditionnelle aux défauts mesurés.
 *
 * ⛔ CE FICHIER COUVRE LE RESTE DE LA LIGNE DU CHANTIER, et c'est la moitié
 * qu'aucun test ne gardait: la COMPTABILITÉ des transmissions au fournisseur,
 * et le fait que le résultat final persisté soit réellement contrôlé.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { createPlanBudget, planCallMeta } from "./plan_budget.ts";
import { PLAN_MODEL_MAX_RETRIES } from "./generation_model.ts";
import { envelopeDirectionFor } from "./weight_pace.ts";

const FUNCTIONS_DIR = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(
    /(^|[^:])\/\/[^\n]*/g,
    "$1",
  );
}

/** Une horloge qu'on avance à la main: un test qui dort est un test qu'on saute. */
function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    start,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LE BUDGET COMPTE LES TRANSMISSIONS, PAS LES APPELS LOGIQUES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("RÉPARATIONS ① — `provider_attempts` EST NOURRI, il ne vaut plus zéro", () => {
  // ⛔ LE DÉFAUT MESURÉ LE 2026-09-11: `noteProviderAttempts` n'avait AUCUN
  // appelant vivant. Le champ existait dans le `snapshot()`, il partait sur la
  // ligne écrite, et il valait toujours ZÉRO. Un compteur à zéro se lit
  // « aucune relance » — l'inverse exact de ce qu'il faut savoir quand un plan
  // a été long.
  const c = clock();
  const budget = createPlanBudget({ now: c.now, startedAtMs: c.start });
  const meta = planCallMeta({
    source: "test",
    requestId: "r",
    kind: "composition",
    capMs: 120_000,
    budget,
  });
  assert(
    typeof meta.onProviderAttempt === "function",
    "la méta d'un appel de plan ne rapporte plus ses transmissions: " +
      "`provider_attempts` redevient un champ mort.",
  );
  assertEquals(budget.snapshot().provider_attempts, 0);
  // Trois transmissions — par exemple une passe qui parcourt une chaîne de
  // trois modèles parce que les deux premiers ont échoué.
  meta.onProviderAttempt!();
  meta.onProviderAttempt!();
  meta.onProviderAttempt!();
  assertEquals(budget.snapshot().provider_attempts, 3);
});

Deno.test("RÉPARATIONS ② — UN APPEL LOGIQUE N'EST PAS UNE TRANSMISSION", () => {
  // ⛔ C'EST LA DISTINCTION QUE LE CHANTIER EXIGE: « échecs et replis inclus,
  // pas seulement les appels logiques ». `maxRetries: 1` autorise UNE passe,
  // mais chaque passe parcourt une chaîne de replis: un seul `askRepair` peut
  // partir plusieurs fois au fournisseur.
  assertEquals(PLAN_MODEL_MAX_RETRIES, 1);
  const c = clock();
  const budget = createPlanBudget({ now: c.now, startedAtMs: c.start });
  const meta = planCallMeta({
    source: "test",
    requestId: "r",
    kind: "repair",
    capMs: 120_000,
    budget,
  });
  // UN seul rattrapage accordé…
  assertEquals(
    budget.askRepair("exclusion_retry", 1_000, 120_000).granted,
    true,
  );
  assertEquals(budget.snapshot().repairs_used, 1);
  // …et DEUX transmissions réelles derrière lui.
  meta.onProviderAttempt!();
  meta.onProviderAttempt!();
  const s = budget.snapshot();
  assertEquals(s.repairs_used, 1, "le compteur d'appels logiques a bougé");
  assertEquals(
    s.provider_attempts,
    2,
    "les transmissions ne sont pas comptées",
  );
  assert(
    s.provider_attempts > s.repairs_used,
    "les deux compteurs se confondent: la chaîne de replis est invisible",
  );
});

Deno.test("RÉPARATIONS ③ — SANS BUDGET, AUCUN RAPPORTEUR: pas de fuite", () => {
  // ⚠️ Un appelant qui ne passe pas de budget — un script, un banc — ne doit
  // pas se voir poser un rappel qui pointe vers rien.
  const meta = planCallMeta({
    source: "test",
    requestId: "r",
    kind: "composition",
    capMs: 120_000,
  });
  assertEquals(meta.onProviderAttempt, undefined);
});

Deno.test("RÉPARATIONS ④ — UNE MESURE NE CASSE PAS CE QU'ELLE MESURE", async () => {
  // ⛔ Le rappel est appelé DANS la boucle du transport, juste avant l'envoi.
  // S'il jetait, il couperait l'appel modèle qu'il prétend compter — une
  // instrumentation qui coûte le plan.
  const src = stripComments(
    await Deno.readTextFile(new URL("_shared/gemini.ts", FUNCTIONS_DIR)),
  );
  const at = src.indexOf("meta?.onProviderAttempt?.()");
  assert(at >= 0, "le transport ne rapporte plus ses transmissions");
  const bloc = src.slice(Math.max(0, at - 120), at + 120);
  assert(
    bloc.includes("try {"),
    "le rappel n'est plus protégé: il peut casser l'appel",
  );
  assert(bloc.includes("catch"), "le rappel n'a plus de filet");
});

Deno.test("RÉPARATIONS ⑤ — LA PASSE SAUTÉE PAR LE DISJONCTEUR N'EST PAS COMPTÉE", async () => {
  // ⚠️ Une passe que le disjoncteur écarte ne coûte ni jeton ni temps
  // fournisseur. La compter ferait croire à un budget consommé qui ne l'est
  // pas — et on chercherait une latence qui n'existe pas.
  const src = stripComments(
    await Deno.readTextFile(new URL("_shared/gemini.ts", FUNCTIONS_DIR)),
  );
  const breaker = src.indexOf("if (isBreakerOpen(provider, desiredModel))");
  const compteur = src.indexOf("meta?.onProviderAttempt?.()");
  assert(
    breaker >= 0 && compteur >= 0,
    "repères introuvables — test à réviser",
  );
  assert(
    breaker < compteur,
    "le compteur tourne AVANT le disjoncteur: une passe sautée est comptée " +
      "comme une transmission.",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LE RÉSULTAT FINAL PERSISTÉ EST RÉELLEMENT CONTRÔLÉ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("RÉPARATIONS ⑥ — LA GARDE FINALE LIT LA CHARGE ÉCRITE, pas un objet d'avant", async () => {
  // ⛔ « Contrôler le snapshot exact après toutes les transformations. Aucun
  // contrôle suivi d'une mutation non revérifiée. » Une garde qui lit `meal`
  // jugerait un plan d'avant le regrammage des casseroles — c'est-à-dire un
  // plan que personne ne reçoit.
  const src = stripComments(
    await Deno.readTextFile(
      new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
    ),
  );
  const gate = src.indexOf("finalPlanGate(asGatePlan(writePayload)");
  const payload = src.indexOf("const writePayload = {");
  const write = src.indexOf('"write_student_meal_plan"');
  assert(gate >= 0, "la garde finale ne tourne plus sur la charge écrite");
  assert(
    payload >= 0 && payload < gate,
    "la garde tourne avant la construction de la charge",
  );
  assert(write >= 0 && gate < write, "la garde tourne APRÈS l'écriture");
});

Deno.test("RÉPARATIONS ⑦ — LA REMESURE SUIT LA DERNIÈRE MUTATION", async () => {
  // ⛔ Le regrammage des casseroles est la DERNIÈRE mutation avant l'écriture.
  // Une mesure qui la précède décrit un plan qui n'existe plus.
  const src = stripComments(
    await Deno.readTextFile(
      new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
    ),
  );
  const regram = src.indexOf(
    "growth.regrammed += regramMeal(meal, composition)",
  );
  const remesure = src.indexOf('tag: "keel.household_meal.final_sizing"');
  assert(regram >= 0 && remesure >= 0, "repères introuvables — test à réviser");
  assert(
    remesure > regram,
    "la remesure précède le regrammage: elle ne voit rien",
  );
});

Deno.test("RÉPARATIONS ⑧ — UNE RÉFÉRENCE MANQUANTE NE SE « RÉPARE » PAS EN SILENCE", async () => {
  // ⛔ EXIGENCE LITTÉRALE: « une référence indispensable manquante ne se
  // répare pas en retirant silencieusement un apport ». Le sas de composition
  // COMPLÈTE l'index; il ne retire pas l'ingrédient qu'il ne sait pas peser.
  const fill = stripComments(
    await Deno.readTextFile(
      new URL("_shared/keel/composition_fill_io.ts", FUNCTIONS_DIR),
    ),
  );
  // Le chemin d'échec rend une liste VIDE de réponses — il ne touche pas au plan.
  assert(
    fill.includes("return [];"),
    "le sas ne s'abstient plus: il pourrait modifier le plan sur un échec",
  );
  // ⚠️ ET L'INCOMPLÉTUDE RESTE VISIBLE. `unmeasurable` est un verdict, pas un
  // silence: un plat qu'on ne sait pas peser se COMPTE.
  const sizing = stripComments(
    await Deno.readTextFile(
      new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
    ),
  );
  assert(
    sizing.includes("unmeasurable_by"),
    "l'incomplétude de mesure n'est plus rendue: un plat impesable se lirait " +
      "comme un plat conforme.",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-11 · ② — UNE CONDITION QUI ANNULE L'ÉCART, DANS LA FONCTION
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("CONDITION ① — la garde vit DANS `envelopeDirectionFor`, plus seulement chez l'appelant", () => {
  // ⛔ LE DÉFAUT QUE CECI FERME. La garde de grossesse vivait EXCLUSIVEMENT
  // chez l'appelant: il devait coercer l'objectif AVANT d'appeler. Un seul le
  // faisait. La fonction n'avait même pas d'endroit où ranger la question —
  // donc aucun compilateur ne pouvait recenser la prochaine lane qui
  // l'oublierait.
  const corps = {
    heightCm: 168,
    weightKg: 68,
    gender: "female" as const,
    ageYears: 31,
    activityLevel: null,
    activityAxes: { day: null, sport: null, asked: false },
    appetite: null,
  };
  const sujet = { body: corps, isMinor: false };

  // LE CAS QUI PASSE: aucune condition, l'objectif s'exécute.
  const sans = envelopeDirectionFor({
    goal: "fat_loss",
    subject: sujet,
    paceKgPerWeek: 0.5,
    deficitCancelled: false,
  });
  assertEquals(sans.direction, "down");
  assert(
    sans.dailyDeltaKcal > 0,
    "l'écart a disparu sur un corps sans condition",
  );

  // ⛔ LE CAS QUI MORD: une condition annule l'écart. Et elle rend une
  // MAINTENANCE, pas un déficit réduit — « moins de déficit » sur une
  // grossesse reste un déficit.
  const avec = envelopeDirectionFor({
    goal: "fat_loss",
    subject: sujet,
    paceKgPerWeek: 0.5,
    deficitCancelled: true,
  });
  assertEquals(avec.direction, null, "la direction survit à la condition");
  assertEquals(avec.dailyDeltaKcal, 0, "un déficit RÉDUIT reste un déficit");
  // ⚠️ LE PLANCHER, LUI, NE BOUGE PAS: il décrit le corps, pas l'objectif.
  assertEquals(avec.energyFloorKcal, sans.energyFloorKcal);
});

Deno.test("CONDITION ② — le champ est REQUIS, jamais optionnel", async () => {
  // ⛔ « Paramètre de garde optionnel = garde désarmée » est une cicatrice de ce
  // dépôt, payée sur `safetyBand`. Un `?` ici rendrait la garde inerte chez
  // quiconque l'oublie, en silence.
  const src = await Deno.readTextFile(
    new URL("./weight_pace.ts", import.meta.url),
  );
  assert(
    src.includes("deficitCancelled: boolean;"),
    "`deficitCancelled` est devenu optionnel: la garde est désarmée chez qui l'oublie",
  );
  assert(
    !src.includes("deficitCancelled?:"),
    "`deficitCancelled` porte un `?`: le compilateur cesse de recenser",
  );
});

Deno.test("CONDITION ③ — l'appelant de production DIT la condition, en plus de coercer", async () => {
  // ⚠️ CE N'EST PAS UNE REDONDANCE, C'EST UNE CEINTURE. `goalUnderConditionGate`
  // coerce l'objectif; ce drapeau redit la même chose au plus près du NOMBRE.
  // L'un des deux oublié, l'autre tient.
  const src = await Deno.readTextFile(
    new URL("generate-household-meal-v1/index.ts", FUNCTIONS_DIR),
  );
  assert(
    src.includes("deficitCancelled: cancelsEnergyDeficit("),
    "le générateur ne dit plus la condition à la fonction",
  );
  assert(
    src.includes("goalUnderConditionGate("),
    "la coercion d'objectif a disparu: la ceinture n'a plus qu'une moitié",
  );
});
