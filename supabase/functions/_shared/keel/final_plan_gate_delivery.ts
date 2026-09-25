// ═══════════════════════════════════════════════════════════════════════════
// LA GARDE FINALE DU PLAN — LA LIVRAISON ET LES CONTRÔLES ESSENTIELS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `final_plan_gate.ts` (découpage des gros
// fichiers, lot 2a). Aucune logique changée. `final_plan_gate.ts` ré-exporte
// tout ce qui est public ici : les appelants continuent d'importer depuis lui.
//
// ⚠️ `HOUSEHOLD_BETA_ESSENTIALS` est calculé au chargement : ce module lit ses
// voisins directement (`final_plan_gate_types.ts`), jamais `final_plan_gate.ts`.

import {
  FINAL_GATE_CAUSES,
  type FinalGateCause,
  type FinalGateChecked,
  type FinalGateOutcome,
  type GateRefusal,
} from "./final_plan_gate_types.ts";

// ---------------------------------------------------------------------------
// ④ bis ⟳ 2026-09-11 · LOT E — LA LIVRAISON : trois états, et les non-évalués
// ---------------------------------------------------------------------------

/**
 * TROIS ÉTATS DE LIVRAISON, ET LE TROISIÈME N'EST PAS « ÉCHEC ».
 *
 * · `conforme`                 — aucun refus, aucun écart, et les contrôles
 *                                exigés ont TOURNÉ (dénominateurs > 0).
 * · `deliverable_with_gaps`    — servable, avec des écarts NOMMÉS. C'est la
 *                                politique déjà acceptée du dépôt ; elle ne
 *                                masque aucun motif et ne franchit aucune
 *                                borne dure.
 * · `not_deliverable`          — au moins un refus bloquant. ⛔ Le plan
 *                                l'écrit : « préserver l'ancien plan valide
 *                                tant que le remplacement n'est pas
 *                                livrable ». Un état, pas un message.
 */
export const DELIVERY_STATES = [
  "conforme",
  "deliverable_with_gaps",
  "not_deliverable",
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];

export interface FinalGateDelivery {
  readonly state: DeliveryState;
  /** Les refus de sévérité `refuse` — ceux qui empêchent la livraison. */
  readonly blocking: readonly GateRefusal[];
  /** Les écarts nommés : tout le reste des refus listés. */
  readonly gaps: readonly GateRefusal[];
  /**
   * ⛔ LES CONTRÔLES QUI N'ONT PAS TOURNÉ, ET C'EST LA MOITIÉ DU RÉSULTAT.
   * Une cause à zéro dont le dénominateur est à zéro n'est pas propre : elle
   * n'a jamais été évaluée. Sans cette liste, `conforme` voudrait dire « rien
   * n'a mordu » au lieu de « tout a été regardé ».
   */
  readonly unevaluated: readonly FinalGateCause[];
  /**
   * ⛔ LES CONTRÔLES QUI ONT TOURNÉ SANS POUVOIR CONCLURE. Différents de
   * `unevaluated` (qui n'a pas tourné du tout) et différents de `gaps` (qui
   * accuse le plan). Le plan du chantier les exige nommément : « une conversion
   * ou un conditionnement inconnu produit un contrôle incomplet, pas un manque
   * quantifié inventé ».
   */
  readonly incomplete: readonly { readonly control: string; readonly count: number }[];
  /**
   * ⟳ 2026-09-14 · BÊTA 1B ⑧ — LES CONTRÔLES EXIGÉS QUI N'ONT PAS CONCLU.
   *
   * ⛔ NON VIDE ⇒ `state` VAUT `not_deliverable`, même sans aucun refus. C'est
   * la différence entre « rien n'a mordu » et « tout a été regardé », et le
   * plan de bêta en fait un critère de lancement (B3).
   */
  readonly missingEssential: readonly EssentialControl[];
}

// ---------------------------------------------------------------------------
// ④ ter ⟳ 2026-09-14 · BÊTA 1B ⑦⑧ — LES CONTRÔLES ESSENTIELS
// ---------------------------------------------------------------------------

