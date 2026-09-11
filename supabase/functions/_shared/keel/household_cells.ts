/**
 * QUI MANGE QUOI, CASE PAR CASE — la grille du foyer. Module PUR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ LOT 9 (2026-09-07) — POURQUOI CE MODULE EXISTE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La méthode du foyer (`docs/keel/METHODE-GENERATION-DE-PLAN-SOLO.md`, § « Le
 * foyer ») pose que **le moteur décide les cases, le modèle les lit**. Une case
 * est un jour × un moment; ses mangeurs sont les bouches présentes ce jour-là
 * qui ont déclaré ce moment. Une case sans mangeur n'a pas de plat.
 *
 * ── TROIS IDÉES DE « QUI MANGE QUAND », ET ELLES NE SE PARLAIENT PAS ──────
 * Avant ce lot, la lane portait la même question à trois endroits:
 *
 *   · `resolveWindowPresence` — le bloc de prompt et `servings`, sur le rythme
 *     de la MAISON pour tout le monde;
 *   · `compositionEaterCells` — avant le prompt, mais pour les seuls porteurs
 *     d'un plat dédié, et seulement pour en compter le budget;
 *   · `mouthCells` — la vraie grille par bouche, calculée **2 400 lignes après
 *     le prompt**, et lue par les seuls invariants (`mealsDelivered`,
 *     `swapPresence`).
 *
 * Aucune des trois n'était disponible au moment où le prompt s'écrit. Ce module
 * les fait descendre d'un seul objet, calculé **une fois, avant le prompt**.
 * `mouthCells` en devient une PROJECTION, et un test le prouve — pas un second
 * calcul qui divergerait au premier ajustement.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE QUE CE MODULE NE FAIT PAS
 * ══════════════════════════════════════════════════════════════════════════
 *   · Il ne compose rien, ne pèse rien, ne retire aucun aliment. Il rend des
 *     ENSEMBLES DE BOUCHES et des jetons; l'appelant en fait un prompt, un
 *     dimensionnement ou un compteur.
 *   · Il ne décide AUCUNE absence. `memberMealCells` (`household_presence.ts`)
 *     porte déjà `isAway`, et son `away.effective` compte les repas pris
 *     dehors. Un second parcours ici rendrait deux grilles.
 *   · Il ne lit pas l'heure, ne connaît ni la coupure de 18 h ni le jour de
 *     cuisine. L'appelant lui passe les jours et les moments déjà retenus.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import { type MealCell, memberMealCells } from "./household_presence.ts";
import { type ExpectedDish, mouthsFedByDish } from "./box_expected.ts";
import type { DietaryRegime } from "./dietary_regime.ts";
import { regimeCovers, regimeStrictness } from "./household_diet.ts";
import type { AwayDay, EatingOccasionSlot } from "./meal_generation.ts";

// ═══════════════════════════════════════════════════════════════════════════
// LE VOCABULAIRE, FERMÉ
// ═══════════════════════════════════════════════════════════════════════════

/** Le caractère d'une case: ce que la recette de son plat partagé doit viser. */
export const CELL_CHARACTERS = ["light", "normal"] as const;
export type CellCharacter = (typeof CELL_CHARACTERS)[number];

/**
 * POURQUOI UNE BOUCHE A UN PLAT À ELLE DANS CETTE CASE.
 *
 * ⛔ DEUX MOTIFS, ET ILS NE SE RÉPARENT PAS PAREIL. `regime` est une
 * impossibilité (le plat de la table lui est interdit); `own_meal` est une
 * déclaration (« mon petit-déjeuner à moi »). Les fondre ferait lire « trois
 * personnes ne peuvent pas manger le plat commun » sur un foyer où deux ont
 * simplement leur habitude.
 */
export const DEDICATED_REASONS = ["regime", "own_meal"] as const;
export type DedicatedReason = (typeof DEDICATED_REASONS)[number];

