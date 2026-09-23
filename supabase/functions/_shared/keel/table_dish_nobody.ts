/**
 * 2026-09-20 — UN PLAT DE TABLE QUE PERSONNE NE MANGE N'EST PAS UN PLAT.
 *
 * Mesuré en local sur un foyer de trois : une bouche mange en milieu de
 * matinée et y a son plat à elle ; les deux autres n'y mangent pas. La grille
 * le savait (12 cases à un seul mangeur, toutes dédiées). Le modèle a quand
 * même rendu, dans chacune, un plat de table « Petit-suisse, cacahuètes et
 * pêche » — sans propriétaire, sans boîte, pour une table vide. L'écran, sans
 * prénom à joindre, l'affichait « Pour la table », et la famille entière
 * se retrouvait avec une collation que personne n'avait demandée.
 *
 * ⛔ LE DÉTECTEUR EXISTAIT ET SE TAISAIT. `mouthsFedByDish` nomme ce cas
 * (`sharedFedNobody`) ; le parseur ne le lit que si le modèle a écrit ses
 * boîtes lui-même, et n'en fait qu'une ligne d'`issues` qui ne retire rien.
 *
 * CE MODULE DÉCIDE, SANS I/O : pour chaque plat de table (sans `memberId`),
 * qui le mange une fois retirés les mangeurs qui ont leur plat à eux DANS LA
 * MÊME CASE. Personne ⇒ le plat est retiré. La règle est la même que celle
 * des contenants : c'est `eatersByDish` qui la porte, pas une seconde copie.
 *
 * ⚠️ IL NE RETIRE QUE QUAND LE PLAT DÉDIÉ EST LÀ. Un mangeur dont le plat à lui
 * manque reste dans `fed` ; son plat de table est gardé, c'est sa nourriture.
 * Retirer sur la seule grille aurait laissé quelqu'un sans rien.
 *
 * PURE: no I/O, no clock, no randomness.
 */
import { eatersByDish, type HouseholdCell } from "./household_cells.ts";

export interface TableDishCandidate {
  readonly day: string | null;
  readonly slot: string | null;
  readonly memberId: string | null;
  readonly complementsShared?: boolean;
  readonly title?: string | null;
}

export interface TableDishNobodyCounters {
  /** Tous les plats reçus. */
  dishes: number;
  /** Ceux sans propriétaire — les seuls que ce module peut retirer. */
  table_dishes: number;
  /** Plats de table dont la case est connue de la grille. */
  placed: number;
  /** Plats de table retirés : personne ne les mangeait. */
  dropped: number;
  /** Plats de table gardés parce qu'au moins une bouche y mange sans plat à elle. */
  kept_fed: number;
  /** Plats de table hors de toute case (jour/moment inconnus) — laissés aux autres ceintures. */
  off_cell: number;
}

export interface TableDishNobodyOutcome {
  /** Par plat, dans l'ordre reçu : `true` = gardé. */
  keep: boolean[];
  /** Les plats retirés, nommés pour le journal (jamais un `member_id`). */
  dropped: { day: string; slot: string; title: string }[];
  counters: TableDishNobodyCounters;
}

export function tableDishesNobodyEats(args: {
  readonly dishes: readonly TableDishCandidate[];
  readonly cells: readonly HouseholdCell[];
}): TableDishNobodyOutcome {
  const counters: TableDishNobodyCounters = {
    dishes: args.dishes.length,
    table_dishes: 0,
    placed: 0,
    dropped: 0,
    kept_fed: 0,
    off_cell: 0,
  };
  const fed = eatersByDish({
    dishes: args.dishes.map((d) => ({
      day: d.day,
      slot: d.slot,
      memberId: d.memberId,
      complementsShared: d.complementsShared === true,
      // ⟳ 2026-09-23 — `heldOff` est REQUIS sur `CellDish` (ceinture des boîtes du moteur,
      // engine_box_belt.ts). `[]` est juste ICI : ce détecteur tourne avant le dimensionnement
      // et avant `judgeDishEaters` ; personne n'est encore retenu d'un plat.
      heldOff: [],
    })),
    cells: args.cells,
  });
  const keep: boolean[] = args.dishes.map(() => true);
  const dropped: TableDishNobodyOutcome["dropped"] = [];
  for (const [i, dish] of args.dishes.entries()) {
    if (dish.memberId !== null && dish.memberId !== "") continue;
    counters.table_dishes++;
    const eaters = fed.fedByDish[i];
    if (eaters === null) {
      counters.off_cell++;
      continue;
    }
    counters.placed++;
    if (eaters.size > 0) {
      counters.kept_fed++;
      continue;
    }
    keep[i] = false;
    counters.dropped++;
    dropped.push({
      day: String(dish.day ?? ""),
      slot: String(dish.slot ?? ""),
      title: String(dish.title ?? ""),
    });
  }
  return { keep, dropped, counters };
}
