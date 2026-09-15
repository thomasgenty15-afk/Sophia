// BANC D'ESSAI · le chargement du référentiel, partagé par `run.ts` et
// `rescore.ts`. Deux copies de cette lecture divergeraient au premier ajout de
// colonne, et la couverture de résolution serait fausse d'un fichier à l'autre.

import { buildCompositionIndex } from "../../supabase/functions/_shared/keel/food_composition.ts";
import type {
  CompositionIndex,
  CompositionRef,
} from "../../supabase/functions/_shared/keel/food_composition.ts";

export async function loadIndexFor(env: Record<string, string>): Promise<CompositionIndex> {
  const url = env.SUPABASE_URL || "http://127.0.0.1:54321";
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const get = async (table: string, select: string) => {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const r = await fetch(
        `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}`,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            Range: `${from}-${from + 999}`,
          },
        },
      );
      const page = await r.json();
      if (!Array.isArray(page) || page.length === 0) break;
      rows.push(...page);
      if (page.length < 1000) break;
    }
    return rows as Record<string, unknown>[];
  };

  const refRows = await get(
    "food_composition_refs",
    "slug,food_group_ref,label,energy_kcal,protein_g,carbs_g,fat_g,fiber_g," +
      "omega3_marine,iron_source,calcium_source,iodine_source,zinc_source," +
      "b12_source,folate_source,yield_class,atwater_discount,energy_dense,unit_grams",
  );
  const aliasRows = await get("food_composition_aliases", "alias,slug");

  const refs: CompositionRef[] = refRows.map((r) => ({
    slug: String(r.slug),
    foodGroupRef: r.food_group_ref,
    label: String(r.label),
    energyKcal: Number(r.energy_kcal),
    proteinG: r.protein_g === null ? null : Number(r.protein_g),
    carbsG: r.carbs_g === null ? null : Number(r.carbs_g),
    fatG: r.fat_g === null ? null : Number(r.fat_g),
    fiberG: r.fiber_g === null ? null : Number(r.fiber_g),
    omega3Marine: Boolean(r.omega3_marine),
    ironSource: Boolean(r.iron_source),
    calciumSource: Boolean(r.calcium_source),
    iodineSource: Boolean(r.iodine_source),
    zincSource: Boolean(r.zinc_source),
    b12Source: Boolean(r.b12_source),
    folateSource: Boolean(r.folate_source),
    yieldClass: r.yield_class,
    atwaterDiscount: Number(r.atwater_discount ?? 1),
    energyDense: Boolean(r.energy_dense),
    unitGrams: r.unit_grams === null ? null : Number(r.unit_grams),
  })) as CompositionRef[];

  return buildCompositionIndex(
    refs,
    aliasRows.map((a) => ({ alias: String(a.alias), slug: String(a.slug) })),
  );
}

