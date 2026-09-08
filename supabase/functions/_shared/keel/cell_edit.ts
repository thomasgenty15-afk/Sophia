/**
 * LA CHIRURGIE LOCALE — une case du plan, refaite ; tout le reste, INTACT.
 * 2026-09-09 · lot « chirurgie locale, fusion par construction ».
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LE FAIT QUI COMMANDE CE MODULE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Mesuré le 2026-09-09 (`26-localite.sh`, foyer duo, deux jours) : deux
 * compositions aux entrées STRICTEMENT identiques ne partagent AUCUN plat
 * (0 sur 6). « Change seulement le vendredi soir » ne peut donc pas être tenu
 * par une recomposition, quelle que soit la façon de ranger la phrase : le
 * bruit seul réécrit tout.
 *
 * Et un modèle à qui l'on demande de ne pas toucher au reste LE TOUCHE quand
 * même — ce dépôt l'a mesuré sur la relance des cases (« nothing else
 * changes » ignoré, `appendDedicatedDishes`). D'où les deux couches :
 *
 *   1. LE MODÈLE reçoit le plan entier, les cases visées, la phrase, et la
 *      consigne de ne réécrire que ces cases (`cellEditInstruction`) — pour
 *      qu'il sache QUOI garder, et compose la case neuve dans son contexte
 *      (mêmes casseroles, même semaine).
 *   2. LE CODE ne prend de sa réponse que les cases demandées
 *      (`mergeCellEdit` → `mergeRetryCells`) et recopie tout le reste depuis
 *      le plan de départ, octet pour octet. Une case non demandée que le
 *      modèle aurait réécrite est IGNORÉE par construction, pas par consigne.
 *
 * ⛔ CE MODULE EST PUR. Ni E/S, ni modèle : il lit une demande, écrit une
 * consigne, fusionne deux plans. Le générateur tient le reste (charger le
 * brouillon de départ, appeler le modèle, rejouer les ceintures sur le plan
 * fusionné).
 */

import type { GeneratedMeal } from "./meal_generation.ts";
import { type MergeOutcome, mergeRetryCells } from "./retry_merge.ts";
import { DAY_TOKENS, type DayToken } from "./tokens.ts";
import { RHYTHM_OCCASIONS, type RhythmOccasion } from "./retained_item.ts";

/**
 * ⚠️ TROIS CASES AU PLUS PAR REPRISE. Une phrase qui en vise plus réécrit la
 * moitié du plan : ce n'est plus une chirurgie, c'est une recomposition qui
 * ne dit pas son nom — et elle coûterait autant au modèle en gardant la
 * promesse « le reste est identique » sur trois cases seulement.
 */
export const CELL_EDIT_MAX = 3;

export const CELL_EDIT_TEXT_MAX_CHARS = 280;

export interface CellEdit {
  readonly day: DayToken;
  readonly slot: RhythmOccasion;
  /** Ce que la personne a écrit POUR cette case — ses mots, donnés au modèle. */
  readonly text: string;
}

/** La clé d'une case, la MÊME que `retry_merge` (`day/slot`). */
export const cellEditKey = (c: { day: string | null; slot: string | null }): string =>
  `${c.day ?? ""}/${c.slot ?? ""}`;

export interface CellEditRefusals {
  readonly total: number;
  readonly malformed: number;
  readonly badDay: number;
  readonly badSlot: number;
  readonly badText: number;
  readonly duplicate: number;
  readonly tooMany: number;
}

export interface CellEditReading {
  readonly cells: readonly CellEdit[];
  readonly refused: CellEditRefusals;
}

/**
 * LES CASES DEMANDÉES, LUES D'UN CORPS DE REQUÊTE. Défensif dans une seule
 * direction : ce qu'on ne sait pas lire tombe SEUL et se compte ; jamais un
 * repli (« le jeudi » sans créneau n'est pas « le jeudi midi »).
 */
export function readCellEdits(raw: unknown): CellEditReading {
  const r = { malformed: 0, badDay: 0, badSlot: 0, badText: 0, duplicate: 0, tooMany: 0 };
  const cells: CellEdit[] = [];
  const seen = new Set<string>();
  for (const row of Array.isArray(raw) ? raw : []) {
    if (!row || typeof row !== "object") {
      r.malformed += 1;
      continue;
    }
    const rec = row as Record<string, unknown>;
    const day = String(rec.day ?? "").trim().toLowerCase();
    const slot = String(rec.slot ?? "").trim().toLowerCase();
    const text = String(rec.text ?? "").trim();
    if (!(DAY_TOKENS as readonly string[]).includes(day)) {
      r.badDay += 1;
      continue;
    }
    if (!(RHYTHM_OCCASIONS as readonly string[]).includes(slot)) {
      r.badSlot += 1;
      continue;
    }
    if (text === "" || text.length > CELL_EDIT_TEXT_MAX_CHARS) {
      r.badText += 1;
      continue;
    }
    const key = `${day}/${slot}`;
    if (seen.has(key)) {
      r.duplicate += 1;
      continue;
    }
    if (cells.length >= CELL_EDIT_MAX) {
      r.tooMany += 1;
      continue;
    }
    seen.add(key);
    cells.push({ day: day as DayToken, slot: slot as RhythmOccasion, text });
  }
  const total = r.malformed + r.badDay + r.badSlot + r.badText + r.duplicate + r.tooMany;
  return { cells, refused: { total, ...r } };
}

