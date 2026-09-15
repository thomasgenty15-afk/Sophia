import { EATING_OCCASIONS } from "../api/mealGeneration";

// LOT 1 — LES LISTES PLATES DEVIENNENT PAR JOUR. Le modèle PUR: aucune I/O,
// aucune horloge, aucun aléa, aucun `t()`.
//
// ── POUR QUI ─────────────────────────────────────────────────────────────
// Les deux listes plates littérales du produit — « ce que la maison cuisine »
// (`HouseholdPlanCard`, un secondaire sur `/app/household`) et les plats
// communs de « ta part » (`MyShareCard`) — plus la semaine d'une bouche
// (`OnePerson`). Trois rendus d'une même forme: des jours, et sous chaque
// jour ses plats.
//
// ── ⛔ CE QUE CE MODULE NE FAIT PAS ───────────────────────────────────────
// Il ne LIT aucun titre (jamais de matcher maison), il n'ATTRIBUE rien, il ne
// FILTRE rien: chaque plat reçu ressort exactement une fois. Le filtrage par
// personne appartient à `buildPersonWeek`, la découpe par jour à lui seul.
// Et il ne dérive AUCUNE liste de jours: l'ordre vient de l'appelant
// (`windowDayOrder` — l'ordre du PLAN, jamais le calendrier).
//
// ── LE GROUPE SANS JOUR N'EST JAMAIS PERDU ────────────────────────────────
// Un plat sans jour, ou dont le jeton n'est pas dans la fenêtre (plan
// tronqué, donnée ancienne), tombe dans un groupe SANS titre, en tête. Le
// jeter ferait disparaître un plat d'un plan qui le contient.

/** Une ligne de plat, réduite à ce que ces surfaces ont le droit de dire. */
export interface DayListDish {
  slot: string | null;
  title: string;
  /** La part de la bouche pour ce plat, quand la surface en a une. */
  note: string | null;
  /**
   * A8.1 — SA POSITION DANS LE PLAN STOCKÉ, ou `null` quand la surface qui
   * l'a construite n'en a pas — et alors elle ne portera AUCUNE case.
   *
   * ⚠️ CE MODULE NE LE CALCULE PAS, il le TRANSPORTE. Le recalculer ici serait
   * le recalculer sur une liste déjà filtrée et déjà triée par moment: la
   * position n'aurait plus aucun rapport avec le plan. Voir
   * `HouseholdDishView.dishIndex`, qui le capture au seul endroit où il est
   * vrai.
   *
   * `null` n'est pas un défaut permissif: il ferme. Une case a besoin d'une
   * position pour nommer le fait qu'elle écrit; sans elle, pas de case.
   */
  dishIndex: number | null;
}

/** Un jour, et ses plats. `day: null` = le groupe sans jour, toujours en tête. */
export interface DayListGroup {
  day: string | null;
  dishes: DayListDish[];
}

/** Le rang d'un moment. Un moment inconnu ou absent passe en queue, jamais
 * devant le petit déjeuner — même règle que `buildPersonWeek`. */
function slotRank(slot: string | null): number {
  if (!slot) return EATING_OCCASIONS.length;
  const at = (EATING_OCCASIONS as readonly string[]).indexOf(slot);
  return at < 0 ? EATING_OCCASIONS.length : at;
}

export function groupDishListByDay(args: {
  /** L'ordre du PLAN (`windowDayOrder`) — jamais le calendrier. */
  order: readonly string[];
  dishes: ReadonlyArray<{
    day: string | null;
    slot: string | null;
    title: string;
    note?: string | null;
    /**
     * A8.1 — REQUIS, ET PAS OPTIONNEL. Un `?` laisserait un monteur oublier la
     * position et obtenir une liste sans case, sans rien qui le dise. `null`
     * est une réponse — « cette surface ne coche pas » — et il faut l'écrire.
     */
    dishIndex: number | null;
  }>;
}): DayListGroup[] {
  const byDay = new Map<string, DayListDish[]>();
  const undated: DayListDish[] = [];
  for (const dish of args.dishes) {
    const entry: DayListDish = {
      slot: dish.slot ?? null,
      title: dish.title,
      note: dish.note ?? null,
      // TRANSPORTÉ TEL QUEL À TRAVERS LE REGROUPEMENT ET LE TRI. C'est tout
      // l'intérêt: après le tri par moment, la position dans le groupe ne dit
      // plus rien du plan, mais celle-ci le dit encore.
      dishIndex: dish.dishIndex,
    };
    if (!dish.day || !args.order.includes(dish.day)) {
      undated.push(entry);
      continue;
    }
    const list = byDay.get(dish.day) ?? [];
    list.push(entry);
    byDay.set(dish.day, list);
  }
  // Tri STABLE par moment: deux plats du même moment gardent l'ordre du plan.
  const sorted = (list: DayListDish[]) =>
    [...list].sort((a, b) => slotRank(a.slot) - slotRank(b.slot));
  const out: DayListGroup[] = [];
  if (undated.length > 0) out.push({ day: null, dishes: sorted(undated) });
  for (const day of args.order) {
    const list = byDay.get(day);
    if (list && list.length > 0) out.push({ day, dishes: sorted(list) });
  }
  return out;
}
