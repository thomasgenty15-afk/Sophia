import type {
  AwayDay,
  EatingOccasion,
  EatingOccasionSlot,
  GeneratedDish,
  PlanDayProperty,
  PlanFixedIntake,
} from "../api/mealGeneration";
import { type AwayMark, awayKindOf, presenceStateOf } from "./presenceMarks";

// FF-053 — LE MODÈLE DE LA GRILLE. Pur, sans React, donc testable sans rendu.
//
// ── CE QUE LA GRILLE APPORTE, ET QUI N'EXISTAIT NULLE PART ─────────────────
// Une case vide dans la semaine d'un élève a QUATRE causes, et l'écran n'en
// distinguait aucune:
//
//   * il n'est pas là                    (FF-002, `away_days`)
//   * il déjeune dehors                  (L3, `away_days` + `kind`)
//   * son shaker remplace le moment      (FF-051, `fixed_intakes`)
//   * c'est son jour de restes           (FF-052, `day_properties`)
//   * le modèle n'a rien composé         ← LE SEUL QUI SOIT UN DÉFAUT
//
// Quatre de ces silences sont exactement ce que l'élève a DEMANDÉ. Le cinquième
// est une faute. Les rendre identiques, c'est rendre la faute invisible et les
// quatre autres inquiétants.
//
// ⚠️ LES DEUX PREMIERS SE RESSEMBLENT ET NE SONT PAS LA MÊME CHOSE (L3,
// 2026-08-18). Aucun plat dans les deux cas; ce qui les sépare est que « dehors »
// garde le droit à un conseil chiffré et « pas là » non. Les confondre ferait
// taire le conseil du midi, ou le ferait apparaître pendant des vacances.

/** Ce qu'une case dit. Six états, et le dernier est l'anomalie. */
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
  /**
   * ELLE MANGE, MAIS PAS CE QUE LE PLAN COMPOSE — le déjeuner dehors (L3,
   * 2026-08-18).
   *
   * ⚠️ CE N'EST PAS `away`, ET LES SÉPARER EST TOUT L'INTÉRÊT. Les deux cases
   * sont vides de plat; ce qui les distingue est que celle-ci a le droit de
   * porter un nombre (« vise autour de 700 ») et l'autre non. Les rendre
   * identiques ferait l'une des deux fautes: taire le conseil du midi de
   * quelqu'un qui déjeune dehors tous les jours, ou le faire apparaître pendant
   * ses vacances.
   *
   * ⚠️ ELLE NE PORTE AUCUN CHIFFRE, et c'est délibéré. Ce modèle dit OÙ un
   * conseil a le droit d'exister; il ne sait pas le calculer et n'a rien pour
   * ça. Poser un `kcal` ici en ferait un producteur d'énergie.
   */
  | { kind: "eating_out" }
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

/**
 * LES ABSENCES, RELUES AVEC LEUR SENS.
 *
 * ⚠️ LE PARAMÈTRE RESTE `AwayDay[]`, ET C'EST CE QUI REND CE LOT ADDITIF. Une
 * `AwayMark` EST une `AwayDay`: un appelant qui lit la colonne avec
 * `parseAwayMarks` fait apparaître « dehors » sans changer une seule signature,
 * et un appelant qui passe des absences nues obtient exactement l'écran d'hier
 * — tout en `away`, c'est-à-dire le silence. Le jeton voyage dans le même
 * tableau, invisible à qui ne le lit pas, comme `source` avant lui.
 */
function markify(rows: readonly AwayDay[]): AwayMark[] {
  return rows.map((a) => ({
    day: a.day,
    slots: a.slots,
    kind: awayKindOf(a),
  }));
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
 *   2. absent OU dehors   — la déclaration la plus catégorique: rien n'est ni
 *                           composé, ni acheté. Les deux sortent au MÊME rang
 *                           (elles se distinguent par ce qu'on DIT, pas par ce
 *                           qu'on compose); les départager ici en ferait passer
 *                           une derrière un apport fixe, où elle disparaîtrait.
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

  const marks = markify(args.awayDays);

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
      // ⚠️ LES DEUX SORTENT AU MÊME RANG DE PRÉCÉDENCE, celui qu'occupait
      // `away` seul. « Dehors » est une déclaration aussi catégorique
      // qu'« absent » — rien n'est composé, rien n'est acheté — et lui donner
      // un rang différent le ferait passer derrière un apport fixe ou un jour
      // de restes, c'est-à-dire disparaître.
      const state = presenceStateOf(marks, day, r.slot);
      if (state === "away") return { kind: "away" };
      if (state === "eating_out") return { kind: "eating_out" };
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
