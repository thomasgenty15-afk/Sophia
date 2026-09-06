/**
 * ══════════════════════════════════════════════════════════════════════════
 * KEEL — LA GARDE FINALE DU PLAN. Une seule passe, sur ce qui est ÉCRIT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QUE CE MODULE FERME, MESURÉ SUR LES PLANS DE PRODUCTION ─────
 * Le générateur de foyer REFUSE (422) ~2 500 lignes AVANT d'écrire le plan.
 * Tout ce qui se passe APRÈS cette garde — pliage des boîtes, ceinture des
 * exclusions, densification, rattrapage des bouches, vagues de courses —
 * MUTE le plan et ne repasse par aucune vérification. Le plan persisté n'est
 * donc pas celui qui a été validé, et quatre défauts l'ont prouvé :
 *
 *   ① une préparation cuisinée JEUDI, mangée MERCREDI ;
 *   ② une ligne de courses de poisson achetée LUNDI, cuisinée JEUDI, sans
 *     aucun drapeau de congélation — trois jours de chair crue au frigo ;
 *   ③ une exclusion de TABLE servie quand même, la violation n'étant listée
 *     que dans `issues` — un tableau que personne ne relit ;
 *   ④ un plan écrit avec ZÉRO boîte là où huit étaient attendues.
 *
 * Aucun des quatre n'était un mensonge du modèle : le modèle avait rendu un
 * plan cohérent, et c'est la chaîne d'APRÈS qui l'a défait.
 *
 * ── CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS ──────────────────────────
 * Il est UNE passe PURE sur le payload EXACTEMENT tel qu'il part en base
 * (snake_case, pas la forme mémoire `GeneratedMeal`), appelable DEUX fois :
 *
 *   · à la composition, juste avant l'écriture ;
 *   · à l'ADOPTION, plus tard, quand aucun appel modèle n'a lieu — c'est le
 *     chemin qui n'a JAMAIS eu de garde, et c'est pour lui que ce module est
 *     typé sur la forme persistée plutôt que sur la forme mémoire.
 *
 * Il ne compose rien, ne relance rien, n'écrit rien. Il RÉPOND, et il PROPOSE
 * des réparations que l'appelant applique s'il le veut.
 *
 * ── LES DÉNOMINATEURS SONT LA MOITIÉ DU RÉSULTAT ─────────────────────────
 * ⛔ UNE CAUSE À ZÉRO DONT LE DÉNOMINATEUR EST À ZÉRO NE VEUT PAS DIRE
 * « PROPRE » : elle veut dire « JAMAIS ÉVALUÉE ». C'est la cicatrice n° 1 de
 * ce dépôt — « un lot désarmé ressemble trait pour trait à un lot qui
 * marche ». `counters.checked` porte les douze dénominateurs pour que la
 * différence se LISE, et le premier test de ce module est la CASE QUI PASSE :
 * zéro refus ET douze dénominateurs strictement positifs. Une garde qui refuse
 * tout ressemble aussi à une garde qui marche.
 *
 * ── L'ÉNERGIE SERVIE : ON MESURE, ON NE MORD PAS ─────────────────────────
 * Le moteur a CESSÉ de redimensionner les portions : l'ancre des bouches, la
 * densification des boîtes et les deux passes de croissance des casseroles
 * sont devenues des MESURES, et les grammes servis sont exactement ceux que le
 * modèle a composés — on arrête de rattraper après coup une composition
 * fausse, on fait en sorte que la composition tombe juste. Le prix de cette
 * décision est connu et CHIFFRÉ : un plan ne nourrit que 65 à 72 % de sa
 * propre enveloppe énergétique, même dans le cas SANS contrainte, et c'est le
 * redimensionnement d'après-coup qui cachait ce trou. Le retirer rend l'écart
 * réel — et un écart réel que personne ne mesure, c'est un faux chiffre
 * remplacé par du silence.
 *
 * `mouth_energy_short` dit cet écart, et rien de plus. ⛔ CE MODULE NE
 * RECALCULE PAS LES KILOCALORIES : elles demandent l'index de composition, qui
 * n'est PAS dans le payload persisté. L'appelant MESURE (`ctx.energy`), la
 * garde COMPARE et RAPPORTE. Et elle COMPTE au lieu de refuser dans les TROIS
 * politiques : sous-nourrir est une question de QUALITÉ DE COMPOSITION, pas une
 * incohérence du plan, et refuser un plan pour ça priverait des gens de dîner
 * sur un seuil que personne n'a encore calibré.
 *
 * ── LA SÉVÉRITÉ N'EST PAS DANS LE MODULE, ELLE EST DANS LA POLITIQUE ─────
 * Trois politiques livrées (`LOT_1` compte tout, `LOT_2` refuse le noyau,
 * `LOT_3` y ajoute les courses). Le déploiement se fait en changeant la
 * politique, jamais le code de la garde — c'est ce qui permet de MESURER un
 * lot avant de le laisser mordre.
 *
 * ── LE RISQUE DE PRÉCISION, ÉCRIT ICI ────────────────────────────────────
 * `title_promises_missing_preparation` est la seule règle qui lit de la PROSE.
 * On ne peut pas savoir quelle préparation a été retirée, donc on ne peut pas
 * comparer un titre à une absence : la règle se réduit à un VOCABULAIRE FERMÉ
 * de promesses de cuisine par lots (« une portion du batch », « préparé
 * dimanche »…) sur un plat qui ne CITE aucune préparation. Elle est étroite
 * exprès : un faux positif y coûte une phrase effacée, jamais une assiette.
 * Toutes les autres règles lisent des `term` DÉCLARÉS
 * (`dishBitesExclusion(..., surface: "ingredients")`), jamais la prose —
 * un faux positif sur la prose coûterait un plan entier.
 *
 * PURE MODULE: no I/O, no clock, no randomness, and it NEVER mutates its
 * input (épinglé par `structuredClone` côté test).
 */

import {
  cookedWindowVerdict,
  type KeptWhere,
  keptWindowDays,
  rawWindowDaysFor,
} from "./fridge_window.ts";
import {
  type DeliveredDish,
  type DeliveredMouth,
  mealsDelivered,
} from "./meals_delivered.ts";
import { dishBitesExclusion } from "./food_exclusion_belt.ts";
import type { ForbiddenTerm } from "./forbidden_matcher.ts";
import {
  type DeclaredFood,
  type DietaryRegime,
  scanDietaryRegime,
} from "./dietary_regime.ts";
import { applyHouseRuleLock } from "./household_restriction_lock.ts";
import { PERISHABLE_AISLES } from "./grocery_waves.ts";
import { normalizePantryTerm } from "./meal_generation.ts";
import { addDays } from "./meal_plan_window.ts";
import { FOOD_GROUP_REFS, type FoodGroupRef } from "./tokens.ts";

// ---------------------------------------------------------------------------
// ① LA FORME PERSISTÉE — snake_case, telle qu'elle part en base
// ---------------------------------------------------------------------------

/**
 * ⚠️ CES TYPES DÉCRIVENT LE PAYLOAD ÉCRIT, PAS `GeneratedMeal`. C'est la seule
 * forme que le chemin d'ADOPTION voit — il relit une ligne de base, il n'a
 * jamais eu d'objet mémoire. Les typer sur la forme mémoire aurait rendu ce
 * module inappelable là où il manque le plus.
 */
export interface GateIngredient {
  readonly term: string;
  /** Le groupe déclaré par le modèle. `null` = rien de déclaré, ou hors liste. */
  readonly group?: string | null;
  readonly in_pantry?: boolean | null;
}

export interface GateUse {
  readonly preparation_id: string;
  readonly servings?: number | null;
  /** `"fridge"` | `"freezer"`. Absent ⇒ frigo, le strict. */
  readonly kept?: string | null;
}