/**
 * LES CONTRÔLES QU'UN PLAN LIVRABLE DOIT AVOIR FAIT CONCLURE.
 *
 * ⛔ CE SONT DES CONTRÔLES, PAS DES CAUSES. Une CAUSE accuse le plan (« cet
 * ingrédient est interdit »); un CONTRÔLE dit seulement qu'on a regardé. Un
 * plan sans aucun refus dont la nutrition n'a jamais été mesurée n'est pas un
 * plan propre: c'est un plan qu'on n'a pas lu.
 *
 * ⚠️ LA LISTE EST FERMÉE ET NOMMÉE, jamais dérivée des dénominateurs à zéro.
 * `unevaluated` en compte beaucoup qui sont légitimement sans objet — un plan
 * sans ligne périssable n'a rien à prouver sur la conservation. Choisir
 * lesquels sont ESSENTIELS est une décision de produit, et elle s'écrit.
 */
export const ESSENTIAL_CONTROLS = [
  /** Des cases étaient attendues. À zéro, la grille n'a pas tourné. */
  "cells_expected",
  /** Des couples (bouche, case) ont été confrontés au plan. */
  "mouth_cells",
  /** La nutrition par case a été lue. À zéro, aucune portion n'a été mesurée. */
  "portions_measured",
  /** Les achats ont été confrontés aux recettes. */
  "shopping_audited",
  /** Les obligations de plat à part ont été confrontées au plan livré. */
  "dedicated_checked",
  /**
   * L'énergie par case a CONCLU quelque part. ⛔ Ce n'est PAS « aucune case
   * n'est incomplète »: une journée à trou existe et se lit dans `incomplete`,
   * c'est un écart nommé, pas un contrôle absent. Ce qui est exigé ici est
   * qu'au moins une case ait été jugée alors que des cases étaient jugeables.
   */
  "cell_energy_concluded",
  /** Le plancher protéique a CONCLU quelque part, même règle exactement. */
  "protein_floor_concluded",
] as const;
export type EssentialControl = (typeof ESSENTIAL_CONTROLS)[number];

/**
 * QUAND CHAQUE CONTRÔLE EST « APPLICABLE ET NON CONCLU ».
 *
 * ⛔ FERMÉE PAR LE TYPE: `Record<EssentialControl, …>` fait recenser par le
 * compilateur tout contrôle ajouté plus tard. Un contrôle sans prédicat serait
 * un contrôle qu'on exige sans savoir le lire.
 *
 * ⚠️ `protein_floor_concluded` LIT `protein_unmeasured`, PAS `protein_days`.
 * Une abstention LÉGITIME (plancher TCA, mineur, objectif absent) sort dans
 * `protein_protected` et ne bloque rien: refuser un plan parce qu'une
 * protection a fermé serait retourner la protection contre la personne.
 */
const ESSENTIAL_CONTROL_MISSING: Readonly<
  Record<EssentialControl, (checked: FinalGateChecked) => boolean>
> = Object.freeze({
  cells_expected: (c) => c.cells === 0,
  mouth_cells: (c) => c.mouth_cells === 0,
  portions_measured: (c) => c.portion_cells === 0,
  shopping_audited: (c) => c.shopping_identities === 0,
  dedicated_checked: (c) => c.dedicated_cells_checked === 0,
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ CES DEUX-LÀ LISENT UN DÉNOMINATEUR, PAS DES LIGNES. LA DIFFÉRENCE A UN
  //    PRIX MESURÉ, ET IL EST ÉCRIT ICI.
  // ══════════════════════════════════════════════════════════════════════
  //
  // La première écriture exigeait ZÉRO LIGNE incomplète
  // (`portion_cells - measured_cells - no_target > 0` ⇒ manquant). Passée sur
  // le foyer propre du banc, elle le refusait: son DIMANCHE est
  // délibérément `unmeasurable` — « sa somme manque la part du dahl, qu'aucun
  // contenant ne porte » — et sa protéine sort `coverage_unknown` sur quatre
  // journées-bouche sur huit. C'est-à-dire qu'elle refusait le cas que ce
  // dépôt a écrit comme étant PROPRE.
  //
  // ⛔ ET CE N'ÉTAIT PAS LE BON CONTRÔLE. « Cette journée-là n'a pas pu être
  // lue » est un ÉCART NOMMÉ: il sort déjà dans `incomplete`, dans
  // `planValidationRecord` et dans les défauts de réparation. Ce que la garde
  // ne savait pas dire, c'est « ce contrôle n'a JAMAIS conclu » — un
  // dénominateur à zéro. Les deux appellent des corrections opposées: la
  // première se répare dans le plan, la seconde dans l'instrument.
  //
  // ⚠️ CE QUE ÇA LAISSE OUVERT, ET IL FAUT LE DIRE: un plan dont UNE journée
  // sur sept reste illisible est livrable, avec son écart écrit. Le passer à
  // « zéro ligne incomplète » est une décision de périmètre, pas un réglage —
  // et elle demande d'abord de mesurer combien de plans elle coûterait.
  cell_energy_concluded: (c) =>
    c.portion_cells > 0 && c.measured_cells === 0 &&
    c.cell_energy_no_target === 0,
  protein_floor_concluded: (c) =>
    c.protein_days === 0 && c.protein_protected === 0 &&
    c.protein_unmeasured > 0,
});

