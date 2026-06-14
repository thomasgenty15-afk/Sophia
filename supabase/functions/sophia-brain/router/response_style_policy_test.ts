import {
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "./response_style_policy.ts";

Deno.test("visible output style rules define shared conversation contract", () => {
  assertStringIncludes(
    VISIBLE_OUTPUT_STYLE_RULES,
    "VISIBLE_OUTPUT_STYLE_RULES",
  );
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "tutoiement");
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "Format conversationnel");
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "message court");
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "accorde les adjectifs");
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "contente");
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "une seule question");
  assertStringIncludes(VISIBLE_OUTPUT_STYLE_RULES, "internals");
});