export interface GateBoxItem {
  readonly preparation_id?: string | null;
  readonly term: string;
  readonly grams?: number | null;
}

export interface GateBox {
  readonly id: string;
  readonly member_ids: readonly string[];
  readonly items: readonly GateBoxItem[];
}

export interface GateDish {
  readonly title: string;
  readonly name?: string | null;
  readonly day: string | null;
  readonly slot: string | null;
  readonly method?: string | null;
  readonly why?: string | null;
  /** La bouche à qui ce plat est dédié. `null` = plat de la table. */
  readonly member_id?: string | null;
  readonly ingredients: readonly GateIngredient[];
  readonly uses: readonly GateUse[];
  readonly boxes: readonly GateBox[];
}

export interface GatePreparation {
  readonly id: string;
  readonly title: string;
  readonly method?: string | null;
  readonly cook_on: string | null;
  readonly ingredients: readonly GateIngredient[];
}

export interface GateSession {
  readonly day: string | null;
  readonly preparation_ids: readonly string[];
}

export interface GateShoppingLine {
  readonly term: string;
  readonly aisle?: string | null;
  readonly food_group?: string | null;
  readonly buy_on?: string | null;
  readonly freeze_on_purchase?: boolean | null;
}

export interface GatePlan {
  readonly dishes: readonly GateDish[];
  readonly preparations: readonly GatePreparation[];
  readonly cooking_sessions: readonly GateSession[];
  readonly shopping_list: readonly GateShoppingLine[];
}

// ---------------------------------------------------------------------------
// ② LE CONTEXTE — tout ce que le plan ne porte pas lui-même
// ---------------------------------------------------------------------------

/**
 * ⛔ AUCUN PARAMÈTRE OPTIONNEL ICI, et c'est une règle du dépôt :
 * « un paramètre de garde optionnel est une garde désarmée ». `hasFreezer`,
 * `maxFridgeDays`, `boxContract` sont REQUIS — un appelant qui ne les a pas
 * lus passe `false`, la constante, ou `null`, il ne les hérite pas d'un défaut
 * silencieux.
 */
export interface GateContext {
  readonly lane: "household" | "solo";
  /** Premier jour de la fenêtre, `YYYY-MM-DD`. `windowDays[0]` est ce jour. */
  readonly startsOn: string;
  /** Les jetons de jour DANS L'ORDRE DU PLAN. L'index EST le rang. */
  readonly windowDays: readonly string[];
  /** `hasKitchenTool(eq, "freezer") === true`. Jamais hérité. */
  readonly hasFreezer: boolean;
  /**
   * `MAX_FRIDGE_DAYS`. PASSÉE, jamais importée — convention de
   * `fridge_window.ts` : deux copies d'un même nombre divergent.
   */
  readonly maxFridgeDays: number;
  readonly mouths: readonly {
    readonly memberId: string;
    readonly regime: DietaryRegime | null;
    readonly cells: readonly { readonly day: string; readonly slot: string }[];
  }[];
  /**
   * L'énergie SERVIE contre l'enveloppe, par bouche, MESURÉE PAR L'APPELANT.
   * `null` = pas mesurable ici (index de composition absent) — et le compteur
   * le DIT, au lieu de rendre un zéro qui ressemblerait à « tout va bien ».
   */
  readonly energy: readonly {
    readonly memberId: string;
    readonly envelopeKcal: number;
    readonly deliveredKcal: number;
  }[] | null;
  /**
   * Le contrat de boîtes du foyer. `null` = les boîtes ne SONT PAS le contrat
   * (solo, ou foyer qui mange à la même table) — et alors les deux causes de
   * boîte ne sont PAS évaluées, ce que `checked.boxed_dishes` fait voir.
   */
  readonly boxContract: { readonly expected: number; readonly roster: readonly string[] } | null;
  readonly exclusions: {
    readonly table: readonly ForbiddenTerm[];
    readonly byMember: readonly {
      readonly memberId: string;
      readonly terms: readonly ForbiddenTerm[];
    }[];
  };
  /** Le régime le plus strict de la table. `null` = aucun. */
  readonly strictestRegime: DietaryRegime | null;
  /** Les libellés de `household_food_restrictions`, tous membres confondus. */
  readonly houseRuleLabels: readonly string[];
  /** Le garde-manger déclaré : ce qui n'a pas besoin d'être acheté. */
  readonly pantryTerms: readonly string[];
  readonly policy: Readonly<Record<FinalGateCause, GateSeverity>>;
}

// ---------------------------------------------------------------------------
// ③ LE VOCABULAIRE FERMÉ DES CAUSES
// ---------------------------------------------------------------------------

/**
 * LES 22 CAUSES. Liste FERMÉE, orthographe exacte, ordre d'évaluation.
 *
 * ⚠️ ELLES SE LISENT PAR FAMILLE, et chaque famille a son dénominateur :
 * références (`uses`, `box_items`, `session_ids`), fenêtre cuite
 * (`cooked_pairs`), sessions, cases et bouches (`cells`, `mouth_cells`),
 * boîtes (`boxed_dishes`), courses (`shopping_lines`, `perishable_lines`,
 * `ingredient_terms`), interdits (`table_dishes`, `boxed_dishes`), énergie
 * servie (`energy_mouths`).
 */
export const FINAL_GATE_CAUSES = [
  // ── références pendantes ────────────────────────────────────────────────
  "uses_dangling",
  "box_item_dangling",
  "session_cites_unknown",
  // ── la fenêtre cuite ────────────────────────────────────────────────────
  "eaten_before_cooked",
  "eaten_too_late",
  "cook_day_unplaced",
  // ── les sessions ────────────────────────────────────────────────────────
  "preparation_without_session",
  "session_day_mismatch",
  // ── les cases et les bouches ────────────────────────────────────────────
  "cell_without_dish",
  "mouth_unfed",
  // ── les boîtes ──────────────────────────────────────────────────────────
  "boxes_none_delivered",
  "box_missing",
  // ── les courses ─────────────────────────────────────────────────────────
  "ingredient_not_bought",
  "shopping_undated",
  "unclassified_perishable",
  "perishable_bought_too_early",
  // ── les interdits ───────────────────────────────────────────────────────
  "table_exclusion_served",
  "member_exclusion_served",
  "title_promises_missing_preparation",
  "regime_forbidden_component",
  "house_rule_served",
  // ── l'énergie servie ────────────────────────────────────────────────────
  "mouth_energy_short",
] as const;
export type FinalGateCause = typeof FINAL_GATE_CAUSES[number];

/**
 * LE SEUIL DE LA BOUCHE SOUS-NOURRIE : servi < enveloppe × ce ratio.
 *
 * ⚠️ 0,9 EST UN PROVISOIRE, À CALIBRER PAR LA PREMIÈRE CAMPAGNE RÉELLE. Aucun
 * chiffre mesuré ne le justifie encore : il est posé pour que la MESURE
 * commence, pas pour trancher. Il est EXPORTÉ exactement pour ça — un test
 * l'épingle, et un commit ultérieur le déplace DÉLIBÉRÉMENT, à la vue de tous,
 * au lieu de bouger un littéral enfoui au milieu d'une fonction. Et tant que
 * `mouth_energy_short` est en `count` (les trois politiques livrées), un seuil
 * faux coûte un CHIFFRE, jamais un plan.
 */
export const ENERGY_SHORT_RATIO = 0.9;

/**
 * TROIS SÉVÉRITÉS, PAS DEUX.
 *
 * · `refuse` — le plan ne part pas.
 * · `repair` — l'appelant peut appliquer `applyFinalGateRepairs` et repasser.
 * · `count`  — on MESURE, on ne mord pas. C'est l'état d'un lot en
 *   observation, et c'est ce qui rend le déploiement progressif possible sans
 *   toucher au code de la garde.
 */
