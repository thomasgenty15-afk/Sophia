/**
 * PARITÉ CONSIGNE ↔ CEINTURE, sondée sur les phrases RÉELLES des runs.
 * La consigne doit interdire EXACTEMENT ce que la ceinture rejette.
 */
import { findMedicalConstraintViolations } from "../../../supabase/functions/_shared/keel/safety_constraints.ts";
import { householdAllergyConstraints } from "../../../supabase/functions/_shared/keel/household_safety.ts";
const cs = householdAllergyConstraints([{ id: "a1", memberId: "m", label: "pistachio" }], "en-GB");
const cases: [string, string][] = [
  ["run a2000002 · why", "I have swapped the requested nut butter for sunflower seed butter to keep the entire household safe."],
  ["run b2000001 · why", "I have swapped the requested pistachio butter for sunflower seed butter to protect against the medical allergy constraint."],
  ["run b2000002 · why", "I have substituted sunflower seed butter for the requested pistachio butter because pistachio is a medical allergy for this household."],
  ["run a2000002 · why", "A warm, zesty start that avoids tree nuts while providing steady energy for the day."],
  ["run a2000002 · name", "Zesty Nut-Free Oats"],
  ["run a2000002 · method", "Stir in the lemon zest and top with the seeds, ensuring no cross-contamination with nuts."],
  ["ÉCHAPPATOIRE LICENCIÉE", "I traded off one of the foods on this household's medical list and put sunflower seed butter there instead."],
  ["échappatoire du lot voisin", "I could not honour one of the foods on your medical list, so I used sunflower seed butter."],
];
for (const [label, text] of cases) {
  const v = findMedicalConstraintViolations(text, cs);
  console.log((v.length ? "MORD  " : "passe ") + label.padEnd(28) + " " + JSON.stringify(text.slice(0, 70)));
}
