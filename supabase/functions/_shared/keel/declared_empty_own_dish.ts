/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-25 — « QUE DU CAFÉ » : UN PLAT À SOI DÉCLARÉ SANS ÉNERGIE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, MESURÉ ─────────────────────────────────────────────────────
 * Banc des trois foyers, plan C (`8c7dc643`, rejoué en `16040d07`) : Thomas
 * écrit dans sa fiche Préférences, sous le petit-déjeuner, « un café noir, rien
 * d'autre ». Le modèle rend fidèlement un plat « Café noir » à son nom, sans
 * ingrédient. Le moteur le mesure à 0 kcal, ne lui fait pas de boîte, et la
 * garde finale lève `cell_without_portion` — une cause CHASSÉE : deux appels de
 * réparation et cinq passes de finition par tentative, jusqu'à la mort sous la
 * limite CPU du runtime. Et la part du matin (le quart de sa journée) n'était
 * reportée nulle part : 67 % et 66 % de sa cible les jours « café ».
 *
 * ── LA RÈGLE ─────────────────────────────────────────────────────────────
 * Un plat À SOI (`memberId`), SANS casserole (`uses` vide), posé sur une case
 * que la grille dédie à l'habitude déclarée de cette personne (`own_meal`), et
 * que le référentiel mesure SANS LACUNE à au plus `OWN_USUAL_EMPTY_MAX_KCAL`,
 * est un moment « déclaré sans énergie » :
 *   · il reste au plan, tel que le modèle l'a écrit (c'est ce qu'elle a dit) ;
 *   · il n'attend ni boîte ni portion ;
 *   · sa part de la journée est portée par ses autres moments
 *     (`ContractDay.emptySlots`, statut de contrat `declared_empty`).
 *
 * ⛔ AUCUN MOT N'EST LU, ni le titre ni l'habitude : la MESURE décide. Un plat
 * que le référentiel ne sait pas mesurer (un terme inconnu, une lacune) n'est
 * PAS vide — « je ne sais pas » n'est jamais « rien ».
 *
 * PURE: no I/O, no clock, no randomness.
 */

/**
 * Au-delà, ce n'est plus « rien » : un café au lait, un thé sucré passent
 * encore ; une tartine, non. Épinglé dans `constant_pins_test.ts`.
 */
export const OWN_USUAL_EMPTY_MAX_KCAL = 30;

/** La clé d'une case d'habitude déclarée : bouche, jeton de jour, moment. */
export function ownMealCellKey(memberId: string, day: string, slot: string): string {
  return `${memberId}|${day}|${slot}`;
}

export interface DeclaredEmptyCounters {
  /** Plats à soi examinés (sans casserole, sur une case d'habitude déclarée). */
  own_usual_dishes: number;
  /** Cases déclarées vides — celles dont la part part aux autres moments. */
  empty_cells: number;
  /** Plats à soi que le référentiel n'a pas su mesurer : jamais comptés vides. */
  unmeasured: number;
}

export interface DeclaredEmptyOutcome {
  /** `ownMealCellKey` des cases déclarées vides. */
  cells: Set<string>;
  /** Bouche → jeton de jour → moments déclarés vides ce jour-là. */
  byMember: Map<string, Map<string, string[]>>;
  counters: DeclaredEmptyCounters;
}

export function declaredEmptyOwnCells(args: {
  dishes: readonly {
    memberId?: string | null;
    day?: string | null;
    slot?: string | null;
    uses?: readonly unknown[] | null;
  }[];
  /** `ownMealCellKey` des cases que la grille dédie à une habitude (`own_meal`). */
  ownMealCells: ReadonlySet<string>;
  /** La mesure du plat `i` au référentiel (`standardPortionOf`). */
  measure: (dishIndex: number) => { kcal: number | null; gaps: readonly string[] };
}): DeclaredEmptyOutcome {
  const counters: DeclaredEmptyCounters = { own_usual_dishes: 0, empty_cells: 0, unmeasured: 0 };
  // Case → kcal totales de ses plats à soi, ou `null` dès qu'un seul est illisible.
  const byCell = new Map<string, number | null>();
  args.dishes.forEach((dish, i) => {
    const memberId = String(dish.memberId ?? "");
    if (!memberId) return;
    const key = ownMealCellKey(memberId, String(dish.day ?? ""), String(dish.slot ?? ""));
    if (!args.ownMealCells.has(key)) return;
    counters.own_usual_dishes++;
    // Un plat qui tire sur une casserole n'est pas « rien » : on ne le mesure pas.
    if ((dish.uses ?? []).length > 0) {
      byCell.set(key, null);
      return;
    }
    const m = args.measure(i);
    const readable = m.kcal !== null && Number.isFinite(m.kcal) && m.gaps.length === 0;
    if (!readable) counters.unmeasured++;
    const prev = byCell.has(key) ? byCell.get(key)! : 0;
    byCell.set(key, prev === null || !readable ? null : prev + (m.kcal as number));
  });
  const cells = new Set<string>();
  const byMember = new Map<string, Map<string, string[]>>();
  for (const [key, kcal] of byCell) {
    if (kcal === null || kcal > OWN_USUAL_EMPTY_MAX_KCAL) continue;
    cells.add(key);
    const [memberId, day, slot] = key.split("|");
    const days = byMember.get(memberId) ?? new Map<string, string[]>();
    days.set(day, [...(days.get(day) ?? []), slot]);
    byMember.set(memberId, days);
  }
  counters.empty_cells = cells.size;
  return { cells, byMember, counters };
}
