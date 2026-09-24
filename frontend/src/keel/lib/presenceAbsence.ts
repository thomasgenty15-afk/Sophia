import type { EatingOccasion } from "../api/mealGeneration";
import { type AwayMark, type PresenceState, presenceStateOf } from "./presenceMarks";

// ── « ABSENCE » — UNE PERSONNE HORS DE TOUT LE PLAN (2026-09-23) ───────────
//
// Demandé: pouvoir retirer quelqu'un du plan en un geste (vacances, séjour
// ailleurs), sans ouvrir la grille pour décocher chaque repas.
//
// ⚠️ PAS DE NOUVELLE COLONNE. Une absence sur tout le plan, c'est chaque jour
// de la fenêtre marqué « journée entière » (`slots: []`) dans la colonne que la
// ligne édite déjà. Le serveur sait déjà quoi en faire: une bouche sans aucun
// repas sur la fenêtre sort du plan (`presence.absentAllWindow`, puis
// `platedMembers` dans `generate-household-meal-v1`), et une fenêtre où
// personne ne mange est refusée (`window_fully_away`).
//
// ⚠️ LES JOURS HORS FENÊTRE SONT REPRIS TELS QUELS, même règle que
// `mergeAwayMarks`: une absence posée pour cette semaine n'efface pas
// « mardi midi » ailleurs.
//
// PURE: no I/O, no clock, no randomness.

/**
 * Combien de repas cette personne manque DANS la fenêtre. Une journée entière
 * (`slots: []`) compte pour autant de repas qu'elle en prend par jour.
 */
export function awayMomentsIn(
  marks: readonly AwayMark[],
  days: readonly string[],
  slotCount: number,
): number {
  const inWindow = new Set<string>(days);
  return marks
    .filter((a) => inWindow.has(a.day))
    .reduce((n, a) => n + (a.slots.length === 0 ? slotCount : a.slots.length), 0);
}

/**
 * VRAI QUAND LA PERSONNE NE MANGE À AUCUN REPAS DE LA FENÊTRE — la même
 * définition que le serveur (`absentAllWindow`: « aucune case »).
 *
 * ⚠️ Sans jour ou sans repas, rien n'est dit absent: il n'y a pas de case.
 */
export function isAwayAllWindow(
  marks: readonly AwayMark[],
  days: readonly string[],
  slots: readonly EatingOccasion[],
): boolean {
  if (days.length === 0 || slots.length === 0) return false;
  return days.every((day) =>
    slots.every((slot) => presenceStateOf(marks, day, slot) !== "at_table")
  );
}

/** Chaque jour de la fenêtre marqué absent, journée entière. */
export function markAwayAllWindow(
  marks: readonly AwayMark[],
  days: readonly string[],
): AwayMark[] {
  return [
    ...outsideWindow(marks, days),
    ...days.map((day): AwayMark => ({ day, slots: [], kind: "away" })),
  ];
}

/**
 * L'ABSENCE LEVÉE: la personne revient à tous les repas de la fenêtre.
 *
 * ⚠️ Les repas décochés un par un avant l'absence ne reviennent pas: annuler
 * l'absence rend la fenêtre entière « à table ». La grille reste là pour en
 * redécocher.
 */
export function clearWindow(
  marks: readonly AwayMark[],
  days: readonly string[],
): AwayMark[] {
  return outsideWindow(marks, days);
}

function outsideWindow(
  marks: readonly AwayMark[],
  days: readonly string[],
): AwayMark[] {
  const inWindow = new Set<string>(days);
  return marks
    .filter((m) => !inWindow.has(m.day))
    .map((m) => ({ day: m.day, slots: [...m.slots], kind: m.kind }));
}

// ── LES CASES D'EN-TÊTE DE LA GRILLE (`MealPickerGrid`) ─────────────────────

/** Une case de la grille: `[jour, créneau]`. */
export type GridCell = readonly [day: string, slot: string];

/**
 * L'ÉTAT D'UNE LIGNE OU D'UNE COLONNE: toute à table, aucune, ou mêlée.
 * Une case absente de `state` est à table (même convention que la base).
 */
export function lineStateOf(
  state: ReadonlyMap<string, PresenceState>,
  cells: readonly GridCell[],
): "all" | "none" | "mixed" {
  const on = cells.filter(([d, s]) => !state.has(`${d}|${s}`)).length;
  return on === cells.length ? "all" : on === 0 ? "none" : "mixed";
}

/**
 * CE QUE LA CASE D'EN-TÊTE ÉCRIT SUR TOUTE SA LIGNE: tant qu'un repas de la
 * ligne est encore à table, elle la retire en entier; une ligne déjà
 * entièrement retirée revient à table.
 *
 * ⚠️ UNE LIGNE MÊLÉE SE RETIRE, elle ne revient pas. Le geste demandé est
 * « je décoche dîner et toute la ligne s'enlève »: si le vendredi soir était
 * déjà décoché, remettre la ligne à table au premier clic ferait l'inverse.
 */
export function lineToggleTarget(
  state: ReadonlyMap<string, PresenceState>,
  cells: readonly GridCell[],
): PresenceState {
  return lineStateOf(state, cells) === "none" ? "at_table" : "away";
}
