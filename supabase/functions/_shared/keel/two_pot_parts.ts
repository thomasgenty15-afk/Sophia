/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES DEUX MOITIÉS D'UN PLAT À DEUX CASSEROLES — ⟳ 2026-09-23, audit des
 * dosages, lot 2 (« aussi pour une personne seule »).
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── POURQUOI CE MODULE EXISTE ─────────────────────────────────────────────
 * Le partage du féculent (`splitStarchSide`) ne tournait qu'à table:
 * `shadowSizing` s'arrête sous deux bouches (`off("single_mouth")`), et la
 * lecture des deux moitiés d'un plat vivait DANS cette fonction du générateur.
 * Une personne seule en perte de poids — l'entrée du produit, et le sujet de la
 * page d'accueil — recevait donc la recette telle quelle, féculent compris.
 *
 * Ce module sort cette lecture du générateur pour que le chemin à une bouche
 * la partage: UNE écriture de « quelle casserole est le féculent, et combien
 * pèse chaque moitié ». Deux copies auraient divergé au premier ajustement —
 * ce fichier a déjà payé plusieurs fois le prix de deux lectures d'une même
 * mesure.
 *
 * ⛔ AUCUNE RÈGLE NEUVE. C'est l'extraction, mot pour mot, du bloc
 * « ⟳ 2026-09-22 · LOT C — LE FÉCULENT À CÔTÉ » de
 * `generate-household-meal-v1/index.ts`: la lecture `sidePots` (rôles
 * déclarés, groupes du RÉFÉRENTIEL des lignes pesées), `starchSideOf`, puis
 * `measurePlate` lu casserole par casserole.
 *
 * ⚠️ CE MODULE NE DÉCIDE PAS OÙ LE FÉCULENT PART À CÔTÉ. À table, l'appelant
 * garde son filtre (`starchAsideCellsOf`: cases partagées du déjeuner et du
 * dîner). Pour une personne seule, c'est l'appelant qui choisit les moments
 * (`STARCH_ASIDE_SLOTS`); ce module lit seulement un plat.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */
import type { CompositionIndex } from "./food_composition.ts";
import { resolveCompositionLine } from "./food_composition.ts";
import { measurePlate, type PlateMeasure } from "./preparation_mass.ts";
import {
  type PartMeasure,
  type SidePotInput,
  starchSideOf,
  type StarchSideRefusal,
} from "./starch_side.ts";

/** Une ligne d'ingrédient de casserole, réduite à ce que ce module lit. */
export interface TwoPotIngredient {
  readonly term?: string | null;
  readonly ref?: string | null;
  readonly refRefused?: boolean | null;
  /** Les grammes crus. Seule une ligne PESÉE (`> 0`) dit le groupe. */
  readonly gramsRaw?: number | null;
}

/** Une casserole du plan (`meal.preparations`), réduite à ce que ce module lit. */
export interface TwoPotPreparation {
  readonly id: string;
  readonly method?: string | null;
  readonly ingredients?: readonly TwoPotIngredient[];
  /** Les composants DÉCLARÉS par le modèle, avec leur rôle. */
  readonly components?: readonly { readonly role?: string | null }[];
}

/** Un plat, réduit à ce que ce module lit. */
export interface TwoPotDish {
  readonly method?: string | null;
  readonly ingredients?: readonly unknown[];
  readonly uses?: readonly { readonly preparationId?: string | null }[] | null;
}

