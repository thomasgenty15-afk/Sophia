/**
 * ══════════════════════════════════════════════════════════════════════════
 * CE QU'UNE PART DE CASSEROLE CONTIENT — 2026-09-22.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LA DEMANDE ────────────────────────────────────────────────────────────
 * Une boîte dit « Poulet rôti aux légumes — 261 g ». La personne qui remplit
 * la boîte ne voit ni combien de poulet, ni combien de légumes elle met
 * dedans (demande du propriétaire, 2026-09-22). Ce module donne, pour une
 * casserole, la PART CUITE de chacune de ses protéines et de ses féculents, et
 * de l'ensemble de ses légumes; l'écran la multiplie par les grammes de la
 * boîte: « dont poulet ~110 g, légumes ~140 g ».
 *
 * ⛔ C'EST UNE INFORMATION, PAS UNE PESÉE. Un mijoté ou une frittata ne se
 * sépare pas; le gramme de la boîte reste la seule grandeur qu'on pèse.
 *
 * ⛔ CALCULÉ ICI, PAS À L'ÉCRAN. Le front n'a pas le référentiel
 * (`front-cannot-read-the-food-referential`): le groupe d'un aliment et son
 * rendement cru → cuit ne se connaissent qu'au moteur, là où l'identifiant de
 * la ligne est résolu. L'écran ne fait qu'une multiplication.
 *
 * ⚠️ LA PART EST CELLE DE LA RECETTE ENTIÈRE, CUITE. Chaque ligne est mesurée
 * par la même arithmétique que la casserole (`measurePreparation`), seule; la
 * fraction est sa masse prête sur la somme des masses prêtes. Les graisses, les
 * fromages, les fruits à coque, les fruits et les assaisonnements comptent dans
 * cette somme mais ne se nomment pas: « dont 7 g d'huile » n'aide personne à
 * remplir une boîte.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */
import {
  type CompositionIndex,
  resolveCompositionLine,
} from "./food_composition.ts";
import { measurePreparation } from "./preparation_mass.ts";
import { PROTEIN_GROUPS } from "./proportion_adjust.ts";
import type { FoodGroupRef } from "./tokens.ts";

/** Les trois familles qu'on nomme sous une part. Fermé. */
export const POT_PART_KINDS = ["protein", "starch", "vegetables"] as const;
export type PotPartKind = (typeof POT_PART_KINDS)[number];

/** Les féculents: céréales et légumes féculents (la pomme de terre). */
export const STARCH_PART_GROUPS: ReadonlySet<FoodGroupRef> = new Set<FoodGroupRef>([
  "whole_grain",
  "refined_grain",
  "starchy_veg",
]);

/** Les légumes, sommés en une seule ligne. */
export const VEGETABLE_PART_GROUPS: ReadonlySet<FoodGroupRef> = new Set<FoodGroupRef>([
  "cruciferous_veg",
  "leafy_greens",
  "non_starchy_veg",
]);

export interface PotSharePart {
  readonly kind: PotPartKind;
  /**
   * Le terme de la ligne, tel que le plan l'écrit (« poulet »). `null` sur les
   * légumes, sommés: l'écran les dit « légumes ».
   */
  readonly term: string | null;
  /** La part de la masse prête de la casserole. Entre 0 et 1. */
  readonly fraction: number;
}

/**
 * Une ligne de casserole. La mesure lit la ligne entière (quantité, unité,
 * état); la résolution du groupe n'a besoin que de ces trois champs.
 */
export interface PotLine {
  readonly term?: string | null;
  readonly ref?: string | null;
  readonly refRefused?: boolean;
}

/**
 * LA COMPOSITION D'UNE CASSEROLE, EN PARTS DE SA MASSE PRÊTE.
 *
 * Rend:
 *   · `null` quand une ligne ne se mesure pas — une part inconnue fausserait
 *     toutes les autres, et « on ne sait pas » se dit en se taisant;
 *   · `[]` quand la casserole ne porte pas au moins DEUX familles (un riz
 *     nature, une purée): il n'y a rien à détailler;
 *   · sinon les protéines et les féculents ligne par ligne (même terme
 *     fusionné), puis les légumes sommés.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function potSharePartsOf(
  index: CompositionIndex,
  prep: {
    readonly id: string;
    readonly method?: string | null;
    readonly ingredients: readonly PotLine[];
  },
): PotSharePart[] | null {
  const rows: { kind: PotPartKind | null; term: string; ready: number }[] = [];
  let total = 0;
  for (const line of prep.ingredients) {
    const term = String(line?.term ?? "").trim();
    if (term === "") continue;
    const ready = measurePreparation(index, {
      id: prep.id,
      method: prep.method ?? null,
      ingredients: [line],
    }).readyG;
    if (ready === null || !Number.isFinite(ready)) return null;
    if (!(ready > 0)) continue;
    const group = resolveCompositionLine(index, {
      term,
      ref: line.ref ?? null,
      refRefused: line.refRefused === true,
    }).ref?.foodGroupRef ?? null;
    const kind: PotPartKind | null = group === null
      ? null
      : PROTEIN_GROUPS.has(group)
      ? "protein"
      : STARCH_PART_GROUPS.has(group)
      ? "starch"
      : VEGETABLE_PART_GROUPS.has(group)
      ? "vegetables"
      : null;
    rows.push({ kind, term, ready });
    total += ready;
  }
  if (!(total > 0)) return null;
  const kinds = new Set(rows.map((r) => r.kind).filter((k) => k !== null));
  if (kinds.size < 2) return [];

  const round = (x: number) => Math.round(x * 1000) / 1000;
  const out: PotSharePart[] = [];
  for (const kind of ["protein", "starch"] as const) {
    const byTerm = new Map<string, number>();
    for (const r of rows) {
      if (r.kind !== kind) continue;
      byTerm.set(r.term, (byTerm.get(r.term) ?? 0) + r.ready);
    }
    for (const [term, ready] of byTerm) out.push({ kind, term, fraction: round(ready / total) });
  }
  const veg = rows.filter((r) => r.kind === "vegetables").reduce((a, r) => a + r.ready, 0);
  if (veg > 0) out.push({ kind: "vegetables", term: null, fraction: round(veg / total) });
  return out;
}
