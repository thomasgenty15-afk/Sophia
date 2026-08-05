/**
 * LE COMPILATEUR DE PROTOCOLE — ce que le coach coche devient ce que Sophia vérifie
 * ================================================================================
 *
 * Autorité: docs/nutrition-pivot/PROMPT-COACH-PROTOCOL.md §5.2, docs/keel/CONTRACT.md.
 *
 * Le coach n'écrit plus d'engagements structurés. Il exprime sa méthode par un
 * MAPPING (une posture par groupe d'aliments) et une poignée de RÈGLES
 * TEMPORELLES à gabarits fermés. Ce module transforme les deux en
 * `plan_commitments` — la structure, elle, ne bouge pas: c'est contre elle que
 * l'analyse photo se compare, que l'évaluateur note, et que la semaine se
 * construit.
 *
 * PUR. Aucune I/O, aucune horloge, aucun hasard, aucune locale. On lui donne
 * des règles, il rend des lignes. C'est ce qui le rend testable champ par
 * champ — et chaque champ dérivé ci-dessous est justifié par un test dans
 * `protocol_compiler_test.ts`.
 *
 * ----------------------------------------------------------------------------
 * LE CONTRAT QU'IL DOIT SATISFAIRE, ET D'OÙ IL VIENT
 * ----------------------------------------------------------------------------
 * Ces règles ne sont pas des préférences de style: elles sont vérifiées par
 * `plan-template-v1/commitment_rules.ts` et par les CHECK de la table. Une
 * ligne compilée qui les viole est refusée à l'écriture.
 *
 *   plan_commitments_target_check
 *     '>=' et '=='  exigent target_min, INTERDISENT target_max
 *     '<='          exige  target_max, INTERDIT   target_min
 *     'between'     exige les deux, min <= max
 *     'any'         INTERDIT les deux
 *
 *   plan_commitments_avoid_grain_check
 *     polarity='avoid' s'évalue au grain 'day' ou 'week', jamais 'occasion'
 *     (R6 — un défaut inversé n'a pas de sens par occasion).
 *
 *   plan_commitments_occasion_anchor_check
 *     evaluation_grain='occasion' exige une ancre qui résout une occasion,
 *     donc jamais anchor_kind='free'.
 *
 *   plan_commitments_nominal_slot_check
 *     slot_kind='nominal' interdit slot_key='any_meal' (un créneau nominal doit
 *     être pré-semable à l'ouverture du jour).
 *
 *   plan_commitments_anchor_check
 *     'slot'   exige slot_key, interdit clock_local/tolerance_minutes
 *     'window' exige les deux bornes, interdit slot_key/clock_local
 *     'free'   interdit toute colonne d'ancre
 *
 * ----------------------------------------------------------------------------
 * POURQUOI 'any' SUR LES LIGNES D'ÉVITEMENT, ET PAS '<= 0'
 * ----------------------------------------------------------------------------
 * L'évaluateur (`evaluator.ts`, branche polarity='avoid') ne lit PAS le target
 * d'une ligne d'évitement: aucun fait contraire => `met`, un fait contraire =>
 * `missed`. Écrire '<= 0' donnerait au coach l'illusion d'un seuil numérique
 * que rien ne lit. 'any' dit la vérité: c'est une présence qu'on surveille, pas
 * une quantité. (Et c'est aussi ce que le contrat autorise: 'any' interdit
 * target_min ET target_max.)
 *
 * ----------------------------------------------------------------------------
 * ⚠️ UN 'excluded' DE COACH N'EST PAS UNE ALLERGIE
 * ----------------------------------------------------------------------------
 * Rien dans ce module ne lit `student_safety_constraints`, et rien de ce qu'il
 * produit ne porte la sévérité d'un risque vital. La différence entre
 * 'discouraged' et 'excluded' est une différence de MÉTHODE — `autonomy`,
 * `priority`, `flex_eligible` — pas une différence de sécurité. Les allergies
 * ont leur table, leur double verrou et leur écran déterministe; elles ne
 * passent jamais par ici. `protocol_compiler_separation_test.ts` le prouve dans
 * les deux sens.
 */

