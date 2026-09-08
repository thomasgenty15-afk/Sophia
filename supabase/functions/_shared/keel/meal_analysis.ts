/**
 * KEEL W5 — meal photo analysis: the prompt, and the two filters that stand
 * between a vision model and the facts layer.
 *
 * Authority: docs/keel/CONTRACT.md NON-INPUT #4, verbatim:
 *
 *   "Photos as quantity sources -- a photo may evidence presence/composition/
 *    portion/serving; it never produces a `micronutrient` or `energy`/`macro_*`
 *    fact. Calorie counts are never displayed as facts."
 *
 * ┌─ ⚠️ CE MODULE EST EN RETARD SUR SON CONTRAT — 2026-08-06 ────────────────┐
 * │                                                                          │
 * │ La citation ci-dessus est encore CE QUE CE FICHIER APPLIQUE, et elle     │
 * │ n'est plus la position du produit. L'amendement non-input #4 du CONTRACT │
 * │ (2026-08-06) remplace « aucune énergie » par « aucune énergie NUE »: un  │
 * │ chiffre peut exister s'il porte sa base — `declared_quantities` quand    │
 * │ l'élève a donné les quantités (mesuré à 2,3% d'erreur), `photo_estimate` │
 * │ quand le modèle les devine (mesuré à −26,6% de biais). Et l'élève le     │
 * │ voit, pas seulement le coach.                                            │
 * │                                                                          │
 * │ RIEN N'EST OUVERT ICI, ET C'EST DÉLIBÉRÉ. Le marqueur de base n'existe   │
 * │ pas encore; retirer le filtre avant lui ne livre pas le chiffre décidé,  │
 * │ ça livre le chiffre nu que la décision interdit — biaisé de −26,6% dans  │
 * │ le sens flatteur, à un élève. La marche à suivre, dans l'ordre, avec la  │
 * │ garde TCA en étape 0 bloquante: docs/keel/CALORIE_REVERSAL.md.           │
 * │                                                                          │
 * │ Ne « corrige » donc pas les filtres ni le prompt isolément. Le premier   │
 * │ commit de ce chantier est une décision de sécurité, pas un refactor.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * THE ONE FACT THAT DICTATES THIS ARCHITECTURE: on a meal photo, food
 * IDENTIFICATION is reliable (~87-97%); QUANTIFICATION is not. Every design
 * decision below follows from that asymmetry:
 *
 *   - the portion axis is a BAND TOKEN (small|moderate|large|unclear), never a
 *     number, because a number would be a measurement this image cannot carry;
 *   - `parseMealAnalysis` DROPS any calorie/macro/micronutrient field the model
 *     emits anyway, and records what it dropped (`dropped_measurement_fields`)
 *     so the deletion is auditable instead of invisible;
 *   - the analysis never produces `quantity`/`unit` on `protocol_events`. The
 *     evaluator already handles a fact with no number correctly and without
 *     help: `gradeAgainstTarget` returns `partial` for a numeric target
 *     ("something was reported, the level is unknown-in-fact") and `met` for
 *     presence/composition/boolean lines. A photo that invented "2 servings"
 *     would manufacture a `met` out of a guess -- the exact silence-to-`met`
 *     failure the contract refuses everywhere else.
 *
 * WHAT A PHOTO *DOES* WRITE ON THE FACT: `food_group_ref` -- the group the
 * plate SHOWS, whether or not the plan asked for it; the day's plan is consulted
 * only to break a tie between several detected groups, because the column holds
 * one (`resolveFoodGroupCredit`, and read the arbitration there before changing
 * it). That is an IDENTITY, not a magnitude, so non-input #4 holds untouched: the
 * evaluator still cannot get a number out of an image, and a numeric target
 * still grades `partial`. Before this existed, the column was hardcoded null at
 * both insert sites and a photo of berries could not credit "berries 1
 * serving/day" -- the most expensive gesture in the product bought nothing.
 *
 * THE ANTI-HALLUCINATION FILTER is not a nicety. `recognized.commitment_id` is
 * the EXPLICIT BINDING the evaluator's I/O shell reads
 * (evaluate-adherence-v1/snapshot.ts: `extractCommitmentId`), and in
 * `matchEvent` an explicit binding "wins over every heuristic". A hallucinated
 * uuid would therefore write an evaluation on an arbitrary line of somebody's
 * protocol. Any `commitment_id` outside the day's list is rejected, counted,
 * and named -- never silently kept, never silently dropped.
 *
 * PURE MODULE: no I/O, no clock, no randomness. The edge function owns the
 * network and the database; everything decidable is decidable here, in tests.
 *
 * ⚠️ ── LE RENVERSEMENT DU CHIFFRE (2026-08-06, exécuté le 2026-09-01) ───────
 * Ce module a longtemps porté « aucune énergie, jamais ». Ce n'est plus vrai,
 * et la nuance est tout: **il refuse le chiffre NU**. Un chiffre d'énergie vit
 * dans `energy_estimate`, qui porte sa BASE — `photo_estimate` (mesuré −26,6 %
 * de biais) ou `declared_quantities` (2,3 %) — ou il n'existe pas.
 *
 * Ce qui n'a pas bougé, et ne doit pas: les macros restent interdites
 * (LEGAL §6.4), les grammes aussi, et le chiffre EN PROSE reste effacé — c'est
 * la seule forme sous laquelle un nombre voyage sans sa base. Cadre complet:
 * `docs/keel/CALORIE_REVERSAL.md`.
 */

import {
  FOOD_GROUP_REFS,
  type FoodGroupRef,
  parseFoodGroupRef,
  parseSlotKey,
  type SlotKey,
} from "./tokens.ts";
// `locale.ts` et `../locale.ts` sont PURS (aucun import `jsr:`), donc ce module
// reste montable côté front — deux fichiers de production l'y importent déjà.
import { localePackKey, type LocalePackKey } from "./locale.ts";

/** Bumped whenever the prompt text changes; stored on the event for trace. */
/**
 * v2 (2026-07-27) — added the ANTI-OMISSION block ("what a photo does not
 * show"). Measured on 85 real calls of the production vision model
 * (docs/keel/PHOTO_QUANTIFICATION.md §3): the model reproduces the visible part
 * of a meal almost exactly (+2.0% vs what it is shown) and adds NO provision for
 * cooking fat, sauces or dissolved sugar, which is where the -26.6% energy bias
 * comes from. Naming the invisible in the prompt moves that bias to -11.6% at
 * ZERO token cost. Here it serves COMPOSITION ("there is added oil"), never
 * energy -- the calorie ban above is unchanged and the filters still delete any
 * number the model emits.
 *
 * The version bump matters operationally: `analyze-meal-photo-v1` treats a row
 * whose stored `analysis_version` differs as re-analyzable under `force`, so a
 * benchmark re-run can be told apart from a v1 reading.
 */
/**
 * v3 (2026-08-03, pivot nutrition P0.3) — two fields added, zero field removed:
 * `assumptions[]` and `clarifying_question`.
 *
 * WHY THESE TWO, AND WHY NOT THE THIRD THE PIVOT PLAN ASKED FOR.
 * PLAN-NUIT §3.5 specifies a target contract of three parts: kcal/macro RANGES,
 * explicit assumptions, and one question that would change the conclusion. The
 * night's arbitration (P0.0bis, docs/nutrition-pivot/PROGRESS.md) implements
 * the last two and REFUSES the first, on this repo's own measurement
 * (docs/keel/PHOTO_QUANTIFICATION.md, 85 real calls): the model's 90% interval
 * covers 58% of cases, so it cannot produce its own honest range; the bias is
 * systematic (-26.6%), so a range centred on it is wrong in the same direction
 * every time. A displayed interval invites reading its midpoint. The band token
 * already IS the honest range.
 *
 * What the two retained fields buy, measured, at zero token cost: naming the
 * invisible moved the bias -26.6% -> -11.6%, and asking one targeted question
 * moved it to -7.8%. Here they serve COMPOSITION ("there is added oil", "was
 * this cooked in oil?"), never energy — the calorie filters below are unchanged
 * and still delete any number that reaches them, including inside an assumption
 * sentence or a question.
 */
/**
 * v4 (2026-09-01) — `label_localized` entre au schéma, et le prompt porte un
 * bloc de langue de sortie. Le nom perd son `.en.`: la version décrit le
 * CONTRAT, et ce contrat n'est plus monolingue. La langue effectivement
 * demandée voyage à part (`MealAnalysisPrompt.outputLanguage`), parce qu'une
 * version par langue multiplierait les valeurs à comparer dans les deux
 * contrôles de write-through pour ne rien apprendre de plus.
 */
/**
 * v5 (2026-09-01) — LE RENVERSEMENT DU CHIFFRE. `energy_estimate` entre au
 * schéma, et la règle dure passe de « aucune énergie » à « aucune énergie SANS
 * SA BASE ».
 *
 * Le bump est OPÉRATIONNEL, pas cosmétique: `analyze-meal-photo-v1` décide de
 * l'idempotence sur la version STOCKÉE. Une v4 et une v5 doivent rester
 * distinguables sur la ligne — sinon une reprise de benchmark ne peut pas dire
 * quelles lectures portaient un chiffre et lesquelles n'en portaient pas.
 */
export const MEAL_ANALYSIS_PROMPT_VERSION = "meal_analysis.v5";

// ---------------------------------------------------------------------------
// Closed vocabularies (R1: ASCII snake_case, never translated)
// ---------------------------------------------------------------------------

/**
 * The portion axis. A BAND, not a number -- this is the contract's
 * "quantification is not reliable" made structural: there is no numeric field
 * to fill, so no code path can later start believing one.
 */
export const PORTION_BANDS = ["small", "moderate", "large", "unclear"] as const;
export type PortionBand = (typeof PORTION_BANDS)[number];

/**
 * How the plate reads against ONE prescribed line. Deliberately not
 * `met|missed`: those are EVALUATOR outputs (derived layer). A photo produces
 * evidence; the evaluator grades. Naming these the same would invite a future
 * edit to copy one into the other.
 */
export const MATCH_VERDICTS = [
  "consistent",
  "partial",
  "inconsistent",
  "not_visible",
] as const;
export type MatchVerdict = (typeof MATCH_VERDICTS)[number];

