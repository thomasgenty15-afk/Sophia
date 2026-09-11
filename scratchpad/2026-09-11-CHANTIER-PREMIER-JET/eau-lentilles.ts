/**
 * LECTURE SEULE — l'eau d'une casserole de lentilles, mesurée par le code neuf.
 *
 * Question: le lot D pensait que GAIN se fermerait parce que `preparation_mass.ts`
 * traiterait l'eau des lentilles comme ABSORBÉE. Le lot B a décidé l'inverse
 * (`legume_absorbs` n'est pas `grain_absorbs`, l'eau reste). Qui a raison, et
 * combien ça pèse ?
 *
 * Aucune écriture, aucun appel modèle.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { loadCompositionIndex } from "../../supabase/functions/_shared/keel/food_composition_io.ts";
import { resolveIngredients } from "../../supabase/functions/_shared/keel/food_composition.ts";
import { measurePreparation } from "../../supabase/functions/_shared/keel/preparation_mass.ts";

const URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(URL, KEY, { auth: { persistSession: false } });

const index = await loadCompositionIndex(db as never);

const { data, error } = await db
  .from("student_generated_meals")
  .select("id, preparations")
  .in("id", [
    "5fad22ce-d181-4a0c-b0b5-77caf65092b5",
    "a18f522e-41f9-469e-9c50-1d693d892ce6",
  ]);
if (error) throw error;

for (const row of data ?? []) {
  console.log(`\n=== plan ${row.id}`);
  for (const p of (row.preparations ?? []) as Record<string, unknown>[]) {
    const ings = (p.ingredients ?? []) as Record<string, unknown>[];
    const m = measurePreparation(index, {
      id: String(p.id),
      method: String(p.method ?? ""),
      ingredients: ings as never,
    });
    const r = resolveIngredients(index, ings as never);
    const classes = r.resolved.map(({ ref }) => `${ref.slug}:${ref.yieldClass}`);
    const eau = ings
      .filter((i) => /^(eau|water)\b/i.test(String(i.term ?? "")))
      .reduce((s, i) => s + Number(i.grams_raw ?? 0), 0);
    console.log(
      `  ${String(p.id).padEnd(28)} eau=${eau.toFixed(0).padStart(4)} g  ` +
        `water=${m.water.padEnd(12)} readyG=${m.readyG === null ? "null" : m.readyG.toFixed(0)} ` +
        `kcal=${m.kcal === null ? "null" : m.kcal.toFixed(0)} ` +
        `d=${m.readyG && m.kcal ? ((m.kcal / m.readyG) * 100).toFixed(1) : "—"}`,
    );
    if (eau > 0) console.log(`      classes: ${classes.join(" · ")}`);
  }
}
