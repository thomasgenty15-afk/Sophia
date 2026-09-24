// ═══════════════════════════════════════════════════════════════════════════
// REPAS GÉNÉRÉS — LA CEINTURE DE RÉGIME LUE SUR UN PLAT ET SUR UNE BOÎTE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `meal_generation.ts` (découpage des gros
// fichiers, lot 2d-1). Aucune logique changée, aucun octet de prompt changé.
// `meal_generation.ts` ré-exporte tout ce qui y était exporté : les appelants
// continuent d'importer depuis lui.
//
// Ce qui est ici : `RegimeScanSource`, `scanRegimeSources`, `dishScanSources`,
// `scanMealForRegime`, `boxScanSurface` et le type `MealRegimeBite`.
//
// ⚠️ UN SEUL MOT A CHANGÉ : `export` devant `scanMealForRegime` et
// `MealRegimeBite`, qui étaient privés. `parseGeneratedMeal`, resté dans
// `meal_generation.ts`, les appelle. Le fichier d'origine ne les ré-exporte
// pas.

import {
  type DeclaredFood,
  type DietaryRegime,
  scanDietaryRegime,
} from "./dietary_regime.ts";
import type { DishIngredient, MealPreparation } from "./meal_types.ts";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA LIGNE DÉCLARÉE D'UNE BOUCHE, LUE SUR LE **REPAS ENTIER**.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QUI A CHANGÉ AVEC L'UNITÉ, ET C'EST UN TROU FERMÉ AU PASSAGE. Tant
 * qu'une boîte pendait à une casserole, la ceinture ne lisait QUE cette
 * casserole: les ingrédients que le plat AJOUTE à l'assiette — le parmesan
 * râpé sur les pâtes, les lardons de la salade — n'étaient scannés par personne.
 * Une boîte de REPAS contient les deux, donc les deux sont lus.
 *
 * ⚠️ LE DÉCOUPAGE PROSE/TERMES EST LE CONTRAT DE `scanDietaryRegime`, ET IL
 * COMPTE: sur un TERME, un marqueur végétal vaut pour la chaîne entière
 * (« tofu », « vegan sausage »); sur de la PROSE, il ne désamorce que les
 * morsures qu'il COUVRE, sinon « Soy yoghurt bowl with chicken stock » sortirait
 * parfaitement propre.
 *
 * ⚠️ ELLE REND LES PRÉPARATIONS QUI ONT MORDU, une par une, et pas seulement un
 * booléen: `reconcilePortions` chez l'appelant retire la même bouche des PARTS
 * de la même casserole (`regime_refusals`). Un seul scan, deux ceintures. Un
 * plat qui mord par ses propres ingrédients ne nomme aucune préparation — la
 * boîte tombe quand même, et c'est le sens de `matched !== null`.
 *
 * PURE: no I/O, no clock, no randomness.
 */
/**
 * ── ÉCHANGE · UNE SURFACE DE LECTURE, ET RIEN D'AUTRE (2026-09-04) ────────
 *
 * Ce qu'une ceinture regarde: de la prose (titre, méthode) et des aliments
 * déclarés. Le PLAT en produit une par casserole plus la sienne; une BOÎTE en
 * produit une par casserole que ses items citent, plus ses items.
 */
export interface RegimeScanSource {
  readonly prepId: string | null;
  readonly prose: readonly string[];
  readonly items: readonly DeclaredFood[];
}

/**
 * ⛔ LE SCAN, UNE FOIS, POUR LES DEUX SURFACES. Extrait de `scanMealForRegime`
 * le 2026-09-04 sans changer une ligne de son corps: la boîte d'échange avait
 * besoin de le rappeler sur d'autres sources, et une seconde copie aurait
 * divergé au premier aliment ajouté — la cicatrice de ce dépôt.
 */
export function scanRegimeSources(
  regime: DietaryRegime,
  sources: readonly RegimeScanSource[],
): {
  matched: string | null;
  preparationIds: string[];
  silenced: number;
  /**
   * ⟳ 2026-09-04 — LES MORSURES ÉTEINTES PAR UN NOM D'USTENSILE.
   *
   * ⛔ SÉPARÉ DE `silenced`, ET C'EST LE POINT. Un analogue végétal éteint un
   * aliment qui est là sous forme végétale (« lait d'avoine »); un ustensile
   * éteint un mot qui n'est pas un aliment (« remplir des moules »). Les
   * additionner rendrait le journal muet le jour où l'une des deux extinctions
   * mord de travers — et c'est CELLE-CI qui peut, parce qu'elle est neuve.
   */
  silencedHomograph: number;
  /** ⟳ 2026-09-04 · éteintes par l'ORTHOGRAPHE du mot (« pâtes » n'est pas « pâté »). */
  silencedSpelling: number;
  groupExcluded: number;
  groupPlantOnly: number;
  groupUndecided: number;
} {
  let matched: string | null = null;
  const preparationIds: string[] = [];
  let silenced = 0;
  let silencedHomograph = 0;
  let silencedSpelling = 0;
  let groupExcluded = 0;
  let groupPlantOnly = 0;
  let groupUndecided = 0;
  for (const source of sources) {
    const scan = scanDietaryRegime(regime, {
      prose: source.prose.filter((text) => text.trim() !== ""),
      items: source.items
        .filter((ing) => ing.term !== "")
        .map((ing) => ({ term: ing.term, group: ing.group })),
    });
    silenced += scan.silencedByPlantAnalogue.length;
    silencedHomograph += scan.silencedByHomograph.length;
    silencedSpelling += scan.silencedBySpelling.length;
    groupExcluded += scan.group.excluded;
    groupPlantOnly += scan.group.plantOnly;
    groupUndecided += scan.group.undecided;
    if (scan.breaches.length === 0) continue;
    if (matched === null) matched = scan.breaches[0].matchedText;
    if (source.prepId !== null) preparationIds.push(source.prepId);
  }
  return {
    matched,
    preparationIds,
    silenced,
    silencedHomograph,
    silencedSpelling,
    groupExcluded,
    groupPlantOnly,
    groupUndecided,
  };
}

