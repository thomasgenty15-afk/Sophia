/**
 * FF-038 — LE CHARGEUR DU RÉFÉRENTIEL DE COMPOSITION.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-038-le-referentiel-de-composition.md`
 *
 * ── POURQUOI UN FICHIER À PART ────────────────────────────────────────────
 * `food_composition.ts` est pur: aucune I/O, testable sans base, rejouable
 * hors ligne sur les plans déjà écrits. La lecture vit donc ici, comme
 * `body_measure_io`, `daily_pulse_io` et les autres — le dépôt a déjà cette
 * frontière, on ne s'en invente pas une seconde.
 *
 * ── LES DEUX TABLES SONT SERVICE-ROLE ─────────────────────────────────────
 * `revoke all ... from anon, authenticated` dans la migration, RLS activée
 * sans politique. Ce chargeur est donc appelé avec le client ADMIN, jamais
 * avec le JWT d'un élève — un appel côté élève rendrait zéro ligne, ce qui se
 * lirait comme un référentiel vide plutôt que comme un refus.
 */

import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionRef,
  YIELD_CLASSES,
  type YieldClass,
} from "./food_composition.ts";
import type { FoodGroupRef } from "./tokens.ts";

/** Le strict minimum de client dont ce module a besoin. */
export interface CompositionDbClient {
  from(table: string): {
    // deno-lint-ignore no-explicit-any
    select(columns: string): any;
  };
}

function readNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Une ligne de base devient une `CompositionRef`, ou rien.
 *
 * ── UNE LIGNE ILLISIBLE EST ÉCARTÉE, PAS RÉPARÉE ──────────────────────────
 * `yield_class` hors liste, énergie absente: la ligne tombe. Le CHECK SQL les
 * rend impossibles aujourd'hui; le lecteur ne s'en remet pas pour autant à la
 * base, parce qu'une ligne écrite AVANT un CHECK survit au CHECK. Ce qu'on
 * refuse ici, c'est de « réparer » — un `yield_class` remplacé par `neutral`
 * ferait passer 100 g de riz cuit pour 100 g de riz cru, en silence.
 */
function toRef(row: Record<string, unknown>): CompositionRef | null {
  const slug = String(row.slug ?? "").trim();
  const yieldClass = String(row.yield_class ?? "").trim();
  const energy = readNumber(row.energy_kcal);
  if (!slug || energy === null) return null;
  if (!(YIELD_CLASSES as readonly string[]).includes(yieldClass)) return null;
  return {
    slug,
    foodGroupRef: String(row.food_group_ref ?? "") as FoodGroupRef,
    label: String(row.label ?? slug),
    energyKcal: energy,
    proteinG: readNumber(row.protein_g),
    carbsG: readNumber(row.carbs_g),
    fatG: readNumber(row.fat_g),
    fiberG: readNumber(row.fiber_g),
    omega3Marine: row.omega3_marine === true,
    ironSource: row.iron_source === true,
    calciumSource: row.calcium_source === true,
    iodineSource: row.iodine_source === true,
    zincSource: row.zinc_source === true,
    b12Source: row.b12_source === true,
    folateSource: row.folate_source === true,
    yieldClass: yieldClass as YieldClass,
    // 1,0 en repli: c'est le NEUTRE de la décote, donc l'absence de décote.
    // Une valeur illisible ne doit pas retirer 28 % d'énergie à un aliment.
    atwaterDiscount: readNumber(row.atwater_discount) ?? 1.0,
    energyDense: row.energy_dense === true,
    unitGrams: readNumber(row.unit_grams),
  };
}

/**
 * Le référentiel entier, en un index.
 *
 * ── CHARGÉ EN ENTIER, ET C'EST TENABLE ────────────────────────────────────
 * 208 lignes et 756 alias. Filtrer par les termes d'un repas demanderait de
 * les normaliser côté SQL — c'est-à-dire une SECONDE normalisation, à côté de
 * `normalizeForMatch`, dans un langage où elle ne peut pas être testée avec
 * l'autre. La cicatrice du dépôt sur les moteurs de matching en double est
 * assez chère pour justifier deux requêtes de quelques kilo-octets.
 */
export async function loadCompositionIndex(
  db: CompositionDbClient,
): Promise<CompositionIndex> {
  const [refsRes, aliasRes] = await Promise.all([
    db.from("food_composition_refs").select(
      "slug, food_group_ref, label, energy_kcal, protein_g, carbs_g, fat_g, " +
        "fiber_g, omega3_marine, iron_source, calcium_source, iodine_source, " +
        "zinc_source, b12_source, folate_source, yield_class, " +
        "atwater_discount, energy_dense, unit_grams",
    ),
    db.from("food_composition_aliases").select("alias, slug"),
  ]);
  if (refsRes.error) throw new Error(`[keel/composition] refs: ${refsRes.error.message}`);
  if (aliasRes.error) throw new Error(`[keel/composition] aliases: ${aliasRes.error.message}`);

  const refs: CompositionRef[] = [];
  for (const row of (refsRes.data ?? []) as Record<string, unknown>[]) {
    const ref = toRef(row);
    if (ref) refs.push(ref);
  }
  const aliases = ((aliasRes.data ?? []) as Record<string, unknown>[])
    .map((r) => ({ alias: String(r.alias ?? ""), slug: String(r.slug ?? "") }))
    .filter((a) => a.alias && a.slug);
  return buildCompositionIndex(refs, aliases);
}