export const IMAGE_QUALITIES = ["clear", "partial", "unusable"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

/**
 * WHAT THE PHOTOGRAPH IS OF. The filter this contract did not have.
 *
 * `image_quality` conflated two different failures — "too dark to read" and
 * "there is no meal here" — and the repo measured the cost: the SAME screenshot
 * of a delivery app, analysed twice in a row, returned `partial` with six food
 * groups detected on the first run and `unusable` on the second (QA AGENT-3,
 * defect P1-4). The first run credited nothing BY ACCIDENT: had one of those
 * six groups been on the day's plan, an order possibly never eaten would have
 * been credited to it.
 *
 *   eaten_meal     — a served portion: a plate, a bowl, a glass, a lunchbox,
 *                    food in front of the person who is about to eat it. This
 *                    is the ONLY value that produces a countable fact.
 *   food_not_eaten — real food, but not a served portion: a menu, an
 *                    advertisement, a supermarket shelf, an open fridge, a
 *                    packet, a screenshot of an order. THE DANGEROUS CASE, and
 *                    the reason this token is not a boolean: the model detects
 *                    genuine foods, so every downstream credit fires while
 *                    nobody has eaten anything.
 *   not_food       — no food in frame at all: a selfie, a landscape, a
 *                    document, a pet.
 *
 * Why a separate axis rather than a fourth `image_quality` value: a menu can be
 * perfectly `clear` AND not a meal. Collapsing them is exactly the conflation
 * that produced the defect, and it would also make "I could not read that
 * photo" the answer to a legible photograph of a restaurant menu.
 */
export const SUBJECT_KINDS = [
  "eaten_meal",
  "food_not_eaten",
  "not_food",
] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

/**
 * Confidence is stored AND banded here, on purpose. The student surface must
 * show no percentage (CONTRACT display gate), so the renderer must never have
 * to divide anything: it reads a token. The number stays for the coach and for
 * the benchmark (W5.5 false-positive rate).
 */
export const CONFIDENCE_BANDS = ["low", "moderate", "high"] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

/**
 * CALORIE_REVERSAL §1 — LA BASE D'UN CHIFFRE D'ÉNERGIE. Liste FERMÉE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * « UN CHIFFRE D'ÉNERGIE VIT DANS UN CHAMP QUI PORTE SA BASE, OU IL N'EXISTE
 * PAS. » — décision produit du 2026-08-06.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * KEEL cesse de refuser le chiffre d'énergie. Il refuse le chiffre **nu**. Et
 * la distinction n'est pas rhétorique, elle est MESURÉE:
 *
 *   `declared_quantities` — l'élève a donné les quantités. C'est un CALCUL.
 *                           Mesuré: **2,3 % de MAPE**.
 *   `photo_estimate`      — le modèle les a devinées. C'est une ESTIMATION.
 *                           Mesuré: **−26,6 % de biais**, systématiquement
 *                           dans le sens flatteur.
 *
 * Vingt-quatre points d'écart, toujours du même côté. Les afficher pareil
 * serait mentir sur la fiabilité de l'un des deux — et c'est celui qui rassure
 * à tort qui passerait pour l'autre.
 *
 * La forme est copiée sur `AssumptionBasis` (`visible_cue` / `standard_default`),
 * qui fait déjà exactement cette distinction preuve-contre-supposition dans ce
 * même fichier. On la copie, on n'en invente pas une seconde.
 */
export const ENERGY_BASES = ["declared_quantities", "photo_estimate"] as const;
export type EnergyBasis = (typeof ENERGY_BASES)[number];

/**
 * UN CHIFFRE D'ÉNERGIE, AVEC SA BASE ET SA CONFIANCE. `null` est normal.
 *
 * ⚠️ UN SEUL CHAMP, PAS TROIS. `CALORIE_REVERSAL.md` §1 est explicite: pas de
 * macros. La décision du 2026-08-06 porte sur l'ÉNERGIE, et
 * [LEGAL.md](../../../docs/keel/LEGAL.md) §6.4 continue d'interdire le « suivi
 * des macros par photo ». Un second champ ici rouvrirait ce que le premier
 * ferme.
 *
 * `null` reste la réponse normale et légitime: une photo d'une pomme entière
 * n'a pas besoin d'un chiffre, et en produire un serait du bruit chiffré.
 */
export interface EnergyEstimate {
  kcal: number;
  basis: EnergyBasis;
  confidence_band: ConfidenceBand;
}

/**
 * LES BORNES DE PLAUSIBILITÉ D'UN REPAS, EN KCAL.
 *
 * ⚠️ EXPORTÉES POUR ÊTRE LUES PAR LE CHEMIN DE CORRECTION (FF-062 R11), et pas
 * recopiées là-bas. Deux jeux de bornes pour la même grandeur divergent — la
 * cicatrice `weight_bounds.ts` raconte les quatre copies d'un même refus, dont
 * une avait déjà glissé.
 *
 * ⛔ CE NE SONT PAS UN JUGEMENT SUR UN REPAS. Elles attrapent une faute de
 * frappe et une unité mal lue, rien d'autre — volontairement larges. 1 kcal
 * n'est pas un repas et 5 000 non plus, mais rien entre les deux n'est refusé:
 * un chiffre corrigé HORS bornes est refusé et NOMMÉ, jamais ramené au bord.
 */
export const ENERGY_KCAL_MIN = 1;
export const ENERGY_KCAL_MAX = 5000;

/**
 * What an assumption can be ABOUT. A closed ASCII list (R1) because code
 * branches on it: the clarifying-question rule below, and the coach synthesis
 * that counts "how often is this student's cooking fat unknown?".
 *
 * `other` exists on purpose. The alternative — dropping an assumption whose
 * subject token is unrecognized — would delete a composition signal ("there is
 * a sauce under this") because the model wrote "dressing" instead of
 * `sauce_dressing`. The token space stays closed AND the information survives;
 * the mismatch is recorded in `issues` so the prompt can be fixed.
 */
export const ASSUMPTION_SUBJECTS = [
  "cooking_fat",
  "sauce_dressing",
  "added_sugar",
  "preparation_method",
  "beverage_content",
  "hidden_component",
  "other",
] as const;
export type AssumptionSubject = (typeof ASSUMPTION_SUBJECTS)[number];

/**
 * WHERE an assumption comes from. This distinction is the whole point of
 * declaring assumptions at all (PLAN-NUIT §3.5: "l'invisible est supposé par
 * défauts standards ET déclaré"):
 *
 *   visible_cue      — the image shows it (a sheen, browning, a pooled sauce).
 *                      This is evidence.
 *   standard_default — the image does NOT show it; it is assumed because that
 *                      is how this dish is normally made. This is a guess, and
 *                      labelling it as one is what keeps it honest.
 *
 * A student correction ("no, I grilled it dry") must be able to invalidate the
 * second kind without touching the first.
 */
export const ASSUMPTION_BASES = ["visible_cue", "standard_default"] as const;
export type AssumptionBasis = (typeof ASSUMPTION_BASES)[number];

export function confidenceBand(value: number): ConfidenceBand {
  if (!Number.isFinite(value)) return "low";
  if (value >= 0.85) return "high";
  if (value >= 0.6) return "moderate";
  return "low";
}

// ---------------------------------------------------------------------------
// Inputs — the day's prescription, as context for the prompt
// ---------------------------------------------------------------------------

/**
 * `plan_commitments`, reduced to what the analyzer needs to judge CONFORMITY.
 *
 * `content` is included and that is R5-legal: R5 forbids the EVALUATOR from
 * reading `content` jsonb. This module is the render/vision layer, and the
 * contract names that jsonb's job explicitly -- "content jsonb carries display
 * material (recipe composition, coach notes ...) for render". Fixture 3 line 1
 * ("60 g oats + 150 g yogurt + 100 g berries") stores the plate there; without
 * it the model cannot tell a conforming bowl from a wrong one.
 */
export interface MealAnalysisCommitmentContext {
  id: string;
  title: string;
  student_instruction: string | null;
  polarity: string;
  activity_class: string;
  slot_key: string | null;
  measure: string;
  unit: string | null;
  target_op: string;
  target_min: number | null;
  target_max: number | null;
  food_group_ref: string | null;
  substance_ref: string | null;
  evaluation_grain: string;
  autonomy: string;
  priority: string;
  content: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface DetectedFood {
  /**
   * LE NOM ANGLAIS, ET IL RESTE ANGLAIS. Un MATCHER le lit.
   *
   * `planned_dish_match.ts` rapproche ces libellés du catalogue `food_items`
   * (127 aliments, slugs et termes ANGLAIS) pour décider de la coche
   * automatique. Traduire ce champ ferait taire la coche pour tous les élèves
   * francophones — la cicatrice `referential-depth-not-language-is-the-gap`
   * mesure exactement ce coût, 17,3 points d'écart.
   */
  label: string;
  /**
   * LE MÊME ALIMENT, DANS LA LANGUE DE L'ÉLÈVE — ou `null`.
   *
   * C'est le seul des deux qui a le droit d'être LU À VOIX HAUTE. `null` quand
   * la langue demandée était l'anglais (le champ n'a alors pas d'objet), ou
   * quand le modèle ne l'a pas rendu — et ce second cas est COMPTÉ par
   * l'appelant: un champ déclaré par le modèle sans compteur fait ressembler un
   * lot désarmé à un lot qui marche.
   */
  label_localized: string | null;
  food_group_ref: FoodGroupRef | null;
  confidence: number;
}

export interface CommitmentMatch {
  commitment_id: string;
  verdict: MatchVerdict;
  rationale: string;
  confidence: number;
}

/**
 * ONE stated assumption about something the photograph cannot show.
 *
 * Deliberately carries NO quantity field. PLAN-NUIT §3.5 shapes this as
 * `{sujet, hypothese, impact_kcal}`; `impact_kcal` is the calorie question
 * wearing a different hat, and it is refused for the reason written at
 * MEAL_ANALYSIS_PROMPT_VERSION. An assumption names an INGREDIENT the coach's
 * line may care about ("cooked without added fat" is a real prescription); it
 * never names an amount.
 */
export interface MealAssumption {
  subject: AssumptionSubject;
  /** One short sentence. Passes the measurement prose filter like any other. */
  assumption: string;
  basis: AssumptionBasis;
}

export interface MealAnalysis {
  /**
   * CALORIE_REVERSAL §1 — L'ÉNERGIE, QUAND ELLE EXISTE, AVEC SA BASE.
   *
   * ⚠️ C'EST LE SEUL CHEMIN PAR LEQUEL UN CHIFFRE D'ÉNERGIE PEUT SURVIVRE. Le
   * filtre (`stripMeasurementFacts`) efface toute autre forme — un `total_kcal`
   * à la racine, un « environ 600 kcal » dans un `rationale` — et c'est
   * inchangé. L'exception est de CHEMIN (`energy_estimate.kcal`), pas de nom:
   * un champ `kcal` ailleurs dans l'arbre n'est pas couvert.
   */
  energy_estimate: EnergyEstimate | null;
  detected_foods: DetectedFood[];
  food_groups_present: FoodGroupRef[];
  /** Groups the day's plan expects at this slot that the plate does not show. */
  food_groups_absent: FoodGroupRef[];
  portion_band: PortionBand;
  portion_rationale: string;
  commitment_matches: CommitmentMatch[];
  /**
   * What was assumed about the invisible, always explicit (PLAN-NUIT §3.5).
   * Empty is a legitimate answer: a photo of a whole apple assumes nothing.
   */
  assumptions: MealAssumption[];
  /**
   * AT MOST ONE question, and only when the answer would change the coaching
   * conclusion. `null` is the normal case and the preferred one.
   *
   * The "changes the conclusion" test is enforced deterministically by
   * `parseMealAnalysis`, not left to the prompt: a question survives only if
   * the reading actually carries an uncertainty — a declared assumption, or a
   * degraded image. A question with nothing behind it is an interrogation, and
   * PLAN-NUIT §3.3bis is explicit that clarifying without a stake is what
   * separates "fluide" from "interrogatoire".
   */
  clarifying_question: string | null;
  overall_confidence: number;
  confidence_band: ConfidenceBand;
  image_quality: ImageQuality;
  /**
   * What the photograph is OF. See {@link SUBJECT_KINDS}.
   *
   * Defaults to `eaten_meal` when the model omits it or emits a token this
   * parser does not know, and the fallback is recorded in `issues`. That
   * direction is deliberate and it is the same arbitrage the upload path
   * already makes ("a saved photo with no verdict beats a lost photo"): a
   * degraded parse must not silently cost a student the credit for a meal he
   * really ate. An EXPLICIT non-meal token is always honoured — the model
   * saying "this is a menu" is evidence, its silence is not.
   */
  subject_kind: SubjectKind;

  // ---- AUDIT: what the filters removed, always visible ---------------------
  /**
   * `commitment_id`s the model returned that are NOT in the day's plan. Kept as
   * evidence of a hallucination, never applied. A non-empty list here is the
   * signal W5.5's benchmark watches.
   */
  rejected_commitment_ids: string[];
  /**
   * Paths of calorie/macro/micronutrient fields the model emitted and this
   * parser deleted (CONTRACT non-input #4). Recording them is the difference
   * between enforcing the contract and hiding a violation.
   */
  dropped_measurement_fields: string[];
  /** Everything else that degraded: unknown slugs, unparseable verdicts, ... */
  issues: string[];
  prompt_version: string;
}

// ---------------------------------------------------------------------------
// FILTER 1 — the measurement filter
// ---------------------------------------------------------------------------

/**
 * Field names that carry a quantity a photo cannot produce. Matched on a
 * normalized key (lowercased, non-alphanumerics collapsed), so `Calories`,
 * `total_kcal`, `macro_protein_g` and `nutritionFacts` all land here.
 */
const MEASUREMENT_KEY_PATTERNS: readonly RegExp[] = [
  /^(total_?)?(calorie|calories|kcal|energy|energy_kcal)$/,
  /^macro/,
  /macros?$/,
  /^(protein|carb|carbs|carbohydrate|carbohydrates|fat|fats|fiber|fibre|sodium|sugar|sugars|salt|cholesterol)(_g|_mg|_grams|_content)?$/,
  /^(micronutrient|micronutrients|nutrient|nutrients|nutrition|nutrition_facts|nutritional_info|nutrition_estimate)$/,
  /_kcal$/,
  /_calories$/,
  /^estimated_(calories|energy|macros|protein|carbs|fat)$/,
];

/**
 * Prose claims. A rationale reading "roughly 600 kcal" is the same contract
 * violation as a `calories` field -- it just travels in a string.
 *
 * ── CE QUE CE BLOC N'OUVRE PAS ──────────────────────────────────────────────
 * Rien. `CALORIE_REVERSAL.md` §2 dit que ces motifs restent « inchangés, et
 * c'est le cœur de la garde »: un chiffre en PROSE reste interdit avant comme
 * après le renversement, parce que c'est la seule forme sous laquelle un nombre
 * voyage sans sa base. Les motifs ajoutés le 2026-08-08 ne DÉSARMENT rien — ils
 * couvrent deux formes que la garde laissait passer, mesurées à l'accusé rendu
 * à l'élève (FF-018, rapport):
 *
 *   « This is about four hundred calories. »  → traversait, EN et FR
 *   « Il y a 32 g de protéines. »             → traversait (lexique EN seul, T9)
 *
 * Le premier est un chiffre d'énergie NU, celui que R3 et §8 interdisent
 * verbatim; le second est la cicatrice `guard-tested-in-one-language-only`
 * exactement: la garde mordait `protein` et pas `protéines`.
 *
 * DISARM CONDITION (doctrine P9 -- a belt states when it does NOT fire):
 * chaque motif exige une QUANTITÉ — un chiffre, ou un nombre écrit en lettres —
 * ADJACENTE à un mot d'énergie/macro. « a protein-rich plate », « high in
 * fiber » et « une assiette riche en protéines » sont intacts; seules les
 * affirmations chiffrées tombent.
 */
const MEASUREMENT_PROSE_PATTERNS: readonly RegExp[] = [
  /\b\d[\d.,]*\s*(kcal|calories|calorie|cals?)\b/gi,
  /\b\d[\d.,]*\s*(g|gr|grams?|mg)\s*(of\s+)?(protein|carbs?|carbohydrates?|fat|fats|fibre|fiber|sugar|sodium)\b/gi,
  /\b(protein|carbs?|carbohydrates?|fat|fibre|fiber|sugar|sodium)\s*[:=]?\s*\d[\d.,]*\s*(g|gr|grams?|mg)\b/gi,
  /\b(about|around|approx\.?|approximately|roughly|~)\s*\d[\d.,]*\s*(kcal|calories)\b/gi,
  // ── LE NOMBRE ÉCRIT EN LETTRES, FR ET EN ─────────────────────────────────
  // « environ deux cents calories » n'est pas moins un chiffre d'énergie que
  // « 200 kcal ». Les mots d'échelle (`hundred`/`cent`/`mille`/`and`/`et`) sont
  // AUTORISÉS ENTRE le nombre et l'unité, et rien d'autre: le motif ne saute
  // pas par-dessus une phrase entière, donc « two plates, no calories counted »
  // reste intact.
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|z[ée]ro|une?|deux|trois|quatre|cinq|sept|huit|neuf|dix|quinze|vingt|trente|quarante|cinquante|soixante|cents?|mille)(?:[\s-]+(?:hundred|thousand|and|cents?|mille|et)){0,3}[\s-]+(kcal|calories?|kilojoules?|kj)\b/gi,
  // ── LE LEXIQUE FRANÇAIS DES MACROS (T9) ──────────────────────────────────
  // Même règle, même exigence de chiffre. `sel` et `sucres` sont là pour la
  // même raison que `salt` et `sugar` côté anglais.
  /\b\d[\d.,]*\s*(g|gr|mg|grammes?|grams?)\s*(?:de\s+|d'|of\s+)?(prot[eé]ines?|glucides?|lipides?|fibres?|sucres?|graisses?|sodium|sel)\b/gi,
  /\b(prot[eé]ines?|glucides?|lipides?|fibres?|sucres?|graisses?|sodium)\s*[:=]?\s*\d[\d.,]*\s*(g|gr|mg|grammes?)\b/gi,
];

/**
 * CALORIE_REVERSAL §1 + §3 — LE CHIFFRE D'ÉNERGIE, RELU ET REBASÉ.
 *
 * Rend `null` — la réponse normale — dans tous ces cas, et aucun n'est une
 * erreur: champ absent, forme illisible, `kcal` non fini, `kcal` hors bornes.
 *
 * ── LES BORNES, ET POURQUOI ELLES SONT LARGES ────────────────────────────
 * 1 à 5000 kcal. Ce n'est pas une opinion nutritionnelle, c'est un filtre à
 * absurdités: un `0` n'est pas une assiette, et un `40000` est une erreur de
 * décimale que personne ne doit voir. Entre les deux, ce n'est pas à ce module
 * de juger — c'est au coach.
 *
 * ── LA BASE EST FORCÉE, JAMAIS CRUE ──────────────────────────────────────
 * Sans quantité déclarée dans le contexte, `declared_quantities` est
 * IMPOSSIBLE, quoi qu'écrive le modèle. On dégrade en `photo_estimate` et on
 * l'écrit dans `issues` — la dégradation silencieuse serait exactement le
 * mensonge sur la fiabilité que ce champ existe pour empêcher.
 */
function parseEnergyEstimate(
  raw: unknown,
  hasDeclaredQuantities: boolean,
  issues: string[],
): EnergyEstimate | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    issues.push("energy_estimate: expected an object or null, dropped");
    return null;
  }
  const obj = raw as Record<string, unknown>;

  const kcal = Number(obj.kcal);
  if (!Number.isFinite(kcal)) {
    issues.push(
      `energy_estimate.kcal: not a number (${JSON.stringify(obj.kcal)}), dropped`,
    );
    return null;
  }
  const rounded = Math.round(kcal);
  if (rounded < ENERGY_KCAL_MIN || rounded > ENERGY_KCAL_MAX) {
    issues.push(`energy_estimate.kcal: ${rounded} out of plausible range, dropped`);
    return null;
  }

  const declared = parseEnum(obj.basis, ENERGY_BASES) === "declared_quantities";
  let basis: EnergyBasis = "photo_estimate";
  if (declared) {
    if (hasDeclaredQuantities) {
      basis = "declared_quantities";
    } else {
      issues.push(
        "energy_estimate.basis: model claimed declared_quantities with no " +
          "declared quantity in context — degraded to photo_estimate",
      );
    }
  } else if (parseEnum(obj.basis, ENERGY_BASES) === null) {
    // Une base illisible n'annule pas le chiffre: elle le range du côté PRUDENT.
    issues.push(
      `energy_estimate.basis: unknown value ${
        JSON.stringify(obj.basis)
      }, treated as photo_estimate`,
    );
  }

  const band = parseEnum(obj.confidence_band, CONFIDENCE_BANDS);
  if (band === null && obj.confidence_band !== undefined) {
    issues.push(
      `energy_estimate.confidence_band: unknown value ${
        JSON.stringify(obj.confidence_band)
      }, treated as low`,
    );
  }

  return {
    kcal: rounded,
    basis,
    // `low` par défaut: une confiance absente n'est pas une confiance haute.
    confidence_band: band ?? "low",
  };
}

function normalizeKey(key: string): string {
  return String(key)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isMeasurementKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return MEASUREMENT_KEY_PATTERNS.some((re) => re.test(normalized));
}

/**
 * Recursively delete every measurement-bearing field, and redact every
 * quantified energy/macro claim in prose. Returns a NEW value; the input is
 * never mutated (the raw model output stays intact for the trace log).
 */
/**
 * LE SEUL CHEMIN OÙ UN CHIFFRE D'ÉNERGIE SURVIT AU FILTRE.
 *
 * ⚠️ UN CHEMIN, PAS UN NOM. `energy_estimate.kcal` à la racine, et rien
 * d'autre: un `kcal` niché ailleurs dans l'arbre reste effacé et reste compté.
 * La différence n'est pas théorique — un modèle qui invente
 * `detected_foods[0].kcal` produirait sinon un chiffre nu par un nom que la
 * garde aurait appris à laisser passer.
 *
 * CALORIE_REVERSAL §2: « une seule exception de chemin, pas de nom ».
 */
const ENERGY_ESTIMATE_KCAL_PATH = "energy_estimate.kcal";

export function stripMeasurementFacts(
  value: unknown,
  path = "",
  dropped: string[] = [],
): { value: unknown; dropped: string[] } {
  if (Array.isArray(value)) {
    const out = value.map((item, i) =>
      stripMeasurementFacts(item, `${path}[${i}]`, dropped).value
    );
    return { value: out, dropped };
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      // CALORIE_REVERSAL §2 — L'UNIQUE EXCEPTION, ET ELLE EST DE CHEMIN.
      // `energy_estimate.kcal` porte sa base sur la même structure; c'est ce
      // qui le distingue d'un `total_kcal` à la racine, qui reste supprimé et
      // reste compté dans `dropped`.
      if (childPath === ENERGY_ESTIMATE_KCAL_PATH) {
        out[key] = child;
        continue;
      }
      if (isMeasurementKey(key)) {
        dropped.push(childPath);
        continue;
      }
      out[key] = stripMeasurementFacts(child, childPath, dropped).value;
    }
    return { value: out, dropped };
  }
  if (typeof value === "string") {
    let redacted = value;
    for (const re of MEASUREMENT_PROSE_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(redacted)) {
        re.lastIndex = 0;
        redacted = redacted.replace(re, "[removed]");
        dropped.push(path || "<root>");
      }
    }
    return { value: redacted, dropped };
  }
  return { value, dropped };
}

