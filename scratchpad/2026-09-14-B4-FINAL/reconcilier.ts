/**
 * Rejoue la réconciliation de casserole avec les fonctions de production,
 * sans rappeler le modèle.
 *
 *   deno run --allow-read --allow-write=scratchpad \
 *     scratchpad/2026-09-14-B4-FINAL/reconcilier.ts
 */
import { indexDuReferentiel } from "../2026-09-13-CIBLES-PAR-PERSONNE/composer-reference.ts";
import { measurePreparation } from "../../supabase/functions/_shared/keel/preparation_mass.ts";
import { growIngredientsToReadyMass } from "../../supabase/functions/_shared/keel/portion_scaling.ts";
import {
  rebuildShoppingQuantities,
  shoppingNeedsOf,
} from "../../supabase/functions/_shared/keel/shopping_rebuild.ts";
import { resolveIngredients } from "../../supabase/functions/_shared/keel/food_composition.ts";
import { decidePotMassPublication } from "../../supabase/functions/_shared/keel/pot_mass_publication.ts";

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);

function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(Deno.readTextFileSync(`${ROOT}${rel}`)) as Record<string, unknown>;
}

function mealOf(src: Record<string, unknown>): Record<string, unknown> {
  if (src.ligne_ecrite && typeof src.ligne_ecrite === "object") {
    return src.ligne_ecrite as Record<string, unknown>;
  }
  if (src.etapes && typeof src.etapes === "object") {
    const etapes = src.etapes as Record<string, unknown>;
    const jet = etapes.premier_jet;
    if (typeof jet === "string") {
      const parsed = JSON.parse(jet) as Record<string, unknown>;
      if (parsed.dishes) return parsed;
    }
    if (jet && typeof jet === "object" && "dishes" in (jet as object)) {
      return jet as Record<string, unknown>;
    }
  }
  return src;
}

function pidOf(item: Record<string, unknown>): string {
  return String(item.preparationId ?? item.preparation_id ?? "");
}

function memberIdsOf(box: Record<string, unknown>): string[] {
  const ids = box.member_ids ?? box.memberIds ?? [];
  const out = Array.isArray(ids) ? ids.map((x) => String(x)) : [];
  if (box.member_id) out.push(String(box.member_id));
  return [...new Set(out)];
}

function drawnByPrep(dishes: Record<string, unknown>[]): Map<string, {
  grams: number;
  byDay: Record<string, number>;
  byMouth: Record<string, number>;
}> {
  const out = new Map<string, {
    grams: number;
    byDay: Record<string, number>;
    byMouth: Record<string, number>;
  }>();
  const bump = (id: string) => {
    let row = out.get(id);
    if (!row) {
      row = { grams: 0, byDay: {}, byMouth: {} };
      out.set(id, row);
    }
    return row;
  };
  for (const dish of dishes) {
    const day = String(dish.day ?? "?");
    for (const box of (dish.boxes as Record<string, unknown>[] | undefined) ?? []) {
      const mouths = memberIdsOf(box);
      for (const item of (box.items as Record<string, unknown>[] | undefined) ?? []) {
        const id = pidOf(item);
        if (!id) continue;
        const g = Number(item.grams) || 0;
        const row = bump(id);
        row.grams += g;
        row.byDay[day] = (row.byDay[day] ?? 0) + g;
        if (mouths.length === 0) {
          row.byMouth["?"] = (row.byMouth["?"] ?? 0) + g;
        } else {
          for (const m of mouths) {
            row.byMouth[m] = (row.byMouth[m] ?? 0) + g / mouths.length;
          }
        }
      }
    }
  }
  return out;
}

function ingredientsOf(prep: Record<string, unknown>): Record<string, unknown>[] {
  return ((prep.ingredients as Record<string, unknown>[] | undefined) ?? []).map((ing) => ({
    ...ing,
  }));
}

Deno.stat(`${ROOT}scratchpad/2026-09-14-B4-FINAL`).catch(() => {});

const index = await indexDuReferentiel();

