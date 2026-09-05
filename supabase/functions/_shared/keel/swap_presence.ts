import type { DietaryRegime } from "./dietary_regime.ts";

/**
 * ⟳ 2026-09-05 — LA TABLE ENTIÈRE AU RÉGIME DE LA MINORITÉ, ET AUCUN COMPTEUR
 * NE LE VOYAIT.
 *
 * Mesuré deux fois (foyers C06 et C07, cinq bouches, Léa végétarienne, quatre
 * omnivores): le modèle a composé une semaine sans une seule casserole carnée
 * — 42 plats, zéro poulet, zéro poisson, zéro viande. La ceinture régime
 * rendait `bites: 0, refused: 0`, l'invariant « personne sans repas »
 * `missing: 0`, aucune relance: le journal d'un plan PARFAIT. Parce que la
 * ceinture compte ce qu'elle MORD, et qu'il n'y avait plus rien à mordre. Un
 * zéro sans dénominateur. C'est l'interdit exact de R5 (« un seul végane
 * impose le végane à six personnes en silence »).
 *
 * Ce module donne le dénominateur, par CELLULE (jour × moment), sur les deux
 * repas principaux: une cellule est « à composant » quand des bouches que la
 * ligne la plus stricte ne lie pas y mangent, et « swap_absent » quand aucun
 * plat de la cellule ne porte un groupe que cette ligne exclut. Le plat est
 * regardé sur sa surface ENTIÈRE (titre, méthode, ingrédients, casseroles
 * citées par toutes ses boîtes) — c'est là que vit la casserole carnée des
 * omnivores quand elle existe, et c'est `regimeBites` que la ceinture pose
 * sur chaque plat parsé.
 *
 * ⛔ CE MODULE NE JUGE PAS UN RATIO. Il compte, et il nomme UN cas, le
 * flagrant: zéro cellule à composant sur toute la fenêtre. C'est le seul cas
 * mesuré (42/42, deux fois); un ratio partiel se mesure avant de se réparer.
 */

/** Les deux repas principaux: un petit-déjeuner végétarien pour tous est normal. */
export const SWAP_SLOTS: readonly string[] = ["lunch", "dinner"];

export interface SwapDishView {
  /** Un plat sans jour ou sans moment n'est sur aucune cellule: ignoré. */
  readonly day: string | null;
  readonly slot: string | null;
  /** Plat dédié à une bouche (`for_member_id`), sinon `null`. */
  readonly memberId: string | null;
  /** Les régimes que la SURFACE du plat mord — posé par la ceinture. */
  readonly regimeBites: readonly DietaryRegime[];
}

export interface SwapMouthView {
  readonly memberId: string;
  readonly regime: DietaryRegime | null;
  readonly cells: readonly { readonly day: string; readonly slot: string }[];
}

export interface SwapCounters {
  readonly strictest: DietaryRegime | null;
  readonly bound_mouths: number;
  readonly free_mouths: number;
  readonly cells_checked: number;
  readonly cells_carrying: number;
  readonly cells_swap_absent: number;
  /** Zéro cellule à composant alors qu'il y en avait à vérifier. */
  readonly flagrant: boolean;
}

export interface SwapPresence {
  readonly counters: SwapCounters;
  readonly freeMemberIds: readonly string[];
  readonly boundMemberIds: readonly string[];
  readonly absentCells: readonly { readonly day: string; readonly slot: string }[];
}

const cellKey = (c: { day: string; slot: string }) => `${c.day}/${c.slot}`;

