import { addDays, dayTokenOf } from "./dates";
import { type DayToken } from "./types";

// LA FENÊTRE D'UN PLAN DE REPAS — et qui est courant, et qui est suivant.
//
// MIROIR de `supabase/functions/_shared/keel/meal_plan_window.ts`. Les deux
// portent la même table de cas (`MEAL_WINDOW_FIXTURES`, dans les tests), et
// c'est elle qui empêche les deux de diverger.
//
// ===========================================================================
// CE QUE CE MODULE REMPLACE
// ===========================================================================
// La fenêtre d'un plan était une DÉDUCTION faite trois fois, différemment:
// `daysUntilSunday(today)` au moment de générer, `stretchStartDate(created_at)`
// au moment de rendre l'écran, `created_at.slice(0,10)` au moment de rapprocher
// une photo. Tant qu'un plan commençait toujours aujourd'hui, les trois
// tombaient juste. Depuis `20260807090000_meal_plan_window`, la ligne porte
// `starts_on` et `duration_days`: il n'y a plus qu'à lire.
//
// ===========================================================================
// « LE SUIVANT DEVIENT LE COURANT » N'EST PAS UN ÉVÉNEMENT
// ===========================================================================
// Ce sont les MÊMES lignes avec `today` avancé d'un jour. Aucun cron, aucun
// statut à écrire, donc rien qui puisse cesser d'être écrit — et chaque panne
// silencieuse de ce dépôt est exactement ça: un statut stocké dont un pivot
// avait supprimé l'écrivain.
//
// ===========================================================================
// PUR: L'HORLOGE EST PASSÉE, JAMAIS LUE
// ===========================================================================
// Aucune fonction d'ici n'appelle `new Date()`. `addDays` et `dayTokenOf`
// viennent de `dates.ts`, qui parse à MIDI UTC — l'invariant du dépôt, parce
// qu'à minuit un fuseau hôte décale le jour de la semaine d'un cran.

/** Les sept jetons, dans l'ordre du calendrier. */
export const WEEK_TOKENS: readonly DayToken[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];

/** Le plafond structurel d'une fenêtre. Voir la migration pour le pourquoi. */
export const MAX_WINDOW_DAYS = 7;

/**
 * Ce qu'une ligne de plan doit porter pour être SITUÉE DANS LE TEMPS.
 *
 * Pas d'`id`: la sélection n'en lit jamais un. Le générique porte l'identité de
 * l'appelant (`mealId` côté écran, `id` dans les fixtures), et l'exiger ici
 * obligerait chaque appelant à renommer son champ pour satisfaire un type qui
 * ne s'en sert pas.
 */
export interface MealPlanWindowRow {
  startsOn: string;
  durationDays: number;
  /** Non nul = la ligne a été REMPLACÉE. Ne dit rien sur « courante ». */
  retiredAt?: string | null;
  /** Départage deux lignes qui se disputeraient le même rang. */
  createdAt?: string | null;
}

/**
 * Où en est cette fenêtre par rapport à un jour donné.
 *
 * Miroir de `PlanWindowState` dans `provision-day-v1/provisioning.ts`: un plan
 * qui n'a pas commencé et un plan écoulé ne sont pas des erreurs — c'est un
 * calendrier, et cette date est en dehors.
 */
export type MealWindowState = "in_window" | "not_started" | "elapsed";

export function planEndsOn(startsOn: string, durationDays: number): string {
  return addDays(startsOn, Math.max(1, durationDays) - 1);
}

export function planWindowState(
  row: MealPlanWindowRow,
  today: string,
): MealWindowState {
  if (today < row.startsOn) return "not_started";
  if (today > planEndsOn(row.startsOn, row.durationDays)) return "elapsed";
  return "in_window";
}

export interface MealPlanSelection<T extends MealPlanWindowRow> {
  current: T | null;
  next: T | null;
  /** Fenêtres passées, de la plus récente à la plus ancienne. */
  elapsed: T[];
  /**
   * Ce qui ne devrait pas exister: deux plans vivants qui se chevauchent, ou
   * deux futurs. La contrainte d'exclusion l'interdit depuis le 2026-08-07,
   * donc c'est de la donnée antérieure. RENDU, JAMAIS JETÉ — un plan écarté en
   * silence est un plan dont personne ne saura qu'il a existé.
   */
  ambiguous: T[];
}

/**
 * Qui est courant, qui est suivant, pour ce jour-là.
 *
 * Les lignes RETIRÉES sont écartées d'emblée: elles ont été explicitement
 * remplacées, et les faire concourir ferait revivre un plan abandonné.
 */
export function selectMealPlans<T extends MealPlanWindowRow>(
  rows: readonly T[],
  today: string,
): MealPlanSelection<T> {
  const live = rows.filter((r) => !r.retiredAt);

  const running: T[] = [];
  const future: T[] = [];
  const elapsed: T[] = [];
  for (const row of live) {
    const state = planWindowState(row, today);
    if (state === "in_window") running.push(row);
    else if (state === "not_started") future.push(row);
    else elapsed.push(row);
  }

  // Le plus RÉCEMMENT démarré gagne chez les courants; le plus PROCHE chez les
  // futurs — c'est celui qui prendra la main.
  running.sort((a, b) =>
    b.startsOn.localeCompare(a.startsOn) ||
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
  );
  future.sort((a, b) =>
    a.startsOn.localeCompare(b.startsOn) ||
    String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
  );
  elapsed.sort((a, b) => b.startsOn.localeCompare(a.startsOn));

  return {
    current: running[0] ?? null,
    next: future[0] ?? null,
    elapsed,
    ambiguous: [...running.slice(1), ...future.slice(1)],
  };
}

