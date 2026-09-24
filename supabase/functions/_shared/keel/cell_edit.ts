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
import type { CompositionIndex } from "./food_composition.ts";
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
  /**
   * ⟳ 2026-09-24 — CE QUE LE MODÈLE RENVOIE.
   *
   * `full_plan` : le chemin d'origine (une à trois cases nommées par la
   * personne). `cells_only` : l'ajustement par exclusion, qui peut toucher
   * vingt cases. Mesuré le 2026-09-24 sur le foyer `326427ff…` : redemander
   * la semaine entière (52 plats, ~80 à-côtés) fait rendre au modèle un
   * squelette vide une fois sur deux — il se croit limité en longueur. La
   * fusion (`mergeCellEdit` → `mergeRetryCells`) ne lit de toute façon que
   * les cases demandées et les casseroles qu'elles citent : le reste de la
   * réponse est jeté.
   *
   * ⛔ REQUIS. Optionnel, un appelant oublierait de choisir et retomberait en
   * silence sur le plan entier.
   */
  readonly returns: "full_plan" | "cells_only";
}): string {
  const lines = args.cells.map((c) =>
    `- ${c.day} ${c.slot} — they wrote: "${c.text.replace(/"/g, "'")}"`
  );
  const returnLines = args.returns === "full_plan"
    ? ["Return the FULL plan, in the same JSON shape as below."]
    : [
      // ⛔ LE PLANCHER DU CALENDRIER (« 35 cells… a FLOOR ») décrit le plan
      // entier, qui existe déjà. Sans cette ligne, il contredit « ces cases
      // seulement », et une consigne qui se contredit est exactement ce qui
      // faisait rendre des listes vides.
      "The calendar above (how many cells, the floor) describes the WHOLE plan, which already exists and is kept as it is: it does not apply to this answer.",
      "Return ONLY the listed cells, in the same JSON shape as below: every dish of each listed cell (the table's dish AND anyone's own dish on that cell — a dish of that cell you leave out is a meal that disappears), the preparations those dishes use, and the cooking sessions that cook those preparations. Do NOT return the other cells: the app keeps them exactly as they are.",
      "Every preparation a returned dish uses must be in your \"preparations\": when you keep one of THE PLAN unchanged, copy it exactly, same id. Never use a preparation that contains a food the household no longer eats.",
    ];
  return [
    "⛔ THIS PLAN IS ALREADY COMPOSED AND ACCEPTED. Do NOT compose a new one.",
    "The person asked for a change on ONLY these cells (rewrite the dishes of these cells and nothing else):",
    ...lines,
    "Rewrite the dishes of those cells — same day, same slot, same people served — so that what they wrote is satisfied, with the same effort and the same rules as the rest of the plan.",
    "A listed cell that has NO dish in THE PLAN below is an EMPTY cell the calendar still serves: WRITE its dish there, for the people the calendar names on that cell — a no-cook dish when no preparation can serve it. An empty cell is never an answer.",
    "Every other dish, preparation, cooking session and shopping line must come back EXACTLY as below: same titles, same ingredients, same quantities, same ids. If the change needs a new preparation, add it; never rename, resize or drop an existing one that another dish still uses.",
    ...returnLines,
    "",
    "THE PLAN:",
    args.planSourceText,
  ].join("\n");
}

/**
 * ⟳ 2026-09-24 — LES CASES À REFAIRE QUAND LA NOTE N'EST QU'UNE EXCLUSION.
 *
 * « Je n'aime pas le tofu » ne nomme aucune case : la phrase partait donc en
 * recomposition complète, qui ne garde rien du plan et qui, mesuré sur le
 * foyer `326427ff…`, rendait un plan vide 5 fois sur 8. Les cases sont celles
 * des plats que `servedExclusionBites` trouve fautifs dans le brouillon —
 * y compris ceux qui ne tiennent l'aliment que par une casserole commune :
 * `dishBitesExclusion` lit les préparations citées, donc TOUS les plats qui
 * puisent dans la casserole de tofu sont refaits, et la casserole n'est plus
 * citée par personne (la fusion l'élague).
 *
 * ⛔ PAS DE PLAFOND ICI, contrairement à `CELL_EDIT_MAX` : ce plafond protège
 * une phrase qui nommerait la moitié du plan. Ici c'est le plan lui-même qui
 * dit combien de cases servent l'aliment, et les refaire toutes est la seule
 * façon de tenir l'exclusion.
 *
 * PURE.
 */
