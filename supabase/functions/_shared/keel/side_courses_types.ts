/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES À-CÔTÉS — LE VOCABULAIRE ET LES FORMES PARTAGÉES.
 * ⟳ 2026-09-23 — vague 0 du chantier « assiettes normales ».
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `~/.claude/plans/lexical-gliding-lamport.md`.
 * Audit à l'origine: `docs/keel/AUDIT-DOSAGES-2026-09-23.md` (§ C1, lot 1).
 *
 * ── LE DÉFAUT MESURÉ ──────────────────────────────────────────────────────
 * Un seul plat portait tout le repas. Christèle et Fabrice n'ont que trois
 * moments: leur déjeuner faisait 40 % de la journée, et le plat de Thomas
 * arrivait à 700 g par construction. Le propriétaire a décidé le 2026-09-23:
 * un petit à-côté (entrée, fromage, dessert, pain) à chaque déjeuner et
 * dîner, selon l'objectif de la personne.
 *
 * ── QUI FAIT QUOI ─────────────────────────────────────────────────────────
 * Le moteur décide le TYPE et les CALORIES; le modèle nomme l'ALIMENT, une
 * fois, sans grammes; le moteur calcule les GRAMMES. Un à-côté n'est jamais un
 * item de boîte: il vit à part, dans `dishes[i].side_courses[]`, pour que
 * « l'assiette = le plat » reste vrai chez tous les lecteurs de masse
 * (rabotage, borne d'assiette, règle « aucun terme neuf »…).
 *
 * ⛔ CE FICHIER NE PORTE AUCUNE LOGIQUE. Des types, des vocabulaires fermés et
 * des constantes — rien d'autre. Douze flux l'importent en parallèle: une
 * fonction ici serait un point de collision, et un cycle d'import le jour où
 * elle aurait besoin d'un module qui importe ce fichier.
 *
 * ⚠️ LE MOT « complement » EST DÉJÀ PRIS dans le code, dans un autre sens. Les
 * à-côtés s'appellent `side_courses` / `SideCourse*`, partout. À l'écran:
 * « Entrée / Fromage / Dessert / Pain ».
 *
 * ⚠️ `SidePotInput` (`starch_side.ts`) n'a RIEN à voir: c'est la casserole de
 * féculent servie à part DANS le plat. Un à-côté est hors du plat.
 */
import type { FoodGroupRef } from "./tokens.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LES VOCABULAIRES FERMÉS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LES QUATRE TYPES D'À-CÔTÉ. À l'écran: Entrée / Fromage / Dessert / Pain
 * (`household.mouth.side_courses.*`).
 */
export const SIDE_COURSE_KINDS = ["starter", "cheese", "dessert", "bread"] as const;
export type SideCourseKind = (typeof SIDE_COURSE_KINDS)[number];

/**
 * LES MOMENTS QUI PORTENT UN À-CÔTÉ: le déjeuner et le dîner, et eux seuls.
 * Un petit-déjeuner ou une collation n'en reçoit jamais.
 */
export const SIDE_COURSE_SLOTS = ["lunch", "dinner"] as const;
export type SideCourseSlot = (typeof SIDE_COURSE_SLOTS)[number];

/**
 * L'OBJECTIF TEL QUE LES À-CÔTÉS LE LISENT.
 *
 * ⚠️ QUATRE VALEURS, PAS LES SIX JETONS DE `student_goals.goal`. Un mineur est
 * `minor` quel que soit son objectif (aucun fromage par défaut, part maximale
 * plus basse). Une personne sans objectif, ou avec un objectif qui ne dit pas
 * le sens de la balance (`health`, `performance`, `recomposition`), est
 * `maintenance`. La réduction est faite par l'appelant, jamais ici.
 */
export const SIDE_COURSE_GOALS = ["fat_loss", "maintenance", "muscle_gain", "minor"] as const;
export type SideCourseGoal = (typeof SIDE_COURSE_GOALS)[number];

/**
 * D'OÙ VIENT L'ALIMENT D'UN À-CÔTÉ SERVI.
 *
 * `model`: le modèle l'a nommé et il a passé la validation.
 * `engine_fallback`: l'entrée du modèle manquait ou a été refusée; le moteur a
 * pris un aliment de `SIDE_COURSE_FALLBACK_SLUGS`, et c'est compté.
 * ⚠️ Rien à l'écran ne dit d'où vient un à-côté (décision du plan, flux I).
 */
export const SIDE_COURSE_SOURCES = ["model", "engine_fallback"] as const;
export type SideCourseSource = (typeof SIDE_COURSE_SOURCES)[number];

/**
 * POURQUOI UNE ENTRÉE `side_courses` DU MODÈLE EST REFUSÉE. Aucun refus muet:
 * chaque motif a son compteur dans `SideCourseModelCounters.refused_by`.
 */
export const SIDE_COURSE_REFUSALS = [
  /** `member_id` ne nomme aucune personne du foyer. */
  "unknown_member",
  /** Le moteur n'a demandé aucun à-côté de ce type à cette personne, ce jour, à ce moment. */
  "not_asked",
  /** Une seconde entrée pour la même personne, le même moment et le même type. */
  "duplicate",
  /** Le terme ne se résout pas dans le référentiel. */
  "unresolved",
  /** Le groupe du référentiel n'est pas admis pour ce type (`SIDE_COURSE_KIND_GROUPS`). */
  "wrong_kind",
  /** L'aliment tombe sous une exclusion de la personne (`SideTermJudge`). */
  "excluded",
  /** L'aliment contredit le régime de la personne (`SideTermJudge`). */
  "regime",
  /** Un second dessert laitier le même jour, ou le budget de laitages frais dépassé. */
  "dairy_budget",
  /** `preparation_id` ne nomme pas une préparation valable pour une entrée (soupe). */
  "bad_preparation",
] as const;
export type SideCourseRefusal = (typeof SIDE_COURSE_REFUSALS)[number];

// ═══════════════════════════════════════════════════════════════════════════
// ② LES FORMES — du réglage de la personne au JSON persisté
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE RÉGLAGE D'UNE PERSONNE, PAR TYPE, EN TROIS ÉTATS.
 *
 * Clé ABSENTE: le défaut de son objectif. `false`: jamais. `true`: voulu.
 * Les quatre à `false`: la personne refuse tout — l'énergie repart d'abord
 * vers ses collations, sinon le plat monte jusqu'au plafond de repli.
 *
 * ⚠️ PAS LES COLONNES `takes_*`: elles portaient l'ancien sens, inverse, et
 * leurs valeurs sont périmées (décision du 2026-09-23). Le réglage vit dans
 * `household_member_habits.slots[].side_courses` (flux H1).
 */
export type SideCoursePrefs = Readonly<Partial<Record<SideCourseKind, boolean>>>;

/** Un à-côté prévu avant tout arbitrage d'énergie: son type et ses calories de base. */
export interface SideCourseBase {
  kind: SideCourseKind;
  baseKcal: number;
}

/**
 * CE QUE LE BUDGET D'UN MOMENT REÇOIT (`sideBudgetFor`).
 *
 * `courses`: les à-côtés prévus, avec leurs calories de base
 *   (`SIDE_COURSE_BASE_KCAL`), dans l'ordre où le planificateur les a choisis.
 * `growKinds`: les types qui peuvent grossir, dans l'ordre où ils grossissent.
 *   `bread` en tête = le pain est AJOUTÉ d'abord s'il n'est pas déjà prévu.
 * `refused`: la personne refuse tout — aucun à-côté, le repas entier au plat.
 * `capShare`: la part maximale du repas que les à-côtés peuvent porter
 *   (`SIDE_COURSE_MAX_MEAL_SHARE`); `sideBudgetFor` la borne encore par l'âge.
 * `light`: le moment est « léger » — il garde UN seul à-côté, donc le pain
 *   n'est jamais ajouté en croissance.
 */
export interface SideCourseSlotInput {
  courses: readonly SideCourseBase[];
  growKinds: readonly SideCourseKind[];
  refused: boolean;
  capShare: number;
  light: boolean;
}

/** Un à-côté après arbitrage: ses calories, et une ESTIMATION prudente de ses protéines. */
export interface SideCourseAlloc {
  kind: SideCourseKind;
  kcal: number;
  /** `kcal × SIDE_COURSE_PROTEIN_EST_G_PER_100KCAL[kind] / 100`. Une estimation, avant l'aliment. */
  proteinEstG: number;
}

/**
 * LE BUDGET D'UN MOMENT — ce que rend `sideBudgetFor`.
 *
 * ⛔ INVARIANT: `sideKcal + dishKcal = mealKcal` (à 1e-9 près). L'énergie du
 * moment ne se perd ni ne se crée ici; elle se partage.
 */
export interface SideCourseBudget {
  courses: readonly SideCourseAlloc[];
  /** Σ des `courses[].kcal`. 0 quand la personne refuse. */
  sideKcal: number;
  /** Ce que la croissance a ajouté aux calories de base (pain ajouté + extensions). */
  grownKcal: number;
  /** Le plat seul: `mealKcal − sideKcal`. */
  dishKcal: number;
  /** Ce que le plat dépasse encore de `dishCapKcal` après croissance (≥ 0). */
  overflowKcal: number;
  /** Le plafond de part (`capShare`, borné par l'âge) a limité les à-côtés. */
  capped: boolean;
}

/**
 * CE QUE LE MOTEUR DEMANDE AU MODÈLE POUR UNE PERSONNE, UN JOUR, UN MOMENT.
 * Une ligne par (personne, jour, moment) qui porte au moins un à-côté.
 */
export interface SideCourseAsk {
  memberId: string;
  dayToken: string;
  slot: SideCourseSlot;
  /** L'indice du jour dans la fenêtre (0 = premier jour): il fait tourner les listes. */
  dayIndex: number;
  goal: SideCourseGoal;
  courses: readonly SideCourseAlloc[];
}

/**
 * UN À-CÔTÉ SERVI — validé ou complété par le moteur, avec ses grammes.
 *
 * `plannedKcal`: ce que le budget prévoyait; `kcal`: ce que les grammes
 * arrondis donnent. L'écart est rendu au plat (flux A, `snapDeltaKcal`).
 * `unitCount`: « 1 pomme », quand l'aliment se compte à l'unité; sinon `null`
 * et `grams` est arrondi aux 5 g.
 */
export interface SideCourseServed {
  memberId: string;
  dayToken: string;
  slot: SideCourseSlot;
  kind: SideCourseKind;
  term: string;
  /** Le slug du référentiel, ou `null` pour une préparation sans slug propre. */
  ref: string | null;
  /** L'identifiant de préparation d'une session (entrée préparée, soupe), sinon `null`. */
  preparationId: string | null;
  grams: number;
  unitCount: number | null;
  plannedKcal: number;
  kcal: number;
  /** `null` quand le référentiel ne donne pas la protéine de l'aliment. */
  proteinG: number | null;
  source: SideCourseSource;
}

/**
 * LES COMPTEURS DU MODÈLE — TOUS PRÉSENTS, MÊME À ZÉRO.
 *
 * ⛔ `refused_by` porte les neuf motifs, même à zéro: « aucun refus » et « le
 * comptage n'est pas branché » se relisent pareil sinon. Le type l'impose.
 * Contrôle d'acceptation du plan: `valid + filled_by_engine = asked`, et
 * `declared / asked ≥ 0,8`.
 */
export interface SideCourseModelCounters {
  /** Les à-côtés demandés au modèle (un par type, par personne, par moment). */
  asked: number;
  /** Les entrées que le modèle a rendues sous la clé `side_courses`. */
  declared: number;
  /** Les entrées du modèle retenues. */
  valid: number;
  /** Les entrées du modèle refusées (Σ de `refused_by`). */
  refused: number;
  refused_by: Record<SideCourseRefusal, number>;
  /** Les à-côtés demandés que le moteur a complétés par la liste de secours. */
  filled_by_engine: number;
  /** Les à-côtés demandés qui n'ont RIEN reçu, pas même un secours. */
  dropped: number;
}

/**
 * LE REGISTRE DES À-CÔTÉS D'UNE GÉNÉRATION, EN MÉMOIRE.
 *
 * ⚠️ LA CLÉ DE `byKey` EST `${memberId}|${dayToken}|${slot}` — trois morceaux,
 * séparés par `|`, dans cet ordre. Elle n'est PAS la clé `dayToken|slot` des
 * cases (`starchAsideCellsOf`), ni la clé `day/slot` de la grille.
 */
export interface SideCourseLedger {
  entries: readonly SideCourseServed[];
  byKey: ReadonlyMap<string, readonly SideCourseServed[]>;
  counters: SideCourseModelCounters;
}

/**
 * LA FORME PERSISTÉE: `write_payload.dishes[i].side_courses[]`.
 *
 * ⚠️ EN snake_case, comme le reste du payload. Pas de kcal ici: l'énergie se
 * relit depuis `ref` et `grams` (`meal-energy-v1`, flux F), comme pour les
 * items de boîte. Un plan sans à-côtés n'a pas la clé, et se lit comme avant.
 */
export interface DishSideCoursePayload {
  member_id: string;
  kind: SideCourseKind;
  term: string;
  ref: string | null;
  grams: number;
  unit_count: number | null;
  preparation_id: string | null;
  source: SideCourseSource;
}

/**
 * CE QUE LA RÉPARATION D'UN PLAN REÇOIT DU FOYER (flux G, `planRepairMessage`).
 * Quatre blocs de texte déjà rédigés pour la consigne.
 */
export interface RepairHouseholdContext {
  /** Les fiches des personnes. */
  cards: string;
  /** Les notes du foyer. */
  notes: string;
  /** La recette de référence (`standardRecipeBlock`, flux C). */
  standardRecipe: string;
  /** La répartition des à-côtés, telle que la consigne l'a donnée. */
  sideCourses: string;
}

/**
 * LE JUGE D'UN TERME D'À-CÔTÉ POUR UNE PERSONNE — exclusions et régime.
 *
 * Écrit par le flux G (`judgeSideTerm`), injecté dans le flux A. ⛔ Il
 * réutilise les résolveurs existants (`dishBitesExclusion`, `biteFor`): jamais
 * de matcher de texte maison (« laitue » ≠ « lait »).
 */
export type SideTermJudge = (args: {
  memberId: string;
  term: string;
  ref: string | null;
}) => { ok: true } | { ok: false; reason: "excluded" | "regime" };

// ═══════════════════════════════════════════════════════════════════════════
// ③ LES CONSTANTES — valeurs décidées le 2026-09-23
// ═══════════════════════════════════════════════════════════════════════════
// ⛔ Chacune est épinglée par un `assertEquals` littéral dans
// `side_courses_types_test.ts`. La changer doit faire rougir ce test.

/**
 * LES CALORIES DE BASE D'UN À-CÔTÉ, PAR OBJECTIF ET PAR TYPE.
 *
 * Perte: petites entrées et desserts de fruit ou de laitage nature.
 * Prise: fromage et dessert denses, le pain d'abord pour grossir.
 * Mineur: dessert, jamais de fromage par défaut.
 *
 * ⟳ 2026-09-23 (v40) — ⚠️ LA CONSIGNE NE DEMANDE PLUS DE DESSERT DENSE: la
 * prise a le fruit ou le laitage nature de la table. Ses 180 kcal de dessert
 * ne sont donc presque jamais servies (une pomme: 71,4; une banane: 108,6);
 * le manque passe au pain puis au fromage déjà servis
 * (`SIDE_COURSE_REGROW_ORDER`, `side_courses.ts`), le reste au plat.
 */
export const SIDE_COURSE_BASE_KCAL: Readonly<
  Record<SideCourseGoal, Readonly<Record<SideCourseKind, number>>>
> = Object.freeze({
  fat_loss: Object.freeze({ starter: 60, cheese: 70, dessert: 80, bread: 70 }),
  maintenance: Object.freeze({ starter: 60, cheese: 110, dessert: 110, bread: 100 }),
  muscle_gain: Object.freeze({ starter: 80, cheese: 130, dessert: 180, bread: 160 }),
  minor: Object.freeze({ starter: 40, cheese: 80, dessert: 90, bread: 80 }),
});

/** LE PLAFOND D'UN À-CÔTÉ, PAR TYPE, APRÈS CROISSANCE (kcal). */
export const SIDE_COURSE_KIND_MAX_KCAL: Readonly<Record<SideCourseKind, number>> = Object.freeze({
  starter: 120,
  cheese: 160,
  dessert: 250,
  bread: 200,
});

/**
 * LA PART MAXIMALE DU REPAS QUE LES À-CÔTÉS PORTENT ENSEMBLE.
 *
 * ⚠️ Au-delà, ce n'est plus un à-côté: c'est un second plat. La grille
 * d'acceptation refuse toute part au-dessus de 45 % (30 % pour un enfant);
 * ces plafonds laissent la marge de l'arrondi des grammes.
 */
export const SIDE_COURSE_MAX_MEAL_SHARE: Readonly<Record<"adult" | "minor", number>> = Object
  .freeze({
    adult: 0.35,
    minor: 0.25,
  });

/**
 * LE PLUS PETIT PAIN QU'ON AJOUTE EN CROISSANCE (kcal).
 *
 * ⚠️ Il ne vaut QUE pour l'ajout du pain: sous 50 kcal (≈ 18 g), un pain posé
 * sur la table est un bout de croûte. La croissance passe alors par les
 * à-côtés déjà prévus.
 */
export const SIDE_COURSE_MIN_ADDED_KCAL = 50;

/**
 * L'ESTIMATION PRUDENTE DES PROTÉINES D'UN À-CÔTÉ, AVANT QUE L'ALIMENT SOIT
 * CONNU (g pour 100 kcal).
 *
 * ⚠️ PRUDENTE = DU CÔTÉ BAS. Elle entre dans le reste de protéines de la
 * journée avant le modèle; la surestimer ferait passer un plancher qui n'est
 * pas tenu. Les protéines SERVIES, elles, se relisent sur l'aliment (flux F).
 * Lu en base le 2026-09-23, en g pour 100 kcal: pain ≈ 3,0 (`bread`);
 * fromage 5,3 (feta) à 7,7 (parmesan), cheddar 6,0; entrée 1,5 (carotte) à
 * 4,7 (tomate); dessert 0,6 (pomme) à 17,5 (skyr) — le fruit gagne, parce
 * qu'un dessert sur deux en est un.
 */
export const SIDE_COURSE_PROTEIN_EST_G_PER_100KCAL: Readonly<Record<SideCourseKind, number>> =
  Object.freeze({
    starter: 2.5,
    cheese: 6,
    dessert: 1,
    bread: 3,
  });

/**
 * LES GRAMMES ADMIS PAR TYPE, APRÈS CALCUL.
 *
 * ⚠️ Une borne atteinte ne crée ni ne perd d'énergie: l'écart entre les
 * calories prévues et celles des grammes bornés est rendu au plat (flux A,
 * `snapDeltaKcal`). Une tomate plafonnée à 250 g ne porte que ≈ 48 kcal.
 */
export const SIDE_COURSE_GRAMS_BOUNDS: Readonly<
  Record<SideCourseKind, Readonly<{ min: number; max: number }>>
> = Object.freeze({
  starter: Object.freeze({ min: 80, max: 250 }),
  cheese: Object.freeze({ min: 15, max: 50 }),
  dessert: Object.freeze({ min: 80, max: 300 }),
  bread: Object.freeze({ min: 20, max: 100 }),
});

/** AU PLUS DEUX UNITÉS D'UN ALIMENT COMPTÉ À LA PIÈCE (« 2 kiwis », jamais 3). */
export const SIDE_COURSE_MAX_UNITS = 2;

/**
 * ⟳ 2026-09-23 — UN GROS FRUIT AU PLUS PAR DESSERT. À partir de ce poids à
 * l'unité (g), un dessert compté porte UNE unité, jamais deux.
 *
 * Mesuré sur la campagne du 2026-09-23: Thomas (prise) avait « 2 pommes » à
 * 10 repas sur 10. Ce n'était pas le modèle: 180 kcal de dessert ÷ 71,4 kcal
 * la pomme de 150 g, arrondi à 2 par le moteur. Pomme, poire, orange (150 g),
 * banane (120 g): une seule. Ce qui n'est pas servi repart au plat
 * (`snapDeltaKcal`).
 *
 * ⚠️ LE POIDS DE L'UNITÉ, PAS LE GROUPE: les fruits secs (dattes, abricots
 * secs) sont rangés `other_fruit`, comme la pomme (lu en base le 2026-09-23).
 * ⚠️ LE DESSERT SEUL: deux tomates en entrée ou deux tranches de pain restent
 * des parts normales.
 */
export const SIDE_COURSE_DESSERT_ONE_UNIT_FROM_G = 100;

/**
 * ⟳ 2026-09-23 — SOUS CE POIDS À L'UNITÉ (g), UN DESSERT SE PÈSE: il ne se
 * compte jamais. Une datte ou un pruneau pèse 8 g; « au plus 2 unités »
 * servait 16 g de dattes pour 180 kcal prévues. Entre ce seuil et
 * `SIDE_COURSE_DESSERT_ONE_UNIT_FROM_G` (clémentine, kiwi: 80 g), la règle
 * d'avant tient: au plus `SIDE_COURSE_MAX_UNITS`.
 */
export const SIDE_COURSE_DESSERT_COUNTED_FROM_G = 50;

/**
 * ⟳ 2026-09-23 — LE DESSERT DENSE: au-dessus de cette densité (kcal pour
 * 100 g, strictement), la borne basse d'un dessert est
 * `SIDE_COURSE_DENSE_DESSERT_MIN_G`, et non celle de `SIDE_COURSE_GRAMS_BOUNDS`.
 *
 * Avant: 80 g d'amandes (599,9 kcal/100 g) font 480 kcal, au-dessus du plafond
 * de 250. Oléagineux, fruits secs et chocolat noir étaient refusés
 * `wrong_kind` par la seule borne basse, pour tout le monde.
 */
export const SIDE_COURSE_DENSE_DESSERT_ABOVE_KCAL_PER_100G = 200;

/** ⟳ 2026-09-23 — LA BORNE BASSE D'UN DESSERT DENSE (g). 15 g d'amandes ≈ 90 kcal. */
export const SIDE_COURSE_DENSE_DESSERT_MIN_G = 15;

/**
 * ⟳ 2026-09-23 — LES GROUPES OÙ UN DESSERT PEUT ÊTRE DENSE.
 *
 * ⛔ PAS `dairy_yogurt`. Ce groupe porte `cheesecake` (330 kcal/100 g), et
 * c'est la borne basse de 80 g qui le refuse (264 kcal > 250). L'abaisser à
 * 15 g servirait un cheesecake à une personne en perte, dont les groupes
 * admettent les laitages. Un laitage nature reste sous 200 kcal/100 g: rien de
 * juste n'est perdu.
 *
 * ⚠️ CETTE LISTE N'OUVRE AUCUN GROUPE: elle abaisse une borne. Les amandes
 * (`nuts_seeds`) restent refusées `wrong_kind` pour une personne en perte, par
 * `SIDE_COURSE_KIND_GROUPS`.
 */
export const SIDE_COURSE_DENSE_DESSERT_GROUPS = [
  "berries",
  "citrus",
  "other_fruit",
  "nuts_seeds",
  "sugar_sweets",
] as const satisfies readonly FoodGroupRef[];

// ═══════════════════════════════════════════════════════════════════════════
// ④ LES GROUPES ADMIS ET LA LISTE DE SECOURS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LES GROUPES DU RÉFÉRENTIEL ADMIS PAR TYPE ET PAR OBJECTIF.
 *
 * Un aliment nommé par le modèle n'est retenu que si son `food_group_ref`
 * figure ici (sinon refus `wrong_kind`). C'est une condition NÉCESSAIRE, pas
 * suffisante — le groupe `dairy_yogurt` porte aussi `cheesecake` (330 kcal),
 * et les groupes de céréales portent le riz et les pâtes à côté des pains
 * (lu en base le 2026-09-23). Le reste de la validation est au flux A.
 *
 * Entrée: les légumes, crus ou en soupe — jamais un féculent (l'à-côté ne doit
 *   pas rendre au plat ce que le plan lui retire).
 * Fromage: `dairy_cheese` seul. Un mineur n'en reçoit pas par défaut, mais un
 *   réglage `true` l'ouvre: le groupe reste donc admis.
 * Dessert: fruits et laitages; + oléagineux en maintien et en prise; + sucré
 *   en prise seulement.
 * Pain: les deux groupes où le référentiel range ses pains (vérifié en base le
 *   2026-09-23: `refined_grain` et `whole_grain`).
 *
 * `satisfies` et pas une annotation élargie: un groupe inventé ne compile pas.
 */
const STARTER_GROUPS = [
  "non_starchy_veg",
  "leafy_greens",
  "cruciferous_veg",
] as const satisfies readonly FoodGroupRef[];
const CHEESE_GROUPS = ["dairy_cheese"] as const satisfies readonly FoodGroupRef[];
const DESSERT_PLAIN_GROUPS = [
  "berries",
  "citrus",
  "other_fruit",
  "dairy_yogurt",
] as const satisfies readonly FoodGroupRef[];
const BREAD_GROUPS = ["refined_grain", "whole_grain"] as const satisfies readonly FoodGroupRef[];

export const SIDE_COURSE_KIND_GROUPS: Readonly<
  Record<SideCourseKind, Readonly<Record<SideCourseGoal, readonly FoodGroupRef[]>>>
> = Object.freeze({
  starter: Object.freeze({
    fat_loss: STARTER_GROUPS,
    maintenance: STARTER_GROUPS,
    muscle_gain: STARTER_GROUPS,
    minor: STARTER_GROUPS,
  }),
  cheese: Object.freeze({
    fat_loss: CHEESE_GROUPS,
    maintenance: CHEESE_GROUPS,
    muscle_gain: CHEESE_GROUPS,
    minor: CHEESE_GROUPS,
  }),
  dessert: Object.freeze({
    fat_loss: DESSERT_PLAIN_GROUPS,
    maintenance: [...DESSERT_PLAIN_GROUPS, "nuts_seeds"] as const,
    muscle_gain: [...DESSERT_PLAIN_GROUPS, "nuts_seeds", "sugar_sweets"] as const,
    minor: DESSERT_PLAIN_GROUPS,
  }),
  bread: Object.freeze({
    fat_loss: BREAD_GROUPS,
    maintenance: BREAD_GROUPS,
    muscle_gain: BREAD_GROUPS,
    minor: BREAD_GROUPS,
  }),
});

/**
 * LA LISTE DE SECOURS — les aliments que le moteur sert quand l'entrée du
 * modèle manque ou est refusée. Elle tourne sur les jours (flux A).
 *
 * ⛔ UNIQUEMENT DES SLUGS VÉRIFIÉS: lus en base le 2026-09-23 (lecture SQL de
 * `food_composition_refs` et `food_composition_aliases`), OU écrits par la
 * migration `20260923110000_le_referentiel_des_a_cotes.sql` sur la table
 * CIQUAL 2025 (`scratchpad/a-cotes/donnees.md`). Pour chacun: le slug existe,
 * son libellé et son code CIQUAL désignent bien l'aliment, son groupe est
 * admis pour le type, et il passe `isComposable` (`food_reference_manifest.ts`)
 * — une référence `a_verifier` est refusée à la composition d'une génération
 * neuve, donc un secours qui en serait une serait refusé à son tour. Le test
 * recopie EN DUR le groupe de chacun, et relit la migration pour les slugs
 * qu'elle crée ou corrige.
 *
 * ⟳ 2026-09-23 (vague 2) — LA LISTE DE `donnees.md` §6, arbitrage n° 7:
 *   · FROMAGE PAR OBJECTIF. Perte: les moins denses, pour une part visible
 *     dans la borne de 15 à 50 g (70 kcal = 25 g de camembert, 36 g de
 *     chèvre frais, contre 17 g de comté). Prise: les plus riches en
 *     protéines (comté 27,8 g, emmental 27,9 g pour 100 g). Le chèvre frais
 *     n'est ni en maintien ni en prise: sa base y demanderait 57 et 67 g,
 *     au-delà de la borne de 50 g;
 *   · LA POIRE REVIENT (CIQUAL 2025, 13037, `verifie`), dans chaque objectif;
 *   · LE FROMAGE DU MINEUR N'EST SERVI QUE QUAND LE RÉGLAGE LE FORCE
 *     (`cheese: true`): ni sa rotation ni l'ordre de son objectif
 *     (`SIDE_COURSE_GOAL_ORDER`, flux A) ne portent de fromage. Sa liste ne sert
 *     donc qu'à ce cas — et sans elle, un fromage forcé que le modèle ne nomme
 *     pas était perdu (`dropped`), et une exclusion « pas de fromage le soir »
 *     ne rendait pas le fromage du mineur impossible.
 *
 * ⛔ CETTE LISTE DÉPEND DE LA MIGRATION 20260923110000. Avant elle, `comte`,
 * `emmental`, `camembert`, `brie`, `fresh_goat_cheese`, `cantal` et `gouda`
 * n'existent pas (`servableRef` les saute), `pear` est `a_verifier` (sautée),
 * et `goat_cheese` porte les valeurs de la VIANDE de chevreau (103 kcal): la
 * migration et ce fichier partent ensemble.
 *
 * ⚠️ CE QUI N'Y EST PAS, EXPRÈS:
 *   · `radish` — porte les valeurs du radis NOIR (29 kcal contre ≈ 15);
 *   · `white_bread` — « Pain de mie, au son », pas du pain blanc;
 *   · `wholemeal_bread` — « Pain de mie, complet »; le pain complet est
 *     `bread_wholemeal_integral_bread`;
 *   · `emmental_rape` — du fromage RÂPÉ, un ingrédient, pas un fromage servi;
 *   · `greek_yogurt` — un yaourt à la grecque ENTIER (9 g de lipides);
 *   · `cheddar`, `parmesan` — sortis au profit des fromages français que la
 *     migration ajoute; ils restent au référentiel pour le modèle.
 *
 * ORDRE DES DESSERTS: un fruit, puis un laitage, en alternance — deux
 * laitages ne se suivent jamais, pour qu'une rotation par moment ne serve pas
 * deux desserts laitiers le même jour.
 */
export const SIDE_COURSE_FALLBACK_SLUGS: Readonly<
  Record<SideCourseKind, Readonly<Record<SideCourseGoal, readonly string[]>>>
> = Object.freeze({
  starter: Object.freeze({
    fat_loss: ["carrot", "tomato", "cucumber"],
    maintenance: ["carrot", "tomato", "cucumber"],
    muscle_gain: ["carrot", "tomato", "cucumber"],
    minor: ["carrot", "tomato", "cucumber"],
  }),
  cheese: Object.freeze({
    fat_loss: ["camembert", "fresh_goat_cheese", "emmental", "feta"],
    maintenance: ["comte", "camembert", "goat_cheese", "emmental", "brie"],
    muscle_gain: ["comte", "emmental", "cantal", "gouda"],
    minor: ["camembert", "emmental", "comte"],
  }),
  dessert: Object.freeze({
    fat_loss: [
      "apple",
      "plain_yogurt",
      "pear",
      "fromage_blanc",
      "orange",
      "skyr",
      "kiwi",
      "clementine",
    ],
    maintenance: [
      "apple",
      "plain_yogurt",
      "pear",
      "fromage_blanc",
      "banana",
      "skyr",
      "kiwi",
      "apple_compote_reduced_sugar",
    ],
    muscle_gain: [
      "banana",
      "fromage_blanc",
      "pear",
      "skyr",
      "apple",
      "plain_yogurt",
      "apple_compote_reduced_sugar",
    ],
    minor: [
      "apple",
      "plain_yogurt",
      "pear",
      "fromage_blanc",
      "clementine",
      "apple_compote_reduced_sugar",
    ],
  }),
  bread: Object.freeze({
    fat_loss: ["bread_wholemeal_integral_bread", "rye_bread", "country_style_bread_french"],
    maintenance: [
      "bread_wholemeal_integral_bread",
      "bread_french_bread_baguette",
      "country_style_bread_french",
      "rye_bread",
    ],
    muscle_gain: [
      "bread_french_bread_baguette",
      "bread_wholemeal_integral_bread",
      "country_style_bread_french",
      "rye_bread",
    ],
    minor: [
      "bread_french_bread_baguette",
      "bread_wholemeal_integral_bread",
      "country_style_bread_french",
    ],
  }),
});

/**
 * LE MOT À L'ÉCRAN D'UN ALIMENT DE SECOURS, PAR LANGUE DU PLAN.
 *
 * ⛔ LE LIBELLÉ DU RÉFÉRENTIEL N'EST PAS UN MOT D'ÉCRAN: il est en anglais
 * (« Apple », « Bread, French bread, baguette », « Comté cheese »). Un secours
 * servi dans un plan français afficherait « 1 × Apple ». Le terme persisté
 * (`DishSideCoursePayload.term`) vient donc d'ici, et le slug voyage à côté
 * (`ref`): c'est le slug qui pèse, jamais le mot.
 *
 * Relu par le résolveur le 2026-09-23 (`resolveCompositionLine`, index de la
 * langue; après la migration 20260923110000 pour les fromages, la poire et le
 * pain de campagne, `donnees.md` §5): chaque terme retombe sur SON slug, SAUF
 * trois, et c'est sans effet parce que `ref` gagne toujours sur le terme:
 *   · « pain complet » / « wholemeal bread » → `wholemeal_bread` (pain de mie);
 *   · « unsweetened apple compote » → aucun slug.
 * ⟳ 2026-09-23 (v40) — « `ref` gagne toujours » ne vaut plus que pour le
 * SECOURS (le moteur pose le slug sans résoudre le mot). Pour une entrée du
 * MODÈLE, le terme prend la main quand il désigne un aliment admis
 * (`refNamedByTerm`, `side_courses.ts`): « pain complet » écrit avec
 * `ref: "bread_wholemeal_integral_bread"` est servi `wholemeal_bread`.
 *
 * ⚠️ FERMÉE SUR LA LISTE DE SECOURS: une clé par slug de
 * `SIDE_COURSE_FALLBACK_SLUGS`, ni plus ni moins (le test le vérifie).
 */
export const SIDE_COURSE_FALLBACK_TERMS: Readonly<
  Record<string, Readonly<{ fr: string; en: string }>>
> = Object.freeze({
  carrot: Object.freeze({ fr: "carottes râpées", en: "grated carrots" }),
  tomato: Object.freeze({ fr: "tomate", en: "tomato" }),
  cucumber: Object.freeze({ fr: "concombre", en: "cucumber" }),
  camembert: Object.freeze({ fr: "camembert", en: "camembert" }),
  fresh_goat_cheese: Object.freeze({ fr: "chèvre frais", en: "fresh goat cheese" }),
  emmental: Object.freeze({ fr: "emmental", en: "emmental" }),
  feta: Object.freeze({ fr: "feta", en: "feta" }),
  comte: Object.freeze({ fr: "comté", en: "comté" }),
  goat_cheese: Object.freeze({ fr: "fromage de chèvre", en: "goat cheese" }),
  brie: Object.freeze({ fr: "brie", en: "brie" }),
  cantal: Object.freeze({ fr: "cantal", en: "cantal" }),
  gouda: Object.freeze({ fr: "gouda", en: "gouda" }),
  apple: Object.freeze({ fr: "pomme", en: "apple" }),
  pear: Object.freeze({ fr: "poire", en: "pear" }),
  orange: Object.freeze({ fr: "orange", en: "orange" }),
  clementine: Object.freeze({ fr: "clémentine", en: "clementine" }),
  kiwi: Object.freeze({ fr: "kiwi", en: "kiwi" }),
  banana: Object.freeze({ fr: "banane", en: "banana" }),
  apple_compote_reduced_sugar: Object.freeze({
    fr: "compote de pommes sans sucre",
    en: "unsweetened apple compote",
  }),
  plain_yogurt: Object.freeze({ fr: "yaourt nature", en: "plain yoghurt" }),
  fromage_blanc: Object.freeze({ fr: "fromage blanc", en: "fromage blanc" }),
  skyr: Object.freeze({ fr: "skyr", en: "skyr" }),
  bread_wholemeal_integral_bread: Object.freeze({ fr: "pain complet", en: "wholemeal bread" }),
  rye_bread: Object.freeze({ fr: "pain de seigle", en: "rye bread" }),
  country_style_bread_french: Object.freeze({ fr: "pain de campagne", en: "country bread" }),
  bread_french_bread_baguette: Object.freeze({ fr: "baguette", en: "baguette" }),
});
