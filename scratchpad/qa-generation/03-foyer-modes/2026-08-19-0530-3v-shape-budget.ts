// 3V — la matrice du plafond de forme et le budget de plats, par le CODE D'AUJOURD'HUI.
import { capCookingShape, COOKING_SHAPES, mergeDishBonus } from "../../../supabase/functions/_shared/keel/household_portions.ts";
import { dishBudgetFor } from "../../../supabase/functions/_shared/keel/meal_generation.ts";

console.log("== capCookingShape(computed, asked) — le calcul en composition ne rend QUE one_dish|one_session");
for (const computed of ["one_dish", "one_session"] as const) {
  for (const asked of COOKING_SHAPES) {
    const r = capCookingShape(computed, asked);
    console.log(`  computed=${computed.padEnd(17)} asked=${asked.padEnd(17)} -> served=${r.shape.padEnd(17)} capped=${String(r.capped).padEnd(5)} unused=${r.unused}`);
  }
}
console.log("\n== separate_sessions n'est SERVI que s'il est CALCULÉ (fusion) ==");
for (const asked of COOKING_SHAPES) {
  const r = capCookingShape("separate_sessions", asked);
  console.log(`  computed=separate_sessions asked=${asked.padEnd(17)} -> served=${r.shape}`);
}

console.log("\n== le budget de plats, N divergents, fenêtre de D jours (2 repas/jour) ==");
const rhythm = [{ slot: "lunch" }, { slot: "dinner" }] as never;
for (const days of [1, 7]) {
  const base = dishBudgetFor({ scope: days === 1 ? "day" : "several_days", rhythm, daysToFill: days, merge: null });
  for (const n of [1, 2, 3]) {
    const asked = n * base;
    const budget = dishBudgetFor({
      scope: days === 1 ? "day" : "several_days",
      rhythm,
      daysToFill: days,
      merge: { shape: "one_session", ownDishesShown: 0, dedicatedDishesAsked: asked, dishBearerIds: [] } as never,
    });
    console.log(`  jours=${days} baseCap=${base} divergents=${n} demandé=${base + asked} budget=${budget} bonus=${mergeDishBonus({ cooking: "one_session", ownDishesShown: 0, dedicatedDishesAsked: asked, baseCap: base })} -> manquants=${base + asked - budget}`);
  }
}