const cases = [
  {
    nom: "sna1",
    rel: "scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/perte-b4-sna1-final-2026-09-13T17-00-02-362Z.json",
    note: "rejeu banc --reponse sna1, code courant, 1 ligne écrite",
  },
  {
    nom: "n2-partage",
    rel: "scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/perte-b4-n2-final-2026-09-13T17-00-01-727Z.json",
    note: "rejeu banc lot2-ref2, N=2, 2 casseroles partagées, 1 ligne écrite",
  },
  {
    nom: "n4-ref4",
    rel: "scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/perte-b4-n4-final-2026-09-13T17-00-02-096Z.json",
    note: "rejeu banc lot2-ref4, N=4 toutes présentes — pas le cas away",
  },
  {
    nom: "historique-6146",
    rel: "scratchpad/2026-09-14-B4-FINAL/fixtures/parcours-6146-6181.json",
    note: "plan navigateur stocké 82e60169 ; le banc --reponse a été refusé (IDs étrangers + plafond 9 plats)",
  },
  {
    nom: "n4-away-tir9s1",
    rel: "scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/campagne-tir9-s1-2026-09-14T04-20-23-468Z.json",
    note: "plan publié N=4, Nils absent mardi ; mesuré hors handler sur la ligne écrite",
  },
] as const;

const rapport: Record<string, unknown>[] = [];

