/** Lecture seule : pourquoi une assiette est-elle immesurable ? */
import { createClient } from "jsr:@supabase/supabase-js@2";
import { loadCompositionIndex } from "../../supabase/functions/_shared/keel/food_composition_io.ts";
// ⛔ LE MÊME INDEX QUE `meal-energy-v1` : le sas de réparation écrit dans une
// table à part, et `indexForReading` est ce qui la replie. Sans lui, un rejeu
// hors ligne sous-résout et invente des trous que le run n'avait pas.
import { indexForReading } from "../../supabase/functions/_shared/keel/composition_fill_io.ts";
import { resolveIngredients } from "../../supabase/functions/_shared/keel/food_composition.ts";
import { measurePlate } from "../../supabase/functions/_shared/keel/preparation_mass.ts";
import { drawsByPreparation } from "../../supabase/functions/_shared/keel/portion_sizing.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const base = await loadCompositionIndex(db as never, { lang: "fr" });
const index = await indexForReading(db as never, base);
const planId = Deno.args[0];
const { data } = await db.from("student_generated_meals")
  .select("dishes, preparations").eq("id", planId).single();
// deno-lint-ignore no-explicit-any
const dishes = (data as any).dishes as Record<string, unknown>[];
// deno-lint-ignore no-explicit-any
const preps = (data as any).preparations as Record<string, unknown>[];
const draws = drawsByPreparation(dishes as never);

for (const d of dishes) {
  const uses = (d.uses ?? []) as Record<string, unknown>[];
  const m = measurePlate({
    index,
    dish: d as never,
    uses: uses.map((u) => ({ preparationId: String(u.preparation_id ?? u.preparationId ?? "") })) as never,
    preparations: preps as never,
    drawsByPrep: draws,
  });
  const flag = m.kcal === null ? "⛔" : "  ";
  console.log(`${flag} ${d.day}/${d.slot}  kcal=${m.kcal}  g=${m.cookedG}  gaps=${JSON.stringify(m.gaps)}`);
  if (m.kcal !== null) continue;
  const lignes = [
    ...((d.ingredients ?? []) as Record<string, unknown>[]).map((i) => ({ ...i, _ou: "frais" })),
    ...uses.flatMap((u) => {
      const id = String(u.preparation_id ?? u.preparationId ?? "");
      const p = preps.find((x) => String(x.id) === id);
      return ((p?.ingredients ?? []) as Record<string, unknown>[]).map((i) => ({ ...i, _ou: id }));
    }),
  ];
  const r = resolveIngredients(index, lignes as never);
  console.log(`     unresolvedTerms = ${JSON.stringify(r.unresolvedTerms)}`);
  console.log(`     unweighedTerms  = ${JSON.stringify(r.unweighedTerms)}`);
  console.log(`     conventional    = ${JSON.stringify(r.conventionalTerms)}`);
  console.log(`     resolus         = ${r.resolved.length} / ${lignes.length} lignes`);
}
