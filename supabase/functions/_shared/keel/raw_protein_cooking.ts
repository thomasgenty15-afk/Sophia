/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-24 — LA VIANDE OU LE POISSON CRU QUE RIEN NE CUIT. PUR.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, MESURÉ SUR DEUX PLANS RÉELS DU 2026-09-24 ──────────────────
 *   · `930edb4b` : zéro préparation, zéro session. « Saumon et couscous —
 *     assembler le saumon et le brocoli déjà cuits », « Poulet avocat et
 *     couscous », « Salade de cabillaud » : du saumon, du poulet et du
 *     cabillaud achetés crus, que personne ne cuit jamais.
 *   · `97567be2` : « Burger de bœuf — assembler le pain avec le steak haché
 *     cuit », `same_day: assemble`, aucune préparation citée.
 * La garde finale ne le voyait pas : elle compte les cuissons DES
 * PRÉPARATIONS, pas la viande posée crue dans un plat qui n'en a pas.
 *
 * ── LE CRITÈRE VIENT DU RÉFÉRENTIEL, PAS DES MOTS ─────────────────────────
 * Un aliment qui DOIT cuire porte une classe de rendement qui fond à la
 * cuisson : `meat_shrinks` (viande et volaille crues) ou `fish_shrinks`
 * (poisson cru). Ce qui se mange tel qu'acheté est `neutral` : jambon, thon et
 * sardines en boîte, saumon fumé, crevettes cuites, bœuf haché déjà cuit.
 * Mesuré sur la base le 2026-09-24 : 226 viandes rouges, 65 volailles, 12
 * poissons en classe « à cuire » ; aucun prêt-à-manger dedans. Aucun mot n'est
 * lu — `never-hand-roll-a-matcher-here`.
 *
 * ── CE QUI EST SIGNALÉ ────────────────────────────────────────────────────
 * Une ligne d'ingrédient DU PLAT (pas d'une préparation : une préparation est
 * cuite dans une session) dont l'aliment est « à cuire », dans un plat qui
 * déclare ne rien cuire le jour même (`assemble`, `reheat_only`, `none`).
 * ⚠️ Un plat sans `same_day` lisible n'est PAS signalé — on ne refuse pas un
 * plan sur une absence — mais il est COMPTÉ (`unknown_same_day`).
 *
 * PURE: no I/O, no clock, no randomness.
 */

import {
  type CompositionIndex,
  resolveCompositionLine,
} from "./food_composition.ts";

/** Les classes de rendement d'un aliment qui ne se mange pas cru. */
export const MUST_BE_COOKED_YIELD_CLASSES: ReadonlySet<string> = new Set([
  "meat_shrinks",
  "fish_shrinks",
]);

/** Les gestes du jour qui ne cuisent rien. */
const NO_COOKING_KINDS: ReadonlySet<string> = new Set(["assemble", "reheat_only", "none"]);

export interface RawProteinDish {
  readonly day: string | null;
  readonly slot: string | null;
  readonly title: string;
  readonly ingredients: readonly {
    readonly term: string;
    readonly ref?: string | null;
    readonly refRefused?: boolean;
  }[];
  readonly sameDay: { readonly kind: string } | null;
}

/** Un plat qui sert un aliment « à cuire » que rien ne cuit. */
export interface UncookedRawProtein {
  readonly day: string | null;
  readonly slot: string | null;
  readonly dish: string;
  /** Le nom écrit sur la ligne, tel que le modèle l'a écrit. */
  readonly term: string;
  readonly slug: string;
}

export function uncookedRawProteins(args: {
  readonly dishes: readonly RawProteinDish[];
  readonly index: CompositionIndex | null;
}): { readonly found: UncookedRawProtein[]; readonly unknownSameDay: number } {
  const found: UncookedRawProtein[] = [];
  let unknownSameDay = 0;
  if (args.index === null) return { found, unknownSameDay };
  for (const dish of args.dishes) {
    const raw = dish.ingredients.flatMap((ing) => {
      const ref = resolveCompositionLine(args.index, {
        term: ing.term,
        ref: ing.ref ?? null,
        refRefused: ing.refRefused === true,
      }).ref;
      return ref !== null && MUST_BE_COOKED_YIELD_CLASSES.has(String(ref.yieldClass))
        ? [{ term: ing.term, slug: ref.slug }]
        : [];
    });
    if (raw.length === 0) continue;
    const kind = dish.sameDay?.kind ?? null;
    if (kind === null) {
      unknownSameDay++;
      continue;
    }
    if (!NO_COOKING_KINDS.has(kind)) continue;
    for (const r of raw) {
      found.push({ day: dish.day, slot: dish.slot, dish: dish.title, term: r.term, slug: r.slug });
    }
  }
  return { found, unknownSameDay };
}

/**
 * LA CONSIGNE DE RÉPARATION — en anglais, comme toute consigne de réparation,
 * sans code interne, et avec les DEUX sorties nommées : une consigne dont
 * l'échappatoire n'est pas dite se fait satisfaire par la mauvaise.
 */
export function rawProteinRepairInstruction(): string {
  return [
    "⛔ This dish serves raw meat or fish that nothing cooks: no preparation of a",
    "cooking session, and no same-day cooking. Raw meat or fish is never served as",
    "bought. Either cook it in a preparation of an existing cooking session and make",
    'this dish draw on that preparation ("uses"), or make this dish cook it the same',
    'day ("same_day": {"kind": "cook_fresh"}) with the cooking written in its method.',
    'Name it as it is bought ("steak haché", "saumon"), never "cuit".',
  ].join(" ");
}
