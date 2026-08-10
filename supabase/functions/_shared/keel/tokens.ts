/**
 * KEEL — canonical token vocabularies and fail-loud parsers.
 *
 * Single source of truth for every enum-like string the KEEL schema persists
 * (docs/keel/SCHEMA.md). Pattern copied from `_shared/time_of_day.ts`, whose
 * history is the cautionary tale: the same enum diverged across three call
 * sites until it was centralized. Here every vocabulary lives in exactly one
 * place, with:
 *
 * - canonical values only (R1: ASCII snake_case English, never translated);
 * - historical aliases tolerated ON INPUT for legacy compat ('monday',
 *   'lundi' -> 'mon'), NEVER persisted and NEVER returned as-is;
 * - parsers that THROW on unknown input (R7: fail loudly — never undefined,
 *   never [], never a silent fallback). Two normalizations that disagree plus
 *   one silent drop equals a bug with no error; this repo has a live instance
 *   (planSchedule.ts returning [] for valid 'mon..sun' tokens).
 */

// ---------------------------------------------------------------------------
// Shared fail-loud machinery
// ---------------------------------------------------------------------------

/** Lowercase, trim, and collapse spaces/hyphens to underscores. */
function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Builds a parser for one vocabulary. The parser accepts canonical values and
 * declared aliases; anything else throws (R7). Aliases are an input courtesy
 * only — the return value is always canonical.
 */
function makeParser<T extends string>(
  kind: string,
  canonical: readonly T[],
  aliases: Record<string, T> = {},
): (value: unknown) => T {
  const canonicalSet: ReadonlySet<string> = new Set(canonical);
  return (value: unknown): T => {
    const normalized = normalizeToken(value);
    if (canonicalSet.has(normalized)) return normalized as T;
    const aliased = aliases[normalized];
    if (aliased) return aliased;
    // R7: fail loudly on unknown input — never undefined, never [].
    throw new Error(
      `[keel/tokens] Unknown ${kind} token: ${JSON.stringify(value)}. ` +
        `Expected one of: ${canonical.join(", ")}`,
    );
  };
}

// ---------------------------------------------------------------------------
// DAY TOKENS — plan_commitments.scheduled_days
// ---------------------------------------------------------------------------

export const DAY_TOKENS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type DayToken = (typeof DAY_TOKENS)[number];

/** Legacy aliases (English long form + French — the "dimanche" bug class). */
const DAY_ALIASES: Record<string, DayToken> = {
  monday: "mon",
  tuesday: "tue",
  wednesday: "wed",
  thursday: "thu",
  friday: "fri",
  saturday: "sat",
  sunday: "sun",
  lundi: "mon",
  mardi: "tue",
  mercredi: "wed",
  jeudi: "thu",
  vendredi: "fri",
  samedi: "sat",
  dimanche: "sun",
};

export const parseDayToken = makeParser<DayToken>(
  "day",
  DAY_TOKENS,
  DAY_ALIASES,
);

// ---------------------------------------------------------------------------
// AXIS 1 — polarity + display class
// ---------------------------------------------------------------------------

export const POLARITY = ["do", "avoid", "capture"] as const;
export type Polarity = (typeof POLARITY)[number];
export const parsePolarity = makeParser<Polarity>("polarity", POLARITY);

// R6 exemption: activity_class has zero evaluator branches — icons, grouping,
// template library and safety routing only.
export const ACTIVITY_CLASS = [
  "nutrition",
  "supplement",
  "movement",
  "recovery",
  "exposure",
  "sleep",
  "mind",
  "measurement",
  "other",
] as const;
export type ActivityClass = (typeof ACTIVITY_CLASS)[number];
export const parseActivityClass = makeParser<ActivityClass>(
  "activity_class",
  ACTIVITY_CLASS,
  { exercise: "movement", workout: "movement", mindset: "mind" },
);

// ---------------------------------------------------------------------------
// AXIS 2 — time anchor
// ---------------------------------------------------------------------------

export const ANCHOR_KIND = ["slot", "clock", "window", "free"] as const;
export type AnchorKind = (typeof ANCHOR_KIND)[number];
export const parseAnchorKind = makeParser<AnchorKind>(
  "anchor_kind",
  ANCHOR_KIND,
);

