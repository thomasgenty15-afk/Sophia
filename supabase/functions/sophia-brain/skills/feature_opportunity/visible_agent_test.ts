import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { productGuidancePromptLines } from "./visible_agent.ts";

Deno.test("coach_preferences guidance limits adjustability to the three supported axes", () => {
  const lines = productGuidancePromptLines();
  const joined = lines.join("\n");

  // The three real, adjustable axes are named as the only ones settable today.
  assert(
    joined.includes(
      "seuls ces trois axes (ton, niveau de challenge, tendance a poser des questions) sont reglables aujourd'hui dans Preferences coach",
    ),
  );
});

Deno.test("coach_preferences guidance is honest about not-yet-supported preferences (T11)", () => {
  const joined = productGuidancePromptLines().join("\n");

  // A preference outside the three axes (schedule/content/"remember this fact")
  // must not be presented as settable, and must not redirect to Preferences coach.
  assert(joined.includes("hors de ces trois axes"));
  assert(
    joined.includes("ne la presente pas comme reglable dans Preferences coach"),
  );
  assert(
    joined.includes(
      "Sophia ne sait pas encore prendre en compte ce type de preference",
    ),
  );
  assert(joined.includes("possible dans une version suivante"));
  // Cmd 7: never claim it is already done.
  assertEquals(
    joined.includes("sans le presenter comme deja fait ni le promettre"),
    true,
  );
});