/**
 * Le jeton de chaque jour de la fenêtre → sa date.
 *
 * REND MOINS DE SEPT ENTRÉES QUAND LA FENÊTRE EST PLUS COURTE, et c'est le
 * comportement porteur du chantier: un jeton hors fenêtre n'a pas de date, donc
 * le plat n'est ni rendu, ni cochable, ni rapprochable. C'est la fenêtre qui
 * cache les jours qu'un plan tronqué ne possède plus.
 */
export function windowDates(
  startsOn: string,
  durationDays: number,
): Record<string, string> {
  const out: Record<string, string> = {};
  const days = Math.min(MAX_WINDOW_DAYS, Math.max(1, durationDays));
  for (let i = 0; i < days; i++) {
    const date = addDays(startsOn, i);
    out[dayTokenOf(date)] = date;
  }
  return out;
}

/** Les jetons dans l'ordre du PLAN, pas du calendrier. */
export function windowDayOrder(
  startsOn: string,
  durationDays: number,
): DayToken[] {
  const days = Math.min(MAX_WINDOW_DAYS, Math.max(1, durationDays));
  return Array.from({ length: days }, (_, i) => dayTokenOf(addDays(startsOn, i)));
}

/**
 * Ce que la fenêtre possède, et ce qu'elle ne possède plus.
 *
 * `outsideWindow` existe pour que les plats d'un plan tronqué soient MONTRÉS
 * sous un libellé plutôt que de s'évaporer. La ligne les garde — y toucher
 * renumérote les clés de coche, qui sont positionnelles.
 */
export function windowSplit<T extends { day?: string | null }>(
  items: readonly T[],
  dates: Record<string, string>,
): { inWindow: T[]; outsideWindow: T[] } {
  const inWindow: T[] = [];
  const outsideWindow: T[] = [];
  for (const item of items) {
    // Un plat sans jour n'appartient à aucune date: il vaut pour la fenêtre
    // entière, et l'écarter le ferait disparaître d'un plan qui le contient.
    if (!item.day) inWindow.push(item);
    else if (dates[item.day]) inWindow.push(item);
    else outsideWindow.push(item);
  }
  return { inWindow, outsideWindow };
}

/** Ce que le client DEMANDE. La résolution qui fait foi vit côté serveur. */
export type MealWindowRequest =
  | { kind: "until_sunday" }
  | { kind: "days"; count: number }
  | { kind: "exact"; startsOn: string; durationDays: number };

/**
 * L'intention devient une fenêtre.
 *
 * ── CÔTÉ CLIENT, C'EST UN APERÇU ──────────────────────────────────────────
 * La fenêtre qui fait foi est résolue par `generate-meal-v1`, avec le fuseau de
 * l'élève. Celle-ci sert à écrire « lun 10 → dim 16 » sous les boutons. Les
 * deux doivent s'accorder au jour près, d'où le miroir et la table de cas
 * partagée.
 *
 * ── « UNTIL SUNDAY » UN DIMANCHE FAIT UN JOUR ─────────────────────────────
 * Et pas huit: un « plan de la semaine » qui voudrait dire deux choses selon le
 * jour du clic serait pire. Le sélecteur doit le DIRE, sinon il a l'air cassé.
 *
 * ── UN DÉPART DANS LE PASSÉ EST REFUSÉ ────────────────────────────────────
 * Sinon `isReportable` autoriserait des coches rétroactives sur des jours qu'un
 * plan précédent possédait.
 */
export function resolveRequestedWindow(
  request: MealWindowRequest,
  today: string,
): { startsOn: string; durationDays: number } {
  if (request.kind === "until_sunday") {
    const at = WEEK_TOKENS.indexOf(dayTokenOf(today));
    return { startsOn: today, durationDays: WEEK_TOKENS.length - at };
  }
  if (request.kind === "days") {
    const count = Math.round(request.count);
    if (!Number.isFinite(count) || count < 1 || count > MAX_WINDOW_DAYS) {
      throw new Error(`[keel/mealWindow] bad day count ${request.count}`);
    }
    return { startsOn: today, durationDays: count };
  }
  const days = Math.round(request.durationDays);
  if (!Number.isFinite(days) || days < 1 || days > MAX_WINDOW_DAYS) {
    throw new Error(`[keel/mealWindow] bad duration ${request.durationDays}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.startsOn)) {
    throw new Error(`[keel/mealWindow] bad start ${request.startsOn}`);
  }
  if (request.startsOn < today) {
    throw new Error(`[keel/mealWindow] start in the past: ${request.startsOn}`);
  }
  return { startsOn: request.startsOn, durationDays: days };
}