/** slot_vocabulary seed — global in P0, the 11 slots of SCHEMA.md. */
export const SLOT_VOCABULARY = [
  "on_waking",
  "breakfast",
  "snack_am",
  "pre_workout",
  "lunch",
  "post_workout",
  "snack_pm",
  "dinner",
  "before_bed",
  "any_meal",
  "any_time",
] as const;
export type SlotKey = (typeof SLOT_VOCABULARY)[number];

const SLOT_ALIASES: Record<string, SlotKey> = {
  wake_up: "on_waking",
  waking: "on_waking",
  morning_snack: "snack_am",
  afternoon_snack: "snack_pm",
  bedtime: "before_bed",
  before_sleep: "before_bed",
  anytime: "any_time",
};

export const parseSlotKey = makeParser<SlotKey>(
  "slot_key",
  SLOT_VOCABULARY,
  SLOT_ALIASES,
);

// ---------------------------------------------------------------------------
// AXIS 3 — level (measure / unit / comparator)
// ---------------------------------------------------------------------------

export const MEASURE = [
  "energy",
  "protein",
  "carb",
  "fat",
  "fiber",
  "sodium",
  "water",
  "micronutrient",
  "portion",
  "serving",
  "exchange",
  "dose",
  "duration",
  "distance",
  "load",
  "reps",
  "count",
  "rpe",
  "scale",
  "clock_time",
  "temperature",
  "boolean",
  "presence",
  "composition",
] as const;
export type Measure = (typeof MEASURE)[number];

export const parseMeasure = makeParser<Measure>("measure", MEASURE, {
  calories: "energy",
  carbs: "carb",
  fats: "fat",
  fibre: "fiber",
  rep: "reps",
});

/**
 * Canonical units (R4: SI-ish storage; display conversion is a render-time
 * axis, never a storage one). 'IU' keeps its domain-standard capitalization.
 */
export const UNIT = [
  "kcal",
  "g",
  "mg",
  "mcg",
  "IU",
  "ml",
  "l",
  "min",
  "h",
  "km",
  "kg",
  "capsule",
  "tablet",
  "scoop",
  "portion",
  "serving",
  "rep",
  "session",
  "celsius",
  "point",
  "hhmm",
  "none",
] as const;
export type Unit = (typeof UNIT)[number];

// parseUnit cannot use makeParser blindly: 'IU' is canonical but not
// lowercase, so it is routed through the alias table after normalization.
const UNIT_ALIASES: Record<string, Unit> = {
  iu: "IU",
  gram: "g",
  grams: "g",
  milligram: "mg",
  milligrams: "mg",
  microgram: "mcg",
  micrograms: "mcg",
  ug: "mcg",
  "µg": "mcg", // µg
  milliliter: "ml",
  milliliters: "ml",
  liter: "l",
  litre: "l",
  minute: "min",
  minutes: "min",
  hour: "h",
  hours: "h",
  hr: "h",
  kilogram: "kg",
  kilograms: "kg",
  kilocalorie: "kcal",
  kilocalories: "kcal",
  capsules: "capsule",
  tablets: "tablet",
  scoops: "scoop",
  portions: "portion",
  servings: "serving",
  sessions: "session",
  "°c": "celsius", // °C
  c: "celsius",
};

export const parseUnit = makeParser<Unit>("unit", UNIT, UNIT_ALIASES);

export const TARGET_OP = [">=", "<=", "==", "between", "any"] as const;
export type TargetOp = (typeof TARGET_OP)[number];

export function parseTargetOp(value: unknown): TargetOp {
  // Comparator glyphs must not go through snake_case normalization.
  const raw = String(value ?? "").trim().toLowerCase();
  const aliases: Record<string, TargetOp> = {
    "=": "==",
    eq: "==",
    gte: ">=",
    lte: "<=",
    range: "between",
  };
  if ((TARGET_OP as readonly string[]).includes(raw)) return raw as TargetOp;
  const aliased = aliases[raw];
  if (aliased) return aliased;
  // R7: fail loudly.
  throw new Error(
    `[keel/tokens] Unknown target_op token: ${JSON.stringify(value)}. ` +
      `Expected one of: ${TARGET_OP.join(", ")}`,
  );
}

// ---------------------------------------------------------------------------
// AXIS 4 — evidence
// ---------------------------------------------------------------------------

export const EVIDENCE_KIND = [
  "self_report",
  "numeric_entry",
  "photo",
  "device",
  "none_implicit",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KIND)[number];