import { type GoalToken, goalScopeApplies } from "./tokens.ts";
import type { FoodGroupRef } from "./tokens.ts";
import type { SlotKey } from "./tokens.ts";

// ---------------------------------------------------------------------------
// LES ENTRÉES — exactement ce que les tables du coach portent
// ---------------------------------------------------------------------------

/**
 * `student_goals.goal`. Une entrée sans portée vise tout le monde.
 *
 * La liste vit dans `tokens.ts` depuis que la DOCTRINE porte la même portée
 * (lot doctrine-by-goal): deux copies d'un vocabulaire fermé finissent par
 * diverger, et le jour où elles divergent une croyance visant un sixième
 * objectif atteint tout le monde d'un côté et personne de l'autre.
 */
export type { GoalToken };

export type Stance = "encouraged" | "discouraged" | "excluded";

/** Une ligne de `coach_food_rules`. */
export interface CoachFoodRule {
  readonly food_group_ref: FoodGroupRef;
  readonly stance: Stance;
  /** Vide = global. Non vide = ne vise que ces objectifs. */
  readonly goal_scope: readonly GoalToken[];
  readonly rationale: string | null;
}

/** Une ligne de `coach_timing_rules`. Les trous varient selon le gabarit. */
export type CoachTimingRule =
  & {
    readonly food_group_ref: FoodGroupRef;
    readonly goal_scope: readonly GoalToken[];
    readonly rationale: string | null;
  }
  & (
    | {
      readonly template: "portions_per_period";
      readonly direction: "at_least" | "at_most";
      readonly portions: number;
      readonly period: "day" | "week";
    }
    | { readonly template: "group_every_meal" }
    | { readonly template: "no_group_after"; readonly cutoff_local: string }
    | { readonly template: "group_at_slot"; readonly slot_key: SlotKey }
  );

/** Un terme du coach, rattaché à un groupe du vocabulaire partagé. */
export interface CoachTerm {
  readonly term: string;
  readonly food_group_ref: FoodGroupRef;
}

export interface ProtocolInput {
  readonly coachId: string;
  readonly contentLocale: string;
  readonly foodRules: readonly CoachFoodRule[];
  readonly timingRules: readonly CoachTimingRule[];
  readonly terms: readonly CoachTerm[];
}

// ---------------------------------------------------------------------------
// LA SORTIE — une ligne `plan_commitments`, moins ce que l'appelant possède
// ---------------------------------------------------------------------------
// `id`, `plan_version_id`, `user_id`, `created_at`, `updated_at` sont posés par
// l'écrivain (plan-publish-v1), pas par le compilateur: il ne sait pas à quel
// élève ni à quelle version il écrit, et c'est très bien ainsi.

export interface CompiledCommitment {
  readonly coach_id: string;
  /** Clé de jointure stable — voir `commitmentKey` plus bas. */
  readonly template_commitment_key: string;

  readonly polarity: "do" | "avoid";
  readonly activity_class: "nutrition";

  readonly anchor_kind: "slot" | "window" | "free";
  readonly slot_key: SlotKey | null;
  readonly clock_local: null;
  readonly tolerance_minutes: null;
  readonly window_start_local: string | null;
  readonly window_end_local: string | null;

  readonly measure: "portion" | "presence";
  readonly unit: "portion" | "none";
  readonly target_op: ">=" | "<=" | "any";
  readonly target_min: number | null;
  readonly target_max: number | null;
  readonly substance_ref: null;
  readonly food_group_ref: FoodGroupRef;

  readonly evidence_kind: "self_report";
  readonly evidence_required: boolean;
  readonly auto_source: null;
  readonly counts_toward_adherence: boolean;

  readonly evaluation_grain: "occasion" | "day" | "week";
  readonly slot_kind: "nominal" | "opportunistic" | null;
  readonly scheduled_days: null;
  readonly required_days_per_week: number | null;
  readonly expected_occasions_per_day: number | null;

  readonly priority: "core" | "secondary";
  readonly autonomy: "strict" | "swap_within_policy" | "flexible";
  readonly flex_eligible: boolean;