/**
 * LA CONSIGNE AU MODÈLE — le plan entier, les cases, la phrase.
 *
 * ⛔ LA PROMESSE TOUCHE LA LISTE : « ONLY these cells » est écrit SUR la ligne
 * qui les nomme, pas trois paragraphes plus bas (règle d'adjacence de ce
 * dépôt, mesurée à 0 % sinon). Et la consigne demande le PLAN ENTIER en
 * retour, dans la même forme : c'est ce que le parseur sait lire, et c'est
 * ce dont la fusion a besoin pour retrouver la case par sa clé.
 *
 * ⚠️ ELLE NE PROMET PAS QUE LE RESTE SERA INTACT — c'est la fusion qui le
 * garantit. Elle le DEMANDE, pour que la case neuve soit composée dans le
 * contexte des autres (une casserole du samedi peut la nourrir).
 */
export function cellEditInstruction(args: {
  readonly planSourceText: string;
  readonly cells: readonly CellEdit[];
}): string {
  const lines = args.cells.map((c) =>
    `- ${c.day} ${c.slot} — they wrote: "${c.text.replace(/"/g, "'")}"`
  );
  return [
    "⛔ THIS PLAN IS ALREADY COMPOSED AND ACCEPTED. Do NOT compose a new one.",
    "The person asked for a change on ONLY these cells (rewrite the dishes of these cells and nothing else):",
    ...lines,
    "Rewrite the dishes of those cells — same day, same slot, same people served — so that what they wrote is satisfied, with the same effort and the same rules as the rest of the plan.",
    "Every other dish, preparation, cooking session and shopping line must come back EXACTLY as below: same titles, same ingredients, same quantities, same ids. If the change needs a new preparation, add it; never rename, resize or drop an existing one that another dish still uses.",
    "Return the FULL plan, in the same JSON shape as below.",
    "",
    "THE PLAN:",
    args.planSourceText,
  ].join("\n");
}

export interface CellEditOutcome {
  /** Le plan de départ, avec SEULEMENT les cases prises remplacées. */
  readonly meal: GeneratedMeal;
  /** Les cases demandées ET rendues ET existantes au départ — remplacées. */
  readonly taken: readonly string[];
  /** Demandées, existantes, mais absentes de la réponse du modèle. */
  readonly notRendered: readonly string[];
  /** Demandées, mais aucun plat à cette case dans le plan de départ. */
  readonly unknown: readonly string[];
  /** Les plats du départ qui ne bougent pas — à recompter à l'arrivée. */
  readonly untouched: number;
  readonly merge: MergeOutcome;
}

/**
 * LA FUSION PAR CONSTRUCTION. On ne prend de `retry` que les cases demandées
 * qui existent dans `base` ; `mergeRetryCells` importe leurs casseroles,
 * sessions et courses et élague ce que la case remplacée laissait orphelin.
 *
 * ⛔ UNE CASE INCONNUE AU DÉPART N'EST PAS PRISE, même si le modèle l'a rendue :
 * « refais le jeudi soir » sur un plan qui n'a pas de jeudi soir n'ajoute pas
 * un repas — la personne demandait un changement, pas une case de plus.
 */
export function mergeCellEdit(args: {
  readonly base: GeneratedMeal;
  readonly retry: GeneratedMeal;
  readonly cells: readonly CellEdit[];
}): CellEditOutcome {
  const baseCells = new Set(args.base.dishes.map(cellEditKey));
  const retryCells = new Set(args.retry.dishes.map(cellEditKey));
  const requested = [...new Set(args.cells.map(cellEditKey))];
  const unknown = requested.filter((k) => !baseCells.has(k));
  const known = requested.filter((k) => baseCells.has(k));
  const notRendered = known.filter((k) => !retryCells.has(k));
  const taken = known.filter((k) => retryCells.has(k));
  const merge = mergeRetryCells({ base: args.base, retry: args.retry, cells: taken });
  const takenSet = new Set(merge.cells);
  const untouched = args.base.dishes.filter((d) => !takenSet.has(cellEditKey(d))).length;
  return { meal: merge.meal, taken: merge.cells, notRendered, unknown, untouched, merge };
}
