/**
 * « REMPLACER » UN PLAT DE L'APERÇU — 2026-09-24. Module PUR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LE BESOIN
 * ══════════════════════════════════════════════════════════════════════════
 * Sur l'aperçu, la personne barre des plats, une raison chacun. « Ajuster le
 * plan » doit refaire CES PLATS-LÀ et rien d'autre: deux compositions ne
 * gardent quasiment aucun plat commun (mesuré), donc recomposer ferait perdre
 * tout ce qu'elle n'a pas barré.
 *
 * ── CE QUI EST REPRIS, ET CE QUI EST NEUF ─────────────────────────────────
 * La plomberie est celle de la reprise locale (`edit_cells`, `cell_edit.ts`):
 * le brouillon rangé est la base, le modèle ne rend que les CASES listées
 * (`returns: "cells_only"`), les ceintures rejouent sur le plan fusionné.
 * Ce module ajoute deux choses:
 *   · la GRANULARITÉ DU PLAT. Une case porte souvent deux plats (celui de la
 *     table et « Pour Paul »); barrer l'un ne doit pas faire refaire l'autre.
 *     La fusion prend donc des PLATS (`dishReplaceKey`), pas des cases: les
 *     autres plats de la case restent ceux de la base, octet pour octet — pas
 *     la copie qu'en fait le modèle, qui lit un texte de plan qui peut dater;
 *   · l'EXTENSION. Une raison peut devenir une exclusion (« Paul n'aime pas
 *     les champignons »): la garde d'exclusion, qui rejoue sur tout le plan,
 *     retirerait alors Paul de chaque plat NON refait qui en contient, sans
 *     rien lui reposer (une reprise ne répare pas). Ces plats-là sont refaits
 *     aussi, et l'écran le dit. Le générateur les trouve avec LA garde
 *     (`judgeDishEaters`, `servedExclusionBites`), jamais avec un matcher d'ici.
 */

import type { GeneratedMeal } from "./meal_generation.ts";
import type { CompositionIndex } from "./food_composition.ts";
import type { CellEdit } from "./cell_edit.ts";
import { type MergeOutcome, mergeRetryCells } from "./retry_merge.ts";
import { DAY_TOKENS, type DayToken } from "./tokens.ts";
import { RHYTHM_OCCASIONS, type RhythmOccasion } from "./retained_item.ts";
import { type DishRejectionTarget, dishTitleKey } from "./rejected_dishes.ts";

/**
 * LA CLÉ D'UN PLAT: sa case, sa bouche (vide = la table), et s'il COMPLÈTE une
 * assiette commune. Même découpe que `foldDuplicateDishes` et
 * `patchDishPayloads`: un plan rangé n'a qu'un plat par clé.
 */
export function dishReplaceKey(d: {
  day?: string | null;
  slot?: string | null;
  memberId?: string | null;
  complementsShared?: boolean;
}): string {
  return `${d.day ?? ""}/${d.slot ?? ""}/${d.memberId ?? ""}/${d.complementsShared === true ? "extra" : "plate"}`;
}

/** Un plat que la garde retirerait à quelqu'un, trouvé par le générateur. */
export interface ExtendedDish {
  readonly dishIndex: number;
  /** La bouche qui serait retirée; `null` = la table entière (mot de la table). */
  readonly memberId: string | null;
  /** Le mot qui a mordu, tel qu'il apparaît dans le plat. */
  readonly matched: string;
}

export interface RejectionEditPlan {
  /** Les cases données au modèle, avec ce qu'il doit y changer. */
  readonly cells: CellEdit[];
  /** Les plats à prendre dans sa réponse (`dishReplaceKey`). */
  readonly dishKeys: string[];
  /** Les plats barrés retrouvés dans la base. */
  readonly resolved: number;
  /** Les plats barrés introuvables (brouillon changé, titre différent). */
  readonly unknown: number;
  /** Les plats refaits EN PLUS des barrés, pour l'écran. */
  readonly extended: { key: string; title: string }[];
}

const quoted = (text: string) => `«${String(text ?? "").replace(/[«»]/g, '"')}»`;

/**
 * LES CASES ET LES PLATS À REFAIRE.
 *
 * ⛔ UN PLAT BARRÉ SE RETROUVE PAR SA CLÉ **ET** SON TITRE. La clé seule
 * prendrait un autre plat si le brouillon a changé entre l'affichage et le
 * clic; le titre seul prendrait le même plat servi à quelqu'un d'autre. Un
 * complément n'est jamais remplaçable seul (le modèle ne sait pas en écrire).
 *
 * ⚠️ LA PROMESSE TOUCHE LA CASE: chaque texte dit quel plat changer et
 * finit par « recopie les autres plats de cette case » — la consigne de
 * `cellEditInstruction` le demande déjà, la fusion le garantit.
 */
