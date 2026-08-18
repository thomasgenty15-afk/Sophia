import { FORBIDDEN_PORTION_TERMS } from "../supabase/functions/_shared/keel/household_portions.ts";
import { findForbiddenMatches } from "../supabase/functions/_shared/keel/forbidden_matcher.ts";
const cases = [
  "recomp is the plan for her",
  "body recomposition",
  "a performance oriented plate",
  "Il fait attention a sa sante",
  "health conscious portions",
  "a smaller starch share for fat loss",
  "extra rice for muscle gain",
  "maintenance of weight",
  "grilled chicken with rice and broccoli",
];
for (const c of cases) {
  const m = findForbiddenMatches(c, FORBIDDEN_PORTION_TERMS, { allowNegatedMentions: false });
  console.log(`${(m.length ? "MORD  " : "passe ")} ${JSON.stringify(c)} -> ${JSON.stringify(m.map((x: any) => x.token ?? x))}`);
}