export function exclusionEditCells(
  bites: readonly {
    readonly dish: string;
    readonly because: string | null;
    readonly matched: string;
    readonly day: string | null;
    readonly slot: string | null;
    /**
     * ⟳ 2026-09-24 — LE PRÉNOM de la personne dont c'est l'exclusion, `null`
     * pour une exclusion de toute la table. REQUIS : « Christèle ne mange plus
     * de saumon » et « la maison ne mange plus de saumon » ne demandent pas le
     * même plat, et le modèle doit savoir lequel des deux on lui demande.
     */
    readonly who: string | null;
  }[],
): CellEdit[] {
  const byCell = new Map<string, { day: DayToken; slot: RhythmOccasion; because: Set<string>; dishes: Set<string> }>();
  for (const b of bites) {
    const day = String(b.day ?? "");
    const slot = String(b.slot ?? "");
    if (!(DAY_TOKENS as readonly string[]).includes(day)) continue;
    if (!(RHYTHM_OCCASIONS as readonly string[]).includes(slot)) continue;
    const key = `${day}/${slot}`;
    const cell = byCell.get(key) ??
      { day: day as DayToken, slot: slot as RhythmOccasion, because: new Set<string>(), dishes: new Set<string>() };
    const food = `«${String(b.because ?? b.matched)}»`;
    cell.because.add(b.who === null ? `the household no longer eats ${food}` : `${b.who} no longer eats ${food}`);
    cell.dishes.add(b.dish);
    byCell.set(key, cell);
  }
  const dayRank = (d: string) => (DAY_TOKENS as readonly string[]).indexOf(d);
  const slotRank = (s: string) => (RHYTHM_OCCASIONS as readonly string[]).indexOf(s);
  return [...byCell.values()]
    .sort((a, b) => dayRank(a.day) - dayRank(b.day) || slotRank(a.slot) - slotRank(b.slot))
    .map((c) => ({
      day: c.day,
      slot: c.slot,
      text: `${[...c.because].join("; ")}; ` +
        `it is in ${[...c.dishes].map((t) => `«${t}»`).join(", ")}. ` +
        "Rewrite that dish so nobody is served what they no longer eat, and copy the other dishes of this cell exactly",
    }));
}

export interface CellEditOutcome {
  /** Le plan de départ, avec SEULEMENT les cases prises remplacées. */
  readonly meal: GeneratedMeal;
  /** Les cases demandées ET rendues ET connues (au plan ou au calendrier) — remplacées ou remplies. */
  readonly taken: readonly string[];
  /**
   * ⟳ 2026-09-21 — LES CASES PRISES QUI N'AVAIENT AUCUN PLAT AU DÉPART, un
   * sous-ensemble de `taken`. Mesuré sur `d65f57e2` : « il manque le repas
   * du mardi midi » visait une case que le calendrier sert et que le plan
   * laissait vide ; le modèle l'a écrite (20 plats contre 19) et la fusion
   * la refusait comme `unknown`. Une case que le calendrier liste est
   * connue, avec ou sans plat.
   */
  readonly filled: readonly string[];
  /** Demandées, connues, mais absentes de la réponse du modèle. */
  readonly notRendered: readonly string[];
  /** Demandées, mais ni au plan de départ ni au calendrier du foyer. */
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
 * ⛔ UNE CASE INCONNUE N'EST PAS PRISE, même si le modèle l'a rendue :
 * « refais le jeudi soir » sur un foyer où personne ne mange le jeudi soir
 * n'ajoute pas un repas — la personne demandait un changement, pas une case
 * de plus. ⟳ 2026-09-21 — « inconnue » se mesure au CALENDRIER, pas au plan :
 * une case que la grille sert et que le plan a laissée vide est un défaut du
 * plan, et « il manque le repas du mardi midi » est exactement la demande de
 * la remplir.
 */
export function mergeCellEdit(args: {
  readonly base: GeneratedMeal;
  readonly retry: GeneratedMeal;
  readonly cells: readonly CellEdit[];
  /**
   * ⟳ 2026-09-21 — LES CASES QUE LE CALENDRIER DU FOYER SERT sur cette
   * fenêtre (au moins un mangeur). ⛔ REQUIS : optionnel, une case vide
   * redeviendrait « inconnue » et le refus reprendrait en silence.
   */
  readonly calendar: readonly { readonly day: string; readonly slot: string }[];
  /**
   * ⟳ 2026-09-12 · C3 — LE RÉFÉRENTIEL, TRAVERSÉ JUSQU'À LA FUSION.
   *
   * ⛔ REQUIS, PAS OPTIONNEL. Un appelant sans référentiel passe `null`
   * EXPLICITEMENT : l'abstention est écrite là où elle est décidée. Un
   * paramètre facultatif ici aurait laissé la chirurgie locale sur l'ancien
   * appariement par libellé — « paramètre de garde optionnel = garde
   * désarmée », la cicatrice n° 1 du dépôt.
   */
  readonly index: CompositionIndex | null;
}): CellEditOutcome {
  const baseCells = new Set(args.base.dishes.map(cellEditKey));
  const calendarCells = new Set(args.calendar.map(cellEditKey));
  const retryCells = new Set(args.retry.dishes.map(cellEditKey));
  const requested = [...new Set(args.cells.map(cellEditKey))];
  const unknown = requested.filter((k) => !baseCells.has(k) && !calendarCells.has(k));
  const known = requested.filter((k) => baseCells.has(k) || calendarCells.has(k));
  const notRendered = known.filter((k) => !retryCells.has(k));
  const taken = known.filter((k) => retryCells.has(k));
  const merge = mergeRetryCells({
    base: args.base,
    retry: args.retry,
    cells: taken,
    index: args.index,
  });
  const takenSet = new Set(merge.cells);
  const untouched = args.base.dishes.filter((d) => !takenSet.has(cellEditKey(d))).length;
  const filled = merge.cells.filter((k) => !baseCells.has(k));
  return { meal: merge.meal, taken: merge.cells, filled, notRendered, unknown, untouched, merge };
}