  readonly title: string;
  readonly student_instruction: string | null;
  readonly content_locale: string;
  /** Ces lignes sont DÉRIVÉES. C'est ce qui les distingue d'un écrit à la main. */
  readonly auto_generated: true;
  readonly status: "active";

  /**
   * Colonnes INERTES depuis le 2026-07-28 (voir l'en-tête de
   * 20260727090000_keel_p0_commitments.sql): aucun code ne branche dessus. On
   * les pose quand même explicitement parce que `validateDraftCommitment` les
   * contrôle — une ligne compilée doit passer le VRAI validateur, pas une
   * version indulgente de lui.
   */
  readonly provenance: "coach_educational";
  readonly requires_clinician_signoff: false;
  readonly source_span: null;

  /**
   * L'APERÇU, structuré et sans locale (R2). Le coach doit voir en permanence
   * les lignes que ses coches produisent; sans ça il coche à l'aveugle dans une
   * boîte noire qui écrit sa méthode à sa place. Le rendu en phrase
   * (« Légumes verts — au moins 1 portion par jour, souple ») appartient à
   * l'i18n du front, pas ici.
   */
  readonly preview: PreviewDescriptor;
}

export type PreviewDescriptor =
  | { readonly kind: "encourage"; readonly group: FoodGroupRef; readonly perDay: number }
  | { readonly kind: "discourage"; readonly group: FoodGroupRef }
  | { readonly kind: "exclude"; readonly group: FoodGroupRef }
  | {
    readonly kind: "portions";
    readonly group: FoodGroupRef;
    readonly direction: "at_least" | "at_most";
    readonly portions: number;
    readonly period: "day" | "week";
  }
  | { readonly kind: "every_meal"; readonly group: FoodGroupRef }
  | { readonly kind: "not_after"; readonly group: FoodGroupRef; readonly cutoff: string }
  | { readonly kind: "at_slot"; readonly group: FoodGroupRef; readonly slot: SlotKey };

// ---------------------------------------------------------------------------
// LE VOCABULAIRE DU COACH — ses mots dans le titre, sans casser la jointure
// ---------------------------------------------------------------------------

/**
 * Le titre porte le mot du COACH quand il en a posé un sur ce groupe.
 *
 * C'est tout l'intérêt de `coach_terms`: le pipeline continue de travailler sur
 * `food_group_ref` (la FK, la jointure photo, le prompt de vision), et le coach
 * lit « Huiles de graines » là où le vocabulaire partagé dit
 * `other_added_fat`. Aucun slug privé n'est jamais créé.
 *
 * DÉTERMINISME: plusieurs termes peuvent viser le même groupe. On prend le plus
 * petit en ordre lexicographique sur la forme repliée — jamais « le premier
 * rendu par la base », qui dépendrait d'un ORDER BY absent et ferait bouger un
 * titre entre deux compilations identiques.
 */