for (const cas of cases) {
  const src = loadJson(cas.rel);
  const meal = mealOf(src);
  const dishes = (meal.dishes as Record<string, unknown>[]) ?? [];
  const preps = ((meal.preparations as Record<string, unknown>[]) ?? []).map((p) => ({
    ...p,
    ingredients: ingredientsOf(p),
  }));
  const shopping = ((meal.shopping_list as Record<string, unknown>[]) ?? []).map((l) => ({
    ...l,
  }));
  const drawn = drawnByPrep(dishes);

  const perPot = [];
  let overdrawnBefore = 0;
  let overdrawnAfter = 0;
  let unreadableDrawn = 0;
  let readyAfter = 0;
  let drawnFinal = 0;
  let grown = 0;

  for (const prep of preps) {
    const id = String(prep.id ?? "");
    const draw = drawn.get(id)?.grams ?? 0;
    const measure = (ingredients: readonly Record<string, unknown>[]) =>
      measurePreparation(index, {
        id,
        method: (prep.method as string | null) ?? null,
        ingredients: [...ingredients],
        waterTreatment: null,
      }).readyG;
    const before = measure(prep.ingredients as Record<string, unknown>[]);
    if (before !== null && Number.isFinite(before) && draw > before) overdrawnBefore++;
    if (draw > 0 && (before === null || !Number.isFinite(before))) {
      /* counted after grow */
    }
    let after = before;
    let fit = {
      changed: 0,
      attempts: 0,
      factor: 1,
      shortfallG: null as number | null,
    };
    if (before !== null && Number.isFinite(before) && draw > before) {
      const fitted = growIngredientsToReadyMass(
        prep.ingredients as Record<string, unknown>[],
        draw,
        (items) => measure(items as Record<string, unknown>[]),
      );
      fit = {
        changed: fitted.changed,
        attempts: fitted.attempts,
        factor: fitted.factor,
        shortfallG: fitted.shortfallG,
      };
      if (fitted.changed > 0) {
        prep.ingredients = fitted.items as Record<string, unknown>[];
        grown++;
      }
      after = measure(prep.ingredients as Record<string, unknown>[]);
    }
    const rest = after === null || !Number.isFinite(after) ? null : after - draw;
    if (draw > 0 && rest === null) unreadableDrawn++;
    else if (rest !== null && rest < 0) overdrawnAfter++;
    if (after !== null && Number.isFinite(after)) readyAfter += Math.round(after);
    drawnFinal += Math.round(draw);

    const resolved = resolveIngredients(
      index,
      (prep.ingredients as Record<string, unknown>[]).map((ing) => ({
        term: String(ing.term ?? ""),
        quantity: ing.quantity == null ? null : String(ing.quantity),
        amount: typeof ing.amount === "number" ? ing.amount : null,
        unit: (ing.unit as "g" | "ml" | "unit" | null) ?? null,
        state: (ing.state as "raw" | "cooked" | null) ?? null,
        ref: ing.ref == null ? null : String(ing.ref),
      })),
    );
    const crus = (prep.ingredients as Record<string, unknown>[]).map((ing, i) => {
      const r = resolved.resolved[i];
      return {
        term: ing.term,
        ref: ing.ref ?? null,
        amount: ing.amount ?? null,
        unit: ing.unit ?? null,
        state: ing.state ?? null,
        quantity: ing.quantity ?? null,
        gramsRaw: r?.gramsRaw ?? null,
        yieldClass: r?.yieldClass ?? null,
      };
    });

    perPot.push({
      preparation_id: id,
      title: prep.title ?? null,
      cook_on: prep.cook_on ?? prep.cookOn ?? null,
      ready_before_g: before === null || !Number.isFinite(before) ? null : Math.round(before),
      drawn_g: Math.round(draw),
      ready_after_g: after === null || !Number.isFinite(after) ? null : Math.round(after),
      rest_g: rest === null ? null : Math.round(rest),
      equation_ok: rest !== null && Math.round(after ?? 0) === Math.round(draw) + Math.round(rest),
      grown: fit.changed > 0,
      fit,
      draws: drawn.get(id) ?? { grams: 0, byDay: {}, byMouth: {} },
      ingredients: crus,
    });
  }

  const needs = shoppingNeedsOf({
    index,
    dishes: dishes.map((d) => ({
      ingredients: (d.ingredients as never) ?? [],
      day: (d.day as string | null) ?? null,
    })),
    preparations: preps.map((p) => ({
      ingredients: (p.ingredients as never) ?? [],
      cookOn: (p.cook_on as string | null) ?? (p.cookOn as string | null) ?? null,
    })),
  });
  const rebuilt = rebuildShoppingQuantities({
    index,
    lines: shopping as never,
    needs: needs.needs,
    identityByTerm: needs.identityByTerm,
    removed: new Set<string>(),
    locale: "fr",
  });

  const blocked = await decidePotMassPublication({
    overdrawn: overdrawnAfter,
    unreadable: unreadableDrawn,
    worstShortfallG: Math.max(
      0,
      ...perPot.map((p) => p.rest_g !== null && p.rest_g < 0 ? -p.rest_g : 0),
    ),
    publish: async () => "would_write",
  });

  rapport.push({
    nom: cas.nom,
    note: cas.note,
    n_dishes: dishes.length,
    n_preps: preps.length,
    n_shop_avant: shopping.length,
    overdrawn_before: overdrawnBefore,
    overdrawn_after: overdrawnAfter,
    unreadable_drawn: unreadableDrawn,
    grown,
    ready_after: readyAfter,
    drawn_final: drawnFinal,
    reste: readyAfter - drawnFinal,
    equation_ok: readyAfter === drawnFinal + (readyAfter - drawnFinal),
    publication: blocked.kind,
    shopping_rebuild: rebuilt.counts,
    shopping_final: rebuilt.items.map((l) => ({
      ref: (l as { ref?: string }).ref ?? null,
      term: (l as { term?: string }).term ?? (l as { item?: string }).item ?? null,
      amount: (l as { amount?: number }).amount ?? null,
      unit: (l as { unit?: string }).unit ?? null,
      quantity: (l as { quantity?: string }).quantity ?? null,
    })),
    per_pot: perPot,
  });
}

const sortie = `${ROOT}scratchpad/2026-09-14-B4-FINAL/tables.json`;
Deno.writeTextFileSync(sortie, JSON.stringify(rapport, null, 2));
console.log(`écrit ${sortie}`);
for (const r of rapport) {
  console.log(
    `${r.nom} overdrawn_after=${r.overdrawn_after} unreadable=${r.unreadable_drawn} ` +
      `ready=${r.ready_after} drawn=${r.drawn_final} reste=${r.reste} pub=${r.publication} ` +
      `shop unattr=${(r.shopping_rebuild as { unattributed?: number }).unattributed} ` +
      `dropped=${(r.shopping_rebuild as { dropped?: number }).dropped}`,
  );
}
