import type {
  AwayDay,
  EatingOccasion,
  EatingOccasionSlot,
  GeneratedDish,
  PlanDayProperty,
  PlanFixedIntake,
} from "../api/mealGeneration";

// FF-053 — LE MODÈLE DE LA GRILLE. Pur, sans React, donc testable sans rendu.
//
// ── CE QUE LA GRILLE APPORTE, ET QUI N'EXISTAIT NULLE PART ─────────────────
// Une case vide dans la semaine d'un élève a QUATRE causes, et l'écran n'en
// distinguait aucune:
//
//   * il déjeune à la cantine            (FF-002, `away_days`)
//   * son shaker remplace le moment      (FF-051, `fixed_intakes`)
//   * c'est son jour de restes           (FF-052, `day_properties`)
//   * le modèle n'a rien composé         ← LE SEUL QUI SOIT UN DÉFAUT
//
// Trois de ces silences sont exactement ce que l'élève a DEMANDÉ. Le quatrième
// est une faute. Les rendre identiques, c'est rendre la faute invisible et les
// trois autres inquiétants.

/** Ce qu'une case dit. Cinq états, et le cinquième est l'anomalie. */
export type PlanGridCell =
  | {
    kind: "dish";
    title: string;
    /**
     * Ce plat vient d'une préparation (`uses` non vide).
     *
     * ⚠️ SANS CE DRAPEAU, LA GRILLE MENT PAR OMISSION. Trois cases identiques
     * sont soit une casserole intelligente, soit un modèle paresseux, et à
     * l'œil nu ça se ressemble. Non marqué, le comportement que FF-052 cherche
     * à produire serait jugé comme un défaut — et le premier réflexe serait de
     * le corriger.
     */
    fromBatch: boolean;
  }
  | { kind: "away" }
  | { kind: "fixed_intake"; label: string }
  | { kind: "leftovers" }
  | { kind: "empty" };

export interface PlanGridRow {
  slot: EatingOccasion;
  cells: PlanGridCell[];
}

export interface PlanGrid {
  /** Les jours, dans l'ordre du PLAN. Même longueur que chaque `cells`. */
  days: string[];
  rows: PlanGridRow[];
}

/** Ce moment-là, ce jour-là, est-il écarté ? Même règle que le moteur. */
function isAway(
  away: readonly AwayDay[],
  day: string,
  slot: EatingOccasion,
): boolean {
  const row = away.find((a) => a.day === day);
  if (!row) return false;
  // Liste vide = la journée entière (convention de FF-002, tenue des deux côtés).
  return row.slots.length === 0 || row.slots.includes(slot);
}

/** Un apport fixe REMPLAÇANT occupe-t-il ce créneau ce jour-là ? */
function takenByIntake(
  intakes: readonly PlanFixedIntake[],
  day: string,
  slot: EatingOccasion,
): PlanFixedIntake | null {
  return intakes.find((i) =>
    i.replacesMeal && i.slot === slot &&
    // `days` vide = tous les jours, comme côté moteur (FF-051).
    (i.days.length === 0 || i.days.includes(day))
  ) ?? null;
}

export function dayHasProperty(
  properties: readonly PlanDayProperty[],
  day: string,
  property: string,
): boolean {
  return properties.some((p) => p.day === day && p.properties.includes(property));
}

/**
 * LA GRILLE.
 *
 * ── L'ORDRE DE PRÉCÉDENCE, ET POURQUOI IL EST CELUI-LÀ ────────────────────
 * Un plat GAGNE toujours: s'il existe, il se mange, quelle que soit la
 * déclaration. Les quatre autres états n'expliquent qu'une ABSENCE, et ils sont
 * ordonnés du plus fort au plus faible:
 *
 *   1. un plat            — il est là, on le montre
 *   2. absent             — la déclaration la plus catégorique: rien n'est ni
 *                           composé, ni acheté, ni compté
 *   3. apport fixe        — le moment est pris, mais par de la nourriture
 *   4. jour de restes     — le moment est libre, on y mange ce qui existe
 *   5. vide               — aucune des quatre. C'est le défaut.
 *
 * ── LES LIGNES VIENNENT DU RYTHME DÉCLARÉ ────────────────────────────────
 * Trois repas font trois lignes; la collation de 17 h en fait quatre. Une
 * grille à six lignes fixes ferait lire des lignes vides toutes les semaines,
 * pour des moments que l'élève a déjà dit ne pas prendre.
 */
export function buildPlanGrid(args: {
  /** Les jours de la fenêtre, DANS L'ORDRE DU PLAN (jamais du calendrier). */
  days: readonly string[];
  /** Les moments d'une journée normale — les lignes. */
  rhythm: readonly EatingOccasionSlot[];
  /** Les plats, DÉJÀ étendus par jour (`groupByDay`). */
  groups: ReadonlyArray<{ day: string | null; dishes: GeneratedDish[] }>;
  awayDays: readonly AwayDay[];
  fixedIntakes: readonly PlanFixedIntake[];
  dayProperties: readonly PlanDayProperty[];
}): PlanGrid {
  const byDay = new Map<string, GeneratedDish[]>();
  for (const g of args.groups) {
    if (g.day) byDay.set(g.day, g.dishes);
  }

  const rows: PlanGridRow[] = args.rhythm.map((r) => ({
    slot: r.slot,
    cells: args.days.map((day): PlanGridCell => {
      const dish = (byDay.get(day) ?? []).find((d) => d.slot === r.slot);
      if (dish) {
        return {
          kind: "dish",
          title: dish.title,
          fromBatch: dish.uses.length > 0,
        };
      }
      if (isAway(args.awayDays, day, r.slot)) return { kind: "away" };
      const intake = takenByIntake(args.fixedIntakes, day, r.slot);
      if (intake) return { kind: "fixed_intake", label: intake.label };
      if (dayHasProperty(args.dayProperties, day, "leftovers")) {
        return { kind: "leftovers" };
      }
      return { kind: "empty" };
    }),
  }));

  return { days: [...args.days], rows };
}

/**
 * Les jours qu'une préparation nourrit, dans l'ordre où ils apparaissent.
 *
 * Dérivé des `dish.uses`, pas d'un champ neuf: la donnée existe déjà, et un
 * second champ à tenir d'accord finirait par diverger du premier. C'est cette
 * ligne qui fait dire à « rôti du dimanche » qu'on en mange lundi, mardi et
 * mercredi — sans elle, le bloc cuisine ne vaut pas son titre.
 */
export function daysFedBy(
  preparationId: string,
  dishes: readonly GeneratedDish[],
): string[] {
  const seen: string[] = [];
  for (const d of dishes) {
    if (!d.day) continue;
    if (!d.uses.some((u) => u.preparation_id === preparationId)) continue;
    if (!seen.includes(d.day)) seen.push(d.day);
  }
  return seen;
}

/**
 * Combien de cases sont VRAIMENT vides — le seul état qui soit une anomalie.
 *
 * Sorti à part parce que c'est un taux de défaut de composition, et qu'il
 * n'avait aucun endroit où se voir avant cet écran (FF-053 §10).
 */
export function emptyCellCount(grid: PlanGrid): number {
  return grid.rows.reduce(
    (n, row) => n + row.cells.filter((c) => c.kind === "empty").length,
    0,
  );
}