/**
 * CE QUE LA LANE FOYER EXIGE POUR LA BÊTA.
 *
 * ⛔ LES SEPT, ET LE PLAN LES NOMME: « exclusions, attribution, présence,
 * quantités mesurables nécessaires, calories et protéines quand leur contrat
 * s'applique, bornes, intégrité des références, cuisine/courses exécutables ».
 * Retirer une ligne d'ici est un CHANGEMENT DE PÉRIMÈTRE, pas un réglage — le
 * plan exige qu'il apparaisse comme tel dans le rapport.
 */
export const HOUSEHOLD_BETA_ESSENTIALS: readonly EssentialControl[] = Object
  .freeze([...ESSENTIAL_CONTROLS]);

/**
 * LE DÉNOMINATEUR DE CHAQUE CAUSE — la table qui rend `unevaluated` calculable.
 *
 * ⛔ FERMÉE ET EXHAUSTIVE : le type `Record<FinalGateCause, …>` fait recenser
 * par le compilateur toute cause ajoutée plus tard. Une cause sans
 * dénominateur nommé serait une cause dont personne ne saurait dire si son
 * zéro veut dire « propre » ou « débranché ».
 */
const CAUSE_DENOMINATOR: Readonly<
  Record<FinalGateCause, keyof FinalGateChecked>
> = Object.freeze({
  uses_dangling: "uses",
  box_item_dangling: "box_items",
  session_cites_unknown: "session_ids",
  eaten_before_cooked: "cooked_pairs",
  eaten_too_late: "cooked_pairs",
  rice_eaten_too_late: "rice_pairs_checked",
  cook_day_unplaced: "cooked_pairs",
  preparation_without_session: "cooked_pairs",
  session_day_mismatch: "session_ids",
  cell_without_dish: "cells",
  mouth_unfed: "mouth_cells",
  dedicated_dish_missing: "dedicated_cells_checked",
  own_meal_dish_missing: "dedicated_cells_checked",
  cell_two_table_dishes: "cells",
  boxes_none_delivered: "boxed_dishes",
  box_missing: "mouth_cells",
  ingredient_not_bought: "shopping_identities",
  // ⚠️ LES LIGNES, PAS LES IDENTITÉS: cette cause naît d'une LIGNE DE COURSES
  // écrite en trop. Sans ligne, elle n'a rien à regarder.
  ingredient_bought_unused: "shopping_lines",
  ingredient_short_bought: "shopping_quantified",
  shopping_undated: "shopping_lines",
  unclassified_perishable: "perishable_lines",
  perishable_bought_too_early: "perishable_lines",
  table_exclusion_served: "ingredient_terms",
  member_exclusion_served: "ingredient_terms",
  title_promises_missing_preparation: "table_dishes",
  regime_forbidden_component: "ingredient_terms",
  house_rule_served: "ingredient_terms",
  mouth_energy_short: "energy_mouths",
  cell_without_portion: "portion_cells",
  cell_energy_unmeasurable: "portion_cells",
  cell_energy_off: "measured_cells",
  // ⚠️ LE MÊME DÉNOMINATEUR QUE L'ÉNERGIE, ET C'EST EXACT: une case hors
  // bornes a été MESURÉE (elle a une portion, une masse et une énergie
  // lisibles). Lui en donner un autre ferait lire son zéro autrement.
  cell_bounds_off: "measured_cells",
  day_energy_off: "measured_days",
  protein_floor_short: "protein_days",
  // ⚠️ LE MÊME DÉNOMINATEUR QUE LE PLANCHER: une journée dont la protéine est
  // lisible est mesurée contre les deux bornes. Lui en donner un autre ferait
  // lire son zéro autrement.
  protein_ceiling_over: "protein_days",
});

