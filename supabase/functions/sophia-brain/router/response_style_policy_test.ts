import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  VISIBLE_OUTPUT_STYLE_RULES,
  visibleOutputStyleIssues,
} from "./response_style_policy.ts";

Deno.test("visible output style rules define shared conversation contract", () => {
  assertStringIncludes(
    VISIBLE_OUTPUT_STYLE_RULES,
    "VISIBLE_OUTPUT_STYLE_RULES",
  );
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "tutoiement");
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "Format WhatsApp");
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "message court");
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "une seule question");
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "internals");
});

Deno.test("visible output style guard rejects direct vouvoiement", () => {
  assertEquals(
    visibleOutputStyleIssues("Préférez-vous cette option ?"),
    [
      "forbidden_vouvoiement:vous",
      "forbidden_vouvoiement:preferez-vous",
    ],
  );
  const souhaitIssues = visibleOutputStyleIssues(
    "Souhaitez-vous continuer avec votre carte ?",
  );
  assert(souhaitIssues.includes("forbidden_vouvoiement:votre"));
  assert(souhaitIssues.includes("forbidden_vouvoiement:souhaitez-vous"));
  assertEquals(
    visibleOutputStyleIssues("Tu veux continuer avec ta carte ?"),
    [],
  );
});