export function labelForGroup(
  group: FoodGroupRef,
  terms: readonly CoachTerm[],
): { readonly label: string; readonly fromCoachTerm: boolean } {
  const mine = terms
    .filter((t) => t.food_group_ref === group)
    .map((t) => t.term.trim())
    .filter((t) => t.length > 0)
    .sort((a, b) => {
      const fa = a.toLowerCase();
      const fb = b.toLowerCase();
      if (fa < fb) return -1;
      if (fa > fb) return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
  if (mine.length > 0) return { label: mine[0], fromCoachTerm: true };
  // Pas de terme de coach: le front rendra `food_group.<slug>` via l'i18n. On
  // pose le slug, jamais une traduction — le compilateur est sans locale.
  return { label: group, fromCoachTerm: false };
}

/**
 * La clé de jointure d'une ligne dérivée. Stable pour une même règle, ce qui
 * rend la recompilation IDEMPOTENTE: republier deux fois le même protocole ne
 * doit pas empiler deux copies de chaque ligne chez l'élève.
 */
export function commitmentKey(
  rule: CoachFoodRule | CoachTimingRule,
): string {
  if (!("template" in rule)) return `protocol:food:${rule.food_group_ref}`;
  switch (rule.template) {
    case "portions_per_period":
      return `protocol:timing:portions_per_period:${rule.food_group_ref}:${rule.direction}:${rule.period}`;
    case "group_every_meal":
      return `protocol:timing:group_every_meal:${rule.food_group_ref}`;
    case "no_group_after":
      return `protocol:timing:no_group_after:${rule.food_group_ref}:${rule.cutoff_local}`;
    case "group_at_slot":
      return `protocol:timing:group_at_slot:${rule.food_group_ref}:${rule.slot_key}`;
  }
}

// ---------------------------------------------------------------------------
// LA PORTÉE PAR OBJECTIF
// ---------------------------------------------------------------------------

/**
 * Une entrée vide de portée est GLOBALE — c'est le défaut, et le cas de
 * l'écrasante majorité des lignes d'un coach. Une portée non vide ne vise que
 * les objectifs nommés.
 *
 * `goal === null` (un élève qui n'a pas encore déclaré d'objectif) reçoit les
 * lignes globales et RIEN d'autre: lui appliquer une règle écrite pour
 * `fat_loss` serait lui prêter un but qu'il n'a pas énoncé.
 *
 * DÉLÈGUE, et ce n'est pas une indirection gratuite: la doctrine du coach porte
 * exactement la même portée (`doctrine.ts`), et le jour où l'une des deux se
 * mettrait à lire « portée inconnue » comme « pour tout le monde », un coach
 * verrait sa règle tenir sur ses aliments et fuir sur ses croyances.
 */
export function ruleAppliesTo(
  goalScope: readonly GoalToken[],
  goal: GoalToken | null,
): boolean {
  return goalScopeApplies(goalScope, goal);
}

// ---------------------------------------------------------------------------
// LA COMPILATION D'UNE POSTURE
// ---------------------------------------------------------------------------

/**
 * LA TABLE DE DÉRIVATION DES POSTURES — le cœur du lot, en une vue.
 *
 *   stance        polarity  target        grain  autonomy             priority   flex
 *   ------------  --------  ------------  -----  -------------------  ---------  -----
 *   encouraged    do        '>=' min 1    day    flexible             secondary  true
 *   discouraged   avoid     'any'         day    swap_within_policy   secondary  true
 *   excluded      avoid     'any'         day    strict               core       false
 *
 * Ce qui sépare 'discouraged' de 'excluded' tient en trois champs, et aucun
 * n'est un champ de sécurité: `autonomy` (l'élève peut-il substituer),
 * `priority` (la ligne est-elle au cœur de la méthode), `flex_eligible` (l'écart
 * peut-il être dépensé sur l'enveloppe hebdomadaire). Un écart sur une ligne
 * 'excluded' n'est pas dépensable — c'est la sévérité maximale d'une MÉTHODE,
 * et elle reste très en deçà de celle d'une allergie.
 *
 * 'encouraged' est 'flexible' et non 'strict': « je pousse les légumes » est une
 * direction, pas une prescription au gramme. Le durcir ferait rater sa journée à
 * un élève qui a mangé des épinards au lieu du brocoli attendu.
 */
export function compileFoodRule(
  rule: CoachFoodRule,
  ctx: { readonly coachId: string; readonly contentLocale: string; readonly terms: readonly CoachTerm[] },
): CompiledCommitment {
  const { label } = labelForGroup(rule.food_group_ref, ctx.terms);

  const base = {
    coach_id: ctx.coachId,
    template_commitment_key: commitmentKey(rule),
    activity_class: "nutrition",
    // Une posture ne nomme aucun moment: c'est une orientation sur la journée.
    anchor_kind: "free",
    slot_key: null,
    clock_local: null,
    tolerance_minutes: null,
    window_start_local: null,
    window_end_local: null,
    substance_ref: null,
    food_group_ref: rule.food_group_ref,
    evidence_kind: "self_report",
    evidence_required: false,
    auto_source: null,
    counts_toward_adherence: true,
    // 'day': imposé pour 'avoid' par plan_commitments_avoid_grain_check, et
    // cohérent pour 'do' — une orientation se lit sur une journée.
    evaluation_grain: "day",
    // anchor_kind='free' ne résout aucune occasion: slot_kind n'a rien à dire.
    slot_kind: null,
    scheduled_days: null,
    required_days_per_week: 7,
    expected_occasions_per_day: null,
    content_locale: ctx.contentLocale,
    student_instruction: rule.rationale,
    auto_generated: true,
    status: "active",
    provenance: "coach_educational",
    requires_clinician_signoff: false,
    source_span: null,
  } as const;

  if (rule.stance === "encouraged") {
    return {
      ...base,
      polarity: "do",
      measure: "portion",
      unit: "portion",
      // '>=' exige target_min et INTERDIT target_max.
      target_op: ">=",
      target_min: 1,
      target_max: null,
      priority: "secondary",
      autonomy: "flexible",
      flex_eligible: true,
      title: label,
      preview: { kind: "encourage", group: rule.food_group_ref, perDay: 1 },
    };
  }

  // 'discouraged' et 'excluded' partagent la forme; ils diffèrent par la
  // sévérité de méthode, et par elle seule.
  const shared = {
    ...base,
    polarity: "avoid",
    measure: "presence",
    unit: "none",
    // 'any' INTERDIT target_min et target_max. L'évaluateur ne lit pas le
    // target d'une ligne d'évitement — voir l'en-tête.
    target_op: "any",
    target_min: null,
    target_max: null,
    title: label,
  } as const;

  if (rule.stance === "discouraged") {
    return {
      ...shared,
      priority: "secondary",
      autonomy: "swap_within_policy",
      flex_eligible: true,
      preview: { kind: "discourage", group: rule.food_group_ref },
    };
  }

  return {
    ...shared,
    priority: "core",
    autonomy: "strict",
    flex_eligible: false,
    preview: { kind: "exclude", group: rule.food_group_ref },
  };
}

// ---------------------------------------------------------------------------
// LA COMPILATION D'UNE RÈGLE TEMPORELLE
// ---------------------------------------------------------------------------

/**
 * LA TABLE DE DÉRIVATION DES GABARITS.
 *
 *   gabarit               polarity        ancre                 grain      target
 *   --------------------  --------------  --------------------  ---------  --------------
 *   portions_per_period   at_least -> do  free                  day|week   '>=' min N
 *                         at_most  -> avd free                  day|week   '<=' max N
 *   group_every_meal      do              slot 'any_meal'       occasion   'any'
 *   no_group_after        avoid           window cutoff→23:59   day        'any'
 *   group_at_slot         do              slot <nommé>          occasion   'any'
 *
 * Deux pièges que le contrat rend fatals si on les manque:
 *
 *  1. `group_every_meal` vise `any_meal`, et `slot_kind='nominal'` INTERDIT
 *     `any_meal` (un créneau nominal doit être pré-semable à l'ouverture du
 *     jour, ce que « n'importe quel repas » n'est pas). D'où 'opportunistic'.
 *     `group_at_slot`, lui, nomme un vrai repas: 'nominal'.
 *
 *  2. `no_group_after` est un évitement, donc grain 'day' obligatoire — jamais
 *     'occasion'. Et son ancre est une FENÊTRE, la seule forme qui sache dire
 *     « à partir de telle heure ».
 */
export function compileTimingRule(
  rule: CoachTimingRule,
  ctx: { readonly coachId: string; readonly contentLocale: string; readonly terms: readonly CoachTerm[] },
): CompiledCommitment {
  const { label } = labelForGroup(rule.food_group_ref, ctx.terms);

  const base = {
    coach_id: ctx.coachId,
    template_commitment_key: commitmentKey(rule),
    activity_class: "nutrition",
    clock_local: null,
    tolerance_minutes: null,
    substance_ref: null,
    food_group_ref: rule.food_group_ref,
    evidence_kind: "self_report",
    evidence_required: false,
    auto_source: null,
    counts_toward_adherence: true,
    scheduled_days: null,
    content_locale: ctx.contentLocale,
    student_instruction: rule.rationale,
    auto_generated: true,
    status: "active",
    provenance: "coach_educational",
    requires_clinician_signoff: false,
    source_span: null,
    priority: "core",
    title: label,
  } as const;

  switch (rule.template) {
    case "portions_per_period": {
      const isFloor = rule.direction === "at_least";
      return {
        ...base,
        polarity: isFloor ? "do" : "avoid",
        anchor_kind: "free",
        slot_key: null,
        window_start_local: null,
        window_end_local: null,
        measure: "portion",
        unit: "portion",
        // '>=' exige min et interdit max; '<=' exige max et interdit min.
        target_op: isFloor ? ">=" : "<=",
        target_min: isFloor ? rule.portions : null,
        target_max: isFloor ? null : rule.portions,
        evaluation_grain: rule.period,
        slot_kind: null,
        // Le DÉNOMINATEUR n'a de sens qu'au grain jour: une règle hebdomadaire
        // se juge sur la semaine entière, pas sur un compte de jours.
        required_days_per_week: rule.period === "day" ? 7 : null,
        expected_occasions_per_day: null,
        autonomy: "swap_within_policy",
        flex_eligible: true,
        preview: {
          kind: "portions",
          group: rule.food_group_ref,
          direction: rule.direction,
          portions: rule.portions,
          period: rule.period,
        },
      };
    }

    case "group_every_meal":
      return {
        ...base,
        polarity: "do",
        anchor_kind: "slot",
        slot_key: "any_meal",
        window_start_local: null,
        window_end_local: null,
        measure: "presence",
        unit: "none",
        target_op: "any",
        target_min: null,
        target_max: null,
        evaluation_grain: "occasion",
        // 'nominal' interdirait 'any_meal' — voir le piège 1 de l'en-tête.
        slot_kind: "opportunistic",
        required_days_per_week: 7,
        expected_occasions_per_day: 3,
        autonomy: "swap_within_policy",
        flex_eligible: true,
        preview: { kind: "every_meal", group: rule.food_group_ref },
      };

    case "no_group_after":
      return {
        ...base,
        polarity: "avoid",
        anchor_kind: "window",
        slot_key: null,
        // La fenêtre INTERDITE court de l'heure de coupure à la fin du jour
        // calendaire. On ne l'étend pas au-delà de minuit: ce serait inventer
        // une frontière de journée que le coach n'a pas écrite.
        window_start_local: rule.cutoff_local,
        window_end_local: "23:59",
        measure: "presence",
        unit: "none",
        target_op: "any",
        target_min: null,
        target_max: null,
        // Évitement => 'day' obligatoire (piège 2).
        evaluation_grain: "day",
        slot_kind: null,
        required_days_per_week: 7,
        expected_occasions_per_day: null,
        // Une heure de coupure est une instruction précise: pas de substitution.
        autonomy: "strict",
        flex_eligible: false,
        preview: { kind: "not_after", group: rule.food_group_ref, cutoff: rule.cutoff_local },
      };

    case "group_at_slot":
      return {
        ...base,
        polarity: "do",
        anchor_kind: "slot",
        slot_key: rule.slot_key,
        window_start_local: null,
        window_end_local: null,
        measure: "presence",
        unit: "none",
        target_op: "any",
        target_min: null,
        target_max: null,
        evaluation_grain: "occasion",
        // Un repas nommé est pré-semable à l'ouverture du jour: 'nominal'.
        slot_kind: "nominal",
        required_days_per_week: 7,
        expected_occasions_per_day: 1,
        autonomy: "swap_within_policy",
        flex_eligible: true,
        preview: { kind: "at_slot", group: rule.food_group_ref, slot: rule.slot_key },
      };
  }
}

// ---------------------------------------------------------------------------
// LA COMPILATION COMPLÈTE
// ---------------------------------------------------------------------------

/**
 * Compile le protocole pour UN élève, en tenant compte de son objectif.
 *
 * `goal = null` (objectif non déclaré) ne fait pas échouer la compilation: il
 * ne retient que les lignes globales. Un protocole vide compile en zéro ligne
 * — ce n'est pas une erreur, c'est un coach qui n'a pas encore écrit sa
 * méthode, et l'écran doit savoir le dire sans planter.
 *
 * ORDRE DE SORTIE: stable et indépendant de l'ordre d'entrée (mapping d'abord,
 * puis règles temporelles, chacun trié par sa clé). Deux compilations du même
 * protocole rendent la même liste dans le même ordre — sans ça, un diff de
 * publication montrerait des mouvements fantômes à chaque enregistrement.
 */
export function compileProtocol(
  input: ProtocolInput,
  goal: GoalToken | null,
): readonly CompiledCommitment[] {
  const ctx = {
    coachId: input.coachId,
    contentLocale: input.contentLocale,
    terms: input.terms,
  };

  const food = input.foodRules
    .filter((r) => ruleAppliesTo(r.goal_scope, goal))
    .map((r) => compileFoodRule(r, ctx));

  const timing = input.timingRules
    .filter((r) => ruleAppliesTo(r.goal_scope, goal))
    .map((r) => compileTimingRule(r, ctx));

  const byKey = (a: CompiledCommitment, b: CompiledCommitment) =>
    a.template_commitment_key < b.template_commitment_key
      ? -1
      : a.template_commitment_key > b.template_commitment_key
      ? 1
      : 0;

  return [...food].sort(byKey).concat([...timing].sort(byKey));
}

// ---------------------------------------------------------------------------
// LE DIFF DE PUBLICATION
// ---------------------------------------------------------------------------

export interface ProtocolDiff {
  readonly added: readonly CompiledCommitment[];
  readonly removed: readonly string[];
  readonly changed: readonly { readonly key: string; readonly fields: readonly string[] }[];
}

/**
 * Ce qui change entre le protocole publié et le brouillon, en lignes.
 *
 * Publier à l'aveugle sur une cohorte est le geste le plus risqué de l'écran:
 * un coach de 200 élèves change ce que Sophia vérifie pour 200 personnes en un
 * clic. Il doit voir « 3 lignes ajoutées, 1 retirée » AVANT, pas découvrir
 * après. Le diff porte sur la compilation GLOBALE (goal = null n'a pas de sens
 * ici: on compare des méthodes, pas des élèves) — l'appelant compile les deux
 * côtés avec le même objectif et les compare.
 */
export function diffCompiled(
  before: readonly CompiledCommitment[],
  after: readonly CompiledCommitment[],
): ProtocolDiff {
  const beforeByKey = new Map(before.map((c) => [c.template_commitment_key, c]));
  const afterByKey = new Map(after.map((c) => [c.template_commitment_key, c]));

  const added = after.filter((c) => !beforeByKey.has(c.template_commitment_key));
  const removed = before
    .filter((c) => !afterByKey.has(c.template_commitment_key))
    .map((c) => c.template_commitment_key);

  // Les champs qui changent ce que l'ÉLÈVE reçoit. `preview` est un rendu, pas
  // une donnée: le lister ferait clignoter le diff sans qu'aucun élève ne voie
  // de différence.
  const WATCHED = [
    "polarity",
    "target_op",
    "target_min",
    "target_max",
    "evaluation_grain",
    "autonomy",
    "priority",
    "flex_eligible",
    "anchor_kind",
    "slot_key",
    "window_start_local",
    "window_end_local",
    "expected_occasions_per_day",
    "required_days_per_week",
    "title",
    "student_instruction",
  ] as const;

  const changed: { key: string; fields: string[] }[] = [];
  for (const [key, a] of afterByKey) {
    const b = beforeByKey.get(key);
    if (!b) continue;
    const av = a as unknown as Record<string, unknown>;
    const bv = b as unknown as Record<string, unknown>;
    const fields = WATCHED.filter((f) => av[f] !== bv[f]);
    if (fields.length > 0) changed.push({ key, fields: [...fields] });
  }
  changed.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));

  return { added, removed, changed };
}

