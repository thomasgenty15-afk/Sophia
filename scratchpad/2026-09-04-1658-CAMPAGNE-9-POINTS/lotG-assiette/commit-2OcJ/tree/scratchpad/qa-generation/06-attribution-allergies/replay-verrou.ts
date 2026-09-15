/**
 * REJOUE LA CEINTURE SUR LE TEXTE EXACT D'UN RUN, ET DIT OÙ ELLE MORD.
 *
 * La question du lot voisin, et c'est la bonne: la morsure est-elle sur un
 * ALIMENT réellement mis dans le plan, ou sur une PHRASE qui explique qu'on
 * l'a évité ? Les deux rendent le même 422, et ce ne sont pas les mêmes
 * défauts.
 *
 * Le champ `rendered` est reconstruit comme `parseGeneratedMeal` le compose:
 *   `${title}. ${method} ${why} ${ingredients.map(term).join(", ")}` par plat,
 *   puis les termes de la liste de courses.
 */
import { findMedicalConstraintViolations } from "../../../supabase/functions/_shared/keel/safety_constraints.ts";
import { householdAllergyConstraints } from "../../../supabase/functions/_shared/keel/household_safety.ts";

const cs = [
  ...householdAllergyConstraints([{ id: "a1", memberId: "ysoline", label: "pistachio" }], "en-GB"),
  {
    id: "sc1", userId: "bertille", kind: "allergy" as const, allergenRef: "celeriac",
    substanceRef: null, medicationClass: null, conditionRef: null, dietRef: null,
    severity: "medical" as const, declaredBy: "student" as const, notes: null, contentLocale: "en-GB",
  },
];

for (const dir of Deno.args) {
  let plan: any;
  try {
    const o = JSON.parse(await Deno.readTextFile(`${dir}/dump/output.json`));
    plan = o.result.output_text_json;
  } catch { console.log(`${dir}: pas de sortie modèle archivée`); continue; }
  if (!plan?.dishes) { console.log(`${dir}: sortie illisible`); continue; }
  const fields: { where: string; text: string }[] = [];
  for (const [i, d] of plan.dishes.entries()) {
    fields.push({ where: `dishes[${i}].title`, text: String(d.title ?? "") });
    fields.push({ where: `dishes[${i}].method`, text: String(d.method ?? "") });
    fields.push({ where: `dishes[${i}].why`, text: String(d.why ?? "") });
    for (const [j, ing] of (d.ingredients ?? []).entries()) {
      fields.push({ where: `dishes[${i}].ingredients[${j}].term`, text: String(ing.term ?? "") });
    }
  }
  for (const [i, s] of (plan.shopping_list ?? []).entries()) {
    fields.push({ where: `shopping_list[${i}].term`, text: String(s.term ?? "") });
  }
  const bites = fields
    .map((f) => ({ ...f, v: findMedicalConstraintViolations(f.text, cs) }))
    .filter((f) => f.v.length > 0);
  const kind = (w: string) =>
    w.includes(".why") ? "EXPLICATION" : (w.includes("ingredients") || w.startsWith("shopping")) ? "ALIMENT" : "TITRE/MÉTHODE";
  console.log(`\n=== ${dir.split("/").pop()} — ${bites.length} morsure(s) ===`);
  for (const b of bites) {
    console.log(`  [${kind(b.where)}] ${b.where}: ${b.v.map((x: any) => x.token).join(",")}  «${b.text.slice(0, 110)}»`);
  }
  if (bites.length === 0) console.log("  aucune morsure sur la sortie MODÈLE archivée");
}
