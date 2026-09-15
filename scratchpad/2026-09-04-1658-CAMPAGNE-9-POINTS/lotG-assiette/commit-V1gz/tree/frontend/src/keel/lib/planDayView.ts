import type { WaveAssignment } from "../api/groceryWaves";
import type { EatingOccasion } from "../api/mealGeneration";
import type { PlanGrid, PlanGridCell } from "./planGridModel";

// LOT 1 — LA VUE PAR JOUR DU PLAN. Le modèle PUR: aucune I/O, aucune horloge,
// aucun aléa, aucun `t()`.
//
// ── CE QUE CE MODULE DÉCIDE, ET CE QU'IL NE DÉCIDE PAS ─────────────────────
// Il décide QUEL jour la vue ouvre, si une sélection encore en mémoire vaut
// toujours pour la fenêtre affichée, quelle VAGUE de courses tombe un jour
// donné, et ce que la grille dit des moments de ce jour. Il ne dérive AUCUNE
// liste de jours ni AUCUNE règle de vague: la liste vient de `windowDayOrder`,
// les vagues de `planGroceryWaves` (module serveur réexporté) — deux
// dérivations d'une même règle divergent, et c'est l'écran qui garde la
// vieille.
//
// ── « AUJOURD'HUI » EST UNE JOINTURE, PAS UNE DEVINETTE ────────────────────
// Le jour d'ouverture est celui dont la DATE (`windowDates`, jeton → date)
// est `today`. Sur un brouillon, l'appelant passe `today = startsOn`, donc le
// défaut tombe sur le premier jour du brouillon sans un octet de code en plus.

export type DaySelection = "all" | string;

/**
 * Le jour qu'on ouvre.
 *
 * `view: "week"` = la semaine entière, et c'est l'appelant qui le demande
 * (l'aperçu s'ouvre en semaine: on juge un brouillon en entier avant de
 * l'adopter). En vue jour: le jour d'aujourd'hui s'il est dans la fenêtre,
 * sinon le PREMIER jour du plan — jamais un jour du calendrier.
 */
export function defaultSelectedDay(args: {
  view: "week" | "day";
  /** Les jetons dans l'ordre du PLAN (`windowDayOrder`). */
  order: readonly string[];
  /** La table jeton → date (`windowDates`). */
  dates: Record<string, string>;
  today: string;
}): DaySelection {
  if (args.view === "week") return "all";
  const today = args.order.find((day) => args.dates[day] === args.today);
  return today ?? args.order[0] ?? "all";
}

/**
 * La sélection qui VAUT pour cette fenêtre.
 *
 * Une sélection survit au changement de plan (l'onglet « courant » →
 * « suivant » garde le même composant monté): un jeton qui n'existe pas dans
 * la nouvelle fenêtre retomberait sur un écran vide. On retombe sur le défaut,
 * jamais sur du vide.
 */
export function effectiveSelectedDay(args: {
  selected: DaySelection;
  order: readonly string[];
  dates: Record<string, string>;
  today: string;
}): DaySelection {
  if (args.selected === "all") return "all";
  if (args.order.includes(args.selected)) return args.selected;
  return defaultSelectedDay({
    view: "day",
    order: args.order,
    dates: args.dates,
    today: args.today,
  });
}

/**
 * LA VAGUE DE COURSES QUI TOMBE CE JOUR-LÀ — ou `null`.
 *
 * ⛔ LA JOINTURE EST UNE ÉGALITÉ DE DATES, ET RIEN D'AUTRE. Les vagues sont
 * indexées par DATE (`GroceryWave.buyOn`, `YYYY-MM-DD`); les jours du plan par
 * JETON (`mon..sun`). Le seul pont est `windowDates` — c'est l'appelant qui
 * convertit son jeton en date AVANT d'appeler, jamais un calcul maison ici.
 * `null` en entrée = un jeton hors fenêtre, qui n'a pas de date, donc pas de
 * vague.
 */
export function waveForDate(
  waves: readonly WaveAssignment[],
  date: string | null,
): WaveAssignment | null {
  if (!date) return null;
  return waves.find((wave) => wave.buyOn === date) ?? null;
}

/** Un moment du jour, et ce que sa case de grille dit. */
export interface DayMoment {
  slot: EatingOccasion;
  cell: PlanGridCell;
}

/**
 * LA COLONNE D'UN JOUR, lue dans la grille déjà construite.
 *
 * C'est ce qui donne à la vue jour le MOTIF d'un moment vide (absence, apport
 * fixe, restes, ou le vrai vide) sans recalculer quoi que ce soit: la grille
 * est déjà la source unique de ces quatre silences (`buildPlanGrid`), et une
 * seconde lecture des déclarations divergerait de la première.
 *
 * `[]` pour un jour hors grille ou sans jour: le groupe `day: null` n'a pas de
 * colonne, et ses plats valent pour la fenêtre entière.
 */
export function dayMoments(grid: PlanGrid, day: string | null): DayMoment[] {
  if (!day) return [];
  const at = grid.days.indexOf(day);
  if (at < 0) return [];
  return grid.rows.map((row) => ({ slot: row.slot, cell: row.cells[at] }));
}