export function swapPresence(args: {
  readonly dishes: readonly SwapDishView[];
  readonly mouths: readonly SwapMouthView[];
  readonly strictest: DietaryRegime | null;
}): SwapPresence {
  const strictest = args.strictest;
  const empty = (bound: number, free: number): SwapPresence => ({
    counters: {
      strictest,
      bound_mouths: bound,
      free_mouths: free,
      cells_checked: 0,
      cells_carrying: 0,
      cells_swap_absent: 0,
      flagrant: false,
    },
    freeMemberIds: [],
    boundMemberIds: [],
    absentCells: [],
  });
  if (strictest === null) return empty(0, 0);
  const bound = args.mouths.filter((m) => m.regime === strictest);
  const free = args.mouths.filter((m) => m.regime !== strictest);
  if (free.length === 0 || bound.length === 0) {
    return {
      ...empty(bound.length, free.length),
      freeMemberIds: free.map((m) => m.memberId),
      boundMemberIds: bound.map((m) => m.memberId),
    };
  }
  const boundIds = new Set(bound.map((m) => m.memberId));
  // Les cellules où au moins une bouche libre mange, sur les moments comptés.
  const freeCells = new Map<string, { day: string; slot: string }>();
  for (const m of free) {
    for (const c of m.cells) {
      if (!SWAP_SLOTS.includes(c.slot)) continue;
      freeCells.set(cellKey(c), { day: c.day, slot: c.slot });
    }
  }
  // Les plats par cellule, hors ceux dédiés à une bouche liée: le plat de la
  // végétarienne ne nourrit pas les omnivores, il ne compte pas pour eux.
  const dishesAt = new Map<string, SwapDishView[]>();
  for (const d of args.dishes) {
    if (d.day === null || d.slot === null) continue;
    if (d.memberId !== null && boundIds.has(d.memberId)) continue;
    const k = cellKey({ day: d.day, slot: d.slot });
    dishesAt.set(k, [...(dishesAt.get(k) ?? []), d]);
  }
  let checked = 0;
  let carrying = 0;
  const absentCells: { day: string; slot: string }[] = [];
  for (const [k, cell] of freeCells) {
    const here = dishesAt.get(k) ?? [];
    if (here.length === 0) continue; // trou du plan: porté ailleurs (`emptySlots`)
    checked++;
    if (here.some((d) => d.regimeBites.includes(strictest))) carrying++;
    else absentCells.push(cell);
  }
  return {
    counters: {
      strictest,
      bound_mouths: bound.length,
      free_mouths: free.length,
      cells_checked: checked,
      cells_carrying: carrying,
      cells_swap_absent: checked - carrying,
      flagrant: checked > 0 && carrying === 0,
    },
    freeMemberIds: free.map((m) => m.memberId),
    boundMemberIds: bound.map((m) => m.memberId),
    absentCells,
  };
}

/** Ce que la ligne refuse, dit avec les mots du modèle. */
const REFUSED_BY: Record<DietaryRegime, string> = {
  vegetarian: "meat, poultry and fish",
  vegan: "meat, poultry, fish, eggs and dairy",
  pescatarian: "meat and poultry",
};

/**
 * La relance du cas flagrant. Elle décrit la SORTIE attendue (la structure
 * que les foyers justes ont produite d'eux-mêmes: base commune + UNE casserole
 * de plus, citée par les seules boîtes des bouches libres), pas seulement
 * l'interdit — le modèle avait pris l'échappatoire que la phrase lui laissait.
 */
export function swapRetryInstruction(args: {
  readonly strictest: DietaryRegime;
  readonly freeNames: readonly string[];
  readonly boundNames: readonly string[];
  readonly cellsChecked: number;
}): string | null {
  const free = args.freeNames.map((n) => n.trim()).filter(Boolean);
  const bound = args.boundNames.map((n) => n.trim()).filter(Boolean);
  if (free.length === 0 || bound.length === 0 || args.cellsChecked <= 0) {
    return null;
  }
  const refused = REFUSED_BY[args.strictest];
  const floor = Math.max(1, Math.ceil(args.cellsChecked / 2));
  return [
    `⛔ NOBODY IN THIS PLAN EATS ${refused.toUpperCase()} -- and ${free.join(", ")} ` +
    `${free.length > 1 ? "are" : "is"} not bound by the ${args.strictest} line; ` +
    `only ${bound.join(", ")} ${bound.length > 1 ? "are" : "is"}.`,
    "The plan put the whole table on one person's line. That is the mistake to fix.",
    `Keep every dish, day and slot. At most lunches and dinners -- at least ${floor} ` +
    `of the ${args.cellsChecked} -- keep the shared base exactly as it is, and ADD ` +
    `one more preparation carrying what that line refuses (${refused}: chicken, ` +
    "fish, beef, pork, eggs as that line allows), cooked apart, with its own id and",
    `its own full recipe. Cite it ONLY from the boxes of ${free.join(", ")}, in the ` +
    "SAME dish, as their own box entry with its own \"items\" naming that component;",
    `the box of ${bound.join(", ")} keeps the plant replacement and cites only its ` +
    "own preparation. Add its lines to the cooking sessions and the shopping list.",
    "Do NOT drop a dish, do NOT shorten the plan, and do NOT mention any of this in " +
    "a \"why\" -- what somebody eats is nobody's business but theirs.",
  ].join("\n");
}