/**
 * LES CASSEROLES TELLES QUE `starchSideOf` LES LIT, pour tout le plan.
 *
 * ⛔ LE GROUPE DU RÉFÉRENTIEL, PAS CELUI DÉCLARÉ PAR LE MODÈLE — la règle de
 * `unitsOfPlan`: c'est lui qui refuse un « féculent » qui serait un poulet.
 * ⚠️ SEULES LES LIGNES PESÉES (`gramsRaw > 0`) disent un groupe; une ligne non
 * résolue rend `null`, qui ne peut ni ouvrir ni fermer.
 * ⚠️ UNE CASSEROLE SANS IDENTIFIANT EST IGNORÉE: aucun plat ne peut la tirer.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function sidePotsOf(args: {
  readonly index: CompositionIndex;
  readonly preparations: readonly TwoPotPreparation[];
}): Map<string, SidePotInput> {
  const out = new Map<string, SidePotInput>();
  for (const p of args.preparations) {
    const id = String(p.id ?? "");
    if (id === "") continue;
    out.set(id, {
      id,
      roles: (p.components ?? []).map((c) => c.role ?? null),
      weighedGroups: (p.ingredients ?? [])
        .filter((ing) => typeof ing.gramsRaw === "number" && ing.gramsRaw > 0)
        .map((ing) =>
          resolveCompositionLine(args.index, {
            term: String(ing.term ?? ""),
            ref: ing.ref ?? null,
            refRefused: ing.refRefused === true,
          }).ref?.foodGroupRef ?? null
        ),
    });
  }
  return out;
}

/**
 * LES DEUX MOITIÉS D'UNE ASSIETTE MESURÉE: le féculent est SA part de
 * casserole, la casserole principale est tout le reste (frais du plat compris).
 *
 * ⛔ `null` DÈS QU'UNE MESURE SE TAIT. Le féculent sans énergie, protéine ou
 * masse ⇒ les deux `null`; l'assiette entière illisible ⇒ le principal `null`.
 * Jamais un zéro qui passerait pour une moitié vide: `splitStarchSide` rend
 * alors `unmeasurable`.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function partsOfPlate(
  plate: Pick<PlateMeasure, "kcal" | "proteinG" | "readyG" | "pots">,
  sidePrepId: string,
): { main: PartMeasure | null; side: PartMeasure | null } {
  const pot = plate.pots.find((pp) => pp.id === sidePrepId) ?? null;
  const side = pot !== null && pot.kcal !== null && pot.proteinG !== null &&
      pot.readyG !== null
    ? { kcal: pot.kcal, proteinG: pot.proteinG, readyG: pot.readyG }
    : null;
  const main = side !== null && plate.kcal !== null && plate.proteinG !== null &&
      plate.readyG !== null
    ? {
      kcal: plate.kcal - side.kcal,
      proteinG: plate.proteinG - side.proteinG,
      readyG: plate.readyG - side.readyG,
    }
    : null;
  return { main, side };
}

/** Ce que `twoPotPartsOf` rend: la casserole-féculent et ses deux moitiés, ou le refus. */
export type TwoPotParts =
  | {
    readonly sidePrepId: string;
    readonly refusal: null;
    readonly main: PartMeasure | null;
    readonly side: PartMeasure | null;
  }
  | {
    readonly sidePrepId: null;
    readonly refusal: StarchSideRefusal;
    readonly main: null;
    readonly side: null;
  };

/**
 * LE PLAT EST-IL SERVI EN DEUX CASSEROLES, ET QUE PÈSE CHAQUE MOITIÉ ?
 *
 * ① `starchSideOf` sur les casseroles que le plat tire (l'ordre de `uses`);
 *    un refus est rendu NOMMÉ, et l'assiette n'est pas mesurée.
 * ② `measurePlate` — LA MÊME MESURE QUE LA PART STANDARD
 *    (`standardPortionOf` → `measurePlate`), avec les mêmes tirages — puis
 *    `partsOfPlate`.
 *
 * ⚠️ UN PLAT RETENU PEUT AVOIR DES MOITIÉS `null`: la casserole est bien un
 * féculent à côté, mais sa mesure se tait. L'appelant le compte comme un plat
 * à deux casseroles (`two_pot_cells`) et `splitStarchSide` rend
 * `unmeasurable` — c'est le comportement du générateur avant l'extraction.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function twoPotPartsOf(args: {
  readonly index: CompositionIndex;
  readonly dish: TwoPotDish;
  readonly preparations: readonly TwoPotPreparation[];
  /** Les tirages de chaque casserole — ceux de la part standard. */
  readonly drawsByPrep: ReadonlyMap<string, number>;
  /** `sidePotsOf` du plan, calculé UNE fois pour tous ses plats. */
  readonly sidePots: ReadonlyMap<string, SidePotInput>;
}): TwoPotParts {
  const uses = args.dish.uses ?? [];
  const found = starchSideOf({
    usedPrepIds: uses.map((u) => String(u?.preparationId ?? "")),
    pots: args.sidePots,
  });
  if (found.sidePrepId === null) {
    return { sidePrepId: null, refusal: found.refusal, main: null, side: null };
  }
  const plate = measurePlate({
    index: args.index,
    dish: args.dish,
    uses,
    preparations: args.preparations,
    drawsByPrep: args.drawsByPrep,
  });
  const { main, side } = partsOfPlate(plate, found.sidePrepId);
  return { sidePrepId: found.sidePrepId, refusal: null, main, side };
}
