/** Les kcal et grammes des ITEMS RÉELLEMENT ÉCRITS dans chaque boîte. Lecture seule. */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { loadCompositionIndex } from "../../supabase/functions/_shared/keel/food_composition_io.ts";
import { boxEnergies } from "../../supabase/functions/_shared/keel/mouth_energy.ts";
import { readEnergyBoxDishes, readPreparations } from "../../supabase/functions/_shared/keel/plan_energy_read.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const index = await loadCompositionIndex(db as never, { lang: "fr" });
for (const id of Deno.args) {
  const { data } = await db.from("student_generated_meals").select("dishes, preparations").eq("id", id).single();
  // deno-lint-ignore no-explicit-any
  const d = data as any;
  const boxes = boxEnergies({
    index,
    dishes: readEnergyBoxDishes(d.dishes),
    preparations: readPreparations(d.preparations),
  });
  console.log(`\n=== ${id}`);
  // deno-lint-ignore no-explicit-any
  for (const dish of d.dishes as any[]) {
    const b = boxes.find((x) => x.boxId === dish.boxes?.[0]?.id);
    const dens = b?.kcal && b?.grams ? (100 * b.kcal / b.grams).toFixed(1) : "—";
    console.log(
      `  ${dish.day}/${String(dish.slot).padEnd(10)} boîte ${String(b?.grams ?? "—").padStart(5)} g · ` +
        `${String(b?.kcal ? Math.round(b.kcal) : "—").padStart(5)} kcal · d=${String(dens).padStart(6)}` +
        (b?.gap ? `  gap=${b.gap}` : ""),
    );
  }
}