// ---------------------------------------------------------------------------
// LE BLOC DE PROMPT — le mapping du coach, dit au générateur de repas
// ---------------------------------------------------------------------------
//
// POURQUOI CE RENDU EST ICI, DANS LE MODULE PUR
// ---------------------------------------------
// Le mapping d'aliments existait, était compilé, testé — et n'atteignait AUCUN
// consommateur au runtime. Un coach cochait trente pastilles et Sophia
// continuait de composer ses plats sans en rien savoir; sa méthode ne
// gouvernait que l'écran sur lequel il l'avait écrite.
//
// Le rendu vit à côté de la compilation pour la même raison que l'aperçu du
// coach appelle `compileProtocol` plutôt qu'une copie: deux formulations du
// même mapping divergent au premier changement, et c'est le coach qui découvre
// la divergence dans l'assiette d'un élève.
//
// ⚠️ CE BLOC N'EST PAS UN BLOC DE SÉCURITÉ, et le prompt le dit.
// Un `excluded` de coach est la sévérité maximale d'une MÉTHODE. Les allergies
// vivent dans `student_safety_constraints`, arrivent par un autre bloc, et sont
// vérifiées par un verrou déterministe que rien d'ici ne touche. Formuler un
// `excluded` comme un interdit vital apprendrait au modèle à confondre les deux
// registres — et à traiter une aversion de coach comme un risque vital, ou pire,
// l'inverse.