export const parseEvidenceKind = makeParser<EvidenceKind>(
  "evidence_kind",
  EVIDENCE_KIND,
);

// ---------------------------------------------------------------------------
// CADENCE
// ---------------------------------------------------------------------------

export const EVALUATION_GRAIN = ["occasion", "day", "week"] as const;
export type EvaluationGrain = (typeof EVALUATION_GRAIN)[number];
export const parseEvaluationGrain = makeParser<EvaluationGrain>(
  "evaluation_grain",
  EVALUATION_GRAIN,
  { daily: "day", weekly: "week" },
);

export const SLOT_KIND = ["nominal", "opportunistic"] as const;
export type SlotKind = (typeof SLOT_KIND)[number];
export const parseSlotKind = makeParser<SlotKind>("slot_kind", SLOT_KIND);

// ---------------------------------------------------------------------------
// GOVERNANCE
// ---------------------------------------------------------------------------

export const PRIORITY = ["core", "secondary", "optional"] as const;
export type Priority = (typeof PRIORITY)[number];
export const parsePriority = makeParser<Priority>("priority", PRIORITY);

export const AUTONOMY = [
  "strict",
  "swap_within_policy",
  "flexible",
] as const;
export type Autonomy = (typeof AUTONOMY)[number];
export const parseAutonomy = makeParser<Autonomy>("autonomy", AUTONOMY);

export const PROVENANCE = [
  "coach_educational",
  "clinician_ordered",
] as const;
export type Provenance = (typeof PROVENANCE)[number];
export const parseProvenance = makeParser<Provenance>(
  "provenance",
  PROVENANCE,
);

// ---------------------------------------------------------------------------
// DERIVED — evaluator output (R6: two fields, never merged)
// ---------------------------------------------------------------------------

export const EVAL_STATUS = [
  "unknown",
  "met",
  "partial",
  "missed",
  "not_applicable",
  "flex_used",
] as const;
export type EvalStatus = (typeof EVAL_STATUS)[number];
export const parseEvalStatus = makeParser<EvalStatus>(
  "eval_status",
  EVAL_STATUS,
);

export const TIMING_STATUS = [
  "on_time",
  "off_window",
  "unknown",
  "not_applicable",
] as const;
export type TimingStatus = (typeof TIMING_STATUS)[number];
export const parseTimingStatus = makeParser<TimingStatus>(
  "timing_status",
  TIMING_STATUS,
);

// ---------------------------------------------------------------------------
// SUBSTANCE REFS — flat ASCII slugs, ~40 seed, no ontology (on the record:
// nutrient ontology refused in CONTRACT.md "Refused, on the record")
// ---------------------------------------------------------------------------

export const SUBSTANCE_REFS = [
  "vitamin_d3",
  "omega3_epa_dha",
  "magnesium_glycinate",
  "iron_bisglycinate",
  "creatine_monohydrate",
  "vitamin_k2",
  "methylfolate",
  "zinc",
  "copper",
  "curcumin",
  "piperine",
  "alcohol",
  "caffeine",
  "gluten",
  "st_johns_wort",
  "melatonin",
  "ashwagandha",
  "berberine",
  "vitamin_c",
  "vitamin_a",
  "vitamin_e",
  "vitamin_b12",
  "niacin",
  "selenium",
  "iodine",
  "calcium_citrate",
  "potassium",
  "omega3_epa",
  "omega3_dha",
  "collagen",
  "whey_protein",
  "casein",
  "fiber_psyllium",
  "probiotic",
  "coq10",
  "nac",
  "glycine",
  "taurine",
  "electrolytes",
  "sodium_chloride",
] as const;
export type SubstanceRef = (typeof SUBSTANCE_REFS)[number];

const SUBSTANCE_ALIASES: Record<string, SubstanceRef> = {
  coenzyme_q10: "coq10",
  ubiquinol: "coq10",
  n_acetyl_cysteine: "nac",
  saint_johns_wort: "st_johns_wort",
  st_john_s_wort: "st_johns_wort",
  whey: "whey_protein",
  psyllium: "fiber_psyllium",
  creatine: "creatine_monohydrate",
  salt: "sodium_chloride",
  // Observed unambiguous model outputs (plan-import live test, 27/07).
  // NOT added: vitamin_d (D2 exists), magnesium (citrate/oxide exist) — those
  // must stay loud so the coach reviews the form instead of us guessing it.
  epa_dha: "omega3_epa_dha",
  fish_oil: "omega3_epa_dha",
};

