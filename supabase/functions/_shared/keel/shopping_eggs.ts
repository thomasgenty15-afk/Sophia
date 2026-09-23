/**
 * 2026-09-20 — LES BLANCS D'ŒUFS S'ACHÈTENT EN ŒUFS.
 *
 * Mesuré en local sur un plan de foyer : « œufs entiers : 28 » et, deux lignes
 * plus bas, « blancs d'œufs : 1 304 g ». Le modèle écrit les œufs à la pièce et
 * les blancs en grammes ; la liste gardait l'unité de chaque ingrédient et ne
 * rapprochait jamais les deux produits, alors que personne n'achète des blancs
 * au gramme et que le référentiel connaît le poids d'un blanc (`unit_grams`).
 *
 * LA RÈGLE, TELLE QUE DEMANDÉE : un blanc = un œuf à acheter. Les blancs en
 * grammes sont convertis au poids d'un blanc et ARRONDIS AU SUPÉRIEUR — il
 * vaut mieux un œuf de trop qu'un gâteau qui manque d'un blanc. Le total
 * rejoint la ligne « œufs » de la MÊME vague d'achat ; s'il n'y en a pas, la
 * ligne des blancs devient la ligne des œufs. Six œufs pour des plats, trois
 * blancs pour un gâteau ⇒ neuf œufs, une seule ligne.
 *
 * ⚠️ PAR VAGUE (`buy_on`), JAMAIS EN TRAVERS : les vagues existent pour la
 * fraîcheur, et des œufs achetés le jeudi ne servent pas le gâteau du lundi.
 *
 * ⛔ AUCUNE CONVERSION INVENTÉE. Sans poids unitaire connu pour les blancs, une
 * ligne en grammes reste telle quelle, et elle est COMPTÉE
 * (`whites_no_unit_grams`) — même règle que l'arrondi des quantités.
 *
 * ⚠️ LA RECETTE NE CHANGE PAS : la préparation dit toujours « 819 g de blancs »,
 * c'est ce que la cuisinière pèse. Seule la ligne d'ACHAT parle en œufs.
 *
 * PURE: no I/O, no clock, no randomness.
 */

export const WHOLE_EGGS_REF = "whole_eggs";
export const EGG_WHITE_REF = "egg_white";

export interface EggFoldLine {
  term: string;
  quantity: string | null;
  ref: string | null;
  amount: number | null;
  unit: string | null;
  buy_on?: string | null;
}

export interface EggFoldCounters {
  /** Lignes reçues. */
  lines: number;
  /** Lignes « blancs d'œufs » rencontrées. */
  whites_lines: number;
  /** Blancs lus en grammes, convertis au poids d'un blanc. */
  whites_from_grams: number;
  /** Blancs déjà comptés à la pièce. */
  whites_from_units: number;
  /** Œufs ajoutés à l'achat pour couvrir les blancs (après arrondi au supérieur). */
  eggs_added: number;
  /** Vagues d'achat où le pli a eu lieu. */
  waves_folded: number;
  /** Lignes « œufs » créées faute d'une ligne d'œufs dans la vague. */
  eggs_lines_created: number;
  /** Lignes de blancs en grammes laissées telles quelles : poids unitaire inconnu. */
  whites_no_unit_grams: number;
  /** Lignes de blancs dans une unité illisible (ni g ni pièce) : laissées telles quelles. */
  whites_unreadable: number;
  /** Lignes « œufs » dans une unité autre que la pièce : laissées telles quelles, pli sauté. */
  eggs_unreadable: number;
}

export interface EggFoldOutcome<L extends EggFoldLine> {
  lines: L[];
  counters: EggFoldCounters;
}