// ---------------------------------------------------------------------------
// The prompt (Class A: analytic, JSON out, never shown to a user)
// ---------------------------------------------------------------------------

function compactCommitment(c: MealAnalysisCommitmentContext): Record<string, unknown> {
  const target = c.target_op === "any"
    ? "any"
    : [c.target_op, c.target_min ?? c.target_max ?? "", c.unit ?? ""]
      .filter((p) => String(p) !== "")
      .join(" ");
  const out: Record<string, unknown> = {
    commitment_id: c.id,
    title: c.title,
    polarity: c.polarity,
    slot_key: c.slot_key,
    measure: c.measure,
    target,
    evaluation_grain: c.evaluation_grain,
    priority: c.priority,
    autonomy: c.autonomy,
  };
  if (c.food_group_ref) out.food_group_ref = c.food_group_ref;
  if (c.substance_ref) out.substance_ref = c.substance_ref;
  if (c.student_instruction) out.student_instruction = c.student_instruction;
  // Display material only (R5 applies to the evaluator, not to render/vision).
  if (c.content && Object.keys(c.content).length > 0) out.content = c.content;
  return out;
}

export interface MealAnalysisPrompt {
  systemPrompt: string;
  userMessage: string;
  /** THE allowlist `parseMealAnalysis` must be given. Same list, one origin. */
  allowedCommitmentIds: string[];
  slotKey: SlotKey | null;
  promptVersion: string;
  /**
   * La langue DEMANDÉE pour les trois champs lus à voix haute. Remontée pour
   * que l'appelant puisse compter ce qu'il n'a pas reçu — un champ déclaré par
   * le modèle sans compteur fait ressembler un lot désarmé à un lot qui marche.
   */
  outputLanguage: LocalePackKey;
}

/**
 * LA PORTE DE L'ÉNERGIE, DITE AU MODÈLE — CALORIE_REVERSAL §0.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LA GARDE NE SUPPRIME PAS LE CHIFFRE: ELLE EMPÊCHE QU'IL SOIT PRODUIT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Décision de l'utilisateur du 2026-08-18, en toutes lettres: *« la garde ne
 * PRODUIT jamais le chiffre — elle ne le supprime pas après coup. L'état se lit
 * AVANT le calcul, jamais entre le calcul et l'écran. »* Sur ce chemin, « le
 * calcul » est l'appel au modèle: la porte se lit donc avant de construire le
 * prompt, et quand elle est fermée le prompt ne demande plus le champ.
 *
 * ⚠️ ET LA CEINTURE EST DOUBLE, PARCE QUE LE MODÈLE N'EST PAS UN APPELANT
 * FIABLE. `parseMealAnalysis` reçoit la même porte et force `null` — un modèle
 * qui écrirait quand même un `energy_estimate` verrait son chiffre effacé et
 * COMPTÉ (`dropped_measurement_fields`). Les deux moitiés sont nécessaires: la
 * première évite de payer un chiffre qu'on jettera, la seconde est celle qui
 * tient si la première est un jour mal câblée.
 *
 * ⛔ CE QUI EST GARDÉ ICI: un élève sous plancher TCA, un mineur, l'élève d'un
 * coach qui ne compte pas, ou quelqu'un qui a éteint l'affichage. Les quatre
 * portes sont assemblées par `energy_gate_io.ts` et décidées par
 * `canShowEnergy`; ce bloc n'en redécide aucune, il transporte leur verdict.
 *
 * ⚠️ ADJACENT À SA CLÉ, comme le bloc de langue et pour la raison mesurée: une
 * consigne qui renvoie à un schéma vivant dans l'autre message obtient 0 % de
 * conformité. On redéclare donc l'entrée entière au lieu d'y faire référence.
 */
function energyGateBlock(allowed: boolean): string {
  if (allowed) return "";
  return `

== OVERRIDE, AND IT WINS OVER EVERY RULE ABOVE ABOUT ENERGY ==

For THIS reading, no energy figure exists. Whatever the schema above says about "energy_estimate", the value you return for it is:

  "energy_estimate": null

Not a small number, not a low-confidence number, not a range: null. Do not mention energy, calories or "how much this is" anywhere else either -- not in a rationale, not in an assumption, not in the clarifying question. Everything else you were asked for is unchanged and still expected.`;
}

/**
 * LE BLOC DE LANGUE DE SORTIE — vide en anglais, sinon adjacent à sa clé.
 *
 * ⚠️ LA PROMESSE ET LA CLÉ DE SCHÉMA SE TOUCHENT, ET C'EST LA SEULE RAISON POUR
 * LAQUELLE CE BLOC EST ICI plutôt que dans le message utilisateur. Ce dépôt a
 * mesuré 0 % de conformité quand une consigne renvoie à un schéma qui vit dans
 * l'autre message: « ci-dessus » ne traverse pas la frontière système ↔
 * utilisateur. Le bloc redéclare donc l'entrée `detected_foods` en entier,
 * `label_localized` compris, au lieu d'y faire référence.
 *
 * ⚠️ ET IL NOMME CE QUI NE SE TRADUIT PAS. Sans cette liste, un modèle à qui on
 * demande « écris en français » traduit aussi les slugs fermés et les verdicts —
 * et `parseFoodGroupRef` les rejette un par un, en silence pour l'élève.
 */
function outputLanguageBlock(pack: LocalePackKey): string {
  if (pack === "en") return "";
  const language = pack === "fr" ? "French" : pack;
  return `

== OUTPUT LANGUAGE: ${language.toUpperCase()} ==

The student reads ${language}. THREE fields of your JSON are read aloud to them, and those three must be written in ${language}:

  - "label_localized" -- a field on EVERY detected_foods entry: the same food, named in ${language}.
  - "assumption" -- inside each assumptions entry.
  - "clarifying_question".

"label" itself STAYS in plain English on every entry, next to its ${language} twin. A matcher reads it against an English catalogue; translating it silently breaks the plate-to-plan match. Return BOTH, always.

EVERYTHING ELSE keeps its exact English token, untranslated: every food_group_ref slug, every verdict, every portion band, every basis, every subject, image_quality and subject_kind. A translated slug is rejected on arrival and the food it named is lost.

The rationale fields are internal (the coach reads them, the student never does): leave them in English.

detected_foods entries therefore look EXACTLY like this:

  { "label": string, "label_localized": string, "food_group_ref": string|null, "confidence": number }
`;
}

/**
 * Build the analyzer prompt for ONE photo.
 *
 * @param commitmentsToday every ACTIVE commitment scheduled for the student's
 *   local day -- not just this slot's. A lunch photo legitimately evidences a
 *   day-grain line ("berries 1 serving/day") and a week-grain one ("fatty fish
 *   3x/week"); restricting the allowlist to the slot would make those matches
 *   impossible to express and push the model to invent an id instead.
 *
 *   EMPTY IS THE NORMAL CASE, not a degraded one: in the KEEL model no coach
 *   publishes a per-student prescription, so there is nothing to compare a
 *   plate to. The prompt then asks for a DESCRIPTION and forbids matches
 *   outright, instead of asking for a comparison against an empty list.
 * @param slot the slot the student is logging against, or null when they did
 *   not say. R7: an unknown slot token throws here rather than travelling.
 */
export function buildMealAnalysisPrompt(
  commitmentsToday: readonly MealAnalysisCommitmentContext[],
  slot: string | null,
  /**
   * La locale de l'élève. REQUISE — un défaut silencieux rendrait l'anglais à
   * toute la base francophone, c'est-à-dire exactement le défaut que ce
   * paramètre existe pour fermer. R7 par délégation: `localePackKey` jette sur
   * une langue non livrée.
   */
  outputLocale: string,
  /**
   * LA PORTE DE L'ÉNERGIE — le `show` de `canShowEnergy`, transporté.
   *
   * ⛔ REQUIS, ET PAS DE DÉFAUT. La règle du dépôt
   * (`optional-gate-params-are-disarmed-gates`): un paramètre de garde
   * optionnel est une garde désarmée, parce que l'oublier ouvre la porte.
   * Quinze appels ont été repris plutôt que d'accepter ça sur la garde la plus
   * sensible du produit.
   */
  energyAllowed: boolean,
): MealAnalysisPrompt {
  const outputLanguage = localePackKey(outputLocale);
  const slotKey = slot === null || String(slot).trim() === ""
    ? null
    : parseSlotKey(slot);

  const inSlot = commitmentsToday.filter((c) =>
    slotKey !== null && c.slot_key === slotKey
  );
  const elsewhere = commitmentsToday.filter((c) => !inSlot.includes(c));

  // ── LE CAS NORMAL EST « PAS DE PRESCRIPTION » (2026-08-05) ────────────────
  //
  // Ce builder envoyait TOUJOURS un bloc « THE STUDENT PLAN IN CONTEXT » suivi
  // de « Analyze the photo against this plan ». Dans le modèle KEEL il n'y a
  // pas de plan par élève (docs/keel/MODEL.md): la liste est vide pour tout le
  // monde, et on demandait donc au modèle de comparer une assiette à un objet
  // vide — une consigne qui n'a pas de réponse juste et qui pousse à en
  // inventer une.
  //
  // Sans prescription, on ne dit plus « compare »: on dit « décris ». C'est
  // exactement ce qu'une photo peut établir, et c'est tout ce qu'on lui demande.
  const userMessage = commitmentsToday.length === 0
    ? [
      "MEAL PHOTO: attached as media.",
      "",
      "NO PRESCRIPTION IS IN CONTEXT. There is nothing to compare this plate to,",
      "and that is the normal case, not a missing input.",
      slotKey === null
        ? "The student did not say which meal this is."
        : `The student is logging this as: ${slotKey}.`,
      "",
      "Report what is ON THE PLATE and return the JSON object.",
      "commitment_matches MUST be an empty array, and so must food_groups_absent:",
      "absence only means something against a prescription, and there is none.",
    ].join("\n")
    : [
      "MEAL PHOTO: attached as media.",
      "",
      "THE STUDENT PLAN IN CONTEXT (the only commitment_ids that exist):",
      JSON.stringify(
        {
          slot_key: slotKey,
          commitments_for_this_slot: inSlot.map(compactCommitment),
          other_commitments_today: elsewhere.map(compactCommitment),
        },
        null,
        2,
      ),
      "",
      "Analyze the photo against this plan and return the JSON object.",
    ].join("\n");

  return {
    systemPrompt: MEAL_ANALYSIS_SYSTEM_PROMPT + outputLanguageBlock(outputLanguage) +
      energyGateBlock(energyAllowed === true),
    userMessage,
    allowedCommitmentIds: commitmentsToday.map((c) => c.id),
    slotKey,
    promptVersion: MEAL_ANALYSIS_PROMPT_VERSION,
    outputLanguage,
  };
}