export const parseSubstanceRef = makeParser<SubstanceRef>(
  "substance_ref",
  SUBSTANCE_REFS,
  SUBSTANCE_ALIASES,
);

/**
 * R7 corollary (mirrors the SQL CHECK on plan_commitments):
 * measure IN ('dose','micronutrient') requires a non-empty substance_ref.
 * An unknown or missing slug fails the write, loudly.
 */
export function assertSubstanceRefRequired(
  measure: Measure,
  substanceRef: string | null | undefined,
): void {
  if (measure !== "dose" && measure !== "micronutrient") return;
  if (typeof substanceRef === "string" && substanceRef.trim() !== "") return;
  throw new Error(
    `[keel/tokens] measure='${measure}' requires a non-empty substance_ref ` +
      `(R7: molecule-register lines carry their substance identity)`,
  );
}

// ---------------------------------------------------------------------------
// FOOD GROUP REFS — mirrors the food_groups seed of the P0 migration
// (20260727090000). The FK is the DB truth; this list exists so application
// code can fail loudly (R7) before hitting the FK. token-lint asserts the two
// stay aligned.
// ---------------------------------------------------------------------------

export const FOOD_GROUP_REFS = [
  "lean_protein",
  "fatty_fish",
  "white_fish",
  "shellfish",
  "poultry",
  "red_meat",
  "eggs",
  "legumes",
  "tofu_tempeh",
  "dairy_yogurt",
  "dairy_cheese",
  "whole_grain",
  "refined_grain",
  "starchy_veg",
  "cruciferous_veg",
  "leafy_greens",
  "non_starchy_veg",
  "berries",
  "citrus",
  "other_fruit",
  "nuts_seeds",
  "olive_oil",
  "other_added_fat",
  "sauce_dressing",
  "sugar_sweets",
  "fried_food",
  "alcohol",
  "sweetened_beverage",
  "water",
  "coffee_tea",
] as const;
export type FoodGroupRef = typeof FOOD_GROUP_REFS[number];

export const parseFoodGroupRef = makeParser<FoodGroupRef>(
  "food_group_ref",
  FOOD_GROUP_REFS,
  {
    // Input courtesies only — never persisted (R7 pattern). Only UNAMBIGUOUS
    // aliases belong here: "fish" or "vegetables" must NOT silently resolve
    // to one specific group — better a loud failure than a wrong group.
    whole_grains: "whole_grain",
    citrus_fruit: "citrus",
  },
);

/**
 * LES GROUPES QUI PORTENT UNE ANCRE PROTÉIQUE — FF-037.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-037-l-ancre-proteique.md`
 *
 * ── POURQUOI C'EST UN SOUS-ENSEMBLE ET PAS UNE LISTE ──────────────────────
 * Le type est `readonly FoodGroupRef[]`, donc un slug inventé ne compile pas.
 * Une seconde liste de chaînes aurait divergé des trente le jour où un groupe
 * change de nom — c'est exactement la duplication de vocabulaire alimentaire
 * que ce dépôt a déjà payée, et que le design du chantier interdit nommément.
 *
 * ── CE QUI N'Y EST PAS, ET C'EST UN ARBITRAGE ÉCRIT ───────────────────────
 * `dairy_cheese` est EXCLU. Une pincée de parmesan n'est pas une ancre, et
 * l'inclure rendrait la garantie vraie pour presque tous les plats — donc
 * vide. Le coût accepté est une salade réellement construite autour de 150 g
 * de feta qui reçoit une issue et une relance qu'elle ne mérite pas; la
 * relance propose alors une autre ancre végétarienne, toutes présentes ici.
 * La révision de cet arbitrage passe par le calcul en GRAMMES (FF-039), pas
 * par un ajustement d'intuition (FF-037 §9).
 *
 * `nuts_seeds` est exclu pour la même raison, en plus net: 30 g d'amandes sont
 * une matière grasse avec de la protéine dedans, pas une ancre.
 *
 * ── CE QUE ÇA MESURE, ET CE QUE ÇA NE MESURE PAS ─────────────────────────
 * La PRÉSENCE d'un aliment de ces groupes. Jamais la quantité: « deux œufs »
 * et « une omelette de six » sont indiscernables ici, et c'est assumé — le
 * gramme est la question de FF-039, qui a le référentiel pour y répondre.
 */
