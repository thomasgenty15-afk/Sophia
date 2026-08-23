// Choix des PORTEUSES pour les balayages (lot S1d) — mesuré, pas supposé.
import { detectDeclaredMeal } from "../supabase/functions/_shared/keel/meal_declaration_floor.ts";
import { detectDeclaredBodyMeasure } from "../supabase/functions/_shared/keel/body_measure_floor.ts";

const show = (h: { components?: Array<{ food_group_ref: string }> } | null) =>
  h ? JSON.stringify(h.components?.map((c) => c.food_group_ref)) : "null";

console.log("— porteuses candidates, plancher de REPAS —");
for (
  const p of [
    "j'ai mangé du boeuf hier soir",
    "j'ai mangé un oeuf ce matin",
    "j'ai mangé des oeufs ce matin",
    "j'ai mangé des oeufs brouilles ce matin",
    "j'ai mangé un moelleux au chocolat hier soir",
    "i ate tomatoes for lunch",
    "i ate potatoes for lunch",
    "j'ai mangé hier soir",
  ]
) {
  console.log(`  ${JSON.stringify(p)} => ${show(detectDeclaredMeal(p))}`);
}

console.log("\n— porteuses candidates, plancher de CORPS —");
for (
  const p of [
    "je fais 78 kg comme ma soeur",
    "je fais 78 kg",
    "je pese 78 kg comme ma soeur",
    "je pese 78 kg",
  ]
) {
  const h = detectDeclaredBodyMeasure(p, "metric");
  console.log(`  ${JSON.stringify(p)} => ${h ? `${h.kind} ${h.valueSi}` : "null"}`);
}