export type GateSeverity = "refuse" | "repair" | "count";

export interface GateRefusal {
  readonly cause: FinalGateCause;
  readonly severity: GateSeverity;
  readonly day: string | null;
  readonly slot: string | null;
  /** Le TITRE du plat en cause — jamais un index : l'appelant le montre. */
  readonly dish: string | null;
  readonly preparation_id: string | null;
  readonly member_id: string | null;
  readonly term: string | null;
  readonly detail: string;
}

export type GateRepairKind =
  | "drop_dangling_use"
  | "drop_dangling_box_item"
  | "drop_dangling_session_id"
  | "strip_title_promise";

/**
 * OÙ LA RÉPARATION S'APPLIQUE, en index dans le payload persisté.
 *
 * · `drop_dangling_use`        → `{ dish, use }`
 * · `drop_dangling_box_item`   → `{ dish, box, item }`
 * · `drop_dangling_session_id` → `{ session, item }` (index dans `preparation_ids`)
 * · `strip_title_promise`      → `{ dish }`
 */
export interface GateRepairAt {
  readonly dish?: number;
  readonly session?: number;
  readonly use?: number;
  readonly item?: number;
  readonly box?: number;
}

export interface GateRepair {
  readonly kind: GateRepairKind;
  readonly at: GateRepairAt;
  /** Ce qui est retiré : un identifiant pendant, ou la phrase de promesse. */
  readonly from: string;
  /**
   * `null` pour les quatre réparations livrées : toutes sont des RETRAITS.
   * Le champ existe pour qu'un remplacement futur n'ait pas à changer la forme
   * — et il reste `null` tant qu'aucun n'existe, plutôt que de porter une
   * chaîne vide qu'un lecteur prendrait pour un remplacement.
   */
  readonly to: string | null;
}

/**
 * LES DOUZE DÉNOMINATEURS, PLUS UN TÉMOIN. Voir l'en-tête : une cause à zéro
 * dont le dénominateur est à zéro n'est pas propre, elle n'a pas tourné.
 *
 * ⚠️ `energy_unmeasured` N'EST PAS UN DÉNOMINATEUR, c'est le témoin de ce qui
 * a échappé à celui de l'énergie : on l'attend à ZÉRO sur un cas propre, et
 * c'est `energy_mouths` — lui — qui doit être strictement positif.
 */
export interface FinalGateChecked {
  /** Entrées `dishes[].uses[]` regardées. */
  readonly uses: number;
  /** Entrées `dishes[].boxes[].items[]` regardées. */
  readonly box_items: number;
  /** Entrées `cooking_sessions[].preparation_ids[]` regardées. */
  readonly session_ids: number;
  /** Couples (plat, préparation citée ET résolue) passés à la fenêtre cuite. */
  readonly cooked_pairs: number;
  /** Cases distinctes attendues (union des cases des bouches). */
  readonly cells: number;
  /** Couples (bouche, case) — le dénominateur de `mouth_unfed`. */
  readonly mouth_cells: number;
  readonly shopping_lines: number;
  /** Lignes dont le rayon est dans `PERISHABLE_AISLES`. */
  readonly perishable_lines: number;
  /** Termes d'ingrédient DISTINCTS (plats + préparations). */
  readonly ingredient_terms: number;
  /** Plats sans aucune boîte — la surface de la table. */
  readonly table_dishes: number;
  /** Plats portant au moins une boîte. */
  readonly boxed_dishes: number;
  /**
   * Lignes d'énergie RÉELLEMENT comparées (enveloppe finie et > 0). C'EST LE
   * DÉNOMINATEUR : `mouth_energy_short: 0` avec `energy_mouths: 0` veut dire
   * « JAMAIS ÉVALUÉE », jamais « toutes les bouches sont nourries ».
   */
  readonly energy_mouths: number;
  /**
   * Bouches présentes mais NON mesurables : enveloppe absente, nulle, négative
   * ou non finie — plus, quand `ctx.energy` vaut `null`, TOUTES les bouches du
   * contexte. C'est ce qui empêche l'absence de mesure de se lire comme une
   * mesure propre.
   */
  readonly energy_unmeasured: number;
}

export interface FinalGateCounters {
  readonly checked: FinalGateChecked;
  readonly refusals_by_cause: Readonly<Record<FinalGateCause, number>>;
  readonly repairs_by_kind: Readonly<Record<GateRepairKind, number>>;
}

export interface FinalGateOutcome {
  /** `true` quand AUCUN refus n'a la sévérité `"refuse"`. */
  readonly ok: boolean;
  readonly refusals: readonly GateRefusal[];
  readonly repairs: readonly GateRepair[];
  readonly counters: FinalGateCounters;
}

// ---------------------------------------------------------------------------
// ④ LES TROIS POLITIQUES
// ---------------------------------------------------------------------------

function policyOf(
  overrides: Partial<Record<FinalGateCause, GateSeverity>>,
): Readonly<Record<FinalGateCause, GateSeverity>> {
  const out = {} as Record<FinalGateCause, GateSeverity>;
  for (const cause of FINAL_GATE_CAUSES) out[cause] = overrides[cause] ?? "count";
  return Object.freeze(out);
}

/**
 * LOT 1 — ON MESURE, RIEN NE MORD.
 *
 * ⛔ C'EST LE LOT QUI DOIT ÊTRE DÉPLOYÉ EN PREMIER, et pas par prudence : un
 * refus posé sans dénominateur mesuré refuserait des plans dont personne ne
 * sait s'ils sont fautifs. `ok` est TOUJOURS `true` sous cette politique,
 * refus listés compris.
 */
export const FINAL_GATE_POLICY_LOT_1: Readonly<Record<FinalGateCause, GateSeverity>> =
  policyOf({});

/**
 * LOT 2 — LE NOYAU MORD. Les quatre défauts mesurés (① ③ ④) et l'invariant
 * « personne sans repas ». Les références pendantes se RÉPARENT plutôt que de
 * refuser : elles sont le résidu mécanique d'une mutation d'après-garde, et
 * les retirer rend un plan servable.
 */
export const FINAL_GATE_POLICY_LOT_2: Readonly<Record<FinalGateCause, GateSeverity>> =
  policyOf({
    eaten_before_cooked: "refuse",
    eaten_too_late: "refuse",
    cell_without_dish: "refuse",
    mouth_unfed: "refuse",
    boxes_none_delivered: "refuse",
    table_exclusion_served: "refuse",
    regime_forbidden_component: "refuse",
    house_rule_served: "refuse",
    uses_dangling: "repair",
    box_item_dangling: "repair",
    session_cites_unknown: "repair",
    title_promises_missing_preparation: "repair",
    // ⛔ ÉCRIT, PAS HÉRITÉ DU DÉFAUT — parce que c'est un ARBITRAGE, pas un
    // oubli. Sous-nourrir une bouche est une question de QUALITÉ DE
    // COMPOSITION, pas une incohérence du plan : refuser là-dessus priverait
    // des gens de dîner sur un seuil (`ENERGY_SHORT_RATIO`) que personne n'a
    // encore calibré. On compte, on regarde la campagne, puis on tranche.
    mouth_energy_short: "count",
  });

/**
 * LOT 3 — LES COURSES MORDENT AUSSI. C'est le défaut ② (le poisson acheté
 * trois jours trop tôt) et l'ingrédient qu'aucune ligne n'achète.
 *
 * `mouth_energy_short` reste en `count` ici aussi, pour la raison écrite au
 * lot 2 : le seuil n'est pas calibré.
 */
export const FINAL_GATE_POLICY_LOT_3: Readonly<Record<FinalGateCause, GateSeverity>> =
  policyOf({
    ...FINAL_GATE_POLICY_LOT_2,
    perishable_bought_too_early: "refuse",
    ingredient_not_bought: "refuse",
    mouth_energy_short: "count",
  });