/** Rendu sans locale (R2): le slug quand le coach n'a pas posé son propre mot. */
function previewSentence(c: CompiledCommitment): string {
  const p = c.preview;
  const name = c.title;
  switch (p.kind) {
    case "encourage":
      return `${name} — build with it, at least ${p.perDay} portion a day`;
    case "discourage":
      return `${name} — he steers away from it; swap it out when you can`;
    case "exclude":
      return `${name} — he does not build with it at all`;
    case "portions":
      return `${name} — ${p.direction === "at_least" ? "at least" : "at most"} ${p.portions} portion${
        p.portions === 1 ? "" : "s"
      } per ${p.period}`;
    case "every_meal":
      return `${name} — at every meal`;
    case "not_after":
      return `${name} — not after ${p.cutoff}`;
    case "at_slot":
      return `${name} — at ${p.slot}`;
  }
}

/**
 * Le bloc `[COACH FOOD MAPPING]` à injecter, pour UN élève et UN objectif.
 *
 * Rend `""` quand le coach n'a rien coché: un en-tête sans rien dessous se lit
 * comme « ce coach a une méthode alimentaire, et elle est vide », ce qui est une
 * affirmation différente de « ce coach n'en a pas écrit ».
 *
 * DÉTERMINISTE: `compileProtocol` trie déjà sa sortie, et ce rendu n'ajoute
 * aucun tri qui dépendrait de l'ordre de lecture de la base.
 */