/** LE PLAT COMME SURFACE: sa prose, ses ingrédients, et chaque casserole qu'il utilise. */
function dishScanSources(
  dish: { title: string; method: string; ingredients: readonly DishIngredient[] },
  uses: readonly { preparationId: string }[],
  preparationById: ReadonlyMap<string, MealPreparation>,
): RegimeScanSource[] {
  const sources: RegimeScanSource[] = [
    { prepId: null, prose: [dish.title, dish.method], items: [...dish.ingredients] },
  ];
  for (const use of uses) {
    const prep = preparationById.get(use.preparationId);
    if (!prep) continue;
    if (sources.some((src) => src.prepId === prep.id)) continue;
    sources.push({
      prepId: prep.id,
      prose: [prep.title, prep.method],
      items: [...prep.ingredients],
    });
  }
  return sources;
}

export function scanMealForRegime(
  regime: DietaryRegime,
  dish: { title: string; method: string; ingredients: readonly DishIngredient[] },
  uses: readonly { preparationId: string }[],
  preparationById: ReadonlyMap<string, MealPreparation>,
): ReturnType<typeof scanRegimeSources> {
  return scanRegimeSources(regime, dishScanSources(dish, uses, preparationById));
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ÉCHANGE · CE QU'IL Y A DANS UNE BOÎTE — LA SURFACE D'UN CONTENANT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── POURQUOI UNE BOÎTE NE SE JUGE PAS SUR SON PLAT ────────────────────────
 * Sous la boîte d'échange, un seul plat porte DEUX contenants: « riz poulet »
 * pour la table, « riz tofu » pour la bouche végétarienne. Le titre est neutre
 * (« Rice bowl »), mais la méthode explique les deux, et les `ingredients` du
 * plat listent poulet ET tofu — c'est la consigne, parce que les COURSES
 * portent les deux. Juger le couvercle de tofu sur cette surface-là le fait
 * mordre à tous les coups: c'est exactement le défaut que le lot ferme.
 *
 * ⚠️ NULL N'EST PAS « RIEN À LIRE », c'est « pas de surface propre »: le repli
 * v2 (`box` + `shares`) ne déclare aucun item, et retombe sur le plat, octet
 * pour octet comme avant ce lot.
 *
 * ⚠️ TROU RÉSIDUEL, NOMMÉ ET COMPTÉ. Un item `{term: "stew"}` sans
 * `preparation_id` sous une méthode au poulet ne mord pas. On ne le devine
 * pas — `box_scoped` dit sur quelle population la garde s'exerce.
 *
 * PURE: aucune validation, aucun refus. Les cinq portes de `takeBox` restent
 * seules à décider ce qui entre dans le plan.
 */
export function boxScanSurface(
  raw: unknown,
  preparationById: ReadonlyMap<string, unknown>,
): { terms: string[]; prepIds: string[] } | null {
  if (raw === null || raw === undefined || typeof raw !== "object") return null;
  const bx = raw as Record<string, unknown>;
  const entries = Array.isArray(bx.items) ? bx.items : [];
  if (entries.length === 0) return null;
  const terms: string[] = [];
  const prepIds: string[] = [];
  for (const entry of entries) {
    const it = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const term = String(it.term ?? "").trim();
    if (term) terms.push(term);
    const prep = String(it.preparation_id ?? it.preparationId ?? "").trim();
    if (prep && preparationById.has(prep) && !prepIds.includes(prep)) prepIds.push(prep);
  }
  // Une boîte dont aucun item ne NOMME rien n'a pas de surface: elle sera
  // refusée par la porte des items, et d'ici là c'est le plat qui répond.
  if (terms.length === 0) return null;
  return { terms, prepIds };
}

/**
 * CE QU'UNE LECTURE DE LIGNE REND, NOMMÉ — pour que la mémoïsation par régime
 * du parseur ait un type à porter plutôt qu'une seconde copie de la forme.
 */
export type MealRegimeBite = ReturnType<typeof scanMealForRegime>;