// ---------------------------------------------------------------------------
// ⑤ OUTILS PURS — normalisation, promesses de lots
// ---------------------------------------------------------------------------

/** Minuscules, sans diacritiques. Local et sans dépendance : voir l'en-tête. */
function flatten(text: unknown): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const FR_DAY_WORDS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
] as const;

const EN_DAY_WORDS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

/**
 * LE VOCABULAIRE FERMÉ DES PROMESSES DE CUISINE PAR LOTS.
 *
 * ⚠️ ÉTROIT EXPRÈS. On ne peut PAS comparer un titre à une préparation
 * disparue — on ne sait pas ce qui a été retiré. On ne cherche donc que les
 * tournures qui ANNONCENT un lot, sur un plat qui n'en cite aucun. Tout ce qui
 * n'est pas dans cette liste ne mord pas, et c'est le bon sens de l'erreur :
 * un faux négatif laisse passer une phrase, un faux positif efface une phrase
 * que quelqu'un a écrite.
 */
export const BATCH_PROMISE_MARKERS: readonly string[] = [
  "de la preparation",
  "des preparations",
  "de la casserole",
  "du batch",
  "from the batch",
  "portion of",
  ...FR_DAY_WORDS.flatMap((d) => [
    `prepare ${d}`,
    `preparee ${d}`,
    `prepares ${d}`,
    `preparees ${d}`,
    `cuisine ${d}`,
    `cuisinee ${d}`,
  ]),
  ...EN_DAY_WORDS.map((d) => `cooked on ${d}`),
];

/**
 * LA PHRASE QUI PROMET, dans un texte. `null` quand rien ne promet.
 *
 * On rend la PHRASE, pas le marqueur : c'est elle que la réparation retire, et
 * retirer le seul marqueur laisserait « Réchauffez la portion du . », c'est-à-
 * dire pire que rien (même arbitrage que `applyHouseRuleLock`, qui EFFACE le
 * `why` au lieu de le bricoler).
 */
function batchPromiseSentence(text: unknown): string | null {
  const raw = String(text ?? "");
  if (!raw.trim()) return null;
  for (const sentence of raw.split(/(?<=[.!?])\s+/)) {
    const flat = flatten(sentence);
    if (BATCH_PROMISE_MARKERS.some((m) => flat.includes(m))) {
      const trimmed = sentence.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

/**
 * CE TERME DE COURSES / DE GARDE-MANGER COUVRE-T-IL CET INGRÉDIENT ?
 *
 * ⚠️ TOLÉRANT DANS UN SEUL SENS, comme `isInPantry` : « tomates » couvre
 * « tomates cerises », jamais l'inverse. L'autre sens ferait passer une liste
 * de courses vague pour une liste complète.
 */
function covers(have: string, needle: string): boolean {
  if (!have || !needle) return false;
  if (have === needle) return true;
  return have.length >= 3 && needle.includes(have);
}

/**
 * `1620` → `1 620`. ESPACE ASCII ORDINAIRE, et une implémentation locale :
 * `toLocaleString` dépend de l'ICU du runtime, donc du poste — ce module est
 * PUR et déterministe, un `detail` ne doit pas changer selon la machine.
 */
function spacedInt(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded));
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += " ";
    out += digits[i];
  }
  return sign + out;
}

function asFoodGroup(value: unknown): FoodGroupRef | null {
  const slug = String(value ?? "").trim();
  return (FOOD_GROUP_REFS as readonly string[]).includes(slug)
    ? slug as FoodGroupRef
    : null;
}

function asKept(value: unknown): KeptWhere {
  return String(value ?? "") === "freezer" ? "freezer" : "fridge";
}

function declaredFoods(
  ingredients: readonly GateIngredient[],
): DeclaredFood[] {
  return (ingredients ?? [])
    .map((i) => ({ term: String(i?.term ?? ""), group: asFoodGroup(i?.group) }))
    .filter((i) => i.term.trim().length > 0);
}

// ---------------------------------------------------------------------------
// ⑥ LA GARDE
// ---------------------------------------------------------------------------