export function protocolFoodBlock(
  compiled: readonly CompiledCommitment[],
  coachDisplayName?: string | null,
): string {
  if (compiled.length === 0) return "";
  const who = (coachDisplayName ?? "").trim() || "the coach";

  const encouraged = compiled.filter((c) => c.preview.kind === "encourage");
  const discouraged = compiled.filter((c) => c.preview.kind === "discourage");
  const excluded = compiled.filter((c) => c.preview.kind === "exclude");
  const timing = compiled.filter((c) =>
    ["portions", "every_meal", "not_after", "at_slot"].includes(c.preview.kind)
  );

  const lines: string[] = [];
  lines.push(`== ${who.toUpperCase()}'S FOOD MAPPING — WHAT HE BUILDS PLATES WITH ==`);
  lines.push("");
  lines.push(
    "This is this coach's METHOD, not a medical restriction. The student's " +
      "hard constraints arrive separately and always win over anything here.",
  );

  const section = (header: string, items: readonly CompiledCommitment[]) => {
    if (items.length === 0) return;
    lines.push("");
    lines.push(header);
    for (const c of items) {
      // Le « pourquoi » du coach, quand il l'a écrit: c'est ce qui permet
      // d'EXPLIQUER au lieu d'asséner, exactement comme le rationale d'une
      // conviction.
      const why = String(c.student_instruction ?? "").trim();
      lines.push(why ? `- ${previewSentence(c)} (${why})` : `- ${previewSentence(c)}`);
    }
  };

  section("-- REACH FOR THESE FIRST --", encouraged);
  section(
    "-- HE STEERS AWAY FROM THESE — do not build a meal around one --",
    discouraged,
  );
  section(
    "-- HE DOES NOT USE THESE — never put one in a meal you propose --",
    excluded,
  );
  section("-- HIS RULES ON FREQUENCY AND TIMING --", timing);

  return lines.join("\n");
}