export function foldEggWhitesIntoEggs<L extends EggFoldLine>(args: {
  readonly lines: readonly L[];
  /** Poids d'un blanc d'œuf (référentiel `egg_white.unit_grams`), `null` = inconnu. */
  readonly whiteGrams: number | null;
  /** Le mot de la ligne « œufs » à créer quand la vague n'en a pas. */
  readonly eggsTerm: string;
  /** Rend la quantité affichée d'une ligne, dans la langue du plan. */
  readonly render: (amount: number, unit: string) => string | null;
}): EggFoldOutcome<L> {
  const counters: EggFoldCounters = {
    lines: args.lines.length,
    whites_lines: 0,
    whites_from_grams: 0,
    whites_from_units: 0,
    eggs_added: 0,
    waves_folded: 0,
    eggs_lines_created: 0,
    whites_no_unit_grams: 0,
    whites_unreadable: 0,
    eggs_unreadable: 0,
  };
  const whiteGrams = typeof args.whiteGrams === "number" &&
      Number.isFinite(args.whiteGrams) && args.whiteGrams > 0
    ? args.whiteGrams
    : null;

  const waveOf = (l: L): string =>
    typeof l.buy_on === "string" ? l.buy_on : "";
  const waves = new Map<string, number[]>();
  for (const [i, l] of args.lines.entries()) {
    if (l.ref !== EGG_WHITE_REF && l.ref !== WHOLE_EGGS_REF) continue;
    const key = waveOf(l);
    const list = waves.get(key) ?? [];
    list.push(i);
    waves.set(key, list);
  }

  const drop = new Set<number>();
  const replace = new Map<number, L>();

  for (const indexes of waves.values()) {
    const whites = indexes.filter((i) => args.lines[i].ref === EGG_WHITE_REF);
    const eggs = indexes.filter((i) => args.lines[i].ref === WHOLE_EGGS_REF);
    if (whites.length === 0) continue;

    // La ligne d'œufs qui reçoit le pli. Une seule ; à la pièce.
    const eggAt = eggs.length > 0 ? eggs[0] : null;
    if (eggAt !== null) {
      const e = args.lines[eggAt];
      const readable = e.unit === "unit" &&
        typeof e.amount === "number" && Number.isFinite(e.amount) && e.amount >= 0;
      if (!readable) {
        counters.eggs_unreadable++;
        counters.whites_lines += whites.length;
        continue;
      }
    }

    let whitesCount = 0;
    let folded = 0;
    const foldedAt: number[] = [];
    for (const i of whites) {
      const w = args.lines[i];
      counters.whites_lines++;
      const amount = typeof w.amount === "number" && Number.isFinite(w.amount)
        ? w.amount
        : null;
      if (amount === null || amount < 0) {
        counters.whites_unreadable++;
        continue;
      }
      if (w.unit === "unit") {
        whitesCount += amount;
        counters.whites_from_units++;
      } else if (w.unit === "g") {
        if (whiteGrams === null) {
          counters.whites_no_unit_grams++;
          continue;
        }
        whitesCount += amount / whiteGrams;
        counters.whites_from_grams++;
      } else {
        counters.whites_unreadable++;
        continue;
      }
      folded++;
      foldedAt.push(i);
    }
    if (folded === 0) continue;

    const eggsToAdd = Math.ceil(whitesCount - 1e-9);
    counters.eggs_added += eggsToAdd;
    counters.waves_folded++;

    if (eggAt !== null) {
      const e = args.lines[eggAt];
      const amount = (e.amount as number) + eggsToAdd;
      replace.set(eggAt, {
        ...e,
        amount,
        unit: "unit",
        quantity: args.render(amount, "unit"),
      });
      for (const i of foldedAt) drop.add(i);
    } else {
      // Pas d'œufs dans la vague : la première ligne de blancs devient la ligne d'œufs.
      const first = foldedAt[0];
      const w = args.lines[first];
      replace.set(first, {
        ...w,
        ref: WHOLE_EGGS_REF,
        term: args.eggsTerm,
        amount: eggsToAdd,
        unit: "unit",
        quantity: args.render(eggsToAdd, "unit"),
      });
      counters.eggs_lines_created++;
      for (const i of foldedAt.slice(1)) drop.add(i);
    }
  }

  const lines: L[] = [];
  for (const [i, l] of args.lines.entries()) {
    if (drop.has(i)) continue;
    lines.push(replace.get(i) ?? l);
  }
  return { lines, counters };
}