export function finalPlanGate(plan: GatePlan, ctx: GateContext): FinalGateOutcome {
  const dishes = plan.dishes ?? [];
  const preparations = plan.preparations ?? [];
  const sessions = plan.cooking_sessions ?? [];
  const shopping = plan.shopping_list ?? [];

  const refusals: GateRefusal[] = [];
  const repairs: GateRepair[] = [];
  const byCause = {} as Record<FinalGateCause, number>;
  for (const cause of FINAL_GATE_CAUSES) byCause[cause] = 0;
  const byKind: Record<GateRepairKind, number> = {
    drop_dangling_use: 0,
    drop_dangling_box_item: 0,
    drop_dangling_session_id: 0,
    strip_title_promise: 0,
  };

  const severityOf = (cause: FinalGateCause): GateSeverity =>
    ctx.policy?.[cause] ?? "count";

  const refuse = (
    cause: FinalGateCause,
    fields: Partial<Omit<GateRefusal, "cause" | "severity" | "detail">> & {
      detail: string;
    },
  ): void => {
    byCause[cause]++;
    refusals.push({
      cause,
      severity: severityOf(cause),
      day: fields.day ?? null,
      slot: fields.slot ?? null,
      dish: fields.dish ?? null,
      preparation_id: fields.preparation_id ?? null,
      member_id: fields.member_id ?? null,
      term: fields.term ?? null,
      detail: fields.detail,
    });
  };

  const repair = (r: GateRepair): void => {
    byKind[r.kind]++;
    repairs.push(r);
  };

  const prepById = new Map<string, GatePreparation>();
  for (const p of preparations) {
    const id = String(p?.id ?? "").trim();
    if (id) prepById.set(id, p);
  }

  const rankOf = (day: unknown): number => {
    const token = String(day ?? "").trim();
    if (!token) return -1;
    return ctx.windowDays.indexOf(token);
  };

  let usesChecked = 0;
  let boxItemsChecked = 0;
  let sessionIdsChecked = 0;
  let cookedPairs = 0;
  let tableDishes = 0;
  let boxedDishes = 0;

  // ═══════════════════════════════════════════════════════════════════════
  // ① LES RÉFÉRENCES PENDANTES — trois surfaces, trois causes, trois retraits
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Une seule cause pour les trois aurait rendu impossible la lecture qui
  // compte : un `uses` pendant est une mutation de composition, un item de
  // boîte pendant est une mutation de ceinture, un id de session pendant est
  // une mutation de plan de cuisine. Trois chaînes, trois responsables.
  dishes.forEach((dish, dishIndex) => {
    const title = String(dish?.title ?? "") || `dish[${dishIndex}]`;
    (dish?.uses ?? []).forEach((use, useIndex) => {
      usesChecked++;
      const id = String(use?.preparation_id ?? "").trim();
      if (prepById.has(id)) return;
      refuse("uses_dangling", {
        day: dish?.day ?? null,
        slot: dish?.slot ?? null,
        dish: title,
        preparation_id: id || null,
        detail: `le plat puise dans « ${id} », qui n'est pas dans les préparations`,
      });
      repair({
        kind: "drop_dangling_use",
        at: { dish: dishIndex, use: useIndex },
        from: id,
        to: null,
      });
    });

    (dish?.boxes ?? []).forEach((box, boxIndex) => {
      (box?.items ?? []).forEach((item, itemIndex) => {
        boxItemsChecked++;
        const id = String(item?.preparation_id ?? "").trim();
        // Un item SANS préparation est un aliment posé directement dans la
        // boîte : légitime, et ce n'est pas une référence pendante.
        if (!id || prepById.has(id)) return;
        refuse("box_item_dangling", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          preparation_id: id,
          term: String(item?.term ?? "") || null,
          detail: `la boîte « ${box?.id ?? boxIndex} » cite « ${id} », absent des préparations`,
        });
        repair({
          kind: "drop_dangling_box_item",
          at: { dish: dishIndex, box: boxIndex, item: itemIndex },
          from: id,
          to: null,
        });
      });
    });

    if ((dish?.boxes ?? []).length === 0) tableDishes++;
    else boxedDishes++;
  });

  sessions.forEach((session, sessionIndex) => {
    (session?.preparation_ids ?? []).forEach((rawId, idIndex) => {
      sessionIdsChecked++;
      const id = String(rawId ?? "").trim();
      if (prepById.has(id)) return;
      refuse("session_cites_unknown", {
        day: session?.day ?? null,
        preparation_id: id || null,
        detail: `la session du ${session?.day ?? "?"} cite « ${id} », absent des préparations`,
      });
      repair({
        kind: "drop_dangling_session_id",
        at: { session: sessionIndex, item: idIndex },
        from: id,
        to: null,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ② LA FENÊTRE CUITE — le défaut ① : cuisiné jeudi, mangé mercredi
  // ═══════════════════════════════════════════════════════════════════════
  //
  // On réutilise `cookedWindowVerdict` et `keptWindowDays`, sans les
  // réécrire : « deux copies d'un même nombre divergent, et c'est celle qu'on
  // regarde le moins qui garde l'ancienne ».
  for (const dish of dishes) {
    const title = String(dish?.title ?? "");
    const eatAt = rankOf(dish?.day);
    for (const use of dish?.uses ?? []) {
      const id = String(use?.preparation_id ?? "").trim();
      const prep = prepById.get(id);
      if (!prep) continue; // déjà compté en `uses_dangling`
      cookedPairs++;
      const cookAt = rankOf(prep.cook_on);
      if (cookAt < 0) {
        refuse("cook_day_unplaced", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          preparation_id: id,
          detail: `« ${prep.cook_on ?? "(aucun jour)"} » n'est pas dans la fenêtre du plan`,
        });
        continue;
      }
      if (eatAt < 0) {
        // Le plat n'est pas situable : le couple n'est pas gardé. On le DIT
        // plutôt que de l'écarter en silence — un couple non évalué est un
        // couple non gardé (`fridge_window.ts`, `not_evaluated`).
        refuse("cook_day_unplaced", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          preparation_id: id,
          detail: `le jour du plat « ${dish?.day ?? "(aucun)"} » est hors de la fenêtre`,
        });
        continue;
      }
      const window = keptWindowDays({
        kept: asKept(use?.kept),
        hasFreezer: ctx.hasFreezer === true,
        maxFridgeDays: ctx.maxFridgeDays,
      });
      const verdict = cookedWindowVerdict(cookAt, eatAt, window);
      if (verdict === "before_cooking") {
        refuse("eaten_before_cooked", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          preparation_id: id,
          detail: `cuisiné ${prep.cook_on}, mangé ${dish?.day} — avant sa cuisson`,
        });
      } else if (verdict === "too_late") {
        refuse("eaten_too_late", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          preparation_id: id,
          detail:
            `cuisiné ${prep.cook_on}, mangé ${dish?.day} — au-delà de ${window} jour(s) de conservation`,
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ③ LES SESSIONS — une casserole citée que personne ne cuisine
  // ═══════════════════════════════════════════════════════════════════════
  const citedByDishes = new Set<string>();
  for (const dish of dishes) {
    for (const use of dish?.uses ?? []) {
      const id = String(use?.preparation_id ?? "").trim();
      if (id && prepById.has(id)) citedByDishes.add(id);
    }
  }
  const sessionDayOf = new Map<string, string[]>();
  for (const session of sessions) {
    for (const rawId of session?.preparation_ids ?? []) {
      const id = String(rawId ?? "").trim();
      if (!id) continue;
      const days = sessionDayOf.get(id) ?? [];
      days.push(String(session?.day ?? ""));
      sessionDayOf.set(id, days);
    }
  }
  for (const prep of preparations) {
    const id = String(prep?.id ?? "").trim();
    if (!id || !citedByDishes.has(id)) continue;
    const days = sessionDayOf.get(id);
    if (!days || days.length === 0) {
      refuse("preparation_without_session", {
        day: prep.cook_on ?? null,
        preparation_id: id,
        detail: `« ${prep.title ?? id} » est puisée par un plat mais aucune session ne la cuisine`,
      });
      continue;
    }
    for (const day of days) {
      if (day === String(prep.cook_on ?? "")) continue;
      refuse("session_day_mismatch", {
        day,
        preparation_id: id,
        detail: `session du ${day || "(aucun jour)"} pour une préparation datée ${prep.cook_on ?? "(aucun)"}`,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ④ LES INTERDITS — exclusions, régimes, règle de la maison
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⛔ `surface: "ingredients"`, JAMAIS `"all"`. Sur la prose, un faux positif
  // coûterait ici un PLAN ENTIER (la sévérité de `table_exclusion_served` est
  // `refuse` dès le lot 2), alors que chez l'appelant qui relance il ne coûte
  // qu'un appel modèle. La distinction est celle du module de ceinture.
  const exclusionPrepById = new Map(
    preparations.map((p) => [
      String(p?.id ?? ""),
      {
        id: String(p?.id ?? ""),
        title: String(p?.title ?? ""),
        method: String(p?.method ?? ""),
        ingredients: (p?.ingredients ?? []).map((i) => ({
          term: String(i?.term ?? ""),
        })),
      },
    ]),
  );
  const termsOfMember = new Map<string, readonly ForbiddenTerm[]>(
    (ctx.exclusions?.byMember ?? []).map((m) => [m.memberId, m.terms ?? []]),
  );
  const tableTerms = ctx.exclusions?.table ?? [];

  /** La surface d'un plat de table : ses propres ingrédients + ses casseroles. */
  const dishSurface = (dish: GateDish) => ({
    dish: {
      title: String(dish?.title ?? ""),
      method: String(dish?.method ?? ""),
      ingredients: (dish?.ingredients ?? []).map((i) => ({
        term: String(i?.term ?? ""),
      })),
    },
    uses: (dish?.uses ?? []).map((u) => ({
      preparationId: String(u?.preparation_id ?? ""),
    })),
  });

  /** La surface d'une boîte : ses items, et les casseroles qu'ils citent. */
  const boxSurface = (dish: GateDish, box: GateBox) => ({
    dish: {
      title: String(dish?.title ?? ""),
      method: "",
      ingredients: (box?.items ?? []).map((i) => ({ term: String(i?.term ?? "") })),
    },
    uses: (box?.items ?? [])
      .map((i) => String(i?.preparation_id ?? ""))
      .filter(Boolean)
      .map((preparationId) => ({ preparationId })),
  });

  // Les morsures recalculées ICI, pour `mealsDelivered` : voir ⑤.
  const openDishExclusionBites = new Map<GateDish, string[]>();
  const openDishRegimeBites = new Map<GateDish, string[]>();

  dishes.forEach((dish, dishIndex) => {
    const title = String(dish?.title ?? "");
    const boxes = dish?.boxes ?? [];
    const open = boxes.length === 0;

    // ── ④.a L'EXCLUSION DE LA TABLE ────────────────────────────────────
    if (open) {
      const bite = dishBitesExclusion({
        ...dishSurface(dish),
        preparationById: exclusionPrepById,
        terms: tableTerms,
        surface: "ingredients",
      });
      if (bite.matched) {
        refuse("table_exclusion_served", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          term: bite.matched,
          preparation_id: bite.preparationIds[0] ?? null,
          detail: `plat de table : « ${bite.matched} » (${bite.because ?? "exclusion de la table"})`,
        });
      }
    } else {
      for (const box of boxes) {
        const bite = dishBitesExclusion({
          ...boxSurface(dish, box),
          preparationById: exclusionPrepById,
          terms: tableTerms,
          surface: "ingredients",
        });
        if (bite.matched) {
          refuse("table_exclusion_served", {
            day: dish?.day ?? null,
            slot: dish?.slot ?? null,
            dish: title,
            term: bite.matched,
            preparation_id: bite.preparationIds[0] ?? null,
            detail: `boîte « ${box.id} » : « ${bite.matched} » (${bite.because ?? "exclusion de la table"})`,
          });
        }
      }
    }

    // ── ④.b L'EXCLUSION D'UNE BOUCHE NOMMÉE SUR UN COUVERCLE ────────────
    for (const box of boxes) {
      for (const memberId of box?.member_ids ?? []) {
        const terms = termsOfMember.get(memberId) ?? [];
        if (terms.length === 0) continue;
        const bite = dishBitesExclusion({
          ...boxSurface(dish, box),
          preparationById: exclusionPrepById,
          terms,
          surface: "ingredients",
        });
        if (!bite.matched) continue;
        refuse("member_exclusion_served", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          member_id: memberId,
          term: bite.matched,
          preparation_id: bite.preparationIds[0] ?? null,
          detail: `boîte « ${box.id} » nommée pour cette bouche : « ${bite.matched} »`,
        });
      }
    }

    // ── ④.c LES MORSURES D'UN PLAT OUVERT, pour l'invariant des bouches ──
    if (open) {
      const bitten: string[] = [];
      if (tableTerms.length > 0) {
        const tableBite = dishBitesExclusion({
          ...dishSurface(dish),
          preparationById: exclusionPrepById,
          terms: tableTerms,
          surface: "ingredients",
        });
        // Une exclusion de TABLE mord toutes les bouches à la fois.
        if (tableBite.matched) bitten.push(...ctx.mouths.map((m) => m.memberId));
      }
      for (const m of ctx.mouths) {
        if (bitten.includes(m.memberId)) continue;
        const terms = termsOfMember.get(m.memberId) ?? [];
        if (terms.length === 0) continue;
        const bite = dishBitesExclusion({
          ...dishSurface(dish),
          preparationById: exclusionPrepById,
          terms,
          surface: "ingredients",
        });
        if (bite.matched) bitten.push(m.memberId);
      }
      if (bitten.length > 0) openDishExclusionBites.set(dish, bitten);
    }

    // ── ④.d LE RÉGIME ───────────────────────────────────────────────────
    //
    // Plat de table ⇒ le régime le plus strict de la maison. Plat en boîtes ⇒
    // la ligne de CHAQUE bouche nommée, sur la surface de SA boîte : le
    // grammage est par bouche, l'interdit aussi.
    const foldedFoods = (uses: readonly { preparationId: string }[]): DeclaredFood[] => {
      const out: DeclaredFood[] = [];
      const seen = new Set<string>();
      for (const u of uses) {
        if (seen.has(u.preparationId)) continue;
        seen.add(u.preparationId);
        const prep = prepById.get(u.preparationId);
        if (prep) out.push(...declaredFoods(prep.ingredients));
      }
      return out;
    };

    if (open) {
      const regimesHere = new Set<DietaryRegime>();
      if (ctx.strictestRegime) regimesHere.add(ctx.strictestRegime);
      for (const m of ctx.mouths) if (m.regime) regimesHere.add(m.regime);
      const foods = [
        ...declaredFoods(dish?.ingredients ?? []),
        ...foldedFoods(dishSurface(dish).uses),
      ];
      const bitten: string[] = [];
      for (const regime of regimesHere) {
        const scan = scanDietaryRegime(regime, { items: foods });
        if (scan.breaches.length === 0) continue;
        bitten.push(regime);
        if (regime !== ctx.strictestRegime) continue;
        refuse("regime_forbidden_component", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          term: scan.breaches[0].matchedText || scan.breaches[0].token,
          detail: `plat de table contre le régime « ${regime} » : ${scan.breaches[0].token}`,
        });
      }
      if (bitten.length > 0) openDishRegimeBites.set(dish, bitten);
    } else {
      for (const box of boxes) {
        for (const memberId of box?.member_ids ?? []) {
          const regime = ctx.mouths.find((m) => m.memberId === memberId)?.regime ?? null;
          if (!regime) continue;
          // ⚠️ LES TERMES DE LA BOÎTE COMPTENT, et c'est le seul endroit où
          // ils portent un aliment que ni le plat ni la casserole ne nomment :
          // la ceinture pose parfois une part directement sur un couvercle
          // (« poulet rôti », 150 g) sans qu'aucune ligne d'ingrédient ne
          // bouge. Les ignorer rendait ce plat végétarien aux yeux du régime.
          const foods = [
            ...declaredFoods(dish?.ingredients ?? []),
            ...declaredFoods(
              (box?.items ?? []).map((i) => ({ term: String(i?.term ?? "") })),
            ),
            ...foldedFoods(boxSurface(dish, box).uses),
          ];
          const scan = scanDietaryRegime(regime, { items: foods });
          if (scan.breaches.length === 0) continue;
          refuse("regime_forbidden_component", {
            day: dish?.day ?? null,
            slot: dish?.slot ?? null,
            dish: title,
            member_id: memberId,
            term: scan.breaches[0].matchedText || scan.breaches[0].token,
            detail: `boîte « ${box.id} » contre le régime « ${regime} » : ${scan.breaches[0].token}`,
          });
        }
      }
    }

    // ── ④.e LA PROMESSE DE LOT SANS LOT ─────────────────────────────────
    if ((dish?.uses ?? []).length === 0) {
      const sentence = batchPromiseSentence(dish?.method) ??
        batchPromiseSentence(dish?.title);
      if (sentence) {
        refuse("title_promises_missing_preparation", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          detail: `promet un lot sans citer de préparation : « ${sentence} »`,
        });
        repair({
          kind: "strip_title_promise",
          at: { dish: dishIndex },
          from: sentence,
          to: null,
        });
      }
    }
  });

  // ── ④.f LA RÈGLE DE LA MAISON ────────────────────────────────────────
  //
  // ⛔ REJOUÉE ICI, et ce n'est pas une redite : le chemin d'ADOPTION ne passe
  // JAMAIS par le verrou du générateur. Sans ce rappel, un plan adopté peut
  // servir ce que le foyer a exclu, et rien ne le dit.
  if ((ctx.houseRuleLabels ?? []).length > 0) {
    const lock = applyHouseRuleLock(
      dishes.map((d) => ({
        title: d?.title ?? "",
        why: d?.why ?? null,
        method: d?.method ?? "",
        ingredients: (d?.ingredients ?? []).map((i) => ({ term: i?.term ?? "" })),
      })),
      ctx.houseRuleLabels,
    );
    for (const violation of lock.violations) {
      const cut = violation.lastIndexOf(":");
      const dishTitle = cut > 0 ? violation.slice(0, cut) : violation;
      const token = cut > 0 ? violation.slice(cut + 1) : null;
      const found = dishes.find((d) => String(d?.title ?? "") === dishTitle);
      refuse("house_rule_served", {
        day: found?.day ?? null,
        slot: found?.slot ?? null,
        dish: dishTitle,
        term: token,
        detail: `la maison a exclu « ${token} », et ce plat le sert`,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⑤ LES CASES ET LES BOUCHES — le défaut ④, et « personne sans repas »
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⚠️ `heldOff` EST VIDE, ET C'EST UN CHOIX DOCUMENTÉ. La forme persistée ne
  // porte NI `heldOff`, NI `regimeBites`, NI `exclusionBites` : ce sont des
  // sous-produits de la ceinture, jamais écrits en base. Le chemin d'adoption
  // ne les aura donc jamais. On RECALCULE les deux morsures ci-dessus (④.c et
  // ④.d) et on passe `heldOff: []` — conséquence assumée : `mealsDelivered`
  // ne peut plus attribuer la cause `held_off_*` à un retrait de boîte, elle
  // rendra `not_named`. La cause exacte vit de toute façon dans les causes
  // `*_exclusion_served` / `regime_forbidden_component` de CE module.
  const deliveredDishes: DeliveredDish[] = dishes.map((d) => ({
    title: String(d?.title ?? ""),
    day: d?.day ?? null,
    slot: d?.slot ?? null,
    memberId: d?.member_id ?? null,
    boxes: (d?.boxes ?? []).map((b) => ({
      id: String(b?.id ?? ""),
      memberIds: (b?.member_ids ?? []).map(String),
    })),
    heldOff: [],
    regimeBites: openDishRegimeBites.get(d) ?? [],
    exclusionBites: openDishExclusionBites.get(d) ?? [],
  }));
  const deliveredMouths: DeliveredMouth[] = ctx.mouths.map((m) => ({
    memberId: m.memberId,
    cells: m.cells,
    regime: m.regime,
  }));

  const expectedCells = new Set<string>();
  let mouthCells = 0;
  for (const m of ctx.mouths) {
    for (const c of m.cells ?? []) {
      const day = String(c?.day ?? "").trim();
      const slot = String(c?.slot ?? "").trim();
      if (!day || !slot) continue;
      mouthCells++;
      expectedCells.add(`${day}/${slot}`);
    }
  }

  const filledCells = new Set<string>();
  const boxedCells = new Set<string>();
  for (const d of dishes) {
    const day = String(d?.day ?? "").trim();
    const slot = String(d?.slot ?? "").trim();
    if (!day || !slot) continue;
    filledCells.add(`${day}/${slot}`);
    if (!d?.member_id && (d?.boxes ?? []).length > 0) boxedCells.add(`${day}/${slot}`);
  }

  // `cell_without_dish` est compté UNE FOIS PAR CASE, jamais par bouche : le
  // trou est celui du PLAN. Le compter par bouche le gonflerait du nombre de
  // bouches et ferait accuser l'invariant d'un défaut qui a déjà son nom.
  for (const key of [...expectedCells].sort()) {
    if (filledCells.has(key)) continue;
    const [day, slot] = key.split("/");
    refuse("cell_without_dish", {
      day,
      slot,
      detail: "aucun plat n'est posé sur cette case",
    });
  }

  const delivered = mealsDelivered(deliveredDishes, deliveredMouths);
  const boxContract = ctx.boxContract;
  for (const mouth of delivered.mouths) {
    for (const row of mouth.missing) {
      // ⛔ PARTITION, JAMAIS DOUBLE COMPTE. Les manques de `mealsDelivered` se
      // répartissent en TROIS causes de ce module, et une ligne n'en produit
      // qu'une :
      //   · `no_dish`                       → déjà dit par `cell_without_dish`
      //   · `not_named` sur une case en BOÎTES, sous contrat → `box_missing`
      //   · tout le reste                   → `mouth_unfed`
      if (row.cause === "no_dish") continue;
      const key = `${row.day}/${row.slot}`;
      if (
        boxContract !== null && row.cause === "not_named" && boxedCells.has(key)
      ) {
        refuse("box_missing", {
          day: row.day,
          slot: row.slot,
          dish: row.dish,
          member_id: row.memberId,
          detail: "ce repas est mis en boîtes, et aucun couvercle ne la nomme",
        });
        continue;
      }
      refuse("mouth_unfed", {
        day: row.day,
        slot: row.slot,
        dish: row.dish,
        member_id: row.memberId,
        preparation_id: row.preparationId,
        term: row.matched,
        detail: `unfed:${row.cause}`,
      });
    }
  }

  if (boxContract !== null && boxContract.expected > 0) {
    const boxesInPlan = dishes.reduce((n, d) => n + (d?.boxes ?? []).length, 0);
    if (boxesInPlan === 0) {
      refuse("boxes_none_delivered", {
        detail: `${boxContract.expected} boîte(s) attendue(s), le plan n'en porte aucune`,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⑥ LES COURSES — le défaut ② : le poisson acheté trois jours trop tôt
  // ═══════════════════════════════════════════════════════════════════════
  const pantry = (ctx.pantryTerms ?? [])
    .map((t) => normalizePantryTerm(String(t ?? "")))
    .filter(Boolean);
  const shoppingTerms = shopping
    .map((l) => normalizePantryTerm(String(l?.term ?? "")))
    .filter(Boolean);

  // Le besoin par terme : le RANG le plus tôt où quelqu'un en a besoin.
  //
  // ⛔ ON NE RÉUTILISE PAS `earliestCook` : elle ne connaît que les
  // préparations, et un plat qui cuisine le jour même a ses ingrédients à lui.
  // ⚠️ GAP CONNU, ÉCRIT ICI : on ne prend le jour d'un plat que lorsqu'il ne
  // puise dans AUCUNE préparation. Un plat qui réchauffe un lot ET ajoute des
  // herbes fraîches le jour même verra ses herbes datées par le lot, donc
  // potentiellement trop tôt. Élargir ferait des besoins plus précoces, donc
  // des refus que rien n'a mesuré ; le lot suivant tranchera avec un chiffre.
  const earliestRankByTerm = new Map<string, number>();
  const noteNeed = (term: unknown, rank: number): void => {
    const key = normalizePantryTerm(String(term ?? ""));
    if (!key || rank < 0) return;
    const known = earliestRankByTerm.get(key);
    if (known === undefined || rank < known) earliestRankByTerm.set(key, rank);
  };
  for (const prep of preparations) {
    const rank = rankOf(prep?.cook_on);
    for (const ing of prep?.ingredients ?? []) noteNeed(ing?.term, rank);
  }
  for (const dish of dishes) {
    if ((dish?.uses ?? []).length > 0) continue;
    const rank = rankOf(dish?.day);
    for (const ing of dish?.ingredients ?? []) noteNeed(ing?.term, rank);
  }

  // ── ⑥.a L'INGRÉDIENT QUE PERSONNE N'ACHÈTE ───────────────────────────
  const usedTerms = new Map<string, string>(); // normalisé → tel qu'écrit
  for (const dish of dishes) {
    for (const ing of dish?.ingredients ?? []) {
      const key = normalizePantryTerm(String(ing?.term ?? ""));
      if (key && !usedTerms.has(key)) usedTerms.set(key, String(ing?.term ?? ""));
    }
  }
  for (const prep of preparations) {
    for (const ing of prep?.ingredients ?? []) {
      const key = normalizePantryTerm(String(ing?.term ?? ""));
      if (key && !usedTerms.has(key)) usedTerms.set(key, String(ing?.term ?? ""));
    }
  }
  for (const [key, written] of [...usedTerms].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    const bought = shoppingTerms.some((t) => covers(t, key));
    if (bought) continue;
    const inPantry = pantry.some((t) => covers(t, key));
    if (inPantry) continue;
    refuse("ingredient_not_bought", {
      term: written,
      detail: `« ${written} » n'est ni sur la liste de courses ni au garde-manger`,
    });
  }

  // ── ⑥.b LES LIGNES DE COURSES ────────────────────────────────────────
  let perishableLines = 0;
  for (const line of shopping) {
    const term = String(line?.term ?? "");
    const aisle = String(line?.aisle ?? "");
    const perishable = PERISHABLE_AISLES.has(aisle);
    if (perishable) perishableLines++;

    const buyOn = String(line?.buy_on ?? "").trim();
    if (!buyOn) {
      refuse("shopping_undated", {
        term,
        detail: `« ${term} » n'a pas de jour d'achat`,
      });
      continue;
    }

    const group = asFoodGroup(line?.food_group);
    if (perishable && group === null) {
      refuse("unclassified_perishable", {
        term,
        detail:
          `« ${term} » est au rayon « ${aisle} » sans groupe d'aliment — sa fenêtre crue est inconnue`,
      });
      continue;
    }
    if (group === null) continue;

    const window = rawWindowDaysFor(group);
    if (window === null) continue;

    const needRank = earliestRankByTerm.get(normalizePantryTerm(term));
    if (needRank === undefined) continue; // rien ne l'utilise : pas de besoin à dater
    const needBy = addDays(ctx.startsOn, needRank);
    const lastGoodDay = addDays(buyOn, window);
    if (lastGoodDay >= needBy) continue;
    if (line?.freeze_on_purchase === true) continue;
    refuse("perishable_bought_too_early", {
      term,
      day: ctx.windowDays[needRank] ?? null,
      detail:
        `« ${term} » acheté le ${buyOn}, tenu ${window} jour(s), attendu cuisiné le ${needBy} — sans congélation`,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⑦ L'ÉNERGIE SERVIE — l'écart que le redimensionnement cachait
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⛔ ON NE RECALCULE RIEN. Les kilocalories demandent l'index de composition,
  // qui n'est pas dans le payload persisté : le chemin d'ADOPTION ne l'aura
  // jamais. L'appelant MESURE, ce bloc COMPARE. Quand il n'a pas pu mesurer
  // (`ctx.energy === null`), on ne rend PAS un zéro rassurant : on compte les
  // bouches en `energy_unmeasured`, et le dénominateur reste à zéro.
  let energyMouths = 0;
  let energyUnmeasured = 0;
  const energyRows = ctx.energy ?? null;
  if (energyRows === null) {
    energyUnmeasured = (ctx.mouths ?? []).length;
  } else {
    for (const row of energyRows) {
      const envelope = Number(row?.envelopeKcal);
      const delivered = Number(row?.deliveredKcal);
      // Une enveloppe absente, nulle, négative ou non finie ne se DIVISE pas —
      // et une ligne qu'on ne peut pas comparer n'est pas une ligne propre :
      // elle n'entre pas au dénominateur, elle entre au témoin.
      if (
        !Number.isFinite(envelope) || envelope <= 0 || !Number.isFinite(delivered)
      ) {
        energyUnmeasured++;
        continue;
      }
      energyMouths++;
      if (delivered >= envelope * ENERGY_SHORT_RATIO) continue;
      const percent = Math.round((delivered / envelope) * 100);
      refuse("mouth_energy_short", {
        member_id: String(row?.memberId ?? "") || null,
        detail: `${String(row?.memberId ?? "(bouche sans nom)")}: ${
          spacedInt(delivered)
        } kcal servies pour ${spacedInt(envelope)} attendues (${percent} %)`,
      });
    }
  }

  const counters: FinalGateCounters = {
    checked: {
      uses: usesChecked,
      box_items: boxItemsChecked,
      session_ids: sessionIdsChecked,
      cooked_pairs: cookedPairs,
      cells: expectedCells.size,
      mouth_cells: mouthCells,
      shopping_lines: shopping.length,
      perishable_lines: perishableLines,
      ingredient_terms: usedTerms.size,
      table_dishes: tableDishes,
      boxed_dishes: boxedDishes,
      energy_mouths: energyMouths,
      energy_unmeasured: energyUnmeasured,
    },
    refusals_by_cause: byCause,
    repairs_by_kind: byKind,
  };

  return {
    ok: !refusals.some((r) => r.severity === "refuse"),
    refusals,
    repairs,
    counters,
  };
}

// ---------------------------------------------------------------------------
// ⑦ LES RÉPARATIONS — pures, un NOUVEAU plan
// ---------------------------------------------------------------------------

/**
 * APPLIQUE LES RETRAITS PROPOSÉS, SANS TOUCHER À L'ENTRÉE.
 *
 * ⚠️ LES INDEX SONT CEUX DU PLAN PASSÉ À `finalPlanGate`. On retire donc EN
 * BLOC, par ensembles d'index, jamais par `splice` successifs : un retrait
 * décale les suivants, et c'est le mode de corruption silencieuse le plus
 * facile à écrire dans ce genre de fonction.
 *
 * ⚠️ CETTE FONCTION N'APPLIQUE QUE CE QU'ON LUI DONNE. Elle ne filtre pas par
 * sévérité : c'est l'APPELANT qui décide s'il répare (et il le décide avec la
 * politique), parce que lui seul sait s'il a le droit de modifier ce plan-là.
 */
export function applyFinalGateRepairs(
  plan: GatePlan,
  repairs: readonly GateRepair[],
): GatePlan {
  const dropUses = new Map<number, Set<number>>();
  const dropBoxItems = new Map<string, Set<number>>();
  const dropSessionIds = new Map<number, Set<number>>();
  const stripSentences = new Map<number, string[]>();

  for (const r of repairs ?? []) {
    if (r.kind === "drop_dangling_use") {
      const d = r.at?.dish;
      const u = r.at?.use;
      if (typeof d !== "number" || typeof u !== "number") continue;
      const set = dropUses.get(d) ?? new Set<number>();
      set.add(u);
      dropUses.set(d, set);
    } else if (r.kind === "drop_dangling_box_item") {
      const d = r.at?.dish;
      const b = r.at?.box;
      const i = r.at?.item;
      if (typeof d !== "number" || typeof b !== "number" || typeof i !== "number") continue;
      const key = `${d}/${b}`;
      const set = dropBoxItems.get(key) ?? new Set<number>();
      set.add(i);
      dropBoxItems.set(key, set);
    } else if (r.kind === "drop_dangling_session_id") {
      const s = r.at?.session;
      const i = r.at?.item;
      if (typeof s !== "number" || typeof i !== "number") continue;
      const set = dropSessionIds.get(s) ?? new Set<number>();
      set.add(i);
      dropSessionIds.set(s, set);
    } else if (r.kind === "strip_title_promise") {
      const d = r.at?.dish;
      if (typeof d !== "number" || !r.from) continue;
      const list = stripSentences.get(d) ?? [];
      list.push(r.from);
      stripSentences.set(d, list);
    }
  }

  const stripFrom = (text: unknown, sentences: readonly string[]): string => {
    let out = String(text ?? "");
    for (const sentence of sentences) {
      if (!sentence) continue;
      out = out.split(sentence).join("");
    }
    return out.replace(/\s{2,}/g, " ").trim();
  };

  const dishes = (plan.dishes ?? []).map((dish, dishIndex) => {
    const droppedUses = dropUses.get(dishIndex);
    const sentences = stripSentences.get(dishIndex);
    const boxes = (dish.boxes ?? []).map((box, boxIndex) => {
      const dropped = dropBoxItems.get(`${dishIndex}/${boxIndex}`);
      if (!dropped) return box;
      return {
        ...box,
        items: (box.items ?? []).filter((_, i) => !dropped.has(i)),
      };
    });
    const next: GateDish = {
      ...dish,
      uses: droppedUses
        ? (dish.uses ?? []).filter((_, i) => !droppedUses.has(i))
        : (dish.uses ?? []),
      boxes,
    };
    if (!sentences || sentences.length === 0) return next;
    return {
      ...next,
      title: stripFrom(next.title, sentences),
      method: stripFrom(next.method, sentences),
    };
  });

  const cooking_sessions = (plan.cooking_sessions ?? []).map((session, index) => {
    const dropped = dropSessionIds.get(index);
    if (!dropped) return session;
    return {
      ...session,
      preparation_ids: (session.preparation_ids ?? []).filter((_, i) => !dropped.has(i)),
    };
  });

  return {
    dishes,
    preparations: (plan.preparations ?? []).map((p) => p),
    cooking_sessions,
    shopping_list: (plan.shopping_list ?? []).map((l) => l),
  };
}