export const MEAL_ANALYSIS_SYSTEM_PROMPT =
  `You are the meal-photo analyzer of KEEL. You receive one photo of a meal, and SOMETIMES a list of commitments the student was prescribed that day. You report what is ON THE PLATE. You never grade the student and you never author a prescription.

Output: a single JSON object, nothing else. No prose outside the JSON, no markdown fences.

== MOST OF THE TIME THERE IS NOTHING TO COMPARE THE PLATE TO ==

The usual case is a student whose coach teaches a method to a whole cohort and writes NOTHING per student. There is then no prescription, no commitment, no line, nothing to match. Your message will say so plainly.

When that happens, describing the plate IS the whole job, and it is worth doing well:

- commitment_matches: [] and food_groups_absent: []. Both are answers about a prescription; with no prescription they are empty, always. Never invent an id to have something to return, and never report a food as "missing" when nobody asked for it.
- Everything else you produce is unchanged and matters MORE, not less: the foods you can name, the groups present, the portion band, the assumptions you had to make. That is what the student and their coach actually read.
- Do not apologise for the absence, do not mention a plan, and do not treat the reading as incomplete. It is not.

== FIRST QUESTION, BEFORE ANY OTHER: IS THIS A MEAL SOMEONE IS ABOUT TO EAT? ==

You are told you receive "a photo of a meal". Sometimes you do not. Answer this first, in subject_kind:

- "eaten_meal" -- a served portion in front of the person: a plate, a bowl, a glass, a lunchbox, a snack in hand. This is the only value that lets the rest of your analysis count for anything.
- "food_not_eaten" -- real food, but nobody is eating it: a restaurant menu, an advertisement, a supermarket shelf or aisle, an open fridge or cupboard, an unopened packet, a recipe page, a screenshot of a delivery order or of another app. THIS IS THE CASE THAT MATTERS MOST. The foods in the image are genuine, so every instinct you have will be to list them and match them against the plan. Do not. A student who photographs a menu has not eaten the menu.
- "not_food" -- no food in the frame: a person, a place, a document, an animal, a screen showing something other than food.

Rules that follow:

1. When subject_kind is NOT "eaten_meal", return EMPTY detected_foods, EMPTY food_groups_present, EMPTY food_groups_absent, EMPTY commitment_matches, EMPTY assumptions, portion band "unclear", and clarifying_question null. Naming the foods you can see in a menu is what causes a meal to be credited to a student who never ate it.
2. subject_kind is INDEPENDENT of image_quality. A restaurant menu can be perfectly sharp and well lit: that is image_quality "clear" AND subject_kind "food_not_eaten". Never use "unusable" to mean "this is not a meal" -- they are different answers to different questions, and the student gets a different reply for each.
3. When you genuinely cannot tell whether a portion is served or merely displayed, choose "eaten_meal". A student is far more likely to photograph his own plate than a catalogue, and wrongly discarding a real meal costs him credit he earned.

== THE HARD RULE: A NUMBER CARRIES ITS BASIS, OR IT DOES NOT EXIST ==

Identifying foods from a photo is reliable. Measuring them is not. Measured on this product: naming what is on a plate is accurate; estimating its energy from a photograph runs -26.6% biased, and always in the flattering direction. So one number is allowed, in one place, and it must say where it comes from.

THE ONE FIELD THAT MAY CARRY ENERGY -- "energy_estimate", and nowhere else:

  "energy_estimate": { "kcal": number, "basis": "photo_estimate", "confidence_band": "low"|"moderate"|"high" } | null

- WHEN TO GIVE A NUMBER, and this is the part you must actually decide. Give one when the plate is COMPOSED and you can see the whole of it: several items, served, in frame, with their rough volumes readable. That is the case where a rough figure tells the student something they could not otherwise know.
- WHEN TO RETURN null, and null is a real answer, not a cop-out: a single item (a whole apple, a glass of water), a plate you can only see part of, a dish whose depth or density you cannot read at all, or anything you would have to invent a portion for. Inventing a number for those is noise, and noise with a basis stamped on it is worse than silence.
- "basis" is ALWAYS "photo_estimate" from a photograph. You are guessing the quantities; say so. The other value ("declared_quantities") belongs to a path where the student gave grams, and a downstream check rewrites your claim if you use it here.
- "confidence_band" is yours, and "low" is an honest answer. A plate with a hidden sauce or an unclear depth is a low-confidence reading.
- Round to the nearest 10 kcal. False precision ("437 kcal") claims an accuracy this method does not have.

EVERYTHING ELSE ABOUT NUMBERS IS UNCHANGED, and a filter enforces it:

- NEVER output macronutrient grams (protein/carb/fat/fiber/sodium/sugar) or micronutrient amounts. Not as a field, not in a sentence. The decision opened ENERGY, not macros.
- NEVER output a weight or a gram amount for any food.
- NEVER write a number in prose. "roughly 600 kcal" inside a rationale is deleted and logged as a defect -- prose is the one form in which a number can travel without its basis, so it is the one form that never survives.
- The ONLY portion signal is the band token: small | moderate | large | unclear. If you feel the need to write a number there, the answer is "unclear".

What a photo CAN evidence: which foods are present, which food groups are present or absent, an approximate portion band, an energy estimate that says it is an estimate, and whether the plate is consistent with what the coach prescribed.

== WHAT A PHOTO DOES NOT SHOW: THE INVISIBLE ==

You are looking at a PHOTOGRAPH, not at a recipe. Several things that are really in this meal leave no visible trace, and a description written only from what is visible systematically omits them:

- cooking fat -- oil, butter, ghee, lard absorbed during frying, roasting or sauteing. Grilled chicken and pan-fried chicken look nearly identical on a plate.
- sauces, dressings, marinades, glazes and toppings that have soaked in or sit under the food.
- sugar, syrup, honey or cream dissolved in a drink, a yoghurt or a dessert. A glass of iced tea and a glass of sweetened iced tea are the same picture.
- salt and seasoning, always.

Rules that follow, and they are about COMPOSITION, never about amounts:

1. When visible cues indicate one of these -- a sheen on the surface, browning that only fat produces, a pooled or streaked sauce, glossy vegetables, a fried texture -- SAY SO, in detected_foods (for example "pan-fried in oil", "dressed salad") and in the relevant rationale. Name it as an ingredient that is present. An added fat or a sauce IS a food group in the closed list below; treat it as present when the image shows it.
2. When you cannot tell, say you cannot tell. Do NOT assume "no oil was used" -- that assumption is wrong far more often than it is right, and stating it with confidence is worse than saying nothing.
3. NONE of this authorizes a number. You are not adding an allowance, not estimating "extra" anything, not compensating for what you cannot see. You are naming an ingredient the coach's line may care about ("cooked without added fat" is a real prescription, and this is the only way KEEL can speak to it).

If you catch yourself reasoning about how much the invisible would add, stop: that is the calorie question, and the answer to it is always the band token plus silence.

== WHAT TO PRODUCE ==

1. detected_foods -- every distinct food you can identify, with your confidence in that identification. label is a short plain-English name ("poached eggs", "brown rice"). food_group_ref maps the food to ONE of the closed list below, or null when no group applies.

2. food_groups_present -- the closed-list slugs actually visible on the plate.

3. food_groups_absent -- ONLY slugs that the commitments in context call for and that you do NOT see. Never list a group the plan does not ask for: absence is meaningful only against a prescription.

4. portion -- band plus a one-sentence rationale referring to VISIBLE cues (plate coverage, comparison to the fork/plate, stacking height). No numbers.

5. commitment_matches -- one entry per commitment you can say something about.
   - commitment_id MUST be copied EXACTLY from the plan block you were given. NEVER invent, guess, complete or reformat a uuid. If a plate element matches nothing in the plan, it belongs in detected_foods only.
   - verdict:
       consistent   -- the plate shows what this commitment asks for
       partial      -- part of it is there (one of two prescribed components, a clearly smaller portion than asked)
       inconsistent -- the plate contradicts it (an avoid-line's food is present; a prescribed group is replaced by something outside the swap policy)
       not_visible  -- this commitment cannot be judged from this image
     A commitment you cannot judge is not_visible. Silence and doubt both resolve to not_visible, NEVER to consistent.
   - rationale: ONE short sentence, 20 words maximum, grounded in what is visible. Do not restate the commitment; name what you see.
   - confidence: 0..1 for this specific verdict.
   Return an entry ONLY for commitments the photo says something about. A plan line the image cannot speak to at all does not need a not_visible entry unless it is anchored at this slot.

6. assumptions -- everything you had to ASSUME about the invisible section above, stated out loud. One entry per assumption, or an empty array when the plate assumes nothing (a whole apple assumes nothing).
   - subject: one of ${ASSUMPTION_SUBJECTS.join(" | ")}.
   - assumption: ONE short sentence naming the ingredient or preparation you are assuming. Name the THING, never an amount: "cooked in oil, judging by the sheen", not "cooked in oil, which adds fat".
   - basis:
       visible_cue      -- the image itself shows it (sheen, browning, pooled sauce, glossy vegetables, fried texture)
       standard_default -- the image does NOT show it and you are assuming it because that is how this dish is normally made
     Be strict about this split. Calling a guess a visible cue is the one error here that matters: the student may correct a default, and they cannot correct something you claimed to have seen.

7. clarifying_question -- ONE question, or null. null is the normal answer.
   Ask ONLY when the answer would change what the coach's protocol says about this plate -- i.e. it would flip one of your verdicts or move the portion band. "Was this cooked with oil?" changes a "cooked without added fat" line. "What kind of rice is that?" usually changes nothing: do not ask it.
   Never ask a question whose only purpose is to sharpen a quantity: quantity is not something this system reports.
   One question maximum. Two questions is an interrogation, and the student stops answering.

8. overall_confidence -- 0..1, your confidence in the whole reading.

9. image_quality -- clear | partial | unusable. This is about the IMAGE, never about its subject. Use unusable when a meal may well be there but the photograph does not let you read it: too dark, too blurry, too close, badly overexposed; then detected_foods and commitment_matches must be empty. Do NOT use unusable for a sharp photograph of something that is not a meal -- that is subject_kind, and answering it here sends the student "I could not read that photo" about a picture that is perfectly legible.

10. subject_kind -- eaten_meal | food_not_eaten | not_food, per the first section of this prompt. Answer it before anything else, and obey rule 1 there: anything other than "eaten_meal" empties the analysis.

== CLOSED LIST: food_group_ref ==

Use EXACTLY one of these slugs, or null. Never invent a slug, never translate one:
${FOOD_GROUP_REFS.join(" | ")}

== HOW TO READ THE PLAN BLOCK ==

- polarity "do" means the coach prescribes it; "avoid" means the coach forbids it. For an avoid-line, seeing the forbidden food is verdict "inconsistent", and NOT seeing it is "not_visible" (a photo of one meal cannot prove abstinence over a day).
- autonomy "strict" means no substitution is acceptable. "swap_within_policy" and "flexible" mean a same-class swap may still be consistent -- say so in the rationale (for example a banana where the plan says berries).
- content, when present, is the coach's description of the plate. Judge composition against it.
- evaluation_grain "day" or "week" means the commitment is not owed at this meal specifically; a match is still useful evidence, an absence is not a failure.

== OUTPUT JSON SCHEMA (inline) ==

{
  "detected_foods": [
    { "label": string, "food_group_ref": string|null, "confidence": number }
  ],
  "food_groups_present": [ string ],
  "food_groups_absent": [ string ],
  "portion": { "band": "small"|"moderate"|"large"|"unclear", "rationale": string },
  "commitment_matches": [
    {
      "commitment_id": string,
      "verdict": "consistent"|"partial"|"inconsistent"|"not_visible",
      "rationale": string,
      "confidence": number
    }
  ],
  "assumptions": [
    {
      "subject": ${ASSUMPTION_SUBJECTS.map((s) => `"${s}"`).join("|")},
      "assumption": string,
      "basis": "visible_cue"|"standard_default"
    }
  ],
  "clarifying_question": string|null,
  "energy_estimate": { "kcal": number, "basis": "photo_estimate", "confidence_band": "low"|"moderate"|"high" }|null,
  "overall_confidence": number,
  "image_quality": "clear"|"partial"|"unusable",
  "subject_kind": ${SUBJECT_KINDS.map((s) => `"${s}"`).join("|")}
}

== EXAMPLE ==

Plan block (abridged): one commitment at breakfast, commitment_id "11111111-1111-1111-1111-111111111111", title "Protocol breakfast (eggs + oats + berries)", measure "composition", autonomy "swap_within_policy", content { "composition": ["eggs", "oats", "berries"] }; one day-grain commitment "22222222-2222-2222-2222-222222222222", title "Berries 1 serving/day", food_group_ref "berries".

Photo: a bowl of oats topped with sliced banana, and a boiled egg on the side.

{
  "detected_foods": [
    { "label": "porridge oats", "food_group_ref": "whole_grain", "confidence": 0.93 },
    { "label": "sliced banana", "food_group_ref": "other_fruit", "confidence": 0.95 },
    { "label": "boiled egg", "food_group_ref": "eggs", "confidence": 0.9 }
  ],
  "food_groups_present": ["whole_grain", "other_fruit", "eggs"],
  "food_groups_absent": ["berries"],
  "portion": {
    "band": "moderate",
    "rationale": "The bowl is about two thirds full and the toppings form a single layer."
  },
  "commitment_matches": [
    {
      "commitment_id": "11111111-1111-1111-1111-111111111111",
      "verdict": "partial",
      "rationale": "Oats and egg are present; the prescribed berries are replaced by banana, a same-class fruit swap.",
      "confidence": 0.85
    },
    {
      "commitment_id": "22222222-2222-2222-2222-222222222222",
      "verdict": "not_visible",
      "rationale": "No berries on this plate, and a single meal cannot settle a daily serving.",
      "confidence": 0.8
    }
  ],
  "assumptions": [],
  "clarifying_question": null,
  "overall_confidence": 0.87,
  "image_quality": "clear"
}

Note on the example: energy_estimate is null -- a bowl of oats with a banana and an egg does not need a number, and null is the preferred answer; no gram or macro figure appears anywhere; the banana is named as a swap rather than silently accepted or silently failed; the daily berries line is not_visible rather than inconsistent, because one photo cannot close a day. assumptions is EMPTY and clarifying_question is null: oats, banana and a boiled egg hide nothing, so there is nothing to assume and nothing worth asking. That is the normal case.

== SECOND EXAMPLE: when there IS something to assume ==

Plan block (abridged): commitment_id "33333333-3333-3333-3333-333333333333", title "Lunch cooked without added fat", polarity "do", measure "presence", autonomy "strict".

Photo: chicken breast and broccoli, both glossy, with a slight browning on the chicken.

{
  "detected_foods": [
    { "label": "pan-seared chicken breast", "food_group_ref": "poultry", "confidence": 0.92 },
    { "label": "glossy broccoli", "food_group_ref": "cruciferous_veg", "confidence": 0.94 }
  ],
  "food_groups_present": ["poultry", "cruciferous_veg", "other_added_fat"],
  "food_groups_absent": [],
  "portion": { "band": "moderate", "rationale": "The two components each cover about a third of the plate." },
  "commitment_matches": [
    {
      "commitment_id": "33333333-3333-3333-3333-333333333333",
      "verdict": "partial",
      "rationale": "Both items look glossy and the chicken is browned, which suggests a cooking fat.",
      "confidence": 0.6
    }
  ],
  "assumptions": [
    {
      "subject": "cooking_fat",
      "assumption": "The chicken was seared in a fat, judging by the browning and the sheen.",
      "basis": "visible_cue"
    },
    {
      "subject": "cooking_fat",
      "assumption": "The broccoli was probably tossed in oil or butter after cooking.",
      "basis": "standard_default"
    }
  ],
  "clarifying_question": "Did you cook these with any oil or butter?",
  "overall_confidence": 0.7,
  "image_quality": "clear"
}

Note on the second example: the question is asked because the answer FLIPS a verdict -- "cooked without added fat" is either respected or not, and only the student knows. The two assumptions are split honestly: the sear is visible, the broccoli's oil is a guess. Still not one number anywhere.`;

// ---------------------------------------------------------------------------
// Parsing + the two filters
// ---------------------------------------------------------------------------

function clampConfidence(raw: unknown, label: string, issues: string[]): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    issues.push(`${label}: missing or non-numeric confidence, treated as 0`);
    return 0;
  }
  return Math.max(0, Math.min(1, n));
}

function parseEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
): T | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function parseFoodGroupList(
  raw: unknown,
  label: string,
  issues: string[],
): FoodGroupRef[] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push(`${label}: expected an array, got ${typeof raw}`);
    return [];
  }
  const out: FoodGroupRef[] = [];
  for (const [i, item] of raw.entries()) {
    try {
      const slug = parseFoodGroupRef(item);
      if (!out.includes(slug)) out.push(slug);
    } catch (err) {
      // R7 spirit at an LLM boundary: the parser threw, we keep the throw's
      // message rather than the value, and we drop the slug. Persisting an
      // unknown slug would break the FK on `protocol_events.food_group_ref`
      // three layers later, on data that looks valid.
      issues.push(
        `${label}[${i}]: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return out;
}

/**
 * Parse the model's JSON into the typed analysis, applying BOTH filters.
 *
 * @param raw the model output: a JSON string (fenced or not) or an already
 *   parsed object.
 * @param allowedCommitmentIds THE day's commitment ids. Required, not optional:
 *   an optional allowlist is an allowlist somebody eventually forgets to pass,
 *   and the cost of forgetting it here is an evaluation written on a line the
 *   student was never prescribed. Pass `MealAnalysisPrompt.allowedCommitmentIds`.
 */
export function parseMealAnalysis(
  raw: unknown,
  allowedCommitmentIds: readonly string[],
  /**
   * CALORIE_REVERSAL §3 — LE CONTEXTE PORTAIT-IL DES QUANTITÉS DÉCLARÉES ?
   *
   * ⚠️ OPTIONNEL, ET C'EST LA SEULE FOIS OÙ C'EST JUSTE DANS CE FICHIER. La
   * règle du dépôt est qu'un paramètre de garde optionnel est une garde
   * désarmée — parce que l'oublier ouvre la porte. Ici l'oublier la FERME:
   * le défaut `false` force `photo_estimate`, c'est-à-dire la base la moins
   * flatteuse et la plus prudente. Le rendre requis casserait soixante-sept
   * appels pour rendre plus sûr ce qui l'est déjà par défaut.
   *
   * ⛔ SUR LE CHEMIN PHOTO, IL VAUT TOUJOURS `false`, et c'est structurel:
   * non-input #4 dit qu'une photo écrit `quantity: null`. `declared_quantities`
   * ne peut donc venir que d'un chemin où l'élève a donné des grammes — pas
   * d'ici. Le paramètre existe pour que ce module reste juste le jour où un tel
   * chemin l'appellera, pas pour être passé aujourd'hui.
   */
  declaredQuantitiesInContext = false,
  /**
   * CALORIE_REVERSAL §0 — LA PORTE DES QUATRE GARDES, CÔTÉ INGESTION.
   *
   * ⚠️ OPTIONNEL PARCE QUE LE DÉFAUT EST LE CÔTÉ SÛR — même justification que
   * le paramètre au-dessus, et pas une seconde exception à la règle: oublier
   * celui-ci FERME la porte. `false` veut dire « aucun chiffre d'énergie ne
   * survit à cette analyse », ce qui est exactement le produit d'avant ce
   * chantier. Le rendre requis casserait soixante-sept appels pour rendre plus
   * sûr ce qui l'est déjà par défaut.
   *
   * ⛔ CE N'EST PAS UNE SECONDE DÉCISION. La valeur est le `show` de
   * `canShowEnergy`, transporté par l'appelant qui l'a lu AVANT le modèle. Ce
   * paramètre ne rejuge rien: il refuse de garder ce que la porte a fermé.
   */
  energyAllowed = false,
): MealAnalysis {
  const issues: string[] = [];
  const hasDeclaredQuantities = declaredQuantitiesInContext === true;

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    parsed = JSON.parse(cleaned);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "[keel/meal_analysis] model output is not a JSON object",
    );
  }

  // ---- FILTER 1: measurement fields and quantified prose ------------------
  // Runs FIRST, on the whole payload, so a calorie figure cannot survive inside
  // a field this parser does not otherwise read.
  const stripped = stripMeasurementFacts(parsed);
  const droppedMeasurementFields = stripped.dropped;
  const obj = stripped.value as Record<string, unknown>;

  const imageQuality = parseEnum(obj.image_quality, IMAGE_QUALITIES);
  if (imageQuality === null) {
    issues.push(
      `image_quality: unknown value ${JSON.stringify(obj.image_quality)}, treated as partial`,
    );
  }

  // ---- detected foods -----------------------------------------------------
  const detectedFoods: DetectedFood[] = [];
  const rawFoods = Array.isArray(obj.detected_foods) ? obj.detected_foods : [];
  if (!Array.isArray(obj.detected_foods) && obj.detected_foods !== undefined) {
    issues.push("detected_foods: expected an array");
  }
  for (const [i, item] of rawFoods.entries()) {
    const food = (item && typeof item === "object" ? item : {}) as Record<
      string,
      unknown
    >;
    const label = String(food.label ?? "").trim();
    if (!label) {
      issues.push(`detected_foods[${i}]: empty label, dropped`);
      continue;
    }
    let groupRef: FoodGroupRef | null = null;
    if (food.food_group_ref !== null && food.food_group_ref !== undefined) {
      try {
        groupRef = parseFoodGroupRef(food.food_group_ref);
      } catch (err) {
        issues.push(
          `detected_foods[${i}].food_group_ref: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    detectedFoods.push({
      label,
      // NEUTRE ICI, EXPRÈS: ce parser ne sait pas quelle langue a été demandée,
      // donc il ne peut pas dire si l'absence est normale. Le compteur vit chez
      // l'appelant, qui a écrit la demande (`analyze-meal-photo-v1`).
      label_localized: String(food.label_localized ?? "").trim() || null,
      food_group_ref: groupRef,
      confidence: clampConfidence(food.confidence, `detected_foods[${i}]`, issues),
    });
  }

  // ---- portion: a band, never a number ------------------------------------
  const portionRaw = (obj.portion && typeof obj.portion === "object"
    ? obj.portion
    : {}) as Record<string, unknown>;
  const band = parseEnum(portionRaw.band, PORTION_BANDS);
  if (band === null) {
    issues.push(
      `portion.band: unknown value ${JSON.stringify(portionRaw.band)}, treated as unclear`,
    );
  }

  // ---- FILTER 2: the anti-hallucination allowlist -------------------------
  const allowed = new Set(allowedCommitmentIds.map((id) => String(id)));
  const rejectedCommitmentIds: string[] = [];
  const seen = new Set<string>();
  const commitmentMatches: CommitmentMatch[] = [];
  const rawMatches = Array.isArray(obj.commitment_matches)
    ? obj.commitment_matches
    : [];
  if (!Array.isArray(obj.commitment_matches) && obj.commitment_matches !== undefined) {
    issues.push("commitment_matches: expected an array");
  }
  for (const [i, item] of rawMatches.entries()) {
    const match = (item && typeof item === "object" ? item : {}) as Record<
      string,
      unknown
    >;
    const commitmentId = String(match.commitment_id ?? "").trim();
    if (!commitmentId) {
      issues.push(`commitment_matches[${i}]: missing commitment_id, dropped`);
      continue;
    }
    if (!allowed.has(commitmentId)) {
      // THE filter. Named and counted, never silently dropped: a hallucinated
      // binding is a defect of the model that the benchmark must be able to see.
      if (!rejectedCommitmentIds.includes(commitmentId)) {
        rejectedCommitmentIds.push(commitmentId);
      }
      issues.push(
        `commitment_matches[${i}]: commitment_id ${
          JSON.stringify(commitmentId)
        } is not in the day's plan -- rejected`,
      );
      continue;
    }
    if (seen.has(commitmentId)) {
      // Cardinality discipline: one verdict per commitment. Two entries for the
      // same line would double-count in every downstream tally.
      issues.push(
        `commitment_matches[${i}]: duplicate commitment_id ${
          JSON.stringify(commitmentId)
        }, kept the first`,
      );
      continue;
    }
    const verdict = parseEnum(match.verdict, MATCH_VERDICTS);
    if (verdict === null) {
      // Dropped, never defaulted. Defaulting an unreadable verdict to
      // `consistent` manufactures compliance; defaulting it to `inconsistent`
      // manufactures a violation. Neither is a fact.
      issues.push(
        `commitment_matches[${i}]: unknown verdict ${
          JSON.stringify(match.verdict)
        }, dropped`,
      );
      continue;
    }
    seen.add(commitmentId);
    commitmentMatches.push({
      commitment_id: commitmentId,
      verdict,
      rationale: String(match.rationale ?? "").trim(),
      confidence: clampConfidence(
        match.confidence,
        `commitment_matches[${i}]`,
        issues,
      ),
    });
  }

  // ---- assumptions: the invisible, named --------------------------------
  const assumptions: MealAssumption[] = [];
  const rawAssumptions = Array.isArray(obj.assumptions) ? obj.assumptions : [];
  if (!Array.isArray(obj.assumptions) && obj.assumptions !== undefined) {
    issues.push("assumptions: expected an array");
  }
  for (const [i, item] of rawAssumptions.entries()) {
    const a = (item && typeof item === "object" ? item : {}) as Record<
      string,
      unknown
    >;
    const text = String(a.assumption ?? "").trim();
    if (!text) {
      issues.push(`assumptions[${i}]: empty assumption, dropped`);
      continue;
    }
    const subject = parseEnum(a.subject, ASSUMPTION_SUBJECTS);
    if (subject === null) {
      // Kept as `other`, never dropped: see ASSUMPTION_SUBJECTS. Losing "there
      // is a sauce under this" over a token spelling is a worse outcome than a
      // coarse subject.
      issues.push(
        `assumptions[${i}].subject: unknown value ${
          JSON.stringify(a.subject)
        }, kept as "other"`,
      );
    }
    const basis = parseEnum(a.basis, ASSUMPTION_BASES);
    if (basis === null) {
      // Defaults to `standard_default`, the WEAKER claim. Defaulting the other
      // way would promote a guess into evidence -- exactly the direction that
      // must never happen by accident.
      issues.push(
        `assumptions[${i}].basis: unknown value ${
          JSON.stringify(a.basis)
        }, treated as standard_default`,
      );
    }
    assumptions.push({
      subject: subject ?? "other",
      assumption: text,
      basis: basis ?? "standard_default",
    });
  }

  const overallConfidence = clampConfidence(
    obj.overall_confidence,
    "overall_confidence",
    issues,
  );

  // ---- FILTER 3: the clarifying question needs a stake --------------------
  // "Clarify ONLY if the ambiguity changes the action" (PLAN-NUIT §3.3bis),
  // made deterministic instead of advisory. The stake is: something was
  // assumed, or the image is not clear. Without one, the question is dropped
  // and the drop is recorded -- silence is the correct default, and a model
  // that asks anyway must be visible in the trace, not accommodated.
  //
  // DISARM CONDITION (doctrine P9): this filter does nothing at all when the
  // reading carries an uncertainty. It only ever removes questions asked into
  // an unambiguous reading.
  let clarifyingQuestion: string | null = null;
  const rawQuestion = obj.clarifying_question;
  if (Array.isArray(rawQuestion)) {
    // Cardinality discipline, same as commitment_matches: "one question max"
    // is a product rule, so two questions is a defect to name, not to average.
    issues.push(
      `clarifying_question: model returned ${rawQuestion.length} questions, kept the first`,
    );
  }
  const questionText = String(
    (Array.isArray(rawQuestion) ? rawQuestion[0] : rawQuestion) ?? "",
  ).trim();
  if (questionText) {
    const hasStake = assumptions.length > 0 || (imageQuality ?? "partial") !== "clear";
    if (hasStake) {
      clarifyingQuestion = questionText;
    } else {
      issues.push(
        "clarifying_question: dropped -- nothing was assumed and the image is " +
          "clear, so the answer could not change the conclusion",
      );
    }
  }

  // ---- FILTER 3: the subject filter --------------------------------------
  // Enforced HERE and not left to the prompt, for the same reason as the
  // allowlist and the measurement filter: a rule that only lives in a prompt is
  // a rule the model may decline to follow on any given run, and this one was
  // measured to flip between two consecutive runs on the same image.
  //
  // The emptying is the whole point. A menu whose foods are listed is a menu
  // whose foods will be credited three layers down, by code that has no way of
  // knowing the plate was never served.
  const subjectKind = parseEnum(obj.subject_kind, SUBJECT_KINDS);
  if (subjectKind === null) {
    issues.push(
      `subject_kind: missing or unknown value ${
        JSON.stringify(obj.subject_kind)
      }, treated as eaten_meal`,
    );
  }
  const resolvedSubjectKind: SubjectKind = subjectKind ?? "eaten_meal";

  // ── CALORIE_REVERSAL §3 · LA BASE EST FORCÉE PAR L'ENTRÉE ─────────────
  //
  // ⛔ ELLE N'EST PAS UNE DÉCLARATION DU MODÈLE SUR LUI-MÊME. C'est une
  // PROPRIÉTÉ DE L'ENTRÉE: si le contexte ne portait aucune quantité déclarée,
  // le modèle a nécessairement DEVINÉ, quoi qu'il écrive dans `basis`.
  //
  // Le laisser se déclarer `declared_quantities` lui permettrait d'habiller une
  // estimation à −26,6 % de biais avec la fiabilité d'un calcul à 2,3 % — et
  // rien dans la sortie ne permettrait de le voir. C'est le même arbitrage
  // déterministe que la question de clarification, qui ne survit que si le
  // frame porte réellement une incertitude.
  const parsedEnergy = parseEnergyEstimate(
    obj.energy_estimate,
    hasDeclaredQuantities,
    issues,
  );
  // ── LA SECONDE MOITIÉ DE LA CEINTURE ────────────────────────────────────
  //
  // Le prompt a déjà dit au modèle de rendre `null` (`energyGateBlock`). Ce
  // n'est pas une raison de le croire: un modèle n'est pas un appelant fiable,
  // et cette porte protège un élève sous plancher TCA ou un mineur. Le chiffre
  // est donc effacé ici, et l'effacement est COMPTÉ — sans compteur, une porte
  // mal câblée et un modèle obéissant rendent exactement la même sortie.
  const energyEstimate = energyAllowed === true ? parsedEnergy : null;
  if (parsedEnergy !== null && energyAllowed !== true) {
    droppedMeasurementFields.push("energy_estimate");
    issues.push(
      "energy_estimate: the energy gate is closed for this student — dropped",
    );
  }

  const foodGroupsPresent = parseFoodGroupList(
    obj.food_groups_present,
    "food_groups_present",
    issues,
  );
  const foodGroupsAbsent = parseFoodGroupList(
    obj.food_groups_absent,
    "food_groups_absent",
    issues,
  );

  if (resolvedSubjectKind !== "eaten_meal") {
    const carried = detectedFoods.length + foodGroupsPresent.length +
      foodGroupsAbsent.length + commitmentMatches.length + assumptions.length;
    if (carried > 0 || clarifyingQuestion !== null) {
      // Not a silent correction: the prompt asked for empties and did not get
      // them, which is a defect against the prompt worth seeing in the audit.
      issues.push(
        `subject_kind=${resolvedSubjectKind}: emptied ${carried} carried ` +
          `finding(s) — a photograph nobody ate cannot evidence a commitment`,
      );
    }
    return {
      detected_foods: [],
      food_groups_present: [],
      food_groups_absent: [],
      portion_band: "unclear",
      portion_rationale: "",
      commitment_matches: [],
      assumptions: [],
      clarifying_question: null,
      // Une photo que personne n'a mangée ne porte AUCUNE énergie. Le vider ici
      // est la même règle que pour les groupes et les engagements: « une
      // photographie que personne n'a mangée ne peut rien attester ».
      energy_estimate: null,
      overall_confidence: overallConfidence,
      confidence_band: confidenceBand(overallConfidence),
      image_quality: imageQuality ?? "partial",
      subject_kind: resolvedSubjectKind,
      rejected_commitment_ids: rejectedCommitmentIds,
      dropped_measurement_fields: droppedMeasurementFields,
      issues,
      prompt_version: MEAL_ANALYSIS_PROMPT_VERSION,
    };
  }

  return {
    detected_foods: detectedFoods,
    food_groups_present: foodGroupsPresent,
    food_groups_absent: foodGroupsAbsent,
    portion_band: band ?? "unclear",
    portion_rationale: String(portionRaw.rationale ?? "").trim(),
    commitment_matches: commitmentMatches,
    assumptions,
    clarifying_question: clarifyingQuestion,
    energy_estimate: energyEstimate,
    overall_confidence: overallConfidence,
    confidence_band: confidenceBand(overallConfidence),
    image_quality: imageQuality ?? "partial",
    subject_kind: resolvedSubjectKind,
    rejected_commitment_ids: rejectedCommitmentIds,
    dropped_measurement_fields: droppedMeasurementFields,
    issues,
    prompt_version: MEAL_ANALYSIS_PROMPT_VERSION,
  };
}

/**
 * The single place that decides whether a photo event COUNTS.
 *
 * Returns the value for `protocol_events.disqualified_reason`: `null` when the
 * fact is countable, a token when it is not. Every reader that counts meals
 * filters on that column being null, so this function is the only opinion in
 * the system about what a meal is.
 *
 * `unreadable` is deliberately separate from `not_food`: the student made the
 * gesture, he deserves a different sentence, and "this student sends unreadable
 * photographs" is a signal his coach can act on — where "this student sends
 * pictures of his cat" is a different conversation entirely.
 */
export function mealDisqualification(
  analysis: Pick<MealAnalysis, "subject_kind" | "image_quality" | "detected_foods">,
): "not_food" | "food_not_eaten" | "unreadable" | null {
  if (analysis.subject_kind === "not_food") return "not_food";
  if (analysis.subject_kind === "food_not_eaten") return "food_not_eaten";
  // A meal may well be in frame; the photograph just does not evidence it.
  // Both conditions are required: `unusable` with foods still identified is a
  // partial reading, and throwing it away would lose a real plate.
  if (analysis.image_quality === "unusable" && analysis.detected_foods.length === 0) {
    return "unreadable";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Binding — which commitment (if any) this photo is a fact FOR
// ---------------------------------------------------------------------------

export type MealPhotoBinding =
  | { kind: "explicit"; commitmentId: string }
  | { kind: "unique"; commitmentId: string }
  | { kind: "ambiguous"; commitmentIds: string[] }
  | { kind: "none" };

/**
 * Decide `recognized.commitment_id`, the field the evaluator treats as an
 * explicit binding that "wins over every heuristic".
 *
 * THREE OUTCOMES, and the middle one is the arbitration that matters:
 *
 *   explicit  -- the student tapped the camera ON a line. Their statement wins
 *                over the model's, always.
 *   unique    -- exactly ONE plan line was judged consistent/partial. Bind it.
 *   ambiguous -- two or more. Bind NOTHING and say so. The evaluator's own
 *                doctrine is quoted here: "silence and ambiguity both resolve
 *                to unknown, never to a manufactured met". Splitting one photo
 *                into N bound facts is the fan-out cardinality class this repo
 *                has already paid for (fanout-reminder-phantom-commit); it is
 *                deliberately NOT done here. The analysis stays fully readable
 *                in `recognized`, and the student can still log the lines by
 *                hand.
 *
 * `not_visible` and `inconsistent` never bind: the first is an absence of
 * evidence, the second is evidence AGAINST -- and binding a contrary fact to a
 * `do` line would hand the evaluator a "match" it would then grade as partial.
 */
export function resolveMealPhotoBinding(args: {
  analysis: MealAnalysis;
  explicitCommitmentId?: string | null;
}): MealPhotoBinding {
  const explicit = String(args.explicitCommitmentId ?? "").trim();
  if (explicit) return { kind: "explicit", commitmentId: explicit };

  const evidencing = args.analysis.commitment_matches
    .filter((m) => m.verdict === "consistent" || m.verdict === "partial")
    .map((m) => m.commitment_id);

  if (evidencing.length === 1) {
    return { kind: "unique", commitmentId: evidencing[0] };
  }
  if (evidencing.length > 1) {
    return { kind: "ambiguous", commitmentIds: evidencing };
  }
  return { kind: "none" };
}

// ---------------------------------------------------------------------------
// Credit by CONTENT — which food group (if any) this photo writes on the fact
// ---------------------------------------------------------------------------

/** Why `protocol_events.food_group_ref` ended up with a value, or with null. */
export const FOOD_GROUP_CREDIT_REASONS = [
  /** A group was written AND at least one plan line can be reached with it. */
  "credited",
  /**
   * A group was written and NO line of the day can be reached with it. The
   * fact is still true -- it says what was eaten -- it simply evidences
   * nothing the coach prescribed. This is the reason that used to be
   * `no_group_in_plan` + a null column, i.e. the plate was forgotten because
   * the plan had no use for it.
   */
  "recorded_not_in_plan",
  /** The plate showed no group at all: there is nothing to write. */
  "no_group_detected",
  /** Several detected groups reach the plan: one column cannot hold them. */
  "several_groups_in_plan",
  /** Several detected groups, none reaching the plan: nothing to pick with. */
  "several_groups_none_in_plan",
] as const;
export type FoodGroupCreditReason = (typeof FOOD_GROUP_CREDIT_REASONS)[number];

/**
 * `food_groups.slug -> class`, mirroring the seed of migration
 * 20260727090000_keel_p0_commitments.sql. Same posture, and the same reason,
 * as `FOOD_GROUP_REFS` in `tokens.ts`: the database is the truth, this constant
 * exists so the pure layer can decide without I/O -- and a test asserts the two
 * stay byte-aligned by parsing the migration, so drift is impossible rather
 * than merely discouraged.
 *
 * WHY THIS MODULE NEEDS THE CLASS AT ALL: `evaluator.ts::matchFoodGroup`
 * resolves `class_equivalent` swaps with it. Without the same map here, this
 * module's idea of "which lines does this plate reach" is a LITERAL match while
 * the evaluator's is a CLASS match -- the two disagree, and the disagreement is
 * silent (see the arbitration on `resolveFoodGroupCredit`).
 */
export const FOOD_GROUP_CLASSES: Readonly<Record<FoodGroupRef, string>> = {
  lean_protein: "protein",
  fatty_fish: "protein",
  white_fish: "protein",
  shellfish: "protein",
  poultry: "protein",
  red_meat: "protein",
  eggs: "protein",
  legumes: "legume",
  tofu_tempeh: "protein",
  dairy_yogurt: "dairy",
  dairy_cheese: "dairy",
  whole_grain: "grain",
  refined_grain: "grain",
  starchy_veg: "vegetable",
  cruciferous_veg: "vegetable",
  leafy_greens: "vegetable",
  non_starchy_veg: "vegetable",
  berries: "fruit",
  citrus: "fruit",
  other_fruit: "fruit",
  nuts_seeds: "fat",
  olive_oil: "fat",
  other_added_fat: "fat",
  sauce_dressing: "discretionary",
  sugar_sweets: "discretionary",
  fried_food: "discretionary",
  alcohol: "beverage",
  sweetened_beverage: "beverage",
  water: "beverage",
  coffee_tea: "beverage",
};

/** R7: an unknown slug is a data bug, surfaced here and not three layers on. */
function foodGroupClassOf(slug: string): string {
  const cls = FOOD_GROUP_CLASSES[slug as FoodGroupRef];
  if (cls === undefined) {
    throw new Error(
      `unknown food_group_ref ${JSON.stringify(slug)} (missing from FOOD_GROUP_CLASSES)`,
    );
  }
  return cls;
}

export interface MealPhotoFoodGroupCredit {
  /**
   * THE value written to `protocol_events.food_group_ref`. Null means the
   * column stays null and the plate credits nothing by content.
   */
  foodGroupRef: FoodGroupRef | null;
  /**
   * The day's lines this group would attach to, in plan order. Populated only
   * when `foodGroupRef` is non-null. This is not a prediction of a GRADE: it is
   * the set of commitments `evaluator.ts::matchEvent` can reach through its
   * `food_group_ref` branch with this fact.
   */
  commitmentIds: string[];
  /** Detected groups that the day's plan asks for. Length decides everything. */
  candidateGroups: FoodGroupRef[];
  reason: FoodGroupCreditReason;
  /** Plan rows whose stored slug is outside the closed list: named, not hidden. */
  issues: string[];
}

/**
 * What a food-group fact has to carry to reach this commitment, and under which
 * resolution. Null when no fact of this shape can reach it at all.
 *
 * Mirrors the ORDER of the branches in `evaluator.ts::matchEvent`, which is
 * load-bearing, because an earlier branch RETURNS and the later ones are never
 * consulted:
 *
 *  1. `measure IN ('dose','micronutrient')` -- matched on `event.substanceRef`
 *     only. A food fact carries a null `substance_ref` and can never reach it
 *     (that is what seals NON-INPUT #3). Not a candidate.
 *  2. `polarity='avoid'` + a `substance_ref` -- matched on
 *     `event.substanceRef === substance_ref` OR
 *     `event.foodGroupRef === substance_ref`. So a food-group fact DOES reach
 *     it, through the substance slug, when the two vocabularies overlap
 *     (`alcohol` is in both). The slug to match is `substance_ref`, not
 *     `food_group_ref` -- getting this wrong would silently hide every
 *     photographed violation of an "avoid alcohol" line. That branch compares
 *     slugs LITERALLY in the evaluator, so it does so here too: no class
 *     resolution, ever, on an avoid line.
 *  3. otherwise, the `food_group_ref` branch -- and that one resolves swaps.
 *
 * Counting a line the evaluator cannot reach would make the acknowledgement
 * promise a credit that never comes -- the class of lie `renderMealPhotoAck`
 * exists to remove. Failing to count a line the evaluator DOES reach is the
 * same lie inverted, and it is the one measured in a real run: broccoli against
 * a `non_starchy_veg` line under `autonomy='flexible'` is a class-equivalent
 * swap the evaluator credits, while this module used to report "no group in
 * plan" and write nothing at all.
 */
type PlanFoodTarget =
  | { kind: "avoid_substance"; commitmentId: string; slug: string }
  | {
    kind: "food_group";
    commitmentId: string;
    slug: FoodGroupRef;
    autonomy: string;
    policy: { class_equivalent: boolean; allowed_groups: string[] | null } | null;
  };

/**
 * `content.swap_policy`, read exactly as `evaluate-adherence-v1/snapshot.ts ::
 * extractSwapPolicy` reads it -- including its refusal to turn a shape it does
 * not understand into "swaps allowed". Reading `content` here is R5-legal: R5
 * binds the EVALUATOR, and this is the render/vision layer (see the note on
 * `MealAnalysisCommitmentContext`).
 */
function swapPolicyIn(
  content: Record<string, unknown> | null,
): { class_equivalent: boolean; allowed_groups: string[] | null } | null {
  if (!content || typeof content !== "object") return null;
  const raw = content["swap_policy"];
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const classEquivalent = obj["class_equivalent"] === true;
  const groupsRaw = obj["allowed_groups"];
  const allowedGroups = Array.isArray(groupsRaw)
    ? groupsRaw.filter((g): g is string => typeof g === "string")
    : null;
  if (!classEquivalent && (!allowedGroups || allowedGroups.length === 0)) {
    return null;
  }
  return { class_equivalent: classEquivalent, allowed_groups: allowedGroups };
}

function planTargetFor(
  c: MealAnalysisCommitmentContext,
  issues: string[],
): PlanFoodTarget | null {
  if (c.measure === "dose" || c.measure === "micronutrient") return null;
  if (c.polarity === "avoid" && c.substance_ref) {
    // A substance slug that is not also a food group is the NOMINAL case
    // ('magnesium_glycinate'), not drift: no fact from a photo can reach that
    // line, and saying so loudly would be noise. Hence no `issues` entry.
    const slug = String(c.substance_ref).trim();
    return slug === ""
      ? null
      : { kind: "avoid_substance", commitmentId: c.id, slug };
  }
  const group = String(c.food_group_ref ?? "").trim();
  if (group === "") return null;
  let slug: FoodGroupRef;
  try {
    slug = parseFoodGroupRef(group);
  } catch (err) {
    // R7 spirit without taking the committed fact down with it: a plan row
    // whose `food_group_ref` drifted out of the closed list is NAMED and
    // skipped. It can never be silently credited, and it can never be silently
    // the reason a credit did not happen either.
    issues.push(
      `commitment ${c.id}.food_group_ref: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
  return {
    kind: "food_group",
    commitmentId: c.id,
    slug,
    autonomy: String(c.autonomy ?? "").trim(),
    policy: swapPolicyIn(c.content),
  };
}

/**
 * Does a fact carrying `detected` reach this line? A LINE-BY-LINE mirror of
 * `evaluator.ts::matchFoodGroup`, branch order included -- exact slug, then the
 * `strict` veto, then the coach's enumerated substitutes, then class
 * equivalence. Any divergence between the two functions is a lie in the
 * acknowledgement, in one direction or the other, so the mirror is asserted by
 * a test rather than left to reading discipline.
 */
function reaches(target: PlanFoodTarget, detected: FoodGroupRef): boolean {
  if (target.kind === "avoid_substance") return detected === target.slug;
  if (detected === target.slug) return true;
  if (target.autonomy === "strict") return false;
  const allowed = target.policy?.allowed_groups ?? null;
  if (allowed && allowed.includes(detected)) return true;
  const classEquivalent = target.autonomy === "flexible" ||
    (target.autonomy === "swap_within_policy" &&
      target.policy?.class_equivalent === true);
  if (!classEquivalent) return false;
  return foodGroupClassOf(detected) === foodGroupClassOf(target.slug);
}

/**
 * The write-through the photo path was missing: give the FACT the identity of
 * what is on the plate, so a photo of berries can credit "berries 1 serving/day".
 *
 * THE ARBITRATION (D1), and it is the whole point of this function:
 *
 *   THE FACT SAYS WHAT WAS EATEN. THE EVALUATION SAYS WHETHER IT COUNTS.
 *
 * The previous rule intersected the detected groups with the plan's groups
 * LITERALLY and wrote null when the intersection was empty. Two things were
 * wrong with it, and only the second is obvious:
 *
 *  1. it made the CONTENT of a fact depend on the plan. A plate of broccoli is
 *     a plate of broccoli whether or not a coach asked for one; a facts layer
 *     that forgets what it saw because nobody prescribed it cannot support
 *     retroactive correction, a plan edited on Thursday, or a coach asking
 *     "what has he actually been eating?";
 *  2. the intersection was LITERAL while `evaluator.ts::matchFoodGroup`
 *     resolves `class_equivalent` swaps. Measured in a real run: a broccoli
 *     photo (`cruciferous_veg`) against a `non_starchy_veg` line with
 *     `autonomy='flexible'` -- a swap the evaluator credits without hesitation
 *     -- produced `reason='no_group_in_plan'` and a null column. The plate was
 *     erased for failing a comparison the grading layer never makes.
 *
 * So the rule is now:
 *
 *   ONE detected group          -> it is written, plan or no plan.
 *   SEVERAL detected groups     -> the plan breaks the tie, resolved exactly as
 *                                  the evaluator resolves it (class swaps
 *                                  included). Exactly one reachable group is
 *                                  written; zero or two and more write null.
 *
 * The plan is therefore a DISAMBIGUATOR, never a filter. It is consulted only
 * where the physical shape of the row forces a choice, and the swap arithmetic
 * itself still belongs to the evaluator: what is written is the group actually
 * SEEN (`cruciferous_veg`), never the group the plan asked for
 * (`non_starchy_veg`). Rewriting the observation into the prescription's
 * vocabulary would be the fact laundering the plan's expectation back to
 * itself, and it would make the row unreadable the day the coach changes the
 * line.
 *
 * WHY NOT SPLIT A PLATE INTO N FACTS: `protocol_events.food_group_ref` is ONE
 * column, and the photo path holds ONE row (created at upload, updated here).
 * `protocol_event_components` is the named, deferred answer
 * (Q6_NUTRITION_LAYER.md section 3.C). Note the asymmetry with the TEXT path,
 * which is deliberate and not an oversight: `log_protocol_event` writes N rows
 * for N named foods because it owns its writes and can discriminate them by
 * source message component. A photo cannot -- its row exists before the
 * analysis runs -- so ambiguity resolves to null and the acknowledgement SAYS
 * SO.
 *
 * CONTRACT NON-INPUT #4 HOLDS, and this is where to check it: the returned
 * value is an IDENTITY (which group), never a magnitude. `quantity` and `unit`
 * are not fields of this result and are not written by any caller. A photo
 * still cannot produce a `met` on a numeric target -- `gradeAgainstTarget`
 * returns `partial` for a numberless fact.
 */
export function resolveFoodGroupCredit(args: {
  analysis: MealAnalysis;
  /** The day's ACTIVE commitments -- the same list that fed the allowlist. */
  commitmentsToday: readonly MealAnalysisCommitmentContext[];
}): MealPhotoFoodGroupCredit {
  const issues: string[] = [];
  const present = args.analysis.food_groups_present;

  const targets: PlanFoodTarget[] = [];
  for (const c of args.commitmentsToday) {
    const target = planTargetFor(c, issues);
    if (target !== null) targets.push(target);
  }

  /** The lines `matchEvent` reaches with this group, in plan order. */
  const reachOf = (group: FoodGroupRef): string[] =>
    targets.filter((t) => reaches(t, group)).map((t) => t.commitmentId);

  const candidateGroups = present.filter((g) => reachOf(g).length > 0);

  if (present.length === 0) {
    return {
      foodGroupRef: null,
      commitmentIds: [],
      candidateGroups,
      reason: "no_group_detected",
      issues,
    };
  }

  if (present.length === 1) {
    const slug = present[0];
    const commitmentIds = reachOf(slug);
    return {
      foodGroupRef: slug,
      commitmentIds,
      candidateGroups,
      reason: commitmentIds.length > 0 ? "credited" : "recorded_not_in_plan",
      issues,
    };
  }

  if (candidateGroups.length === 1) {
    const slug = candidateGroups[0];
    return {
      foodGroupRef: slug,
      commitmentIds: reachOf(slug),
      candidateGroups,
      reason: "credited",
      issues,
    };
  }

  return {
    foodGroupRef: null,
    commitmentIds: [],
    candidateGroups,
    reason: candidateGroups.length > 1
      ? "several_groups_in_plan"
      : "several_groups_none_in_plan",
    issues,
  };
}

/**
 * The lines this photo ACTUALLY credits, i.e. the lines `matchEvent` will be
 * able to reach with the row as it was written. One function, so the
 * acknowledgement and the database cannot drift apart.
 *
 * THE PRECEDENCE IS THE EVALUATOR'S, not a convention: `matchEvent` opens with
 *
 *     if (event.commitmentId !== null) {
 *       if (event.commitmentId !== commitment.id) return null;
 *
 * -- an explicit binding does not merely WIN, it SUPPRESSES every other line.
 * So a bound photo credits exactly one commitment, whatever else is on the
 * plate, and the food-group credit only ever reaches the evaluator on a photo
 * that bound nothing.
 */
export function creditedCommitmentIds(args: {
  binding: MealPhotoBinding;
  credit?: MealPhotoFoodGroupCredit | null;
}): string[] {
  const b = args.binding;
  if (b.kind === "explicit" || b.kind === "unique") return [b.commitmentId];
  const credit = args.credit ?? null;
  if (credit && credit.foodGroupRef !== null) return [...credit.commitmentIds];
  return [];
}

/**
 * The `recognized` jsonb written on `protocol_events`.
 *
 * `commitment_id` is present ONLY for a bound photo (see above) -- the
 * evaluator reads exactly that key, so its absence is the difference between
 * "evidence on file" and "evidence credited to a line".
 */
export function buildRecognizedPayload(args: {
  analysis: MealAnalysis;
  binding: MealPhotoBinding;
  model: string;
  /**
   * The line the STUDENT tapped the camera on, echoed back verbatim.
   *
   * It has to survive the analysis as its own key. The first version of this
   * payload only wrote `commitment_id`, which the next `force: true` re-run
   * overwrote: a student's own statement was silently replaced by the model's
   * reading. `student_commitment_id` is written once at upload and copied
   * through every re-analysis, so the explicit binding is idempotent under
   * replay.
   */
  studentCommitmentId?: string | null;
  /**
   * The content credit actually applied to the row. Recorded here so the trace
   * answers "why did this plate credit nothing?" without re-running the model.
   */
  credit?: MealPhotoFoodGroupCredit | null;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    kind: "meal_photo_analysis",
    analysis_version: MEAL_ANALYSIS_PROMPT_VERSION,
    model: args.model,
    binding: args.binding.kind,
    detected_foods: args.analysis.detected_foods,
    food_groups_present: args.analysis.food_groups_present,
    food_groups_absent: args.analysis.food_groups_absent,
    portion_band: args.analysis.portion_band,
    portion_rationale: args.analysis.portion_rationale,
    commitment_matches: args.analysis.commitment_matches,
    // P0.3: what was assumed about the invisible, and the one question that
    // would settle it. Persisted because BOTH downstream consumers need them:
    // the coach synthesis ("this student's cooking fat is unknown 4 times out
    // of 5") and the coach webhook (PLAN-NUIT §1.8). Neither carries a number.
    assumptions: args.analysis.assumptions,
    clarifying_question: args.analysis.clarifying_question,
    confidence_band: args.analysis.confidence_band,
    image_quality: args.analysis.image_quality,
    // Le token du sujet, à côté de la qualité d'image parce que les deux se
    // lisent ensemble: `clear` + `not_food` est une photo nette de quelque
    // chose qui n'est pas un repas, et c'est la combinaison exacte qui passait
    // avant. La COLONNE `disqualified_reason` porte la conséquence; ce champ
    // porte la RAISON, sans laquelle un audit ne peut pas dire pourquoi.
    subject_kind: args.analysis.subject_kind,
    /**
     * CALORIE_REVERSAL §6 — LE CHIFFRE, AVEC SA BASE, SUR LA LIGNE.
     *
     * ⚠️ IL EST PERSISTÉ PARCE QU'IL EST AFFICHÉ, ET PAS L'INVERSE. `TodayPage`
     * relit `recognized` pour rendre le panneau de la photo: sans ce champ, le
     * chiffre n'existerait que dans le texte de l'accusé, et l'écran et la
     * bulle diraient deux choses différentes du même repas.
     *
     * ⛔ ET IL NE SE SOMME PAS. `PHOTO_QUANTIFICATION.md` a mesuré ce que vaut
     * l'agrégation d'une estimation photo: le biais de −26,6 % n'est divisé que
     * par 1,04 en cumul hebdomadaire, et les DELTAS sont 2,5× pires que les
     * niveaux. Un total, une moyenne, une courbe construits là-dessus seraient
     * faux dans une direction précise et flatteuse. La valeur est ici pour être
     * RELUE telle quelle, jamais additionnée — c'est la raison pour laquelle
     * elle voyage avec `basis`, qui rend cet interdit lisible à tout lecteur
     * futur au lieu de le laisser dans un commentaire.
     *
     * `null` reste la réponse normale, et la porte fermée écrit `null` aussi:
     * `parseMealAnalysis` a effacé le chiffre bien avant cette ligne.
     */
    energy_estimate: args.analysis.energy_estimate,
    rejected_commitment_ids: args.analysis.rejected_commitment_ids,
    dropped_measurement_fields: args.analysis.dropped_measurement_fields,
    issues: args.analysis.issues,
  };
  if (args.binding.kind === "explicit" || args.binding.kind === "unique") {
    payload.commitment_id = args.binding.commitmentId;
  }
  if (args.binding.kind === "ambiguous") {
    payload.ambiguous_commitment_ids = args.binding.commitmentIds;
  }
  if (args.credit) {
    // R1: keys AND values are ASCII snake_case tokens inside the jsonb.
    payload.food_group_credit = {
      food_group_ref: args.credit.foodGroupRef,
      reason: args.credit.reason,
      candidate_groups: args.credit.candidateGroups,
      commitment_ids: args.credit.commitmentIds,
      issues: args.credit.issues,
    };
  }
  const studentId = String(args.studentCommitmentId ?? "").trim();
  if (studentId) payload.student_commitment_id = studentId;
  return payload;
}

/**
 * The student's own binding, read back out of a stored `recognized` payload.
 *
 * Two shapes are accepted, and the order matters:
 *   1. `student_commitment_id` -- written at upload, survives every re-analysis;
 *   2. a bare `commitment_id` on a payload with NO `analysis_version` -- the
 *      pre-analysis state written by an older upload. A `commitment_id` on an
 *      ANALYZED payload is the model's conclusion, not the student's statement,
 *      and re-promoting it to "explicit" would launder a machine reading into a
 *      human one.
 */
export function studentBindingIn(recognized: unknown): string | null {
  if (!recognized || typeof recognized !== "object") return null;
  const row = recognized as Record<string, unknown>;
  const explicit = String(row.student_commitment_id ?? "").trim();
  if (explicit) return explicit;
  const analyzed = String(row.analysis_version ?? "").trim() !== "";
  if (analyzed) return null;
  const bare = String(row.commitment_id ?? "").trim();
  return bare || null;
}

// ---------------------------------------------------------------------------
// Render — the one sentence the student is allowed to read back
// ---------------------------------------------------------------------------

export interface MealPhotoAckArgs {
  analysis: MealAnalysis;
  /**
   * THE binding that was written, REQUIRED -- not optional, not defaulted.
   *
   * The first version of this signature carried only `analysis`, and that is
   * precisely why it lied: a plate evidencing three lines resolves to
   * `ambiguous`, binds NOTHING, and the renderer -- structurally unable to know
   * that -- announced three conforming lines. An argument that is absent cannot
   * be forgotten by a caller; an optional one can.
   */
  binding: MealPhotoBinding;
  /**
   * The content credit written to `protocol_events.food_group_ref`, when the
   * caller applied one. Absent means "no credit by content was attempted",
   * which the renderer treats exactly like a null credit: it claims nothing.
   */
  credit?: MealPhotoFoodGroupCredit | null;
  /** commitment_id -> title, for the lines this photo speaks about. */
  commitmentTitles: Readonly<Record<string, string>>;
  /**
   * Y AVAIT-IL UNE PRESCRIPTION À CE TOUR — required, and required for the same
   * reason `binding` is: a caller that can forget it renders the wrong message.
   *
   * `false` is the NORMAL case in the KEEL model (the coach writes for a cohort,
   * never for one student), and it changes what the acknowledgement may say.
   * Every sentence about lines, credits and "your plan" is silenced: there is
   * no plan, so "I have not attached it to a line on your plan" describes an
   * absence the student cannot act on and points at a screen that will never
   * fill. What is left is the true and useful part -- what is on the plate.
   *
   * Deducing it from `commitmentTitles` being empty was the tempting shortcut.
   * It conflates "no prescription exists" with "the plate matched nothing",
   * which are different states that deserve different sentences.
   */
  hasPrescription: boolean;
  /**
   * LE PLAT PRÉVU QUE CE TOUR VIENT DE COCHER, ou null.
   *
   * REQUIS, et pour la raison symétrique de `binding`: celui-ci garde contre
   * « un accusé sans effet », celui-là contre « un effet sans accusé ». La
   * coche est une ligne écrite dans `protocol_events`; la passer sous silence
   * laisserait l'élève découvrir une case cochée qu'il n'a pas cochée, sans
   * savoir ni pourquoi ni comment la retirer.
   *
   * Non nul veut dire: la ligne EST écrite et relue. Jamais « on va la
   * écrire » — c'est l'appelant qui ne renseigne ce champ qu'après l'insert.
   */
  tickedDish: string | null;
  /**
   * LE CRÉNEAU DÉDUIT DE L'HEURE, ou `null` quand l'élève l'a déclaré (ou
   * qu'aucun n'a pu l'être).
   *
   * REQUIS, pour la raison exacte de `tickedDish`: c'est un fait que la machine
   * vient d'écrire sur la ligne. Le taire ferait ranger un repas dans un
   * créneau que personne n'a choisi, sans que l'élève sache ni que c'est arrivé
   * ni comment le corriger — la déduction silencieuse que `TodayPage` refuse à
   * juste titre.
   *
   * `undefined` n'est pas une réponse: la fonction jette, comme pour les trois
   * autres arguments de ce contrat.
   */
  inferredSlot: "breakfast" | "lunch" | "dinner" | null;
  locale: string;
}

/**
 * LES PHRASES DE L'ACCUSÉ, UNE PAR LANGUE.
 *
 * ══ LE DÉFAUT QUE CE PACK FERME, ET IL A DURÉ ═════════════════════════════
 * `renderMealPhotoAck` JETAIT sur toute locale non anglaise. Tant que
 * `PILOT_FORCED_LOCALE = "en-US"` épinglait la flotte, personne ne pouvait
 * l'atteindre; le jour du désépinglage, un élève `fr-FR` — 729 lignes sur
 * 1 150 en base locale — a fait rendre **HTTP 500 à toute analyse de photo
 * francophone**. On a alors dégradé vers l'anglais en le journalisant, ce qui
 * a rendu le service mais a laissé le vrai manque intact: le pack.
 *
 * ⚠️ CE QUI RESTE ANGLAIS, ET CE N'EST PAS UN OUBLI: `DetectedFood.label`.
 * Un matcher le lit (voir son propre pavé). Ce qui se dit à l'élève est
 * `label_localized`, avec repli sur `label` — mieux vaut « je vois porridge
 * oats » qu'une phrase amputée de ce qu'on a vu.
 *
 * R7 par délégation: `localePackKey` jette sur une langue non livrée, ici comme
 * partout. Ajouter une langue = ajouter une entrée, et le typecheck l'exige.
 */
/**
 * LES MOTS QUI PORTENT LA BASE — CALORIE_REVERSAL §6.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POURQUOI UNE CONSTANTE, ET PAS SIMPLEMENT UNE PHRASE ÉCRITE DEUX FOIS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La propriété que ce chantier achète tient en une ligne: *un chiffre qui
 * atteint un élève porte sa base*. Une propriété n'est une propriété que si
 * quelque chose peut la VÉRIFIER — et pour la vérifier sur une phrase rendue,
 * il faut un point d'accroche qui ne soit pas une recopie de la phrase.
 *
 * Ces marqueurs sont ce point d'accroche, et ils sont l'ORIGINE des phrases:
 * `ACK_COPY.energy` les interpole au lieu de les répéter. Réécrire la phrase
 * en oubliant sa base devient donc impossible sans supprimer le marqueur, ce
 * que le harnais voit.
 *
 * ⚠️ LA DISSYMÉTRIE DES DEUX PHRASES EST LE FOND, PAS UN TON. `photo_estimate`
 * a été mesurée à −26,6 % de biais sur ce produit, TOUJOURS du même côté et
 * pire sur les gros repas: un élève en excédent y lit un chiffre rassurant.
 * Les rendre de la même façon mentirait sur la fiabilité de l'une — et c'est
 * celle qui rassure à tort qui passerait pour l'autre.
 *
 * ⟳ 2026-09-02 — LA PHRASE DE `declared_quantities` A ÉTÉ CORRIGÉE, et pas par
 * goût. Elle disait « d'après les quantités que tu m'as données ». Son PREMIER
 * producteur est arrivé ce jour-là (FF-062 R11, `correctEnergy`), et il ne
 * reçoit AUCUNE quantité: la personne corrige un nombre de calories. La phrase
 * affirmait donc une chose fausse, et elle empruntait au passage la fiabilité
 * mesurée d'une autre méthode — 2,3 % de MAPE, obtenus sur des GRAMMES
 * recalculés par une table, jamais sur un humain qui tape un chiffre.
 *
 * « Le chiffre que tu m'as donné » dit exactement ce qui s'est passé, et il
 * reste vrai le jour où un chemin donnera vraiment des grammes.
 */
export const ENERGY_BASIS_MARKERS: Record<
  LocalePackKey,
  Record<EnergyBasis, string>
> = {
  en: {
    photo_estimate: "guessed from the photo",
    declared_quantities: "the figure you gave me",
  },
  fr: {
    photo_estimate: "deviné d'après la photo",
    declared_quantities: "le chiffre que tu m'as donné",
  },
};

const ACK_COPY: Record<LocalePackKey, {
  notFood: string;
  foodNotEaten: string;
  unreadable: string;
  see: (foods: string) => string;
  /**
   * LE CHIFFRE ET SA BASE, DANS LA MÊME PHRASE. Voir `ENERGY_BASIS_MARKERS`.
   *
   * ⚠️ DEUX ENTRÉES, ET C'EST LE TYPE QUI FAIT LE TRAVAIL. Une estimation de
   * photo se rend en FOURCHETTE, un chiffre déclaré en POINT. Avec une seule
   * fonction `(kcal, basis)`, rien n'empêchait un pack de rendre un point sur
   * une photo — c'est-à-dire d'annoncer comme mesuré ce qui est deviné, et
   * deviné bas. Deux signatures distinctes rendent ce mélange impossible à
   * écrire.
   */
  energyBand: (low: number, high: number) => string;
  energyPoint: (kcal: number) => string;
  /**
   * ⟳ LES DEUX ACCUSÉS QUI VIVAIENT EN ANGLAIS EN DUR, HORS DE TOUT PACK.
   *
   * Ils étaient écrits à la main dans `meal-photo-upload-v1/index.ts`, et un
   * francophone les recevait donc en anglais — sous un accusé français, deux
   * lignes plus bas. Ils rentrent ici parce que c'est ce qu'ils sont: de la
   * copie d'accusé de photo, au même titre que les treize autres.
   */
  savedUnanalysed: string;
  duplicate: string;
  noItems: string;
  ticked: (dish: string) => string;
  loggedExplicit: (titles: string) => string;
  counted: (titles: string) => string;
  alsoSee: (titles: string, many: boolean) => string;
  onlySee: (titles: string) => string;
  doesNotLineUp: (title: string) => string;
  notAttached: string;
  assumed: (assumption: string) => string;
  lowConfidence: string;
  /** Les trois créneaux DATABLES — les seuls que l'inférence peut produire. */
  slotName: Record<"breakfast" | "lunch" | "dinner", string>;
  filedUnder: (slot: string) => string;
  and: string;
}> = {
  en: {
    notFood:
      "That does not look like food, so I have not counted it as a meal. Send me your plate when you sit down and I will take it from there.",
    foodNotEaten:
      "That looks like food you have not eaten yet — a menu, a shelf or a packet. I have not counted it as a meal. Send me the plate once it is in front of you.",
    unreadable:
      "I could not read that photo well enough to say anything useful, so I have not logged what is on it. Another one, a little brighter, and I will.",
    see: (foods) => `I see ${foods}.`,
    energyBand: (low, high) =>
      `Ballpark: between ${low} and ${high} kcal, ${
        ENERGY_BASIS_MARKERS.en.photo_estimate
      } — photo guesses run low, so treat that as an order of magnitude rather than a measurement.`,
    energyPoint: (kcal) =>
      `About ${kcal} kcal, ${ENERGY_BASIS_MARKERS.en.declared_quantities}.`,
    savedUnanalysed:
      "Saved. I could not analyse it just now — it is on file either way.",
    duplicate:
      "I already have that photo — it is the same one, so I have not logged it twice.",
    noItems: "Photo saved. I could not identify the items with confidence.",
    ticked: (dish) =>
      `Looks like your planned "${dish}" — I have ticked it off. Tell me if that was not it.`,
    loggedExplicit: (titles) => `Logged against ${titles}, as you asked.`,
    counted: (titles) => `Counted toward ${titles}.`,
    alsoSee: (titles, many) =>
      `I can also see ${titles} here, but I have not counted this photo toward ${
        many ? "them" : "it"
      } - tell me which one to count.`,
    onlySee: (titles) =>
      `I can see ${titles} here, but one photo cannot settle which one it is - tell me which one to count and I will log it.`,
    doesNotLineUp: (title) => `It does not line up with "${title}".`,
    notAttached:
      "I have not attached it to a line on your plan - it is on file for your coach.",
    assumed: (assumption) => `${assumption} Tell me if that is wrong.`,
    lowConfidence:
      "I am not confident about this reading - correct me if I got it wrong.",
    slotName: { breakfast: "breakfast", lunch: "lunch", dinner: "dinner" },
    filedUnder: (slot) =>
      `I have filed it under ${slot}, going by the time — tell me if it was another meal.`,
    and: "and",
  },
  fr: {
    // ⚠️ « je ne l'ai pas comptée comme un repas » et pas « je ne l'ai pas
    // validée »: on rapporte ce que la LIGNE porte, jamais une note. Le
    // vocabulaire de l'évaluateur (`met`, `missed`) reste hors de cette
    // surface dans les deux langues — c'est la règle de l'en-tête, pas une
    // préférence de traduction.
    notFood:
      "Ça n'a pas l'air d'être de la nourriture, donc je ne l'ai pas comptée comme un repas. Envoie-moi ton assiette quand tu passes à table et je prends le relais.",
    foodNotEaten:
      "Ça ressemble à de la nourriture que tu n'as pas encore mangée — une carte, un rayon ou un paquet. Je ne l'ai pas comptée comme un repas. Renvoie-la-moi une fois l'assiette devant toi.",
    unreadable:
      "Je n'ai pas réussi à lire cette photo assez bien pour en dire quelque chose d'utile, donc je n'ai rien enregistré de ce qu'il y a dessus. Une autre, un peu plus lumineuse, et c'est bon.",
    see: (foods) => `Je vois ${foods}.`,
    energyBand: (low, high) =>
      `Ordre de grandeur : entre ${low} et ${high} kcal, ${
        ENERGY_BASIS_MARKERS.fr.photo_estimate
      } — les estimations sur photo tirent vers le bas, donc prends-le comme un ordre de grandeur, pas comme une mesure.`,
    energyPoint: (kcal) =>
      `Environ ${kcal} kcal, ${ENERGY_BASIS_MARKERS.fr.declared_quantities}.`,
    savedUnanalysed:
      "C'est enregistré. Je n'ai pas pu l'analyser à l'instant — la photo est gardée quand même.",
    duplicate:
      "J'ai déjà cette photo — c'est la même, donc je ne l'ai pas comptée deux fois.",
    noItems: "Photo enregistrée. Je n'ai pas pu identifier les aliments avec certitude.",
    ticked: (dish) =>
      `On dirait ton « ${dish} » prévu — je l'ai coché. Dis-moi si ce n'était pas ça.`,
    loggedExplicit: (titles) => `Enregistré sur ${titles}, comme tu l'as demandé.`,
    counted: (titles) => `Compté pour ${titles}.`,
    alsoSee: (titles, many) =>
      `Je vois aussi ${titles} ici, mais je n'ai pas compté cette photo ${
        many ? "pour elles" : "pour elle"
      } - dis-moi laquelle compter.`,
    onlySee: (titles) =>
      `Je vois ${titles} ici, mais une seule photo ne peut pas trancher laquelle c'est - dis-moi laquelle compter et je l'enregistre.`,
    doesNotLineUp: (title) => `Ça ne colle pas avec « ${title} ».`,
    notAttached:
      "Je ne l'ai rattachée à aucune ligne de ton plan - elle est au dossier pour ton coach.",
    assumed: (assumption) => `${assumption} Dis-moi si c'est faux.`,
    lowConfidence:
      "Je ne suis pas sûre de cette lecture - corrige-moi si je me trompe.",
    slotName: {
      breakfast: "petit-déjeuner",
      lunch: "déjeuner",
      dinner: "dîner",
    },
    filedUnder: (slot) =>
      `Je l'ai rangée au ${slot}, d'après l'heure — dis-moi si c'était un autre repas.`,
    and: "et",
  },
};

/**
 * `"A"`, `"A" and "B"`, `"A", "B" and "C"` — et son équivalent français.
 *
 * ⚠️ LES GUILLEMETS SUIVENT LA LANGUE. `"..."` en anglais, `« ... »` en
 * français: une phrase française truffée de guillemets droits se lit comme une
 * traduction automatique, ce qui est exactement l'impression qu'on cherche à
 * ne pas donner sur la surface qui rapporte un fait.
 */
function quotedList(titles: readonly string[], pack: LocalePackKey): string {
  const quoted = titles.map((t) => pack === "fr" ? `« ${t} »` : `"${t}"`);
  if (quoted.length <= 1) return quoted.join("");
  return `${quoted.slice(0, -1).join(", ")} ${ACK_COPY[pack].and} ${
    quoted[quoted.length - 1]
  }`;
}

/**
 * LA PHRASE DU CHIFFRE — l'unique endroit du produit où un kcal devient du texte.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LA PROPRIÉTÉ QUE CETTE FONCTION EXISTE POUR RENDRE VÉRIFIABLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `CALORIE_REVERSAL.md` §5 demande une quatrième couche au harnais: *« tout
 * rendu qui affiche `kcal` affiche aussi sa base »*. Une propriété pareille ne
 * se vérifie que si le rendu passe par UN point. C'est celui-ci.
 *
 * ⛔ AUCUNE AUTRE LIGNE DE L'ACCUSÉ N'A LE DROIT D'ÉCRIRE UN NOMBRE, et le
 * harnais l'éprouve sur l'espace entier des combinaisons (verdicts × bandes ×
 * qualités × liaisons) avec `energy_estimate: null`: pas un chiffre n'en sort.
 *
 * `null` en entrée rend `null` en sortie — pas une phrase vide. Une phrase
 * vide se pousserait dans `lines` et produirait un double espace, ce qui est
 * la trace qu'un chiffre a été retiré: ne rien dire, c'est ne rien dire.
 */
export function renderEnergyLine(
  estimate: EnergyEstimate | null,
  pack: LocalePackKey,
): string | null {
  if (!estimate) return null;
  if (!Number.isFinite(estimate.kcal)) return null;
  if (estimate.basis !== "photo_estimate") {
    return ACK_COPY[pack].energyPoint(estimate.kcal);
  }
  const band = photoEnergyBand(estimate.kcal);
  return ACK_COPY[pack].energyBand(band.low, band.high);
}

/**
 * LE BIAIS DE LA PHOTO, ET LA FOURCHETTE QUI EN DÉCOULE.
 *
 * ── POURQUOI UNE FOURCHETTE, ET POURQUOI ASYMÉTRIQUE ──────────────────────
 * L'estimation d'une photo est basse de −26,6 %, **mesuré**, et cité dans cinq
 * modules de ce dépôt (`plan_energy.ts`, `evaluator.ts`, `energy_correction.ts`,
 * et deux fois ici). Ce n'est pas du bruit: c'est un biais DIRECTIONNEL, et il
 * vient de ce qu'une photo ne montre pas — l'huile de la poêle, le beurre du
 * fond, la sauce absorbée. Toujours du même côté.
 *
 * Un point unique annonce donc comme un fait ce qui est systématiquement
 * sous-estimé. Et une fourchette CENTRÉE serait pire qu'un point: elle
 * prétendrait que l'erreur va dans les deux sens, ce que la mesure dément.
 * Celle-ci s'ouvre vers le HAUT, du montant exact du biais.
 *
 * ⛔ CE QUI EST STOCKÉ NE CHANGE PAS. `energy_estimate.kcal` reste le scalaire
 * que le modèle a rendu. La bande est un RENDU: la faire entrer en base
 * obligerait `sumEnergy` et `weakestBasis` (`tracking_window.ts`) à sommer des
 * intervalles, ce qui est un chantier à part et pas celui-ci.
 *
 * ⛔ ET `declared_quantities` RESTE UN POINT. La personne a donné un nombre;
 * l'élargir inventerait une incertitude qu'elle n'a pas exprimée.
 *
 * Arrondi à 50 kcal, le même arbitrage que `energy_target.ts::maintenanceRange`:
 * « 550–750 » se lit comme un ordre de grandeur, « 547–748 » comme une mesure.
 */
/**
 * LES DEUX ACCUSÉS QUI NE PASSENT PAS PAR `renderMealPhotoAck`.
 *
 * L'un part quand l'analyse n'a pas tourné, l'autre sur un doublon: dans les
 * deux cas il n'y a rien à décrire, donc pas de verdict, donc pas d'accusé
 * composé. Ils restent néanmoins des accusés — et ils doivent parler la même
 * langue que celui qui les remplace le reste du temps.
 */
export function renderPhotoSavedUnanalysed(pack: LocalePackKey): string {
  return ACK_COPY[pack].savedUnanalysed;
}

export function renderPhotoDuplicate(pack: LocalePackKey): string {
  return ACK_COPY[pack].duplicate;
}

export const PHOTO_ESTIMATE_LOW_BIAS = 0.266;

export function photoEnergyBand(
  kcal: number,
): { readonly low: number; readonly high: number } {
  const round50 = (n: number) => Math.round(n / 50) * 50;
  const low = round50(kcal);
  const high = round50(kcal / (1 - PHOTO_ESTIMATE_LOW_BIAS));
  // Une bande qui se referme sur elle-même après arrondi ne dit plus rien:
  // on garde alors au moins un cran d'écart, sinon autant rendre un point.
  return { low, high: high > low ? high : low + 50 };
}

/**
 * The acknowledgement.
 *
 * THE ONE RULE THAT ORGANIZES THIS FUNCTION: no acknowledgement without a
 * committed effect. What was credited is NAMED; what was not credited is said
 * out loud, with what the student can do about it. This is the repo's oldest
 * doctrine (`p0-write-through-reminders`, `fanout-reminder-phantom-commit`)
 * applied to the photo path, where it was missing.
 *
 * WHAT "CREDITED" MEANS HERE, exactly: the row as written carries something
 * `evaluator.ts::matchEvent` can reach -- an explicit/unique
 * `recognized.commitment_id`, or a `food_group_ref`. `creditedCommitmentIds`
 * computes it from the SAME two values that were written to the database, so
 * the sentence and the row cannot drift.
 *
 * WHAT IT MAY NOT CONTAIN, and why each is a rule rather than a preference:
 *  - NO percentage of any kind (CONTRACT display gate; the confidence number
 *    itself never reaches the student -- `confidence_band` exists for that);
 *  - NO calorie or macro figure (non-input #4) -- structurally impossible here,
 *    since the typed analysis has no field carrying one;
 *  - NO status word from the evaluator vocabulary (`met`, `missed`, ...): this
 *    surface reports what the FACT now carries, not what it will be graded.
 *    "Counted toward" is a statement about the row; "met" would be a grade
 *    nobody has computed yet.
 *
 * The WhatsApp seam (`handlers_meal_photo.ts::MealPhotoAnalysisPort`) consumes
 * exactly this string, so the constraint lives in one place for both surfaces.
 */
export function renderMealPhotoAck(args: MealPhotoAckArgs): string {
  // ── LA LANGUE, RÉSOLUE UNE FOIS ─────────────────────────────────────────
  //
  // ⚠️ HISTORIQUE, PARCE QUE LA PROCHAINE LANGUE REPASSERA PAR LÀ. Cette
  // fonction n'a longtemps su rendre QUE l'anglais et JETAIT sur le reste.
  // L'épingle `PILOT_FORCED_LOCALE = "en-US"` masquait le trou; le jour de son
  // retrait, un élève `fr-FR` a fait rendre **HTTP 500 à toute analyse de photo
  // francophone**. On a dégradé vers l'anglais en le journalisant — le service
  // est revenu, le manque est resté: un accusé anglais sous une photo
  // française, pour la majorité de la base.
  //
  // Le pack existe maintenant (`ACK_COPY`), donc la garde redevient celle de
  // tout le produit: `localePackKey` JETTE sur une langue non livrée, et c'est
  // voulu — un repli silencieux vers l'anglais est exactement ce qui a permis à
  // ce défaut de vivre trois semaines sans que personne ne le voie.
  const pack = localePackKey(String(args.locale ?? ""));
  const copy = ACK_COPY[pack];
  if (!args.binding) {
    // Explicit, not incidental: without the binding this function is back to
    // the state where it could announce a line nothing was credited to.
    throw new Error("[keel/meal_analysis] renderMealPhotoAck requires the binding");
  }
  if (typeof args.hasPrescription !== "boolean") {
    // Et pas un `?? false`: un défaut silencieux ferait taire les phrases de
    // crédit du mode 1:1 sans que rien n'échoue. Le seul repli acceptable est
    // le refus de rendre.
    throw new Error(
      "[keel/meal_analysis] renderMealPhotoAck requires hasPrescription",
    );
  }
  if (args.inferredSlot === undefined) {
    throw new Error(
      "[keel/meal_analysis] renderMealPhotoAck requires inferredSlot",
    );
  }
  if (args.tickedDish === undefined) {
    // Même raison, dans l'autre sens: une coche écrite et tue est un effet sans
    // accusé. `null` est une réponse; l'absence n'en est pas une.
    throw new Error("[keel/meal_analysis] renderMealPhotoAck requires tickedDish");
  }
  const a = args.analysis;
  // The three ways a photo does not become a meal. They were ONE sentence
  // before ("I could not read that photo"), which was sent about perfectly
  // legible photographs of restaurant menus — and which claimed the photo was
  // "saved either way" while the row it produced went on to be counted.
  const disqualified = mealDisqualification(a);
  if (disqualified !== null) {
    switch (disqualified) {
      case "not_food":
        return copy.notFood;
      case "food_not_eaten":
        return copy.foodNotEaten;
      case "unreadable":
        // « toward your plan » supposait un plan. On dit ce qui est vrai des
        // deux côtés: rien n'a été lu, donc rien n'a été enregistré du contenu.
        return copy.unreadable;
    }
  }

  const lines: string[] = [];
  // ⚠️ LE LIBELLÉ LOCALISÉ D'ABORD, LE LIBELLÉ DU MATCHER EN REPLI. `label`
  // reste anglais par contrat (`planned_dish_match.ts` le lit contre un
  // catalogue anglais); ce qui se DIT est `label_localized`. Un repli plutôt
  // qu'un trou: « je vois porridge oats » informe, une phrase amputée non.
  const foods = a.detected_foods
    .map((f) => (f.label_localized ?? "").trim() || f.label)
    .filter((l) => l !== "");
  lines.push(
    foods.length > 0
      ? copy.see(foods.slice(0, 5).join(", "))
      : copy.noItems,
  );

  // ── LE CHIFFRE, S'IL EXISTE, JUSTE APRÈS L'ASSIETTE QU'IL DÉCRIT ────────
  //
  // ⚠️ ICI ET PAS À LA FIN, ET C'EST UNE DÉCISION DE LECTURE. Les phrases qui
  // suivent parlent de LIGNES du plan; celle-ci parle de l'assiette qu'on vient
  // de nommer. La coller à sa cause est ce qui l'empêche d'être lue comme un
  // verdict sur le plan.
  //
  // ⛔ ET `energy_estimate` VAUT DÉJÀ `null` QUAND LA PORTE EST FERMÉE. Cette
  // ligne ne rejuge rien: `parseMealAnalysis` a effacé le chiffre à
  // l'ingestion, avant qu'il n'entre en base. Un test de porte ICI serait le
  // « filtrage entre le calcul et l'écran » que la décision du 2026-08-18
  // interdit — et surtout le second point de décision qui, un jour, diverge.
  const energyLine = renderEnergyLine(a.energy_estimate, pack);
  if (energyLine) lines.push(energyLine);

  // ── PAS DE PRESCRIPTION: ON DÉCRIT, ON NE RENDS PAS DE COMPTES ────────────
  //
  // Les quatre sections qui suivent parlent toutes de LIGNES: ce qui a été
  // crédité, ce qui ne l'a pas été, ce qui contredit, et « rien n'a été
  // rattaché ». Aucune n'a d'objet quand personne n'a rien prescrit — et la
  // dernière était la pire: elle annonçait un manque à un élève qui n'a rien
  // manqué, en désignant un « plan » que le modèle produit ne remplira jamais.
  //
  // On saute directement à l'incertitude (question / hypothèse), qui reste
  // pleinement valable: elle porte sur l'assiette, pas sur une prescription.
  // ── LE PLAT PRÉVU, COCHÉ ─────────────────────────────────────────────────
  // Annoncé AVANT tout le reste des phrases de plan, parce que c'est le seul
  // effet durable que ce tour vient d'écrire hors du fait lui-même.
  //
  // La porte de correction est dans la MÊME phrase, pas dans une seconde:
  // « je l'ai coché, dis-moi si ce n'était pas ça » se lit d'un coup, là où
  // une question séparée serait l'interrogatoire que §3.3bis interdit. Et le
  // décochage existe (`meal_tick.ts`), donc la porte mène quelque part.
  // LE CRÉNEAU DÉDUIT, DIT AVANT LA COCHE. L'ordre porte du sens: « rangée au
  // dîner » explique POURQUOI le plat prévu du dîner a pu être coché. L'inverse
  // ferait annoncer un effet avant sa cause.
  if (args.inferredSlot) {
    lines.push(copy.filedUnder(copy.slotName[args.inferredSlot]));
  }

  if (args.tickedDish) {
    lines.push(copy.ticked(args.tickedDish));
  }

  if (!args.hasPrescription) {
    return [...lines, ...uncertaintyLines(a, pack)].join(" ");
  }

  const titleOf = (id: string) => args.commitmentTitles[id] ?? "a line on your plan";
  const credited = creditedCommitmentIds({
    binding: args.binding,
    credit: args.credit ?? null,
  });
  const creditedSet = new Set(credited);

  // ---- 1. what WAS credited, named -----------------------------------------
  if (credited.length > 0) {
    const titles = quotedList(credited.map(titleOf), pack);
    lines.push(
      args.binding.kind === "explicit"
        ? copy.loggedExplicit(titles)
        : copy.counted(titles),
    );
  }

  // ---- 2. what the plate shows and did NOT credit, said out loud ------------
  // Only `consistent`/`partial` lines: those are the ones a student could
  // legitimately want counted, and the ones the old renderer announced as
  // conforming while crediting nothing.
  const uncredited = a.commitment_matches
    .filter((m) => m.verdict === "consistent" || m.verdict === "partial")
    .map((m) => m.commitment_id)
    .filter((id) => !creditedSet.has(id));

  if (uncredited.length > 0) {
    const titles = quotedList(uncredited.map(titleOf), pack);
    lines.push(
      credited.length > 0
        ? copy.alsoSee(titles, uncredited.length > 1)
        : copy.onlySee(titles),
    );
  }

  // ---- 3. evidence AGAINST a line: an observation, never a credit -----------
  for (const m of a.commitment_matches.filter((m) => m.verdict === "inconsistent")) {
    lines.push(copy.doesNotLineUp(titleOf(m.commitment_id)));
  }

  // ---- 4. nothing at all: say that, rather than implying otherwise ----------
  if (
    credited.length === 0 && uncredited.length === 0 &&
    !a.commitment_matches.some((m) => m.verdict === "inconsistent")
  ) {
    lines.push(copy.notAttached);
  }

  // ---- 5. the uncertainty, resolved in ONE of three ways -------------------
  lines.push(...uncertaintyLines(a, pack));
  return lines.join(" ");
}

/**
 * L'incertitude, résolue d'UNE des trois façons — jamais deux.
 *
 * PLAN-NUIT §3.3bis, "Reparation and clarification": of the three options --
 * guess (forbidden), clarify (costly), or proceed on the most likely hypothesis
 * WHILE SAYING IT -- pick exactly one. Stacking a question on top of an
 * assumption on top of "correct me if I'm wrong" is the interrogation the same
 * section warns about.
 *
 * Precedence, strongest first:
 *   a) a clarifying question -- it already embodies the doubt AND opens the
 *      correction door, so it supersedes both weaker forms;
 *   b) otherwise, an assumption that is only a `standard_default` -- stated,
 *      with the correction door ("hypothèse annoncée + porte de correction").
 *      `visible_cue` assumptions are NOT surfaced: those are things the photo
 *      shows, and asking the student to confirm what is visible is noise;
 *   c) otherwise, the generic low-confidence caveat.
 *
 * EXTRAITE parce qu'elle sert les DEUX rendus (avec et sans prescription), et
 * qu'elle ne parle jamais d'une ligne: le doute porte sur l'assiette. La
 * dupliquer aurait laissé le chemin sans prescription — le cas normal — avec
 * une version qui diverge en silence.
 */
function uncertaintyLines(a: MealAnalysis, pack: LocalePackKey): string[] {
  const question = String(a.clarifying_question ?? "").trim();
  const guessed = a.assumptions.filter((h) => h.basis === "standard_default");
  // ⚠️ LA QUESTION ET L'HYPOTHÈSE VIENNENT DU MODÈLE, PAS DU PACK. Elles sont
  // rendues TELLES QUELLES, et c'est le prompt qui porte leur langue (bloc
  // `== OUTPUT LANGUAGE ==`). Les traduire ici demanderait de traduire une
  // phrase libre, c'est-à-dire de la réécrire — et une hypothèse réécrite n'est
  // plus celle que l'élève peut corriger.
  if (question) return [question];
  if (guessed.length > 0) {
    return [ACK_COPY[pack].assumed(guessed[0].assumption)];
  }
  if (a.confidence_band === "low") {
    // Named, not hidden: a low-confidence reading that presents itself as
    // certain is exactly what destroys a coach's trust (W5.5's metric).
    return [ACK_COPY[pack].lowConfidence];
  }
  return [];
}
