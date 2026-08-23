// ===========================================================================
// AGENT 2A — LIRE UNE SORTIE, ET SEULEMENT CE QU'ELLE DIT.
// ===========================================================================
//   deno run --allow-read --no-check analyse.ts <output.json> <scenario 1..5>
//
// ⚠️ AUCUN MATCHER MAISON SUR UN TITRE. On compte des OCCURRENCES de chaînes
// exactes, avec leur contexte, et c'est un humain qui lit. Le seul verdict
// automatique de ce fichier est celui du VRAI verrou de sortie, rejoué par sa
// propre fonction (`findMedicalConstraintViolations`) sur le texte que
// `parseGeneratedMeal` construit.
// ===========================================================================
import { findMedicalConstraintViolations } from "../../../../supabase/functions/_shared/keel/safety_constraints.ts";

// Ce que chaque scénario a déclaré, et à quelle sévérité.
const MEDICAL: Record<string, string[]> = {
  "1": ["sesame"],
  "2": [],
  "3": ["sesame"],
  "4": [],
  "5": ["peanut", "shellfish", "warfarin"],
};
const WATCH: Record<string, string[]> = {
  "1": ["sesame", "lactose", "beetroot", "aubergine", "meat", "chicken", "beef", "pork", "lamb", "harissa", "crust"],
  "2": [],
  "3": ["sesame", "tahini", "chicken", "beetroot", "cold salad", "warm"],
  "4": ["lamb", "saffron", "risotto", "oven", "roast", "bake"],
  "5": ["peanut", "shellfish", "mustard", "gluten", "fructose", "coriander", "olive", "aubergine", "warfarin", "honey", "milk", "cheese", "egg", "butter"],
};

const dump = JSON.parse(await Deno.readTextFile(Deno.args[0]));
const scenario = Deno.args[1];
const meal = JSON.parse(dump.result.output_text);

const rendered = [
  // deno-lint-ignore no-explicit-any
  ...(meal.dishes ?? []).map((d: any) =>
    `${d.title}. ${d.method} ${d.why} ${
      // deno-lint-ignore no-explicit-any
      (d.ingredients ?? []).map((i: any) => i.term).join(", ")
    }`
  ),
  // deno-lint-ignore no-explicit-any
  ...((meal.shopping_list ?? []) as any[]).map((s) => s.term),
].join("\n");

const constraints = (MEDICAL[scenario] ?? []).map((t, i) => ({
  id: `c${i}`,
  userId: "u",
  kind: "allergy",
  allergenRef: t,
  substanceRef: null,
  medicationClass: null,
  conditionRef: null,
  dietRef: null,
  severity: "medical",
  declaredBy: "student",
  notes: null,
  contentLocale: "en-GB",
})) as never;

const hits = constraints.length > 0
  ? findMedicalConstraintViolations(rendered, constraints)
  : [];

console.log(`plats=${(meal.dishes ?? []).length}  prep=${(meal.preparations ?? []).length}  sessions=${(meal.cooking_sessions ?? []).length}`);
// deno-lint-ignore no-explicit-any
for (const cs of (meal.cooking_sessions ?? []) as any[]) {
  console.log(`  session ${cs.day}: ${cs.total_minutes} min, ${(cs.preparation_ids ?? []).length} prep`);
}
console.log(`VERROU MÉDICAL rejoué: ${hits.length} morsure(s)`);
// deno-lint-ignore no-explicit-any
for (const h of hits as any[]) {
  console.log(
    `  · ${h.token} "${h.matchedText}" …${
      rendered.slice(Math.max(0, h.index - 80), h.index + 60).replace(/\n/g, " ")
    }…`,
  );
}
const text = JSON.stringify(meal);
for (const w of WATCH[scenario] ?? []) {
  const n = (text.match(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) ?? []).length;
  if (n > 0) console.log(`  occ ${w} = ${n}`);
}