/**
 * LE VERDICT DE LIVRAISON, LU SUR LA SORTIE DE LA GARDE.
 *
 * ⛔ IL NE DÉCIDE RIEN ET N'ÉCRIT RIEN. C'est l'appelant qui, voyant
 * `not_deliverable`, s'abstient d'écrire — et c'est cette abstention-là qui est
 * la garde, pas ce verdict. Le plan est explicite : « vérifier que la branche
 * de refus empêche réellement l'écriture ; ajouter un message ou compter
 * `blocking` ne suffit pas. »
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function finalGateDelivery(
  outcome: FinalGateOutcome,
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ⟳ 2026-09-14 · BÊTA 1B ⑦⑧ — LES CONTRÔLES QUE CE CHEMIN-CI EXIGE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⛔ REQUIS, ET POSITIONNEL. `[]` est une réponse — « ce chemin n'exige
   * aucun contrôle » — et c'est celle du chemin d'ADOPTION, qui n'a ni
   * référentiel ni grille et qui ne doit pas se mettre à refuser des
   * brouillons. Le rendre facultatif ferait exactement ce que ce dépôt paie
   * en boucle: une garde construite, branchée, et désarmée chez tous ceux qui
   * l'oublient.
   *
   * ⛔ CE QU'IL FERME. `state` ne lisait que `blocking` et `gaps`: un plan
   * dont AUCUN contrôle essentiel n'avait tourné sortait `conforme`. Le plan
   * de bêta l'interdit en toutes lettres — « aucun plan utilisable n'a d'écart
   * essentiel non résolu OU de contrôle essentiel applicable resté inconnu ».
   *
   * ⚠️ ET CE N'EST PAS UN SECOND VERDICT. On réutilise `not_deliverable`, le
   * même état, lu par les mêmes appelants: l'écran ne montre qu'une histoire.
   */
  essential: readonly EssentialControl[],
): FinalGateDelivery {
  const blocking = outcome.refusals.filter((r) => r.severity === "refuse");
  const gaps = outcome.refusals.filter((r) => r.severity !== "refuse");
  const unevaluated = FINAL_GATE_CAUSES.filter(
    (cause) => outcome.counters.checked[CAUSE_DENOMINATOR[cause]] === 0,
  );
  const checked = outcome.counters.checked;
  const incomplete = ([
    ["shopping_quantity", checked.shopping_unverified],
    // ⟳ 2026-09-13 · LOT 1 — LES CASES SANS CIBLE SORTENT DES DEUX CÔTÉS.
    // Elles ont quitté `measured_cells`; sans cette soustraction elles
    // tomberaient dans `incomplete`, c'est-à-dire « on n'a pas pu vérifier »
    // — une demande de réparation là où une protection a simplement fermé.
    [
      "cell_energy",
      checked.portion_cells - checked.measured_cells - checked.cell_energy_no_target,
    ],
    ["protein_floor", checked.protein_unmeasured],
    ["mouth_energy", checked.energy_unmeasured],
  ] as const)
    .filter(([, n]) => n > 0)
    .map(([control, count]) => ({ control, count }));
  // ⟳ 2026-09-14 · BÊTA 1B ⑦ — LES QUATRE ÉTATS DU PLAN, APPLIQUÉS À UN
  // CONTRÔLE. « Applicable et réussi », « applicable et échoué » (c'est
  // `gaps`/`blocking`), « applicable et non conclu » (ICI), « non applicable »
  // (ce que `CAUSE_DENOMINATOR` et `cell_energy_no_target` disent déjà).
  const missingEssential = essential.filter((control) =>
    ESSENTIAL_CONTROL_MISSING[control](checked)
  );
  return {
    state: blocking.length > 0 || missingEssential.length > 0
      ? "not_deliverable"
      : gaps.length > 0
      ? "deliverable_with_gaps"
      : "conforme",
    blocking,
    gaps,
    unevaluated,
    incomplete,
    missingEssential,
  };
}