export const PROTEIN_SOURCES = [
  "lean_protein",
  "fatty_fish",
  "white_fish",
  "shellfish",
  "poultry",
  "red_meat",
  "eggs",
  "legumes",
  "tofu_tempeh",
  "dairy_yogurt",
  // `satisfies` et pas une annotation: l'annotation élargirait le type à
  // `FoodGroupRef` et un `Record<ProteinSourceGroup, …>` exigerait alors les
  // TRENTE groupes. Ici le sous-ensemble reste étroit ET vérifié — un slug
  // inventé ne compile pas, et une table indexée dessus n'a que ces dix clés.
] as const satisfies readonly FoodGroupRef[];
export type ProteinSourceGroup = typeof PROTEIN_SOURCES[number];

// ---------------------------------------------------------------------------
// GOAL TOKENS — `student_goals.goal`, and the SCOPE of everything a coach
// writes that does not apply to every student he has.
// ---------------------------------------------------------------------------
//
// WHY THE VOCABULARY LIVES HERE AND NOT IN THE TWO MODULES THAT SCOPE ON IT.
// The coach's food mapping (`protocol_compiler.ts`) and the coach's doctrine
// (`doctrine.ts`) both carry per-goal scope, on the same values, with the same
// "empty means everyone" rule. Two copies of a closed vocabulary is the exact
// failure this file's header describes: they agree until the day one of them
// gains a value, and then a belief scoped to it reaches everybody through one
// module and nobody through the other. One list, one predicate.
//
// THE SIXTH VALUE ARRIVED (2026-08-05), and it arrived exactly as predicted
// above: `week_plan_generation.ts` held a SECOND copy of these tokens, under
// another name (`STUDENT_GOALS`), with nothing tying the two together. It now
// re-exports this list rather than restating it — the warning three lines up
// was true of this very repository, not hypothetical.
//
// WHAT THE VALUES MEAN, AND WHY THEY ARE THE ONES THEY ARE. The axis that
// actually branches a generated week is the DIRECTION OF THE SCALE: down
// (`fat_loss`), up (`muscle_gain`), or neither. "Neither" then splits by what
// the student is after instead: shape at constant weight (`recomposition`),
// training (`performance`), eating better with body weight beside the point
// (`health`), holding a place already reached (`maintenance`).
//
// `muscle_gain` was MISSING until 2026-08-05, and its absence was not benign:
// `performance` was the nearest-looking home, and `focusFor('performance')`
// fuels sessions and recovery — never a surplus — while `directionIsWorking`
// returns false for it, so a gaining student's rising weight, which is his
// win, read as "no measure says anything". The coach-side i18n had meanwhile
// labelled `recomposition` "Muscle gain", so a coach restricting a rule to
// muscle gain was in fact restricting it to waist-down-at-constant-weight —
// the opposite instruction. Both are fixed; the label is now its own token.

export const GOAL_TOKENS = [
  "fat_loss",
  "muscle_gain",
  "recomposition",
  "performance",
  "health",
  "maintenance",
] as const;
export type GoalToken = (typeof GOAL_TOKENS)[number];

export const parseGoalToken = makeParser<GoalToken>("goal", GOAL_TOKENS);

/**
 * Does an entry scoped to `goalScope` apply to a student whose goal is `goal`?
 *
 * TWO ASYMMETRIES, BOTH DELIBERATE:
 *
 *   empty scope  → applies to EVERYONE. It is the default a coach never has to
 *                  think about, and the overwhelming majority of what he
 *                  writes. Absent must never mean "reaches nobody", or a
 *                  doctrine written before scope existed would go silent.
 *
 *   goal === null → gets the GLOBAL entries and nothing else. A student who
 *                  has not declared a goal is not a student with every goal:
 *                  serving him a claim written for fat loss lends him an
 *                  intention he never stated.
 *
 * `goalScope` is `readonly string[]` and not `readonly GoalToken[]` on purpose:
 * a scope read back from jsonb may carry a token this build does not know, and
 * the safe reading of an unknown scope is "reaches nobody" — never "reaches
 * everybody", which is what dropping the unknown token would produce.
 */
