/**
 * FF-039 — VÉRIFICATION DE BOUT EN BOUT DU CHEMIN QUI TOUCHE LA BASE.
 *
 * Ce que les tests unitaires ne prouvent PAS: que `loadCompositionIndex` lise
 * vraiment les colonnes qu'elle nomme, que les grants laissent passer le
 * service-role, que le jsonb du verdict entre sans broncher, et que la table
 * refuse bien `anon` et `authenticated`. Autant de choses qui ne cassent qu'au
 * contact d'un vrai Postgres.
 *
 * Elle ÉCRIT UNE LIGNE et la RETIRE ensuite, par son id.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... deno run -A verdict_smoke.ts
 */

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { loadCompositionIndex } from "/Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/food_composition_io.ts";
import { isFriedMethod, resolveIngredients } from "/Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/food_composition.ts";
import { envelopeFor, envelopeFingerprint } from "/Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/meal_envelope.ts";
import { verdictFor } from "/Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/meal_verdict.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

console.log("1. chargement du référentiel depuis la vraie base…");
// deno-lint-ignore no-explicit-any
const index = await loadCompositionIndex(admin as any);
console.log(`   ${index.bySlug.size} aliments, ${index.byAlias.size} alias`);
if (index.bySlug.size < 100) throw new Error("référentiel trop petit — les grants ou le select");

console.log("2. un repas réel de la base…");
const { data: meals, error } = await admin
  .from("student_generated_meals")
  .select("id, user_id, dishes, duration_days")
  .limit(1);
if (error) throw new Error(error.message);
const meal = meals?.[0];
if (!meal) throw new Error("aucun repas en base");
const dishes = (meal.dishes as Array<Record<string, unknown>>).map((d) => ({
  slot: (d.slot as string) ?? null,
  method: String(d.method ?? ""),
  ingredients: ((d.ingredients ?? []) as Array<Record<string, unknown>>).map((i) => ({
    term: String(i.term ?? ""),
    amount: null,
    unit: null,
    state: null,
  })),
}));
console.log(`   repas ${meal.id}, ${dishes.length} plats`);

console.log("3. enveloppes — l'indiscernabilité, sur la vraie chaîne…");
const flagged = envelopeFor("fat_loss", null, null, true);
const unknownBody = envelopeFor("muscle_gain", null, null, false);
const a = envelopeFingerprint(flagged);
const b = envelopeFingerprint(unknownBody);
console.log(`   flaggé      ${a}`);
console.log(`   corps nul   ${b}`);
if (a !== b) throw new Error("INDISCERNABILITÉ ROMPUE");

console.log("4. verdict…");
const verdict = verdictFor({
  dishes,
  envelope: flagged,
  index,
  daysCovered: Number(meal.duration_days ?? 1),
  friedMethod: isFriedMethod,
});
const resolution = resolveIngredients(index, dishes.flatMap((d) => d.ingredients));
console.log(`   ${JSON.stringify(verdict)}`);
console.log(`   couverture ${(resolution.coverage * 100).toFixed(1)} %`);

console.log("5. écriture…");
const { data: written, error: writeErr } = await admin
  .from("meal_composition_verdicts")
  .insert({
    user_id: meal.user_id,
    meal_id: meal.id,
    verdict,
    envelope_mode: flagged.mode,
    resolution_coverage: resolution.coverage,
    unresolved_terms: resolution.unresolvedTerms,
    prompt_version: "smoke",
    doctrine_version: null,
  })
  .select("id")
  .single();
if (writeErr) throw new Error(writeErr.message);
console.log(`   ligne ${written.id} écrite`);

console.log("6. retrait de la ligne de test…");
const { error: delErr } = await admin
  .from("meal_composition_verdicts")
  .delete()
  .eq("id", written.id);
if (delErr) throw new Error(delErr.message);
const { count } = await admin
  .from("meal_composition_verdicts")
  .select("id", { count: "exact", head: true });
console.log(`   retirée. lignes restantes: ${count}`);
console.log("\nOK — la chaîne base↔code tient de bout en bout.");
