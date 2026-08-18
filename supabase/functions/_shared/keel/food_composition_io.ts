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
 * ~900 lignes et ~2500 alias. Filtrer par les termes d'un repas demanderait de
 * les normaliser côté SQL — c'est-à-dire une SECONDE normalisation, à côté de
 * `normalizeForMatch`, dans un langage où elle ne peut pas être testée avec
 * l'autre. La cicatrice du dépôt sur les moteurs de matching en double est
 * assez chère pour justifier deux requêtes de quelques kilo-octets.
 *
 * ⚠️ ── « EN ENTIER » DEMANDE DE PAGINER, ET ÇA A COÛTÉ CHER ───────────────
 * PostgREST plafonne une réponse à 1000 lignes PAR DÉFAUT, sans erreur et sans
 * en-tête que ce code lisait. Mesuré le 2026-08-12: 2508 alias en base, **999
 * chargés**. Plus de 60 % du référentiel n'atteignait jamais le résolveur.
 *
 * Le défaut était INVISIBLE et il coûtait tout: la résolution plafonnait entre
 * 62 % et 80 %, donc sous la porte des 80 % du verdict — donc pas de verdict,
 * pas de boucle de correction, pas de mise à l'échelle des portions. On a
 * conclu deux fois que « le référentiel est trop pauvre » et importé 689
 * aliments de plus, pendant que le vrai problème était que la moitié de ce
 * qu'on avait déjà ne se chargeait pas.
 *
 * D'où la pagination explicite ci-dessous ET la garde de complétude: une page
 * pleine signifie « il y en a peut-être d'autres », et on redemande jusqu'à ce
 * qu'une page revienne incomplète. Un plafond dur borne la boucle — mieux vaut
 * lever que tourner sans fin sur une table qui aurait explosé.
 */

/** La taille de page. PostgREST refuse au-delà de son propre maximum. */
const PAGE_SIZE = 1000;

/**
 * Le nombre de pages au-delà duquel on lève.
 *
 * 50 pages = 50 000 lignes, très au-dessus de tout référentiel plausible. Y
 * arriver veut dire que quelque chose est cassé (une table qui a explosé, une
 * pagination qui ne progresse pas), et lever est alors plus honnête que
 * charger indéfiniment.
 */
const MAX_PAGES = 50;

async function fetchAll(
  db: CompositionDbClient,
  table: string,
  columns: string,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const res = await db.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (res.error) {
      throw new Error(`[keel/composition] ${table}: ${res.error.message}`);
    }
    const rows = (res.data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    // Une page INCOMPLÈTE est la seule preuve qu'on a tout lu. S'arrêter sur
    // une page pleine est exactement le défaut qu'on répare ici.
    if (rows.length < PAGE_SIZE) return out;
  }
  throw new Error(
    `[keel/composition] ${table}: plus de ${MAX_PAGES * PAGE_SIZE} lignes — ` +
      `pagination suspecte, on ne charge pas un référentiel qu'on ne comprend plus`,
  );
}

export async function loadCompositionIndex(
  db: CompositionDbClient,
): Promise<CompositionIndex> {
  const [refRows, aliasRows] = await Promise.all([
    fetchAll(
      db,
      "food_composition_refs",
      "slug, food_group_ref, label, energy_kcal, protein_g, carbs_g, fat_g, " +
        "fiber_g, omega3_marine, iron_source, calcium_source, iodine_source, " +
        "zinc_source, b12_source, folate_source, yield_class, " +
        "atwater_discount, energy_dense, unit_grams",
    ),
    fetchAll(db, "food_composition_aliases", "alias, slug"),
  ]);

  const refs: CompositionRef[] = [];
  for (const row of refRows) {
    const ref = toRef(row);
    if (ref) refs.push(ref);
  }
  const aliases = aliasRows
    .map((r) => ({ alias: String(r.alias ?? ""), slug: String(r.slug ?? "") }))
    .filter((a) => a.alias && a.slug);
  return buildCompositionIndex(refs, aliases);
}
