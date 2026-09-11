/**
 * LOT A · A7 — L'IMPACT CHIFFRÉ DE LA CORRECTION SUR LES DEUX PLANS DE PREUVE.
 *
 *   deno run --allow-read --allow-write=scratchpad/2026-09-11-CHANTIER-PREMIER-JET \
 *     scratchpad/2026-09-11-CHANTIER-PREMIER-JET/lotA-03-impact.ts
 *
 * ⛔ REJEU HORS LIGNE, AUCUNE ÉCRITURE. Aucune génération, aucun appel modèle,
 * aucune écriture dans les plans. Les GRAMMES des plans historiques ne bougent
 * pas: c'est le lot 5 du chantier (« préserver les grammes des plans
 * historiques »). On relit les MÊMES quantités avec le référentiel corrigé.
 *
 * ⚠️ ET ON NE SUBSTITUE AUCUN TERME. L'enquête du 2026-09-11 avait mesuré son
 * contrefactuel en remplaçant `raisin`→`grapes` et `prune`→`plum` DANS LE
 * PLAN. Ici, les termes restent ceux que le modèle a écrits: c'est la
 * RÉSOLUTION qui a changé. Si les deux mesures se rejoignent, le correctif fait
 * bien ce que le contrefactuel supposait.
 *
 * ⚠️ LA MESURE EST CELLE DE LA PRODUCTION. `boxEnergies` sur les items de
 * BOÎTE — le lecteur que l'enquête a établi comme le bon (§1: le rapport
 * divisait les calories d'une part par la masse d'une autre).
 */
import {
  buildCompositionIndex,
  type CompositionRef,
  normalizeTerm,
  resolveIngredient,
  type YieldClass,
} from "../../supabase/functions/_shared/keel/food_composition.ts";
import { readEnergyBoxDishes, readPreparations } from "../../supabase/functions/_shared/keel/plan_energy_read.ts";
import { boxEnergies } from "../../supabase/functions/_shared/keel/mouth_energy.ts";
import type { FoodGroupRef } from "../../supabase/functions/_shared/keel/tokens.ts";

const DIR = new URL("./", import.meta.url);
const read = async (n: string) => JSON.parse(await Deno.readTextFile(new URL(n, DIR)));

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => String(v ?? "").trim();

const refOf = (r: Row): CompositionRef => ({
  slug: str(r.slug),
  foodGroupRef: str(r.food_group_ref) as FoodGroupRef,
  label: str(r.label),
  source: str(r.source) as CompositionRef["source"],
  energyKcal: num(r.energy_kcal) ?? 0,
  proteinG: num(r.protein_g),
  carbsG: num(r.carbs_g),
  fatG: num(r.fat_g),
  fiberG: num(r.fiber_g),
  omega3Marine: r.omega3_marine === true,
  ironSource: r.iron_source === true,
  calciumSource: r.calcium_source === true,
  iodineSource: r.iodine_source === true,
  zincSource: r.zinc_source === true,
  b12Source: r.b12_source === true,
  folateSource: r.folate_source === true,
  yieldClass: str(r.yield_class) as YieldClass,
  yieldFactor: num(r.yield_factor),
  atwaterDiscount: num(r.atwater_discount) ?? 1,
  energyDense: r.energy_dense === true,
  unitGrams: num(r.unit_grams),
  condimentGrams: num(r.condiment_grams),
  ciqualCode: str(r.ciqual_code) || null,
  ciqualName: str(r.ciqual_name) || null,
});

// ── LES DEUX RÉFÉRENTIELS ──────────────────────────────────────────────────
// AVANT: l'export figé juste avant la migration `20260911040000`.
// APRÈS: l'export d'après, plus les quatre faux amis en langue `fr` — les deux
// plans sont `content_locale = fr-FR`.
const avant = buildCompositionIndex(
  (await read("lotA-refs-avant.json") as Row[]).map(refOf),
  (await read("lotA-aliases-avant.json") as Row[]).map((a) => ({
    alias: str(a.alias),
    slug: str(a.slug),
  })),
);
const apresRows = await read("lotA-refs.json") as Row[];
const apres = buildCompositionIndex(
  apresRows.map(refOf),
  (await read("lotA-aliases.json") as Row[]).map((a) => ({
    alias: str(a.alias),
    slug: str(a.slug),
  })),
  (await read("lotA-false-friends.json") as Row[])
    .filter((f) => str(f.lang) === "fr")
    .map((f) => ({ alias: str(f.term), slug: str(f.slug) })),
);

const plans: {
  id: string;
  content_locale: string;
  dishes: Row[];
  preparations: Row[];
}[] = await read("lotA-plans.json");

// ---------------------------------------------------------------------------
// ① COMBIEN D'INGRÉDIENTS CHANGENT DE RÉFÉRENCE
// ---------------------------------------------------------------------------
const changements: Record<string, unknown>[] = [];
const parPlan: Record<string, { lignes: number; changees: number; termes: Set<string> }> = {};