export function rejectionEditPlan(args: {
  base: GeneratedMeal;
  targets: readonly DishRejectionTarget[];
  extended: readonly ExtendedDish[];
  /** Prénom par bouche, pour dire au modèle POUR QUI est le plat. */
  names: ReadonlyMap<string, string>;
}): RejectionEditPlan {
  type Cell = { day: DayToken; slot: RhythmOccasion; texts: string[] };
  const cells = new Map<string, Cell>();
  const dishKeys = new Set<string>();
  const addText = (day: string | null, slot: string | null, text: string): boolean => {
    const d = String(day ?? "");
    const s = String(slot ?? "");
    if (!(DAY_TOKENS as readonly string[]).includes(d)) return false;
    if (!(RHYTHM_OCCASIONS as readonly string[]).includes(s)) return false;
    const key = `${d}/${s}`;
    const cell = cells.get(key) ?? { day: d as DayToken, slot: s as RhythmOccasion, texts: [] };
    if (!cell.texts.includes(text)) cell.texts.push(text);
    cells.set(key, cell);
    return true;
  };
  const whoOf = (memberId: string | null) =>
    memberId === null ? "the table" : (args.names.get(memberId) ?? "one person at the table");

  let resolved = 0;
  let unknown = 0;
  for (const target of args.targets) {
    const hit = args.base.dishes.find((d) =>
      d.complementsShared !== true &&
      (d.day ?? null) === target.day &&
      (d.slot ?? null) === target.slot &&
      (d.memberId ?? null) === target.memberId &&
      dishTitleKey(d.title) === dishTitleKey(target.title)
    );
    if (!hit) {
      unknown++;
      continue;
    }
    // Une raison vide (refusée par la garde d'entrée, ou tue) ne se cite pas:
    // « they said: «» » ferait croire au modèle qu'on lui cache quelque chose.
    const said = String(target.reason ?? "").trim() === "" ? "" : ` — they said: ${quoted(target.reason)}`;
    const text = `they turned down ${quoted(hit.title)}, served to ${whoOf(hit.memberId ?? null)}` +
      `${said}. Put a DIFFERENT dish in its place for the same people:` +
      " not a renamed copy, not the same main foods.";
    if (!addText(hit.day, hit.slot, text)) {
      unknown++;
      continue;
    }
    dishKeys.add(dishReplaceKey(hit));
    resolved++;
  }

  const extended: { key: string; title: string }[] = [];
  for (const ext of args.extended) {
    const dish = args.base.dishes[ext.dishIndex];
    if (!dish) continue;
    const key = dishReplaceKey(dish);
    const text = `${quoted(dish.title)} contains ${quoted(ext.matched)}, which ${
      ext.memberId === null ? "the table" : whoOf(ext.memberId)
    } no longer eats: rewrite that dish without it, for the same people.`;
    if (!addText(dish.day, dish.slot, text)) continue;
    if (!dishKeys.has(key)) {
      dishKeys.add(key);
      extended.push({ key, title: dish.title });
    }
  }

  const dayRank = (d: string) => (DAY_TOKENS as readonly string[]).indexOf(d);
  const slotRank = (s: string) => (RHYTHM_OCCASIONS as readonly string[]).indexOf(s);
  return {
    cells: [...cells.values()]
      .sort((a, b) => dayRank(a.day) - dayRank(b.day) || slotRank(a.slot) - slotRank(b.slot))
      .map((c) => ({
        day: c.day,
        slot: c.slot,
        text: `${c.texts.join(" ")} Copy every other dish of this cell exactly.`,
      })),
    dishKeys: [...dishKeys].sort(),
    resolved,
    unknown,
    extended,
  };
}

export interface RejectionMergeOutcome {
  readonly meal: GeneratedMeal;
  /** Les plats pris dans la réponse du modèle. */
  readonly taken: readonly string[];
  /** Demandés, absents de sa réponse (ou sous une autre bouche). */
  readonly notRendered: readonly string[];
  /** Rendus sous un titre refusé — pas pris: le plat barré reste, et c'est dit. */
  readonly sameTitle: readonly string[];
  /** Les plats du départ qui ne bougent pas. */
  readonly untouched: number;
  readonly merge: MergeOutcome;
}

/**
 * LA FUSION PAR PLAT. On ne prend de la réponse que les plats demandés; tout
 * le reste — y compris les autres plats de leurs cases — vient de la base.
 *
 * ⛔ UN PLAT RENDU SOUS UN TITRE REFUSÉ N'EST PAS PRIS. Le modèle qui recopie
 * le plat barré n'a rien remplacé: le prendre ferait dire « remplacé » à
 * l'écran sur le même plat.
 */
export function mergeRejectionEdit(args: {
  base: GeneratedMeal;
  retry: GeneratedMeal;
  dishKeys: readonly string[];
  /** Les titres refusés (ceux de cette demande et ceux de la liste rangée). */
  refusedTitleKeys: ReadonlySet<string>;
  index: CompositionIndex | null;
}): RejectionMergeOutcome {
  const retryByKey = new Map(args.retry.dishes.map((d) => [dishReplaceKey(d), d]));
  const sameTitle: string[] = [];
  const keys = args.dishKeys.filter((key) => {
    const rendered = retryByKey.get(key);
    if (rendered && args.refusedTitleKeys.has(dishTitleKey(rendered.title))) {
      sameTitle.push(key);
      return false;
    }
    return true;
  });
  const merge = mergeRetryCells({
    base: args.base,
    retry: args.retry,
    cells: keys,
    index: args.index,
    keyOf: dishReplaceKey,
  });
  const takenSet = new Set(merge.cells);
  return {
    meal: merge.meal,
    taken: merge.cells,
    notRendered: keys.filter((k) => !takenSet.has(k)),
    sameTitle,
    untouched: args.base.dishes.filter((d) => !takenSet.has(dishReplaceKey(d))).length,
    merge,
  };
}