/**
 * UNE CASE EST LÉGÈRE SEULEMENT SI **TOUS** SES MANGEURS LE SONT.
 *
 * ── L'ARBITRAGE, ET IL A ÉTÉ PRIS CONTRE L'AUTRE LECTURE ──────────────────
 * L'autre règle possible était « légère si le titulaire l'est ». Elle est plus
 * simple et elle est fausse dans une seule direction: elle sert une recette
 * allégée à des gens qui n'ont rien demandé. Une personne « léger » à une table
 * qui ne l'est pas reçoit **moins de la même recette** — c'est son facteur qui
 * porte sa demande, pas la casserole.
 *
 * ⚠️ CETTE CONSTANTE EST UNE DÉCISION, PAS UN RÉGLAGE. La mettre à `false`
 * demanderait de réécrire `cellCharacterFor`, pas seulement de la retourner:
 * elle est ici pour être NOMMÉE dans le journal et épinglée par un test.
 */
export const CELL_LIGHT_REQUIRES_ALL_EATERS = true;

// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LE MODULE LIT D'UNE BOUCHE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ TOUS LES CHAMPS SONT REQUIS, aucun `?`. Un défaut silencieux sur
 * `lightSlots` ou `ownMealSlots` ferait une grille qui ressemble à une grille
 * qui marche — c'est la cicatrice « paramètre de garde optionnel = garde
 * désarmée », et elle a déjà coûté trois lots à ce dépôt.
 */
export interface CellMouth {
  memberId: string;
  /**
   * LES MOMENTS QU'ELLE A DÉCLARÉS. `null` = elle suit la maison.
   *
   * ⚠️ `null` ET `[]` NE DISENT PAS LA MÊME CHOSE, et `memberMealCells` le sait
   * déjà: `null` retombe sur le rythme de la maison, `[]` veut dire « aucun
   * moment », donc aucune case.
   */
  eatingSlots: readonly EatingOccasionSlot[] | null;
  /** Ses absences EFFECTIVES — repas pris dehors compris (`away.effective`). */
  away: readonly AwayDay[];
  /** Les moments qu'elle a marqués « repas léger ». */
  lightSlots: readonly string[];
  /** Son régime déclaré, `null` = rien de déclaré. */
  diet: DietaryRegime | null;
  /** Les moments où elle a déclaré son propre repas (`ownMealSlots`). */
  ownMealSlots: readonly string[];
}

/** Une bouche qui a un plat à elle dans cette case, et pourquoi. */
export interface DedicatedMouth {
  memberId: string;
  reason: DedicatedReason;
}