for (const p of plans) {
  const etat = { lignes: 0, changees: 0, termes: new Set<string>() };
  parPlan[p.id] = etat;
  const unites = [...(p.dishes ?? []), ...(p.preparations ?? [])];
  for (const u of unites) {
    const lignes: { terme: string; ou: string }[] = [];
    for (const ing of (u.ingredients ?? []) as Row[]) {
      lignes.push({ terme: str(ing.term), ou: "ingredient" });
    }
    for (const box of (u.boxes ?? []) as Row[]) {
      for (const it of (box.items ?? []) as Row[]) {
        // Un item qui porte un `preparation_id` est un TIRAGE de casserole:
        // son `term` est le titre de la casserole, pas un aliment.
        if (str(it.preparation_id)) continue;
        lignes.push({ terme: str(it.term), ou: "box_item" });
      }
    }
    for (const l of lignes) {
      if (!l.terme) continue;
      etat.lignes += 1;
      const a = resolveIngredient(avant, l.terme);
      const b = resolveIngredient(apres, l.terme);
      if ((a?.slug ?? null) === (b?.slug ?? null) && a?.energyKcal === b?.energyKcal) continue;
      etat.changees += 1;
      etat.termes.add(normalizeTerm(l.terme));
      changements.push({
        plan: p.id,
        terme: l.terme,
        ou: l.ou,
        avant_slug: a?.slug ?? null,
        avant_kcal: a?.energyKcal ?? null,
        apres_slug: b?.slug ?? null,
        apres_kcal: b?.energyKcal ?? null,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// ② LES KCAL DES BOÎTES, AVANT ET APRÈS — mêmes grammes, autre référence
// ---------------------------------------------------------------------------
const mesure = (index: typeof avant, p: typeof plans[number]) =>
  boxEnergies({
    index,
    dishes: readEnergyBoxDishes(p.dishes),
    preparations: readPreparations(p.preparations),
  });

/** Les quatre petits-déjeuners que l'enquête chiffre, et ses contrefactuels. */
const ENQUETE: Record<string, number> = {
  "5fad22ce-d181-4a0c-b0b5-77caf65092b5/sat/breakfast": 388,
  "5fad22ce-d181-4a0c-b0b5-77caf65092b5/sun/breakfast": 356,
  "a18f522e-41f9-469e-9c50-1d693d892ce6/sat/breakfast": 427,
  "a18f522e-41f9-469e-9c50-1d693d892ce6/sun/breakfast": 475,
};

const boites: Record<string, unknown>[] = [];
for (const p of plans) {
  const a = mesure(avant, p);
  const b = mesure(apres, p);
  for (const boxAvant of a) {
    const boxApres = b.find((x) => x.day === boxAvant.day && x.slot === boxAvant.slot);
    const cle = `${p.id}/${boxAvant.day}/${boxAvant.slot}`;
    boites.push({
      plan: p.id,
      jour: boxAvant.day,
      moment: boxAvant.slot,
      grammes: boxAvant.grams,
      // ⚠️ LES GRAMMES NE BOUGENT PAS: c'est la même boîte, relue.
      grammes_apres: boxApres?.grams ?? null,
      kcal_avant: boxAvant.kcal === null ? null : Math.round(boxAvant.kcal),
      kcal_apres: boxApres?.kcal == null ? null : Math.round(boxApres.kcal),
      contrefactuel_enquete: ENQUETE[cle] ?? null,
    });
  }
}

const sortie = {
  genere_le: "2026-09-11",
  methode:
    "Rejeu hors ligne. Mêmes grammes, mêmes termes, deux référentiels: celui d'avant la " +
    "migration 20260911040000 et celui d'après, avec les quatre faux amis en langue fr. " +
    "Aucune écriture, aucune génération.",
  par_plan: Object.fromEntries(
    Object.entries(parPlan).map(([id, e]) => [id, {
      lignes: e.lignes,
      changees: e.changees,
      termes: [...e.termes].sort(),
    }]),
  ),
  changements,
  boites,
};

await Deno.writeTextFile(new URL("lotA-impact.json", DIR), JSON.stringify(sortie, null, 2));

for (const [id, e] of Object.entries(parPlan)) {
  console.log(
    `${id}: ${e.changees} lignes sur ${e.lignes} changent de référence ` +
      `(${[...e.termes].sort().join(", ")})`,
  );
}
console.log("\njour/moment            grammes   kcal avant → kcal après   (enquête)");
for (const b of boites) {
  const cf = b.contrefactuel_enquete === null ? "" : `   (${b.contrefactuel_enquete})`;
  const bouge = b.kcal_avant !== b.kcal_apres ? " ←" : "";
  console.log(
    `${String(b.plan).slice(0, 4)} ${b.jour}/${String(b.moment).padEnd(10)} ` +
      `${String(b.grammes).padStart(5)} g   ${String(b.kcal_avant).padStart(5)} → ` +
      `${String(b.kcal_apres).padStart(5)}${cf}${bouge}`,
  );
}
const gardes = boites.filter((b) => b.grammes !== b.grammes_apres);
console.log(
  `\ngrammes modifiés par le correctif: ${gardes.length} (doit être 0 — lot 5 du chantier)`,
);