export function goalScopeApplies(
  goalScope: readonly string[],
  goal: GoalToken | null,
): boolean {
  if (goalScope.length === 0) return true;
  if (goal === null) return false;
  return goalScope.includes(goal);
}

/**
 * Un jeton qui n'est aucun objectif, donc qui n'atteint personne.
 *
 * C'est la valeur de repli d'une portée MALFORMÉE, et le choix du repli est la
 * seule décision de sécurité de `parseGoalScope`.
 */
export const MALFORMED_GOAL_SCOPE: readonly string[] = ["!malformed"];

/**
 * Lire la portée d'une entrée. Absente = globale; illisible = personne.
 *
 * ── ELLE VIT ICI, À CÔTÉ DE `goalScopeApplies`, ET C'EST RÉCENT ──────────
 * Elle était privée à `doctrine.ts`, qui était son seul lecteur. Les pratiques
 * quotidiennes (FF-001) portent la MÊME portée avec la MÊME sémantique, et
 * FF-001 l'écrit noir sur blanc: « même sémantique et même filtre que
 * `DoctrineBelief.goalScope` / `goalScopeApplies` ». Une seconde lecture aurait
 * divergé au premier jeton ajouté, et la divergence aurait été silencieuse d'un
 * côté (croyance muette) et fuyante de l'autre (pratique servie à tout le
 * monde). Le lecteur et le filtre sont donc dans le même fichier, sans rien
 * importer, ce qui est la seule raison pour laquelle aucun cycle d'import ne
 * peut naître de ce partage.
 *
 * ── LA DIRECTION DE L'ÉCHEC EST TOUT ────────────────────────────────────
 * Il y a deux façons de rater la lecture d'une portée, et elles ne coûtent pas
 * la même chose:
 *
 *   lâcher le jeton inconnu  → la portée devient vide, donc GLOBALE, donc
 *                              l'entrée ciblée part chez tout le monde. C'est
 *                              exactement la fuite que la portée existe pour
 *                              fermer, et elle serait silencieuse.
 *   garder le jeton inconnu  → la portée reste non vide et ne matche aucun
 *                              objectif: l'entrée n'atteint personne. Le coach
 *                              perd l'entrée, et il le lit dans `issues`.
 *
 * On garde. Une entrée muette est un défaut visible; une entrée servie au
 * mauvais élève ne se voit que le jour où le coach lit la conversation.
 *
 * ABSENT ≠ VIDE-ET-ILLISIBLE: une entrée SANS champ `goal_scope` (toute
 * doctrine écrite avant la portée) est globale, et c'est la rétrocompatibilité.
 * Une entrée AVEC un `goal_scope` qu'on n'arrive pas à lire (un objet, un
 * nombre, un tableau de chaînes vides) n'est pas la même chose: l'auteur a
 * voulu restreindre, on ne sait pas à quoi, et le repli est « personne ».
 */
export function parseGoalScope(
  raw: unknown,
  where: string,
  issues: string[],
): readonly string[] {
  if (raw === undefined || raw === null) return [];

  let candidates: unknown[];
  if (Array.isArray(raw)) {
    candidates = raw;
  } else if (typeof raw === "string") {
    // Une chaîne seule est une intention lisible ("fat_loss"), pas une erreur.
    candidates = raw.trim() ? [raw] : [];
  } else {
    issues.push(
      `${where}: goal_scope is not a list, kept as unreachable — this entry reaches nobody`,
    );
    return MALFORMED_GOAL_SCOPE;
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of candidates) {
    const token = String(value ?? "").trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    if (!(GOAL_TOKENS as readonly string[]).includes(token)) {
      issues.push(
        `${where}: unknown goal ${JSON.stringify(token)} in goal_scope, ` +
          `kept — this entry reaches nobody until you fix it`,
      );
    }
    out.push(token);
  }

  // L'auteur a écrit une portée, et il n'en reste rien de lisible. Retomber sur
  // « globale » ici publierait l'entrée à toute la cohorte au motif qu'on n'a
  // pas su lire la restriction.
  if (out.length === 0 && candidates.length > 0) {
    issues.push(
      `${where}: goal_scope has no readable goal, kept as unreachable — this entry reaches nobody`,
    );
    return MALFORMED_GOAL_SCOPE;
  }
  return out;
}