export interface HouseholdCell {
  /** `<jour>/<moment>` — la MÊME clé que `retry_merge` et `meals_delivered`. */
  key: string;
  day: string;
  slot: string;
  /** Les bouches qui mangent ici, triées, dédupliquées. */
  eaters: string[];
  /**
   * LE RÉGIME QUE LE PLAT PARTAGÉ DE CETTE CASE DOIT SUIVRE.
   *
   * ⛔ LE MAJORITAIRE, PAS LE PLUS STRICT — et c'est un RENVERSEMENT, décidé le
   * 2026-09-07. `strictestRegimeAt` (R4) fait suivre la casserole au plus
   * strict de tout le foyer: une table de quatre dont une personne est végane
   * mange végane toute la semaine, et seuls les omnivores qui ont déclaré une
   * exigence contraire reçoivent un plat à eux. La décision produit inverse la
   * charge: **la minorité stricte a son plat**.
   *
   * ⚠️ CE N'EST PAS UNE PERTE DE SÉCURITÉ, et la raison est structurelle: les
   * exclusions des régimes sont EMBOÎTÉES (`pescatarian ⊂ vegetarian ⊂ vegan`,
   * prouvé paire par paire dans `household_diet_test.ts`). Une bouche MOINS
   * stricte que sa case peut donc manger le plat de sa case; l'inverse est
   * faux, et c'est exactement la population que `dedicated` nomme.
   *
   * ⚠️ ET L'ALLERGIE N'EST PAS ICI. Elle ne dédie jamais: l'union de sécurité
   * retire l'allergène de LA CASSEROLE, fail-closed, avant tout ceci.
   */
  regime: DietaryRegime | null;
  /** Les bouches à qui cette case doit un plat à elles. Triées par `memberId`. */
  dedicated: DedicatedMouth[];
  character: CellCharacter;
  /** Aucune bouche ne mange ici. `dedicated` est alors vide, et il n'y a pas de plat. */
  empty: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// LES COMPTEURS — tous présents, même à zéro
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ UN COMPTEUR QUI NE NOMMERAIT QUE LE NON-VIDE NE DISTINGUE PAS « la
 * grille n'a rien trouvé » de « la grille n'a pas tourné ». Les deux se
 * réparent à des endroits opposés.
 */
export interface CellCounters {
  cells: number;
  non_empty: number;
  empty: number;
  light: number;
  /**
   * LES CASES OÙ QUELQU'UN A DEMANDÉ « LÉGER » ET NE L'OBTIENT PAS, parce
   * qu'un autre mangeur ne l'a pas demandé. C'est le prix de
   * `CELL_LIGHT_REQUIRES_ALL_EATERS`, et il doit se lire.
   */
  light_mixed: number;
  eaters_hist: { "1": number; "2": number; "3": number; "4_plus": number };
  dedicated_cells: number;
  dedicated_mouths: number;
  dedicated_by_reason: Record<DedicatedReason, number>;
  one_eater_cells: number;
  /** Les cases qui tombent sur le jour de cuisine — la veille ne se mange pas. */
  cook_day_cells: number;
  /** Les cases retirées parce que le moment du premier jour est déjà passé. */
  spent_cells: number;
  /** Le régime majoritaire par case: jeton, ou `none`. */
  regime_by_cell: Record<string, number>;
}

export interface HouseholdCellsOutcome {
  cells: HouseholdCell[];
  /** La grille PAR BOUCHE — la projection que `mouthCells` lit. */
  byMouth: { memberId: string; regime: DietaryRegime | null; cells: MealCell[] }[];
  counters: CellCounters;
}

function zeroCounters(): CellCounters {
  const byReason = {} as Record<DedicatedReason, number>;
  for (const r of DEDICATED_REASONS) byReason[r] = 0;
  return {
    cells: 0,
    non_empty: 0,
    empty: 0,
    light: 0,
    light_mixed: 0,
    eaters_hist: { "1": 0, "2": 0, "3": 0, "4_plus": 0 },
    dedicated_cells: 0,
    dedicated_mouths: 0,
    dedicated_by_reason: byReason,
    one_eater_cells: 0,
    cook_day_cells: 0,
    spent_cells: 0,
    regime_by_cell: {},
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LES TROIS RÈGLES, CHACUNE ÉCRITE UNE FOIS
// ═══════════════════════════════════════════════════════════════════════════

export function cellKeyOf(day: string, slot: string): string {
  return `${day}/${slot}`;
}

/**
 * LE RÉGIME DU PLAT PARTAGÉ D'UNE CASE — le MAJORITAIRE de ses mangeurs.
 *
 * Égalité ⇒ le plus strict. Ce n'est pas de la prudence décorative: à deux
 * véganes contre deux omnivores, servir omnivore obligerait à cuisiner DEUX
 * plats dédiés là où un seul plat végane nourrit les quatre.
 *
 * `[]` ⇒ `null`, et l'appelant sait que la case est vide.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function cellRegimeFor(
  diets: readonly (DietaryRegime | null)[],
): DietaryRegime | null {
  if (diets.length === 0) return null;
  const tally = new Map<string, number>();
  for (const d of diets) {
    const key = d ?? "";
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  let best: DietaryRegime | null = null;
  let bestCount = -1;
  for (const [key, count] of tally) {
    const regime = key === "" ? null : (key as DietaryRegime);
    // ⛔ LE DÉPARTAGE EST EXPLICITE, JAMAIS L'ORDRE DE LA `Map`. Une égalité
    // tranchée par l'ordre d'insertion rendrait le régime d'une case
    // dépendant de l'ordre du roster — un plan qui change parce qu'on a
    // ajouté quelqu'un, sans qu'une seule ligne de test bouge.
    if (
      count > bestCount ||
      (count === bestCount && regimeStrictness(regime) > regimeStrictness(best))
    ) {
      best = regime;
      bestCount = count;
    }
  }
  return best;
}

/**
 * LE CARACTÈRE D'UNE CASE. Voir `CELL_LIGHT_REQUIRES_ALL_EATERS`.
 *
 * `[]` ⇒ `normal`: une case vide n'a pas de plat, et « léger » n'y veut rien
 * dire. Rendre `light` ferait compter une demande que personne n'a faite.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function cellCharacterFor(
  slot: string,
  eaters: readonly CellMouth[],
): CellCharacter {
  if (eaters.length === 0) return "normal";
  return eaters.every((m) => m.lightSlots.includes(slot)) ? "light" : "normal";
}

/**
 * LES BOUCHES À QUI CETTE CASE DOIT UN PLAT À ELLES.
 *
 * Deux motifs, et une bouche ne sort qu'UNE fois: `regime` l'emporte sur
 * `own_meal`, parce qu'une impossibilité ne devient pas une habitude quand la
 * personne a aussi déclaré son propre repas.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function dedicatedInCell(
  slot: string,
  eaters: readonly CellMouth[],
  regime: DietaryRegime | null,
): DedicatedMouth[] {
  const out: DedicatedMouth[] = [];
  const seen = new Set<string>();
  for (const m of eaters) {
    // ⟳ 2026-09-08 — ÉTAIT `regimeStrictness(m.diet) > regimeStrictness(regime)`.
    // C'EST LA LIGNE DE SÉCURITÉ DE CE FICHIER: elle décide qui reçoit un plat
    // à soi. Un compte de groupes exclus ne l'ordonne correctement que sur un
    // axe emboîté; `gluten_free` n'exclut AUCUN groupe (sa garantie est dans
    // les formes de surface), donc il comptait zéro et personne ne recevait
    // son plat. Voir `REGIME_COVERS` dans `household_diet.ts`.
    if (!regimeCovers(regime, m.diet)) {
      out.push({ memberId: m.memberId, reason: "regime" });
      seen.add(m.memberId);
    }
  }
  for (const m of eaters) {
    if (seen.has(m.memberId)) continue;
    if (m.ownMealSlots.includes(slot)) {
      out.push({ memberId: m.memberId, reason: "own_meal" });
      seen.add(m.memberId);
    }
  }
  out.sort((a, b) => a.memberId.localeCompare(b.memberId));
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// LA GRILLE
// ═══════════════════════════════════════════════════════════════════════════

export interface HouseholdCellsInput {
  mouths: readonly CellMouth[];
  /** Le rythme de la maison, pour les bouches qui n'ont rien déclaré. */
  houseRhythm: readonly EatingOccasionSlot[];
  /** Les jours de la fenêtre, en jetons, dans l'ordre. */
  windowDays: readonly string[];
  /**
   * LES MOMENTS QUE LA GRILLE NOMME, même quand personne n'y mange.
   *
   * ⚠️ IL FAUT LES NOMMER, ET C'EST LE POINT DU CALENDRIER: « personne ne mange
   * ici, n'écris pas de plat » est une consigne; l'absence de ligne n'en est
   * pas une, et le modèle comble les silences.
   */
  gridSlots: readonly string[];
  /**
   * LES MOMENTS DÉJÀ PASSÉS DU PREMIER JOUR — la coupure de 18 h, résolue chez
   * l'appelant (`plan_hours.ts`). `day: null` = rien à retirer.
   */
  spentSlots: { day: string | null; slots: readonly string[] };
  /** Le jour où l'on cuisine sans manger, ou `null`. Compté, jamais filtré. */
  cookOnlyDay: string | null;
}

/**
 * LA GRILLE DU FOYER, calculée UNE FOIS, avant le prompt.
 *
 * ⛔ LE FILTRE DES MOMENTS PASSÉS EST CELUI DE `mouthCells`, OCTET POUR OCTET.
 * C'est ce qui rend la projection vraie, et un test la vérifie sur trois
 * foyers. Le jour où l'un des deux bouge sans l'autre, la grille du prompt et
 * celle des invariants ne parleraient plus du même plan.
 *
 * ⚠️ LE JOUR DE CUISINE N'EST PAS RETIRÉ, et c'est délibéré: `mouthCells` ne le
 * retire pas non plus aujourd'hui. Il est COMPTÉ (`cook_day_cells`) pour que le
 * lot du calendrier décide en connaissance de cause — un filtre ajouté ici
 * casserait la projection en silence.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function householdCells(
  input: HouseholdCellsInput,
): HouseholdCellsOutcome {
  const counters = zeroCounters();
  const spentDay = input.spentSlots.day;
  const spent = new Set(input.spentSlots.slots);

  // ── ① LA GRILLE PAR BOUCHE — la projection que `mouthCells` lit ──────────
  const byMouth = input.mouths.map((m) => {
    const raw = memberMealCells({
      away: m.away,
      rhythm: m.eatingSlots ?? input.houseRhythm,
      windowDays: input.windowDays,
    });
    const kept = raw.filter((c) =>
      !(spent.size > 0 && spentDay !== null && c.day === spentDay &&
        spent.has(String(c.slot)))
    );
    counters.spent_cells += raw.length - kept.length;
    return { memberId: m.memberId, regime: m.diet, cells: kept };
  });

  // ── ② LES MANGEURS DE CHAQUE CASE ───────────────────────────────────────
  const eatersByKey = new Map<string, CellMouth[]>();
  const mouthById = new Map(input.mouths.map((m) => [m.memberId, m]));
  for (const row of byMouth) {
    const mouth = mouthById.get(row.memberId);
    if (!mouth) continue;
    for (const c of row.cells) {
      const key = cellKeyOf(c.day, String(c.slot));
      const list = eatersByKey.get(key) ?? [];
      // ⚠️ DÉDUPLICATION PAR BOUCHE: `memberMealCells` ne rend jamais deux fois
      // la même case, mais un rythme mal résolu en amont le pourrait, et une
      // bouche comptée deux fois gonflerait le bac de sa propre part.
      if (!list.some((x) => x.memberId === mouth.memberId)) list.push(mouth);
      eatersByKey.set(key, list);
    }
  }

  // ── ③ LA GRILLE COMPLÈTE, CASES VIDES COMPRISES ─────────────────────────
  const cells: HouseholdCell[] = [];
  for (const day of input.windowDays) {
    for (const slot of input.gridSlots) {
      const key = cellKeyOf(day, slot);
      const eaters = eatersByKey.get(key) ?? [];
      const regime = cellRegimeFor(eaters.map((m) => m.diet));
      const dedicated = dedicatedInCell(slot, eaters, regime);
      const character = cellCharacterFor(slot, eaters);
      const cell: HouseholdCell = {
        key,
        day,
        slot,
        eaters: eaters.map((m) => m.memberId).sort(),
        regime,
        dedicated,
        character,
        empty: eaters.length === 0,
      };
      cells.push(cell);

      counters.cells++;
      if (input.cookOnlyDay !== null && day === input.cookOnlyDay) {
        counters.cook_day_cells++;
      }
      if (cell.empty) {
        counters.empty++;
        continue;
      }
      counters.non_empty++;
      const n = eaters.length;
      if (n === 1) {
        counters.one_eater_cells++;
        counters.eaters_hist["1"]++;
      } else if (n === 2) counters.eaters_hist["2"]++;
      else if (n === 3) counters.eaters_hist["3"]++;
      else counters.eaters_hist["4_plus"]++;

      if (character === "light") counters.light++;
      else if (eaters.some((m) => m.lightSlots.includes(slot))) {
        counters.light_mixed++;
      }

      if (dedicated.length > 0) {
        counters.dedicated_cells++;
        counters.dedicated_mouths += dedicated.length;
        for (const d of dedicated) counters.dedicated_by_reason[d.reason]++;
      }
      const token = regime ?? "none";
      counters.regime_by_cell[token] = (counters.regime_by_cell[token] ?? 0) + 1;
    }
  }

  return { cells, byMouth, counters };
}

/**
 * L'ÉCART ENTRE LES DÉDIÉS DE LA GRILLE ET CEUX QUE LA LANE DÉCIDE AUJOURD'HUI.
 *
 * ⛔ IL EXISTE PARCE QUE LA RÈGLE CHANGE, ET QU'ON VEUT LE VOIR AVANT DE
 * L'APPLIQUER. `dishBearingMembers` (R4/R5) dédie les bouches MOINS strictes
 * que la table qui ont une exigence de service; la grille dédie les bouches
 * PLUS strictes que leur case. Sur un foyer d'un végane et trois omnivores, la
 * première n'en dédie aucune et la seconde dédie le végane: l'écart vaut 1, et
 * c'est très exactement ce que le lot suivant va appliquer.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function dishBearingDelta(
  cells: readonly HouseholdCell[],
  current: readonly string[],
): { onlyInCells: string[]; onlyInCurrent: string[]; delta: number } {
  const fromCells = new Set<string>();
  for (const c of cells) for (const d of c.dedicated) fromCells.add(d.memberId);
  const now = new Set(current);
  const onlyInCells = [...fromCells].filter((m) => !now.has(m)).sort();
  const onlyInCurrent = [...now].filter((m) => !fromCells.has(m)).sort();
  return {
    onlyInCells,
    onlyInCurrent,
    delta: onlyInCells.length + onlyInCurrent.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LES MANGEURS DE CHAQUE PLAT
// ═══════════════════════════════════════════════════════════════════════════

/** Un plat, réduit à ce que la partition par case demande de savoir. */
export interface CellDish {
  day: string | null;
  slot: string | null;
  /** La bouche à qui ce plat est dédié, `null` sur un plat de la table. */
  memberId: string | null;
  /**
   * ⟳ 2026-09-09 — le plat à son nom COMPLÈTE la table au lieu de la
   * remplacer (entrée de dernier recours). Voir `ExpectedDish.complementsShared`.
   */
  complementsShared?: boolean;
}

export interface EatersByDishCounters {
  dishes: number;
  placed: number;
  /** Le plat tombe sur une case que la grille ne connaît pas, ou vide. */
  off_cell: number;
  /** Un plat de table dont tous les mangeurs ont un plat dédié dans la case. */
  shared_fed_nobody: number;
  /** Un plat dédié à une bouche qui ne mange pas dans cette case. */
  dedicated_off_cell: number;
  /** Combien de fois une bouche a quitté le plat de table pour le sien. */
  excluded: number;
  /** Les plats à un nom qui COMPLÈTENT la table (leur porteur y reste). */
  complements: number;
  fed_hist: { "0": number; "1": number; "2": number; "3_plus": number };
}

export interface EatersByDishOutcome {
  /** Les bouches que chaque plat nourrit, alignées index par index sur l'entrée. */
  fedByDish: (ReadonlySet<string> | null)[];
  /**
   * ⟳ 2026-09-09 — `true` sur un plat placé qui COMPLÈTE la table : son porteur
   * est aussi mangeur du plat partagé de la case, et le moteur partage
   * l'assiette entre les deux (`splitPlateWithComplement`).
   */
  complementByDish: boolean[];
  counters: EatersByDishCounters;
}

/**
 * QUI CHAQUE PLAT NOURRIT, LU SUR LA GRILLE.
 *
 * ⛔ LA RÈGLE N'EST PAS RÉÉCRITE ICI. `mouthsFedByDish` (`box_expected.ts`) la
 * porte depuis le 2026-08-22, en deux passes, avec sa partition « un plat dédié
 * nourrit sa bouche; un plat de table nourrit le roster moins les bouches qui
 * ont un plat à elles DANS LA MÊME CASE ». Ce module lui donne le bon roster —
 * celui de la CASE — au lieu du roster du plan entier.
 *
 * ⚠️ `boxable: true` SUR TOUS LES PLATS, ET C'EST UNE LEVÉE DE GARDE ASSUMÉE.
 * `box_expected` ne comptait un contenant que pour un plat qui prélève sur une
 * préparation: cuisiné le jour même, il n'en devait aucun. La méthode change la
 * question — « tout ce qui est mangé compte » — donc un plat frais nourrit
 * quand même, et le moteur lui écrira ses grammes.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function eatersByDish(args: {
  dishes: readonly CellDish[];
  cells: readonly HouseholdCell[];
}): EatersByDishOutcome {
  const counters: EatersByDishCounters = {
    dishes: args.dishes.length,
    placed: 0,
    off_cell: 0,
    shared_fed_nobody: 0,
    dedicated_off_cell: 0,
    excluded: 0,
    complements: 0,
    fed_hist: { "0": 0, "1": 0, "2": 0, "3_plus": 0 },
  };
  const byKey = new Map(args.cells.map((c) => [c.key, c]));
  const fedByDish: (ReadonlySet<string> | null)[] = args.dishes.map(() => null);
  const complementByDish: boolean[] = args.dishes.map(() => false);

  // Les index de plats, groupés par case.
  const indexesByKey = new Map<string, number[]>();
  for (const [i, d] of args.dishes.entries()) {
    if (d.day === null || d.slot === null) {
      counters.off_cell++;
      continue;
    }
    const key = cellKeyOf(d.day, d.slot);
    const cell = byKey.get(key);
    if (cell === undefined || cell.empty) {
      counters.off_cell++;
      continue;
    }
    const list = indexesByKey.get(key) ?? [];
    list.push(i);
    indexesByKey.set(key, list);
  }

  for (const [key, indexes] of indexesByKey) {
    const cell = byKey.get(key);
    if (cell === undefined) continue;
    const expected: ExpectedDish[] = indexes.map((i) => ({
      day: args.dishes[i].day,
      slot: args.dishes[i].slot,
      memberId: args.dishes[i].memberId,
      // ⚠️ Voir le pavé: la garde du contenant ne décide plus qui mange.
      boxable: true,
      complementsShared: args.dishes[i].complementsShared === true,
    }));
    const outcome = mouthsFedByDish(expected, new Set(cell.eaters));
    counters.excluded += outcome.excluded;
    counters.complements += outcome.complements;
    for (const [j, i] of indexes.entries()) {
      complementByDish[i] = expected[j].complementsShared === true &&
        (outcome.fedByDish[j]?.size ?? 0) > 0;
    }
    counters.shared_fed_nobody += outcome.sharedFedNobody.length;
    counters.dedicated_off_cell += outcome.dedicatedOffRoster.length;
    for (const [j, i] of indexes.entries()) {
      const fed = outcome.fedByDish[j] ?? null;
      fedByDish[i] = fed;
      if (fed === null) continue;
      counters.placed++;
      const n = fed.size;
      if (n === 0) counters.fed_hist["0"]++;
      else if (n === 1) counters.fed_hist["1"]++;
      else if (n === 2) counters.fed_hist["2"]++;
      else counters.fed_hist["3_plus"]++;
    }
  }

  return { fedByDish, complementByDish, counters };
}
