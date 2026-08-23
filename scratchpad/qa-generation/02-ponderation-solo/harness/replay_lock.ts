// ===========================================================================
// AGENT 2A — REJOUER LE VERROU DE SORTIE sur le texte réellement produit.
// ===========================================================================
// Le run S3 a rendu `422 empty_meal / blocked_medical_constraint` alors que
// AUCUN plat ne contient l'allergène. Ce script rejoue `parseGeneratedMeal`
// à l'identique — même reconstruction du texte visible, même moteur — pour
// nommer les octets exacts qui mordent.
//
//   deno run --allow-read --no-check .../replay_lock.ts <output.json>
// ===========================================================================
import { findMedicalConstraintViolations } from "../../../../supabase/functions/_shared/keel/safety_constraints.ts";
import type { StudentSafetyConstraint } from "../../../../supabase/functions/_shared/keel/safety_constraints.ts";

const file = Deno.args[0];
const dump = JSON.parse(await Deno.readTextFile(file));
const meal = JSON.parse(dump.result.output_text);

// Les contraintes MÉDICALES du scénario, telles que la fixture les écrit.
const constraints: StudentSafetyConstraint[] = [
  {
    id: "c-sesame",
    userId: "u",
    kind: "allergy",
    allergenRef: "sesame",
    substanceRef: null,
    medicationClass: null,
    conditionRef: null,
    dietRef: null,
    severity: "medical",
    declaredBy: "student",
    notes: null,
    contentLocale: "en-GB",
  },
];

// LE MÊME TEXTE QUE `parseGeneratedMeal` (meal_generation.ts, GARANTIE 4):
// titre + méthode + why + termes d'ingrédients, puis la liste de courses.
const rendered = [
  ...(meal.dishes ?? []).map((d: Record<string, unknown>) =>
    `${d.title}. ${d.method} ${d.why} ${
      ((d.ingredients ?? []) as { term: string }[]).map((i) => i.term).join(", ")
    }`
  ),
  ...((meal.shopping_list ?? []) as { term: string }[]).map((s) => s.term),
].join("\n");

const hits = findMedicalConstraintViolations(rendered, constraints);
console.log(`texte visible: ${rendered.length} car.`);
console.log(`morsures: ${hits.length}`);
for (const h of hits) {
  const start = Math.max(0, h.index - 70);
  console.log(
    `  · token=${h.token} matched="${h.matchedText}" @${h.index}\n    …${
      rendered.slice(start, h.index + 60).replace(/\n/g, " ")
    }…`,
  );
}
